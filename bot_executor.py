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


def _ind_sma(closes, period):
    if len(closes) < period:
        return None
    return sum(closes[-period:]) / period


def _ind_ema(closes, period):
    if len(closes) < period:
        return None
    k = 2.0 / (period + 1)
    ema = sum(closes[:period]) / period
    for p in closes[period:]:
        ema = p * k + ema * (1 - k)
    return ema


def _ind_rsi(closes, period=14):
    if len(closes) < period + 1:
        return None
    diffs = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains  = [max(d, 0) for d in diffs[-period:]]
    losses = [max(-d, 0) for d in diffs[-period:]]
    avg_g  = sum(gains)  / period
    avg_l  = sum(losses) / period
    if avg_l == 0:
        return 100.0
    return 100 - 100 / (1 + avg_g / avg_l)


def _ind_roc(closes, period=10):
    if len(closes) < period + 1:
        return None
    return (closes[-1] - closes[-(period + 1)]) / closes[-(period + 1)] * 100


def _ind_macd(closes, short=12, long_=26, signal=9, component='histogram'):
    """Compute MACD value.  component: 'macd_line' | 'signal_line' | 'histogram'."""
    if len(closes) < long_ + signal:
        return None
    k_s   = 2.0 / (short  + 1)
    k_l   = 2.0 / (long_  + 1)
    k_sig = 2.0 / (signal + 1)

    es = sum(closes[:short]) / short
    el = sum(closes[:long_]) / long_
    for c in closes[short:long_]:
        es = c * k_s + es * (1 - k_s)

    macd_series = [es - el]
    for c in closes[long_:]:
        es = c * k_s + es * (1 - k_s)
        el = c * k_l + el * (1 - k_l)
        macd_series.append(es - el)

    if len(macd_series) < signal:
        return None
    macd_val = macd_series[-1]
    if component == 'macd_line':
        return macd_val

    sig_ema = sum(macd_series[:signal]) / signal
    for v in macd_series[signal:]:
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

    if metric == 'price':
        ser_map = {'open': _col('open'), 'high': _col('high'),
                   'low': _col('low'),   'close': closes}
        col = ser_map.get(series, closes)
        return col[-1] if col else None
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
        return _ind_roc(closes, period)
    if metric == 'sma':
        return _ind_sma(closes, period)
    if metric == 'ema':
        return _ind_ema(closes, period)
    if metric == 'rsi':
        return _ind_rsi(closes, period)
    if metric == 'macd':
        return _ind_macd(closes, macd_short, macd_long, macd_signal, macd_comp)
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


