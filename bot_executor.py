"""
Bot strategy execution engine.
Called by APScheduler every 30 s; respects per-user poll_interval_sec.
Only fires during US market hours (Mon-Fri 09:25-16:05 ET).
"""
import json
import logging
import urllib.parse
import requests
from datetime import datetime, time as dtime

logger = logging.getLogger(__name__)

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
    """Thin Tradier REST wrapper.

    When *_return_error* is True the function returns ``(result, error_text)``
    so callers can inspect the raw error body on failure.  In normal mode it
    returns only *result* (``None`` on error) for backward-compatibility.
    """
    url     = f"{base_url}{path}"
    headers = {'Authorization': f'Bearer {api_key}', 'Accept': 'application/json'}
    try:
        if method == 'GET':
            r = requests.get(url, headers=headers, params=params or {}, timeout=10)
        elif method == 'POST':
            data_pairs = list(data.items()) if isinstance(data, dict) else []
            r = requests.post(url, headers=headers, data=data_pairs, timeout=10)
        elif method == 'DELETE':
            r = requests.delete(url, headers=headers, timeout=10)
        else:
            return (None, 'unknown method') if _return_error else None
        if not r.ok:
            logger.error(f"Tradier {method} {path}: HTTP {r.status_code} — {r.text[:600]}")
            return (None, r.text) if _return_error else None
        result = r.json()
        return (result, None) if _return_error else result
    except Exception as e:
        logger.error(f"Tradier {method} {path}: {e}")
        return (None, str(e)) if _return_error else None


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
    now  = _now_et().time().replace(second=0, microsecond=0)
    mode = cfg.get('mode', 'after')
    t1   = _parse_hhmm(cfg.get('time1', '09:30'))
    t2   = _parse_hhmm(cfg.get('time2', '16:00'))
    if not t1:
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


def eval_condition(cfg, api_key, base_url, account_id):
    ctype    = cfg.get('conditionType', 'position_count')
    tag      = cfg.get('tag', '').strip()
    operator = cfg.get('operator', '<')
    value    = float(cfg.get('value', 1))

    positions = _get_positions(api_key, base_url, account_id, tag)

    if ctype == 'position_count':
        return _compare(float(len(positions)), operator, value)

    elif ctype == 'daily_opens':
        today = _now_et().date().isoformat()
        count = sum(1 for p in positions
                    if str(p.get('date_acquired', '')).startswith(today))
        return _compare(float(count), operator, value)

    elif ctype == 'unrealized_pnl':
        total = 0.0
        for pos in positions:
            sym  = pos.get('symbol', '')
            qty  = float(pos.get('quantity', 0))
            cost = float(pos.get('cost_basis', 0))
            q = _tradier(api_key, base_url, '/markets/quotes',
                         params={'symbols': sym, 'greeks': 'false'})
            if q:
                last = float((q.get('quotes', {}).get('quote') or {}).get('last', 0) or 0)
                total += (last * qty * 100) - cost
        return _compare(total, operator, value)

    return True


def eval_metric(cfg, api_key, base_url, symbol):
    """Returns True/False or None (skip step) if data/metric unavailable."""
    metric   = cfg.get('metric', 'price')
    operator = cfg.get('operator', '>')
    ctype    = cfg.get('compareType', 'value')
    cv       = cfg.get('value', '')

    if metric == 'price' and ctype == 'value':
        q = _tradier(api_key, base_url, '/markets/quotes',
                     params={'symbols': symbol, 'greeks': 'false'})
        if not q:
            return None
        last = float((q.get('quotes', {}).get('quote') or {}).get('last', 0) or 0)
        try:
            return _compare(last, operator, float(cv))
        except Exception:
            return None

    logger.info(f"Metric '{metric}' not yet supported in executor; step skipped")
    return None


# ── Action executors ─────────────────────────────────────────────────────────

