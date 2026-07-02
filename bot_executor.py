"""
Bot strategy execution engine.
Called by APScheduler every 30 s; respects per-user poll_interval_sec.
Only fires during US market hours (Mon-Fri 09:25-16:05 ET).
"""
import hashlib
import json
import logging
import os
import threading
import urllib.parse
import requests
from datetime import datetime, time as dtime, timedelta

logger = logging.getLogger(__name__)

# ── Tag → option-symbols persistent store ───────────────────────────────────
#
# Tradier does NOT reliably return the `tag` field on GET /orders responses,
# especially for multileg (combo) orders in the sandbox.  We therefore keep
# our own local record: when the bot successfully places an order that carries
# a user-defined step tag, we record which option symbols were in that order.
#
# The store is a JSON file so it survives server restarts.
# Schema: { "<account_id>:<tag>" : ["SPYW260531P00520000", ...] }

_TAG_STORE_PATH = os.path.join(os.path.dirname(__file__), 'bot_tag_map.json')
_tag_store_lock = threading.Lock()

# Persistent "which side of the line are we on" state for cross detection.
# Lets a cross fire ONCE per crossing instead of every poll while the live
# value stays past the comparator.  Keyed by strategy + condition signature.
_CROSS_STATE_PATH = os.path.join(os.path.dirname(__file__), 'bot_cross_state.json')
_cross_state_lock = threading.Lock()


def _load_cross_state():
    try:
        with open(_CROSS_STATE_PATH, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, ValueError, OSError):
        return {}


def _save_cross_state(store):
    try:
        with open(_CROSS_STATE_PATH, 'w') as f:
            json.dump(store, f)
    except OSError as e:
        logger.warning(f"bot_cross_state: could not persist: {e}")


def _cross_state_key(strategy_id, symbol, cfg):
    """Stable per-strategy/per-condition key for the cross side latch.
    Excludes the operator so crosses_above and crosses_below on the same
    series share one 'side' truth."""
    sig_src = {k: v for k, v in (cfg or {}).items() if k != 'operator'}
    sig = hashlib.md5(
        json.dumps(sig_src, sort_keys=True, default=str).encode()
    ).hexdigest()[:12]
    return f"{strategy_id}|{str(symbol).upper()}|{sig}"


def _cross_check_and_flip(key, cur_side, desired, opposite, session=None):
    """Atomically read the stored side, decide whether a flip INTO *desired*
    just happened, persist the new side, and return (fired, prev_side).

    The read-decide-write happens inside ONE lock so two concurrent
    evaluations (APScheduler runs strategies on a thread pool) can never both
    observe the same 'opposite' side and both fire on a single crossing.
    A never-seen key (prev_side is None) records the side WITHOUT firing.

    *session* (intraday only) marks the trading day the latch belongs to.
    When the stored latch is from a PRIOR session, we re-arm — record the
    current side WITHOUT firing — so a side latched yesterday can't fire a
    phantom cross across the overnight gap (e.g. price gaps/opens on the far
    side of the MA). Pass session=None for daily-interval crosses, where
    consecutive bars are legitimately compared across days.

    A cur_side of None means the side could not be determined: HOLD the latch —
    never fire, never overwrite the stored side — and return the side currently
    held."""
    with _cross_state_lock:
        store = _load_cross_state()
        entry = store.get(key)
        prev_side = entry.get('side') if isinstance(entry, dict) else None
        if prev_side not in ('above', 'below'):
            prev_side = None
        # Undetermined side: hold the latch (no flip, no fire, no write).
        if cur_side not in ('above', 'below'):
            return False, prev_side
        # Session rollover → treat like a first observation (re-arm, no fire).
        if session is not None:
            prev_session = entry.get('session') if isinstance(entry, dict) else None
            if prev_session != session:
                prev_side = None
        fired = (prev_side == opposite) and (cur_side == desired)
        new_entry = {'side': cur_side, 'ts': datetime.now().timestamp()}
        if session is not None:
            new_entry['session'] = session
        store[key] = new_entry
        _save_cross_state(store)
    return fired, prev_side


def _load_tag_store():
    try:
        with open(_TAG_STORE_PATH, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save_tag_store(store):
    try:
        with open(_TAG_STORE_PATH, 'w') as f:
            json.dump(store, f)
    except Exception as e:
        logger.warning(f"bot_tag_store: could not save: {e}")


# A freshly-placed order that has NOT yet been seen open in /positions is kept
# in the active count until this age elapses, after which we assume it was
# canceled/rejected and never filled.  Protects the position cap against fills
# that take a long time to reflect (Tradier sandbox can lag many minutes)
# while still letting truly-dead orders fall off.
_TAG_NEVERSEEN_MAX_AGE = 6 * 3600  # seconds


def _bucket_syms(bucket):
    """Option symbols for a stored order bucket (handles legacy list + dict)."""
    if isinstance(bucket, dict):
        return [str(s).upper() for s in bucket.get('syms', []) if s]
    if isinstance(bucket, list):
        return [str(s).upper() for s in bucket if s]
    return []


def _bucket_ts(bucket):
    """Placement epoch for a stored order bucket (0.0 if unknown/legacy)."""
    if isinstance(bucket, dict):
        try:
            return float(bucket.get('ts') or 0)
        except (TypeError, ValueError):
            return 0.0
    return 0.0


def _tracked_tag_order_ids(account_id, tag):
    """Order ids the store already tracks for *tag* (so callers can avoid
    double-counting the same order from another source, e.g. broker orders)."""
    key = f"{account_id}:{tag}"
    with _tag_store_lock:
        store = _load_tag_store()
    entry = store.get(key, {})
    if isinstance(entry, dict):
        return {str(k) for k in entry.keys()}
    return set()


def _register_tag_symbols(account_id, tag, option_symbols, order_id=None):
    """Record that *option_symbols* were opened under user tag *tag*.

    Store is keyed by order_id so we can later count TRADES (not legs).
    Schema:  { "<account_id>:<tag>" :
                 { "<order_id>": {"syms": ["SYM1","SYM2"], "ts": <epoch>,
                                   "seen": <bool>} } }
    The "ts"/"seen" fields let the position-count condition keep a just-placed
    order in the count before the broker reflects the fill in /positions, then
    drop it once it has been observed open and later closed.
    """
    if not tag or not option_symbols:
        return
    key   = f"{account_id}:{tag}"
    oid   = str(order_id) if order_id else '_noId'
    syms  = [str(s).upper() for s in option_symbols if s]
    now   = datetime.now().timestamp()
    with _tag_store_lock:
        store = _load_tag_store()
        entry = store.get(key, {})
        # Migrate old flat-list format → dict
        if isinstance(entry, list):
            entry = {'_legacy': entry}
        prev   = entry.get(oid)
        merged = list(_bucket_syms(prev))
        for s in syms:
            if s not in merged:
                merged.append(s)
        prev_ts   = _bucket_ts(prev) or now
        prev_seen = bool(prev.get('seen')) if isinstance(prev, dict) else False
        entry[oid] = {'syms': merged, 'ts': prev_ts, 'seen': prev_seen}
        store[key]  = entry
        _save_tag_store(store)
    logger.info(f"bot_tag_store: tag '{tag}' order {oid} → {syms}")


def _lookup_tag_symbols(account_id, tag):
    """Return the flat set of ALL option symbols ever opened under *tag*."""
    key = f"{account_id}:{tag}"
    with _tag_store_lock:
        store = _load_tag_store()
    entry = store.get(key, {})
    if isinstance(entry, list):
        return set(s.upper() for s in entry if s)
    result = set()
    for bucket in entry.values():
        result.update(_bucket_syms(bucket))
    return result


# Broker order statuses that mean the order will NEVER become a position.
# Such orders must not count toward the position/trade cap and should be
# dropped from the local store as soon as the broker reports them.
_DEAD_ORDER_STATUSES = {
    'rejected', 'canceled', 'cancelled', 'expired', 'error', 'declined',
}


def _count_active_tag_trades(account_id, tag, live_pos_syms,
                             order_status_by_id=None):
    """Count distinct OPEN trades (orders) under *tag*.

    This backs the condition step "position_count with tag X": 1 trade = 1,
    regardless of how many legs it has.

    Crucially it does NOT simply require the order's symbols to already be in
    *live_pos_syms*.  Fills can take seconds (live) to many minutes (sandbox)
    to appear in the broker's /positions feed; if we waited for that, the cap
    would read 0 right after placing and let the strategy fire again and again
    before the first fill ever showed up.  Instead each placed order is counted
    until we have POSITIVELY seen it open in /positions and then seen it gone:

      • broker reports it rejected/canceled/etc  → drop  (never filled)
      • symbols currently in positions          → open  (mark "seen")
      • never seen open yet, still young         → open  (awaiting reflection)
      • never seen open, older than max age      → drop  (canceled/rejected)
      • was seen open before, now absent         → closed → not counted

    *order_status_by_id* (optional) maps broker order_id → status.  When an
    order we are tracking is reported by the broker in a terminal-failure
    status (rejected, canceled, expired, …) we drop it immediately instead of
    keeping it counted for the full grace period — a rejected order will never
    fill, so it must not count toward the cap or block new trades.

    Legacy list buckets (pre-dating this tracking) keep the old behaviour:
    counted only when their symbols are currently live.
    """
    key = f"{account_id}:{tag}"
    now = datetime.now().timestamp()
    status_by_id = order_status_by_id or {}
    # Only real (non-empty) broker order ids count as "the broker returned a
    # usable order list". Guards the absence-drop below against a status map
    # that is technically non-empty but carries only malformed/empty ids.
    known_ids = {oid for oid in status_by_id if oid}
    changed = False
    with _tag_store_lock:
        store = _load_tag_store()
        entry = store.get(key, {})
        if isinstance(entry, list):
            # Old flat-list format — one trade if any symbol is live.
            return int(bool(set(s.upper() for s in entry if s) & live_pos_syms))
        active = 0
        drop = []
        for oid, bucket in entry.items():
            syms     = set(_bucket_syms(bucket))
            live_hit = bool(syms & live_pos_syms)
            # If the broker explicitly reports this order as rejected/canceled/
            # expired/etc it will never become a position — drop it now and do
            # not count it, regardless of age or whether it was ever "seen".
            # Guard with live_hit so a partial-fill-then-cancel that still has a
            # real open position is not wrongly dropped.
            if not live_hit:
                status = str(status_by_id.get(str(oid), '') or '').lower()
                if status in _DEAD_ORDER_STATUSES:
                    drop.append(oid)
                    changed = True
                    continue
                # Absent from a POPULATED broker order list AND never seen open
                # in /positions → the order has left the working set for good.
                # A freshly-placed order always appears in Tradier's /orders
                # immediately (open/pending/filled/rejected), so absence here is
                # NOT fill latency — it is a rejected/canceled order that has
                # scrolled out of the recent-orders window (or whose terminal
                # status is simply no longer reported). Drop it so a rejected
                # order can't keep the position cap occupied for the 6h grace.
                if (known_ids and str(oid) not in known_ids
                        and isinstance(bucket, dict) and not bucket.get('seen')):
                    drop.append(oid)
                    changed = True
                    logger.info(
                        f"_count_active_tag_trades tag='{tag}': dropping unseen "
                        f"order {oid} — absent from broker order list "
                        f"({len(known_ids)} known ids), never opened → terminal"
                    )
                    continue
            if not isinstance(bucket, dict):
                # Legacy per-order list bucket: positions-only behaviour.
                if live_hit:
                    active += 1
                continue
            seen = bool(bucket.get('seen'))
            ts   = _bucket_ts(bucket)
            if live_hit:
                active += 1
                if not seen:
                    bucket['seen'] = True
                    changed = True
            elif not seen:
                if ts and (now - ts) > _TAG_NEVERSEEN_MAX_AGE:
                    drop.append(oid)
                    changed = True
                else:
                    active += 1
            # else: seen open before and now absent → closed → not counted
        for oid in drop:
            entry.pop(oid, None)
        if changed:
            store[key] = entry
            _save_tag_store(store)
    return active

TRADIER_LIVE_BASE  = 'https://api.tradier.com/v1'
TRADIER_PAPER_BASE = 'https://sandbox.tradier.com/v1'


# ── Low-level Tradier call (no Flask context needed) ────────────────────────

def _encode_form(d):
    """URL-encode form data preserving literal [] bracket notation for Tradier multileg orders."""
    parts = []
    for k, v in d.items():
        parts.append(urllib.parse.quote(str(k), safe='[]') + '=' + urllib.parse.quote(str(v), safe=''))
    return '&'.join(parts)


def _tradier(api_key, base_url, path, method='GET', params=None, data=None,
             _return_error=False):
    """Thin Tradier REST wrapper with retry logic for transient errors.

    When *_return_error* is True the function returns ``(result, error_text)``
    so callers can inspect the raw error body on failure.  In normal mode it
    returns only *result* (``None`` on error) for backward-compatibility.

    Retries up to 3 times on 502/503/504 or connection/timeout errors with
    exponential back-off (1 s, 2 s) before giving up.
    """
    import time as _time
    url     = f"{base_url}{path}"
    headers = {'Authorization': f'Bearer {api_key}', 'Accept': 'application/json'}
    _TRANSIENT = {502, 503, 504}
    max_tries = 3

    for attempt in range(1, max_tries + 1):
        try:
            if method == 'GET':
                r = requests.get(url, headers=headers, params=params or {}, timeout=15)
            elif method == 'POST':
                body = _encode_form(data) if isinstance(data, dict) else ''
                post_headers = dict(headers)
                post_headers['Content-Type'] = 'application/x-www-form-urlencoded'
                r = requests.post(url, headers=post_headers, data=body, timeout=15)
            elif method == 'DELETE':
                r = requests.delete(url, headers=headers, timeout=15)
            else:
                return (None, 'unknown method') if _return_error else None

            if r.status_code in _TRANSIENT and attempt < max_tries:
                logger.warning(
                    f"Tradier {method} {path}: HTTP {r.status_code} "
                    f"(attempt {attempt}/{max_tries}) — retrying in {attempt}s"
                )
                _time.sleep(attempt)
                continue

            if not r.ok:
                logger.error(f"Tradier {method} {path}: HTTP {r.status_code} — {r.text[:600]}")
                return (None, r.text) if _return_error else None

            # Guard against non-JSON bodies (e.g. HTML maintenance page)
            try:
                result = r.json()
            except ValueError:
                logger.error(
                    f"Tradier {method} {path}: non-JSON body "
                    f"(HTTP {r.status_code}): {r.text[:300]}"
                )
                err_msg = f"Tradier returned non-JSON (HTTP {r.status_code})"
                return (None, err_msg) if _return_error else None

            return (result, None) if _return_error else result

        except (requests.exceptions.Timeout,
                requests.exceptions.ConnectionError) as e:
            if attempt < max_tries:
                logger.warning(
                    f"Tradier {method} {path}: {type(e).__name__} "
                    f"(attempt {attempt}/{max_tries}) — retrying in {attempt}s"
                )
                _time.sleep(attempt)
            else:
                logger.error(f"Tradier {method} {path}: {e}")
                return (None, str(e)) if _return_error else None
        except Exception as e:
            logger.error(f"Tradier {method} {path}: {e}")
            return (None, str(e)) if _return_error else None

    return (None, 'max retries exceeded') if _return_error else None


# ── ET time helpers ──────────────────────────────────────────────────────────

def _now_et():
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo('America/New_York'))
    except Exception:
        try:
            import pytz
            return datetime.now(pytz.timezone('US/Eastern'))
        except Exception:
            return datetime.utcnow()


def _parse_hhmm(s):
    try:
        h, m = map(int, (s or '').split(':'))
        return dtime(h, m)
    except Exception:
        return None


def _is_market_hours():
    """Mon-Fri 09:25-16:05 ET rough guard."""
    now = _now_et()
    if now.weekday() >= 5:
        return False
    t = now.time()
    return dtime(9, 25) <= t <= dtime(16, 5)


# ── Step evaluators ──────────────────────────────────────────────────────────

def eval_time(cfg):
    now_dt = _now_et()
    now    = now_dt.time().replace(second=0, microsecond=0)
    mode   = cfg.get('mode', 'after')
    t1     = _parse_hhmm(cfg.get('time1', '09:30'))
    t2     = _parse_hhmm(cfg.get('time2', '16:00'))
    if not t1:
        return False
    # Days-of-week check (Mon=0 … Fri=4)
    _DOW_MAP = {'mon': 0, 'tue': 1, 'wed': 2, 'thu': 3, 'fri': 4}
    days = cfg.get('daysOfWeek') or ['any']
    if 'any' not in days:
        today = now_dt.weekday()  # 0=Mon … 6=Sun
        allowed = {_DOW_MAP[d] for d in days if d in _DOW_MAP}
        if today not in allowed:
            return False
    if mode == 'exactly': return now == t1
    if mode == 'after':   return now >= t1
    if mode == 'before':  return now <= t1
    if mode == 'between': return t2 is not None and t1 <= now <= t2
    return False


def _compare(val, op, threshold):
    if op == '<':  return val <  threshold
    if op == '<=': return val <= threshold
    if op == '=':  return val == threshold
    if op == '>=': return val >= threshold
    if op == '>':  return val >  threshold
    return False


def _sanitize_strategy_tag(name, sid=None):
    """Build a Tradier-safe tag (alphanumeric + hyphens) identifying a strategy.

    Includes the numeric strategy id when available so two strategies with the
    same name still get distinct tags.  Max length 256 (Tradier limit).
    """
    import re
    base = re.sub(r'[^A-Za-z0-9\-]+', '-', (name or 'strategy')).strip('-') or 'strategy'
    if sid is not None:
        base = f"{base}-{sid}"
    return base[:256]


