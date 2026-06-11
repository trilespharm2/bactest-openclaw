#!/usr/bin/env python3
"""
Standalone runner for a single stock backtest.

This is launched as a *detached* subprocess (start_new_session=True) by the
web app so that a stock backtest keeps running even if the gunicorn worker is
restarted, recycled, or killed by its request timeout. The process writes its
own progress and final status/results to disk, which is the durable source of
truth the web app reconciles against.

Usage:
    python3 stock_backtest_runner.py --config <config.json> --id <backtest_id>
"""
import argparse
import json
import os
import sys
import traceback
from datetime import datetime

OUTPUT_DIR = 'stock_backtest_v3_results'


def _write_status(metadata_path, status, error=None, extra=None):
    """Best-effort update of the metadata file's status field."""
    try:
        data = {}
        if os.path.exists(metadata_path):
            try:
                with open(metadata_path, 'r') as f:
                    data = json.load(f)
            except Exception:
                data = {}
        data['status'] = status
        if error is not None:
            data['error'] = error
        if extra:
            data.update(extra)
        with open(metadata_path, 'w') as f:
            json.dump(data, f, indent=2, default=str)
    except Exception:
        traceback.print_exc()


def main():
    parser = argparse.ArgumentParser(description='Run a single stock backtest.')
    parser.add_argument('--config', required=True, help='Path to config JSON file')
    parser.add_argument('--id', required=True, help='Pre-generated backtest ID')
    args = parser.parse_args()

    backtest_id = args.id
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    metadata_path = os.path.join(OUTPUT_DIR, f'{backtest_id}.json')

    # Expose the ID so the engine writes its progress file.
    os.environ['CURRENT_BACKTEST_ID'] = backtest_id

    try:
        with open(args.config, 'r') as f:
            config = json.load(f)
    except Exception as e:
        _write_status(metadata_path, 'error', error=f'Could not read config: {e}')
        print(f'FATAL: could not read config: {e}', flush=True)
        return 1

    api_key = os.environ.get('POLYGON_API_KEY', '')

    try:
        from stock_backtester_v3_wrapper import StockBacktesterV3Wrapper
    except Exception as e:
        _write_status(metadata_path, 'error', error=f'Backtester engine not available: {e}')
        print(f'FATAL: wrapper import failed: {e}', flush=True)
        return 1

    print(f"\n{'='*60}")
    print(f"STOCK BACKTEST (detached) - RUNNING")
    print(f"Backtest ID: {backtest_id}")
    print(f"PID: {os.getpid()}")
    print(f"{'='*60}\n", flush=True)

    try:
        wrapper = StockBacktesterV3Wrapper(api_key, output_dir=OUTPUT_DIR)
        result = wrapper.run_backtest_with_id(config, backtest_id)

        status = (result or {}).get('status')
        if status == 'error':
            # run_backtest_with_id does not persist the metadata file on error,
            # so make sure disk reflects the failure.
            _write_status(metadata_path, 'error', error=result.get('error', 'Unknown error'))
            print(f"\nBACKTEST FAILED: {backtest_id}", flush=True)
            return 1

        # Success: wrapper already wrote the full results file (status 'success').
        # Normalize the status field to 'completed' for the rest of the app.
        _write_status(metadata_path, 'completed', extra={'completed_at': datetime.utcnow().isoformat()})
        print(f"\nBACKTEST COMPLETE: {backtest_id}", flush=True)
        return 0

    except Exception as e:
        traceback.print_exc()
        _write_status(metadata_path, 'error', error=str(e))
        print(f"\nBACKTEST ERROR: {backtest_id}: {e}", flush=True)
        return 1
    finally:
        # Remove the progress file so the listing stops showing a progress bar.
        try:
            pp = os.path.join('backtest_results', f'progress_{backtest_id}.json')
            if os.path.exists(pp):
                os.remove(pp)
        except Exception:
            pass


if __name__ == '__main__':
    sys.exit(main())
