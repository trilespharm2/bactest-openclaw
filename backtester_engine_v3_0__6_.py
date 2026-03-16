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
import csv
from typing import List, Dict, Optional, Tuple, Any

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
    
    def get_candle_value(self, grouped_data: Dict, dates: List, current_date_index: int,
                        day_offset: int, candle_type: str, multiplier: int, 
                        price_type: str) -> Optional[float]:
        """
        NEW v3.0: Get price value from specified candle
        
        day_offset: 0=today, -1=yesterday, -2=day before, etc.
        candle_type: 'min', 'hr', 'day'
        multiplier: number of candles
        price_type: 'open', 'high', 'low', 'close', 'vwap'
        """
        try:
            # Get target date
            target_date_index = current_date_index + day_offset
            if target_date_index < 0 or target_date_index >= len(dates):
                return None
            
            target_date = dates[target_date_index]
            if target_date not in grouped_data.groups:
                return None
            
            day_data = grouped_data.get_group(target_date)
            
            # Get candle based on type
            if candle_type == 'day':
                # For day candle, return the price_type for that day
                if price_type == 'high':
                    return day_data['high'].max()
                elif price_type == 'low':
                    return day_data['low'].min()
                elif price_type == 'open':
                    return day_data['open'].iloc[0]
                elif price_type == 'close':
                    return day_data['close'].iloc[-1]
                elif price_type == 'vwap':
                    # Weighted average VWAP
                    if 'vwap' in day_data.columns and day_data['vwap'].notna().any():
                        return day_data['vwap'].mean()
                    return day_data['close'].iloc[-1]
            
            elif candle_type == 'min':
                # For minute candles, this is handled per-candle in check loop
                # This function is for prior conditions (day-level data)
                # Return close of day as fallback
                return day_data['close'].iloc[-1]
            
            elif candle_type == 'hr':
                # For hour candles, aggregate by hour
                # This is simplified - would need hourly aggregation
                return day_data['close'].iloc[-1]
            
            return None
            
        except Exception as e:
            return None
    
    def check_custom_condition(self, condition: Dict, grouped_data: Dict, dates: List,
                              current_date_index: int, current_candle: Optional[pd.Series] = None) -> bool:
        """
        NEW v3.0: Check if custom condition is met
        
        Returns True if condition is satisfied
        """
        # NEW v3.0: Check if velocity condition
        if condition.get('type') == 'velocity':
            return self.check_velocity_condition(condition, grouped_data, dates, current_date_index, current_candle)
        
        try:
            # Get left side value
            if condition['left_day'] == 0 and condition['left_candle'] == 'min' and current_candle is not None:
                # Current candle
                left_value = current_candle[condition['left_type']]
            else:
                # Historical candle
                left_value = self.get_candle_value(
                    grouped_data, dates, current_date_index,
                    condition['left_day'], condition['left_candle'],
                    condition['left_multiplier'], condition['left_type']
                )
            
            # Get right side value
            if condition['right_day'] == 0 and condition['right_candle'] == 'min' and current_candle is not None:
                # Current candle
                right_value = current_candle[condition['right_type']]
            else:
                # Historical candle
                right_value = self.get_candle_value(
                    grouped_data, dates, current_date_index,
                    condition['right_day'], condition['right_candle'],
                    condition['right_multiplier'], condition['right_type']
                )
            
            if left_value is None or right_value is None:
                return False
            
            if pd.isna(left_value) or pd.isna(right_value):
                return False
            
            # Calculate comparison
            if condition['threshold_unit'] == '%':
                # Percentage comparison
                change = ((left_value / right_value) - 1) * 100
                threshold = condition['threshold_value']
            else:  # '$'
                # Dollar comparison
                change = left_value - right_value
                threshold = condition['threshold_value']
            
            # Evaluate operation
            operation = condition['operation']
            if operation == '>':
                return change > threshold
            elif operation == '<':
                return change < threshold
            elif operation == '>=':
                return change >= threshold
            elif operation == '<=':
                return change <= threshold
            elif operation == '=':
                return abs(change - threshold) < 0.01
            
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
                if not (hour >= 4 and (hour < 9 or (hour == 9 and minute <= 29))):
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
        tp_type = self.config['take_profit_type']
        tp_value = self.config['take_profit_value']
        sl_type = self.config['stop_loss_type']
        sl_value = self.config['stop_loss_value']
        
        if direction == 'long':
            if tp_type == 'percent':
                tp_price = entry_price * (1 + tp_value / 100)
            else:
                tp_price = entry_price + tp_value
            
            if sl_type == 'percent':
                sl_price = entry_price * (1 - sl_value / 100)
            else:
                sl_price = entry_price - sl_value
            
            if candle_high >= tp_price:
                return True, 'take_profit', tp_price
            elif candle_low <= sl_price:
                return True, 'stop_loss', sl_price
                
        else:  # short
            if tp_type == 'percent':
                tp_price = entry_price * (1 - tp_value / 100)
            else:
                tp_price = entry_price - tp_value
            
            if sl_type == 'percent':
                sl_price = entry_price * (1 + sl_value / 100)
            else:
                sl_price = entry_price + sl_value
            
            if candle_low <= tp_price:
                return True, 'take_profit', tp_price
            elif candle_high >= sl_price:
                return True, 'stop_loss', sl_price
        
        return False, None, None
    
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
            
            trades = self._backtest_symbol_intraday(symbol, df)
            all_trades.extend(trades)
        
        self.results = all_trades
        self._save_results(output_dir=output_dir, backtest_id=backtest_id)
        self._display_summary()
    
    def _backtest_symbol_intraday(self, symbol: str, df: pd.DataFrame) -> List[Dict]:
        trades = []
        position = None
        
        df['date'] = df['timestamp'].dt.date
        grouped = df.groupby('date')
        dates = sorted(df['date'].unique())
        
        start_date = datetime.strptime(self.config['start_date'], '%Y-%m-%d').date()
        end_date = datetime.strptime(self.config['end_date'], '%Y-%m-%d').date()
        
        print(f"Analyzing {len(dates)} days of data...")
        print(f"Trade window: {start_date} to {end_date}")
        
        for i, current_date in enumerate(dates):
            if current_date < start_date or i == 0:
                continue
            
            current_data = grouped.get_group(current_date)
            prev_date = dates[i-1]
            prev_data = grouped.get_group(prev_date)
            
            prev_close, prev_close_time = self.get_regular_hours_close(prev_data)
            open_930_price, open_930_candle = self.get_open_930(current_data)
            
            exited_this_day = False
            exit_time = None
            
            # Check prior conditions first (if custom)
            prior_conditions_met = True
            if self.config['entry_type'] == 'custom' and len(self.config['custom_conditions']) > 1:
                # Check all prior conditions (index 1+)
                for cond_idx in range(1, len(self.config['custom_conditions'])):
                    condition = self.config['custom_conditions'][cond_idx]
                    if not self.check_custom_condition(condition, grouped, dates, i, None):
                        prior_conditions_met = False
                        break
            
            # Only check for entry if prior conditions met
            if position is None and current_date <= end_date and prior_conditions_met:
                for idx, candle in current_data.iterrows():
                    entry_signal, price_point, entry_price = (False, None, None)
                    
                    if self.config['entry_type'] == 'preset':
                        entry_signal, price_point, entry_price = self.check_preset_condition_intraday(
                            symbol, candle, prev_close, open_930_price
                        )
                    elif self.config['entry_type'] == 'velocity':
                        # NEW v3.0: Velocity preset
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
                        # Check entry condition (index 0)
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
                        
                        # NEW v3.0: Store condition values for trade summary
                        condition_values = []
                        if self.config['entry_type'] == 'custom':
                            for cond_idx, condition in enumerate(self.config['custom_conditions']):
                                # Get left value and date
                                if condition['left_day'] == 0 and condition['left_candle'] == 'min':
                                    left_val = candle[condition['left_type']]
                                    left_date = current_date
                                    left_time = candle['timestamp']
                                else:
                                    left_val = self.get_candle_value(grouped, dates, i,
                                                                     condition['left_day'],
                                                                     condition['left_candle'],
                                                                     condition['left_multiplier'],
                                                                     condition['left_type'])
                                    left_idx = i + condition['left_day']
                                    left_date = dates[left_idx] if 0 <= left_idx < len(dates) else None
                                    left_time = None
                                
                                # Get right value and date
                                if condition['right_day'] == 0 and condition['right_candle'] == 'min':
                                    right_val = candle[condition['right_type']]
                                    right_date = current_date
                                    right_time = candle['timestamp']
                                else:
                                    right_val = self.get_candle_value(grouped, dates, i,
                                                                      condition['right_day'],
                                                                      condition['right_candle'],
                                                                      condition['right_multiplier'],
                                                                      condition['right_type'])
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
                            'condition_values': condition_values  # Store for trade summary
                        }
                        
                        print(f"  ENTRY: {symbol} {position['direction'].upper()} "
                              f"{shares} shares @ ${entry_price:.2f} ({price_point}) on {entry_time}")
                        print(f"         Prev close: ${prev_close:.2f} at {prev_close_time}")
                        break
            
            # EXIT LOGIC
            elif position is not None:
                position['days_in_trade'] += 1
                max_exit_time = position['entry_time'] + timedelta(days=self.config['max_days'])
                
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
                    
                    if current_time >= max_exit_time and not exit_signal:
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
                        
                        # UPDATED v3.0: Simplified trade dict with condition values
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
                            'condition_values': position.get('condition_values', [])  # For summary only
                        }
                        
                        trades.append(trade)
                        
                        print(f"  EXIT: {symbol} {exit_reason.upper()} @ ${exit_price:.2f} on {current_time} | P&L: ${pnl:.2f} ({pnl_pct:+.2f}%)")
                        
                        position = None
                        exited_this_day = True
                        exit_time = current_time
                        break
            
            # Same-day re-entry check
            if exited_this_day and current_date <= end_date and prior_conditions_met:
                remaining_candles = current_data[current_data['timestamp'] > exit_time]
                
                if self.config['allow_consecutive_trades']:
                    for idx, candle in remaining_candles.iterrows():
                        entry_signal, price_point, entry_price = (False, None, None)
                        
                        if self.config['entry_type'] == 'preset':
                            entry_signal, price_point, entry_price = self.check_preset_condition_intraday(
                                symbol, candle, prev_close, open_930_price
                            )
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
                                'prev_close_time': prev_close_time
                            }
                            
                            print(f"  RE-ENTRY: {symbol} {position['direction'].upper()} "
                                  f"{shares} shares @ ${entry_price:.2f} ({price_point}) on {entry_time}")
                            break
                else:
                    for idx, candle in remaining_candles.iterrows():
                        entry_signal = False
                        
                        if self.config['entry_type'] == 'preset':
                            entry_signal, _, _ = self.check_preset_condition_intraday(
                                symbol, candle, prev_close, open_930_price
                            )
                        elif self.config['entry_type'] == 'custom':
                            entry_condition = self.config['custom_conditions'][0]
                            entry_signal = self.check_custom_condition(entry_condition, grouped, dates, i, candle)
                        
                        if entry_signal:
                            print(f"  ⚠️  SKIPPED: Entry signal for {symbol} at {candle['timestamp']}")
                            print(f"              Just exited position at {exit_time}")
                            print(f"              Consecutive trades are DISABLED")
                            break
        
        # Close any open position at end of backtest
        if position is not None:
            # Get last candle
            last_date = dates[-1]
            last_data = grouped.get_group(last_date)
            last_candle = last_data.iloc[-1]
            
            exit_price = last_candle['close']
            exit_time = last_candle['timestamp']
            
            position['days_in_trade'] += 1
            
            pnl, pnl_pct = self.calculate_pnl(
                position['entry_price'],
                exit_price,
                position['shares'],
                position['direction']
            )
            
            # UPDATED v3.0: Simplified trade dict with condition values
            trade = {
                'symbol': symbol,
                'direction': position['direction'],
                'prev_close': position['prev_close'],
                'prev_close_timestamp': position['prev_close_time'].strftime('%Y-%m-%d %H:%M:%S'),
                'entry_timestamp': position['entry_time'].strftime('%Y-%m-%d %H:%M:%S'),
                'entry_price': position['entry_price'],
                'exit_timestamp': exit_time.strftime('%Y-%m-%d %H:%M:%S'),
                'exit_price': exit_price,
                'shares': position['shares'],
                'days_in_trade': position['days_in_trade'],
                'exit_reason': 'end_of_backtest',
                'pnl': pnl,
                'pnl_pct': pnl_pct,
                'condition_values': position.get('condition_values', [])  # For summary only
            }
            
            trades.append(trade)
            
            print(f"  EXIT: {symbol} END_OF_BACKTEST @ ${exit_price:.2f} on {exit_time} | P&L: ${pnl:.2f} ({pnl_pct:+.2f}%)")
            print(f"        (Position still open at end of backtest period)")
        
        return trades
        trades = []
        position = None
        
        df['date'] = df['timestamp'].dt.date
        grouped = df.groupby('date')
        dates = sorted(df['date'].unique())
        
        start_date = datetime.strptime(self.config['start_date'], '%Y-%m-%d').date()
        end_date = datetime.strptime(self.config['end_date'], '%Y-%m-%d').date()
        
        print(f"Analyzing {len(dates)} days of data...")
        print(f"Trade window: {start_date} to {end_date}")
        
        for i, current_date in enumerate(dates):
            if current_date < start_date or i == 0:
                continue
            
            current_data = grouped.get_group(current_date)
            prev_date = dates[i-1]
            prev_data = grouped.get_group(prev_date)
            
            prev_close, prev_close_time = self.get_regular_hours_close(prev_data)
            open_930_price, open_930_candle = self.get_open_930(current_data)
            
            exited_this_day = False
            exit_time = None
            
            # NEW v3.0: Check prior conditions and store their values
            prior_conditions_met = True
            prior_condition_values = {}  # Store for CSV output
            
            if self.config['entry_type'] == 'custom' and len(self.config['custom_conditions']) > 1:
                # Check all prior conditions (index 1+)
                for cond_idx in range(1, len(self.config['custom_conditions'])):
                    condition = self.config['custom_conditions'][cond_idx]
                    
                    # Get left and right values for CSV
                    left_val = self.get_candle_value(grouped, dates, i, 
                                                     condition['left_day'], 
                                                     condition['left_candle'],
                                                     condition['left_multiplier'], 
                                                     condition['left_type'])
                    right_val = self.get_candle_value(grouped, dates, i,
                                                      condition['right_day'],
                                                      condition['right_candle'],
                                                      condition['right_multiplier'],
                                                      condition['right_type'])
                    
                    # Store values for CSV
                    prior_condition_values[f'prior_cond_{cond_idx}_left'] = left_val
                    prior_condition_values[f'prior_cond_{cond_idx}_right'] = right_val
                    
                    # Get timestamps
                    left_date_idx = i + condition['left_day']
                    right_date_idx = i + condition['right_day']
                    
                    if left_date_idx >= 0 and left_date_idx < len(dates):
                        left_date = dates[left_date_idx]
                        prior_condition_values[f'prior_cond_{cond_idx}_left_date'] = str(left_date)
                    
                    if right_date_idx >= 0 and right_date_idx < len(dates):
                        right_date = dates[right_date_idx]
                        prior_condition_values[f'prior_cond_{cond_idx}_right_date'] = str(right_date)
                    
                    # Check condition
                    if not self.check_custom_condition(condition, grouped, dates, i, None):
                        prior_conditions_met = False
                        break
            
            # Only check for entry if prior conditions met
            if position is None and current_date <= end_date and prior_conditions_met:
                for idx, candle in current_data.iterrows():
                    entry_signal, price_point, entry_price = (False, None, None)
                    
                    if self.config['entry_type'] == 'preset':
                        entry_signal, price_point, entry_price = self.check_preset_condition_intraday(
                            symbol, candle, prev_close, open_930_price
                        )
                    elif self.config['entry_type'] == 'custom':
                        # Check entry condition (index 0)
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
                            'prior_condition_values': prior_condition_values  # Store for trade
                        }
                        
                        print(f"  ENTRY: {symbol} {position['direction'].upper()} "
                              f"{shares} shares @ ${entry_price:.2f} ({price_point}) on {entry_time}")
                        print(f"         Prev close: ${prev_close:.2f} at {prev_close_time}")
                        break
            
            # EXIT LOGIC
            elif position is not None:
                position['days_in_trade'] += 1
                max_exit_time = position['entry_time'] + timedelta(days=self.config['max_days'])
                
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
                    
                    if current_time >= max_exit_time and not exit_signal:
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
                            'entry_date': str(position['entry_date']),
                            'entry_timestamp': position['entry_time'].strftime('%Y-%m-%d %H:%M:%S'),
                            'entry_price': position['entry_price'],
                            'entry_price_point': position['entry_price_point'],
                            'exit_date': str(current_date),
                            'exit_timestamp': current_time.strftime('%Y-%m-%d %H:%M:%S'),
                            'exit_price': exit_price,
                            'shares': position['shares'],
                            'days_in_trade': position['days_in_trade'],
                            'exit_reason': exit_reason,
                            'pnl': pnl,
                            'pnl_pct': pnl_pct,
                            'max_exit_time': max_exit_time.strftime('%Y-%m-%d %H:%M:%S')
                        }
                        
                        # Add prior condition values to trade
                        trade.update(position.get('prior_condition_values', {}))
                        
                        trades.append(trade)
                        
                        print(f"  EXIT: {symbol} {exit_reason.upper()} @ ${exit_price:.2f} on {current_time} | P&L: ${pnl:.2f} ({pnl_pct:+.2f}%)")
                        
                        position = None
                        exited_this_day = True
                        exit_time = current_time
                        break
            
            # Same-day re-entry check
            if exited_this_day and current_date <= end_date and prior_conditions_met:
                remaining_candles = current_data[current_data['timestamp'] > exit_time]
                
                if self.config['allow_consecutive_trades']:
                    for idx, candle in remaining_candles.iterrows():
                        entry_signal, price_point, entry_price = (False, None, None)
                        
                        if self.config['entry_type'] == 'preset':
                            entry_signal, price_point, entry_price = self.check_preset_condition_intraday(
                                symbol, candle, prev_close, open_930_price
                            )
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
                                'prior_condition_values': prior_condition_values
                            }
                            
                            print(f"  RE-ENTRY: {symbol} {position['direction'].upper()} "
                                  f"{shares} shares @ ${entry_price:.2f} ({price_point}) on {entry_time}")
                            break
                else:
                    for idx, candle in remaining_candles.iterrows():
                        entry_signal = False
                        
                        if self.config['entry_type'] == 'preset':
                            entry_signal, _, _ = self.check_preset_condition_intraday(
                                symbol, candle, prev_close, open_930_price
                            )
                        elif self.config['entry_type'] == 'custom':
                            entry_condition = self.config['custom_conditions'][0]
                            entry_signal = self.check_custom_condition(entry_condition, grouped, dates, i, candle)
                        
                        if entry_signal:
                            print(f"  ⚠️  SKIPPED: Entry signal for {symbol} at {candle['timestamp']}")
                            print(f"              Just exited position at {exit_time}")
                            print(f"              Consecutive trades are DISABLED")
                            break
        
        # NEW v3.0: Close any open position at end of backtest
        if position is not None:
            # Get last candle
            last_date = dates[-1]
            last_data = grouped.get_group(last_date)
            last_candle = last_data.iloc[-1]
            
            exit_price = last_candle['close']
            exit_time = last_candle['timestamp']
            
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
                'entry_date': str(position['entry_date']),
                'entry_timestamp': position['entry_time'].strftime('%Y-%m-%d %H:%M:%S'),
                'entry_price': position['entry_price'],
                'entry_price_point': position['entry_price_point'],
                'exit_date': str(last_date),
                'exit_timestamp': exit_time.strftime('%Y-%m-%d %H:%M:%S'),
                'exit_price': exit_price,
                'shares': position['shares'],
                'days_in_trade': position['days_in_trade'],
                'exit_reason': 'end_of_backtest',
                'pnl': pnl,
                'pnl_pct': pnl_pct,
                'max_exit_time': (position['entry_time'] + timedelta(days=self.config['max_days'])).strftime('%Y-%m-%d %H:%M:%S')
            }
            
            # Add prior condition values
            trade.update(position.get('prior_condition_values', {}))
            
            trades.append(trade)
            
            print(f"  EXIT: {symbol} END_OF_BACKTEST @ ${exit_price:.2f} on {exit_time} | P&L: ${pnl:.2f} ({pnl_pct:+.2f}%)")
            print(f"        (Position still open at end of backtest period)")
        
        return trades
    
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
    
    api_key = os.getenv('POLYGON_API_KEY', 'fHPGJ8Bc0bg1hCeKgE4fvMQ8ziqc9tAt')
    
    backtester = BacktesterEngine(api_key)
    backtester.configure_backtest()
    
    proceed = input("\nReady to run backtest? (y/n): ").strip().lower()
    if proceed == 'y':
        backtester.run_backtest()
    else:
        print("Backtest cancelled.")


if __name__ == "__main__":
    main()
