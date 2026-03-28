import os
import time
import logging
import pandas as pd
import pyarrow.parquet as pq
import pyarrow as pa
from datetime import datetime, timedelta

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

DATA_DIR = 'data'
CACHE_FILE = os.path.join(DATA_DIR, 'spy_1min.parquet')
SYMBOL = 'SPY'
POLYGON_RATE_LIMIT_DELAY = 13
MAX_BARS_PER_CALL = 40000
CHUNK_DAYS = 40

os.makedirs(DATA_DIR, exist_ok=True)


def get_polygon_client():
    api_key = os.environ.get('POLYGON_API_KEY', '')
    if not api_key:
        raise ValueError("POLYGON_API_KEY not set")
    from polygon.rest import RESTClient
    return RESTClient(api_key)


def fetch_bars_chunk(client, symbol, start_date, end_date, max_bars=MAX_BARS_PER_CALL):
    logger.info(f"Fetching {symbol} 1min bars: {start_date} to {end_date}")
    bars = []
    try:
        aggs = client.get_aggs(
            ticker=symbol,
            multiplier=1,
            timespan='minute',
            from_=start_date,
            to=end_date,
            limit=max_bars,
            sort='asc'
        )
        if aggs:
            for bar in aggs:
                bars.append({
                    'timestamp': bar.timestamp,
                    'open': bar.open,
                    'high': bar.high,
                    'low': bar.low,
                    'close': bar.close,
                    'volume': bar.volume,
                    'vwap': getattr(bar, 'vwap', None),
                })
    except Exception as e:
        logger.error(f"Error fetching bars {start_date}-{end_date}: {e}")
    logger.info(f"  Got {len(bars)} bars")
    return bars


def build_full_cache(years=2):
    client = get_polygon_client()
    end_date = datetime.now()
    start_date = end_date - timedelta(days=years * 365)

    existing_df = None
    if os.path.exists(CACHE_FILE):
        try:
            existing_df = pd.read_parquet(CACHE_FILE)
            last_ts = existing_df['timestamp'].max()
            resume_date = pd.to_datetime(last_ts, unit='ms') + timedelta(minutes=1)
            if resume_date.date() < end_date.date():
                start_date = resume_date
                logger.info(f"Resuming from {start_date.strftime('%Y-%m-%d')} (existing: {len(existing_df)} bars)")
            else:
                logger.info(f"Cache already up to date ({len(existing_df)} bars)")
                return existing_df
        except Exception as e:
            logger.warning(f"Could not read existing cache, rebuilding: {e}")
            existing_df = None

    current_start = start_date
    chunk_num = 0

    logger.info(f"=== Building SPY 1-min cache: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')} ===")

    while current_start < end_date:
        current_end = min(current_start + timedelta(days=CHUNK_DAYS), end_date)
        s = current_start.strftime('%Y-%m-%d')
        e = current_end.strftime('%Y-%m-%d')

        bars = fetch_bars_chunk(client, SYMBOL, s, e)
        chunk_num += 1

        if bars:
            new_df = pd.DataFrame(bars)
            new_df['timestamp'] = pd.to_numeric(new_df['timestamp'])

            if existing_df is not None:
                combined = pd.concat([existing_df, new_df], ignore_index=True)
            else:
                combined = new_df

            combined = combined.drop_duplicates(subset=['timestamp']).sort_values('timestamp').reset_index(drop=True)

            table = pa.Table.from_pandas(combined)
            pq.write_table(table, CACHE_FILE, compression='snappy')
            existing_df = combined

            logger.info(f"  Chunk {chunk_num} saved. Total: {len(combined)} bars")

        current_start = current_end + timedelta(days=1)

        if current_start < end_date:
            time.sleep(POLYGON_RATE_LIMIT_DELAY)

    if existing_df is None or len(existing_df) == 0:
        logger.error("No bars fetched!")
        return None

    first_dt = pd.to_datetime(existing_df['timestamp'].iloc[0], unit='ms')
    last_dt = pd.to_datetime(existing_df['timestamp'].iloc[-1], unit='ms')
    logger.info(f"=== Cache complete: {len(existing_df)} bars, {first_dt} to {last_dt} ===")
    logger.info(f"  File: {CACHE_FILE} ({os.path.getsize(CACHE_FILE) / 1024 / 1024:.1f} MB)")

    return existing_df