def eval_metric(cfg, api_key, base_url, symbol):
    """Returns True/False or None (skip step) if data/metric unavailable."""
    metric      = cfg.get('metric', 'price')
    operator    = cfg.get('operator', '>')
    ctype       = cfg.get('compareType', 'value')
    cv          = cfg.get('value', '')
    period      = int(cfg.get('period') or 14)
    day         = int(cfg.get('day') or 0)
    series      = cfg.get('series', 'close')
    macd_short  = int(cfg.get('macdShort')  or 12)
    macd_long   = int(cfg.get('macdLong')   or 26)
    macd_signal = int(cfg.get('macdSignal') or 9)
    macd_comp   = cfg.get('macdComponent', 'histogram')
    opt_type    = cfg.get('optType', 'call')
    opt_dte     = int(cfg.get('optDte') or 30)

    _OPT_METRICS = ('iv_rank', 'delta', 'theta')

    # ── Compute LHS ──────────────────────────────────────────────────────────
    bars = None   # may be reused for ref indicator
    if metric == 'current_price':
        q = _tradier(api_key, base_url, '/markets/quotes',
                     params={'symbols': symbol, 'greeks': 'false'})
        if not q:
            return None
        lhs = float((q.get('quotes', {}).get('quote') or {}).get('last', 0) or 0)
        if lhs <= 0:
            return None
    elif metric in _OPT_METRICS:
        lhs = _compute_options_metric(metric, symbol, opt_type, opt_dte,
                                      api_key, base_url)
        if lhs is None:
            logger.warning(f"eval_metric: no options data for {metric} on {symbol}")
            return None
    else:
        need = max(period * 3, (macd_long + macd_signal) * 3, 100)
        bars = _fetch_daily_history(symbol, api_key, base_url, bars=need)
        if not bars:
            logger.warning(f"eval_metric: no daily history for {symbol}")
            return None
        lhs = _compute_bar_metric(metric, period, bars, day=day, series=series,
                                  macd_short=macd_short, macd_long=macd_long,
                                  macd_signal=macd_signal, macd_comp=macd_comp)
        if lhs is None:
            logger.warning(f"eval_metric: could not compute {metric} for {symbol}")
            return None

    # ── Compare ──────────────────────────────────────────────────────────────
    if ctype == 'value':
        try:
            rhs = float(cv)
        except (ValueError, TypeError):
            logger.warning(f"eval_metric: invalid fixed value '{cv}'")
            return None
        return _compare(lhs, operator, rhs)

    if ctype == 'indicator':
        ref_metric      = cfg.get('compareIndicator', 'ema')
        ref_period      = int(cfg.get('comparePeriod') or 9)
        ref_day         = int(cfg.get('compareDay') or -1)
        ref_series      = cfg.get('compareSeries', 'close')
        ref_macd_short  = int(cfg.get('refMacdShort')  or 12)
        ref_macd_long   = int(cfg.get('refMacdLong')   or 26)
        ref_macd_signal = int(cfg.get('refMacdSignal') or 9)
        ref_macd_comp   = cfg.get('refMacdComponent', 'histogram')

        if ref_metric == 'current_price':
            q = _tradier(api_key, base_url, '/markets/quotes',
                         params={'symbols': symbol, 'greeks': 'false'})
            rhs = float((q or {}).get('quotes', {}).get('quote', {}).get('last', 0) or 0) if q else None
        elif ref_metric in _OPT_METRICS:
            rhs = _compute_options_metric(ref_metric, symbol, opt_type, opt_dte,
                                          api_key, base_url)
        else:
            if bars is None:
                need = max(ref_period * 3, (ref_macd_long + ref_macd_signal) * 3, 100)
                bars = _fetch_daily_history(symbol, api_key, base_url, bars=need)
            if not bars:
                return None
            rhs = _compute_bar_metric(ref_metric, ref_period, bars,
                                      day=ref_day, series=ref_series,
                                      macd_short=ref_macd_short, macd_long=ref_macd_long,
                                      macd_signal=ref_macd_signal, macd_comp=ref_macd_comp)

        if rhs is None:
            logger.warning(f"eval_metric: could not compute ref {ref_metric}")
            return None
        return _compare(lhs, operator, rhs)

    logger.info(f"eval_metric: compareType '{ctype}' not recognised; step skipped")
    return None


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

    # ── Strategy-level limits ─────────────────────────────────────────
    _alloc    = float(cfg.get('_allocation') or 0)
    _max_pos  = int(cfg.get('_max_positions') or 0)

    # Fetch positions (and orders for count check) once, reuse in closures
    _cached_positions = None
    if _max_pos > 0 or _alloc > 0:
        _cached_positions = _get_positions(api_key, base_url, account_id)

    if _max_pos > 0:
        _cached_orders = _get_open_orders(api_key, base_url, account_id)
        total_count    = len(_cached_positions) + len(_cached_orders)
        if total_count >= _max_pos:
            return False, (
                f"Max position cap reached: {total_count}/{_max_pos}"
                f" (open positions + orders)"
            )

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
        return _place(order)

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
            limit_price = float(cfg.get('limitPrice', 0) or 0)
            if not limit_price:
                q = _tradier(api_key, base_url, '/markets/quotes',
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

    steps   = strategy_dict.get('steps', [])
    log     = []
    # Strategy-level limits forwarded into every open_position step
    _alloc   = float(strategy_dict.get('allocation') or 0)
    _max_pos = int(strategy_dict.get('max_positions') or 0)

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
            scfg_limited = dict(scfg)
            scfg_limited['_allocation']   = _alloc
            scfg_limited['_max_positions'] = _max_pos
            success, msg = exec_open_position(scfg_limited, api_key, base_url, account_id)
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