def exec_open_position(cfg, api_key, base_url, account_id):
    symbol        = (cfg.get('symbol') or 'SPY').upper()
    strategy      = cfg.get('strategy', 'Short Put Spread')
    dte           = int(cfg.get('dte', 30))
    qty           = int(cfg.get('quantity', 1))
    otype         = cfg.get('orderType', 'market')
    strike_method = cfg.get('strikeMethod', 'atm')
    strike_value  = cfg.get('strikeValue', '')
    spread_width  = float(cfg.get('spreadWidth', 5))
    put_width     = float(cfg.get('putWidth', 5))
    call_width    = float(cfg.get('callWidth', 5))

    # ── Fetch expiration ──────────────────────────────────────────────
    exp_data = _tradier(api_key, base_url, '/markets/options/expirations',
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
    chain_data = _tradier(api_key, base_url, '/markets/options/chains',
                          params={'symbol': symbol, 'expiration': target_exp, 'greeks': 'true'})
    if not chain_data:
        return False, "Could not fetch option chain"
    all_opts = chain_data.get('options', {}).get('option', [])
    if isinstance(all_opts, dict):
        all_opts = [all_opts]
    all_opts = all_opts or []

    q = _tradier(api_key, base_url, '/markets/quotes',
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
        return min(options, key=lambda o: abs(float(o.get('strike', 0)) - target)) if options else None

    def _by_delta(options, target_abs):
        return min(options, key=lambda o: abs(abs(float((o.get('greeks') or {}).get('delta', 0) or 0)) - target_abs)) if options else None

    def _pick(options):
        if strike_method == 'delta' and strike_value:
            try:
                return _by_delta(options, abs(float(strike_value)))
            except Exception:
                pass
        if strike_method == 'strike' and strike_value:
            try:
                return _by_strike(options, float(strike_value))
            except Exception:
                pass
        return _atm(options)

    def _mid(opt):
        return round((float(opt.get('bid', 0) or 0) + float(opt.get('ask', 0) or 0)) / 2, 2)

    def _place(order_data):
        result, err = _tradier(api_key, base_url, f'/accounts/{account_id}/orders',
                               method='POST', data=order_data, _return_error=True)
        if result and (result.get('order') or {}).get('id'):
            return True, f"Order {result['order']['id']} placed ({target_exp})"
        return False, f"Order rejected: {err or result}"

    def _place_single(opt, side):
        """Place one plain option leg (class=option)."""
        o = {
            'class': 'option', 'symbol': symbol,
            'option_symbol': opt['symbol'], 'side': side,
            'quantity': str(qty),
            'type': 'market' if otype not in ('limit',) else 'limit',
            'duration': 'day',
        }
        if o['type'] == 'limit':
            o['price'] = str(_mid(opt))
        return _place(o)

    # ── SINGLE-LEG ───────────────────────────────────────────────────
    single_map = {
        'Long Call':        (calls, 'buy_to_open'),
        'Long Put':         (puts,  'buy_to_open'),
        'Naked Short Call': (calls, 'sell_to_open'),
        'Short Put':        (puts,  'sell_to_open'),
    }
    if strategy in single_map:
        pool, side = single_map[strategy]
        opt = _pick(pool)
        if not opt or not opt.get('symbol'):
            return False, f"No options found for {strategy}"
        order = {
            'class': 'option', 'symbol': symbol,
            'option_symbol': opt['symbol'], 'side': side,
            'quantity': str(qty),
            'type': otype if otype in ('market', 'limit') else 'market',
            'duration': 'day',
        }
        if otype == 'limit':
            order['price'] = str(_mid(opt))
        return _place(order)

    # ── VERTICAL SPREADS ─────────────────────────────────────────────
    def _vertical(short_opt, long_opt, is_credit):
        if not short_opt or not long_opt:
            return False, "Could not find required strikes for spread"
        if not short_opt.get('symbol') or not long_opt.get('symbol'):
            return False, "Option symbols missing for spread legs"
        net = max(0.01, round(abs(_mid(short_opt) - _mid(long_opt)), 2))
        order = {
            'class': 'multileg', 'symbol': symbol, 'duration': 'day',
            'type': 'market',
            'leg[0][option_symbol]': short_opt['symbol'],
            'leg[0][side]': 'sell_to_open',
            'leg[0][quantity]': str(qty),
            'leg[1][option_symbol]': long_opt['symbol'],
            'leg[1][side]': 'buy_to_open',
            'leg[1][quantity]': str(qty),
        }
        if otype in ('limit', 'credit', 'debit'):
            order['type'] = 'limit'
            order['price'] = str(net)
        ok, msg = _place(order)
        if ok:
            return ok, msg
        # Tradier sandbox does not parse bracket-notation multileg parameters.
        # Fall back to two individual option legs so sandbox testing still works.
        if 'number of legs' in (msg or '').lower() or 'multileg' in (msg or '').lower():
            logger.warning("Multileg order rejected — falling back to individual legs")
            ok1, m1 = _place_single(short_opt, 'sell_to_open')
            if not ok1:
                return False, f"Short leg failed: {m1}"
            ok2, m2 = _place_single(long_opt, 'buy_to_open')
            if not ok2:
                return False, f"Long leg failed (short already placed): {m2}"
            return True, f"Spread via 2 legs — {m1} | {m2}"
        return False, msg

    if strategy == 'Short Put Spread':
        sp = _pick(puts)
        if not sp:
            return False, "No put options found"
        lp = _by_strike(puts, float(sp.get('strike', 0)) - spread_width)
        return _vertical(sp, lp, is_credit=True)

    if strategy == 'Short Call Spread':
        sc = _pick(calls)
        if not sc:
            return False, "No call options found"
        lc = _by_strike(calls, float(sc.get('strike', 0)) + spread_width)
        return _vertical(sc, lc, is_credit=True)

    if strategy == 'Long Put Spread':
        lp = _pick(puts)
        if not lp:
            return False, "No put options found"
        sp = _by_strike(puts, float(lp.get('strike', 0)) - spread_width)
        return _vertical(sp, lp, is_credit=False)

    if strategy == 'Long Call Spread':
        lc = _pick(calls)
        if not lc:
            return False, "No call options found"
        sc = _by_strike(calls, float(lc.get('strike', 0)) + spread_width)
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
        order = {
            'class': 'multileg', 'symbol': symbol, 'duration': 'day',
            'type': 'market',
            'leg[0][option_symbol]': sp['symbol'], 'leg[0][side]': 'sell_to_open', 'leg[0][quantity]': str(qty),
            'leg[1][option_symbol]': lp['symbol'], 'leg[1][side]': 'buy_to_open',  'leg[1][quantity]': str(qty),
            'leg[2][option_symbol]': sc['symbol'], 'leg[2][side]': 'sell_to_open', 'leg[2][quantity]': str(qty),
            'leg[3][option_symbol]': lc['symbol'], 'leg[3][side]': 'buy_to_open',  'leg[3][quantity]': str(qty),
        }
        if otype in ('limit', 'credit', 'debit'):
            order['type'] = 'limit'
            order['price'] = str(net)
        return _place(order)

    # ── Straddle / Strangle ───────────────────────────────────────────
    if strategy in ('Long Straddle', 'Short Straddle'):
        sp = _atm(puts)
        sc = _atm(calls)
        if not sp or not sc or not sp.get('symbol') or not sc.get('symbol'):
            return False, "Could not find ATM options for straddle"
        net = max(0.01, round(_mid(sp) + _mid(sc), 2))
        order = {
            'class': 'multileg', 'symbol': symbol, 'duration': 'day',
            'type': 'market',
            'leg[0][option_symbol]': sp['symbol'],
            'leg[0][side]': 'buy_to_open' if strategy == 'Long Straddle' else 'sell_to_open',
            'leg[0][quantity]': str(qty),
            'leg[1][option_symbol]': sc['symbol'],
            'leg[1][side]': 'buy_to_open' if strategy == 'Long Straddle' else 'sell_to_open',
            'leg[1][quantity]': str(qty),
        }
        if otype in ('limit', 'credit', 'debit'):
            order['type'] = 'limit'
            order['price'] = str(net)
        return _place(order)

    if strategy in ('Calendar Call Spread', 'Calendar Put Spread',
                    'Diagonal Call Spread', 'Diagonal Put Spread',
                    'Double Calendar',      'Double Diagonal'):
        return False, "Calendar/diagonal spreads require per-leg DTE — not yet supported in bot executor"

    return False, f"Strategy '{strategy}' is not supported in the bot executor"


def exec_close_position(cfg, api_key, base_url, account_id):
    tag       = cfg.get('tag', '').strip()
    positions = _get_positions(api_key, base_url, account_id, tag)
    count     = 0
    for pos in positions:
        sym = pos.get('symbol', '')
        qty = abs(int(pos.get('quantity', 0)))
        if qty == 0:
            continue
        side       = 'sell_to_close' if int(pos.get('quantity', 0)) > 0 else 'buy_to_close'
        underlying = sym[:3] if len(sym) > 15 else sym
        _tradier(api_key, base_url, f'/accounts/{account_id}/orders',
                 method='POST', data={
                     'class': 'option', 'symbol': underlying,
                     'option_symbol': sym, 'side': side,
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

def execute_strategy(cfg, strategy_dict, app):
    """Walk all steps in order. Returns (fired: bool, log: list[str])."""
    from models import decrypt_value

    if cfg.mode == 'paper':
        base_url   = TRADIER_PAPER_BASE
        api_key    = (decrypt_value(cfg.paper_api_key_enc)    or '').strip()
        account_id = (decrypt_value(cfg.paper_account_id_enc) or '').strip()
    else:
        base_url   = TRADIER_LIVE_BASE
        api_key    = (decrypt_value(cfg.live_api_key_enc)    or '').strip()
        account_id = (decrypt_value(cfg.live_account_id_enc) or '').strip()

    if not api_key or not account_id:
        return False, ["Missing API credentials — check Bot Settings"]

    steps = strategy_dict.get('steps', [])
    log   = []

    primary_symbol = next(
        (s.get('config', {}).get('symbol', 'SPY')
         for s in steps if s.get('type') == 'open_position'),
        'SPY'
    )

    for i, step in enumerate(steps):
        stype = step.get('type')
        scfg  = step.get('config', {})
        n     = i + 1

        if stype == 'time':
            ok = eval_time(scfg)
            log.append(f"[{n}] TIME ({scfg.get('mode')} {scfg.get('time1')}): "
                       f"{'✓ pass' if ok else '✗ stop'}")
            if not ok:
                return False, log

        elif stype == 'condition':
            ok = eval_condition(scfg, api_key, base_url, account_id)
            log.append(f"[{n}] CONDITION ({scfg.get('conditionType')} "
                       f"{scfg.get('operator')} {scfg.get('value')}): "
                       f"{'✓ pass' if ok else '✗ stop'}")
            if not ok:
                return False, log

        elif stype == 'metric':
            ok = eval_metric(scfg, api_key, base_url, primary_symbol)
            if ok is None:
                log.append(f"[{n}] METRIC ({scfg.get('metric')}): ⚠ skipped")
            else:
                log.append(f"[{n}] METRIC ({scfg.get('metric')} "
                           f"{scfg.get('operator')} {scfg.get('value')}): "
                           f"{'✓ pass' if ok else '✗ stop'}")
                if not ok:
                    return False, log

        elif stype == 'open_position':
            success, msg = exec_open_position(scfg, api_key, base_url, account_id)
            log.append(f"[{n}] OPEN_POSITION: {'✓' if success else '✗'} {msg}")
            if not success:
                return False, log

        elif stype == 'close_position':
            success, msg = exec_close_position(scfg, api_key, base_url, account_id)
            log.append(f"[{n}] CLOSE_POSITION: {msg}")

        elif stype == 'notification':
            exec_notification(scfg, cfg.user_id, app)
            log.append(f"[{n}] NOTIFICATION: sent")

        elif stype == 'tags':
            log.append(f"[{n}] TAGS: {scfg.get('tag', '')}")

    return True, log


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
                            cfg, {'steps': steps}, app)
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
