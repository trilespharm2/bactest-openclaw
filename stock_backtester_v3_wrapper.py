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
        # Lazy import of engine when actually running
        try:
            from backtester_engine_v3_0__6_ import BacktesterEngine
        except ImportError as e:
            return {
                'status': 'error',
                'error': f'Backtester engine not available: {str(e)}'
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
            engine.run_backtest(output_dir=self.output_dir, backtest_id=backtest_id)
            
            # Save results with simpler filename (just backtest_id)
            result_file = os.path.join(self.output_dir, f'{backtest_id}.json')
            
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
    
    def run_backtest_with_id(self, config: Dict[str, Any], backtest_id: str) -> Dict[str, Any]:
        """
        Run backtest with a pre-generated ID (for async execution)
        
        Args:
            config: Dictionary with backtest parameters
            backtest_id: Pre-generated unique ID for this backtest
            
        Returns:
            Dictionary with backtest results and metadata
        """
        # Lazy import of engine when actually running
        try:
            from backtester_engine_v3_0__6_ import BacktesterEngine
        except ImportError as e:
            return {
                'status': 'error',
                'error': f'Backtester engine not available: {str(e)}'
            }
        
        try:
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
            engine.run_backtest(output_dir=self.output_dir, backtest_id=backtest_id)
            
            # Save results with simpler filename (just backtest_id)
            result_file = os.path.join(self.output_dir, f'{backtest_id}.json')
            
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
            symbol = web_config.get('symbol') or (web_config.get('symbols', [''])[0] if isinstance(web_config.get('symbols'), list) else '')
            engine_config['symbols'] = [symbol.upper()] if symbol else []
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
        
        # Direction (Long/Short)
        engine_config['direction'] = web_config.get('direction', 'long')
        
        # Entry criteria (sizing)
        sizing_type = web_config.get('sizing_type', 'shares')
        engine_config['sizing_type'] = sizing_type
        
        # Handle both new format (sizing_value) and old format (sizing_shares/sizing_dollars/sizing_percent)
        if 'sizing_value' in web_config and web_config['sizing_value']:
            engine_config['sizing_value'] = float(web_config['sizing_value'])
        elif sizing_type == 'shares' and 'sizing_shares' in web_config:
            engine_config['sizing_value'] = float(web_config['sizing_shares'])
        elif sizing_type == 'dollars' and 'sizing_dollars' in web_config:
            engine_config['sizing_value'] = float(web_config['sizing_dollars'])
        elif sizing_type == 'percent' and 'sizing_percent' in web_config:
            engine_config['sizing_value'] = float(web_config['sizing_percent'])
        else:
            # Default values if nothing is provided
            engine_config['sizing_value'] = 100.0 if sizing_type == 'shares' else 5000.0 if sizing_type == 'dollars' else 10.0
        
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
            Dictionary with backtest results including computed stats
        """
        print(f"\n{'='*60}")
        print(f"GET_RESULTS called for backtest_id: {backtest_id}")
        print(f"{'='*60}")
        
        # Look for result file (try exact match first, then prefix match for legacy files)
        result_file = os.path.join(self.output_dir, f'{backtest_id}.json')
        
        if not os.path.exists(result_file):
            # Fallback: look for files with timestamp suffix (legacy format)
            print(f"Exact match not found, looking for legacy format...")
            result_files = [f for f in os.listdir(self.output_dir) 
                           if f.startswith(backtest_id) and f.endswith('.json')]
            
            if not result_files:
                raise FileNotFoundError(f"No results found for backtest {backtest_id}")
            
            result_file = os.path.join(self.output_dir, result_files[0])
            print(f"Found legacy file: {result_file}")
        else:
            print(f"Found exact match: {result_file}")
        
        with open(result_file, 'r') as f:
            results = json.load(f)
        
        print(f"JSON loaded. Keys: {list(results.keys())}")
        print(f"Number of trades: {len(results.get('trades', []))}")
        
        # Add computed statistics
        print(f"Computing stats...")
        stats = self._compute_stats(results.get('trades', []))
        results['stats'] = stats
        print(f"Stats computed: {stats}")
        
        # Add equity curve image (base64)
        equity_curve_path = os.path.join(self.output_dir, f'equity_curve_{backtest_id}.png')
        print(f"Looking for equity curve: {equity_curve_path}")
        if os.path.exists(equity_curve_path):
            import base64
            with open(equity_curve_path, 'rb') as img_file:
                results['equity_curve_base64'] = base64.b64encode(img_file.read()).decode('utf-8')
            print(f"Equity curve loaded (base64 length: {len(results['equity_curve_base64'])})")
        else:
            results['equity_curve_base64'] = None
            print(f"No equity curve found")
        
        # Add CSV data
        csv_path = os.path.join(self.output_dir, f'backtest_{results["config"].get("name", "unnamed")}_{backtest_id}.csv')
        print(f"Looking for CSV: {csv_path}")
        if os.path.exists(csv_path):
            with open(csv_path, 'r') as csv_file:
                results['csv_data'] = csv_file.read()
            print(f"CSV loaded ({len(results['csv_data'])} chars)")
        else:
            # Generate CSV from trades if file doesn't exist
            print(f"CSV not found, generating from trades...")
            results['csv_data'] = self._generate_csv(results.get('trades', []))
        
        print(f"Returning results with keys: {list(results.keys())}")
        print(f"{'='*60}\n")
        
        return results
    
    def _compute_stats(self, trades: List[Dict]) -> Dict[str, float]:
        """
        Compute performance statistics from trades
        
        Args:
            trades: List of trade dictionaries
            
        Returns:
            Dictionary with computed statistics
        """
        if not trades:
            return {
                'total_trades': 0,
                'win_rate': 0.0,
                'total_pnl': 0.0,
                'avg_win': 0.0,
                'avg_loss': 0.0,
                'profit_factor': 0.0,
                'max_drawdown': 0.0,
                'total_return': 0.0
            }
        
        total_trades = len(trades)
        winning_trades = [t for t in trades if t.get('pnl', 0) > 0]
        losing_trades = [t for t in trades if t.get('pnl', 0) < 0]
        
        total_pnl = sum(t.get('pnl', 0) for t in trades)
        total_wins = sum(t.get('pnl', 0) for t in winning_trades)
        total_losses = abs(sum(t.get('pnl', 0) for t in losing_trades))
        
        win_rate = (len(winning_trades) / total_trades * 100) if total_trades > 0 else 0.0
        avg_win = (total_wins / len(winning_trades)) if winning_trades else 0.0
        avg_loss = (total_losses / len(losing_trades)) if losing_trades else 0.0
        profit_factor = (total_wins / total_losses) if total_losses > 0 else (999.99 if total_wins > 0 else 0.0)
        
        # Calculate max drawdown
        equity = 0
        peak = 0
        max_dd = 0
        for trade in trades:
            equity += trade.get('pnl', 0)
            if equity > peak:
                peak = equity
            drawdown = ((equity - peak) / peak * 100) if peak > 0 else 0
            if drawdown < max_dd:
                max_dd = drawdown
        
        # Calculate total return (assuming starting capital from first trade or config)
        starting_capital = trades[0].get('capital_before', 50000) if trades else 50000
        total_return = (total_pnl / starting_capital * 100) if starting_capital > 0 else 0.0
        
        return {
            'total_trades': total_trades,
            'win_rate': round(win_rate, 2),
            'total_pnl': round(total_pnl, 2),
            'avg_win': round(avg_win, 2),
            'avg_loss': round(avg_loss, 2),
            'profit_factor': round(profit_factor, 2),
            'max_drawdown': round(max_dd, 2),
            'total_return': round(total_return, 2)
        }
    
    def _generate_csv(self, trades: List[Dict]) -> str:
        """
        Generate CSV string from trades
        
        Args:
            trades: List of trade dictionaries
            
        Returns:
            CSV formatted string
        """
        if not trades:
            return "trade_num,symbol,entry_date,entry_price,exit_date,exit_price,shares,pnl,pnl_pct,exit_reason\n"
        
        lines = ["trade_num,symbol,entry_date,entry_price,exit_date,exit_price,shares,pnl,pnl_pct,exit_reason"]
        
        for i, trade in enumerate(trades, 1):
            line = f"{i}," \
                   f"{trade.get('symbol', 'N/A')}," \
                   f"{trade.get('entry_date', 'N/A')}," \
                   f"{trade.get('entry_price', 0):.2f}," \
                   f"{trade.get('exit_date', 'N/A')}," \
                   f"{trade.get('exit_price', 0):.2f}," \
                   f"{trade.get('shares', 0)}," \
                   f"{trade.get('pnl', 0):.2f}," \
                   f"{trade.get('pnl_pct', 0):.2f}," \
                   f"{trade.get('exit_reason', 'N/A')}"
            lines.append(line)
        
        return "\n".join(lines)
