"""
ADD THIS CODE TO YOUR app.py IN THE /api/backtest/run ENDPOINT

This saves complete configuration to metadata JSON after backtest completes
ALL 16 CONFIGURATION FIELDS CAPTURED
"""

# After backtest completes and you have the results, add this:

def save_complete_metadata(backtest_id, request_params, summary_stats):
    """
    Save complete metadata with ALL 16 configuration settings
    
    Args:
        backtest_id: Unique ID for this backtest
        request_params: The params object from the POST request body
        summary_stats: Calculated summary statistics
    """
    import json
    import os
    from datetime import datetime
    
    # Extract all configuration from request
    config = {
        # ========== BASIC SETTINGS ==========
        # 1. Symbol
        'symbol': request_params.get('symbol', 'SPX'),
        
        # 2. Expiration (DTE)
        'dte': request_params.get('dte'),
        
        # 3. Strategy
        'strategy': request_params.get('strategy', ''),
        
        # 4. Leg Criteria (varies by strategy)
        'legs': request_params.get('legs', {}),
        
        # ========== CAPITAL SETTINGS ==========
        # 5. Starting Capital
        'initial_capital': request_params.get('capital', {}).get('starting', 100000),
        
        # 6. Allocation Type
        'allocation_type': request_params.get('capital', {}).get('allocationType', 'percentage'),
        
        # 7. Allocation Value
        'allocation_value': request_params.get('capital', {}).get('allocationValue', 10),
        
        # ========== BACKTEST PERIOD ==========
        # 8. From Date
        'start_date': request_params.get('dateRange', {}).get('from'),
        
        # 9. To Date
        'end_date': request_params.get('dateRange', {}).get('to'),
        
        # ========== ENTRY SETTINGS ==========
        # 10. Entry Time
        'entry_time': request_params.get('entry', {}).get('time', '10:00'),
        
        # 11. Entry Days (Mon-Fri selection)
        'entry_days': request_params.get('entry', {}).get('days', [1,2,3,4,5]),
        
        # ========== EXIT SETTINGS ==========
        # 12. Take Profit %
        'take_profit_pct': request_params.get('exit', {}).get('takeProfitPct', 50),
        
        # 13. Stop Loss %
        'stop_loss_pct': request_params.get('exit', {}).get('stopLossPct', 200),
        
        # ========== DETECTION SETTINGS ==========
        # 14. Detection Bar Size
        'detection_bar_size': request_params.get('detection', {}).get('bars', 5),
        
        # 15. PDT Rule
        'pdt_rule': request_params.get('detection', {}).get('pdtRule', 'avoid'),
        
        # 16. Concurrent Trades
        'concurrent_trades': request_params.get('detection', {}).get('concurrentTrades', False),
    }
    
    # Create metadata structure
    metadata = {
        'id': backtest_id,
        'timestamp': datetime.now().isoformat(),
        'config': config,
        'summary': summary_stats,
        'files': {
            'csv': f'trade_log_{backtest_id}.csv',
            'image': f'equity_curve_{backtest_id}.png'
        }
    }
    
    # Save to file
    metadata_path = os.path.join('backtest_results', f'metadata_{backtest_id}.json')
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"✅ Metadata saved with ALL 16 configuration fields: {metadata_path}")
    return metadata


# USAGE IN YOUR /api/backtest/run ENDPOINT:
# 
# @app.route('/api/backtest/run', methods=['POST'])
# def run_backtest():
#     try:
#         params = request.get_json()
#         
#         # ... your existing backtest logic ...
#         # ... calculate summary_stats ...
#         # ... generate backtest_id ...
#         
#         # Save complete metadata (ALL 16 FIELDS)
#         metadata = save_complete_metadata(backtest_id, params, summary_stats)
#         
#         return jsonify({
#             'success': True,
#             'backtest_id': backtest_id,
#             'metadata': metadata,
#             # ... other response data ...
#         })
#     except Exception as e:
#         return jsonify({'error': str(e)}), 500