def _get_positions(api_key, base_url, account_id, tag=''):
    data = _tradier(api_key, base_url, f'/accounts/{account_id}/positions')
    positions = []
    if data:
        pd = data.get('positions', {})
        if pd and pd != 'null':
            raw = pd.get('position', [])
            if isinstance(raw, dict):
                raw = [raw]
            positions = raw or []
    if tag:
        positions = [p for p in positions
                     if tag.upper() in str(p.get('symbol', '')).upper()]
    return positions


def _resolve_tag_positions(tag, api_key, base_url, account_id):
    """Return (matched_positions, pending_count) for a user-defined order tag.

    Tradier does NOT reliably return the `tag` field on GET /orders (it is
    often absent for multileg orders in sandbox).  We therefore use a two-
    source approach:

      PRIMARY  — local JSON store written by _place() at order-placement time.
                 This is always accurate because we know the option symbols
                 before submitting the order.
      FALLBACK — scan all Tradier orders for a matching tag field, then
                 extract leg symbols.  Covers orders placed before the local
                 store existed or on other systems.

    Pending orders: scanned from GET /orders filtered by tag (Tradier does
    include the tag on *open* orders more reliably than filled ones).

    Returns (list[position], int) so callers can decide how to combine them.
    """
    # ── Primary: local tag store ──────────────────────────────────────
    filled_syms = _lookup_tag_symbols(account_id, tag)   # set of OCC symbols

    # ── Fallback: scan Tradier order list for matching tag ────────────
    all_orders = _get_all_orders(api_key, base_url, account_id)
    pending_count = 0
    for o in all_orders:
        o_tag    = str(o.get('tag', '') or '').strip()
        status   = str(o.get('status', '') or '')
        if o_tag != tag:
            continue
        if status in ('open', 'pending', 'partially_filled'):
            pending_count += 1
        elif status == 'filled' and not filled_syms:
            # Only use Tradier leg data when local store has nothing —
            # local store is preferred because Tradier often omits the tag.
            legs = o.get('leg', [])
            if isinstance(legs, dict):
                legs = [legs]
            if legs:
                for leg in legs:
                    sym = leg.get('option_symbol') or leg.get('symbol', '')
                    if sym:
                        filled_syms.add(str(sym).upper())
            else:
                sym = o.get('option_symbol') or o.get('symbol', '')
                if sym:
                    filled_syms.add(str(sym).upper())

    if filled_syms:
        logger.debug(f"resolve_tag '{tag}': filled_syms={filled_syms}, pending={pending_count}")
    else:
        logger.warning(f"resolve_tag '{tag}': no symbols found (local store empty, "
                       f"Tradier tag absent) — 0 positions will be matched")

    all_positions = _get_positions(api_key, base_url, account_id)
    matched = [p for p in all_positions
               if str(p.get('symbol', '') or '').upper() in filled_syms]
    return matched, pending_count


def eval_condition(cfg, api_key, base_url, account_id,
                   mkt_api_key=None, mkt_base_url=None):
    # Market-data reads (quotes for PnL) use live creds (_mkey/_murl); account
    # and order reads stay on api_key/base_url (sandbox in paper mode).
    _mkey = mkt_api_key or api_key
    _murl = mkt_base_url or base_url
    ctype    = cfg.get('conditionType', 'position_count')
    tag      = cfg.get('tag', '').strip()
    operator = cfg.get('operator', '<')
    value    = float(cfg.get('value', 1))

    if ctype == 'position_count':
        if tag:
            # Count TRADES (distinct orders), not individual legs.
            # A 2-leg spread = 1 trade, so "< 1" means "no open trades with
            # this tag" — intuitive regardless of strategy leg count.
            all_positions = _get_positions(api_key, base_url, account_id)
            live_syms     = {str(p.get('symbol', '') or '').upper()
                             for p in all_positions}

            # Broker order list drives two things: (1) a status map so the
            # store-based count can drop rejected/canceled orders that will
            # never fill, and (2) the untracked-pending count below.
            all_orders = _get_all_orders(api_key, base_url, account_id)
            order_status_by_id = {
                str(o.get('id', '') or ''): str(o.get('status', '') or '')
                for o in all_orders
            }
            filled_trades = _count_active_tag_trades(
                account_id, tag, live_syms, order_status_by_id)

            # Also count tagged pending orders from the broker, but ONLY those
            # the store does not already track — _count_active_tag_trades now
            # counts placed-but-unreflected orders itself, so adding tracked
            # pending orders again would double-count and over-tighten the cap.
            tracked_ids = _tracked_tag_order_ids(account_id, tag)
            pending = sum(
                1 for o in all_orders
                if str(o.get('tag', '') or '').strip() == tag
                and str(o.get('status', '') or '') in ('open', 'pending', 'partially_filled')
                and str(o.get('id', '') or '') not in tracked_ids
            )

            count = filled_trades + pending
            logger.info(
                f"eval_condition pos_count tag='{tag}': "
                f"store_trades={filled_trades}, pending_orders={pending}, "
                f"total_count={count}, live_positions={len(all_positions)}, "
                f"result=({count} {operator} {value}) → {_compare(float(count), operator, value)}"
            )
            if filled_trades == 0 and pending == 0 and len(all_positions) > 0:
                logger.warning(
                    f"eval_condition tag='{tag}': {len(all_positions)} live position(s) found "
                    f"but none are tracked under tag '{tag}'. "
                    f"If positions were opened before tag tracking was enabled, "
                    f"they won't be counted — close them and re-open via the bot."
                )
        else:
            count = len(_get_positions(api_key, base_url, account_id))
        return _compare(float(count), operator, value)

    elif ctype == 'daily_opens':
        if tag:
            positions, _ = _resolve_tag_positions(tag, api_key, base_url, account_id)
        else:
            positions = _get_positions(api_key, base_url, account_id)
        today = _now_et().date().isoformat()
        count = sum(1 for p in positions
                    if str(p.get('date_acquired', '')).startswith(today))
        return _compare(float(count), operator, value)

    elif ctype == 'unrealized_pnl':
        if tag:
            positions, _ = _resolve_tag_positions(tag, api_key, base_url, account_id)
        else:
            positions = _get_positions(api_key, base_url, account_id)
        total = 0.0
        for pos in positions:
            sym  = pos.get('symbol', '')
            qty  = float(pos.get('quantity', 0))
            cost = float(pos.get('cost_basis', 0))
            q = _tradier(_mkey, _murl, '/markets/quotes',
                         params={'symbols': sym, 'greeks': 'false'})
            if q:
                last = float((q.get('quotes', {}).get('quote') or {}).get('last', 0) or 0)
                total += (last * qty * 100) - cost
        return _compare(total, operator, value)

    elif ctype == 'open_orders':
        open_orders = _get_open_orders(api_key, base_url, account_id)
        return _compare(float(len(open_orders)), operator, value)

    elif ctype == 'canceled_orders':
        today  = _now_et().date().isoformat()
        orders = _get_all_orders(api_key, base_url, account_id)
        count  = sum(
            1 for o in orders
            if o.get('status') == 'canceled'
            and str(o.get('transaction_date', o.get('create_date', ''))).startswith(today)
        )
        return _compare(float(count), operator, value)

    elif ctype == 'closed_today':
        today  = _now_et().date().isoformat()
        orders = _get_all_orders(api_key, base_url, account_id)
        count  = sum(
            1 for o in orders
            if o.get('status') == 'filled'
            and str(o.get('transaction_date', '')).startswith(today)
            and o.get('side', '') in ('sell_to_close', 'buy_to_close', 'sell', 'buy_to_cover')
        )
        return _compare(float(count), operator, value)

    return True


def _fetch_daily_history(symbol, api_key, base_url, bars=200):
    """Return up to `bars` daily OHLCV dicts for *symbol*, newest last."""
    import datetime
    end   = _now_et().date()
    start = end - datetime.timedelta(days=max(bars * 2, 365))
    data  = _tradier(api_key, base_url, '/markets/history',
                     params={'symbol': symbol, 'interval': 'daily',
                             'start': str(start), 'end': str(end)})
    if not data:
        return []
    hist = data.get('history', {})
    if not hist or hist == 'null':
        return []
    raw = hist.get('day', [])
    if isinstance(raw, dict):
        raw = [raw]
    return raw or []


def _fetch_intraday_bars(symbol, interval, api_key, base_url,
                         window_from='', window_to='', days_back=0):
    """Return intraday OHLCV bars (list, oldest first), optionally
    clipped to a HH:MM–HH:MM window.

    NOTE: always uses TRADIER_LIVE_BASE — the sandbox returns delayed/simulated
    market data which causes indicators (RSI, SMA, etc.) to diverge from reality.

    days_back=0 → today only (original behaviour).
    days_back=N → start N calendar days ago for warmup (used by RSI/SMA/EMA
                  so Wilder's smoothing has enough history to converge).
    """
    import datetime
    now_et = _now_et()
    today  = now_et.date()

    intv_map = {'1min': '1min', '5min': '5min', '15min': '15min'}
    tradier_intv = intv_map.get(interval, '1min')

    if days_back > 0:
        start_date = today - datetime.timedelta(days=days_back)
        start = f"{start_date} 09:30"
    else:
        start = f"{today} {window_from}" if window_from else f"{today} 09:30"

    if days_back > 0:
        end = now_et.strftime('%Y-%m-%d %H:%M')
    else:
        end = f"{today} {window_to}" if window_to else now_et.strftime('%Y-%m-%d %H:%M')

    data = _tradier(api_key, base_url, '/markets/timesales',
                    params={'symbol': symbol, 'interval': tradier_intv,
                            'start': start, 'end': end,
                            'session_filter': 'open'})
    if not data:
        return []
    series = data.get('series', {})
    if not series or series == 'null':
        return []
    raw = series.get('data', [])
    if isinstance(raw, dict):
        raw = [raw]
    bars = []
    for item in (raw or []):
        try:
            bars.append({
                'time':   item.get('time', ''),
                'open':   float(item.get('open',   0) or 0),
                'high':   float(item.get('high',   0) or 0),
                'low':    float(item.get('low',    0) or 0),
                'close':  float(item.get('close',  0) or 0),
                'volume': float(item.get('volume', 0) or 0),
            })
        except Exception:
            pass
    return bars


def _drop_forming_bar(bars, interval):
    """Return `bars` with any in-progress (currently-forming) trailing bar removed.

    Intraday indicator crosses must mirror the chart, which only plots FINISHED
    candles.  Tradier's timesales may append a partial bar for the current
    minute/bucket; including it would distort the moving average and, depending
    on the exact second the scheduler ticks, shift which bar counts as the
    "previous" candle.  We drop the trailing bar only when its start time falls
    inside the still-open interval bucket for "now" (so a just-closed bar is
    kept and a partial one is dropped — making "previous candle" deterministic).
    """
    if not bars:
        return bars
    secs = {'1min': 60, '5min': 300, '15min': 900}.get(interval, 60)
    try:
        last_t = datetime.fromisoformat(str(bars[-1].get('time', '')))
    except Exception:
        return bars
    now_et = _now_et().replace(tzinfo=None)
    if last_t <= now_et < (last_t + timedelta(seconds=secs)):
        return bars[:-1]
    return bars


def _bot_candle_color(candle):
    """'green'|'red'|'doji' from a bar's open/close, or None if unavailable."""
    if not candle:
        return None
    o = candle.get('open')
    c = candle.get('close')
    if o is None or c is None:
        return None
    try:
        o = float(o); c = float(c)
    except (TypeError, ValueError):
        return None
    return 'green' if c > o else ('red' if c < o else 'doji')


def _bot_candle_dp(candle, datapoint):
    """Return a bar's open/high/low/close as float (default close), or None."""
    dp = str(datapoint or 'close').strip().lower()
    dp = {'o': 'open', 'h': 'high', 'l': 'low', 'c': 'close'}.get(dp, dp)
    if dp not in ('open', 'high', 'low', 'close'):
        dp = 'close'
    if not candle:
        return None
    v = candle.get(dp)
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _session_intraday_bars(symbol, interval, api_key, base_url, day=0):
    """Intraday bars for the trading session `day` sessions back (0 = today).

    Tradier's timesales only supports 1/5/15-min intraday buckets.  For prior
    sessions we fetch a wider window and group by calendar date, then return the
    requested day's bars (oldest first)."""
    try:
        day = int(day or 0)
    except (TypeError, ValueError):
        day = 0
    if day == 0:
        bars = _fetch_intraday_bars(symbol, interval, api_key, base_url, days_back=0)
        if not bars:
            bars = _fetch_intraday_bars(symbol, interval, api_key, base_url, days_back=3)
        return bars
    bars = _fetch_intraday_bars(symbol, interval, api_key, base_url,
                                days_back=max(abs(day) * 2 + 5, 10))
    if not bars:
        return []
    from collections import OrderedDict
    by_date = OrderedDict()
    for b in bars:
        d = str(b.get('time', ''))[:10]
        if d:
            by_date.setdefault(d, []).append(b)
    dates = list(by_date.keys())
    idx = len(dates) - 1 + day  # day is negative
    if 0 <= idx < len(dates):
        return by_date[dates[idx]]
    return []


def _aggregate_candles(bars, n):
    """Group consecutive OHLC candles (oldest-first) into buckets of `n`.

    Each bucket: open=first.open, high=max(highs), low=min(lows),
    close=last.close, time=first.time.  A trailing partial bucket is kept so
    the most recent (possibly still-forming) group is represented.  Used to
    build N-bar candles the data feed does not serve natively (e.g. a 3-minute
    candle from 1-minute Tradier bars)."""
    try:
        n = max(1, int(n or 1))
    except (TypeError, ValueError):
        n = 1
    if n <= 1 or not bars:
        return bars
    out = []
    for i in range(0, len(bars), n):
        grp = bars[i:i + n]
        if not grp:
            continue
        highs = [g.get('high') for g in grp if g.get('high') is not None]
        lows  = [g.get('low')  for g in grp if g.get('low')  is not None]
        out.append({
            'time':  grp[0].get('time', ''),
            'open':  grp[0].get('open'),
            'high':  max(highs) if highs else None,
            'low':   min(lows)  if lows  else None,
            'close': grp[-1].get('close'),
        })
    return out


def _live_candle_pair(symbol, interval, api_key, base_url, day=0, multiplier=1):
    """Return (prev_candle, cur_candle) dicts for live 'current/previous candle'
    logic, mirroring the options backtester.

    cur_candle  = the most recent (currently forming) candle.
    prev_candle = the last finished candle before it.
    interval: '1min'|'5min'|'15min'|'day'.  day: 0=today, negative=prior sessions.
    multiplier: bars-per-candle; >1 aggregates the base interval into N-bar
    candles (e.g. interval='1min', multiplier=3 → 3-minute candles).
    Returns (None, None) when data is unavailable."""
    interval = interval or '1min'
    try:
        day = int(day or 0)
    except (TypeError, ValueError):
        day = 0
    try:
        multiplier = max(1, int(multiplier or 1))
    except (TypeError, ValueError):
        multiplier = 1
    if interval == 'day':
        need = max(abs(day) + 5, 10)
        bars = _fetch_daily_history(symbol, api_key, base_url, bars=need)
        if not bars:
            return None, None
        # Normalise daily rows to the OHLC keys used elsewhere.
        norm = []
        for b in bars:
            norm.append({
                'time':  b.get('date', ''),
                'open':  b.get('open'),
                'high':  b.get('high'),
                'low':   b.get('low'),
                'close': b.get('close'),
            })
        bars = norm
        if day != 0:
            cut = len(bars) + day  # day negative
            bars = bars[:cut] if cut > 0 else []
            if not bars:
                return None, None
    else:
        bars = _session_intraday_bars(symbol, interval, api_key, base_url, day=day)
        if not bars:
            return None, None
    if multiplier > 1:
        bars = _aggregate_candles(bars, multiplier)
        if not bars:
            return None, None
    cur = bars[-1]
    prev = bars[-2] if len(bars) >= 2 else None
    return prev, cur


