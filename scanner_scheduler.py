from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
from datetime import datetime, timedelta
import json
import os
import logging
import requests

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()

FREQUENCY_MAP = {
    '1min': {'minutes': 1},
    '5min': {'minutes': 5},
    '30min': {'minutes': 30},
    '1hr': {'hours': 1},
    '4hr': {'hours': 4},
    '1day': {'days': 1},
    '1week': {'weeks': 1}
}

PRESET_FILTERS = {
    'nasdaq_high_movers': {
        'name': 'NASDAQ High Movers (>75% 1-day)',
        'description': 'Stocks with >75% daily change on NASDAQ',
        'filters': [
            {'type': 'change_percent', 'timeframe': '1day', 'condition': 'above', 'value': 75},
            {'type': 'exchange', 'values': ['NASDAQ']}
        ]
    }
}


def get_interval_trigger(frequency):
    if frequency not in FREQUENCY_MAP:
        frequency = '1hr'
    return IntervalTrigger(**FREQUENCY_MAP[frequency])


flask_app = None

def set_flask_app(app):
    global flask_app
    flask_app = app

def parse_time_string(time_str):
    """Parse time string like '07:00 AM' to hours (0-23)"""
    if not time_str:
        return None
    try:
        parts = time_str.strip().upper().split()
        if len(parts) != 2:
            return None
        time_part, ampm = parts
        hours, minutes = map(int, time_part.split(':'))
        if ampm == 'PM' and hours != 12:
            hours += 12
        elif ampm == 'AM' and hours == 12:
            hours = 0
        return hours + (minutes / 60)
    except:
        return None

def is_within_active_hours(scanner):
    """Check if current time is within scanner's active hours"""
    if not scanner.active_from_time and not scanner.active_to_time:
        return True
    
    from datetime import datetime
    import pytz
    
    now = datetime.now()
    current_hour = now.hour + (now.minute / 60)
    
    from_hour = parse_time_string(scanner.active_from_time)
    to_hour = parse_time_string(scanner.active_to_time)
    
    if from_hour is None and to_hour is None:
        return True
    
    if from_hour is not None and to_hour is not None:
        if from_hour <= to_hour:
            return from_hour <= current_hour <= to_hour
        else:
            return current_hour >= from_hour or current_hour <= to_hour
    elif from_hour is not None:
        return current_hour >= from_hour
    elif to_hour is not None:
        return current_hour <= to_hour
    
    return True

def check_and_deactivate_expired(scanner, db):
    """Check if scanner has expired and deactivate it"""
    if not scanner.expires_at:
        return False
    
    from datetime import date
    if date.today() >= scanner.expires_at:
        logger.info(f"Scanner {scanner.name} has expired, deactivating")
        scanner.is_active = False
        db.session.commit()
        unschedule_scanner(scanner.id)
        return True
    return False


def apply_repeat_symbol_filter(scanner, results):
    """
    Filter out symbols that have appeared too many times consecutively.
    Returns filtered results and updated occurrence counts.
    """
    current_counts = scanner.get_symbol_counts()
    threshold = scanner.repeat_threshold or 5
    
    current_symbols = set()
    for r in results:
        symbol = r.get('ticker') or r.get('name', '')
        if symbol:
            current_symbols.add(symbol.upper())
    
    updated_counts = {}
    for symbol in current_symbols:
        previous_count = current_counts.get(symbol, 0)
        updated_counts[symbol] = previous_count + 1
    
    filtered_results = []
    excluded_symbols = []
    for r in results:
        symbol = (r.get('ticker') or r.get('name', '')).upper()
        if symbol and updated_counts.get(symbol, 0) <= threshold:
            filtered_results.append(r)
        else:
            excluded_symbols.append(symbol)
    
    if excluded_symbols:
        logger.info(f"Excluded {len(excluded_symbols)} symbols due to repeat filter: {excluded_symbols[:5]}...")
    
    return filtered_results, updated_counts


