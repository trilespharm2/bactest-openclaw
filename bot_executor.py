"""
Bot strategy execution engine.
Called by APScheduler every 30 s; respects per-user poll_interval_sec.
Only fires during US market hours (Mon-Fri 09:25-16:05 ET).
"""
import json
import logging
import requests
from datetime import datetime, time as dtime

logger = logging.getLogger(__name__)

TRADIER_LIVE_BASE  = 'https://api.tradier.com/v1'
TRADIER_PAPER_BASE = 'https://sandbox.tradier.com/v1'


# ── Low-level Tradier call (no Flask context needed) ────────────────────────

def _tradier(api_key, base_url, path, method='GET', params=None, data=None):
    url     = f"{base_url}{path}"
    headers = {'Authorization': f'Bearer {api_key}', 'Accept': 'application/json'}
    try:
        if method == 'GET':
            r = requests.get(url, headers=headers, params=params or {}, timeout=10)
        elif method == 'POST':
            headers['Content-Type'] = 'application/x-www-form-urlencoded'
            r = requests.post(url, headers=headers, data=data or {}, timeout=10)
        elif method == 'DELETE':
            r = requests.delete(url, headers=headers, timeout=10)
        else:
            return None
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logger.error(f"Tradier {method} {path}: {e}")
        return None


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
    symbol   = (cfg.get('symbol') or 'SPY').upper()
    strategy = cfg.get('strategy', 'Short Put Spread')
    dte      = int(cfg.get('dte', 30))
    qty      = int(cfg.get('quantity', 1))
    otype    = cfg.get('orderType', 'market')

    SINGLE_CALL = ['Long Call']
    SINGLE_PUT  = ['Long Put']
    SHORT_CALL  = ['Naked Short Call']
    SHORT_PUT   = ['Short Put']
    single_strats = SINGLE_CALL + SINGLE_PUT + SHORT_CALL + SHORT_PUT

    if strategy not in single_strats:
        return False, f"Multi-leg '{strategy}' not yet supported — only single-leg executes now"

    op_type = 'call' if strategy in SINGLE_CALL + SHORT_CALL else 'put'
    side    = 'buy_to_open' if strategy in SINGLE_CALL + SINGLE_PUT else 'sell_to_open'

    exp_data = _tradier(api_key, base_url, '/markets/options/expirations',
                        params={'symbol': symbol, 'includeAllRoots': 'true', 'strikes': 'false'})
    if not exp_data:
        return False, "Could not fetch expirations"
    exps = exp_data.get('expirations', {}).get('date', [])
    if not exps:
        return False, "No expirations available"

    today  = _now_et().date()
    target = next(
        (e for e in sorted(exps)
         if (datetime.strptime(e, '%Y-%m-%d').date() - today).days >= dte),
        exps[-1]
    )

    chain_data = _tradier(api_key, base_url, '/markets/options/chains',
                          params={'symbol': symbol, 'expiration': target, 'greeks': 'true'})
    if not chain_data:
        return False, "Could not fetch option chain"
    options = chain_data.get('options', {}).get('option', [])
    if isinstance(options, dict):
        options = [options]
    options = [o for o in (options or []) if o.get('option_type') == op_type]
    if not options:
        return False, f"No {op_type} options for {target}"

    q = _tradier(api_key, base_url, '/markets/quotes',
                 params={'symbols': symbol, 'greeks': 'false'})
    underlying = float(((q or {}).get('quotes', {}).get('quote') or {}).get('last', 0) or 0)

    atm = min(options, key=lambda o: abs(float(o.get('strike', 0)) - underlying))
    option_symbol = atm.get('symbol')
    if not option_symbol:
        return False, "Could not determine ATM option symbol"

    order_data = {
        'class': 'option', 'symbol': symbol, 'option_symbol': option_symbol,
        'side': side, 'quantity': str(qty),
        'type': otype if otype in ('market', 'limit') else 'market',
        'duration': 'day',
    }
    if otype == 'limit':
        mid = (float(atm.get('bid', 0) or 0) + float(atm.get('ask', 0) or 0)) / 2
        order_data['price'] = str(round(mid, 2))

    result = _tradier(api_key, base_url, f'/accounts/{account_id}/orders',
                      method='POST', data=order_data)
    if result and (result.get('order') or {}).get('id'):
        oid = result['order']['id']
        return True, f"Order {oid}: {option_symbol} {side} x{qty}"
    return False, f"Order rejected: {result}"


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
    """Called every 30 s by APScheduler. Skips outside market hours."""
    if not _is_market_hours():
        return

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