def _eval_current_candle_bot(cfg, symbol, mkey, murl, comparator, operator, interval):
    """Evaluate a 'current_candle' metric condition against live Tradier data.

    Mirrors options_backtester._eval_current_candle_condition:
      comparator 'none'                → assert current-candle colour
                                         (live price vs current-candle open).
      comparator 'compare_prev_candle' → compare a current-candle datapoint (or
                                         the live current price) against the
                                         previous candle's datapoint, with an
                                         optional stricter threshold.
    Returns (ok, detail).  ok=None → data unavailable (skip)."""
    try:
        day = int(cfg.get('day', 0) or 0)
    except (TypeError, ValueError):
        day = 0
    left_dp    = str(cfg.get('ccDatapoint', 'close')).strip().lower()
    left_color = str(cfg.get('ccColor', 'either')).strip().lower()

    def _live_price():
        q = _tradier(mkey, murl, '/markets/quotes',
                     params={'symbols': symbol, 'greeks': 'false'})
        if not q:
            return None
        try:
            p = float((q.get('quotes', {}).get('quote') or {}).get('last', 0) or 0)
        except (TypeError, ValueError):
            return None
        return p if p > 0 else None

    prev_c, cur_c = _live_candle_pair(symbol, interval, mkey, murl, day=day)
    cur_price = _live_price()

    if comparator == 'none':
        want = left_color
        if want in ('either', '', 'any'):
            return True, 'Current candle: any color ✓'
        if cur_c is None:
            return None, 'No current candle data'
        cur_open = _bot_candle_dp(cur_c, 'open')
        if cur_price is None or cur_open is None:
            return None, 'No current price for candle color'
        actual = 'green' if cur_price > cur_open else ('red' if cur_price < cur_open else 'doji')
        ok = (actual == want)
        return ok, f"Current candle is {actual}, need {want} {'✓' if ok else '✗'}"

    if comparator == 'compare_prev_candle':
        if left_dp in ('price', 'current_price', 'current'):
            left_val = cur_price
            left_lbl = 'Current price'
        else:
            if cur_c is None:
                return None, 'No current candle data'
            left_val = _bot_candle_dp(cur_c, left_dp)
            left_lbl = f'Current candle {left_dp}'
        # Colour gate on the current candle (live price vs current-candle open)
        if left_color in ('green', 'red') and cur_price is not None and cur_c is not None:
            _co = _bot_candle_dp(cur_c, 'open')
            if _co is not None:
                _cc = 'green' if cur_price > _co else ('red' if cur_price < _co else 'doji')
                if _cc != left_color:
                    return False, f'current candle is {_cc}, need {left_color} ✗'
        # The previous candle has its own day offset, candle type and
        # multiplier, independent of the current candle (parity with the
        # options backtester).  Fall back to the current-candle settings when
        # the right-side fields are absent (legacy configs).
        try:
            r_day = int(cfg.get('rightDay', day) or 0)
        except (TypeError, ValueError):
            r_day = day
        r_interval = str(cfg.get('rightInterval', interval) or interval).strip() or interval
        try:
            r_mult = max(1, int(cfg.get('ccRightMultiplier', 1) or 1))
        except (TypeError, ValueError):
            r_mult = 1
        prev_r, _cur_r = _live_candle_pair(symbol, r_interval, mkey, murl,
                                           day=r_day, multiplier=r_mult)
        if prev_r is None:
            return None, 'No previous candle data'
        right_dp    = str(cfg.get('ccRightDatapoint', 'close')).strip().lower()
        right_color = str(cfg.get('ccRightColor', 'either')).strip().lower()
        if right_color in ('green', 'red'):
            _pc = _bot_candle_color(prev_r)
            if _pc != right_color:
                return False, f'previous candle is {_pc}, need {right_color} ✗'
        right_val = _bot_candle_dp(prev_r, right_dp)
        if left_val is None or right_val is None:
            return None, 'Missing candle values'
        try:
            tv = float(cfg.get('thresholdValue') or 0)
        except (TypeError, ValueError):
            tv = 0.0
        tu = str(cfg.get('thresholdUnit', 'dollar')).strip().lower()
        eff_right = right_val
        if tv:
            if operator in ('<', '<='):
                eff_right = right_val * (1 - tv / 100.0) if tu in ('percent', 'pct', '%') else right_val - tv
            else:
                eff_right = right_val * (1 + tv / 100.0) if tu in ('percent', 'pct', '%') else right_val + tv
        ok = _compare(left_val, operator, eff_right)
        return ok, (f'{left_lbl} = {left_val:.2f} {operator} Prev candle {right_dp} '
                    f'{eff_right:.2f} {"✓" if ok else "✗"}')

    return None, f'Unknown current-candle comparator {comparator}'


def _ind_sma(closes, period):
    if len(closes) < period:
        return None
    return sum(closes[-period:]) / period


def _ind_ema(closes, period):
    """Plain EMA — matches options backtester's pandas.ewm(span=N, adjust=False).

    Initializes from the first close (no SMA seed) and applies the standard
    smoothing alpha = 2/(N+1) for every subsequent bar.  This intentionally
    mirrors the options engine so the same series produces the same value
    across Bot / Stock / Options backtesters.
    """
    if len(closes) < period:
        return None
    k = 2.0 / (period + 1)
    ema = float(closes[0])
    for p in closes[1:]:
        ema = p * k + ema * (1 - k)
    return ema


def _ind_rsi(closes, period=14):
    """Wilder's smoothed RSI — matches the options backtester and TradingView.

    Uses an SMA seed of the first `period` gains/losses, then applies Wilder's
    recursive smoothing across the entire remaining series. Computing RSI from
    only the last `period` diffs (simple average) is incorrect and produces
    values that diverge significantly from TradingView's RSI(14).
    """
    if len(closes) < period + 1:
        return None
    diffs  = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains  = [max(d, 0.0)  for d in diffs]
    losses = [max(-d, 0.0) for d in diffs]
    # Seed with simple average of first `period` values
    avg_g = sum(gains[:period])  / period
    avg_l = sum(losses[:period]) / period
    # Wilder's smoothing across the rest of the series
    for i in range(period, len(gains)):
        avg_g = (avg_g * (period - 1) + gains[i])  / period
        avg_l = (avg_l * (period - 1) + losses[i]) / period
    if avg_l == 0:
        return 100.0
    return 100 - 100 / (1 + avg_g / avg_l)


def _ind_roc(closes, period=10):
    if len(closes) < period + 1:
        return None
    return (closes[-1] - closes[-(period + 1)]) / closes[-(period + 1)] * 100


def _ind_macd(closes, short=12, long_=26, signal=9, component='histogram'):
    """Compute MACD value.  component: 'macd_line' | 'signal_line' | 'histogram'.

    Uses plain EMA (no SMA seed) on all three lines to match the options
    backtester's pandas.ewm(span=N, adjust=False) behaviour.  The fast/slow
    EMAs are initialized from closes[0]; the signal EMA is initialized from
    the first MACD-line value.
    """
    # Plain EMA only requires >=1 bar to start, so match that minimum here
    # rather than the SMA-seeded warmup of `long_ + signal`.  This keeps the
    # bot consistent with the options/stock engines which use pandas
    # ewm(adjust=False) and emit values as soon as there's enough series.
    if len(closes) < max(2, signal):
        return None
    k_s   = 2.0 / (short  + 1)
    k_l   = 2.0 / (long_  + 1)
    k_sig = 2.0 / (signal + 1)

    es = float(closes[0])
    el = float(closes[0])
    macd_series = [es - el]
    for c in closes[1:]:
        es = c * k_s + es * (1 - k_s)
        el = c * k_l + el * (1 - k_l)
        macd_series.append(es - el)

    macd_val = macd_series[-1]
    if component == 'macd_line':
        return macd_val

    sig_ema = macd_series[0]
    for v in macd_series[1:]:
        sig_ema = v * k_sig + sig_ema * (1 - k_sig)
    if component == 'signal_line':
        return sig_ema
    return macd_val - sig_ema   # histogram


def _compute_bar_metric(metric, period, bars, day=0, series='close',
                        macd_short=12, macd_long=26, macd_signal=9, macd_comp='histogram'):
    """Compute a single numeric metric from daily bars list (newest last).

    day=0 = today, day=-1 = yesterday, etc.
    Returns float or None if data is insufficient.
    """
    day = int(day)
    if day < 0:
        bars = bars[:day]   # trim most-recent |day| bars
    if not bars:
        return None

    def _col(key):
        vals = []
        for b in bars:
            try:
                vals.append(float(b[key]))
            except (KeyError, TypeError, ValueError):
                pass
        return vals

    closes = _col('close')
    if not closes:
        return None

    # Series-aware input column for any indicator that takes a single price
    # series.  Defaults to close when the requested series is unavailable.
    ser_map  = {'open': _col('open'), 'high': _col('high'),
                'low':  _col('low'),  'close': closes}
    inp = ser_map.get(series) or closes

    if metric == 'price':
        return inp[-1] if inp else None
    if metric == 'volume':
        vols = _col('volume')
        return vols[-1] if vols else None
    if metric == 'gap_pct':
        opens = _col('open')
        if len(closes) < 2 or not opens:
            return None
        return (opens[-1] - closes[-2]) / closes[-2] * 100
    if metric == 'change_pct':
        return (closes[-1] - closes[-2]) / closes[-2] * 100 if len(closes) >= 2 else None
    if metric == 'roc':
        return _ind_roc(inp, period)
    if metric == 'sma':
        return _ind_sma(inp, period)
    if metric == 'ema':
        return _ind_ema(inp, period)
    if metric == 'rsi':
        return _ind_rsi(inp, period)
    if metric == 'macd':
        return _ind_macd(inp, macd_short, macd_long, macd_signal, macd_comp)
    return None


def _fetch_atm_option(symbol, opt_type, target_dte, api_key, base_url):
    """Return the ATM option dict (with greeks) for the nearest expiration to target_dte."""
    import datetime
    q = _tradier(api_key, base_url, '/markets/quotes',
                 params={'symbols': symbol, 'greeks': 'false'})
    if not q:
        return None
    current_price = float(
        (q.get('quotes', {}).get('quote') or {}).get('last', 0) or 0)
    if current_price <= 0:
        return None

    exp_data = _tradier(api_key, base_url, '/markets/options/expirations',
                        params={'symbol': symbol})
    if not exp_data:
        return None
    exp_list = (exp_data.get('expirations') or {}).get('date', [])
    if isinstance(exp_list, str):
        exp_list = [exp_list]
    if not exp_list:
        return None

    today = _now_et().date()
    best_exp = min(
        exp_list,
        key=lambda e: abs((datetime.date.fromisoformat(e) - today).days - target_dte),
        default=None,
    )
    if not best_exp:
        return None

    chain_data = _tradier(api_key, base_url, '/markets/options/chains',
                          params={'symbol': symbol, 'expiration': best_exp,
                                  'greeks': 'true'})
    if not chain_data:
        return None
    raw = (chain_data.get('options') or {}).get('option', [])
    if isinstance(raw, dict):
        raw = [raw]
    filtered = [o for o in (raw or [])
                if str(o.get('option_type', '')).lower() == opt_type.lower()]
    if not filtered:
        return None
    return min(filtered,
               key=lambda o: abs(float(o.get('strike', 0) or 0) - current_price))


def _compute_options_metric(metric, symbol, opt_type, target_dte, api_key, base_url):
    """Return delta, theta, or current IV% for the ATM option."""
    opt = _fetch_atm_option(symbol, opt_type, target_dte, api_key, base_url)
    if not opt:
        return None
    greeks = opt.get('greeks') or {}
    if metric == 'delta':
        val = greeks.get('delta') if greeks else opt.get('delta')
        return float(val) if val is not None else None
    if metric == 'theta':
        val = greeks.get('theta') if greeks else opt.get('theta')
        return float(val) if val is not None else None
    if metric == 'iv_rank':
        # Tradier doesn't expose 52-week IV history; we return current mid-IV as a %
        val = (greeks.get('mid_iv') or greeks.get('ask_iv')
               or opt.get('implied_volatility'))
        if val is None:
            return None
        iv = float(val)
        return iv * 100 if iv <= 1.0 else iv   # normalize to 0-100 range
    return None