def fetch_and_append_day(target_date=None):
    client = get_polygon_client()

    if target_date is None:
        target_date = datetime.now()

    date_str = target_date.strftime('%Y-%m-%d')
    logger.info(f"Fetching SPY 1-min bars for {date_str} (full day including extended hours)")

    bars = fetch_bars_chunk(client, SYMBOL, date_str, date_str)

    if not bars:
        logger.info(f"  No bars for {date_str} (market closed?)")
        return 0

    new_df = pd.DataFrame(bars)
    new_df['timestamp'] = pd.to_numeric(new_df['timestamp'])

    if os.path.exists(CACHE_FILE):
        existing_df = pd.read_parquet(CACHE_FILE)
        combined = pd.concat([existing_df, new_df], ignore_index=True)
        combined = combined.drop_duplicates(subset=['timestamp']).sort_values('timestamp').reset_index(drop=True)
    else:
        combined = new_df.drop_duplicates(subset=['timestamp']).sort_values('timestamp').reset_index(drop=True)

    table = pa.Table.from_pandas(combined)
    pq.write_table(table, CACHE_FILE, compression='snappy')

    logger.info(f"  Appended {len(bars)} bars for {date_str}. Total: {len(combined)} bars.")
    return len(bars)


def daily_update():
    logger.info("=== SPY daily cache update starting ===")
    now = datetime.now()
    today_str = now.strftime('%Y-%m-%d')

    last_ts = get_last_cached_timestamp()
    if last_ts:
        last_date = pd.to_datetime(last_ts, unit='ms').date()
        current_date = last_date + timedelta(days=1)
        dates_to_fetch = []
        while current_date <= now.date():
            dates_to_fetch.append(current_date)
            current_date += timedelta(days=1)
    else:
        dates_to_fetch = [now.date()]

    total_added = 0
    for d in dates_to_fetch:
        dt = datetime.combine(d, datetime.min.time())
        count = fetch_and_append_day(dt)
        total_added += count
        if count > 0 and d != dates_to_fetch[-1]:
            time.sleep(POLYGON_RATE_LIMIT_DELAY)

    logger.info(f"=== Daily update complete: {total_added} bars added across {len(dates_to_fetch)} days ===")
    return total_added


def get_last_cached_timestamp():
    if not os.path.exists(CACHE_FILE):
        return None
    try:
        df = pd.read_parquet(CACHE_FILE, columns=['timestamp'])
        if len(df) == 0:
            return None
        return int(df['timestamp'].max())
    except Exception as e:
        logger.error(f"Error reading cache: {e}")
        return None


def get_cache_info():
    if not os.path.exists(CACHE_FILE):
        return {
            'exists': False,
            'total_bars': 0,
            'file_size_mb': 0,
            'first_date': None,
            'last_date': None,
            'trading_days': 0,
        }

    try:
        df = pd.read_parquet(CACHE_FILE, columns=['timestamp'])
        first_ts = pd.to_datetime(df['timestamp'].min(), unit='ms')
        last_ts = pd.to_datetime(df['timestamp'].max(), unit='ms')

        df['date'] = pd.to_datetime(df['timestamp'], unit='ms').dt.date
        trading_days = df['date'].nunique()

        return {
            'exists': True,
            'total_bars': len(df),
            'file_size_mb': round(os.path.getsize(CACHE_FILE) / 1024 / 1024, 2),
            'first_date': first_ts.strftime('%Y-%m-%d %H:%M'),
            'last_date': last_ts.strftime('%Y-%m-%d %H:%M'),
            'trading_days': trading_days,
        }
    except Exception as e:
        logger.error(f"Error getting cache info: {e}")
        return {'exists': False, 'error': str(e)}


def load_cached_data(start_date=None, end_date=None):
    if not os.path.exists(CACHE_FILE):
        return None

    df = pd.read_parquet(CACHE_FILE)

    if start_date:
        start_ts = int(pd.Timestamp(start_date).timestamp() * 1000)
        df = df[df['timestamp'] >= start_ts]

    if end_date:
        end_ts = int((pd.Timestamp(end_date) + timedelta(days=1)).timestamp() * 1000)
        df = df[df['timestamp'] < end_ts]

    return df


def load_cached_bars_as_list(start_date=None, end_date=None):
    df = load_cached_data(start_date, end_date)
    if df is None or len(df) == 0:
        return []

    return df.to_dict('records')


def setup_daily_scheduler(scheduler):
    from apscheduler.triggers.cron import CronTrigger
    scheduler.add_job(
        daily_update,
        CronTrigger(hour=20, minute=30, timezone='US/Eastern'),
        id='spy_daily_cache_update',
        name='SPY Daily Cache Update',
        replace_existing=True,
        misfire_grace_time=3600,
    )
    logger.info("SPY daily cache update scheduled for 8:30 PM ET daily")