def run_scanner_job(scanner_id, app=None):
    global flask_app
    app_to_use = app or flask_app
    if not app_to_use:
        logger.error(f"No Flask app available for scanner {scanner_id}")
        return
    
    with app_to_use.app_context():
        from models import Scanner, ScannerRun, NotificationDelivery
        from database import db
        
        scanner = Scanner.query.get(scanner_id)
        if not scanner or not scanner.is_active:
            logger.info(f"Scanner {scanner_id} is not active or not found")
            return
        
        if check_and_deactivate_expired(scanner, db):
            return
        
        if not is_within_active_hours(scanner):
            logger.info(f"Scanner {scanner.name} is outside active hours, skipping")
            return
        
        logger.info(f"Running scanner: {scanner.name} (ID: {scanner_id})")
        
        run = ScannerRun(
            scanner_id=scanner_id,
            scanner_name_cached=scanner.name,
            user_id=scanner.user_id,
            started_at=datetime.utcnow(),
            status='running'
        )
        db.session.add(run)
        db.session.commit()
        
        try:
            filter_config = get_filter_config_for_scanner(scanner)
            results = execute_scan(filter_config, scanner.get_symbols_list())
            
            run.finished_at = datetime.utcnow()
            run.status = 'completed'
            run.symbols_found = len(results)
            run.results_json = json.dumps(results)
            
            scanner.last_run_at = datetime.utcnow()
            next_interval = FREQUENCY_MAP.get(scanner.frequency, {'hours': 1})
            scanner.next_run_at = datetime.utcnow() + timedelta(**next_interval)
            
            filtered_results = results
            if scanner.filter_repeat_symbols and results:
                filtered_results, updated_counts = apply_repeat_symbol_filter(
                    scanner, results
                )
                scanner.set_symbol_counts(updated_counts)
                logger.info(f"After repeat filter: {len(filtered_results)} results (was {len(results)})")
            
            db.session.commit()
            
            if filtered_results:
                send_notification(scanner, run, filtered_results)
            else:
                logger.info(f"No results for scanner {scanner.name} after filtering, skipping notification")
                
        except Exception as e:
            logger.error(f"Scanner {scanner_id} failed: {str(e)}")
            run.finished_at = datetime.utcnow()
            run.status = 'error'
            run.error_message = str(e)
            db.session.commit()


def get_filter_config_for_scanner(scanner):
    from database import db
    from sqlalchemy import text
    
    if scanner.filter_type == 'preset':
        preset = PRESET_FILTERS.get(scanner.preset_filter_id)
        if preset:
            return preset['filters']
        return PRESET_FILTERS['nasdaq_high_movers']['filters']
    
    elif scanner.filter_type == 'saved' and scanner.saved_filter_id:
        result = db.session.execute(
            text("SELECT filter_config FROM saved_filters WHERE id = :id"),
            {"id": scanner.saved_filter_id}
        ).fetchone()
        if result:
            return json.loads(result[0])
    
    elif scanner.filter_config_json:
        return json.loads(scanner.filter_config_json)
    
    return PRESET_FILTERS['nasdaq_high_movers']['filters']