def _apply_threshold(rhs, unit, value, operator):
    """Offset RHS by threshold in the direction implied by the operator."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        v = 0.0
    if v == 0:
        return rhs
    sign = 1 if operator in ('>', '>=', 'crosses_above') else -1
    if unit == 'dollar':
        return rhs + sign * v
    # percent
    return rhs * (1 + sign * v / 100)


def eval_metric_verbose(cfg, api_key, base_url, symbol,
                        mkt_api_key=None, mkt_base_url=None, strategy_id=None):
    """Full metric evaluator. Returns (ok, detail_message).
    ok=None means data unavailable (step should be skipped).
    Handles crosses_above/crosses_below and AND conditions."""
    # Allow the step to override the bot's primary symbol
    symbol      = (cfg.get('metricSymbol') or '').strip().upper() or symbol
    metric      = cfg.get('metric', 'price')
    operator    = cfg.get('operator', '>')
    # Support new 'comparator' field; fall back to legacy 'compareType'
    _ct_map     = {'price': 'compare_price', 'indicator': 'compare_sma', 'bar_delta': 'bar_delta'}
    _raw_ct     = cfg.get('compareType', 'value')
    ctype       = cfg.get('comparator') or _ct_map.get(_raw_ct, _raw_ct) or 'value'
    cv          = cfg.get('value', '')
    period      = int(cfg.get('period') or 14)
    day         = int(cfg.get('day') or 0)
    intv        = cfg.get('interval', '1min')
    series      = cfg.get('series', 'close')
    macd_short  = int(cfg.get('macdShort')  or 12)
    macd_long   = int(cfg.get('macdLong')   or 26)
    macd_signal = int(cfg.get('macdSignal') or 9)
    macd_comp   = cfg.get('macdComponent', 'histogram')
    opt_type    = cfg.get('optType', 'call')
    opt_dte     = int(cfg.get('optDte') or 30)
    and_enabled = bool(cfg.get('andEnabled', False))
    and_metric  = cfg.get('andMetric', 'rsi')
    and_period  = int(cfg.get('andPeriod') or 14)
    and_op      = cfg.get('andOperator', '<')
    and_value   = cfg.get('andValue', '')

    # Use live-quote credentials for market data when provided (paper mode with live key)
    _mkey = mkt_api_key or api_key
    _murl = mkt_base_url or base_url

    _OPT_METRICS = ('iv_rank', 'delta', 'theta')
    is_cross = operator in ('crosses_above', 'crosses_below')

    def _fmt(v):
        if v is None: return 'N/A'
        try:
            f = float(v)
        except Exception:
            return str(v)
        # Prices/indicators: keep 2 decimals so borderline cross checks are
        # readable (e.g. 7415.24 vs 7419.90). Large counts (volume) → no decimals.
        if abs(f) >= 100000:
            return f'{f:,.0f}'
        return f'{f:.2f}'

    def _mn(m, p=None):
        _p = p or period
        return {'current_price': 'Price', 'price': 'Price', 'volume': 'Volume',
                'sma': f'SMA({_p})', 'ema': f'EMA({_p})', 'rsi': f'RSI({_p})',
                'macd': 'MACD', 'roc': f'ROC({_p})', 'iv_rank': 'IV%',
                'delta': 'Delta', 'theta': 'Theta',
                'gap_pct': 'Gap%', 'change_pct': 'Change%'}.get(m, m)

    def _op_sym(op):
        return {'crosses_above': '↑ cross above', 'crosses_below': '↓ cross below',
                '>': '>', '<': '<', '>=': '≥', '<=': '≤', '=': '='}.get(op, op)

    def _cbm(brs, d=0):
        return _compute_bar_metric(metric, period, brs, day=d, series=series,
                                   macd_short=macd_short, macd_long=macd_long,
                                   macd_signal=macd_signal, macd_comp=macd_comp)

    # ── Current-candle metric (self-contained; mirrors options backtester) ─────
    if metric == 'current_candle':
        _cc_comp = ctype if ctype in ('none', 'compare_prev_candle') else 'none'
        return _eval_current_candle_bot(cfg, symbol, _mkey, _murl,
                                        comparator=_cc_comp, operator=operator,
                                        interval=intv)

    # ── Fetch LHS ─────────────────────────────────────────────────────────────
    bars = None
    lhs = None
    lhs_name = _mn(metric)
    try:
        if metric == 'current_price':
            q = _tradier(_mkey, _murl, '/markets/quotes',
                         params={'symbols': symbol, 'greeks': 'false'})
            if not q:
                return None, 'Could not fetch live price'
            lhs = float((q.get('quotes', {}).get('quote') or {}).get('last', 0) or 0)
            if lhs <= 0:
                return None, 'Live price unavailable'
        elif metric in _OPT_METRICS:
            lhs = _compute_options_metric(metric, symbol, opt_type, opt_dte,
                                          _mkey, _murl)
            if lhs is None:
                return None, f'Could not fetch {lhs_name} data'
        else:
            # Metrics that only make sense on daily bars regardless of interval
            _DAILY_ONLY = ('gap_pct', 'change_pct')
            use_intraday = (intv != 'day') and (metric not in _DAILY_ONLY)

            if use_intraday:
                # Fetch several days of intraday history so Wilder's smoothing
                # has enough warm-up bars to converge (matches TradingView behaviour).
                bars = _fetch_intraday_bars(symbol, intv, _mkey, _murl, days_back=10)
                if not bars:
                    return None, f'Could not fetch intraday bars ({intv}) for {lhs_name}'
                lhs = _cbm(bars, d=0)   # day offset doesn't apply to intraday
            else:
                need = max(period * 3, (macd_long + macd_signal) * 3, 100)
                bars = _fetch_daily_history(symbol, _mkey, _murl, bars=need)
                if not bars:
                    return None, 'Could not fetch daily price history'
                lhs = _cbm(bars, d=day)
            if lhs is None:
                return None, f'Could not compute {lhs_name}'
    except Exception as e:
        return None, f'Error computing {lhs_name}: {e}'

    # Helper: get previous-bar lhs
    def _prev_lhs():
        if metric == 'current_price':
            # Use yesterday's close from daily history
            _b = bars or _fetch_daily_history(symbol, _mkey, _murl, bars=10)
            return (_compute_bar_metric('price', 1, _b, day=-1) if _b else None), _b
        elif metric in _OPT_METRICS:
            return None, bars   # can't get previous options metric
        else:
            return _cbm(bars, d=day - 1), bars

    def _bar_open(b):
        """A bar's open as a positive float, or None if missing/invalid.
        Used by the prev-bar cross gate so missing data fails the gate (no fire)
        instead of silently coercing to 0."""
        try:
            v = float((b or {}).get('open'))
            return v if v > 0 else None
        except (TypeError, ValueError):
            return None

    # ── Compute RHS & evaluate ────────────────────────────────────────────────
    thresh_unit  = cfg.get('thresholdUnit', 'percent')
    thresh_value = cfg.get('thresholdValue', '')

    ok = None
    detail = ''
    rhs_name = ''
    rhs = None
    try:
        if ctype == 'value':
            try:
                rhs = float(cv)
                rhs_name = _fmt(rhs)
            except (ValueError, TypeError):
                return None, f"Invalid threshold value '{cv}'"

            if is_cross:
                _pb_open = None   # prev-bar open (prev-bar gate, current_price only)
                if metric == 'current_price':
                    # Within-bar breach (matches the options backtester): compare
                    # THIS currently-forming bar's OPEN against the threshold; the
                    # live price must land on the other side.  Fires on the exact
                    # bar where price breaks the level, not the bar after.
                    _ob = (_fetch_intraday_bars(symbol, intv, _mkey, _murl, days_back=2)
                           if intv != 'day'
                           else _fetch_daily_history(symbol, _mkey, _murl, bars=3))
                    prev_lhs_val = _bar_open(_ob[-1]) if _ob else None
                    # Prev-bar gate: also require the PREVIOUS bar's open below/above
                    # the threshold.
                    if _ob and len(_ob) >= 2:
                        _pb_open = _bar_open(_ob[-2])
                    _prev_lbl = 'bar open'
                else:
                    prev_lhs_val, bars = _prev_lhs()
                    _prev_lbl = 'bar 2 (prev)'
                if prev_lhs_val is None:
                    return None, f'Could not get previous bar {lhs_name}'
                prev_rhs = rhs
                # Convention matches the backtester:
                #   crosses_above: prev strictly below → curr at or above (prev < rhs, curr >= rhs)
                #   crosses_below: prev strictly above → curr at or below (prev > rhs, curr <= rhs)
                if operator == 'crosses_above':
                    if metric == 'current_price':
                        # Current bar's open need NOT be below the line — only the
                        # previous bar's open gates direction, plus the live price.
                        ok = (lhs >= rhs) and (_pb_open is not None and _pb_open < rhs)
                    else:
                        ok = (prev_lhs_val < prev_rhs) and (lhs >= rhs)
                else:
                    if metric == 'current_price':
                        ok = (lhs <= rhs) and (_pb_open is not None and _pb_open > rhs)
                    else:
                        ok = (prev_lhs_val > prev_rhs) and (lhs <= rhs)
                word = 'occurred ✓' if ok else 'did not occur ✗'
                dir_w = 'cross-up' if operator == 'crosses_above' else 'cross-down'
                detail = (f"{lhs_name} {dir_w} {rhs_name} {word}. "
                          f"{_prev_lbl.capitalize()}: {lhs_name} = {_fmt(prev_lhs_val)}, "
                          f"threshold = {rhs_name}; "
                          f"Bar 1 (curr): {lhs_name} = {_fmt(lhs)}")
            else:
                ok = _compare(lhs, operator, rhs)
                sym = _op_sym(operator)
                detail = f"{lhs_name} = {_fmt(lhs)}, {'✓' if ok else '✗'} {sym} {rhs_name}"

        elif ctype == 'compare_price':
            right_day      = int(cfg.get('rightDay', 0))
            right_intv     = cfg.get('rightInterval', '1min')
            right_ser      = cfg.get('rightSeries', 'close')
            right_lookback = max(int(cfg.get('rightLookback', 0) or 0), 0)

            if right_day == 0:
                # Intraday bar
                ibars = _fetch_intraday_bars(symbol, right_intv, _mkey, _murl)
                bar_idx = -(1 + right_lookback)
                bar = ibars[bar_idx] if ibars and len(ibars) >= (1 + right_lookback) else None
                lb_sfx = f' [-{right_lookback}]' if right_lookback else ''
                rhs_ctx = f'{right_intv}·{right_ser}{lb_sfx}'
            else:
                # Daily bar at offset
                if bars is None:
                    bars = _fetch_daily_history(symbol, _mkey, _murl, bars=50)
                idx = abs(right_day) + right_lookback
                bar = bars[-1 - idx] if bars and len(bars) > idx else None
                lb_sfx = f' [-{right_lookback}]' if right_lookback else ''
                rhs_ctx = f'daily·{right_ser} D({right_day}){lb_sfx}'

            if bar is None:
                return None, f'Could not fetch price bar for comparison (day={right_day}, lookback={right_lookback})'
            raw_rhs = float(bar.get(right_ser, 0) or 0)
            if raw_rhs <= 0:
                return None, f'Right-side price ({right_ser}) is 0'

            rhs = _apply_threshold(raw_rhs, thresh_unit, thresh_value, operator)
            rhs_name = f'Price [{rhs_ctx}]'
            ok = _compare(lhs, operator, rhs)
            sym = _op_sym(operator)
            detail = (f"{lhs_name} = {_fmt(lhs)}, {'✓' if ok else '✗'} {sym} "
                      f"{rhs_name} = {_fmt(raw_rhs)}"
                      + (f" (adj → {_fmt(rhs)})" if rhs != raw_rhs else ''))

        elif ctype == 'compare_vwap':
            # Rolling N-bar volume-weighted VWAP — harmonized with the options
            # backtester and simulated trading.  Uses the user's chosen
            # timeframe (intv) when intraday, falls back to daily bars
            # otherwise.  Period defaults to 20 when not specified.
            vwap_period = max(1, int(cfg.get('rightPeriod', 20) or 20))
            if intv != 'day':
                vbars = _fetch_intraday_bars(symbol, intv, _mkey, _murl, days_back=10)
                if not vbars:
                    return None, f'Could not fetch intraday bars ({intv}) for VWAP'
            else:
                vbars = bars if bars else _fetch_daily_history(symbol, _mkey, _murl, bars=max(vwap_period * 3, 100))
                if not vbars:
                    return None, 'Could not fetch daily bars for VWAP'
            if len(vbars) < vwap_period:
                return None, f'Not enough bars for VWAP({vwap_period}) — have {len(vbars)}'
            window = vbars[-vwap_period:]
            total_vol = sum(float(b.get('volume', 0) or 0) for b in window)
            if total_vol <= 0:
                return None, 'Zero volume — cannot compute VWAP'
            tpv = sum(
                (float(b.get('high', 0)) + float(b.get('low', 0)) + float(b.get('close', 0))) / 3
                * float(b.get('volume', 0) or 0)
                for b in window
            )
            raw_rhs = tpv / total_vol
            rhs = _apply_threshold(raw_rhs, thresh_unit, thresh_value, operator)
            rhs_name = f'VWAP({vwap_period})'
            ok = _compare(lhs, operator, rhs)
            sym = _op_sym(operator)
            detail = (f"{lhs_name} = {_fmt(lhs)}, {'✓' if ok else '✗'} {sym} "
                      f"{rhs_name} = {_fmt(raw_rhs)}"
                      + (f" (adj → {_fmt(rhs)})" if rhs != raw_rhs else ''))

        elif ctype in ('compare_sma', 'compare_ema', 'compare_rsi'):
            right_metric   = ctype.replace('compare_', '')   # 'sma', 'ema', or 'rsi'
            right_period   = int(cfg.get('rightPeriod', 20))
            right_lookback = max(int(cfg.get('rightLookback', 0) or 0), 0)
            # Use intraday bars when interval is not 'day' so EMA/SMA/RSI are
            # computed on the same timeframe the user sees on the chart.
            if intv != 'day':
                rhs_bars = _fetch_intraday_bars(symbol, intv, _mkey, _murl, days_back=10)
                if not rhs_bars:
                    return None, f'Could not fetch intraday bars ({intv}) for {right_metric.upper()} comparison'
            else:
                need = max(right_period * 3 + right_lookback, 100)
                rhs_bars = bars if bars is not None else _fetch_daily_history(symbol, _mkey, _murl, bars=need)
                if not rhs_bars:
                    return None, f'Could not fetch history for {right_metric.upper()} comparison'
            # Slice bars so that "bar 0" is `right_lookback` bars ago
            bar_slice = rhs_bars[:len(rhs_bars) - right_lookback] if right_lookback > 0 else rhs_bars
            if not bar_slice:
                return None, f'Not enough bars for {right_metric.upper()} lookback ({right_lookback})'
            raw_rhs = _compute_bar_metric(right_metric, right_period, bar_slice,
                                          day=0, series='close')
            if raw_rhs is None:
                return None, f'Could not compute {right_metric.upper()}({right_period})'
            lb_sfx = f' [-{right_lookback}]' if right_lookback else ''
            rhs_name = f'{right_metric.upper()}({right_period}){lb_sfx}'

            if is_cross:
                # Cross detection needs both the current bar and the one before it.
                # Previous RHS = same indicator on rhs_bars minus the final bar.
                prev_rhs_slice = (rhs_bars[:len(rhs_bars) - 1 - right_lookback]
                                  if right_lookback > 0 else rhs_bars[:-1])
                if not prev_rhs_slice:
                    return None, f'Not enough bars for {right_metric.upper()} cross detection'
                prev_rhs_raw = _compute_bar_metric(right_metric, right_period, prev_rhs_slice,
                                                   day=0, series='close')
                if prev_rhs_raw is None:
                    return None, f'Could not compute previous {right_metric.upper()}({right_period})'
                # Previous LHS value
                _pb_open = None   # prev-bar open (prev-bar gate, current_price only)
                _pb_cmp  = None   # comparator at the previous bar
                if metric == 'current_price':
                    # CHART-ALIGNED cross: anchor the moving average and the
                    # "previous candle" to FINISHED candles only.  Drop any
                    # in-progress bar so (a) the average matches what the chart
                    # draws (no partial bar mixed in) and (b) scheduler timing
                    # can't shift which candle counts as "previous".  The live
                    # price (lhs) stays the value that crosses the line, so
                    # entries remain intra-bar (no waiting for the candle close).
                    completed = _drop_forming_bar(rhs_bars, intv)
                    c_slice = (completed[:len(completed) - right_lookback]
                               if right_lookback > 0 else completed)
                    if not c_slice:
                        return None, f'Not enough finished bars for {right_metric.upper()} cross detection'
                    # Intraday crosses must use a "previous candle" from the
                    # CURRENT session.  At the open the last finished bar belongs
                    # to the prior trading day; comparing today's gap-up/down
                    # open against it would fire a phantom cross from the
                    # overnight gap.  Skip until a finished bar from today exists.
                    if intv != 'day':
                        try:
                            # Use the true latest FINISHED bar (before any
                            # rightLookback offset) so the lookback's intentional
                            # shift isn't mistaken for feed lag.
                            _last_fin = datetime.fromisoformat(str(completed[-1].get('time', '')))
                            _now_naive = _now_et().replace(tzinfo=None)
                            if _last_fin.date() != _now_naive.date():
                                return None, ('No finished bar in the current session yet — '
                                              'skipping cross to avoid an overnight-gap false signal')
                            # Staleness guard: the live price (lhs) comes from the
                            # real-time quote, but the comparator MA is built from
                            # intraday bars.  When the bar feed lags (provider
                            # delay), comparing a FRESH price against a STALE MA
                            # latches a phantom side and silently swallows real
                            # crosses.  Skip (without touching the latch) until the
                            # bars catch up; the next fresh eval re-syncs the side
                            # and fires any cross that completed during the gap.
                            _intv_secs = {'1min': 60, '5min': 300,
                                          '15min': 900}.get(intv, 60)
                            _stale_limit = max(_intv_secs * 5, 300)
                            _lag = (_now_naive - _last_fin).total_seconds()
                            if _lag > _stale_limit:
                                return None, (
                                    f'Intraday {intv} bars are stale (last finished '
                                    f'{int(_lag)}s ago, limit {_stale_limit}s) — '
                                    f'skipping cross to avoid comparing a live price '
                                    f'against a stale MA')
                        except (ValueError, TypeError, AttributeError):
                            pass
                    _cmp = _compute_bar_metric(right_metric, right_period, c_slice,
                                               day=0, series='close')
                    if _cmp is None:
                        return None, f'Could not compute {right_metric.upper()}({right_period})'
                    # Comparator = the MA through the last FINISHED candle — the
                    # same value the chart plots — used for both the prev-candle
                    # gate and the live-price cross.
                    raw_rhs = _cmp
                    _pb_cmp = _cmp
                    prev_lhs_val = _bar_open(c_slice[-1])   # last finished candle's OPEN
                    _pb_open = prev_lhs_val
                    prev_rhs_raw = raw_rhs
                    _prev_lbl = 'prev candle open'
                else:
                    prev_lhs_val = _cbm(bars[:-1], d=0) if bars and len(bars) > 1 else None
                    _prev_lbl = 'bar -2'
                if prev_lhs_val is None:
                    return None, f'Could not get previous {lhs_name} for cross detection'
                # Convention matches the backtester:
                #   crosses_above: prev strictly below indicator → curr at or above (prev < rhs, curr >= rhs)
                #   crosses_below: prev strictly above indicator → curr at or below (prev > rhs, curr <= rhs)
                # ── Edge-latched cross detection ──────────────────────────────
                # Fire ONCE, at the instant the live value moves to the far side
                # of the comparator; never repeat while it stays there.  We
                # persist the last observed side per strategy+condition and fire
                # only on a genuine flip (below→above for crosses_above,
                # above→below for crosses_below), re-arming only after the value
                # crosses back.  On the first observation (or after a restart) we
                # just record the side WITHOUT firing, so a value already past the
                # line can't trigger a phantom entry — the bot then waits for the
                # NEXT real crossing.  If a fired signal never fills, it is NOT
                # repeated; the next entry needs a fresh cross.
                if lhs >= raw_rhs:
                    cur_side = 'above'
                else:
                    cur_side = 'below'
                desired  = 'above' if operator == 'crosses_above' else 'below'
                opposite = 'below' if desired == 'above' else 'above'
                # Origin-side bar confirmation: the side the LAST FINISHED
                # candle actually CLOSED on. Used to require that a real bar
                # settled on the "from" side before an intra-bar live cross can
                # fire.
                _bar_side = None
                if metric == 'current_price':
                    try:
                        _bar_side = ('above'
                                     if float(c_slice[-1].get('close')) >= raw_rhs
                                     else 'below')
                    except (TypeError, ValueError, IndexError, AttributeError):
                        _bar_side = None
                if strategy_id is not None:
                    _latch_key = _cross_state_key(strategy_id, symbol, cfg)
                    # Intraday: gate the latch by trading day so a side latched
                    # in a prior session can't fire across the overnight gap.
                    # Daily-interval crosses compare consecutive days legitimately.
                    _session = _now_et().date().isoformat() if intv != 'day' else None
                    ok, prev_side = _cross_check_and_flip(
                        _latch_key, cur_side, desired, opposite, session=_session)
                else:
                    # Stateless preview (dry-run / legacy): compare the last
                    # finished candle's side to the live side, no persistence.
                    if metric == 'current_price':
                        _ref_lhs, _ref_rhs = _pb_open, _pb_cmp
                    else:
                        _ref_lhs, _ref_rhs = prev_lhs_val, prev_rhs_raw
                    if _ref_lhs is None or _ref_rhs is None:
                        prev_side = None
                    else:
                        prev_side = 'above' if _ref_lhs >= _ref_rhs else 'below'
                    ok = (prev_side == opposite) and (cur_side == desired)
                # Origin-side confirmation (intra-bar live crosses only): the
                # last FINISHED candle must have CLOSED on the side the price is
                # crossing FROM. A cross-up needs a candle that actually closed
                # below the MA; a live tick that only dipped below with no candle
                # closing there is NOT a real cross and must not fire.
                # (None ⇒ can't confirm ⇒ no fire.)
                if ok and metric == 'current_price' and _bar_side != opposite:
                    ok = False
                word = 'occurred ✓' if ok else 'did not occur ✗'
                dir_w = 'cross-up' if operator == 'crosses_above' else 'cross-down'
                _now_lbl = cur_side if cur_side else 'neutral'
                _bar_lbl = f", last-bar={_bar_side}" if metric == 'current_price' else ''
                detail = (f"{lhs_name} {dir_w} {rhs_name} {word}. "
                          f"Prev ({_prev_lbl}): {lhs_name}={_fmt(prev_lhs_val)}, {rhs_name}={_fmt(prev_rhs_raw)}; "
                          f"Curr (live): {lhs_name}={_fmt(lhs)}, {rhs_name}={_fmt(raw_rhs)} "
                          f"[latch: was={prev_side or 'none'} → now={_now_lbl}{_bar_lbl}]")
            else:
                rhs = _apply_threshold(raw_rhs, thresh_unit, thresh_value, operator)
                ok = _compare(lhs, operator, rhs)
                sym = _op_sym(operator)
                detail = (f"{lhs_name} = {_fmt(lhs)}, {'✓' if ok else '✗'} {sym} "
                          f"{rhs_name} = {_fmt(raw_rhs)}"
                          + (f" (adj → {_fmt(rhs)})" if rhs != raw_rhs else ''))

        elif ctype in ('compare_histogram', 'compare_macd_line', 'compare_signal_line'):
            # RHS = same MACD component computed on the same bars but shifted
            # right_lookback bars into the past.  The UI only exposes a lookback
            # field for these comparators (no separate period / interval).
            right_lookback = max(int(cfg.get('rightLookback', 0) or 0), 0)
            comp_map = {
                'compare_histogram':  'histogram',
                'compare_macd_line':  'macd_line',
                'compare_signal_line': 'signal_line',
            }
            rhs_comp = comp_map[ctype]
            # Reuse bars already fetched for LHS; fetch if not yet available
            if bars is None:
                if intv != 'day':
                    bars = _fetch_intraday_bars(symbol, intv, _mkey, _murl, days_back=10)
                else:
                    need = max((macd_long + macd_signal) * 3 + right_lookback, 100)
                    bars = _fetch_daily_history(symbol, _mkey, _murl, bars=need)
            if not bars:
                return None, 'Could not fetch bars for MACD comparison'
            rhs_day = -right_lookback if right_lookback > 0 else 0
            raw_rhs = _compute_bar_metric('macd', period, bars, day=rhs_day,
                                          macd_short=macd_short, macd_long=macd_long,
                                          macd_signal=macd_signal, macd_comp=rhs_comp)
            if raw_rhs is None:
                return None, f'Could not compute {rhs_comp} for MACD comparison'
            rhs = _apply_threshold(raw_rhs, thresh_unit, thresh_value, operator)
            lb_sfx = f' [-{right_lookback}]' if right_lookback else ''
            rhs_name = f'MACD {rhs_comp.replace("_", " ")}{lb_sfx}'
            ok = _compare(lhs, operator, rhs)
            sym = _op_sym(operator)
            detail = (f"{lhs_name} = {_fmt(lhs)}, {'✓' if ok else '✗'} {sym} "
                      f"{rhs_name} = {_fmt(raw_rhs)}"
                      + (f" (adj → {_fmt(rhs)})" if rhs != raw_rhs else ''))

        # ── Legacy comparator types (backward compat) ─────────────────────────
        elif ctype == 'indicator':
            ref_metric      = cfg.get('compareIndicator', 'ema')
            ref_period      = int(cfg.get('comparePeriod') or 9)
            ref_day         = int(cfg.get('compareDay') or -1)
            ref_series      = cfg.get('compareSeries', 'close')
            ref_macd_short  = int(cfg.get('refMacdShort')  or 12)
            ref_macd_long   = int(cfg.get('refMacdLong')   or 26)
            ref_macd_signal = int(cfg.get('refMacdSignal') or 9)
            ref_macd_comp   = cfg.get('refMacdComponent', 'histogram')
            rhs_name = _mn(ref_metric, ref_period)

            def _ref_cbm(brs, d):
                return _compute_bar_metric(ref_metric, ref_period, brs, day=d,
                                           series=ref_series,
                                           macd_short=ref_macd_short,
                                           macd_long=ref_macd_long,
                                           macd_signal=ref_macd_signal,
                                           macd_comp=ref_macd_comp)

            if bars is None:
                need = max(ref_period * 3, (ref_macd_long + ref_macd_signal) * 3, 100)
                bars = _fetch_daily_history(symbol, _mkey, _murl, bars=need)
            if not bars:
                return None, 'Could not fetch daily history for comparison indicator'
            rhs = _ref_cbm(bars, d=ref_day if not is_cross else 0)
            if rhs is None:
                return None, f'Could not compute reference {rhs_name}'
            ok = _compare(lhs, operator, rhs)
            sym = _op_sym(operator)
            detail = f"{lhs_name} = {_fmt(lhs)}, {'✓' if ok else '✗'} {sym} {rhs_name} ({_fmt(rhs)})"

        elif ctype == 'bar_delta':
            bar_offset      = max(int(cfg.get('barOffset') or 1), 1)
            delta_type      = cfg.get('deltaType', 'pct')
            delta_threshold = float(cfg.get('deltaThreshold') or 1)
            window_from     = cfg.get('windowFrom', '')
            window_to       = cfg.get('windowTo',   '')
            intv            = cfg.get('interval', '1min')

            if intv == 'day':
                need = max(bar_offset + period * 3, 100)
                ibars = _fetch_daily_history(symbol, _mkey, _murl, bars=need)
            else:
                ibars = _fetch_intraday_bars(symbol, intv, _mkey, _murl,
                                             window_from=window_from, window_to=window_to)

            if len(ibars) < bar_offset + 1:
                return None, f'Not enough bars ({len(ibars)}) for delta (need {bar_offset + 1})'

            current_val = _cbm(ibars, d=0)
            prior_val   = _cbm(ibars[:-bar_offset], d=0)

            if current_val is None or prior_val is None:
                return None, f'Could not compute {lhs_name} delta values'

            if delta_type == 'pct':
                if prior_val == 0:
                    return None, f'Cannot compute % delta: prior {lhs_name} = 0'
                change = (current_val - prior_val) / abs(prior_val) * 100
                change_str = f'{change:+.2f}%'
            else:
                change = current_val - prior_val
                change_str = f'{change:+.4g}'

            ok = _compare(change, operator, delta_threshold)
            sym = _op_sym(operator)
            detail = (f"{lhs_name} Δ = {change_str} ({bar_offset} bars), "
                      f"{'✓' if ok else '✗'} {sym} {_fmt(delta_threshold)} | "
                      f"Current: {_fmt(current_val)}, Prior: {_fmt(prior_val)}")
        else:
            return None, f"Unknown comparator '{ctype}'"

    except Exception as e:
        logger.warning(f"eval_metric_verbose evaluate: {e}")
        return None, f'Error evaluating metric: {e}'

    # ── AND condition ─────────────────────────────────────────────────────────
    if ok and and_enabled and and_value != '':
        try:
            and_v = float(and_value)
            if bars is None:
                need2 = max(and_period * 3, 100)
                bars = _fetch_daily_history(symbol, _mkey, _murl, bars=need2)
            and_lhs = (_compute_bar_metric(and_metric, and_period, bars, day=0)
                       if bars else None)
            and_name = _mn(and_metric, and_period)
            if and_lhs is None:
                detail += f' | AND {and_name}: could not compute'
                ok = None
            else:
                and_ok = _compare(and_lhs, and_op, and_v)
                sym2 = _op_sym(and_op)
                detail += (f" | AND {and_name} = {_fmt(and_lhs)}, "
                           f"{'✓' if and_ok else '✗'} {sym2} {_fmt(and_v)}")
                if not and_ok:
                    ok = False
        except Exception as e:
            detail += f' | AND condition error: {e}'

    return ok, detail


def eval_metric(cfg, api_key, base_url, symbol,
                mkt_api_key=None, mkt_base_url=None):
    """Returns True/False or None (skip step) if data/metric unavailable."""
    ok, _ = eval_metric_verbose(cfg, api_key, base_url, symbol,
                                mkt_api_key=mkt_api_key, mkt_base_url=mkt_base_url)
    return ok


# ── Action executors ─────────────────────────────────────────────────────────

def _get_open_orders(api_key, base_url, account_id):
    """Fetch pending/open option orders from Tradier."""
    data = _tradier(api_key, base_url, f'/accounts/{account_id}/orders')
    if not data:
        return []
    orders = data.get('orders', {})
    if not orders or orders == 'null':
        return []
    raw = orders.get('order', [])
    if isinstance(raw, dict):
        raw = [raw]
    return [o for o in (raw or [])
            if o.get('status') in ('open', 'pending', 'partially_filled')]


def _get_all_orders(api_key, base_url, account_id):
    """Fetch all orders (all statuses) from Tradier."""
    data = _tradier(api_key, base_url, f'/accounts/{account_id}/orders')
    if not data:
        return []
    orders = data.get('orders', {})
    if not orders or orders == 'null':
        return []
    raw = orders.get('order', [])
    if isinstance(raw, dict):
        raw = [raw]
    return raw or []


def _calc_used_allocation(positions):
    """Estimate total capital at risk from open option positions.

    For matched spread pairs (same root, expiry, type, opposite qty signs):
        risk = |strike_diff| * 100 * spread_qty + net_cost_basis
        (net_cost_basis is negative for credit spreads, which correctly reduces max loss)
    For unmatched / naked legs:
        risk = abs(cost_basis)
    """
    import re as _re
    parsed = []
    for pos in positions:
        sym = pos.get('symbol', '')
        m   = _re.match(r'^([A-Z]+)(\d{6})([CP])(\d{8})$', sym)
        if not m:
            continue
        root, exp, pc, stk = m.groups()
        parsed.append({
            'root':       root,
            'exp':        exp,
            'pc':         pc,
            'strike':     float(stk) / 1000.0,
            'qty':        float(pos.get('quantity', 0)),
            'cost_basis': float(pos.get('cost_basis', 0) or 0),
        })

    total_risk = 0.0
    matched    = set()

    for i, p in enumerate(parsed):
        if i in matched:
            continue
        for j, q in enumerate(parsed):
            if j <= i or j in matched:
                continue
            # Spread pair: same root/expiry/type, opposite qty signs
            if (p['root'] == q['root'] and p['exp'] == q['exp'] and
                    p['pc'] == q['pc'] and
                    ((p['qty'] > 0 and q['qty'] < 0) or (p['qty'] < 0 and q['qty'] > 0))):
                matched.add(i)
                matched.add(j)
                spread_qty  = min(abs(p['qty']), abs(q['qty']))
                strike_diff = abs(p['strike'] - q['strike'])
                net_cb      = p['cost_basis'] + q['cost_basis']
                # credit spread: net_cb < 0; risk = width*100*qty - net_credit = width*100*qty + net_cb
                risk = strike_diff * 100 * spread_qty + net_cb
                total_risk += max(0.0, risk)
                break

    # Unmatched positions (single legs): use abs(cost_basis) as approximation
    for i, p in enumerate(parsed):
        if i not in matched:
            total_risk += abs(p['cost_basis'])

    return total_risk


def exec_open_position(cfg, api_key, base_url, account_id,
                       mkt_api_key=None, mkt_base_url=None):
    # Market-data reads (expirations/chains/quotes for strike selection and
    # pricing) use live creds (_mkey/_murl). ORDER placement stays on
    # api_key/base_url — in paper mode that is the sandbox, and live creds must
    # NEVER place paper orders.
    _mkey = mkt_api_key or api_key
    _murl = mkt_base_url or base_url
    symbol        = (cfg.get('symbol') or 'SPY').upper()
    strategy      = cfg.get('strategy', 'Short Put Spread')
    dte           = int(cfg.get('dte', 30))
    qty           = int(cfg.get('quantity', 1))
    otype         = cfg.get('orderType', 'market')
    strike_method    = cfg.get('strikeMethod', 'atm')
    strike_value     = cfg.get('strikeValue', '')
    strike_direction = cfg.get('strikeDirection', 'auto')  # 'auto'|'above'|'below'
    strike_fallback  = cfg.get('strikeFallback', 'closest')  # 'closest'|'skip'
    # Price range filter (backward-compat: old limitPrice maps to min for credit, max for debit)
    _old_lp          = float(cfg.get('limitPrice') or 0)
    limit_price_min  = float(cfg.get('limitPriceMin') or (_old_lp if _old_lp else 0))
    limit_price_max  = float(cfg.get('limitPriceMax') or 0)
    spread_width  = float(cfg.get('spreadWidth', 5))
    l2_method     = cfg.get('leg2StrikeMethod', 'spread_width')
    l2_value      = cfg.get('leg2StrikeValue',  '')
    l2_dir        = cfg.get('leg2Direction',     'below')
    put_width     = float(cfg.get('putWidth', 5))
    call_width    = float(cfg.get('callWidth', 5))

    # ── Strategy-level limits ─────────────────────────────────────────
    _alloc       = float(cfg.get('_allocation') or 0)
    _max_pos     = int(cfg.get('_max_positions') or 0)
    _strat_tag   = (cfg.get('_strategy_tag') or '').strip()
    _strat_syms  = [s.upper() for s in (cfg.get('_strategy_symbols') or []) if s]

    # Fetch positions (and orders for count check) once, reuse in closures.
    # max_positions is scoped to THIS strategy:
    #   - orders: filter to those tagged with this strategy
    #   - positions: filter to underlyings traded by this strategy (Tradier
    #     doesn't echo our tag onto resulting positions, so we approximate
    #     strategy-ownership via underlying symbol).
    _cached_positions = None
    if _max_pos > 0 or _alloc > 0:
        _cached_positions = _get_positions(api_key, base_url, account_id)

    def _pos_underlying(p):
        sym = str(p.get('symbol', '') or '').upper()
        # OCC: ROOT + YYMMDD + C/P + STRIKE(8) → take chars before the 6-digit date
        import re as _re
        m = _re.match(r'^([A-Z]+)\d{6}[CP]\d{8}$', sym)
        return m.group(1) if m else sym

    def _sym_matches_strat(sym):
        """True if *sym* matches any declared strategy underlying.

        Uses prefix matching so that SPX (declared) matches SPXW (option root
        used by Tradier for SPX weeklies), and similar root variants.
        Checks both directions: declared sym is a prefix of the order sym, or
        the order sym is a prefix of the declared sym (handles cases where the
        user typed the full root but the order carries the base ticker).
        """
        sym_up = str(sym or '').upper()
        for s in _strat_syms:
            if sym_up == s or sym_up.startswith(s) or s.startswith(sym_up):
                return True
        return False

    def _strategy_positions(positions):
        if not _strat_syms:
            return positions   # no symbols declared → fall back to all
        return [p for p in positions if _sym_matches_strat(_pos_underlying(p))]

    def _strategy_orders(orders):
        # Primary: filter by underlying symbol (reliable — Tradier always
        # includes the symbol field; the tag field is sometimes absent in
        # sandbox responses and on orders placed before tagging was added).
        # Use prefix matching to handle SPX→SPXW and similar root variants.
        if _strat_syms:
            return [o for o in orders
                    if _sym_matches_strat(str(o.get('symbol', '') or '').upper())]
        # Fallback when no symbols declared: try tag match, else all orders.
        if _strat_tag:
            return [o for o in orders
                    if str(o.get('tag', '') or '').strip() == _strat_tag]
        return orders

    if _max_pos > 0:
        # Count TRADES, not legs.
        #
        # Multi-leg strategies (spreads, condors) create multiple Tradier
        # position records per order — e.g. a 2-leg spread opens 2 positions.
        # Counting positions naively would block the 2nd trade after just 1.
        #
        # Correct model:
        #   active_trades = (filled orders whose legs are still live positions)
        #                 + (pending/open orders = trades in flight)
        #
        # A filled order is "still alive" if at least one of its leg option
        # symbols is still present in the current positions list.
        _live_pos_syms = {str(p.get('symbol', '') or '').upper()
                          for p in (_cached_positions or [])}

        _all_orders  = _get_all_orders(api_key, base_url, account_id)
        _open_orders = _get_open_orders(api_key, base_url, account_id)

        # Pending trades: open/pending orders scoped to this strategy
        _pending = [o for o in _open_orders
                    if _sym_matches_strat(str(o.get('symbol', '') or '').upper())]
        _pending_ct = len(_pending)

        # Active filled trades: each filled order counts as 1 trade if any
        # of its legs still appear in the live positions list.
        _active_filled = 0
        for _o in _all_orders:
            if str(_o.get('status', '') or '') != 'filled':
                continue
            if not _sym_matches_strat(str(_o.get('symbol', '') or '').upper()):
                continue
            _legs = _o.get('leg', [])
            if isinstance(_legs, dict):
                _legs = [_legs]
            if _legs:
                _leg_syms = {
                    str(lg.get('option_symbol') or lg.get('symbol', '') or '').upper()
                    for lg in _legs
                }
            else:
                _s = str(_o.get('option_symbol') or _o.get('symbol', '') or '').upper()
                _leg_syms = {_s} if _s else set()
            if _leg_syms & _live_pos_syms:   # at least one leg still open
                _active_filled += 1

        total_count = _active_filled + _pending_ct
        if total_count >= _max_pos:
            return False, (
                f"Max position cap reached for strategy: "
                f"{total_count}/{_max_pos} "
                f"({_active_filled} active trades, {_pending_ct} pending orders)"
            )

    # ── Fetch expiration ──────────────────────────────────────────────
    exp_data = _tradier(_mkey, _murl, '/markets/options/expirations',
                        params={'symbol': symbol, 'includeAllRoots': 'true', 'strikes': 'false'})
    if not exp_data:
        return False, "Could not fetch expirations"
    raw_exps = exp_data.get('expirations', {}).get('date', [])
    if isinstance(raw_exps, str):
        raw_exps = [raw_exps]
    exps = sorted(raw_exps or [])
    if not exps:
        return False, "No expirations available"

    today = _now_et().date()
    target_exp = next(
        (e for e in exps
         if (datetime.strptime(e, '%Y-%m-%d').date() - today).days >= dte),
        exps[-1]
    )

    # ── Fetch chain + underlying price ───────────────────────────────
    chain_data = _tradier(_mkey, _murl, '/markets/options/chains',
                          params={'symbol': symbol, 'expiration': target_exp, 'greeks': 'true'})
    if not chain_data:
        return False, "Could not fetch option chain"
    all_opts = chain_data.get('options', {}).get('option', [])
    if isinstance(all_opts, dict):
        all_opts = [all_opts]
    all_opts = all_opts or []

    q = _tradier(_mkey, _murl, '/markets/quotes',
                 params={'symbols': symbol, 'greeks': 'false'})
    underlying = float(((q or {}).get('quotes', {}).get('quote') or {}).get('last', 0) or 0)

    import re as _re
    def _opt_root(o):
        m = _re.match(r'^([A-Z]+)\d', o.get('symbol', ''))
        return m.group(1) if m else ''

    all_puts  = sorted([o for o in all_opts if o.get('option_type') == 'put'],
                       key=lambda o: float(o.get('strike', 0)))
    all_calls = sorted([o for o in all_opts if o.get('option_type') == 'call'],
                       key=lambda o: float(o.get('strike', 0)))

    # Prefer options whose root matches the configured symbol exactly to avoid
    # mixing roots (e.g. SPX vs SPXW) in the same spread order.
    puts_matched  = [o for o in all_puts  if _opt_root(o) == symbol]
    calls_matched = [o for o in all_calls if _opt_root(o) == symbol]
    puts  = puts_matched  or all_puts
    calls = calls_matched or all_calls

    # ── Strike helpers ────────────────────────────────────────────────
    def _atm(options):
        return min(options, key=lambda o: abs(float(o.get('strike', 0)) - underlying)) if options else None

    def _by_strike(options, target):
        """Closest available strike to *target* (mathematically nearest)."""
        return min(options, key=lambda o: abs(float(o.get('strike', 0)) - target)) if options else None

    def _by_strike_or_higher(options, target):
        """Lowest available strike that is at or above *target*.
        Falls back to closest in the chain if no strike >= target exists."""
        candidates = [o for o in options if float(o.get('strike', 0)) >= target]
        if candidates:
            return min(candidates, key=lambda o: float(o.get('strike', 0)))
        logger.warning(f"or_higher fallback: no strike >= {target:.2f} in chain; using closest")
        return _by_strike(options, target)

    def _by_strike_or_lower(options, target):
        """Highest available strike that is at or below *target*.
        Falls back to closest in the chain if no strike <= target exists."""
        candidates = [o for o in options if float(o.get('strike', 0)) <= target]
        if candidates:
            return max(candidates, key=lambda o: float(o.get('strike', 0)))
        logger.warning(f"or_lower fallback: no strike <= {target:.2f} in chain; using closest")
        return _by_strike(options, target)

    def _by_delta(options, target_abs):
        return min(options, key=lambda o: abs(abs(float((o.get('greeks') or {}).get('delta', 0) or 0)) - target_abs)) if options else None

    def _resolve_dir(options, explicit_dir):
        """Return True if target should be above underlying, False if below.
        'auto' derives direction from option type (puts→below, calls→above)."""
        if explicit_dir == 'above':
            return True
        if explicit_dir == 'below':
            return False
        # auto: derive from the option type of the first option in the pool
        return (options[0].get('option_type', 'put') if options else 'put') == 'call'

    def _apply_fallback(options, target, direction=None):
        """Route to the correct strike selection function based on *strike_fallback*.

        or_higher  → lowest strike  >= target (round up to next available)
        or_lower   → highest strike <= target (round down to next available)
        skip       → nearest strike, but abort (return None) if it is more
                     than $2 / 0.5% away from the target
        closest    → nearest strike in the chain (default). When an explicit
                     *direction* ('above'/'below') is supplied, the chosen
                     strike is constrained to that side of the target so the
                     direction setting is always honoured — matching the
                     backtest engine. 'above' → lowest strike >= target;
                     'below' → highest strike <= target. This guarantees, e.g.,
                     "Above underlying" never selects a strike below the
                     underlying even when the distance is 0.
        """
        if strike_fallback == 'or_higher':
            return _by_strike_or_higher(options, target)
        if strike_fallback == 'or_lower':
            return _by_strike_or_lower(options, target)
        if strike_fallback == 'skip':
            opt = _by_strike(options, target)
            if opt:
                found = float(opt.get('strike', 0))
                # Skip trade if closest strike is more than $2 or 0.5% away
                tolerance = max(2.0, abs(target) * 0.005)
                if abs(found - target) > tolerance:
                    logger.info(
                        f"skip fallback: closest strike {found} is "
                        f"{abs(found - target):.2f} from target {target:.2f} "
                        f"(tolerance {tolerance:.2f}) — aborting trade"
                    )
                    return None
            return opt
        # 'closest' (default) — honour an explicit direction so the strike
        # stays on the correct side of the target; otherwise nearest in chain.
        if direction == 'above':
            return _by_strike_or_higher(options, target)
        if direction == 'below':
            return _by_strike_or_lower(options, target)
        return _by_strike(options, target)

    # Preserve old name for any callers still using it inside this function scope
    _pick_with_fallback = _apply_fallback

    def _pick(options):
        try:
            if strike_method == 'delta' and strike_value:
                return _by_delta(options, abs(float(strike_value)))
            if strike_method in ('strike', 'fixed_strike') and strike_value:
                return _apply_fallback(options, float(strike_value))
            if strike_method == 'dollar_underlying' and strike_value:
                dist  = float(strike_value)
                above = _resolve_dir(options, strike_direction)
                target = underlying + dist if above else underlying - dist
                return _apply_fallback(options, target, 'above' if above else 'below')
            if strike_method == 'pct_underlying' and strike_value:
                pct   = float(strike_value) / 100
                above = _resolve_dir(options, strike_direction)
                target = underlying * (1 + pct) if above else underlying * (1 - pct)
                return _apply_fallback(options, target, 'above' if above else 'below')
            if strike_method == 'dollar_prev_candle' and strike_value:
                # "$ Distance from Previous Candle": target = a datapoint of the
                # previous (last finished) candle offset by a $ distance, optionally
                # gated by candle colour. Mirrors the options backtester.
                amount    = float(strike_value)
                pc_intv   = cfg.get('prevCandleType', '1min')
                pc_day    = cfg.get('prevCandleDay', 0)
                pc_dp     = cfg.get('prevCandleDatapoint', 'close')
                pc_color  = str(cfg.get('prevCandleColor', 'either')).strip().lower()
                prev_c, _cur = _live_candle_pair(symbol, pc_intv, _mkey, _murl, day=pc_day)
                if prev_c is None:
                    logger.warning("_pick(dollar_prev_candle): no previous candle data — skip")
                    return None
                if pc_color in ('green', 'red'):
                    col = _bot_candle_color(prev_c)
                    if col != pc_color:
                        logger.info(f"_pick(dollar_prev_candle): prev candle is {col}, "
                                    f"need {pc_color} — skip")
                        return None
                ref = _bot_candle_dp(prev_c, pc_dp)
                if ref is None:
                    logger.warning("_pick(dollar_prev_candle): missing candle datapoint — skip")
                    return None
                above = _resolve_dir(options, strike_direction)
                target = ref + amount if above else ref - amount
                logger.info(f"_pick(dollar_prev_candle): prev {pc_intv} {pc_dp}={ref:.2f} "
                            f"{'above' if above else 'below'} ${amount} → target={target:.2f}")
                return _apply_fallback(options, target, 'above' if above else 'below')
            if strike_method in ('dollar_leg', 'pct_leg') and strike_value:
                # Leg-relative not meaningful for Leg 1 — fall through
                pass
            else:
                logger.warning(f"_pick: unrecognised strike_method '{strike_method}'")
        except Exception as e:
            logger.warning(f"_pick({strike_method}): {e}")
        # Exception / unrecognised method path — target is unknown.
        # Abort in all cases: no fallback mode should open at an arbitrary strike.
        logger.warning(
            f"_pick({strike_method}): aborting trade — could not resolve target "
            f"(fallback='{strike_fallback}'). Check strike method configuration."
        )
        return None

    def _pick_leg2(options, leg1_opt, default_below=True):
        """Select Leg 2 strike using the configured l2_method/l2_value/l2_dir.

        All target-based methods route through _apply_fallback so that the
        or_higher / or_lower / skip / closest setting is honoured for Leg 2
        in exactly the same way as Leg 1.  Delta and ATM are directional by
        nature and do not use the rounding fallback.
        """
        l1s = float(leg1_opt.get('strike', 0)) if leg1_opt else 0
        default_target = l1s - spread_width if default_below else l1s + spread_width
        try:
            if l2_method == 'atm':
                return _atm(options)
            elif l2_method == 'delta':
                return _by_delta(options, abs(float(l2_value or 0.3)))
            elif l2_method == 'dollar_underlying':
                dist = float(l2_value or spread_width)
                below = (l2_dir == 'below')
                t = underlying - dist if below else underlying + dist
                return _apply_fallback(options, t, 'below' if below else 'above')
            elif l2_method == 'pct_underlying':
                pct = float(l2_value or 5) / 100
                below = (l2_dir == 'below')
                t = underlying * (1 - pct) if below else underlying * (1 + pct)
                return _apply_fallback(options, t, 'below' if below else 'above')
            elif l2_method == 'dollar_leg1':
                dist = float(l2_value or spread_width)
                below = (l2_dir == 'below')
                t = l1s - dist if below else l1s + dist
                return _apply_fallback(options, t, 'below' if below else 'above')
            elif l2_method == 'pct_leg1':
                pct = float(l2_value or 5) / 100
                below = (l2_dir == 'below')
                t = l1s * (1 - pct) if below else l1s * (1 + pct)
                return _apply_fallback(options, t, 'below' if below else 'above')
            elif l2_method == 'fixed_strike':
                return _apply_fallback(options, float(l2_value or 0))
            else:  # spread_width (default)
                return _apply_fallback(options, default_target,
                                       'below' if default_below else 'above')
        except Exception as e:
            logger.warning(f"_pick_leg2({l2_method}): {e}")
            return _by_strike(options, default_target)

    def _mid(opt):
        return round((float(opt.get('bid', 0) or 0) + float(opt.get('ask', 0) or 0)) / 2, 2)

    def _check_price_range(net, is_credit_trade):
        """Return (ok, msg). Range filter is only active for market orders;
        credit/debit order types are already limit orders — no pre-filter needed."""
        if otype != 'market':
            return True, ''
        if is_credit_trade:
            if limit_price_min > 0 and net < limit_price_min:
                return False, f"Net credit ${net:.2f} below minimum ${limit_price_min:.2f} — skipping"
            if limit_price_max > 0 and net > limit_price_max:
                return False, f"Net credit ${net:.2f} above maximum ${limit_price_max:.2f} — skipping"
        else:
            if limit_price_max > 0 and net > limit_price_max:
                return False, f"Net debit ${net:.2f} exceeds maximum ${limit_price_max:.2f} — skipping"
            if limit_price_min > 0 and net < limit_price_min:
                return False, f"Net debit ${net:.2f} below minimum ${limit_price_min:.2f} — skipping"
        return True, ''

    def _limit_order_price(is_credit_trade):
        """Return the limit price to submit, or 0 to use mid."""
        return limit_price_min if is_credit_trade else limit_price_max

    def _place(order_data):
        # Step-level user tag (e.g. "ABC") takes highest priority — it drives
        # the condition-step position_count and close_position tag filter.
        # Falls back to the strategy-level tag, then to the options strategy
        # type name so every order always carries a meaningful identifier.
        user_tag      = (cfg.get('tag') or '').strip()
        effective_tag = (user_tag or _strat_tag or
                         (strategy or '').strip().replace(' ', '-').replace('_', '-'))
        order_data.setdefault('tag', (effective_tag or 'strategy')[:256])
        result, err = _tradier(api_key, base_url, f'/accounts/{account_id}/orders',
                               method='POST', data=order_data, _return_error=True)
        if result and (result.get('order') or {}).get('id'):
            order_id = result['order']['id']
            # If this order carries a user-defined step tag, persist the
            # option symbols NOW, keyed by order_id for accurate trade counting.
            # We cannot rely on Tradier to return the tag field on GET /orders.
            if user_tag:
                placed_syms = []
                for k, v in order_data.items():
                    if 'option_symbol' in k and v:
                        placed_syms.append(str(v))
                # Single-leg orders use 'option_symbol' without index suffix
                single_sym = order_data.get('option_symbol')
                if single_sym and single_sym not in placed_syms:
                    placed_syms.append(str(single_sym))
                if placed_syms:
                    _register_tag_symbols(account_id, user_tag, placed_syms,
                                          order_id=order_id)
                    logger.info(
                        f"_place: tag='{user_tag}' order={order_id} "
                        f"→ stored {len(placed_syms)} symbol(s) in bot_tag_map"
                    )
                else:
                    logger.warning(
                        f"_place: tag='{user_tag}' order={order_id} "
                        f"but no option_symbol keys found in order_data — "
                        f"tag will not be trackable by condition/close steps"
                    )
            return True, f"Order {order_id} placed ({target_exp})"
        logger.warning(f"_place: order rejected — err={err!r} result={result!r}")
        return False, f"Order rejected: {err or result}"

    def _place_single(opt, side):
        """Place one plain option leg (class=option).

        Tradier single-leg orders accept type=market|limit|stop|stop_limit.
        debit/credit are MULTILEG-only — map them to limit for singles.
        """
        is_limit_single = otype in ('limit', 'debit', 'credit')
        o = {
            'class': 'option', 'symbol': symbol,
            'option_symbol': opt['symbol'], 'side': side,
            'quantity': str(qty),
            'type': 'limit' if is_limit_single else 'market',
            'duration': 'day',
        }
        if o['type'] == 'limit':
            o['price'] = str(_mid(opt))
        return _place(o)

    # ── SINGLE-LEG ───────────────────────────────────────────────────
    single_map = {
        'Long Call':        (calls, 'buy_to_open',  False),
        'Long Put':         (puts,  'buy_to_open',  False),
        'Naked Short Call': (calls, 'sell_to_open', True),
        'Short Put':        (puts,  'sell_to_open', True),
    }
    if strategy in single_map:
        pool, side, is_credit_sl = single_map[strategy]
        opt = _pick(pool)
        if not opt or not opt.get('symbol'):
            return False, f"No options found for {strategy}"
        net_sl = _mid(opt)
        ok, msg = _check_price_range(net_sl, is_credit_sl)
        if not ok:
            return False, msg
        lp_sl = _limit_order_price(is_credit_sl)
        # Tradier single-leg only accepts market|limit|stop|stop_limit.
        # debit/credit are valid only for multileg, so collapse them to limit
        # (with price = user-supplied debit/credit price, or mid as fallback).
        is_limit_single = otype in ('limit', 'debit', 'credit')
        order = {
            'class': 'option', 'symbol': symbol,
            'option_symbol': opt['symbol'], 'side': side,
            'quantity': str(qty),
            'type': 'limit' if is_limit_single else 'market',
            'duration': 'day',
        }
        if is_limit_single:
            order['price'] = str(lp_sl) if lp_sl > 0 else str(net_sl)
        return _place(order)

    # ── VERTICAL SPREADS ─────────────────────────────────────────────
    def _vertical(short_opt, long_opt, is_credit):
        if not short_opt or not long_opt:
            return False, "Could not find required strikes for spread"
        if not short_opt.get('symbol') or not long_opt.get('symbol'):
            return False, "Option symbols missing for spread legs"
        net = max(0.01, round(abs(_mid(short_opt) - _mid(long_opt)), 2))

        # Price range filter.  A MARKET order does NOT fill at the mid: the leg
        # you sell fills near the BID and the leg you buy fills near the ASK, so
        # the credit you actually receive (or debit you pay) is worse than the
        # mid estimate.  Check the filter against that conservative, executable
        # net so a "min credit" reflects what a market order can really fill at
        # — otherwise a tight spread can slip in far below the minimum.
        if otype == 'market':
            sb = float(short_opt.get('bid', 0) or 0)   # leg we SELL → fills ≈ bid
            la = float(long_opt.get('ask', 0) or 0)    # leg we BUY  → fills ≈ ask
            exec_net = round(sb - la if is_credit else la - sb, 2)
            ok, msg = _check_price_range(exec_net, is_credit)
        else:
            ok, msg = _check_price_range(net, is_credit)
        if not ok:
            return False, msg

        # Allocation check: capital at risk = width*qty*100 - credit (for credit spreads)
        #                                    = debit*qty*100            (for debit spreads)
        if _alloc > 0 and _cached_positions is not None:
            new_risk  = qty * 100 * (max(0.0, spread_width - net) if is_credit else net)
            used      = _calc_used_allocation(_cached_positions)
            remaining = _alloc - used
            if new_risk > remaining:
                return False, (
                    f"Allocation limit: ${used:.0f} already committed, "
                    f"${new_risk:.0f} new risk exceeds "
                    f"${remaining:.0f} remaining of ${_alloc:.0f} budget"
                )

        order = {
            'class': 'multileg', 'symbol': symbol, 'duration': 'day',
            'type': 'market',
            'option_symbol[0]': short_opt['symbol'],
            'side[0]': 'sell_to_open',
            'quantity[0]': str(qty),
            'option_symbol[1]': long_opt['symbol'],
            'side[1]': 'buy_to_open',
            'quantity[1]': str(qty),
        }
        if otype in ('limit', 'credit', 'debit'):
            order['type'] = 'credit' if is_credit else 'debit'
            lp = _limit_order_price(is_credit)
            order['price'] = str(lp) if lp > 0 else str(net)
        return _place(order)

    if strategy == 'Short Put Spread':
        sp = _pick(puts)
        if not sp:
            return False, "No put options found"
        lp = _pick_leg2(puts, sp, default_below=True)
        return _vertical(sp, lp, is_credit=True)

    if strategy == 'Short Call Spread':
        sc = _pick(calls)
        if not sc:
            return False, "No call options found"
        lc = _pick_leg2(calls, sc, default_below=False)
        return _vertical(sc, lc, is_credit=True)

    if strategy == 'Long Put Spread':
        lp = _pick(puts)
        if not lp:
            return False, "No put options found"
        sp = _pick_leg2(puts, lp, default_below=True)
        return _vertical(sp, lp, is_credit=False)

    if strategy == 'Long Call Spread':
        lc = _pick(calls)
        if not lc:
            return False, "No call options found"
        sc = _pick_leg2(calls, lc, default_below=False)
        return _vertical(sc, lc, is_credit=False)

    # ── IRON STRUCTURES ──────────────────────────────────────────────
    if strategy in ('Short Iron Condor', 'Short Iron Butterfly',
                    'Long Iron Condor',  'Long Iron Butterfly'):
        is_short = strategy.startswith('Short')
        sp = _pick(puts)
        sc = _pick(calls)
        if not sp or not sc:
            return False, "Could not find ATM options for iron structure"
        lp = _by_strike(puts,  float(sp.get('strike', 0)) - put_width)
        lc = _by_strike(calls, float(sc.get('strike', 0)) + call_width)
        if not all(o and o.get('symbol') for o in [sp, sc, lp, lc]):
            return False, "Could not resolve all four legs"
        net = max(0.01, round((_mid(sp) + _mid(sc)) - (_mid(lp) + _mid(lc)), 2))

        # Price range filter for iron structures
        ok, msg = _check_price_range(net, is_short)
        if not ok:
            return False, msg

        # Allocation check: max loss = max(put_width, call_width)*qty*100 - credit
        if _alloc > 0 and _cached_positions is not None:
            max_wing  = max(put_width, call_width)
            new_risk  = qty * 100 * (max(0.0, max_wing - net) if is_short else net)
            used      = _calc_used_allocation(_cached_positions)
            remaining = _alloc - used
            if new_risk > remaining:
                return False, (
                    f"Allocation limit: ${used:.0f} already committed, "
                    f"${new_risk:.0f} new risk exceeds "
                    f"${remaining:.0f} remaining of ${_alloc:.0f} budget"
                )

        order = {
            'class': 'multileg', 'symbol': symbol, 'duration': 'day',
            'type': 'market',
            'option_symbol[0]': sp['symbol'], 'side[0]': 'sell_to_open', 'quantity[0]': str(qty),
            'option_symbol[1]': lp['symbol'], 'side[1]': 'buy_to_open',  'quantity[1]': str(qty),
            'option_symbol[2]': sc['symbol'], 'side[2]': 'sell_to_open', 'quantity[2]': str(qty),
            'option_symbol[3]': lc['symbol'], 'side[3]': 'buy_to_open',  'quantity[3]': str(qty),
        }
        if otype in ('limit', 'credit', 'debit'):
            order['type'] = 'credit' if is_short else 'debit'
            lp = _limit_order_price(is_short)
            order['price'] = str(lp) if lp > 0 else str(net)
        return _place(order)

    # ── Straddle / Strangle ───────────────────────────────────────────
    if strategy in ('Long Straddle', 'Short Straddle'):
        sp = _atm(puts)
        sc = _atm(calls)
        if not sp or not sc or not sp.get('symbol') or not sc.get('symbol'):
            return False, "Could not find ATM options for straddle"
        is_credit_st = (strategy == 'Short Straddle')
        net = max(0.01, round(_mid(sp) + _mid(sc), 2))
        ok, msg = _check_price_range(net, is_credit_st)
        if not ok:
            return False, msg
        order = {
            'class': 'multileg', 'symbol': symbol, 'duration': 'day',
            'type': 'market',
            'option_symbol[0]': sp['symbol'],
            'side[0]': 'sell_to_open' if is_credit_st else 'buy_to_open',
            'quantity[0]': str(qty),
            'option_symbol[1]': sc['symbol'],
            'side[1]': 'sell_to_open' if is_credit_st else 'buy_to_open',
            'quantity[1]': str(qty),
        }
        if otype in ('limit', 'credit', 'debit'):
            order['type'] = 'credit' if is_credit_st else 'debit'
            lp = _limit_order_price(is_credit_st)
            order['price'] = str(lp) if lp > 0 else str(net)
        return _place(order)

    # ── Strangle ─────────────────────────────────────────────────────
    if strategy in ('Long Strangle', 'Short Strangle'):
        is_credit_sg = (strategy == 'Short Strangle')
        put_side  = 'sell_to_open' if is_credit_sg else 'buy_to_open'
        call_side = 'sell_to_open' if is_credit_sg else 'buy_to_open'
        # Short put + short call (or long put + long call) both OTM by spread_width
        sg_put  = _by_strike(puts,  underlying - spread_width)
        sg_call = _by_strike(calls, underlying + spread_width)
        if not sg_put or not sg_call or not sg_put.get('symbol') or not sg_call.get('symbol'):
            return False, "Could not find OTM options for strangle"
        net_sg = max(0.01, round(_mid(sg_put) + _mid(sg_call), 2))
        ok, msg = _check_price_range(net_sg, is_credit_sg)
        if not ok:
            return False, msg
        order = {
            'class': 'multileg', 'symbol': symbol, 'duration': 'day',
            'type': 'market',
            'option_symbol[0]': sg_put['symbol'],  'side[0]': put_side,  'quantity[0]': str(qty),
            'option_symbol[1]': sg_call['symbol'], 'side[1]': call_side, 'quantity[1]': str(qty),
        }
        if otype in ('limit', 'credit', 'debit'):
            order['type'] = 'credit' if is_credit_sg else 'debit'
            lp = _limit_order_price(is_credit_sg)
            order['price'] = str(lp) if lp > 0 else str(net_sg)
        return _place(order)

    if strategy in ('Calendar Call Spread', 'Calendar Put Spread',
                    'Diagonal Call Spread', 'Diagonal Put Spread',
                    'Double Calendar',      'Double Diagonal'):
        return False, "Calendar/diagonal spreads require per-leg DTE — not yet supported in bot executor"

    # ── EQUITY ────────────────────────────────────────────────────────
    if strategy in ('Buy Equity', 'Sell Equity Short'):
        side  = 'buy' if strategy == 'Buy Equity' else 'sell_short'
        etype = otype if otype in ('market', 'limit') else 'market'
        order = {
            'class':    'equity',
            'symbol':   symbol,
            'side':     side,
            'quantity': str(qty),
            'type':     etype,
            'duration': 'day',
        }
        if etype == 'limit':
            limit_price = limit_price_min or 0
            if not limit_price:
                q = _tradier(_mkey, _murl, '/markets/quotes',
                             params={'symbols': symbol, 'greeks': 'false'})
                limit_price = float(
                    ((q or {}).get('quotes', {}).get('quote') or {}).get('last', 0) or 0
                )
            if limit_price:
                order['price'] = str(round(limit_price, 2))
            else:
                return False, f"Could not determine limit price for {symbol}"
        return _place(order)

    return False, f"Strategy '{strategy}' is not supported in the bot executor"


def exec_close_position(cfg, api_key, base_url, account_id,
                        mkt_api_key=None, mkt_base_url=None):
    import re as _re
    # Market-data reads (quotes for profit/loss filtering) use live creds
    # (_mkey/_murl). ORDER placement stays on api_key/base_url (sandbox in
    # paper mode).
    _mkey = mkt_api_key or api_key
    _murl = mkt_base_url or base_url

    order_tag  = cfg.get('tag', '').strip()             # user-defined position tag (e.g. "ABC")
    target     = cfg.get('target', 'all').strip()       # all | profitable | losers
    strat_syms = [s.upper() for s in (cfg.get('_strategy_symbols') or []) if s]

    def _pos_root(sym):
        """Extract option root (underlying) from an OCC symbol, else return sym."""
        m = _re.match(r'^([A-Z]+)\d{6}[CP]\d{8}$', str(sym).upper())
        return m.group(1) if m else str(sym).upper()

    def _root_matches_strat(root):
        """Prefix-aware check: 'SPXW' matches declared strat sym 'SPX', etc."""
        r = root.upper()
        for s in strat_syms:
            if r == s or r.startswith(s) or s.startswith(r):
                return True
        return False

    if order_tag:
        # Resolve positions via order-tag tracking: look at all orders carrying
        # this tag, extract their filled symbols, match against live positions.
        # This is the correct way because Tradier does NOT copy order tags onto
        # the resulting position records.
        positions, _ = _resolve_tag_positions(order_tag, api_key, base_url, account_id)
    else:
        # No tag → close all positions scoped to this strategy's underlyings.
        # Use prefix matching so that a strategy configured for "SPX" also
        # matches SPXW positions (Tradier uses SPXW as the option root for
        # SPX weeklies/dailies).
        positions = _get_positions(api_key, base_url, account_id)
        if strat_syms:
            positions = [p for p in positions
                         if _root_matches_strat(_pos_root(p.get('symbol', '')))]

    # Target filter: profitable or losers only
    if target in ('profitable', 'losers'):
        kept = []
        for pos in positions:
            sym  = pos.get('symbol', '')
            qty  = float(pos.get('quantity', 0))
            cost = float(pos.get('cost_basis', 0))
            q    = _tradier(_mkey, _murl, '/markets/quotes',
                            params={'symbols': sym, 'greeks': 'false'})
            last = float(((q or {}).get('quotes', {}).get('quote') or {}).get('last', 0) or 0)
            is_opt = bool(_re.match(r'^[A-Z]+\d{6}[CP]\d{8}$', sym.upper()))
            mult   = 100 if is_opt else 1
            curr_val = last * abs(qty) * mult
            # Long position: profit = current value - what was paid
            # Short position: profit = credit received - current cost to close
            pnl = (curr_val - cost) if qty > 0 else (abs(cost) - curr_val)
            if (target == 'profitable' and pnl > 0) or (target == 'losers' and pnl <= 0):
                kept.append(pos)
        positions = kept

    count = 0
    for pos in positions:
        sym = pos.get('symbol', '')
        qty = abs(int(pos.get('quantity', 0)))
        if qty == 0:
            continue
        side   = 'sell_to_close' if int(pos.get('quantity', 0)) > 0 else 'buy_to_close'
        is_opt = bool(_re.match(r'^[A-Z]+\d{6}[CP]\d{8}$', sym.upper()))
        if is_opt:
            _tradier(api_key, base_url, f'/accounts/{account_id}/orders',
                     method='POST', data={
                         'class': 'option', 'symbol': _pos_root(sym),
                         'option_symbol': sym, 'side': side,
                         'quantity': str(qty), 'type': 'market', 'duration': 'day',
                     })
        else:
            equity_side = 'sell' if side == 'sell_to_close' else 'buy'
            _tradier(api_key, base_url, f'/accounts/{account_id}/orders',
                     method='POST', data={
                         'class': 'equity', 'symbol': sym,
                         'side': equity_side,
                         'quantity': str(qty), 'type': 'market', 'duration': 'day',
                     })
        count += 1
    return True, f"Close submitted for {count} position(s)"


def exec_notification(cfg, user_id, app):
    message = cfg.get('message', 'Bot strategy triggered')
    channel = cfg.get('channel', 'email')
    try:
        with app.app_context():
            from models import UserNotificationChannel
            channels = UserNotificationChannel.query.filter_by(
                user_id=user_id, channel_type=channel, is_active=True).all()
            for ch in channels:
                try:
                    ch_cfg    = json.loads(ch.config_json or '{}')
                    bot_token = ch_cfg.get('bot_token', '')
                    chat_id   = ch_cfg.get('chat_id', '')
                    if channel == 'telegram' and bot_token and chat_id:
                        requests.post(
                            f"https://api.telegram.org/bot{bot_token}/sendMessage",
                            json={'chat_id': chat_id, 'text': f"\U0001f916 Bot: {message}"},
                            timeout=5)
                except Exception as e:
                    logger.warning(f"Notification channel error: {e}")
    except Exception as e:
        logger.error(f"exec_notification error: {e}")
    return True, "Notification sent"


# ── Single strategy runner ───────────────────────────────────────────────────

def _exec_steps_branch(steps, ctx):
    """Recursively execute a list of steps.

    ctx keys: api_key, base_url, account_id, log, n, alloc, max_pos,
              primary_symbol, app, user_id
    Returns (fired: bool, log: list[str]).
    """
    log = ctx['log']
    for step in steps:
        stype = step.get('type')
        scfg  = step.get('config', {})
        ctx['n'] += 1
        n = ctx['n']

        yes_steps  = step.get('yesSteps', [])
        no_steps   = step.get('noSteps',  [])
        has_branch = bool(yes_steps or no_steps)

        if stype == 'time':
            ok = eval_time(scfg)
            log.append(f"[{n}] TIME ({scfg.get('mode')} {scfg.get('time1')}): "
                       f"{'✓ YES' if ok else '✗ NO'}")
            if has_branch:
                return _exec_steps_branch(yes_steps if ok else no_steps, ctx)
            if not ok:
                return False, log

        elif stype == 'condition':
            ok = eval_condition(scfg, ctx['api_key'], ctx['base_url'], ctx['account_id'],
                                mkt_api_key=ctx.get('mkt_api_key'),
                                mkt_base_url=ctx.get('mkt_base_url'))
            _c_tag = scfg.get('tag', '').strip()
            _c_tag_str = f" tag='{_c_tag}'" if _c_tag else ''
            log.append(f"[{n}] CONDITION ({scfg.get('conditionType')}{_c_tag_str} "
                       f"{scfg.get('operator')} {scfg.get('value')}): "
                       f"{'✓ YES' if ok else '✗ NO'}")
            if has_branch:
                return _exec_steps_branch(yes_steps if ok else no_steps, ctx)
            if not ok:
                return False, log

        elif stype == 'metric':
            ok, _m_detail = eval_metric_verbose(
                scfg, ctx['api_key'], ctx['base_url'], ctx['primary_symbol'],
                mkt_api_key=ctx.get('mkt_api_key'),
                mkt_base_url=ctx.get('mkt_base_url'),
                strategy_id=ctx.get('strategy_id'))
            if ok is None:
                log.append(f"[{n}] METRIC ({scfg.get('metric')}): ⚠ skipped"
                           + (f" — {_m_detail}" if _m_detail else ''))
                if has_branch:
                    return _exec_steps_branch(no_steps, ctx)
                return False, log
            log.append(f"[{n}] METRIC ({scfg.get('metric')} "
                       f"{scfg.get('operator')} {scfg.get('value')}): "
                       f"{'✓ YES' if ok else '✗ NO'}"
                       + (f" — {_m_detail}" if _m_detail else ''))
            if has_branch:
                return _exec_steps_branch(yes_steps if ok else no_steps, ctx)
            if not ok:
                return False, log

        elif stype == 'open_position':
            scfg_limited = dict(scfg)
            scfg_limited['_allocation']       = ctx['alloc']
            scfg_limited['_max_positions']    = ctx['max_pos']
            scfg_limited['_strategy_tag']     = ctx.get('strategy_tag', '')
            scfg_limited['_strategy_symbols'] = ctx.get('strategy_symbols', [])
            success, msg = exec_open_position(
                scfg_limited, ctx['api_key'], ctx['base_url'], ctx['account_id'],
                mkt_api_key=ctx.get('mkt_api_key'),
                mkt_base_url=ctx.get('mkt_base_url'))
            log.append(f"[{n}] OPEN_POSITION: {'✓' if success else '✗'} {msg}")
            if not success:
                return False, log

        elif stype == 'close_position':
            scfg_close = dict(scfg)
            scfg_close['_strategy_tag']     = ctx.get('strategy_tag', '')
            scfg_close['_strategy_symbols'] = ctx.get('strategy_symbols', [])
            success, msg = exec_close_position(
                scfg_close, ctx['api_key'], ctx['base_url'], ctx['account_id'],
                mkt_api_key=ctx.get('mkt_api_key'),
                mkt_base_url=ctx.get('mkt_base_url'))
            log.append(f"[{n}] CLOSE_POSITION: {msg}")

        elif stype == 'notification':
            exec_notification(scfg, ctx['user_id'], ctx['app'])
            log.append(f"[{n}] NOTIFICATION: sent")

        elif stype == 'tags':
            log.append(f"[{n}] TAGS: {scfg.get('tag', '')}")

    return True, log


def execute_strategy(cfg, strategy_dict, app):
    """Walk the step tree. Returns (fired: bool, log: list[str])."""
    from models import decrypt_value

    if cfg.mode == 'paper':
        base_url   = TRADIER_PAPER_BASE
        api_key    = (decrypt_value(cfg.paper_api_key_enc)    or '').strip()
        account_id = (decrypt_value(cfg.paper_account_id_enc) or '').strip()
        # Use live-quote key for market data if configured under "Live Quotes" in settings
        _live_mkt_key = (decrypt_value(cfg.paper_live_api_key_enc) or '').strip()
        mkt_api_key   = _live_mkt_key or None
        mkt_base_url  = TRADIER_LIVE_BASE if _live_mkt_key else None
    else:
        base_url   = TRADIER_LIVE_BASE
        api_key    = (decrypt_value(cfg.live_api_key_enc)    or '').strip()
        account_id = (decrypt_value(cfg.live_account_id_enc) or '').strip()
        mkt_api_key  = None
        mkt_base_url = None

    if not api_key or not account_id:
        return False, ["Missing API credentials — check Bot Settings"]

    steps    = strategy_dict.get('steps', [])
    _alloc   = float(strategy_dict.get('allocation') or 0)
    _max_pos = int(strategy_dict.get('max_positions') or 0)

    def _all_steps(ss):
        for s in ss:
            yield s
            yield from _all_steps(s.get('yesSteps', []))
            yield from _all_steps(s.get('noSteps',  []))

    primary_symbol = next(
        (s.get('config', {}).get('symbol', 'SPY')
         for s in _all_steps(steps) if s.get('type') == 'open_position'),
        'SPY'
    )

    # Strategy identity — used to tag orders and to filter positions/orders
    # so that max_positions is enforced at the STRATEGY level, not account-wide.
    _strat_name = (strategy_dict.get('name') or '').strip()
    _strat_id   = strategy_dict.get('id')
    _strat_tag  = _sanitize_strategy_tag(_strat_name, _strat_id)

    # Symbols this strategy trades — used to scope position counts since
    # Tradier doesn't echo our order tag on resulting positions.
    _strat_symbols = sorted({
        (s.get('config', {}).get('symbol') or '').upper().strip()
        for s in _all_steps(steps)
        if s.get('type') == 'open_position'
        and (s.get('config', {}).get('symbol') or '').strip()
    })

    ctx = dict(api_key=api_key, base_url=base_url, account_id=account_id,
               log=[], n=0, alloc=_alloc, max_pos=_max_pos,
               primary_symbol=primary_symbol, app=app, user_id=cfg.user_id,
               mkt_api_key=mkt_api_key, mkt_base_url=mkt_base_url,
               strategy_tag=_strat_tag, strategy_symbols=_strat_symbols,
               strategy_id=_strat_id)
    return _exec_steps_branch(steps, ctx)


# ── Dry-run test runner ──────────────────────────────────────────────────────

def _exec_steps_test(steps, tctx):
    """Recursive test-mode step walker. tctx: api_key, base_url, account_id,
    results, stopped, alloc, max_pos, primary_symbol, app, user_id, dry_run"""
    for step in steps:
        stype  = step.get('type')
        scfg   = step.get('config', {})
        slabel = step.get('label', '')
        dry_run = tctx['dry_run']

        yes_steps  = step.get('yesSteps', [])
        no_steps   = step.get('noSteps',  [])
        has_branch = bool(yes_steps or no_steps)

        if tctx['stopped']:
            tctx['results'].append({'type': stype, 'label': slabel or stype,
                                    'result': None, 'message': 'Not reached'})
            continue

        if stype == 'time':
            ok = eval_time(scfg)
            tctx['results'].append({
                'type': 'time',
                'label': slabel or f"Time: {scfg.get('mode')} {scfg.get('time1')}",
                'result': bool(ok),
                'message': 'Within time window' if ok else 'Outside time window',
                'branch': 'yes' if ok else 'no' if has_branch else None,
            })
            if has_branch:
                _exec_steps_test(yes_steps if ok else no_steps, tctx)
                return
            if not ok:
                tctx['stopped'] = True

        elif stype == 'condition':
            ok = eval_condition(scfg, tctx['api_key'], tctx['base_url'], tctx['account_id'],
                                mkt_api_key=tctx.get('mkt_api_key'),
                                mkt_base_url=tctx.get('mkt_base_url'))
            _ct   = scfg.get('conditionType', 'position_count')
            _ctag = scfg.get('tag', '').strip()
            _cop  = scfg.get('operator', '<')
            _cval = scfg.get('value', 1)
            _ctag_str = f" (tag '{_ctag}')" if _ctag else ''
            _ctype_labels = {
                'position_count': 'Open positions',
                'daily_opens':    'Positions today',
                'unrealized_pnl': 'Unrealized P&L',
                'open_orders':    'Open orders',
                'canceled_orders':'Canceled orders today',
                'closed_today':   'Closed today',
            }
            _cname = _ctype_labels.get(_ct, _ct)
            cond_detail = (f"{_cname}{_ctag_str} {_cop} {_cval} — "
                           f"{'condition met ✓ proceeding' if ok else 'condition not met ✗ stopping'}")
            # When running in preview (dry-run) mode with a tag-based condition
            # that passes, warn the user that the count may be zero simply
            # because no live positions have been opened under this tag yet.
            # Prevent-changes mode skips open_position, so the store is never
            # written and the condition will always pass in preview.
            _cond_note = None
            if ok and _ctag and tctx.get('dry_run'):
                # Check whether any positions have already been tracked for
                # this tag.  _count_active_tag_trades and _get_positions are
                # defined at module level — no import needed.
                _live = {str(p.get('symbol', '') or '').upper()
                         for p in _get_positions(tctx['api_key'], tctx['base_url'],
                                                  tctx['account_id'])}
                _tc   = _count_active_tag_trades(tctx['account_id'], _ctag, _live)
                if _tc == 0:
                    _cond_note = (
                        f"Preview note: tag '{_ctag}' count is 0 — no live positions "
                        f"have been opened under this tag yet, so this condition always "
                        f"passes in preview mode. "
                        f"To fix: uncheck 'Prevent changes' and run once so the bot "
                        f"places a real position; after that, previews will show the "
                        f"correct count and the condition will block correctly."
                    )
            tctx['results'].append({
                'type': 'condition',
                'label': slabel or f"Condition: {_cname}{_ctag_str}",
                'result': bool(ok),
                'message': cond_detail,
                'note':    _cond_note,
                'branch': 'yes' if ok else 'no' if has_branch else None,
            })
            if has_branch:
                _exec_steps_test(yes_steps if ok else no_steps, tctx)
                return
            if not ok:
                tctx['stopped'] = True

        elif stype == 'metric':
            ok, detail = eval_metric_verbose(scfg, tctx['api_key'], tctx['base_url'],
                                             tctx['primary_symbol'],
                                             mkt_api_key=tctx.get('mkt_api_key'),
                                             mkt_base_url=tctx.get('mkt_base_url'))
            if ok is None:
                tctx['results'].append({
                    'type': 'metric',
                    'label': slabel or f"Metric: {scfg.get('metric')}",
                    'result': None,
                    'message': detail or 'Could not evaluate — data unavailable',
                    'branch': 'no' if has_branch else None,
                })
                if has_branch:
                    _exec_steps_test(no_steps, tctx)
                    return
                tctx['stopped'] = True
            else:
                tctx['results'].append({
                    'type': 'metric',
                    'label': slabel or f"Metric: {scfg.get('metric')}",
                    'result': bool(ok),
                    'message': detail or ('Condition met' if ok else 'Condition not met'),
                    'branch': 'yes' if ok else 'no' if has_branch else None,
                })
                if has_branch:
                    _exec_steps_test(yes_steps if ok else no_steps, tctx)
                    return
                if not ok:
                    tctx['stopped'] = True

        elif stype == 'open_position':
            sym       = scfg.get('symbol', '')
            strategy  = scfg.get('strategy', 'Position')
            label_str = slabel or f"{strategy} {sym}".strip()
            if dry_run:
                preview_msg = 'Position skipped to prevent changes to bot.'
                try:
                    equity_strategies = ('Buy Equity', 'Sell Equity Short')
                    if sym and strategy not in equity_strategies:
                        _raw_dte      = scfg.get('dte')
                        dte           = int(_raw_dte) if _raw_dte is not None and _raw_dte != '' else 30
                        strike_method = scfg.get('strikeMethod', 'atm')
                        strike_value  = scfg.get('strikeValue', '')
                        opt_type      = scfg.get('optType', 'call').lower()
                        sw            = float(scfg.get('spreadWidth') or 5)
                        otype_cfg     = scfg.get('orderType', 'market')
                        lp_min        = float(scfg.get('limitPriceMin') or scfg.get('limitPrice') or 0)
                        lp_max        = float(scfg.get('limitPriceMax') or 0)

                        # Strategy classification
                        strat_low = strategy.lower()
                        _CREDIT_STRATS = ('short call spread', 'short put spread',
                                          'short iron condor', 'short iron butterfly',
                                          'short straddle', 'short strangle',
                                          'naked short call', 'naked short put')
                        is_credit_strat = any(s in strat_low for s in _CREDIT_STRATS)
                        is_vertical     = 'spread' in strat_low and 'iron' not in strat_low

                        def _opt_mid(o):
                            return round((float(o.get('bid', 0) or 0) +
                                          float(o.get('ask', 0) or 0)) / 2, 2)

                        exp_data = _tradier(tctx.get('mkt_api_key') or tctx['api_key'],
                                            tctx.get('mkt_base_url') or tctx['base_url'],
                                            '/markets/options/expirations',
                                            params={'symbol': sym, 'includeAllRoots': 'true',
                                                    'strikes': 'false'})
                        if exp_data:
                            raw_exps = exp_data.get('expirations', {}).get('date', [])
                            if isinstance(raw_exps, str):
                                raw_exps = [raw_exps]
                            exps = sorted(raw_exps or [])
                            today = _now_et().date()
                            target_exp = next(
                                (e for e in exps
                                 if (datetime.strptime(e, '%Y-%m-%d').date() - today).days >= dte),
                                exps[-1] if exps else None
                            )
                            if target_exp:
                                q = _tradier(tctx.get('mkt_api_key') or tctx['api_key'],
                                             tctx.get('mkt_base_url') or tctx['base_url'],
                                             '/markets/quotes',
                                             params={'symbols': sym, 'greeks': 'false'})
                                underlying = float(
                                    ((q or {}).get('quotes', {}).get('quote') or {}).get('last', 0) or 0)
                                chain_data = _tradier(tctx.get('mkt_api_key') or tctx['api_key'],
                                                      tctx.get('mkt_base_url') or tctx['base_url'],
                                                      '/markets/options/chains',
                                                      params={'symbol': sym,
                                                              'expiration': target_exp,
                                                              'greeks': 'true'})
                                if chain_data and underlying:
                                    all_opts = chain_data.get('options', {}).get('option', [])
                                    if isinstance(all_opts, dict):
                                        all_opts = [all_opts]
                                    filtered = [o for o in (all_opts or [])
                                                if o.get('option_type') == opt_type]

                                    # Find leg 1 (primary / short leg for credit strategies)
                                    best = None
                                    if strike_method == 'delta' and strike_value:
                                        try:
                                            td   = abs(float(strike_value))
                                            best = min(filtered,
                                                       key=lambda o: abs(abs(float((o.get('greeks') or {}).get('delta', 0) or 0)) - td)
                                                       ) if filtered else None
                                        except Exception:
                                            pass
                                    elif strike_method == 'strike' and strike_value:
                                        try:
                                            ts   = float(strike_value)
                                            best = min(filtered,
                                                       key=lambda o: abs(float(o.get('strike', 0)) - ts)
                                                       ) if filtered else None
                                        except Exception:
                                            pass
                                    if best is None:
                                        best = min(filtered,
                                                   key=lambda o: abs(float(o.get('strike', 0)) - underlying)
                                                   ) if filtered else None

                                    if best:
                                        strike = float(best.get('strike', 0))
                                        mid    = _opt_mid(best)
                                        dte_actual = (
                                            datetime.strptime(target_exp, '%Y-%m-%d').date() - today
                                        ).days

                                        # Find long leg for spreads and compute net
                                        long_strike_val = None
                                        net_price       = mid
                                        if is_vertical:
                                            # Compute the configured long-leg strike from spread width
                                            long_strike_t = (strike + sw) if 'call' in opt_type else (strike - sw)
                                            # Always display configured strikes (not chain-resolved)
                                            long_strike_val = long_strike_t
                                            # Find long leg in chain (exclude same strike to avoid same-option match)
                                            all_same = [o for o in (all_opts or [])
                                                        if o.get('option_type') == opt_type
                                                        and abs(float(o.get('strike', 0)) - strike) > 0.01]
                                            long_leg = min(all_same,
                                                           key=lambda o: abs(float(o.get('strike', 0)) - long_strike_t)
                                                           ) if all_same else None
                                            if long_leg:
                                                net_price = round(abs(mid - _opt_mid(long_leg)), 2)

                                        # Strike label: "7410/7415" for spreads, "7410" for singles
                                        if long_strike_val is not None:
                                            strike_lbl = f"{strike:.0f}/{long_strike_val:.0f}"
                                        else:
                                            strike_lbl = f"{strike:.0f}"

                                        cr_db = 'Credit' if is_credit_strat else 'Debit'

                                        # Price filter note (market orders only)
                                        filter_note = ''
                                        if otype_cfg == 'market' and is_vertical:
                                            if lp_min > 0 and net_price < lp_min:
                                                filter_note = f" < min ${lp_min:.2f} — skipped by filter"
                                            elif lp_max > 0 and net_price > lp_max:
                                                filter_note = f" > max ${lp_max:.2f} — skipped by filter"

                                        if is_vertical:
                                            preview_msg = (
                                                f"{sym} {strategy} {strike_lbl} · {dte_actual}DTE — "
                                                f"{cr_db} ${net_price:.2f}{filter_note}. "
                                                f"Test mode — not executed."
                                            )
                                        else:
                                            preview_msg = (
                                                f"{sym} {strategy} {strike_lbl} · {dte_actual}DTE "
                                                f"@ ${mid:.2f}. Test mode — not executed."
                                            )
                except Exception as e:
                    logger.warning(f"execute_strategy_test open_position preview: {e}")
                tctx['results'].append({
                    'type': 'open_position', 'label': label_str,
                    'result': 'skipped', 'message': preview_msg
                })
            else:
                scfg_limited = dict(scfg)
                scfg_limited['_allocation']       = tctx['alloc']
                scfg_limited['_max_positions']    = tctx['max_pos']
                scfg_limited['_strategy_tag']     = tctx.get('strategy_tag', '')
                scfg_limited['_strategy_symbols'] = tctx.get('strategy_symbols', [])
                success, msg = exec_open_position(
                    scfg_limited, tctx['api_key'], tctx['base_url'], tctx['account_id'],
                    mkt_api_key=tctx.get('mkt_api_key'),
                    mkt_base_url=tctx.get('mkt_base_url'))
                tctx['results'].append({
                    'type': 'open_position', 'label': label_str,
                    'result': bool(success), 'message': msg
                })
                if not success:
                    tctx['stopped'] = True

        elif stype == 'close_position':
            label_str = slabel or f"Close Position {scfg.get('tag', '')}".strip()
            if dry_run:
                tctx['results'].append({
                    'type': 'close_position', 'label': label_str,
                    'result': 'skipped', 'message': 'Position skipped — test mode.'
                })
            else:
                scfg_close = dict(scfg)
                scfg_close['_strategy_tag']     = tctx.get('strategy_tag', '')
                scfg_close['_strategy_symbols'] = tctx.get('strategy_symbols', [])
                success, msg = exec_close_position(
                    scfg_close, tctx['api_key'], tctx['base_url'], tctx['account_id'],
                    mkt_api_key=tctx.get('mkt_api_key'),
                    mkt_base_url=tctx.get('mkt_base_url'))
                tctx['results'].append({'type': 'close_position', 'label': label_str,
                                        'result': bool(success), 'message': msg})

        elif stype == 'notification':
            label_str = slabel or f"Notify: {scfg.get('message', '')[:40]}"
            if dry_run:
                tctx['results'].append({'type': 'notification', 'label': label_str,
                                        'result': 'skipped',
                                        'message': 'Notification skipped — test mode.'})
            else:
                exec_notification(scfg, tctx['user_id'], tctx['app'])
                tctx['results'].append({'type': 'notification', 'label': label_str,
                                        'result': True, 'message': 'Sent'})

        elif stype == 'tags':
            tctx['results'].append({'type': 'tags',
                                    'label': slabel or f"Tags: {scfg.get('tag', '')}",
                                    'result': True, 'message': ''})


def execute_strategy_test(cfg, strategy_dict, app, dry_run=True):
    """Walk step tree for testing. Returns list of structured step results."""
    from models import decrypt_value

    if cfg.mode == 'paper':
        base_url   = TRADIER_PAPER_BASE
        api_key    = (decrypt_value(cfg.paper_api_key_enc)    or '').strip()
        account_id = (decrypt_value(cfg.paper_account_id_enc) or '').strip()
        _live_mkt_key = (decrypt_value(cfg.paper_live_api_key_enc) or '').strip()
        mkt_api_key   = _live_mkt_key or None
        mkt_base_url  = TRADIER_LIVE_BASE if _live_mkt_key else None
    else:
        base_url   = TRADIER_LIVE_BASE
        api_key    = (decrypt_value(cfg.live_api_key_enc)    or '').strip()
        account_id = (decrypt_value(cfg.live_account_id_enc) or '').strip()
        mkt_api_key  = None
        mkt_base_url = None

    if not api_key or not account_id:
        return [{'type': 'error', 'label': 'Missing API credentials',
                 'result': None, 'message': 'Check Bot Settings'}]

    steps    = strategy_dict.get('steps', [])
    _alloc   = float(strategy_dict.get('allocation') or 0)
    _max_pos = int(strategy_dict.get('max_positions') or 0)

    def _all_steps(ss):
        for s in ss:
            yield s
            yield from _all_steps(s.get('yesSteps', []))
            yield from _all_steps(s.get('noSteps',  []))

    primary_symbol = next(
        (s.get('config', {}).get('symbol', 'SPY')
         for s in _all_steps(steps) if s.get('type') == 'open_position'),
        'SPY'
    )

    _strat_tag = _sanitize_strategy_tag(strategy_dict.get('name') or '',
                                        strategy_dict.get('id'))
    _strat_symbols = sorted({
        (s.get('config', {}).get('symbol') or '').upper().strip()
        for s in _all_steps(steps)
        if s.get('type') == 'open_position'
        and (s.get('config', {}).get('symbol') or '').strip()
    })

    tctx = dict(api_key=api_key, base_url=base_url, account_id=account_id,
                results=[], stopped=False, alloc=_alloc, max_pos=_max_pos,
                primary_symbol=primary_symbol, app=app, user_id=cfg.user_id,
                dry_run=dry_run, mkt_api_key=mkt_api_key, mkt_base_url=mkt_base_url,
                strategy_tag=_strat_tag, strategy_symbols=_strat_symbols)
    _exec_steps_test(steps, tctx)
    return tctx['results']


# ── Global scheduler entry point ────────────────────────────────────────────

def execute_all_live_strategies(app):
    """Called every 30 s by APScheduler. Runs any time — strategy Time steps
    control execution windows; no server-side market-hours gate."""

    now = datetime.utcnow()
    try:
        with app.app_context():
            from models import BotConfig, BotStrategy
            from database import db

            live = BotStrategy.query.filter_by(is_live=True).all()
            if not live:
                return

            by_user = {}
            for s in live:
                by_user.setdefault(s.user_id, []).append(s)

            for user_id, strategies in by_user.items():
                cfg = BotConfig.query.filter_by(user_id=user_id).first()
                if not cfg:
                    continue
                poll_sec = int(cfg.poll_interval_sec or 60)

                for strat in strategies:
                    if strat.last_executed_at:
                        elapsed = (now - strat.last_executed_at).total_seconds()
                        if elapsed < poll_sec:
                            continue

                    logger.info(f"Executing '{strat.name}' (user={user_id}, "
                                f"poll={poll_sec}s)")
                    try:
                        steps = json.loads(strat.steps or '[]')
                        fired, log_lines = execute_strategy(
                            cfg, {
                                'id':            strat.id,
                                'name':          strat.name,
                                'steps':         steps,
                                'allocation':    strat.allocation,
                                'max_positions': strat.max_positions,
                            }, app)
                        logger.info(f"  fired={fired} | {' | '.join(log_lines)}")
                    except Exception as e:
                        logger.error(f"Strategy '{strat.name}' execution error: {e}")

                    strat.last_executed_at = now
                    try:
                        db.session.commit()
                    except Exception:
                        db.session.rollback()

    except Exception as e:
        logger.error(f"execute_all_live_strategies: {e}")
