"""
Stock Backtester V3.0 Wrapper
Programmatic interface to backtester_engine_v3_0__6_.py
Handles configuration and execution without user prompts
"""

import sys
import os
import json
from datetime import datetime
from typing import Dict, Any, List
import uuid

# Add current directory to path to import the backtester engine
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import the backtester engine
try:
    from backtester_engine_v3_0__6_ import BacktesterEngine
    ENGINE_AVAILABLE = True
except ImportError:
    ENGINE_AVAILABLE = False
    print("⚠️  WARNING: backtester_engine_v3_0__6_.py not found")


class StockBacktesterV3Wrapper:
    """Wrapper to run stock backtests programmatically"""
    
    def __init__(self, api_key: str, output_dir: str = 'stock_backtest_results'):
        """
        Initialize wrapper
        
        Args:
            api_key: Polygon.io API key
            output_dir: Directory to store results
        """
        self.api_key = api_key
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
    
    def run_backtest(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Run backtest with provided configuration
        
        Args:
            config: Dictionary with backtest parameters
            
        Returns:
            Dictionary with backtest results and metadata
        """
        if not ENGINE_AVAILABLE:
            return {
                'status': 'error',
                'error': 'Backtester engine not available'
            }
        
        try:
            # Generate unique ID for this backtest
            backtest_id = str(uuid.uuid4())[:8]
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            
            print(f"\n{'='*60}")
            print(f"STOCK BACKTEST V3.0 - STARTING")
            print(f"{'='*60}")
            print(f"Backtest ID: {backtest_id}")
            print(f"Name: {config.get('name', 'Unnamed')}")
            print(f"Date Range: {config['start_date']} to {config['end_date']}")
            print(f"{'='*60}\n")
            
            # Initialize backtester engine
            engine = BacktesterEngine(self.api_key)
            
            # Set configuration directly (bypass interactive prompts)
            engine.config = self._convert_config(config)
            
            # Run the backtest
            print("\nExecuting backtest...")
            engine.run()
            
            # Save results
            result_file = os.path.join(self.output_dir, f'{backtest_id}_{timestamp}.json')
            
            results = {
                'status': 'success',
                'backtest_id': backtest_id,
                'timestamp': timestamp,
                'config': config,
                'trades': engine.results if hasattr(engine, 'results') else [],
                'metadata': {
                    'name': config.get('name'),
                    'date_range': {
                        'start': config['start_date'],
                        'end': config['end_date']
                    },
                    'symbol_count': len(engine.config.get('symbols', [])),
                    'total_trades': len(engine.results) if hasattr(engine, 'results') else 0
                }
            }
            
            # Save to file
            with open(result_file, 'w') as f:
                json.dump(results, f, indent=2, default=str)
            
            print(f"\n{'='*60}")
            print(f"BACKTEST COMPLETE")
            print(f"Results saved to: {result_file}")
            print(f"Total trades: {results['metadata']['total_trades']}")
            print(f"{'='*60}\n")
            
            return results
            
        except Exception as e:
            print(f"\nERROR in backtest execution:")
            print(f"  {str(e)}")
            import traceback
            traceback.print_exc()
            
            return {
                'status': 'error',
                'error': str(e),
                'traceback': traceback.format_exc()
            }
    
    def _convert_config(self, web_config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert web form config to engine format
        
        Args:
            web_config: Configuration from web form
            
        Returns:
            Configuration in engine format
        """
        engine_config = {}
        
        # Basic settings
        engine_config['name'] = web_config.get('name', 'Unnamed Backtest')
        engine_config['start_date'] = web_config['start_date']
        engine_config['end_date'] = web_config['end_date']
        
        # Symbol configuration
        symbol_mode = web_config.get('symbol_mode', 'single')
        engine_config['symbol_mode'] = symbol_mode
        
        if symbol_mode == 'single':
            engine_config['symbols'] = [web_config['symbol'].upper()]
        elif symbol_mode == 'multiple':
            symbols_str = web_config.get('symbols', '')
            engine_config['symbols'] = [s.strip().upper() for s in symbols_str.split(',') if s.strip()]
        else:  # 'all' from CSV
            # For web interface, symbols should be pre-loaded
            engine_config['symbols'] = web_config.get('symbols', [])
            
            # Optional filters for 'all' mode
            if 'filter_shares_min' in web_config:
                engine_config['filter_shares_min'] = float(web_config['filter_shares_min'])
            if 'filter_shares_max' in web_config:
                engine_config['filter_shares_max'] = float(web_config['filter_shares_max'])
            if 'filter_price_min' in web_config:
                engine_config['filter_price_min'] = float(web_config['filter_price_min'])
            if 'filter_price_max' in web_config:
                engine_config['filter_price_max'] = float(web_config['filter_price_max'])
            if 'filter_mcap_min' in web_config:
                engine_config['filter_mcap_min'] = float(web_config['filter_mcap_min'])
            if 'filter_mcap_max' in web_config:
                engine_config['filter_mcap_max'] = float(web_config['filter_mcap_max'])
        
        # Entry conditions
        entry_type = web_config.get('entry_type', 'preset')
        engine_config['entry_type'] = entry_type
        
        if entry_type == 'preset':
            engine_config['preset_condition'] = web_config['preset_condition']
            engine_config['preset_operator'] = web_config['preset_operator']
            engine_config['preset_threshold'] = float(web_config['preset_threshold'])
            
            # Velocity specific
            if web_config['preset_condition'] == '5':  # Velocity
                engine_config['velocity_lookback'] = int(web_config.get('velocity_lookback', 5))
                engine_config['velocity_operator'] = web_config['preset_operator']
                engine_config['velocity_threshold'] = float(web_config['preset_threshold'])
                
        elif entry_type == 'custom':
            # Custom conditions
            engine_config['custom_conditions'] = web_config.get('custom_conditions', [])
        
        # Entry criteria (sizing)
        sizing_type = web_config.get('sizing_type', 'shares')
        engine_config['sizing_type'] = sizing_type
        engine_config['sizing_value'] = float(web_config['sizing_value'])
        
        if sizing_type == 'percent':
            engine_config['starting_capital'] = float(web_config.get('starting_capital', 50000))
        
        # Exit criteria
        engine_config['take_profit_type'] = web_config.get('take_profit_type', 'percent')
        engine_config['take_profit_value'] = float(web_config['take_profit_value'])
        engine_config['stop_loss_type'] = web_config.get('stop_loss_type', 'percent')
        engine_config['stop_loss_value'] = float(web_config['stop_loss_value'])
        engine_config['max_days'] = int(web_config.get('max_days', 5))
        
        # Consecutive trades
        engine_config['allow_consecutive_trades'] = web_config.get('allow_consecutive_trades', False)
        
        return engine_config
    
    def get_results(self, backtest_id: str) -> Dict[str, Any]:
        """
        Retrieve results for a specific backtest
        
        Args:
            backtest_id: Backtest ID to retrieve
            
        Returns:
            Dictionary with backtest results
        """
        # Find the result file
        result_files = [f for f in os.listdir(self.output_dir) 
                       if f.startswith(backtest_id) and f.endswith('.json')]
        
        if not result_files:
            raise FileNotFoundError(f"No results found for backtest {backtest_id}")
        
        result_file = os.path.join(self.output_dir, result_files[0])
        
        with open(result_file, 'r') as f:
            results = json.load(f)
        
        return results