def execute_scan(filter_config, specific_symbols=None):
    import math
    try:
        from tradingview_screener_api_complete import TradingViewScreenerAPI
        
        screener = TradingViewScreenerAPI()
        screener.reset()
        
        for f in filter_config:
            result = screener.add_filter(f)
            if not result.get('success'):
                logger.warning(f"Failed to add filter {f.get('filter_id')}: {result.get('error')}")
        
        logger.info(f"Executing scan with filter_config: {filter_config}")
        scan_result = screener.execute_scan(limit=100)
        
        if not scan_result.get('success'):
            logger.error(f"Scan failed: {scan_result.get('error')}")
            return []
        
        results = scan_result.get('results', [])
        logger.info(f"Scan returned {len(results)} matching results")
        
        if not results:
            return []
        
        cleaned_results = []
        min_change_filter = None
        max_change_filter = None
        for f in filter_config:
            filter_type = f.get('type') or f.get('filter_id')
            if filter_type == 'change_percent':
                value = float(f.get('value', 0))
                condition = f.get('condition', 'above')
                if condition == 'above':
                    min_change_filter = value
                else:
                    max_change_filter = value
        
        for r in results:
            cleaned = {}
            for k, v in r.items():
                if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                    cleaned[k] = None
                else:
                    cleaned[k] = v
            
            change = cleaned.get('change', 0) or 0
            if min_change_filter is not None and change < min_change_filter:
                continue
            if max_change_filter is not None and change > max_change_filter:
                continue
            
            cleaned_results.append(cleaned)
        
        logger.info(f"After client-side filtering: {len(cleaned_results)} results (min_change={min_change_filter}, max_change={max_change_filter})")
        
        if specific_symbols:
            specific_symbols_upper = [s.upper() for s in specific_symbols]
            cleaned_results = [r for r in cleaned_results if r.get('name', '').upper() in specific_symbols_upper or 
                      r.get('ticker', '').upper() in specific_symbols_upper]
        
        return cleaned_results[:50]
        
    except Exception as e:
        logger.error(f"Scan execution error: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return []


def send_notification(scanner, run, results):
    from models import db, NotificationDelivery
    
    delivery = NotificationDelivery(
        run_id=run.id,
        channel_type=scanner.channel_type,
        channel_target=scanner.channel_target,
        status='pending'
    )
    db.session.add(delivery)
    db.session.commit()
    
    try:
        if scanner.channel_type == 'email':
            success = send_email_notification(scanner, run, results)
        elif scanner.channel_type == 'telegram':
            success = send_telegram_notification(scanner, run, results)
        else:
            success = False
            delivery.error_message = f"Unknown channel type: {scanner.channel_type}"
        
        if success:
            delivery.status = 'sent'
            delivery.sent_at = datetime.utcnow()
        else:
            delivery.status = 'failed'
            if not delivery.error_message:
                delivery.error_message = "Delivery failed"
        
        db.session.commit()
        
    except Exception as e:
        logger.error(f"Notification delivery error: {str(e)}")
        delivery.status = 'failed'
        delivery.error_message = str(e)
        db.session.commit()


def send_email_notification(scanner, run, results):
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    
    email_to = scanner.channel_target or scanner.user.email
    
    mailtrap_host = os.environ.get('MAILTRAP_HOST', 'sandbox.smtp.mailtrap.io')
    mailtrap_port = int(os.environ.get('MAILTRAP_PORT', 2525))
    mailtrap_username = os.environ.get('MAILTRAP_USERNAME')
    mailtrap_password = os.environ.get('MAILTRAP_PASSWORD')
    
    if not mailtrap_username or not mailtrap_password:
        logger.error("Mailtrap credentials not configured")
        return False
    
    msg = MIMEMultipart('alternative')
    msg['Subject'] = f"Scanner Alert: {scanner.name} - {run.symbols_found} matches"
    msg['From'] = 'scanner@backtestpro.app'
    msg['To'] = email_to
    
    symbols_list = '\n'.join([f"- {r.get('name', r.get('ticker', 'N/A'))}: {r.get('close', 'N/A')} ({r.get('change', 0):.2f}%)" 
                              for r in results[:20]])
    
    text_body = f"""
BacktestPro Scanner Alert

Scanner: {scanner.name}
Time: {run.finished_at.strftime('%Y-%m-%d %H:%M:%S')} UTC
Matches Found: {run.symbols_found}

Results:
{symbols_list}

{'... and more' if len(results) > 20 else ''}

---
Manage your scanners at BacktestPro
"""
    
    html_body = f"""
<html>
<body style="font-family: Arial, sans-serif; padding: 20px;">
    <h2 style="color: #3b7cff;">BacktestPro Scanner Alert</h2>
    <p><strong>Scanner:</strong> {scanner.name}</p>
    <p><strong>Time:</strong> {run.finished_at.strftime('%Y-%m-%d %H:%M:%S')} UTC</p>
    <p><strong>Matches Found:</strong> {run.symbols_found}</p>
    
    <h3>Results</h3>
    <table style="border-collapse: collapse; width: 100%;">
        <tr style="background: #f6f8fb;">
            <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Symbol</th>
            <th style="padding: 8px; text-align: right; border: 1px solid #ddd;">Price</th>
            <th style="padding: 8px; text-align: right; border: 1px solid #ddd;">Change %</th>
        </tr>
        {''.join([f"<tr><td style='padding: 8px; border: 1px solid #ddd;'>{r.get('name', r.get('ticker', 'N/A'))}</td><td style='padding: 8px; text-align: right; border: 1px solid #ddd;'>${r.get('close', 0):.2f}</td><td style='padding: 8px; text-align: right; border: 1px solid #ddd; color: {'green' if r.get('change', 0) > 0 else 'red'};'>{r.get('change', 0):.2f}%</td></tr>" for r in results[:20]])}
    </table>
    
    <p style="margin-top: 20px; color: #666;">Manage your scanners at BacktestPro</p>
</body>
</html>
"""
    
    msg.attach(MIMEText(text_body, 'plain'))
    msg.attach(MIMEText(html_body, 'html'))
    
    try:
        with smtplib.SMTP(mailtrap_host, mailtrap_port) as server:
            server.starttls()
            server.login(mailtrap_username, mailtrap_password)
            server.sendmail('scanner@backtestpro.app', [email_to], msg.as_string())
        logger.info(f"Email sent to {email_to}")
        return True
    except Exception as e:
        logger.error(f"Email send error: {str(e)}")
        return False


def send_telegram_notification(scanner, run, results):
    from models import UserNotificationChannel
    
    channel = UserNotificationChannel.query.filter_by(
        user_id=scanner.user_id,
        channel_type='telegram'
    ).first()
    
    if not channel:
        logger.error(f"No Telegram channel configured for user {scanner.user_id}")
        return False
    
    config = channel.get_config()
    bot_token = config.get('bot_token')
    chat_id = config.get('chat_id')
    
    if not bot_token or not chat_id:
        logger.error("Telegram bot_token or chat_id not configured")
        return False
    
    symbols_text = '\n'.join([f"• {r.get('name', r.get('ticker', 'N/A'))}: ${r.get('close', 0):.2f} ({r.get('change', 0):+.2f}%)" 
                              for r in results[:15]])
    
    message = f"""
🔔 *BacktestPro Scanner Alert*

📊 *Scanner:* {scanner.name}
⏰ *Time:* {run.finished_at.strftime('%Y-%m-%d %H:%M:%S')} UTC
✅ *Matches:* {run.symbols_found}

*Results:*
{symbols_text}
{'_... and more_' if len(results) > 15 else ''}
"""
    
    try:
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        response = requests.post(url, json={
            'chat_id': chat_id,
            'text': message,
            'parse_mode': 'Markdown'
        })
        
        if response.status_code == 200:
            logger.info(f"Telegram message sent to chat {chat_id}")
            return True
        else:
            logger.error(f"Telegram API error: {response.text}")
            return False
            
    except Exception as e:
        logger.error(f"Telegram send error: {str(e)}")
        return False


def schedule_scanner(scanner, app):
    job_id = f"scanner_{scanner.id}"
    
    existing_job = scheduler.get_job(job_id)
    if existing_job:
        scheduler.remove_job(job_id)
    
    if scanner.is_active:
        trigger = get_interval_trigger(scanner.frequency)
        scheduler.add_job(
            run_scanner_job,
            trigger=trigger,
            args=[scanner.id, app],
            id=job_id,
            name=f"Scanner: {scanner.name}",
            replace_existing=True
        )
        logger.info(f"Scheduled scanner {scanner.name} with frequency {scanner.frequency}")


def unschedule_scanner(scanner_id):
    job_id = f"scanner_{scanner_id}"
    try:
        scheduler.remove_job(job_id)
        logger.info(f"Unscheduled scanner {scanner_id}")
    except:
        pass


def init_scheduler(app):
    global flask_app
    flask_app = app
    set_flask_app(app)
    
    if not scheduler.running:
        scheduler.start()
        logger.info("Background scheduler started")
    
    def load_scanners():
        try:
            from models import Scanner
            active_scanners = Scanner.query.filter_by(is_active=True).all()
            for scanner in active_scanners:
                schedule_scanner(scanner, app)
            logger.info(f"Initialized {len(active_scanners)} active scanners")
        except Exception as e:
            logger.warning(f"Could not load scanners: {e}")
    
    with app.app_context():
        try:
            load_scanners()
        except Exception as e:
            logger.warning(f"Scheduler initialization warning: {e}")


def shutdown_scheduler():
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Background scheduler stopped")
