"""
Polygon.io Backtester Engine - v3.0 (Custom Condition Builder)
New Features:
1. REMOVED: Presets #5 and #6 (Break of Previous HOD/LOD)
2. NEW: Custom condition builder with unlimited conditions
3. Custom: Compare any candle to any other candle with threshold
4. Custom: Support for min/hr/day candles with multipliers
5. Custom: Prior conditions (prerequisites before entry check)
6. All previous features maintained (Gap%, Change-Open%, etc.)
"""

import os
from datetime import datetime, timedelta
from polygon.rest import RESTClient
import pandas as pd
import numpy as np
import csv
from typing import List, Dict, Optional, Tuple, Any
from scipy.stats import linregress as _linregress

class BacktesterEngine:
    def __init__(self, api_key: str):
        """Initialize the backtester with Polygon.io API key"""
        self.client = RESTClient(api_key)
        self.config = {}
        self.results = []
    
    def _get_valid_date(self, prompt: str) -> str:
        """Get and validate date input in YYYY-MM-DD format"""
        while True:
            date_str = input(prompt).strip()
            try:
                datetime.strptime(date_str, '%Y-%m-%d')
                return date_str
            except ValueError:
                print("   ❌ Invalid date format. Please use YYYY-MM-DD (e.g., 2025-11-20)")
    
    def _get_valid_choice(self, prompt: str, valid_options: list) -> str:
        """Get and validate choice from list of options"""
        while True:
            choice = input(prompt).strip()
            if choice in valid_options:
                return choice
            print(f"   ❌ Invalid choice. Please select from: {', '.join(valid_options)}")
    
    def _get_valid_yes_no(self, prompt: str) -> bool:
        """Get and validate yes/no input"""
        while True:
            response = input(prompt).strip().lower()
            if response in ['y', 'yes']:
                return True
            elif response in ['n', 'no']:
                return False
            print("   ❌ Invalid input. Please enter 'y' or 'n'")
    
    def _get_valid_float(self, prompt: str, min_val: float = None, max_val: float = None) -> float:
        """Get and validate float input"""
        while True:
            try:
                value = float(input(prompt).strip())
                if min_val is not None and value < min_val:
                    print(f"   ❌ Value must be >= {min_val}")
                    continue
                if max_val is not None and value > max_val:
                    print(f"   ❌ Value must be <= {max_val}")
                    continue
                return value
            except ValueError:
                print("   ❌ Invalid number. Please enter a valid number")
    
    def _get_valid_int(self, prompt: str, min_val: int = None, max_val: int = None) -> int:
        """Get and validate integer input"""
        while True:
            try:
                value = int(input(prompt).strip())
                if min_val is not None and value < min_val:
                    print(f"   ❌ Value must be >= {min_val}")
                    continue
                if max_val is not None and value > max_val:
                    print(f"   ❌ Value must be <= {max_val}")
                    continue
                return value
            except ValueError:
                print("   ❌ Invalid number. Please enter a valid integer")
    
    def _validate_standalone_condition(self, operator: str, threshold: float) -> bool:
        """
        NEW v3.0: Validate if condition would trigger indefinitely
        
        Returns False if condition is too broad (e.g., >0%, <0%)
        """
        # Check for overly broad conditions
        if operator in ['>', '>='] and threshold <= 0:
            return False  # Would trigger on any positive change
        if operator in ['<', '<='] and threshold >= 0:
            return False  # Would trigger on any negative change
        
        # Note: = 0 is actually specific (price unchanged), so we allow it
        
        return True
        
    def configure_backtest(self):
        """Interactive configuration of backtest parameters"""
        print("=" * 60)
        print("BACKTESTER ENGINE - CONFIGURATION")
        print("=" * 60)
        
        self.config['name'] = input("\n1. Enter backtest name: ").strip()
        
        print("\n2. Enter date range:")
        self.config['start_date'] = self._get_valid_date("   Start date (YYYY-MM-DD): ")
        self.config['end_date'] = self._get_valid_date("   End date (YYYY-MM-DD): ")
        
        print("\n3. Symbol selection:")
        print("   [1] Single")
        print("   [2] Multiple")
        print("   [3] All (from CSV)")
        symbol_choice = self._get_valid_choice("   Select option (1-3): ", ['1', '2', '3'])
        
        if symbol_choice == "1":
            self.config['symbol_mode'] = 'single'
            self.config['symbols'] = [input("   Enter ticker: ").strip().upper()]
        elif symbol_choice == "2":
            self.config['symbol_mode'] = 'multiple'
            print("   Enter tickers (type 'done' when finished):")
            symbols = []
            while True:
                ticker = input("   Ticker: ").strip().upper()
                if ticker.lower() == 'done' or ticker == '':
                    break
                symbols.append(ticker)
            self.config['symbols'] = symbols
        else:
            self.config['symbol_mode'] = 'all'
            csv_path = input("   Enter path to CSV file with tickers: ").strip()
            self.config['symbols'] = self._load_tickers_from_csv(csv_path)
            
            # NEW v3.0: Optional filters for "all" mode
            print("\n   Optional Filters (press Enter to skip):")
            
            # Shares outstanding filter
            print("   Shares Outstanding:")
            min_shares = input("     Min: ").strip()
            max_shares = input("     Max: ").strip()
            if min_shares or max_shares:
                self.config['filter_shares_min'] = float(min_shares) if min_shares else None
                self.config['filter_shares_max'] = float(max_shares) if max_shares else None
            
            # Price filter
            print("   Price:")
            min_price = input("     Min: ").strip()
            max_price = input("     Max: ").strip()
            if min_price or max_price:
                self.config['filter_price_min'] = float(min_price) if min_price else None
                self.config['filter_price_max'] = float(max_price) if max_price else None
            
            # Market cap filter
            print("   Market Cap:")
            min_mcap = input("     Min: ").strip()
            max_mcap = input("     Max: ").strip()
            if min_mcap or max_mcap:
                self.config['filter_mcap_min'] = float(min_mcap) if min_mcap else None
                self.config['filter_mcap_max'] = float(max_mcap) if max_mcap else None
        
        self._configure_entry_conditions()
        self._configure_entry_criteria()
        self._configure_exit_criteria()
        self._configure_consecutive_trades()
        
        print("\n" + "=" * 60)
        print("Configuration complete!")
        print("=" * 60)
        
    def _load_tickers_from_csv(self, csv_path: str) -> List[str]:
        tickers = []
        try:
            with open(csv_path, 'r') as f:
                reader = csv.reader(f)
                for row in reader:
                    if row and row[0].strip():
                        tickers.append(row[0].strip().upper())
        except Exception as e:
            print(f"Error loading CSV: {e}")
        return tickers
    
    def _apply_ticker_filters(self, tickers: List[str], start_date: str) -> List[str]:
        """
        NEW v3.0: Filter tickers based on shares outstanding, price, and market cap
        Uses Polygon.io ticker details API
        """
        if not any([
            self.config.get('filter_shares_min'),
            self.config.get('filter_shares_max'),
            self.config.get('filter_price_min'),
            self.config.get('filter_price_max'),
            self.config.get('filter_mcap_min'),
            self.config.get('filter_mcap_max')
        ]):
            # No filters applied
            return tickers
        
        print(f"\nApplying filters to {len(tickers)} symbols...")
        filtered = []
        
        for ticker in tickers:
            try:
                # Get ticker details
                details = self.client.get_ticker_details(ticker, date=start_date)
                
                if details and 'results' in details:
                    results = details['results']
                    
                    # Check shares outstanding filter
                    if self.config.get('filter_shares_min') or self.config.get('filter_shares_max'):
                        shares = results.get('weighted_shares_outstanding')
                        if shares:
                            if self.config.get('filter_shares_min') and shares < self.config['filter_shares_min']:
                                continue
                            if self.config.get('filter_shares_max') and shares > self.config['filter_shares_max']:
                                continue
                    
                    # Check market cap filter
                    if self.config.get('filter_mcap_min') or self.config.get('filter_mcap_max'):
                        mcap = results.get('market_cap')
                        if mcap:
                            if self.config.get('filter_mcap_min') and mcap < self.config['filter_mcap_min']:
                                continue
                            if self.config.get('filter_mcap_max') and mcap > self.config['filter_mcap_max']:
                                continue
                    
                    # For price filter, we'd need to fetch actual price data
                    # Skipping price filter in details (would require separate API call)
                    
                    filtered.append(ticker)
                
            except Exception as e:
                print(f"  Warning: Could not fetch details for {ticker}: {e}")
                continue
        
        print(f"Filtered to {len(filtered)} symbols")
        return filtered
    
    def _configure_entry_conditions(self):
        print("\n4. Entry Conditions:")
        print("   [1] Preset")
        print("   [2] Custom")
        condition_choice = input("   Select option (1-2): ").strip()
        
        if condition_choice == "1":
            self._configure_preset_conditions()
        else:
            self._configure_custom_conditions()
    
    def _configure_preset_conditions(self):
        print("\n   Preset Options:")
        print("   [1] Premarket Change %")
        print("   [2] Change %")
        print("   [3] Gap %")
        print("   [4] Change-Open %")
        print("   [5] Velocity (Rate of Change)")
        
        preset_choice = input("   Select preset (1-5): ").strip()
        
        if preset_choice == '5':
            # NEW v3.0: Velocity preset
            self.config['entry_type'] = 'velocity'
            time_interval = int(input("   Time interval (minutes): ").strip())
            operator = input("   Operator (>, <, >=, <=): ").strip()
            threshold = float(input("   Threshold (%): ").strip())
            
            self.config['velocity_lookback'] = time_interval
            self.config['velocity_operator'] = operator
            self.config['velocity_threshold'] = threshold
            
            # Validate preset condition
            if not self._validate_standalone_condition(operator, threshold):
                print("\n   ⚠️  WARNING: These parameters are too broad!")
                print("   This would trigger on every candle where price changed.")
                print("   Please add additional conditions to filter entries.\n")
                
                add_more = self._get_valid_yes_no("   Add additional conditions? (y/n): ")
                if add_more:
                    # Switch to custom mode with velocity as entry
                    print("\n   Switching to Custom mode with Velocity entry condition...")
                    self.config['entry_type'] = 'custom'
                    self.config['custom_conditions'] = []
                    
                    # Get prior conditions
                    num_prior = self._get_valid_int("\n   Number of prior conditions: ", min_val=1)
                    
                    for i in range(num_prior):
                        print(f"\n   === Prior Condition #{i + 1} (prerequisite) ===")
                        condition = self._get_condition_from_user()
                        condition['type'] = 'standard'
                        self.config['custom_conditions'].append(condition)
                    
                    # Add velocity as entry condition
                    velocity_entry = {
                        'type': 'velocity',
                        'lookback': time_interval,
                        'operation': operator,
                        'threshold_value': threshold,
                        'threshold_unit': '%'
                    }
                    self.config['custom_conditions'].insert(0, velocity_entry)
                    
                    print(f"\n   Velocity entry configured with {num_prior} prior condition(s)")
                else:
                    print("\n   Configuration cancelled. Please restart with better parameters.")
                    exit()
            else:
                print(f"\n   Velocity configured: {operator} {threshold}% change in {time_interval} minutes")
        else:
            # Existing presets
            self.config['entry_type'] = 'preset'
            self.config['preset_condition'] = preset_choice
            
            if preset_choice in ['1', '2', '3', '4']:
                operator = input("   Operator (>, <, >=, <=, =): ").strip()
                threshold = float(input("   Threshold value (%): ").strip())
                self.config['preset_operator'] = operator
                self.config['preset_threshold'] = threshold
                
                # Validate preset condition
                if not self._validate_standalone_condition(operator, threshold):
                    print("\n   ⚠️  WARNING: These parameters are too broad!")
                    print("   This would trigger on every candle where price changed.")
                    print("   Please add additional conditions to filter entries.\n")
                    
                    add_more = self._get_valid_yes_no("   Add additional conditions? (y/n): ")
                    if add_more:
                        # Switch to custom mode
                        print("\n   Switching to Custom mode...")
                        self.config['entry_type'] = 'custom'
                        self.config['custom_conditions'] = []
                        
                        # Store original preset as entry condition
                        preset_entry = {
                            'type': 'preset',
                            'preset_type': preset_choice,
                            'operation': operator,
                            'threshold_value': threshold,
                            'threshold_unit': '%'
                        }
                        
                        # Get prior conditions
                        num_prior = self._get_valid_int("\n   Number of prior conditions: ", min_val=1)
                        
                        for i in range(num_prior):
                            print(f"\n   === Prior Condition #{i + 1} (prerequisite) ===")
                            condition = self._get_condition_from_user()
                            condition['type'] = 'standard'
                            self.config['custom_conditions'].append(condition)
                        
                        # Add preset as entry condition
                        self.config['custom_conditions'].insert(0, preset_entry)
                        
                        print(f"\n   Preset entry configured with {num_prior} prior condition(s)")
                    else:
                        print("\n   Configuration cancelled. Please restart with better parameters.")
                        exit()
    
    def _configure_custom_conditions(self):
        """NEW v3.0: Configure custom conditions"""
        print("\n   Custom Condition Builder")
        print("   ========================")
        
        self.config['entry_type'] = 'custom'
        self.config['custom_conditions'] = []
        
        # Get number of conditions
        num_conditions = int(input("\n   Number of conditions: ").strip())
        
        # UPDATED v3.0: Ask for prior conditions FIRST, then entry condition
        condition_order = []
        
        if num_conditions > 1:
            # Collect prior conditions first (will be indices 1+ in final list)
            for i in range(num_conditions - 1):
                print(f"\n   === Prior Condition #{i + 1} (prerequisite) ===")
                condition = self._get_condition_from_user()
                condition_order.append(('prior', i + 1, condition))
        
        # Then get entry condition (will be index 0 in final list)
        print(f"\n   === Entry Condition (must be met for entry) ===")
        
        # NEW v3.0: Ask if user wants velocity or standard condition
        use_velocity = input("   Use velocity/rate-of-change for entry? (y/n): ").strip().lower()
        
        if use_velocity in ['y', 'yes']:
            # Velocity entry condition
            time_interval = int(input("   Time interval (minutes): ").strip())
            operator = input("   Operator (>, <, >=, <=): ").strip()
            threshold = float(input("   Threshold (%): ").strip())
            
            # Validate if used alone
            if num_conditions == 1 and not self._validate_standalone_condition(operator, threshold):
                print("\n   ⚠️  WARNING: These parameters are too broad!")
                print("   Velocity with these settings would trigger constantly.")
                print("   You need prior conditions to filter entries.\n")
                
                num_prior = self._get_valid_int("   Number of prior conditions to add: ", min_val=1)
                
                # Get prior conditions
                for i in range(num_prior):
                    print(f"\n   === Prior Condition #{i + 1} (prerequisite) ===")
                    condition = self._get_condition_from_user()
                    condition['type'] = 'standard'
                    condition_order.append(('prior', i + 1, condition))
                
                print(f"\n   Added {num_prior} prior condition(s)")
            
            entry_condition = {
                'type': 'velocity',
                'lookback': time_interval,
                'operation': operator,
                'threshold_value': threshold,
                'threshold_unit': '%'
            }
            print(f"   Velocity entry configured: {operator} {threshold}% in {time_interval} min")
        else:
            # Standard condition
            entry_condition = self._get_condition_from_user()
            entry_condition['type'] = 'standard'
            
            # NEW v3.0: Validate standard condition if used alone
            if num_conditions == 1:
                # Check if this is a comparison-based condition
                if 'operation' in entry_condition and 'threshold_value' in entry_condition:
                    op = entry_condition['operation']
                    thresh = entry_condition['threshold_value']
                    
                    if not self._validate_standalone_condition(op, thresh):
                        print("\n   ⚠️  WARNING: These parameters are too broad!")
                        print("   This condition would trigger on every candle.")
                        print("   You need prior conditions to filter entries.\n")
                        
                        num_prior = self._get_valid_int("   Number of prior conditions to add: ", min_val=1)
                        
                        # Get prior conditions
                        for i in range(num_prior):
                            print(f"\n   === Prior Condition #{i + 1} (prerequisite) ===")
                            condition = self._get_condition_from_user()
                            condition['type'] = 'standard'
                            condition_order.append(('prior', i + 1, condition))
                        
                        print(f"\n   Added {num_prior} prior condition(s)")
        
        condition_order.append(('entry', 0, entry_condition))
        
        # Reorder: entry condition first, then prior conditions
        final_conditions = []
        for cond_type, idx, cond in condition_order:
            if cond_type == 'entry':
                final_conditions.insert(0, cond)  # Entry at index 0
            else:
                final_conditions.append(cond)  # Prior conditions after
        
        self.config['custom_conditions'] = final_conditions
        
        # Display summary and ask for confirmation
        self._display_condition_summary()
        
        confirm = input("\n   Confirm conditions? (yes/no): ").strip().lower()
        if confirm not in ['yes', 'y']:
            print("\n   Configuration cancelled. Please restart.")
            exit()
        
        print("\n   Custom conditions configured!")
    
    def _get_condition_from_user(self) -> Dict:
        """Helper to get a single condition from user"""
        condition = {}
        
        # Left side
        print("   Left Side:")
        condition['left_day'] = int(input("     Day (0=today, -1=yesterday, etc.): ").strip())
        condition['left_candle'] = input("     Candle type (min/hr/day): ").strip().lower()
        condition['left_multiplier'] = int(input("     Multiplier: ").strip())
        condition['left_type'] = input("     Price type (open/high/low/close/vwap): ").strip().lower()
        
        # Operation
        condition['operation'] = input("   Operation (>, <, >=, <=, =): ").strip()
        
        # Right side
        print("   Right Side:")
        condition['right_day'] = int(input("     Day (0=today, -1=yesterday, etc.): ").strip())
        condition['right_candle'] = input("     Candle type (min/hr/day): ").strip().lower()
        condition['right_multiplier'] = int(input("     Multiplier: ").strip())
        condition['right_type'] = input("     Price type (open/high/low/close/vwap): ").strip().lower()
        
        # Threshold
        condition['threshold_unit'] = input("   Threshold unit (% or $): ").strip()
        condition['threshold_value'] = float(input("   Threshold value: ").strip())
        
        return condition
    
    def _display_condition_summary(self):
        """Display human-readable summary of conditions for confirmation"""
        print("\n   " + "=" * 60)
        print("   CONDITION SUMMARY")
        print("   " + "=" * 60)
        
        for idx, cond in enumerate(self.config['custom_conditions']):
            if idx == 0:
                print("\n   Entry Condition:")
            else:
                print(f"\n   Prior Condition #{idx}:")
            
            # Check if velocity condition
            if cond.get('type') == 'velocity':
                print(f"   Velocity: {cond['operation']} {cond['threshold_value']}% in {cond['lookback']} minutes")
            else:
                # Standard condition
                # Format left side with multiplier
                left_desc = f"Day [{cond['left_day']}] "
                if cond['left_multiplier'] > 1:
                    left_desc += f"{cond['left_multiplier']}{cond['left_candle']} "
                else:
                    left_desc += f"{cond['left_candle']} "
                left_desc += cond['left_type']
                
                # Format right side with multiplier
                right_desc = f"Day [{cond['right_day']}] "
                if cond['right_multiplier'] > 1:
                    right_desc += f"{cond['right_multiplier']}{cond['right_candle']} "
                else:
                    right_desc += f"{cond['right_candle']} "
                right_desc += cond['right_type']
                
                # Format threshold
                threshold_desc = f"{cond['threshold_value']}{cond['threshold_unit']}"
                
                # Print summary line
                print(f"   {left_desc} {cond['operation']} {right_desc} by {threshold_desc}")
        
        print("\n   " + "=" * 60)
    
    def _configure_entry_criteria(self):
        print("\n5. Entry Criteria:")
        print("   [1] Long")
        print("   [2] Short")
        direction = self._get_valid_choice("   Select (1-2): ", ['1', '2'])
        self.config['direction'] = 'long' if direction == '1' else 'short'
        
        print("\n   Position Sizing:")
        print("   [1] Number of shares")
        print("   [2] Dollar amount")
        print("   [3] Percent of capital")
        sizing_choice = self._get_valid_choice("   Select (1-3): ", ['1', '2', '3'])
        
        if sizing_choice == "1":
            self.config['sizing_type'] = 'shares'
            self.config['sizing_value'] = self._get_valid_int("   Number of shares: ", min_val=1)
        elif sizing_choice == "2":
            self.config['sizing_type'] = 'dollars'
            self.config['sizing_value'] = self._get_valid_float("   Dollar amount: ", min_val=0.01)
        else:
            self.config['sizing_type'] = 'percent'
            self.config['starting_capital'] = self._get_valid_float("   Starting capital ($): ", min_val=1)
            self.config['sizing_value'] = self._get_valid_float("   Percent of capital (%): ", min_val=0.01, max_val=100)
    
    def _configure_exit_criteria(self):
        print("\n6. Exit Criteria:")
        
        print("\n   Take Profit:")
        print("   [1] Percent (%)")
        print("   [2] Dollar ($)")
        tp_choice = self._get_valid_choice("   Select (1-2): ", ['1', '2'])
        self.config['take_profit_type'] = 'percent' if tp_choice == '1' else 'dollar'
        self.config['take_profit_value'] = self._get_valid_float("   Value: ", min_val=0.01)
        
        print("\n   Stop Loss:")
        print("   [1] Percent (%)")
        print("   [2] Dollar ($)")
        sl_choice = self._get_valid_choice("   Select (1-2): ", ['1', '2'])
        self.config['stop_loss_type'] = 'percent' if sl_choice == '1' else 'dollar'
        self.config['stop_loss_value'] = self._get_valid_float("   Value: ", min_val=0.01)
        
        self.config['max_days'] = self._get_valid_int("\n   Max days in trade: ", min_val=1)
    
    def _configure_consecutive_trades(self):
        """Configure whether to allow consecutive trades on same symbol"""
        print("\n7. Consecutive Trades:")
        print("   Allow new entry if already in position for same symbol?")
        allow = self._get_valid_yes_no("   Allow consecutive trades? (y/n): ")
        self.config['allow_consecutive_trades'] = allow
        self.config['allow_consecutive_trades'] = (allow == 'y')
    
    def _extend_date_range(self, start_date: str, end_date: str, max_days: int) -> Tuple[str, str]:
        start_dt = datetime.strptime(start_date, '%Y-%m-%d')
        end_dt = datetime.strptime(end_date, '%Y-%m-%d')
        
        # Extend backwards to get enough prior days for custom conditions
        extended_start = start_dt - timedelta(days=30)  # More buffer for custom conditions
        extended_end = end_dt + timedelta(days=max_days * 2)
        
        return extended_start.strftime('%Y-%m-%d'), extended_end.strftime('%Y-%m-%d')
    
    def fetch_data(self, symbol: str, start_date: str, end_date: str, 
                   multiplier: int = 1, timespan: str = "minute") -> pd.DataFrame:
        """Fetch data and convert to US/Eastern timezone"""
        print(f"Fetching data for {symbol} from {start_date} to {end_date}...")
        
        try:
            aggs = []
            for a in self.client.list_aggs(
                symbol, multiplier, timespan, start_date, end_date,
                adjusted=True, sort="asc", limit=50000,
            ):
                aggs.append(a)
            
            if not aggs:
                print(f"No data found for {symbol}")
                return pd.DataFrame()
            
            df = pd.DataFrame([{
                'timestamp': a.timestamp,
                'open': a.open,
                'high': a.high,
                'low': a.low,
                'close': a.close,
                'volume': a.volume,
                'vwap': a.vwap if hasattr(a, 'vwap') else None,
            } for a in aggs])
            
            # Convert to US/Eastern timezone
            df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms', utc=True)
            df['timestamp'] = df['timestamp'].dt.tz_convert('US/Eastern')
            df = df.sort_values('timestamp').reset_index(drop=True)
            
            print(f"Fetched {len(df)} candles for {symbol} (US/Eastern timezone)")
            return df
            
        except Exception as e:
            print(f"Error fetching data for {symbol}: {e}")
            return pd.DataFrame()
    
    def get_regular_hours_close(self, day_data: pd.DataFrame) -> Tuple[float, pd.Timestamp]:
        """Get close at 16:00, fallback to 15:59"""
        candle_16 = day_data[day_data['timestamp'].dt.hour == 16]
        candle_16 = candle_16[candle_16['timestamp'].dt.minute == 0]
        
        if not candle_16.empty:
            return candle_16['close'].iloc[0], candle_16['timestamp'].iloc[0]
        
        candle_1559 = day_data[day_data['timestamp'].dt.hour == 15]
        candle_1559 = candle_1559[candle_1559['timestamp'].dt.minute == 59]
        
        if not candle_1559.empty:
            return candle_1559['close'].iloc[0], candle_1559['timestamp'].iloc[0]
        
        regular_hours = day_data[day_data['timestamp'].dt.hour < 16]
        
        if regular_hours.empty:
            return day_data['close'].iloc[0], day_data['timestamp'].iloc[0]
        
        return regular_hours['close'].iloc[-1], regular_hours['timestamp'].iloc[-1]
    
    def get_open_930(self, day_data: pd.DataFrame) -> Tuple[Optional[float], Optional[pd.Series]]:
        """Get the 9:30 open candle"""
        candle_930 = day_data[day_data['timestamp'].dt.hour == 9]
        candle_930 = candle_930[candle_930['timestamp'].dt.minute == 30]
        
        if candle_930.empty:
            return None, None
        
        candle = candle_930.iloc[0]
        return candle['open'], candle
    
    def _resolve_bucket(self, day_data: pd.DataFrame, day_offset: int,
                        candle_type: str, multiplier: int,
                        current_candle=None) -> pd.DataFrame:
        """
        Return the subset of bars in day_data that belong to the N-minute/N-hour
        bucket that the current_candle falls into.

        Session anchor: 4:00 AM every day.
        candle_type 'hr'  → bucket size = multiplier * 60 minutes
        candle_type 'min' → bucket size = multiplier minutes

        For day_offset == 0 (today), day_data should already be truncated to
        current_candle's timestamp by the caller; we return bars from bucket_start
        onward (up to the already-truncated end).

        For day_offset != 0 (prior day), we return the full completed bucket.
        """
        if 'timestamp' not in day_data.columns or day_data.empty:
            return day_data

        n_minutes = int(multiplier) * (60 if candle_type == 'hr' else 1)

        # Determine which bucket the current bar belongs to
        ref_ts = current_candle.get('timestamp') if current_candle is not None else None
        if ref_ts is None:
            # No reference → use last bar of this day as a fallback
            ref_ts = day_data.sort_values('timestamp')['timestamp'].iloc[-1]

        try:
            # 4:00 AM on the reference (current) candle's date
            ref_day_open = ref_ts.normalize() + pd.Timedelta(hours=4)
            elapsed = int((ref_ts - ref_day_open).total_seconds() / 60)
        except Exception:
            return day_data

        if elapsed < 0:
            return pd.DataFrame()   # before 4:00 AM — no valid bucket

        bucket_idx = elapsed // n_minutes

        # Map that bucket index onto the TARGET day
        sorted_data = day_data.sort_values('timestamp')
        try:
            target_day_open = sorted_data['timestamp'].iloc[0].normalize() + pd.Timedelta(hours=4)
        except Exception:
            return day_data

        bucket_start = target_day_open + pd.Timedelta(minutes=bucket_idx * n_minutes)
        bucket_end   = bucket_start    + pd.Timedelta(minutes=n_minutes)

        if day_offset == 0:
            # Today: data already truncated to current_candle; return from bucket_start
            return sorted_data[sorted_data['timestamp'] >= bucket_start]
        else:
            # Prior day: completed bucket
            return sorted_data[
                (sorted_data['timestamp'] >= bucket_start) &
                (sorted_data['timestamp'] <  bucket_end)
            ]

    def get_candle_value(self, grouped_data: Dict, dates: List, current_date_index: int,
                        day_offset: int, candle_type: str, multiplier: int,
                        price_type: str, current_candle=None) -> Optional[float]:
        """
        Get price/OHLCV value from a specified candle window.

        day_offset  : 0=today, -1=yesterday, -2=two days ago, etc.
        candle_type : 'day' → full session aggregate (running on day=0)
                      'hr'  → N-hour candle bucket from 4:00 AM (multiplier = hours)
                      'min' → N-minute candle bucket from 4:00 AM (multiplier = minutes)
        multiplier  : candle size (hours for 'hr', minutes for 'min')
        price_type  : 'open', 'high', 'low', 'close', 'vwap'
        current_candle : determines which bucket we are in and prevents lookahead on day=0
        """
        try:
            target_date_index = current_date_index + day_offset
            if target_date_index < 0 or target_date_index >= len(dates):
                return None

            target_date = dates[target_date_index]
            if target_date not in grouped_data.groups:
                return None

            day_data = grouped_data.get_group(target_date).copy()

            # Prevent lookahead: for day=0, only use bars up to the current candle
            if day_offset == 0 and current_candle is not None and 'timestamp' in day_data.columns:
                ts = current_candle.get('timestamp')
                if ts is not None:
                    day_data = day_data[day_data['timestamp'] <= ts]
            if day_data.empty:
                return None

            def extract_price(df: pd.DataFrame, pt: str) -> Optional[float]:
                if df.empty:
                    return None
                if pt == 'high':
                    return float(df['high'].max())
                elif pt == 'low':
                    return float(df['low'].min())
                elif pt == 'open':
                    return float(df['open'].iloc[0])
                elif pt == 'vwap':
                    if 'vwap' in df.columns and df['vwap'].notna().any():
                        return float(df['vwap'].mean())
                    return float(df['close'].iloc[-1])
                else:
                    return float(df['close'].iloc[-1])

            if candle_type == 'day':
                return extract_price(day_data, price_type)

            if 'timestamp' not in day_data.columns:
                return extract_price(day_data, price_type)

            # min / hr: resolve the correct N-minute bucket
            bucket = self._resolve_bucket(day_data, day_offset, candle_type,
                                          multiplier, current_candle)
            if bucket.empty:
                return None
            return extract_price(bucket, price_type)

        except Exception:
            return None

    _INDICATOR_TYPES = {'sma', 'ema', 'rsi', 'macd'}

    def _get_volume(self, condition: Dict, side: str, grouped_data: Dict, dates: List,
                    current_date_index: int, current_candle=None) -> Optional[float]:
        """Get aggregated volume for a specified candle bucket."""
        try:
            day_offset  = condition.get(f'{side}_day', 0)
            candle_type = condition.get(f'{side}_candle', 'day')
            multiplier  = int(condition.get(f'{side}_multiplier', 1))

            target_idx = current_date_index + day_offset
            if target_idx < 0 or target_idx >= len(dates):
                return None
            target_date = dates[target_idx]
            if target_date not in grouped_data.groups:
                return None

            day_data = grouped_data.get_group(target_date).copy()
            if 'volume' not in day_data.columns:
                return None

            # Prevent lookahead for day=0
            if day_offset == 0 and current_candle is not None and 'timestamp' in day_data.columns:
                ts = current_candle.get('timestamp')
                if ts is not None:
                    day_data = day_data[day_data['timestamp'] <= ts]
            if day_data.empty:
                return None

            if candle_type == 'day':
                return float(day_data['volume'].sum())

            if 'timestamp' not in day_data.columns:
                return float(day_data['volume'].sum())

            # min / hr: resolve the correct N-minute bucket
            bucket = self._resolve_bucket(day_data, day_offset, candle_type,
                                          multiplier, current_candle)
            if bucket.empty:
                return None
            return float(bucket['volume'].sum())

        except Exception:
            return None

    def _get_price_series(self, grouped_data, dates, current_date_index, day_offset,
                          series_type='close', current_candle=None):
        """Build a price series from grouped_data up to and including the target day.
        When current_candle is provided and day_offset==0, truncates at current_candle
        timestamp to avoid lookahead bias."""
        try:
            target_idx = current_date_index + day_offset
            end_idx = min(target_idx + 1, len(dates))
            frames = []
            for i in range(max(0, end_idx - 60), end_idx):
                d = dates[i]
                if d in grouped_data.groups:
                    frames.append(grouped_data.get_group(d))
            if not frames:
                return None
            combined = pd.concat(frames)
            if current_candle is not None and day_offset == 0 and 'timestamp' in combined.columns:
                ts = current_candle.get('timestamp') or current_candle.name
                combined = combined[combined['timestamp'] <= ts]
                if combined.empty:
                    return None
            col = series_type if series_type in combined.columns else 'close'
            return combined[col]
        except Exception:
            return None

    def _compute_indicator(self, condition, side, grouped_data, dates, current_date_index,
                           current_candle=None):
        """Compute an indicator value for a given side (left/right) of a condition."""
        ind_type = condition.get(f'{side}_type')
        day_offset = condition.get(f'{side}_day', 0)
        series_type = condition.get(f'{side}_series', 'close')
        series = self._get_price_series(grouped_data, dates, current_date_index, day_offset,
                                        series_type, current_candle=current_candle)
        if series is None or len(series) < 2:
            return None

        try:
            if ind_type == 'sma':
                window = int(condition.get(f'{side}_window', 20))
                result = series.rolling(window=window, min_periods=window).mean()
                return float(result.iloc[-1]) if not pd.isna(result.iloc[-1]) else None

            elif ind_type == 'ema':
                window = int(condition.get(f'{side}_window', 20))
                result = series.ewm(span=window, adjust=False).mean()
                return float(result.iloc[-1]) if not pd.isna(result.iloc[-1]) else None

            elif ind_type == 'rsi':
                window = int(condition.get(f'{side}_window', 14))
                delta = series.diff()
                gain = delta.clip(lower=0)
                loss = (-delta.clip(upper=0))
                avg_gain = gain.rolling(window=window, min_periods=window).mean()
                avg_loss = loss.rolling(window=window, min_periods=window).mean()
                rs = avg_gain / avg_loss.replace(0, float('nan'))
                rsi = 100 - (100 / (1 + rs))
                val = rsi.iloc[-1]
                return float(val) if not pd.isna(val) else None

            elif ind_type == 'macd':
                short_w = int(condition.get(f'{side}_macd_short', 12))
                long_w = int(condition.get(f'{side}_macd_long', 26))
                signal_w = int(condition.get(f'{side}_macd_signal', 9))
                component = condition.get(f'{side}_macd_component', 'histogram')
                ema_short = series.ewm(span=short_w, adjust=False).mean()
                ema_long = series.ewm(span=long_w, adjust=False).mean()
                macd_line = ema_short - ema_long
                signal_line = macd_line.ewm(span=signal_w, adjust=False).mean()
                histogram = macd_line - signal_line
                if component == 'macd':
                    val = macd_line.iloc[-1]
                elif component == 'signal':
                    val = signal_line.iloc[-1]
                else:
                    val = histogram.iloc[-1]
                return float(val) if not pd.isna(val) else None

        except Exception:
            return None
        return None

    # ------------------------------------------------------------------
    # Trend Capture helpers
    # ------------------------------------------------------------------

    def _get_tc_window_data(self, grouped_data, dates, current_date_index, time_window, entry_ts):
        """Return a DataFrame of minute bars for the requested trend-capture time window.

        All data is guaranteed to be STRICTLY BEFORE entry_ts (lookahead-safe).
        """
        try:
            current_date = dates[current_date_index]

            if time_window == 'prior_day':
                prev_idx = current_date_index - 1
                if prev_idx < 0:
                    return None
                prev_date = dates[prev_idx]
                if prev_date not in grouped_data.groups:
                    return None
                return grouped_data.get_group(prev_date).copy()

            elif time_window == 'day_of_entry':
                if current_date not in grouped_data.groups:
                    return None
                data = grouped_data.get_group(current_date).copy()
                if entry_ts is not None and 'timestamp' in data.columns:
                    data = data[data['timestamp'] < entry_ts]
                return data if not data.empty else None

            elif time_window in ('week_of_entry', 'month_of_entry'):
                current_pd = pd.Timestamp(current_date)
                if time_window == 'week_of_entry':
                    window_start = current_pd - pd.Timedelta(days=current_pd.dayofweek)
                else:
                    window_start = current_pd.replace(day=1)
                frames = []
                for d in dates:
                    pd_d = pd.Timestamp(d)
                    if pd_d < window_start:
                        continue
                    if pd_d > current_pd:
                        break
                    if d not in grouped_data.groups:
                        continue
                    day_data = grouped_data.get_group(d).copy()
                    if d == current_date and entry_ts is not None and 'timestamp' in day_data.columns:
                        day_data = day_data[day_data['timestamp'] < entry_ts]
                    if not day_data.empty:
                        frames.append(day_data)
                if not frames:
                    return None
                return pd.concat(frames, ignore_index=True)
        except Exception:
            return None
        return None

    def _compute_trend_capture_slope(self, condition, side, grouped_data, dates,
                                     current_date_index, current_candle):
        """Compute the OLS slope (and R) for a trend-capture config on one side.

        Returns (slope, r_value, checks_pass) or (None, None, False) on failure.
        `checks_pass` means: direction OK + optional slope-value check + optional R check.
        """
        try:
            p = f'tc_{side}_'
            interval    = condition.get(p + 'interval',    '1hr')
            time_window = condition.get(p + 'time_window', 'day_of_entry')
            price_type  = condition.get(p + 'price_type',  'lowest_low')
            slope_dir   = condition.get(p + 'slope_dir',   'negative')

            interval_mins = {'15min': 15, '30min': 30, '1hr': 60, '2hr': 120}.get(interval, 60)

            entry_ts = None
            if current_candle is not None:
                entry_ts = current_candle.get('timestamp')

            raw = self._get_tc_window_data(grouped_data, dates, current_date_index,
                                           time_window, entry_ts)
            if raw is None or raw.empty or 'timestamp' not in raw.columns:
                return None, None, False

            raw = raw.copy()
            raw['timestamp'] = pd.to_datetime(raw['timestamp'])
            raw = raw.set_index('timestamp').sort_index()

            price_col = 'high' if price_type == 'highest_high' else 'low'
            if price_col not in raw.columns:
                return None, None, False

            rule = f'{interval_mins}min'
            if price_type == 'highest_high':
                resampled = raw[price_col].resample(rule).max().dropna()
            else:
                resampled = raw[price_col].resample(rule).min().dropna()

            if len(resampled) < 2:
                return None, None, False

            x = np.arange(len(resampled), dtype=float)
            y = resampled.values.astype(float)
            result = _linregress(x, y)
            slope   = float(result.slope)
            r_value = float(result.rvalue)

            # Direction check
            if slope_dir == 'negative' and slope >= 0:
                return slope, r_value, False
            if slope_dir == 'positive' and slope <= 0:
                return slope, r_value, False

            # Optional slope-value check
            if condition.get(p + 'slope_val_enabled'):
                op  = condition.get(p + 'slope_op', '>')
                thr = float(condition.get(p + 'slope_val', 0) or 0)
                if not self._evaluate_operator(slope, op, thr):
                    return slope, r_value, False

            # Optional R-value check
            if condition.get(p + 'r_enabled'):
                r_op  = condition.get(p + 'r_op', '>')
                r_thr = float(condition.get(p + 'r_val', 0) or 0)
                if not self._evaluate_operator(r_value, r_op, r_thr):
                    return slope, r_value, False

            return slope, r_value, True

        except Exception:
            return None, None, False

    def _check_trend_capture_condition(self, condition, grouped_data, dates,
                                       current_date_index, current_candle):
        """Evaluate a trend_capture metric condition.

        comparator='value'               → boolean: does the left trend pass its config?
        comparator='compare_trend_capture' → left_slope (operator) right_slope,
                                            both sides must individually pass their config.
        """
        left_slope, left_r, left_ok = self._compute_trend_capture_slope(
            condition, 'left', grouped_data, dates, current_date_index, current_candle)
        if not left_ok:
            return False

        comparator = condition.get('comparator', 'value')
        if comparator == 'compare_trend_capture':
            right_slope, right_r, right_ok = self._compute_trend_capture_slope(
                condition, 'right', grouped_data, dates, current_date_index, current_candle)
            if not right_ok:
                return False
            operation = condition.get('operation', '>')
            return self._compare(left_slope, operation, right_slope)

        # comparator == 'value': boolean result (direction + optional checks already verified)
        return True

    # ------------------------------------------------------------------

    def check_custom_condition(self, condition: Dict, grouped_data: Dict, dates: List,
                              current_date_index: int, current_candle: Optional[pd.Series] = None) -> bool:
        """
        NEW v3.0: Check if custom condition is met
        
        Returns True if condition is satisfied
        """
        if condition.get('type') == 'velocity':
            return self.check_velocity_condition(condition, grouped_data, dates, current_date_index, current_candle)

        if condition.get('left_type') == 'trend_capture':
            return self._check_trend_capture_condition(condition, grouped_data, dates, current_date_index, current_candle)

        # Apply optional time window filter
        if condition.get('time_window_enabled') and current_candle is not None:
            ts = current_candle.get('timestamp')
            if ts is not None:
                candle_mins = ts.hour * 60 + ts.minute
                try:
                    sh, sm = map(int, condition.get('time_window_start', '00:00').split(':'))
                    eh, em = map(int, condition.get('time_window_end', '23:59').split(':'))
                    if not (sh * 60 + sm <= candle_mins <= eh * 60 + em):
                        return False
                except Exception:
                    pass

        try:
            left_type = condition.get('left_type', 'close')
            right_type = condition.get('right_type', 'close')

            if left_type == 'volume':
                left_value = self._get_volume(condition, 'left', grouped_data, dates, current_date_index, current_candle)
            elif left_type in self._INDICATOR_TYPES:
                left_value = self._compute_indicator(condition, 'left', grouped_data, dates, current_date_index, current_candle)
            elif condition['left_day'] == 0 and condition['left_candle'] == 'min' and current_candle is not None:
                left_value = current_candle[left_type]
            else:
                left_value = self.get_candle_value(
                    grouped_data, dates, current_date_index,
                    condition['left_day'], condition['left_candle'],
                    condition['left_multiplier'], left_type,
                    current_candle=current_candle
                )

            if right_type == 'value':
                right_value = condition.get('right_fixed_value', 0)
            elif right_type == 'volume':
                right_value = self._get_volume(condition, 'right', grouped_data, dates, current_date_index, current_candle)
            elif right_type in self._INDICATOR_TYPES:
                right_value = self._compute_indicator(condition, 'right', grouped_data, dates, current_date_index, current_candle)
            elif condition['right_day'] == 0 and condition['right_candle'] == 'min' and current_candle is not None:
                right_value = current_candle[right_type]
            else:
                right_value = self.get_candle_value(
                    grouped_data, dates, current_date_index,
                    condition['right_day'], condition['right_candle'],
                    condition['right_multiplier'], right_type,
                    current_candle=current_candle
                )
            
            if left_value is None or right_value is None:
                return False
            
            if pd.isna(left_value) or pd.isna(right_value):
                return False

            threshold_unit = condition.get('threshold_unit', '%')
            threshold_value = float(condition.get('threshold_value', 0) or 0)
            operation = condition['operation']

            # Cross operators — check prev vs current candle relationship
            if operation in ('cross_up', 'cross_down', 'cross_either'):
                prev_candle = None
                if current_candle is not None:
                    current_date = dates[current_date_index]
                    if current_date in grouped_data.groups:
                        day_data = grouped_data.get_group(current_date)
                        try:
                            loc = day_data.index.get_loc(current_candle.name)
                            if loc > 0:
                                prev_candle = day_data.iloc[loc - 1]
                        except Exception:
                            pass
                if prev_candle is None:
                    return False  # Can't detect a cross on the first candle of the day

                # Compute previous left value
                if left_type in self._INDICATOR_TYPES:
                    prev_left = self._compute_indicator(condition, 'left', grouped_data, dates, current_date_index, prev_candle)
                elif left_type == 'volume':
                    prev_left = self._get_volume(condition, 'left', grouped_data, dates, current_date_index, prev_candle)
                else:
                    # handles vwap, price columns, etc. — pass prev_candle as the "current" bar
                    prev_left = self.get_candle_value(
                        grouped_data, dates, current_date_index,
                        condition.get('left_day', 0), condition.get('left_candle', 'min'),
                        condition.get('left_multiplier', 1), left_type,
                        current_candle=prev_candle
                    )

                # Compute previous right value
                if right_type == 'value':
                    prev_right = right_value  # fixed threshold never changes
                elif right_type in self._INDICATOR_TYPES:
                    prev_right = self._compute_indicator(condition, 'right', grouped_data, dates, current_date_index, prev_candle)
                elif right_type == 'volume':
                    prev_right = self._get_volume(condition, 'right', grouped_data, dates, current_date_index, prev_candle)
                else:
                    prev_right = self.get_candle_value(
                        grouped_data, dates, current_date_index,
                        condition.get('right_day', 0), condition.get('right_candle', 'min'),
                        condition.get('right_multiplier', 1), right_type,
                        current_candle=prev_candle
                    )

                if prev_left is None or prev_right is None:
                    return False
                try:
                    if pd.isna(prev_left) or pd.isna(prev_right):
                        return False
                except Exception:
                    return False

                was_below  = prev_left < prev_right
                was_above  = prev_left > prev_right
                now_above  = left_value >= right_value
                now_below  = left_value <= right_value

                if operation == 'cross_up':
                    return was_below and now_above
                elif operation == 'cross_down':
                    return was_above and now_below
                else:  # cross_either
                    return (was_below and now_above) or (was_above and now_below)

            # x-Multiplier: left vs right * multiplier (direct comparison, no change %)
            if threshold_unit == 'x':
                adjusted_right = right_value * threshold_value if threshold_value else right_value
                return self._compare(left_value, operation, adjusted_right)

            # Calculate comparison
            if threshold_unit == '%':
                if right_value == 0:
                    change = left_value - right_value
                else:
                    change = ((left_value / right_value) - 1) * 100
            else:  # '$'
                change = left_value - right_value

            # Evaluate operation
            if operation == '>':
                return change > threshold_value
            elif operation == '<':
                return change < threshold_value
            elif operation == '>=':
                return change >= threshold_value
            elif operation == '<=':
                return change <= threshold_value
            elif operation == '=':
                return abs(change - threshold_value) < 0.01

            return False
            
        except Exception as e:
            return False
    
    def check_velocity_condition(self, condition: Dict, grouped_data: Dict, dates: List,
                                 current_date_index: int, current_candle: Optional[pd.Series]) -> bool:
        """
        NEW v3.0: Check velocity/rate-of-change condition
        
        Calculates percentage change over N-minute lookback period
        Example: 15% move in last 3 minutes
        """
        if current_candle is None:
            return False
        
        try:
            lookback_minutes = condition['lookback']
            current_date = dates[current_date_index]
            current_data = grouped_data.get_group(current_date)
            
            # Get current candle index in day's data
            current_idx = current_data.index.get_loc(current_candle.name)
            
            # Calculate lookback index
            lookback_idx = current_idx - lookback_minutes
            
            if lookback_idx < 0:
                # Not enough data for lookback
                return False
            
            # Get candle from N minutes ago
            lookback_candle = current_data.iloc[lookback_idx]
            
            # Calculate percentage change from lookback to current
            # Using close prices for velocity calculation
            lookback_price = lookback_candle['close']
            current_price = current_candle['close']
            
            if pd.isna(lookback_price) or pd.isna(current_price) or lookback_price == 0:
                return False
            
            change_pct = ((current_price / lookback_price) - 1) * 100
            
            # Evaluate operator
            return self._evaluate_operator(change_pct, condition['operation'], condition['threshold_value'])
            
        except Exception as e:
            return False
    
    def check_preset_condition_intraday(self, symbol: str, current_candle: pd.Series, 
                                       prev_close: float, open_930_price: Optional[float] = None) -> Tuple[bool, str, float]:
        """Check preset conditions (Premarket/Change/Gap/Change-Open %)"""
        preset = self.config['preset_condition']
        operator = self.config.get('preset_operator', '>')
        threshold = self.config.get('preset_threshold', 0)
        
        try:
            candle_time = current_candle['timestamp']
            hour = candle_time.hour
            minute = candle_time.minute
            
            if preset == '1':  # Premarket Change %
                in_premarket = hour >= 4 and (hour < 9 or (hour == 9 and minute <= 29))
                if not in_premarket:
                    return False, None, None
                return self._check_price_points_vs_reference(
                    current_candle, prev_close, operator, threshold
                )
            
            elif preset == '2':  # Change %
                return self._check_price_points_vs_reference(
                    current_candle, prev_close, operator, threshold
                )
            
            elif preset == '3':  # Gap %
                if not (hour == 9 and minute == 30):
                    return False, None, None
                
                open_price = current_candle['open']
                if pd.isna(open_price):
                    return False, None, None
                
                gap_pct = ((open_price / prev_close) - 1) * 100
                
                if self._evaluate_operator(gap_pct, operator, threshold):
                    vwap = current_candle.get('vwap')
                    if pd.notna(vwap):
                        return True, 'vwap', vwap
                    else:
                        return True, 'close', current_candle['close']
                
                return False, None, None
            
            elif preset == '4':  # Change-Open %
                if hour < 9 or (hour == 9 and minute < 30):
                    return False, None, None
                
                if open_930_price is None:
                    return False, None, None
                
                return self._check_price_points_vs_reference(
                    current_candle, open_930_price, operator, threshold
                )
            
            else:
                return False, None, None
                
        except Exception as e:
            return False, None, None
    
    def _check_price_points_vs_reference(self, candle: pd.Series, reference_price: float,
                                         operator: str, threshold: float) -> Tuple[bool, str, float]:
        """Check if any price point in candle meets threshold vs reference price"""
        price_points = {
            'open': candle['open'],
            'high': candle['high'],
            'low': candle['low'],
            'close': candle['close'],
        }
        
        for point_name, price in price_points.items():
            if pd.isna(price):
                continue
            
            change_pct = ((price / reference_price) - 1) * 100
            
            if self._evaluate_operator(change_pct, operator, threshold):
                vwap = candle.get('vwap')
                if pd.notna(vwap):
                    return True, 'vwap', vwap
                else:
                    return True, 'close', candle['close']
        
        return False, None, None
    
    def _evaluate_operator(self, value: float, operator: str, threshold: float) -> bool:
        """Evaluate operator comparison"""
        if operator == '>':
            return value > threshold
        elif operator == '<':
            return value < threshold
        elif operator == '>=':
            return value >= threshold
        elif operator == '<=':
            return value <= threshold
        elif operator == '=':
            return abs(value - threshold) < 0.01
        else:
            return False
    
    def calculate_position_size(self, price: float, capital: float) -> int:
        sizing_type = self.config['sizing_type']
        sizing_value = self.config['sizing_value']
        
        if sizing_type == 'shares':
            return int(sizing_value)
        elif sizing_type == 'dollars':
            return int(sizing_value / price)
        else:
            dollar_amount = capital * (sizing_value / 100)
            return int(dollar_amount / price)
    
    def check_exit_conditions_intraday(self, entry_price: float, candle_high: float,
                                      candle_low: float, direction: str) -> Tuple[bool, str, float]:
        """Check if TP or SL hit within candle"""
        tp_type = self.config.get('take_profit_type', 'percent')
        tp_value = self.config.get('take_profit_value', 0)
        sl_type = self.config.get('stop_loss_type', 'percent')
        sl_value = self.config.get('stop_loss_value', 0)
        
        if direction == 'long':
            if tp_value and tp_value > 0:
                if tp_type == 'percent':
                    tp_price = entry_price * (1 + tp_value / 100)
                else:
                    tp_price = entry_price + tp_value
                if candle_high >= tp_price:
                    return True, 'take_profit', tp_price
            
            if sl_value and sl_value > 0:
                if sl_type == 'percent':
                    sl_price = entry_price * (1 - sl_value / 100)
                else:
                    sl_price = entry_price - sl_value
                if candle_low <= sl_price:
                    return True, 'stop_loss', sl_price
                
        else:  # short
            if tp_value and tp_value > 0:
                if tp_type == 'percent':
                    tp_price = entry_price * (1 - tp_value / 100)
                else:
                    tp_price = entry_price - tp_value
                if candle_low <= tp_price:
                    return True, 'take_profit', tp_price
            
            if sl_value and sl_value > 0:
                if sl_type == 'percent':
                    sl_price = entry_price * (1 + sl_value / 100)
                else:
                    sl_price = entry_price + sl_value
                if candle_high >= sl_price:
                    return True, 'stop_loss', sl_price
        
        return False, None, None

    def check_exit_signal_conditions(self, candle, grouped_data, dates, day_idx,
                                     prev_close, open_930_price) -> Tuple[bool, str]:
        """Check custom/preset exit signal conditions against current candle"""
        exit_cond_type = self.config.get('exit_cond_type', '')

        if exit_cond_type == 'preset' and self.config.get('exit_preset_condition'):
            cond_id = self.config['exit_preset_condition']
            operator = self.config.get('exit_preset_operator', '>')
            threshold = self.config.get('exit_preset_threshold', 0)

            if cond_id == '5':
                lookback = self.config.get('exit_velocity_lookback', 5)
                vel_cond = {
                    'type': 'velocity',
                    'lookback': lookback,
                    'operation': operator,
                    'threshold_value': threshold
                }
                if self.check_velocity_condition(vel_cond, grouped_data, dates, day_idx, candle):
                    return True, 'exit_preset_velocity'
            else:
                price = candle.get('vwap') if pd.notna(candle.get('vwap')) else candle['close']
                computed_val = None
                if cond_id == '1':  # Premarket Change % — time-gated 4:00–9:29
                    candle_time = candle['timestamp']
                    c_hour = candle_time.hour
                    c_min = candle_time.minute
                    in_premarket = c_hour >= 4 and (c_hour < 9 or (c_hour == 9 and c_min <= 29))
                    if prev_close and prev_close > 0 and in_premarket:
                        computed_val = round(((price / prev_close) - 1) * 100, 4)
                elif cond_id == '2':  # Change % — no time gate
                    if prev_close and prev_close > 0:
                        computed_val = round(((price / prev_close) - 1) * 100, 4)
                elif cond_id == '3':
                    if prev_close and prev_close > 0:
                        computed_val = round(((candle['open'] / prev_close) - 1) * 100, 4)
                elif cond_id == '4':
                    if open_930_price and open_930_price > 0:
                        computed_val = round(((price / open_930_price) - 1) * 100, 4)

                if computed_val is not None and self._compare(computed_val, operator, threshold):
                    return True, 'exit_preset'
            return False, None

        elif exit_cond_type == 'custom' and self.config.get('exit_custom_conditions'):
            for exit_cond in self.config['exit_custom_conditions']:
                met = self.check_custom_condition(exit_cond, grouped_data, dates, day_idx, candle)
                if not met:
                    return False, None
            return True, 'exit_condition'

        return False, None

    def _compare(self, left, op, right):
        """Compare two values with the given operator"""
        try:
            left = float(left)
            right = float(right)
        except (TypeError, ValueError):
            return False
        if op == '>': return left > right
        elif op == '<': return left < right
        elif op == '>=': return left >= right
        elif op == '<=': return left <= right
        elif op == '=': return abs(left - right) < 1e-9
        return False
    
    def calculate_pnl(self, entry_price: float, exit_price: float, 
                     shares: int, direction: str) -> Tuple[float, float]:
        if direction == 'long':
            pnl = (exit_price - entry_price) * shares
            pnl_pct = ((exit_price / entry_price) - 1) * 100
        else:  # short
            pnl = (entry_price - exit_price) * shares
            pnl_pct = -1 * ((exit_price / entry_price) - 1) * 100
        
        return pnl, pnl_pct
    
    def run_backtest(self, output_dir='backtest_results', backtest_id=None):
        """
        Run the backtest with configured parameters
        
        Args:
            output_dir: Directory to save results (default: 'backtest_results')
            backtest_id: Optional ID to use in filenames (for web interface)
        """
        print("\n" + "=" * 60)
        print("RUNNING BACKTEST - US/Eastern Timezone (EST/EDT)")
        print("=" * 60)
        print(f"Entry Type: {self.config['entry_type'].upper()}")
        if self.config['entry_type'] == 'custom':
            print(f"Custom Conditions: {len(self.config['custom_conditions'])}")
        print(f"Consecutive trades: {'ALLOWED' if self.config['allow_consecutive_trades'] else 'BLOCKED'}")
        print("=" * 60)
        
        # NEW v3.0: Apply filters if "all" mode is used
        symbols = self.config['symbols']
        if self.config['symbol_mode'] == 'all':
            symbols = self._apply_ticker_filters(symbols, self.config['start_date'])
        
        all_trades = []
        all_decision_log = []
        
        for symbol in symbols:
            print(f"\nProcessing {symbol}...")
            
            extended_start, extended_end = self._extend_date_range(
                self.config['start_date'],
                self.config['end_date'],
                self.config['max_days']
            )
            
            df = self.fetch_data(symbol, extended_start, extended_end, 1, 'minute')
            
            if df.empty:
                continue
            
            trades, decision_log = self._backtest_symbol_intraday(symbol, df)
            all_trades.extend(trades)
            all_decision_log.extend(decision_log)
        
        self.results = all_trades
        self.decision_log = all_decision_log
        self._save_results(output_dir=output_dir, backtest_id=backtest_id)
        self._display_summary()
    
    def _get_condition_description(self) -> str:
        entry_type = self.config.get('entry_type', 'preset')
        if entry_type == 'preset':
            preset = self.config.get('preset_condition', '1')
            op = self.config.get('preset_operator', '>')
            thresh = self.config.get('preset_threshold', 0)
            names = {'1': 'Premarket Change %', '2': 'Change %', '3': 'Gap %', '4': 'Change-Open %', '5': 'Velocity'}
            return f"{names.get(preset, 'Preset')} {op} {thresh}"
        elif entry_type == 'velocity':
            op = self.config.get('velocity_operator', '>')
            thresh = self.config.get('velocity_threshold', 0)
            lookback = self.config.get('velocity_lookback', 5)
            return f"Velocity ({lookback} bars) {op} {thresh}"
        elif entry_type == 'custom':
            conds = self.config.get('custom_conditions', [])
            if conds:
                parts = []
                for c in conds:
                    day_label = lambda d: 'D0' if d == 0 else f'D{d}'
                    candle_label = lambda v: '1m' if v == 'min' else '1h' if v == 'hr' else 'D'
                    parts.append(f"{day_label(c.get('left_day',0))}{candle_label(c.get('left_candle','min'))} {c.get('left_type','close')} {c.get('operation','>')} {day_label(c.get('right_day',0))}{candle_label(c.get('right_candle','min'))} {c.get('right_type','close')}")
                return ' AND '.join(parts)
        return 'Unknown'

    def _get_exit_criteria_description(self) -> str:
        tp_type = self.config.get('take_profit_type', 'percent')
        tp_val = self.config.get('take_profit_value', 0.5)
        sl_type = self.config.get('stop_loss_type', 'percent')
        sl_val = self.config.get('stop_loss_value', 0.5)
        max_d = self.config.get('max_days', 5)
        tp_str = f"+{tp_val}%" if tp_type == 'percent' else f"+${tp_val}"
        sl_str = f"-{sl_val}%" if sl_type == 'percent' else f"-${sl_val}"
        return f"TP: {tp_str} | SL: {sl_str} | Max Days: {max_d}"

    def _get_human_side_label(self, condition, side):
        """Human-readable label for one side of a custom condition."""
        pt = condition.get(f'{side}_type', 'close')
        if side == 'right' and pt == 'value':
            return 'Fixed Value'
        day     = condition.get(f'{side}_day', 0)
        candle  = condition.get(f'{side}_candle', 'min')
        mult    = condition.get(f'{side}_multiplier', 1)
        day_str    = 'Current Day' if day == 0 else ('Prev Day' if day == -1 else f'{abs(day)} Days Ago')
        candle_str = ('Day' if candle == 'day' else (f'{mult}m' if candle == 'min' else f'{mult}h'))
        return f'{day_str} {candle_str} {pt.capitalize()}'

    def _compute_side_value(self, condition, side, grouped, dates, i, sample_candle=None):
        """Compute the numeric value for one side of a condition."""
        pt      = condition.get(f'{side}_type', 'close')
        day     = condition.get(f'{side}_day', 0)
        candle  = condition.get(f'{side}_candle', 'min')
        mult    = condition.get(f'{side}_multiplier', 1)
        if pt == 'value':
            return float(condition.get('right_fixed_value', 0))
        if pt in self._INDICATOR_TYPES:
            try:
                return self._compute_indicator(condition, side, grouped, dates, i, sample_candle)
            except Exception:
                return None
        if day == 0 and candle == 'min' and sample_candle is not None:
            v = sample_candle.get(pt)
            return float(v) if v is not None and not pd.isna(v) else None
        v = self.get_candle_value(grouped, dates, i, day, candle, mult, pt, current_candle=sample_candle)
        return float(v) if v is not None else None

    def _compute_entry_condition_metrics(self, grouped, dates, i, current_data):
        """Return metric info for the entry condition (index 0) — used in skip/no-signal log."""
        conds = self.config.get('custom_conditions', [])
        if not conds:
            return None
        cond = conds[0]
        # Use first candle as a safe sample (no lookahead — we only fetch prev-day refs)
        sample = current_data.iloc[0] if len(current_data) > 0 else None
        right_val = self._compute_side_value(cond, 'right', grouped, dates, i, sample)
        right_label = self._get_human_side_label(cond, 'right')
        threshold       = float(cond.get('threshold_value', 0) or 0)
        threshold_unit  = cond.get('threshold_unit', '%')
        effective_right = None
        if right_val is not None and threshold != 0:
            if threshold_unit == '%':
                effective_right = round(right_val * (1 + threshold / 100), 4)
            elif threshold_unit == '$':
                effective_right = round(right_val + threshold, 4)
            elif threshold_unit == 'x':
                effective_right = round(right_val * threshold, 4)
        return {
            'right_label':      right_label,
            'right_value':      round(right_val, 4) if right_val is not None else None,
            'threshold':        threshold,
            'threshold_unit':   threshold_unit,
            'effective_right':  effective_right if effective_right is not None else (round(right_val, 4) if right_val is not None else None),
        }

    def _compute_condition_value_for_candle(self, candle, prev_close, open_930_price):
        entry_type = self.config.get('entry_type', 'preset')
        if entry_type == 'preset':
            preset = self.config.get('preset_condition', '1')
            price = candle.get('vwap') if pd.notna(candle.get('vwap')) else candle['close']
            if preset in ('1', '2'):
                if prev_close and prev_close > 0:
                    return round(((price / prev_close) - 1) * 100, 4)
            elif preset == '3':
                if prev_close and prev_close > 0:
                    return round(((candle['open'] / prev_close) - 1) * 100, 4)
            elif preset == '4':
                if open_930_price and open_930_price > 0:
                    return round(((price / open_930_price) - 1) * 100, 4)
        return None

    def _backtest_symbol_intraday(self, symbol: str, df: pd.DataFrame) -> Tuple[List[Dict], List[Dict]]:
        trades = []
        decision_log = []
        position = None
        trade_num = 0
        
        df['date'] = df['timestamp'].dt.date
        grouped = df.groupby('date')
        dates = sorted(df['date'].unique())
        
        start_date = datetime.strptime(self.config['start_date'], '%Y-%m-%d').date()
        end_date = datetime.strptime(self.config['end_date'], '%Y-%m-%d').date()
        
        condition_desc = self._get_condition_description()
        exit_criteria_desc = self._get_exit_criteria_description()
        
        print(f"Analyzing {len(dates)} days of data...")
        print(f"Trade window: {start_date} to {end_date}")

        # Progress reporting setup — write a small JSON file every iteration so
        # the frontend can render an accurate progress bar for running backtests.
        import json as _json_progress
        _progress_bt_id = os.environ.get('CURRENT_BACKTEST_ID')
        _progress_path = None
        if _progress_bt_id:
            try:
                os.makedirs('backtest_results', exist_ok=True)
                _progress_path = os.path.join('backtest_results', f'progress_{_progress_bt_id}.json')
            except Exception:
                _progress_path = None
        _progress_total = len(dates)

        for i, current_date in enumerate(dates):
            if _progress_path:
                try:
                    with open(_progress_path, 'w') as _pf:
                        _json_progress.dump({'current': i, 'total': _progress_total}, _pf)
                except Exception:
                    pass
            if current_date < start_date or i == 0:
                continue
            if current_date > end_date and position is None:
                continue
            
            current_data = grouped.get_group(current_date)
            prev_date = dates[i-1]
            prev_data = grouped.get_group(prev_date)
            
            prev_close, prev_close_time = self.get_regular_hours_close(prev_data)
            open_930_price, open_930_candle = self.get_open_930(current_data)
            
            day_entry = {
                'date': str(current_date),
                'symbol': symbol,
                'prev_close': round(prev_close, 2) if prev_close else None,
                'prev_close_time': str(prev_close_time) if prev_close_time else None,
                'condition': condition_desc,
                'exit_criteria': exit_criteria_desc,
                'events': [],
                'status': 'SKIPPED'
            }
            
            exited_this_day = False
            exit_time = None
            
            # Split custom conditions into day-level prerequisites vs sequential (bar-level) phases
            custom_conds = self.config.get('custom_conditions', []) if self.config['entry_type'] == 'custom' else []
            prereq_conds = [c for c in custom_conds[1:] if not c.get('is_sequential')]
            seq_conds    = [c for c in custom_conds[1:] if c.get('is_sequential')]

            prior_conditions_met = True
            if self.config['entry_type'] == 'custom':
                for condition in prereq_conds:
                    if not self.check_custom_condition(condition, grouped, dates, i, None):
                        prior_conditions_met = False
                        break
            elif self.config['entry_type'] != 'custom' and self.config['entry_type'] != 'velocity':
                # legacy fallback: non-custom modes have no prior conditions
                pass

            # Per-day sequential state machine (resets each day, only used when seq_conds exist)
            seq_phase = 0        # 0 = scanning for phase-1 trigger; k>0 = waiting for seq_conds[k-1]
            seq_arm_bar_loc = -1 # bar position (iloc) when the phase last advanced

            if position is None and current_date <= end_date and prior_conditions_met:
                entry_found = False
                bar_loc = -1
                for idx, candle in current_data.iterrows():
                    bar_loc += 1
                    entry_signal, price_point, entry_price = (False, None, None)
                    
                    if self.config['entry_type'] == 'preset':
                        entry_signal, price_point, entry_price = self.check_preset_condition_intraday(
                            symbol, candle, prev_close, open_930_price
                        )
                    elif self.config['entry_type'] == 'velocity':
                        velocity_condition = {
                            'type': 'velocity',
                            'lookback': self.config['velocity_lookback'],
                            'operation': self.config['velocity_operator'],
                            'threshold_value': self.config['velocity_threshold']
                        }
                        if self.check_velocity_condition(velocity_condition, grouped, dates, i, candle):
                            entry_signal = True
                            price_point = 'vwap'
                            entry_price = candle.get('vwap')
                            if pd.isna(entry_price):
                                entry_price = candle['close']
                                price_point = 'close'
                    elif self.config['entry_type'] == 'custom':
                        if seq_phase == 0:
                            # Phase 1: check the entry condition (condition 0)
                            entry_condition = custom_conds[0]
                            if self.check_custom_condition(entry_condition, grouped, dates, i, candle):
                                if seq_conds:
                                    # Sequential conditions exist — arm phase 2, don't enter yet
                                    seq_phase = 1
                                    seq_arm_bar_loc = bar_loc
                                else:
                                    # No sequential conditions — enter immediately
                                    entry_signal = True
                                    price_point = 'vwap'
                                    entry_price = candle.get('vwap')
                                    if pd.isna(entry_price):
                                        entry_price = candle['close']
                                        price_point = 'close'
                        else:
                            # Sequential phase k: check seq_conds[seq_phase - 1]
                            seq_cond_current = seq_conds[seq_phase - 1]
                            max_wait = int(seq_cond_current.get('max_wait_bars', 0) or 0)
                            if max_wait > 0 and (bar_loc - seq_arm_bar_loc) > max_wait:
                                # Timed out — reset to phase 0 and continue scanning
                                seq_phase = 0
                                seq_arm_bar_loc = -1
                            elif self.check_custom_condition(seq_cond_current, grouped, dates, i, candle):
                                if seq_phase == len(seq_conds):
                                    # All sequential phases satisfied — entry!
                                    entry_signal = True
                                    price_point = 'vwap'
                                    entry_price = candle.get('vwap')
                                    if pd.isna(entry_price):
                                        entry_price = candle['close']
                                        price_point = 'close'
                                else:
                                    # Advance to next sequential phase
                                    seq_phase += 1
                                    seq_arm_bar_loc = bar_loc
                    
                    if entry_signal:
                        entry_time = candle['timestamp']
                        shares = self.calculate_position_size(
                            entry_price, 
                            self.config.get('starting_capital', 100000)
                        )
                        
                        condition_values = []
                        if self.config['entry_type'] == 'custom':
                            for cond_idx, condition in enumerate(self.config['custom_conditions']):
                                lt = condition.get('left_type', 'close')
                                rt = condition.get('right_type', 'close')

                                if lt in self._INDICATOR_TYPES:
                                    left_val = self._compute_indicator(condition, 'left', grouped, dates, i, candle)
                                    left_date = current_date
                                    left_time = candle['timestamp']
                                elif condition['left_day'] == 0 and condition['left_candle'] == 'min':
                                    left_val = candle.get(lt)
                                    left_date = current_date
                                    left_time = candle['timestamp']
                                else:
                                    left_val = self.get_candle_value(grouped, dates, i,
                                                                     condition['left_day'],
                                                                     condition['left_candle'],
                                                                     condition['left_multiplier'],
                                                                     lt,
                                                                     current_candle=candle)
                                    left_idx = i + condition['left_day']
                                    left_date = dates[left_idx] if 0 <= left_idx < len(dates) else None
                                    left_time = None

                                if rt == 'value':
                                    right_val = condition.get('right_fixed_value', 0)
                                    right_date = None
                                    right_time = None
                                elif rt in self._INDICATOR_TYPES:
                                    right_val = self._compute_indicator(condition, 'right', grouped, dates, i, candle)
                                    right_date = current_date
                                    right_time = candle['timestamp']
                                elif condition['right_day'] == 0 and condition['right_candle'] == 'min':
                                    right_val = candle.get(rt)
                                    right_date = current_date
                                    right_time = candle['timestamp']
                                else:
                                    right_val = self.get_candle_value(grouped, dates, i,
                                                                      condition['right_day'],
                                                                      condition['right_candle'],
                                                                      condition['right_multiplier'],
                                                                      rt,
                                                                      current_candle=candle)
                                    right_idx = i + condition['right_day']
                                    right_date = dates[right_idx] if 0 <= right_idx < len(dates) else None
                                    right_time = None
                                
                                condition_values.append({
                                    'condition': condition,
                                    'left_value': left_val,
                                    'left_date': left_date,
                                    'left_time': left_time,
                                    'right_value': right_val,
                                    'right_date': right_date,
                                    'right_time': right_time,
                                    'is_entry': (cond_idx == 0)
                                })
                        
                        computed_val = self._compute_condition_value_for_candle(candle, prev_close, open_930_price)
                        
                        trade_num += 1
                        position = {
                            'symbol': symbol,
                            'entry_date': current_date,
                            'entry_time': entry_time,
                            'entry_price': entry_price,
                            'entry_price_point': price_point,
                            'shares': shares,
                            'direction': self.config['direction'],
                            'days_in_trade': 0,
                            'entry_idx': idx,
                            'prev_close': prev_close,
                            'prev_close_time': prev_close_time,
                            'condition_values': condition_values,
                            'trade_num': trade_num
                        }
                        
                        # Build enriched metric summary for the condition_met event
                        cond_met_metrics = None
                        if self.config.get('entry_type') == 'custom' and condition_values:
                            cv0 = condition_values[0]
                            cond0 = cv0.get('condition', {})
                            right_label = self._get_human_side_label(cond0, 'right')
                            left_label  = self._get_human_side_label(cond0, 'left')
                            threshold       = float(cond0.get('threshold_value', 0) or 0)
                            threshold_unit  = cond0.get('threshold_unit', '%')
                            rv = cv0.get('right_value')
                            effective_right = None
                            if rv is not None and threshold != 0:
                                if threshold_unit == '%':
                                    effective_right = round(rv * (1 + threshold / 100), 4)
                                elif threshold_unit == '$':
                                    effective_right = round(rv + threshold, 4)
                                elif threshold_unit == 'x':
                                    effective_right = round(rv * threshold, 4)
                            cond_met_metrics = {
                                'right_label':     right_label,
                                'right_value':     round(rv, 4) if rv is not None else None,
                                'left_label':      left_label,
                                'left_value':      round(cv0['left_value'], 4) if cv0.get('left_value') is not None else None,
                                'threshold':       threshold,
                                'threshold_unit':  threshold_unit,
                                'effective_right': effective_right if effective_right is not None else (round(rv, 4) if rv is not None else None),
                            }
                        day_entry['events'].append({
                            'type': 'condition_met',
                            'price': round(entry_price, 2),
                            'price_point': price_point,
                            'time': str(entry_time),
                            'computed_value': computed_val,
                            'entry_metrics': cond_met_metrics,
                        })
                        day_entry['events'].append({
                            'type': 'entry',
                            'trade_num': trade_num,
                            'direction': self.config['direction'],
                            'shares': shares,
                            'price': round(entry_price, 2),
                            'time': str(entry_time),
                            'exit_criteria': exit_criteria_desc
                        })
                        day_entry['status'] = 'ENTRY'
                        entry_found = True
                        
                        print(f"  ENTRY: {symbol} {position['direction'].upper()} "
                              f"{shares} shares @ ${entry_price:.2f} ({price_point}) on {entry_time}")
                        print(f"         Prev close: ${prev_close:.2f} at {prev_close_time}")
                        break
                
                if entry_found and position is not None:
                    # Same-day exit scan: check TP/SL and signal exits on candles after entry
                    max_days_cfg = self.config.get('max_days', 0) or 0
                    max_exit_time = position['entry_time'] + timedelta(days=max_days_cfg) if max_days_cfg > 0 else None
                    for idx, candle in current_data.iterrows():
                        if idx <= position['entry_idx']:
                            continue  # only evaluate candles strictly after entry
                        candle_high = candle['high']
                        candle_low = candle['low']
                        candle_close = candle['close']
                        current_time = candle['timestamp']
                        exit_signal, exit_reason, exit_price = self.check_exit_conditions_intraday(
                            position['entry_price'], candle_high, candle_low, position['direction']
                        )
                        if not exit_signal:
                            cond_exit, cond_reason = self.check_exit_signal_conditions(
                                candle, grouped, dates, i, prev_close, open_930_price
                            )
                            if cond_exit:
                                exit_signal = True
                                exit_reason = cond_reason
                                exit_price = candle_close
                        if max_exit_time is not None and current_time >= max_exit_time and not exit_signal:
                            exit_signal = True
                            exit_reason = 'max_days'
                            exit_price = candle_close
                        if exit_signal:
                            pnl, pnl_pct = self.calculate_pnl(
                                position['entry_price'], exit_price,
                                position['shares'], position['direction']
                            )
                            trade = {
                                'symbol': symbol,
                                'direction': position['direction'],
                                'prev_close': position['prev_close'],
                                'prev_close_timestamp': position['prev_close_time'].strftime('%Y-%m-%d %H:%M:%S'),
                                'entry_timestamp': position['entry_time'].strftime('%Y-%m-%d %H:%M:%S'),
                                'entry_price': position['entry_price'],
                                'exit_timestamp': current_time.strftime('%Y-%m-%d %H:%M:%S'),
                                'exit_price': exit_price,
                                'shares': position['shares'],
                                'days_in_trade': position['days_in_trade'],
                                'exit_reason': exit_reason,
                                'pnl': pnl,
                                'pnl_pct': pnl_pct,
                                'condition_values': position.get('condition_values', [])
                            }
                            trades.append(trade)
                            day_entry['events'].append({
                                'type': 'exit',
                                'trade_num': position.get('trade_num', 0),
                                'reason': exit_reason,
                                'price': round(exit_price, 2),
                                'time': str(current_time),
                                'entry_price': round(position['entry_price'], 2),
                                'pnl': round(pnl, 2),
                                'pnl_pct': round(pnl_pct, 2)
                            })
                            day_entry['status'] = 'EXIT'
                            print(f"  EXIT (same day): {symbol} {exit_reason.upper()} @ ${exit_price:.2f} on {current_time} | P&L: ${pnl:.2f} ({pnl_pct:+.2f}%)")
                            position = None
                            break

                if not entry_found:
                    day_high = float(current_data['high'].max()) if len(current_data) > 0 else None
                    day_low  = float(current_data['low'].min())  if len(current_data) > 0 else None
                    if not prior_conditions_met:
                        day_entry['events'].append({
                            'type': 'no_signal',
                            'reason': f'Prior conditions not met for: {condition_desc}',
                            'day_high': round(day_high, 2) if day_high is not None else None,
                            'day_low':  round(day_low,  2) if day_low  is not None else None,
                        })
                    else:
                        entry_metrics = None
                        if self.config.get('entry_type') == 'custom':
                            try:
                                entry_metrics = self._compute_entry_condition_metrics(grouped, dates, i, current_data)
                            except Exception:
                                pass
                        day_entry['events'].append({
                            'type': 'no_signal',
                            'reason': f'No instance of {condition_desc}',
                            'day_high':      round(day_high, 2) if day_high is not None else None,
                            'day_low':       round(day_low,  2) if day_low  is not None else None,
                            'entry_metrics': entry_metrics,
                        })
                    day_entry['status'] = 'SKIPPED'
            
            elif position is None and current_date <= end_date and not prior_conditions_met:
                day_high = float(current_data['high'].max()) if len(current_data) > 0 else None
                day_low  = float(current_data['low'].min())  if len(current_data) > 0 else None
                day_entry['events'].append({
                    'type': 'no_signal',
                    'reason': f'Prior conditions not met for: {condition_desc}',
                    'day_high': round(day_high, 2) if day_high is not None else None,
                    'day_low':  round(day_low,  2) if day_low  is not None else None,
                })
                day_entry['status'] = 'SKIPPED'
            
            elif position is not None:
                position['days_in_trade'] += 1
                max_days_cfg = self.config.get('max_days', 0) or 0
                max_exit_time = position['entry_time'] + timedelta(days=max_days_cfg) if max_days_cfg > 0 else None
                
                day_entry['events'].append({
                    'type': 'holding',
                    'trade_num': position.get('trade_num', 0),
                    'entry_date': str(position['entry_date']),
                    'entry_price': round(position['entry_price'], 2),
                    'direction': position['direction'],
                    'days_held': position['days_in_trade']
                })
                day_entry['status'] = 'HOLDING'
                
                for idx, candle in current_data.iterrows():
                    candle_high = candle['high']
                    candle_low = candle['low']
                    candle_close = candle['close']
                    current_time = candle['timestamp']
                    
                    exit_signal, exit_reason, exit_price = self.check_exit_conditions_intraday(
                        position['entry_price'],
                        candle_high,
                        candle_low,
                        position['direction']
                    )
                    
                    if not exit_signal:
                        cond_exit, cond_reason = self.check_exit_signal_conditions(
                            candle, grouped, dates, i,
                            prev_close, open_930_price
                        )
                        if cond_exit:
                            exit_signal = True
                            exit_reason = cond_reason
                            exit_price = candle_close
                    
                    if max_exit_time is not None and current_time >= max_exit_time and not exit_signal:
                        exit_signal = True
                        exit_reason = 'max_days'
                        exit_price = candle_close
                    
                    if exit_signal:
                        pnl, pnl_pct = self.calculate_pnl(
                            position['entry_price'],
                            exit_price,
                            position['shares'],
                            position['direction']
                        )
                        
                        trade = {
                            'symbol': symbol,
                            'direction': position['direction'],
                            'prev_close': position['prev_close'],
                            'prev_close_timestamp': position['prev_close_time'].strftime('%Y-%m-%d %H:%M:%S'),
                            'entry_timestamp': position['entry_time'].strftime('%Y-%m-%d %H:%M:%S'),
                            'entry_price': position['entry_price'],
                            'exit_timestamp': current_time.strftime('%Y-%m-%d %H:%M:%S'),
                            'exit_price': exit_price,
                            'shares': position['shares'],
                            'days_in_trade': position['days_in_trade'],
                            'exit_reason': exit_reason,
                            'pnl': pnl,
                            'pnl_pct': pnl_pct,
                            'condition_values': position.get('condition_values', [])
                        }
                        
                        trades.append(trade)
                        
                        day_entry['events'].append({
                            'type': 'exit',
                            'trade_num': position.get('trade_num', 0),
                            'reason': exit_reason,
                            'price': round(exit_price, 2),
                            'time': str(current_time),
                            'entry_price': round(position['entry_price'], 2),
                            'pnl': round(pnl, 2),
                            'pnl_pct': round(pnl_pct, 2)
                        })
                        day_entry['status'] = 'EXIT'
                        
                        print(f"  EXIT: {symbol} {exit_reason.upper()} @ ${exit_price:.2f} on {current_time} | P&L: ${pnl:.2f} ({pnl_pct:+.2f}%)")
                        
                        position = None
                        exited_this_day = True
                        exit_time = current_time
                        break
            
            elif current_date > end_date:
                day_entry['events'].append({
                    'type': 'no_signal',
                    'reason': 'Outside trading window'
                })
                day_entry['status'] = 'SKIPPED'
            
            if exited_this_day and current_date <= end_date and prior_conditions_met:
                remaining_candles = current_data[current_data['timestamp'] > exit_time]
                
                if self.config['allow_consecutive_trades']:
                    for idx, candle in remaining_candles.iterrows():
                        entry_signal, price_point, entry_price = (False, None, None)
                        
                        if self.config['entry_type'] == 'preset':
                            entry_signal, price_point, entry_price = self.check_preset_condition_intraday(
                                symbol, candle, prev_close, open_930_price
                            )
                        elif self.config['entry_type'] == 'velocity':
                            velocity_condition = {
                                'type': 'velocity',
                                'lookback': self.config['velocity_lookback'],
                                'operation': self.config['velocity_operator'],
                                'threshold_value': self.config['velocity_threshold']
                            }
                            if self.check_velocity_condition(velocity_condition, grouped, dates, i, candle):
                                entry_signal = True
                                price_point = 'vwap'
                                entry_price = candle.get('vwap')
                                if pd.isna(entry_price):
                                    entry_price = candle['close']
                                    price_point = 'close'
                        elif self.config['entry_type'] == 'custom':
                            entry_condition = self.config['custom_conditions'][0]
                            if self.check_custom_condition(entry_condition, grouped, dates, i, candle):
                                entry_signal = True
                                price_point = 'vwap'
                                entry_price = candle.get('vwap')
                                if pd.isna(entry_price):
                                    entry_price = candle['close']
                                    price_point = 'close'
                        
                        if entry_signal:
                            entry_time = candle['timestamp']
                            shares = self.calculate_position_size(
                                entry_price, 
                                self.config.get('starting_capital', 100000)
                            )
                            
                            trade_num += 1
                            position = {
                                'symbol': symbol,
                                'entry_date': current_date,
                                'entry_time': entry_time,
                                'entry_price': entry_price,
                                'entry_price_point': price_point,
                                'shares': shares,
                                'direction': self.config['direction'],
                                'days_in_trade': 0,
                                'entry_idx': idx,
                                'prev_close': prev_close,
                                'prev_close_time': prev_close_time,
                                'trade_num': trade_num
                            }
                            
                            computed_val = self._compute_condition_value_for_candle(candle, prev_close, open_930_price)
                            day_entry['events'].append({
                                'type': 'condition_met',
                                'price': round(entry_price, 2),
                                'price_point': price_point,
                                'time': str(entry_time),
                                'computed_value': computed_val
                            })
                            day_entry['events'].append({
                                'type': 're_entry',
                                'trade_num': trade_num,
                                'direction': self.config['direction'],
                                'shares': shares,
                                'price': round(entry_price, 2),
                                'time': str(entry_time),
                                'exit_criteria': exit_criteria_desc
                            })
                            day_entry['status'] = 'EXIT_AND_ENTRY'
                            
                            print(f"  RE-ENTRY: {symbol} {position['direction'].upper()} "
                                  f"{shares} shares @ ${entry_price:.2f} ({price_point}) on {entry_time}")
                            break
                else:
                    skipped_signal = False
                    for idx, candle in remaining_candles.iterrows():
                        entry_signal = False
                        
                        if self.config['entry_type'] == 'preset':
                            entry_signal, _, _ = self.check_preset_condition_intraday(
                                symbol, candle, prev_close, open_930_price
                            )
                        elif self.config['entry_type'] == 'velocity':
                            velocity_condition = {
                                'type': 'velocity',
                                'lookback': self.config['velocity_lookback'],
                                'operation': self.config['velocity_operator'],
                                'threshold_value': self.config['velocity_threshold']
                            }
                            entry_signal = self.check_velocity_condition(velocity_condition, grouped, dates, i, candle)
                        elif self.config['entry_type'] == 'custom':
                            entry_condition = self.config['custom_conditions'][0]
                            entry_signal = self.check_custom_condition(entry_condition, grouped, dates, i, candle)
                        
                        if entry_signal:
                            day_entry['events'].append({
                                'type': 'skip_consecutive',
                                'time': str(candle['timestamp']),
                                'reason': 'Consecutive trades DISABLED - signal found after exit but blocked'
                            })
                            skipped_signal = True
                            print(f"  SKIPPED: Entry signal for {symbol} at {candle['timestamp']}")
                            print(f"              Just exited position at {exit_time}")
                            print(f"              Consecutive trades are DISABLED")
                            break
            
            decision_log.append(day_entry)
        
        if position is not None:
            last_date = dates[-1]
            last_data = grouped.get_group(last_date)
            last_candle = last_data.iloc[-1]
            
            exit_price = last_candle['close']
            exit_time_val = last_candle['timestamp']
            
            position['days_in_trade'] += 1
            
            pnl, pnl_pct = self.calculate_pnl(
                position['entry_price'],
                exit_price,
                position['shares'],
                position['direction']
            )
            
            trade = {
                'symbol': symbol,
                'direction': position['direction'],
                'prev_close': position['prev_close'],
                'prev_close_timestamp': position['prev_close_time'].strftime('%Y-%m-%d %H:%M:%S'),
                'entry_timestamp': position['entry_time'].strftime('%Y-%m-%d %H:%M:%S'),
                'entry_price': position['entry_price'],
                'exit_timestamp': exit_time_val.strftime('%Y-%m-%d %H:%M:%S'),
                'exit_price': exit_price,
                'shares': position['shares'],
                'days_in_trade': position['days_in_trade'],
                'exit_reason': 'end_of_backtest',
                'pnl': pnl,
                'pnl_pct': pnl_pct,
                'condition_values': position.get('condition_values', [])
            }
            
            trades.append(trade)
            
            if decision_log and decision_log[-1]['date'] == str(last_date):
                decision_log[-1]['events'].append({
                    'type': 'exit',
                    'trade_num': position.get('trade_num', 0),
                    'reason': 'end_of_backtest',
                    'price': round(exit_price, 2),
                    'time': str(exit_time_val),
                    'entry_price': round(position['entry_price'], 2),
                    'pnl': round(pnl, 2),
                    'pnl_pct': round(pnl_pct, 2)
                })
                decision_log[-1]['status'] = 'EXIT'
            
            print(f"  EXIT: {symbol} END_OF_BACKTEST @ ${exit_price:.2f} on {exit_time_val} | P&L: ${pnl:.2f} ({pnl_pct:+.2f}%)")
            print(f"        (Position still open at end of backtest period)")
        
        return trades, decision_log
    
    def _save_results(self, output_dir='backtest_results', backtest_id=None):
        """
        Save backtest results to CSV, summary, and equity curve
        
        Args:
            output_dir: Directory to save results (default: 'backtest_results')
            backtest_id: Optional ID to use in filename (for web interface)
        """
        if not self.results:
            print("\nNo trades to save.")
            return
        
        # Create output directory if it doesn't exist
        os.makedirs(output_dir, exist_ok=True)
        
        # Generate filename — sanitize name to remove path-unsafe characters
        import re as _re
        safe_name = _re.sub(r'[/\\:*?"<>|]', '_', self.config.get('name', 'backtest'))
        if backtest_id:
            base_filename = f"backtest_{safe_name}_{backtest_id}"
        else:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            base_filename = f"backtest_{safe_name}_{timestamp}"
        
        try:
            # Save CSV (exclude condition_values - it's only for summary)
            csv_filepath = os.path.join(output_dir, f"{base_filename}.csv")
            df = pd.DataFrame(self.results)
            # Drop condition_values column if it exists
            csv_df = df.drop(columns=['condition_values'], errors='ignore')
            csv_df.to_csv(csv_filepath, index=False)
            print(f"\nResults saved to: {csv_filepath}")
            
            # Generate trade summary (uses condition_values from self.results)
            summary_filepath = os.path.join(output_dir, f"{base_filename}_summary.txt")
            self._generate_trade_summary(summary_filepath)
            
            # Generate equity curve
            equity_filepath = os.path.join(output_dir, f"equity_curve_{backtest_id or datetime.now().strftime('%Y%m%d_%H%M%S')}.png")
            self._generate_equity_curve(csv_df, equity_filepath)
            
        except Exception as e:
            print(f"\nError saving files: {e}")
            import traceback
            traceback.print_exc()
    
    def _generate_trade_summary(self, filepath: str):
        """Generate a text file with complete trade summary including configuration"""
        try:
            with open(filepath, 'w') as f:
                f.write("=" * 70 + "\n")
                f.write("BACKTEST TRADE SUMMARY\n")
                f.write("=" * 70 + "\n\n")
                
                # Configuration Section
                f.write("CONFIGURATION\n")
                f.write("-" * 70 + "\n")
                f.write(f"Backtest Name: {self.config['name']}\n")
                f.write(f"Date Range: {self.config['start_date']} to {self.config['end_date']}\n")
                f.write(f"Symbols: {', '.join(self.config['symbols'])}\n")
                f.write(f"Direction: {self.config['direction'].upper()}\n")
                f.write(f"Entry Type: {self.config['entry_type'].upper()}\n\n")
                
                # Entry Conditions
                if self.config['entry_type'] == 'preset':
                    preset_names = {
                        '1': 'Premarket Change %',
                        '2': 'Change %',
                        '3': 'Gap %',
                        '4': 'Change-Open %'
                    }
                    preset = self.config['preset_condition']
                    f.write(f"Entry Condition: {preset_names.get(preset, 'Unknown')}\n")
                    f.write(f"  Operator: {self.config.get('preset_operator', 'N/A')}\n")
                    f.write(f"  Threshold: {self.config.get('preset_threshold', 'N/A')}%\n\n")
                
                elif self.config['entry_type'] == 'custom':
                    f.write(f"Custom Conditions: {len(self.config['custom_conditions'])} total\n\n")
                    
                    for idx, cond in enumerate(self.config['custom_conditions']):
                        if idx == 0:
                            f.write("ENTRY CONDITION:\n")
                        else:
                            f.write(f"PRIOR CONDITION #{idx}:\n")
                        
                        f.write(f"  Left:  Day {cond['left_day']}, {cond['left_candle']}, "
                               f"x{cond['left_multiplier']}, {cond['left_type']}\n")
                        f.write(f"  Op:    {cond['operation']}\n")
                        f.write(f"  Right: Day {cond['right_day']}, {cond['right_candle']}, "
                               f"x{cond['right_multiplier']}, {cond['right_type']}\n")
                        f.write(f"  Threshold: {cond['threshold_value']}{cond['threshold_unit']}\n\n")
                
                # Position Sizing
                f.write("Position Sizing:\n")
                if self.config['sizing_type'] == 'shares':
                    f.write(f"  Type: Fixed Shares\n")
                    f.write(f"  Value: {self.config['sizing_value']} shares\n\n")
                elif self.config['sizing_type'] == 'dollars':
                    f.write(f"  Type: Fixed Dollar Amount\n")
                    f.write(f"  Value: ${self.config['sizing_value']}\n\n")
                else:
                    f.write(f"  Type: Percent of Capital\n")
                    f.write(f"  Starting Capital: ${self.config['starting_capital']}\n")
                    f.write(f"  Percent: {self.config['sizing_value']}%\n\n")
                
                # Exit Criteria
                f.write("Exit Criteria:\n")
                f.write(f"  Take Profit: {self.config['take_profit_value']}")
                f.write(f"{'%' if self.config['take_profit_type'] == 'percent' else '$'}\n")
                f.write(f"  Stop Loss: {self.config['stop_loss_value']}")
                f.write(f"{'%' if self.config['stop_loss_type'] == 'percent' else '$'}\n")
                f.write(f"  Max Days: {self.config['max_days']}\n\n")
                
                f.write(f"Consecutive Trades: {'ALLOWED' if self.config['allow_consecutive_trades'] else 'BLOCKED'}\n\n")
                
                # Results Section
                df = pd.DataFrame(self.results)
                
                f.write("=" * 70 + "\n")
                f.write("RESULTS\n")
                f.write("=" * 70 + "\n\n")
                
                f.write(f"Total Trades: {len(df)}\n")
                f.write(f"Winning Trades: {len(df[df['pnl'] > 0])}\n")
                f.write(f"Losing Trades: {len(df[df['pnl'] < 0])}\n")
                f.write(f"Win Rate: {len(df[df['pnl'] > 0]) / len(df) * 100:.2f}%\n\n")
                
                f.write(f"Total P&L: ${df['pnl'].sum():.2f}\n")
                f.write(f"Average P&L: ${df['pnl'].mean():.2f}\n")
                f.write(f"Average P&L %: {df['pnl_pct'].mean():.2f}%\n\n")
                
                winning_trades = df[df['pnl'] > 0]
                losing_trades = df[df['pnl'] < 0]
                
                if len(winning_trades) > 0:
                    f.write(f"Largest Win: ${winning_trades['pnl'].max():.2f}\n")
                else:
                    f.write(f"Largest Win: $0.00\n")
                
                if len(losing_trades) > 0:
                    f.write(f"Largest Loss: ${losing_trades['pnl'].min():.2f}\n")
                else:
                    f.write(f"Largest Loss: $0.00\n")
                
                f.write(f"\nAverage Days in Trade: {df['days_in_trade'].mean():.2f}\n\n")
                
                # Trade Details
                f.write("=" * 70 + "\n")
                f.write("TRADE DETAILS\n")
                f.write("=" * 70 + "\n\n")
                
                for idx, trade_data in enumerate(self.results):
                    f.write(f"Trade #{idx + 1}:\n")
                    f.write(f"  Symbol: {trade_data['symbol']}\n")
                    f.write(f"  Direction: {trade_data['direction'].upper()}\n")
                    f.write(f"  Entry: {trade_data['entry_timestamp']} @ ${trade_data['entry_price']:.2f}\n")
                    f.write(f"  Exit: {trade_data['exit_timestamp']} @ ${trade_data['exit_price']:.2f}\n")
                    f.write(f"  Shares: {trade_data['shares']}\n")
                    f.write(f"  Days Held: {trade_data['days_in_trade']}\n")
                    f.write(f"  Exit Reason: {trade_data['exit_reason']}\n")
                    f.write(f"  P&L: ${trade_data['pnl']:.2f} ({trade_data['pnl_pct']:+.2f}%)\n")
                    f.write(f"  Prev Close: ${trade_data['prev_close']:.2f} at {trade_data['prev_close_timestamp']}\n")
                    
                    # NEW v3.0: Show actual condition values with dates
                    if 'condition_values' in trade_data and trade_data['condition_values']:
                        f.write(f"\n  Conditions at Entry:\n")
                        for cond_data in trade_data['condition_values']:
                            cond = cond_data['condition']
                            
                            # Format left side with date and time
                            left_desc = f"Day [{cond['left_day']}]"
                            if cond_data['left_date']:
                                left_desc += f" {cond_data['left_date'].strftime('%m/%d')}"
                            if cond_data['left_time']:
                                left_desc += f" at {cond_data['left_time'].strftime('%H:%M')}"
                            left_desc += f" {cond['left_type']}"
                            if cond_data['left_value'] is not None:
                                left_desc += f" {cond_data['left_value']:.4f}"
                            
                            # Format right side with date (no time for day candles)
                            right_desc = f"Day [{cond['right_day']}]"
                            if cond_data['right_date']:
                                right_desc += f" {cond_data['right_date'].strftime('%m/%d')}"
                            if cond_data['right_time']:
                                right_desc += f" at {cond_data['right_time'].strftime('%H:%M')}"
                            right_desc += f" {cond['right_candle']} {cond['right_type']}"
                            if cond_data['right_value'] is not None:
                                right_desc += f" of {cond_data['right_value']:.4f}"
                            
                            # Calculate actual percentage/dollar change
                            if cond_data['left_value'] and cond_data['right_value']:
                                if cond['threshold_unit'] == '%':
                                    actual_change = ((cond_data['left_value'] / cond_data['right_value']) - 1) * 100
                                    change_str = f"by {actual_change:.1f}%"
                                else:
                                    actual_change = cond_data['left_value'] - cond_data['right_value']
                                    change_str = f"by ${actual_change:.2f}"
                            else:
                                change_str = ""
                            
                            # Print condition with label
                            cond_label = "Entry" if cond_data['is_entry'] else f"Prior #{trade_data['condition_values'].index(cond_data)}"
                            f.write(f"  {cond_label}: {left_desc} {cond['operation']} {right_desc} {change_str}\n")
                    
                    f.write("\n")
            
            print(f"Trade summary saved to: {filepath}")
            
        except Exception as e:
            print(f"Error generating trade summary: {e}")
    
    def _generate_equity_curve(self, df: pd.DataFrame, filepath: str):
        """Generate equity curve chart"""
        try:
            import matplotlib
            matplotlib.use('Agg')  # Non-interactive backend
            import matplotlib.pyplot as plt
            
            # Calculate cumulative P&L
            df = df.sort_values('exit_timestamp')
            df['cumulative_pnl'] = df['pnl'].cumsum()
            
            # Get starting capital
            starting_capital = self.config.get('starting_capital', 100000)
            df['equity'] = starting_capital + df['cumulative_pnl']
            
            # Create figure
            fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))
            
            # Plot 1: Equity Curve
            ax1.plot(range(len(df)), df['equity'], 'b-', linewidth=2, label='Equity')
            ax1.axhline(y=starting_capital, color='gray', linestyle='--', alpha=0.5, label='Starting Capital')
            ax1.fill_between(range(len(df)), starting_capital, df['equity'], 
                             where=(df['equity'] >= starting_capital), alpha=0.3, color='green')
            ax1.fill_between(range(len(df)), starting_capital, df['equity'],
                             where=(df['equity'] < starting_capital), alpha=0.3, color='red')
            ax1.set_xlabel('Trade Number', fontsize=12)
            ax1.set_ylabel('Equity ($)', fontsize=12)
            ax1.set_title(f'Equity Curve - {self.config["name"]}', fontsize=14, fontweight='bold')
            ax1.legend()
            ax1.grid(True, alpha=0.3)
            
            # Add stats box
            final_equity = df['equity'].iloc[-1]
            total_return = ((final_equity / starting_capital) - 1) * 100
            max_equity = df['equity'].max()
            max_drawdown = ((df['equity'].cummax() - df['equity']) / df['equity'].cummax()).max() * 100
            
            stats_text = f"Starting: ${starting_capital:,.0f}\n"
            stats_text += f"Ending: ${final_equity:,.2f}\n"
            stats_text += f"Return: {total_return:+.2f}%\n"
            stats_text += f"Max DD: {max_drawdown:.2f}%"
            
            ax1.text(0.02, 0.98, stats_text, transform=ax1.transAxes,
                    verticalalignment='top', bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5),
                    fontsize=10)
            
            # Plot 2: Individual Trade P&L
            colors = ['green' if pnl > 0 else 'red' for pnl in df['pnl']]
            ax2.bar(range(len(df)), df['pnl'], color=colors, alpha=0.6)
            ax2.axhline(y=0, color='black', linestyle='-', linewidth=0.5)
            ax2.set_xlabel('Trade Number', fontsize=12)
            ax2.set_ylabel('P&L ($)', fontsize=12)
            ax2.set_title('Individual Trade P&L', fontsize=14, fontweight='bold')
            ax2.grid(True, alpha=0.3, axis='y')
            
            plt.tight_layout()
            plt.savefig(filepath, dpi=150, bbox_inches='tight')
            plt.close()
            
            print(f"Equity curve saved to: {filepath}")
            
        except Exception as e:
            print(f"Error generating equity curve: {e}")
            print("(matplotlib may not be installed)")
    
    def _display_summary(self):
        if not self.results:
            print("\nNo trades executed.")
            return
        
        df = pd.DataFrame(self.results)
        
        print("\n" + "=" * 60)
        print("BACKTEST SUMMARY")
        print("=" * 60)
        print(f"Backtest Name: {self.config['name']}")
        print(f"Date Range: {self.config['start_date']} to {self.config['end_date']}")
        print(f"Entry Type: {self.config['entry_type'].upper()}")
        print(f"Direction: {self.config['direction'].upper()}")
        print(f"Total Trades: {len(df)}")
        print(f"\nWinning Trades: {len(df[df['pnl'] > 0])}")
        print(f"Losing Trades: {len(df[df['pnl'] < 0])}")
        
        if len(df) > 0:
            print(f"Win Rate: {len(df[df['pnl'] > 0]) / len(df) * 100:.2f}%")
            print(f"\nTotal P&L: ${df['pnl'].sum():.2f}")
            print(f"Average P&L: ${df['pnl'].mean():.2f}")
            print(f"Average P&L %: {df['pnl_pct'].mean():.2f}%")
            
            # FIXED v3.0: Only show largest win/loss if they exist
            winning_trades = df[df['pnl'] > 0]
            losing_trades = df[df['pnl'] < 0]
            
            print("")  # Blank line before win/loss stats
            if len(winning_trades) > 0:
                print(f"Largest Win: ${winning_trades['pnl'].max():.2f}")
            else:
                print(f"Largest Win: $0.00")
            
            if len(losing_trades) > 0:
                print(f"Largest Loss: ${losing_trades['pnl'].min():.2f}")
            else:
                print(f"Largest Loss: $0.00")
            
            print(f"\nAverage Days in Trade: {df['days_in_trade'].mean():.2f}")
        
        print("=" * 60)


def main():
    print("""
    ╔═══════════════════════════════════════════════════════════╗
    ║   POLYGON.IO BACKTESTER ENGINE v3.0                     ║
    ║   - NEW: Custom condition builder (unlimited!)          ║
    ║   - NEW: Compare any candle to any candle              ║
    ║   - REMOVED: Presets #5 & #6                           ║
    ╚═══════════════════════════════════════════════════════════╝
    """)
    
    api_key = os.getenv('POLYGON_API_KEY', '')
    
    backtester = BacktesterEngine(api_key)
    backtester.configure_backtest()
    
    proceed = input("\nReady to run backtest? (y/n): ").strip().lower()
    if proceed == 'y':
        backtester.run_backtest()
    else:
        print("Backtest cancelled.")


if __name__ == "__main__":
    main()
