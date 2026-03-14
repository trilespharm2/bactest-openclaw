"""
TradingView Screener Backend API - Complete Version
Matching CLI version with all 6 categories and 200+ filters

Requirements:
- query.py and column.py from tradingview-screener package
- pandas
"""

import pandas as pd
from typing import Dict, List, Any, Optional
import json
import io

# Same imports as professional_tradingview_screener_enhanced.py
from tradingview_screener import Query, Column
from tradingview_screener import col


class TradingViewScreenerAPI:
    """
    Backend API for TradingView Stock Screener
    
    Provides filter metadata for frontend display and processes user selections.
    """
    
    # ============================================================================
    # CONSTANTS - Exactly matching CLI version
    # ============================================================================
    
    TIMEFRAMES = [
        "1 minute", "5 minutes", "15 minutes", "30 minutes", 
        "1 hour", "2 hours", "4 hours", "1 day", "1 week", "1 month"
    ]
    
    TIMEFRAME_COLUMN_MAP = {
        "1 minute": "|1", "5 minutes": "|5", "15 minutes": "|15",
        "30 minutes": "|30", "1 hour": "|60", "2 hours": "|120",
        "4 hours": "|240", "1 day": "", "1 week": "|1W", "1 month": "|1M",
        "Current": ""
    }
    
    FISCAL_PERIODS = ["Quarterly", "Semi-annual", "Annual", "Trailing 12 months"]
    FISCAL_PERIOD_MAP = {
        "Trailing 12 months": "ttm", "Annual": "fy", 
        "Quarterly": "fq", "Semi-annual": "fh"
    }
    
    GROWTH_PERIODS = ["TTM YoY", "Annual YoY", "Quarterly YoY", "Quarterly QoQ"]
    GROWTH_PERIOD_MAP = {
        "TTM YoY": "ttm_yoy", "Annual YoY": "fy_yoy",
        "Quarterly YoY": "fq_yoy", "Quarterly QoQ": "fq_qoq"
    }
    
    PERFORMANCE_RANGES = ["1 week", "1 month", "3 months", "6 months", "Year to date", "1 year", "5 years"]
    PERFORMANCE_MAP = {
        "1 week": "W", "1 month": "1M", "3 months": "3M",
        "6 months": "6M", "Year to date": "YTD", "1 year": "Y", "5 years": "5Y"
    }
    
    # Technical indicator periods
    RSI_PERIODS = [2, 3, 4, 5, 7, 9, 10, 14, 20, 21, 30]
    SMA_EMA_PERIODS = [2, 3, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 20, 21, 25, 26, 30, 34, 40, 50, 55, 60, 75, 89, 100, 120, 144, 150, 200, 250, 300]
    ADX_PERIODS = [9, 14, 20, 50, 100]
    HULL_MA_PERIODS = [9, 20, 200]
    BOLLINGER_PERIODS = [20, 50]
    MOMENTUM_PERIODS = [10, 14]
    STOCHASTIC_INPUTS = ["5,3,3", "6,3,3", "8,3,3", "14,1,3", "14,3,3"]
    ICHIMOKU_INPUTS = ["9,26,52,26", "20,60,120,30"]
    
    # Dropdown options
    SECTORS = [
        "Commercial services", "Communications", "Consumer durables", "Consumer non-durables",
        "Consumer services", "Distribution services", "Electronic technology", "Energy minerals",
        "Finance", "Government", "Health services", "Health technology", "Industrial services",
        "Miscellaneous", "Non-energy minerals", "Process industries", "Producer manufacturing",
        "Retail trade", "Technology services", "Transportation", "Utilities"
    ]
    
    INDUSTRIES = [
        "Building products", "Cable/Satellite TV", "Casinos/Gaming", "Catalog/Specialty distribution",
        "Chemicals: agricultural", "Chemicals: major diversified", "Chemicals: specialty", "Coal",
        "Commercial printing/Forms", "Computer communications", "Computer peripherals",
        "Computer processing hardware", "Construction materials", "Consumer sundries",
        "Containers/Packaging", "Technology", "Healthcare", "Finance", "Energy", "Consumer",
        "Industrial", "Utilities", "Real Estate", "Materials", "Communication Services"
    ]
    
    EXCHANGES = ["CBOE", "NASDAQ", "NYSE", "NYSE Arca", "OTC"]
    
    RATING_OPTIONS = ["Strong sell", "Sell", "Neutral", "Buy", "Strong buy"]
    
    CANDLESTICK_PATTERNS = [
        "Abandoned Baby Bearish", "Abandoned Baby Bullish", "Bearish Engulfing", "Bearish Harami",
        "Bullish Engulfing", "Bullish Harami", "Doji", "Dragonfly Doji", "Evening Star",
        "Gravestone Doji", "Hammer", "Hanging Man", "Inverted Hammer", "Kicking Bearish",
        "Kicking Bullish", "Morning Star", "Shooting Star", "Spinning Top Black",
        "Spinning Top White", "Three Black Crows", "Three White Soldiers", "Tri-Star Bearish", "Tri-Star Bullish"
    ]
    
    IPO_DATE_OPTIONS = [
        "Current trading day", "Previous day", "This week", "This month", "This year",
        "Past 3 months", "Past 6 months", "Past 12 months", "Past 2 years", "Past 3 years",
        "Past 5 years", "More than 1 year ago", "More than 5 years ago", "More than 10 years ago",
        "More than 15 years ago", "More than 20 years ago", "More than 25 years ago"
    ]
    
    RECENT_EARNINGS_OPTIONS = [
        "Current trading day", "Previous day", "Previous 5 days",
        "This week", "Previous week", "This month"
    ]
    
    UPCOMING_EARNINGS_OPTIONS = [
        "Current trading day", "Next day", "Next 5 days", "This week", "Next week", "This month"
    ]
    
    AVG_VOLUME_PERIODS = ["10 days", "30 days", "60 days", "90 days"]
    AVG_VOLUME_MAP = {"10 days": "10d", "30 days": "30d", "60 days": "60d", "90 days": "90d"}
    
    VOLATILITY_MAP = {"1 day": "D", "1 week": "W", "1 month": "M"}
    
    BETA_PERIODS = ["1 year", "5 years"]
    BETA_MAP = {"1 year": "1_year", "5 years": "5_year"}
    
    CONDITIONS = [
        {"id": "above", "name": "Above", "symbol": ">"},
        {"id": "below", "name": "Below", "symbol": "<"},
        {"id": "above_or_equal", "name": "Above or Equal", "symbol": ">="},
        {"id": "below_or_equal", "name": "Below or Equal", "symbol": "<="},
        {"id": "between", "name": "Between", "symbol": "↔"},
        {"id": "outside", "name": "Outside", "symbol": "⇕"},
        {"id": "equals", "name": "Equals", "symbol": "="},
        {"id": "above_pct", "name": "Above %", "symbol": "%↑", "supports_target": True},
        {"id": "below_pct", "name": "Below %", "symbol": "%↓", "supports_target": True},
        {"id": "between_pct", "name": "Between %", "symbol": "%↔", "supports_target": True},
        {"id": "crosses", "name": "Crosses", "symbol": "✕", "supports_target": True},
        {"id": "crosses_above", "name": "Crosses Above", "symbol": "↗", "supports_target": True},
        {"id": "crosses_below", "name": "Crosses Below", "symbol": "↘", "supports_target": True},
    ]
    
    PERCENTAGE_RANGES = [
        {"id": "0_3", "name": "0% to 3%", "min": 0, "max": 3},
        {"id": "0_5", "name": "0% to 5%", "min": 0, "max": 5},
        {"id": "0_10", "name": "0% to 10%", "min": 0, "max": 10},
        {"id": "0_20", "name": "0% to 20%", "min": 0, "max": 20},
        {"id": "0_30", "name": "0% to 30%", "min": 0, "max": 30},
        {"id": "3_plus", "name": "3% or more", "min": 3, "max": None},
        {"id": "5_plus", "name": "5% or more", "min": 5, "max": None},
        {"id": "10_plus", "name": "10% or more", "min": 10, "max": None},
        {"id": "15_plus", "name": "15% or more", "min": 15, "max": None},
        {"id": "20_plus", "name": "20% or more", "min": 20, "max": None},
        {"id": "30_plus", "name": "30% or more", "min": 30, "max": None},
        {"id": "40_plus", "name": "40% or more", "min": 40, "max": None},
        {"id": "50_plus", "name": "50% or more", "min": 50, "max": None},
        {"id": "custom", "name": "Custom", "min": None, "max": None},
    ]
    
    TARGET_FIELDS = [
        {"id": "open", "name": "Open", "type": "price", "column": "open"},
        {"id": "high", "name": "High", "type": "price", "column": "high"},
        {"id": "low", "name": "Low", "type": "price", "column": "low"},
        {"id": "close", "name": "Close", "type": "price", "column": "close"},
        {"id": "sma", "name": "Simple Moving Average", "type": "moving_average", "column": "SMA", "periods": [5, 10, 20, 50, 100, 200]},
        {"id": "ema", "name": "Exponential Moving Average", "type": "moving_average", "column": "EMA", "periods": [5, 10, 20, 50, 100, 200]},
        {"id": "vwma", "name": "Volume Weighted MA", "type": "moving_average", "column": "VWMA", "periods": [10, 20]},
        {"id": "hull_ma", "name": "Hull Moving Average", "type": "moving_average", "column": "HullMA", "periods": [9, 20, 200]},
        {"id": "vwap", "name": "VWAP", "type": "indicator", "column": "VWAP"},
        {"id": "psar", "name": "Parabolic SAR", "type": "indicator", "column": "P.SAR"},
        {"id": "bb_upper", "name": "Bollinger Upper", "type": "channel", "column": "BB.upper"},
        {"id": "bb_lower", "name": "Bollinger Lower", "type": "channel", "column": "BB.lower"},
        {"id": "bb_basis", "name": "Bollinger Basis", "type": "channel", "column": "BB.basis"},
        {"id": "kc_upper", "name": "Keltner Upper", "type": "channel", "column": "KltChnl.upper"},
        {"id": "kc_lower", "name": "Keltner Lower", "type": "channel", "column": "KltChnl.lower"},
        {"id": "dc_upper", "name": "Donchian Upper", "type": "channel", "column": "DonchCh20.upper"},
        {"id": "dc_lower", "name": "Donchian Lower", "type": "channel", "column": "DonchCh20.lower"},
        {"id": "ichimoku_bl", "name": "Ichimoku Base Line", "type": "indicator", "column": "Ichimoku.BLine"},
        {"id": "ichimoku_cl", "name": "Ichimoku Conversion", "type": "indicator", "column": "Ichimoku.CLine"},
    ]
    
    # ============================================================================
    # INITIALIZATION
    # ============================================================================
    
    def __init__(self):
        """Initialize the screener API"""
        self.reset()
    
    def reset(self):
        """Reset to initial state"""
        self.query = Query()
        self.applied_filters = []
        self.filter_objects = []
        self.filter_columns = []
        self.selected_columns = ['name', 'close', 'change', 'volume', 'market_cap_basic']
        self._setup_default_filters()
        self._setup_filter_definitions()
        # Initialize query like CLI does
        self.query.select('name', 'close', 'change', 'volume', 'market_cap_basic')
        # Apply default filters to query
        self.query.where(*self.filter_objects)
    
    def _setup_default_filters(self):
        """Setup default stock filtering"""
        defaults = [
            col('type').isin(['stock', 'dr', 'fund']),
            col('subtype').isin(['common', 'foreign-issuer', '']),
            col('is_primary') == True,
            col('active_symbol') == True
        ]
        for f in defaults:
            self.filter_objects.append(f)
    
    # ============================================================================
    # FILTER DEFINITIONS - All 6 Categories
    # ============================================================================
    
    def _setup_filter_definitions(self):
        """Setup all filter definitions matching CLI version"""
        
        self.categories = [
            {"id": "security_info", "name": "Security Info", "icon": "info"},
            {"id": "market_data", "name": "Market Data", "icon": "trending_up"},
            {"id": "technicals", "name": "Technicals", "icon": "show_chart"},
            {"id": "financials", "name": "Financials", "icon": "account_balance"},
            {"id": "margin_ratios", "name": "Margin & Ratios", "icon": "analytics"},
            {"id": "dividends", "name": "Dividends", "icon": "payments"},
        ]
        
        self.filters = {
            # ==================== SECURITY INFO ====================
            "Security Info": [
                {"id": "exchange", "name": "Exchange", "type": "checkbox_list", "column": "exchange", "options": self.EXCHANGES},
                {"id": "sector", "name": "Sector", "type": "checkbox_list", "column": "sector", "options": self.SECTORS},
                {"id": "industry", "name": "Industry", "type": "checkbox_list", "column": "industry", "options": self.INDUSTRIES},
                {"id": "float_shares", "name": "Float Shares Outstanding", "type": "range", "column": "float_shares_outstanding", "unit": "shares"},
                {"id": "shares_outstanding", "name": "Total Shares Outstanding", "type": "range", "column": "total_shares_outstanding", "unit": "shares"},
                {"id": "upcoming_earnings", "name": "Upcoming Earnings Date", "type": "date_preset", "column": "earnings_release_date", "options": self.UPCOMING_EARNINGS_OPTIONS},
                {"id": "recent_earnings", "name": "Recent Earnings Date", "type": "date_preset", "column": "earnings_release_date_recent", "options": self.RECENT_EARNINGS_OPTIONS},
                {"id": "target_price", "name": "Target Price", "type": "range", "column": "price_target_mean", "unit": "USD"},
                {"id": "number_of_employees", "name": "Number of Employees", "type": "range", "column": "number_of_employees", "unit": "count"},
            ],
            
            # ==================== MARKET DATA ====================
            "Market Data": [
                # Basic Price & Volume
                {"id": "price", "name": "Price", "type": "standard", "column": "close", "timeframes": ["Current"], "default_timeframe": "Current", "unit": "USD"},
                {"id": "change_percent", "name": "Change %", "type": "standard", "column": "change", "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "%"},
                {"id": "change_abs", "name": "Change", "type": "standard", "column": "change_abs", "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "USD"},
                {"id": "volume", "name": "Volume", "type": "standard", "column": "volume", "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "shares"},
                {"id": "avg_volume", "name": "Average Volume", "type": "avg_volume", "column": "average_volume", "period_options": self.AVG_VOLUME_PERIODS, "default_period": "10 days", "unit": "shares"},
                {"id": "volume_change", "name": "Volume Change", "type": "standard", "column": "volume_change", "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "shares"},
                {"id": "volume_change_percent", "name": "Volume Change %", "type": "standard", "column": "volume_change", "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "%"},
                # Price Levels
                {"id": "open", "name": "Open", "type": "standard", "column": "open", "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "USD"},
                {"id": "high", "name": "High", "type": "standard", "column": "high", "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "USD"},
                {"id": "low", "name": "Low", "type": "standard", "column": "low", "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "USD"},
                # Performance & Analysis
                {"id": "performance", "name": "Performance %", "type": "performance", "column": "Perf", "period_options": self.PERFORMANCE_RANGES, "default_period": "Year to date", "unit": "%"},
                {"id": "beta", "name": "Beta", "type": "beta", "column": "beta", "period_options": self.BETA_PERIODS, "default_period": "5 years", "unit": "ratio"},
                {"id": "volatility", "name": "Volatility", "type": "volatility", "column": "Volatility", "timeframes": ["1 day", "1 week", "1 month"], "default_timeframe": "1 day", "unit": "%"},
                {"id": "gap", "name": "Gap %", "type": "standard", "column": "gap", "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "%"},
                {"id": "relative_volume", "name": "Relative Volume", "type": "standard", "column": "relative_volume_10d_calc", "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "ratio"},
                {"id": "relative_volume_at_time", "name": "Relative Volume at Time", "type": "standard", "column": "relative_volume_intraday.5", "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "ratio"},
                {"id": "price_x_volume", "name": "Price × Volume", "type": "standard", "column": "Value.Traded", "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "USD"},
                # Change from Open
                {"id": "change_from_open", "name": "Change from Open", "type": "standard", "column": "change_from_open", "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "USD"},
                {"id": "change_from_open_percent", "name": "Change from Open %", "type": "standard", "column": "change_from_open", "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "%"},
                # Pre-Market
                {"id": "premarket_close", "name": "Pre-market Price", "type": "standard", "column": "premarket_close", "timeframes": ["Current"], "default_timeframe": "Current", "unit": "USD"},
                {"id": "premarket_change", "name": "Pre-market Change", "type": "standard", "column": "premarket_change", "timeframes": ["Current"], "default_timeframe": "Current", "unit": "USD"},
                {"id": "premarket_change_percent", "name": "Pre-market Change %", "type": "standard", "column": "premarket_change", "timeframes": ["Current"], "default_timeframe": "Current", "unit": "%"},
                {"id": "premarket_volume", "name": "Pre-market Volume", "type": "standard", "column": "premarket_volume", "timeframes": ["Current"], "default_timeframe": "Current", "unit": "shares"},
                {"id": "premarket_open", "name": "Pre-market Open", "type": "standard", "column": "premarket_open", "timeframes": ["Current"], "default_timeframe": "Current", "unit": "USD"},
                {"id": "premarket_high", "name": "Pre-market High", "type": "standard", "column": "premarket_high", "timeframes": ["Current"], "default_timeframe": "Current", "unit": "USD"},
                {"id": "premarket_low", "name": "Pre-market Low", "type": "standard", "column": "premarket_low", "timeframes": ["Current"], "default_timeframe": "Current", "unit": "USD"},
                {"id": "premarket_gap_percent", "name": "Pre-market Gap %", "type": "standard", "column": "premarket_gap", "timeframes": ["Current"], "default_timeframe": "Current", "unit": "%"},
                # Post-Market
                {"id": "postmarket_close", "name": "Post-market Price", "type": "standard", "column": "postmarket_close", "timeframes": ["Current"], "default_timeframe": "Current", "unit": "USD"},
                {"id": "postmarket_change", "name": "Post-market Change", "type": "standard", "column": "postmarket_change", "timeframes": ["Current"], "default_timeframe": "Current", "unit": "USD"},
                {"id": "postmarket_change_percent", "name": "Post-market Change %", "type": "standard", "column": "postmarket_change", "timeframes": ["Current"], "default_timeframe": "Current", "unit": "%"},
                {"id": "postmarket_volume", "name": "Post-market Volume", "type": "standard", "column": "postmarket_volume", "timeframes": ["Current"], "default_timeframe": "Current", "unit": "shares"},
                {"id": "postmarket_open", "name": "Post-market Open", "type": "standard", "column": "postmarket_open", "timeframes": ["Current"], "default_timeframe": "Current", "unit": "USD"},
                {"id": "postmarket_high", "name": "Post-market High", "type": "standard", "column": "postmarket_high", "timeframes": ["Current"], "default_timeframe": "Current", "unit": "USD"},
                {"id": "postmarket_low", "name": "Post-market Low", "type": "standard", "column": "postmarket_low", "timeframes": ["Current"], "default_timeframe": "Current", "unit": "USD"},
            ],
            
            # ==================== TECHNICALS ====================
            "Technicals": [
                # Oscillators
                {"id": "rsi", "name": "RSI", "type": "predefined_period", "column": "RSI", "period_options": self.RSI_PERIODS, "default_period": 14, "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "numeric"},
                {"id": "stoch_k", "name": "Stochastic %K", "type": "stochastic", "column": "Stoch.K", "input_options": self.STOCHASTIC_INPUTS, "default_input": "14,1,3", "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "numeric"},
                {"id": "stoch_d", "name": "Stochastic %D", "type": "stochastic", "column": "Stoch.D", "input_options": self.STOCHASTIC_INPUTS, "default_input": "14,1,3", "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "numeric"},
                {"id": "cci", "name": "Commodity Channel Index", "type": "fixed_period_with_num", "column": "CCI", "fixed_period": 20, "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "numeric"},
                {"id": "adx", "name": "Average Directional Index", "type": "predefined_period", "column": "ADX", "period_options": self.ADX_PERIODS, "default_period": 14, "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "numeric"},
                {"id": "ao", "name": "Awesome Oscillator", "type": "timeframe_only", "column": "AO", "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "numeric"},
                {"id": "momentum", "name": "Momentum", "type": "predefined_period", "column": "Mom", "period_options": self.MOMENTUM_PERIODS, "default_period": 10, "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "numeric"},
                {"id": "macd", "name": "MACD", "type": "macd", "column": "MACD", "fixed_periods": [12, 26], "plot_options": ["Level", "Signal"], "default_plot": "Level", "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "numeric"},
                {"id": "stoch_rsi", "name": "Stochastic RSI", "type": "locked_inputs", "column": "Stoch.RSI.K", "locked_inputs": "3,3,14,14", "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "numeric"},
                {"id": "williams_r", "name": "Williams %R", "type": "timeframe_only", "column": "W.R", "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "numeric"},
                {"id": "bbpower", "name": "Bull Bear Power", "type": "fixed_period", "column": "BBPower", "fixed_period": 13, "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "numeric"},
                {"id": "uo", "name": "Ultimate Oscillator", "type": "locked_inputs", "column": "UO", "locked_inputs": "7,14,28", "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "numeric"},
                {"id": "roc", "name": "Rate of Change", "type": "fixed_period", "column": "ROC", "fixed_period": 9, "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "numeric"},
                # Moving Averages - require period in field name
                {"id": "sma", "name": "Simple Moving Average", "type": "moving_average", "column": "SMA", "period_options": self.SMA_EMA_PERIODS, "default_period": 50, "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "USD"},
                {"id": "ema", "name": "Exponential Moving Average", "type": "moving_average", "column": "EMA", "period_options": self.SMA_EMA_PERIODS, "default_period": 50, "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "USD"},
                {"id": "hull_ma", "name": "Hull Moving Average", "type": "moving_average", "column": "HullMA", "period_options": self.HULL_MA_PERIODS, "default_period": 9, "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "USD"},
                {"id": "vwma", "name": "Volume Weighted MA", "type": "fixed_period", "column": "VWMA", "fixed_period": 20, "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "USD"},
                {"id": "vwap", "name": "VWAP", "type": "timeframe_only", "column": "VWAP", "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "USD"},
                # Channels & Bands
                {"id": "bb", "name": "Bollinger Bands", "type": "channel", "column": "BB", "period_options": self.BOLLINGER_PERIODS, "default_period": 20, "channels": ["Upper", "Basis", "Lower"], "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "USD"},
                {"id": "kc", "name": "Keltner Channels", "type": "fixed_channel", "column": "Kltner", "fixed_period": 20, "channels": ["upper", "basis", "lower"], "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "USD"},
                {"id": "donch", "name": "Donchian Channels", "type": "fixed_channel", "column": "Donch", "fixed_period": 20, "channels": ["upper", "basis", "lower"], "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "USD"},
                {"id": "ichimoku", "name": "Ichimoku Cloud", "type": "ichimoku", "column": "Ichimoku", "input_options": self.ICHIMOKU_INPUTS, "default_input": "9,26,52,26", "plot_options": ["Base Line", "Conversion Line", "Leading Span A", "Leading Span B"], "default_plot": "Base Line", "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "USD"},
                # Volatility & Range
                {"id": "atr", "name": "Average True Range", "type": "fixed_period", "column": "ATR", "fixed_period": 14, "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "USD"},
                {"id": "adr", "name": "Average Daily Range", "type": "range", "column": "ADR", "unit": "USD"},
                {"id": "adr_percent", "name": "Average Daily Range %", "type": "range", "column": "average_daily_range", "unit": "%"},
                # Directional & Trend
                {"id": "aroon_up", "name": "Aroon Up", "type": "fixed_period", "column": "Aroon.Up", "fixed_period": 14, "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "numeric"},
                {"id": "aroon_down", "name": "Aroon Down", "type": "fixed_period", "column": "Aroon.Down", "fixed_period": 14, "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "numeric"},
                {"id": "dmi_plus", "name": "DMI +DI", "type": "fixed_period", "column": "DI.plus", "fixed_period": 14, "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "numeric"},
                {"id": "dmi_minus", "name": "DMI -DI", "type": "fixed_period", "column": "DI.minus", "fixed_period": 14, "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "numeric"},
                {"id": "psar", "name": "Parabolic SAR", "type": "timeframe_only", "column": "P.SAR", "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "USD"},
                # Patterns & Ratings
                {"id": "technical_rating", "name": "Technical Rating", "type": "rating", "column": "Recommend.All", "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "numeric"},
                {"id": "oscillators_rating", "name": "Oscillators Rating", "type": "rating", "column": "Recommend.Other", "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "numeric"},
                {"id": "ma_rating", "name": "Moving Averages Rating", "type": "rating", "column": "Recommend.MA", "timeframes": self.TIMEFRAMES, "default_timeframe": "1 day", "unit": "numeric"},
            ],
            
            # ==================== FINANCIALS ====================
            "Financials": [
                # Income Statement
                {"id": "eps_diluted", "name": "EPS Diluted", "type": "fiscal", "column": "earnings_per_share_diluted", "fiscal_periods": ["Trailing 12 months", "Annual", "Quarterly", "Semi-annual"], "default_fiscal_period": "Trailing 12 months", "unit": "USD"},
                {"id": "eps_basic", "name": "EPS Basic", "type": "fiscal", "column": "earnings_per_share_basic", "fiscal_periods": ["Trailing 12 months", "Annual", "Quarterly"], "default_fiscal_period": "Trailing 12 months", "unit": "USD"},
                {"id": "eps_estimate", "name": "EPS Estimate", "type": "fiscal", "column": "earnings_per_share_estimate", "fiscal_periods": ["Quarterly", "Semi-annual", "Annual"], "default_fiscal_period": "Quarterly", "unit": "USD"},
                {"id": "total_revenue", "name": "Total Revenue", "type": "fiscal", "column": "total_revenue", "fiscal_periods": ["Annual", "Quarterly", "Trailing 12 months"], "default_fiscal_period": "Annual", "unit": "USD"},
                {"id": "revenue_estimate", "name": "Revenue Estimate", "type": "fiscal", "column": "revenue_estimate", "fiscal_periods": ["Annual", "Quarterly"], "default_fiscal_period": "Annual", "unit": "USD"},
                {"id": "gross_profit", "name": "Gross Profit", "type": "fiscal", "column": "gross_profit", "fiscal_periods": ["Annual", "Quarterly", "Trailing 12 months"], "default_fiscal_period": "Annual", "unit": "USD"},
                {"id": "operating_income", "name": "Operating Income", "type": "fiscal", "column": "operating_income", "fiscal_periods": ["Trailing 12 months", "Annual", "Quarterly"], "default_fiscal_period": "Trailing 12 months", "unit": "USD"},
                {"id": "net_income", "name": "Net Income", "type": "fiscal", "column": "net_income", "fiscal_periods": ["Annual", "Quarterly", "Trailing 12 months"], "default_fiscal_period": "Annual", "unit": "USD"},
                {"id": "ebitda", "name": "EBITDA", "type": "fiscal", "column": "ebitda", "fiscal_periods": ["Trailing 12 months", "Annual", "Quarterly"], "default_fiscal_period": "Trailing 12 months", "unit": "USD"},
                {"id": "r_and_d", "name": "Research & Development", "type": "fiscal", "column": "research_and_development", "fiscal_periods": ["Annual", "Quarterly", "Trailing 12 months"], "default_fiscal_period": "Annual", "unit": "USD"},
                # Balance Sheet - Assets
                {"id": "total_assets", "name": "Total Assets", "type": "fiscal", "column": "total_assets", "fiscal_periods": ["Quarterly", "Annual"], "default_fiscal_period": "Quarterly", "unit": "USD"},
                {"id": "total_current_assets", "name": "Total Current Assets", "type": "fiscal", "column": "total_current_assets", "fiscal_periods": ["Quarterly", "Annual"], "default_fiscal_period": "Quarterly", "unit": "USD"},
                {"id": "cash_equivalents", "name": "Cash & Equivalents", "type": "fiscal", "column": "cash_and_equivalents", "fiscal_periods": ["Annual", "Quarterly"], "default_fiscal_period": "Annual", "unit": "USD"},
                {"id": "cash_short_term", "name": "Cash and Short Term Investments", "type": "fiscal", "column": "cash_and_short_term_investments", "fiscal_periods": ["Annual", "Quarterly"], "default_fiscal_period": "Annual", "unit": "USD"},
                {"id": "goodwill", "name": "Goodwill, Net", "type": "fiscal", "column": "goodwill", "fiscal_periods": ["Quarterly", "Annual"], "default_fiscal_period": "Quarterly", "unit": "USD"},
                # Balance Sheet - Liabilities & Equity
                {"id": "total_liabilities", "name": "Total Liabilities", "type": "fiscal", "column": "total_liabilities", "fiscal_periods": ["Annual", "Quarterly"], "default_fiscal_period": "Annual", "unit": "USD"},
                {"id": "total_current_liabilities", "name": "Total Current Liabilities", "type": "fiscal", "column": "total_current_liabilities", "fiscal_periods": ["Quarterly", "Annual"], "default_fiscal_period": "Quarterly", "unit": "USD"},
                {"id": "total_equity", "name": "Total Equity", "type": "fiscal", "column": "total_equity", "fiscal_periods": ["Quarterly", "Annual"], "default_fiscal_period": "Quarterly", "unit": "USD"},
                {"id": "total_debt", "name": "Total Debt", "type": "fiscal", "column": "total_debt", "fiscal_periods": ["Annual", "Quarterly"], "default_fiscal_period": "Annual", "unit": "USD"},
                {"id": "long_term_debt", "name": "Long Term Debt", "type": "fiscal", "column": "long_term_debt", "fiscal_periods": ["Annual", "Quarterly"], "default_fiscal_period": "Annual", "unit": "USD"},
                {"id": "short_term_debt", "name": "Short Term Debt", "type": "fiscal", "column": "short_term_debt", "fiscal_periods": ["Annual", "Quarterly"], "default_fiscal_period": "Annual", "unit": "USD"},
                {"id": "net_debt", "name": "Net Debt", "type": "fiscal", "column": "net_debt", "fiscal_periods": ["Annual", "Quarterly"], "default_fiscal_period": "Annual", "unit": "USD"},
                # Cash Flow
                {"id": "free_cash_flow", "name": "Free Cash Flow", "type": "fiscal", "column": "free_cash_flow", "fiscal_periods": ["Annual", "Quarterly", "Trailing 12 months"], "default_fiscal_period": "Annual", "unit": "USD"},
                {"id": "cash_from_ops", "name": "Cash from Operating Activities", "type": "fiscal", "column": "cash_from_operating_activities", "fiscal_periods": ["Trailing 12 months", "Annual", "Quarterly"], "default_fiscal_period": "Trailing 12 months", "unit": "USD"},
                {"id": "cash_from_investing", "name": "Cash from Investing Activities", "type": "fiscal", "column": "cash_from_investing_activities", "fiscal_periods": ["Trailing 12 months", "Annual", "Quarterly"], "default_fiscal_period": "Trailing 12 months", "unit": "USD"},
                {"id": "cash_from_financing", "name": "Cash from Financing Activities", "type": "fiscal", "column": "cash_from_financing_activities", "fiscal_periods": ["Trailing 12 months", "Annual", "Quarterly"], "default_fiscal_period": "Trailing 12 months", "unit": "USD"},
                {"id": "capex", "name": "Capital Expenditures", "type": "fiscal", "column": "capital_expenditures", "fiscal_periods": ["Trailing 12 months", "Annual", "Quarterly"], "default_fiscal_period": "Trailing 12 months", "unit": "USD"},
                # Per Employee Metrics
                {"id": "employees", "name": "Number of Employees", "type": "locked_fiscal", "column": "number_of_employees", "locked_fiscal_period": "Annual", "unit": "count"},
                {"id": "revenue_per_employee", "name": "Revenue per Employee", "type": "locked_fiscal", "column": "revenue_per_employee", "locked_fiscal_period": "Annual", "unit": "USD"},
                {"id": "net_income_per_employee", "name": "Net Income per Employee", "type": "locked_fiscal", "column": "net_income_per_employee", "locked_fiscal_period": "Annual", "unit": "USD"},
                {"id": "operating_income_per_employee", "name": "Operating Income per Employee", "type": "locked_fiscal", "column": "operating_income_per_employee", "locked_fiscal_period": "Annual", "unit": "USD"},
                {"id": "ebitda_per_employee", "name": "EBITDA per Employee", "type": "locked_fiscal", "column": "ebitda_per_employee", "locked_fiscal_period": "Annual", "unit": "USD"},
                {"id": "fcf_per_employee", "name": "Free Cash Flow per Employee", "type": "locked_fiscal", "column": "free_cash_flow_per_employee", "locked_fiscal_period": "Annual", "unit": "USD"},
                {"id": "r_and_d_per_employee", "name": "R&D per Employee", "type": "locked_fiscal", "column": "r_and_d_per_employee", "locked_fiscal_period": "Annual", "unit": "USD"},
                {"id": "assets_per_employee", "name": "Total Assets per Employee", "type": "locked_fiscal", "column": "total_assets_per_employee", "locked_fiscal_period": "Annual", "unit": "USD"},
                {"id": "debt_per_employee", "name": "Total Debt per Employee", "type": "locked_fiscal", "column": "total_debt_per_employee", "locked_fiscal_period": "Annual", "unit": "USD"},
            ],
            
            # ==================== MARGIN & RATIOS ====================
            "Margin & Ratios": [
                # Return metrics - use base names (TradingView API)
                {"id": "roe", "name": "Return on Equity %", "type": "range", "column": "return_on_equity", "unit": "%"},
                {"id": "roa", "name": "Return on Assets %", "type": "range", "column": "return_on_assets", "unit": "%"},
                {"id": "roic", "name": "Return on Invested Capital %", "type": "range", "column": "return_on_invested_capital", "unit": "%"},
                # Margin Ratios
                {"id": "gross_margin", "name": "Gross Margin %", "type": "fiscal", "column": "gross_margin", "fiscal_periods": ["Annual", "Quarterly", "Trailing 12 months"], "default_fiscal_period": "Annual", "unit": "%"},
                {"id": "operating_margin", "name": "Operating Margin %", "type": "fiscal", "column": "operating_margin", "fiscal_periods": ["Annual", "Trailing 12 months", "Quarterly"], "default_fiscal_period": "Annual", "unit": "%"},
                {"id": "net_margin", "name": "Net Margin %", "type": "fiscal", "column": "net_margin", "fiscal_periods": ["Annual", "Quarterly", "Trailing 12 months"], "default_fiscal_period": "Annual", "unit": "%"},
                {"id": "ebitda_margin", "name": "EBITDA Margin %", "type": "fiscal", "column": "ebitda_margin", "fiscal_periods": ["Trailing 12 months", "Annual"], "default_fiscal_period": "Trailing 12 months", "unit": "%"},
                {"id": "pretax_margin", "name": "Pre-tax Margin %", "type": "fiscal", "column": "pre_tax_margin", "fiscal_periods": ["Annual", "Trailing 12 months"], "default_fiscal_period": "Annual", "unit": "%"},
                {"id": "fcf_margin", "name": "Free Cash Flow Margin %", "type": "fiscal", "column": "free_cash_flow_margin", "fiscal_periods": ["Trailing 12 months", "Annual"], "default_fiscal_period": "Trailing 12 months", "unit": "%"},
                # Liquidity Ratios
                {"id": "current_ratio", "name": "Current Ratio", "type": "fiscal", "column": "current_ratio", "fiscal_periods": ["Quarterly", "Annual"], "default_fiscal_period": "Quarterly", "unit": "ratio"},
                {"id": "quick_ratio", "name": "Quick Ratio", "type": "fiscal", "column": "quick_ratio", "fiscal_periods": ["Quarterly", "Annual"], "default_fiscal_period": "Quarterly", "unit": "ratio"},
                {"id": "debt_to_equity", "name": "Debt to Equity", "type": "fiscal", "column": "debt_to_equity", "fiscal_periods": ["Quarterly", "Annual"], "default_fiscal_period": "Quarterly", "unit": "ratio"},
                {"id": "debt_to_assets", "name": "Debt to Assets", "type": "fiscal", "column": "debt_to_assets", "fiscal_periods": ["Quarterly", "Annual"], "default_fiscal_period": "Quarterly", "unit": "ratio"},
                # Valuation Ratios
                {"id": "pe_ratio", "name": "Price to Earnings Ratio", "type": "range", "column": "price_earnings_ttm", "unit": "ratio"},
                {"id": "pb_ratio", "name": "Price to Book Ratio", "type": "range", "column": "price_book_ratio", "unit": "ratio"},
                {"id": "ps_ratio", "name": "Price to Sales Ratio", "type": "range", "column": "price_sales_ratio", "unit": "ratio"},
                {"id": "enterprise_value", "name": "Enterprise Value", "type": "range", "column": "enterprise_value_fq", "unit": "USD"},
                {"id": "ev_to_ebitda", "name": "EV/EBITDA", "type": "locked_fiscal", "column": "enterprise_value_to_ebitda", "locked_fiscal_period": "Trailing 12 months", "unit": "ratio"},
                {"id": "ev_to_revenue", "name": "EV/Revenue", "type": "locked_fiscal", "column": "enterprise_value_to_revenue", "locked_fiscal_period": "Trailing 12 months", "unit": "ratio"},
                {"id": "ev_to_fcf", "name": "EV/Free Cash Flow", "type": "fiscal", "column": "enterprise_value_to_free_cash_flow", "fiscal_periods": ["Trailing 12 months", "Annual"], "default_fiscal_period": "Trailing 12 months", "unit": "ratio"},
                {"id": "market_cap", "name": "Market Capitalization", "type": "range", "column": "market_cap_basic", "unit": "USD"},
                {"id": "forward_pe", "name": "Forward P/E", "type": "locked_fiscal", "column": "forward_pe", "locked_fiscal_period": "Annual", "unit": "ratio"},
                {"id": "peg_ratio", "name": "PEG Ratio", "type": "locked_fiscal", "column": "peg_ratio", "locked_fiscal_period": "Trailing 12 months", "unit": "ratio"},
                {"id": "earnings_yield", "name": "Earnings Yield %", "type": "locked_fiscal", "column": "earnings_yield", "locked_fiscal_period": "Trailing 12 months", "unit": "%"},
                # Growth Metrics
                {"id": "revenue_growth", "name": "Revenue Growth %", "type": "growth", "column": "revenue_growth", "growth_periods": self.GROWTH_PERIODS, "default_growth_period": "TTM YoY", "unit": "%"},
                {"id": "gross_profit_growth", "name": "Gross Profit Growth %", "type": "growth", "column": "gross_profit_growth", "growth_periods": self.GROWTH_PERIODS, "default_growth_period": "TTM YoY", "unit": "%"},
                {"id": "net_income_growth", "name": "Net Income Growth %", "type": "growth", "column": "net_income_growth", "growth_periods": ["TTM YoY", "Annual YoY"], "default_growth_period": "TTM YoY", "unit": "%"},
                {"id": "ebitda_growth", "name": "EBITDA Growth %", "type": "growth", "column": "ebitda_growth", "growth_periods": ["TTM YoY", "Annual YoY"], "default_growth_period": "TTM YoY", "unit": "%"},
                {"id": "eps_growth", "name": "EPS Diluted Growth %", "type": "growth", "column": "eps_diluted_growth", "growth_periods": ["TTM YoY", "Annual YoY"], "default_growth_period": "TTM YoY", "unit": "%"},
                {"id": "fcf_growth", "name": "Free Cash Flow Growth %", "type": "growth", "column": "free_cash_flow_growth", "growth_periods": ["TTM YoY", "Annual YoY"], "default_growth_period": "TTM YoY", "unit": "%"},
                {"id": "capex_growth", "name": "Capital Expenditures Growth %", "type": "growth", "column": "capex_growth", "growth_periods": ["TTM YoY", "Annual YoY"], "default_growth_period": "TTM YoY", "unit": "%"},
                {"id": "debt_growth", "name": "Total Debt Growth %", "type": "growth", "column": "total_debt_growth", "growth_periods": ["Annual YoY"], "default_growth_period": "Annual YoY", "unit": "%"},
                {"id": "assets_growth", "name": "Total Assets Growth %", "type": "growth", "column": "total_assets_growth", "growth_periods": ["Annual YoY"], "default_growth_period": "Annual YoY", "unit": "%"},
            ],
            
            # ==================== DIVIDENDS ====================
            "Dividends": [
                {"id": "dividend_yield", "name": "Dividend Yield %", "type": "range", "column": "dividends_yield", "unit": "%"},
                {"id": "dps", "name": "Dividends per Share (Annual)", "type": "range", "column": "dps_fy", "unit": "USD"},
                {"id": "payout_ratio", "name": "Dividend Payout Ratio %", "type": "range", "column": "dividend_payout_ratio_ttm", "unit": "%"},
                {"id": "continuous_dividend_growth", "name": "Continuous Dividend Growth", "type": "range", "column": "continuous_dividend_growth", "unit": "years"},
                {"id": "continuous_dividend_payout", "name": "Continuous Dividend Payout", "type": "range", "column": "continuous_dividend_payout", "unit": "years"},
            ],
        }
    
    # ============================================================================
    # PUBLIC API METHODS
    # ============================================================================
    
    def get_categories(self) -> List[Dict]:
        """Get all filter categories"""
        result = []
        for cat in self.categories:
            cat_name = cat["name"]
            filter_count = len(self.filters.get(cat_name, []))
            result.append({
                "id": cat["id"],
                "name": cat_name,
                "icon": cat["icon"],
                "filter_count": filter_count
            })
        return result
    
    def get_filters_by_category(self, category: str) -> List[Dict]:
        """Get all filters for a category"""
        # Normalize category name
        cat_name = self._normalize_category_name(category)
        return self.filters.get(cat_name, [])
    
    def get_filter_config(self, filter_id: str) -> Optional[Dict]:
        """Get configuration for a specific filter"""
        for cat_filters in self.filters.values():
            for f in cat_filters:
                if f["id"] == filter_id:
                    return f
        return None
    
    def get_all_filters(self) -> Dict[str, List[Dict]]:
        """Get all filters organized by category"""
        return self.filters
    
    def get_conditions(self) -> List[Dict]:
        """Get available filter conditions"""
        return self.CONDITIONS
    
    def get_percentage_ranges(self) -> List[Dict]:
        """Get available percentage ranges for comparison conditions"""
        return self.PERCENTAGE_RANGES
    
    def get_target_fields(self) -> List[Dict]:
        """Get available target fields for field-to-field comparisons"""
        return self.TARGET_FIELDS
    
    def get_comparison_config(self) -> Dict:
        """Get complete comparison configuration for frontend"""
        return {
            "conditions": self.CONDITIONS,
            "percentage_ranges": self.PERCENTAGE_RANGES,
            "target_fields": self.TARGET_FIELDS,
            "target_conditions": [c for c in self.CONDITIONS if c.get("supports_target")]
        }
    
    def add_filter(self, config: Dict) -> Dict:
        """
        Add a filter based on user configuration
        
        Expected config format:
        {
            "filter_id": "rsi",
            "period": 14,           # For technical indicators
            "timeframe": "1 day",   # For technical indicators
            "condition": "above",   # above, below, between, etc.
            "value": 50,
            "value_to": 70,         # For 'between' condition
            "fiscal_period": "Annual",      # For financial metrics
            "growth_period": "TTM YoY",     # For growth metrics
            "inputs": "14,1,3",     # For stochastic/ichimoku
            "channel": "Upper",     # For channel indicators
            "plot": "Level",        # For MACD/Ichimoku
            "selected_values": ["NASDAQ", "NYSE"]  # For checkbox filters
        }
        """
        try:
            filter_def = self.get_filter_config(config.get("filter_id"))
            if not filter_def:
                return {"success": False, "error": f"Unknown filter: {config.get('filter_id')}"}
            
            # Build column name
            column_name = self._build_column_name(filter_def, config)
            
            # Add to filter columns
            if column_name not in self.filter_columns:
                self.filter_columns.append(column_name)
            
            # Update query columns to include filter column
            # Note: 'ticker' is automatically returned by TradingView API, don't include in select
            all_columns = list(set(self.selected_columns + self.filter_columns))
            self.query.select(*all_columns)
            
            # Build filter object
            filter_obj = self._build_filter_object(filter_def, config, column_name)
            
            if filter_obj is not None:
                self.filter_objects.append(filter_obj)
                
                # Apply filters to query (like CLI does)
                self.query.where(*self.filter_objects)
                
                # Build description
                description = self._build_description(filter_def, config, column_name)
                
                # Store applied filter
                self.applied_filters.append({
                    "id": config.get("filter_id"),
                    "name": filter_def["name"],
                    "description": description,
                    "column": column_name,
                    "config": config
                })
                
                return {
                    "success": True,
                    "description": description,
                    "column": column_name
                }
            
            return {"success": False, "error": "Failed to create filter"}
            
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def remove_filter(self, index: int) -> Dict:
        """Remove a filter by index"""
        try:
            if 0 <= index < len(self.applied_filters):
                removed = self.applied_filters.pop(index)
                # Remove from filter_objects (skip first 4 defaults)
                self.filter_objects.pop(index + 4)
                # Remove column if no longer used
                col_used = any(f["column"] == removed["column"] for f in self.applied_filters)
                if not col_used and removed["column"] in self.filter_columns:
                    self.filter_columns.remove(removed["column"])
                # Rebuild query with remaining filters
                self.query = Query()
                self.query.select('name', 'close', 'change', 'volume', 'market_cap_basic')
                self.query.where(*self.filter_objects)
                return {"success": True, "removed": removed["description"]}
            return {"success": False, "error": "Invalid index"}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def clear_filters(self) -> Dict:
        """Clear all user filters"""
        self.reset()
        return {"success": True}
    
    def get_applied_filters(self) -> List[Dict]:
        """Get currently applied filters"""
        return [{"index": i, **f} for i, f in enumerate(self.applied_filters)]
    
    def set_display_columns(self, columns: List[str]) -> Dict:
        """Set display columns"""
        self.selected_columns = columns
        return {"success": True, "columns": columns}
    
    def execute_scan(self, limit: int = 50, offset: int = 0) -> Dict:
        """Execute scan with current filters"""
        if len(self.applied_filters) == 0:
            return {"success": False, "error": "No filters applied"}
        
        try:
            # Build column list (display columns + filter columns)
            # Note: 'ticker' is automatically returned by TradingView API, don't include in select
            all_columns = list(set(self.selected_columns + self.filter_columns))
            
            # Update query with all columns (filters already applied via add_filter)
            self.query.select(*all_columns)
            self.query.limit(limit)
            self.query.offset(offset)
            
            total_count, df = self.query.get_scanner_data()
            
            # Convert to records
            results = []
            for _, row in df.iterrows():
                record = {}
                for col_name in df.columns:
                    val = row[col_name]
                    if pd.isna(val):
                        record[col_name] = None
                    elif isinstance(val, float):
                        record[col_name] = round(val, 4)
                    else:
                        record[col_name] = val
                results.append(record)
            
            return {
                "success": True,
                "total_count": total_count,
                "showing": len(results),
                "offset": offset,
                "results": results,
                "columns": list(df.columns),
                "applied_filters": self.get_applied_filters()
            }
            
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def export_csv(self, limit: int = 10000) -> str:
        """Export results as CSV"""
        try:
            # Note: 'ticker' is automatically returned by TradingView API, don't include in select
            all_columns = list(set(self.selected_columns + self.filter_columns))
            
            self.query.select(*all_columns)
            self.query.limit(limit)
            
            _, df = self.query.get_scanner_data()
            
            output = io.StringIO()
            df.to_csv(output, index=False)
            return output.getvalue()
        except Exception as e:
            return f"Error: {str(e)}"
    
    # ============================================================================
    # PRIVATE HELPER METHODS
    # ============================================================================
    
    def _normalize_category_name(self, category: str) -> str:
        """Normalize category name"""
        name_map = {
            "security_info": "Security Info",
            "market_data": "Market Data",
            "technicals": "Technicals",
            "financials": "Financials",
            "margin_ratios": "Margin & Ratios",
            "dividends": "Dividends",
        }
        return name_map.get(category.lower().replace(" ", "_"), category)
    
    def _build_column_name(self, filter_def: Dict, config: Dict) -> str:
        """Build the column name for TradingView API"""
        filter_type = filter_def.get("type", "range")
        base_col = filter_def["column"]
        
        # Get timeframe suffix if applicable
        timeframe = config.get("timeframe", filter_def.get("default_timeframe", "1 day"))
        tf_suffix = self.TIMEFRAME_COLUMN_MAP.get(timeframe, "")
        
        # Technical indicators with predefined periods - TradingView uses base name only
        if filter_type == "predefined_period":
            # TradingView API uses base names like RSI, ADX without period in field name
            return f"{base_col}{tf_suffix}"
        
        # Moving averages - require period in field name (SMA10, SMA20, EMA50, etc.)
        elif filter_type == "moving_average":
            period = config.get("period", filter_def.get("default_period", 50))
            return f"{base_col}{period}{tf_suffix}"
        
        # Fixed period indicators - TradingView uses base name only (ATR, ROC, etc)
        elif filter_type == "fixed_period":
            # Most oscillators don't need period in name
            return f"{base_col}{tf_suffix}"
        
        # Fixed period indicators that require period number in name (CCI20, CMF20, MFI14)
        elif filter_type == "fixed_period_with_num":
            period = filter_def.get("fixed_period", 14)
            return f"{base_col}{period}{tf_suffix}"
        
        # Timeframe only (AO, VWAP, P.SAR)
        elif filter_type == "timeframe_only":
            return f"{base_col}{tf_suffix}"
        
        # Stochastic - TradingView uses Stoch.K, Stoch.D without inputs
        elif filter_type == "stochastic":
            return f"{base_col}{tf_suffix}"
        
        # Locked inputs (Stoch RSI, UO) - Use base name only
        elif filter_type == "locked_inputs":
            return f"{base_col}{tf_suffix}"
        
        # MACD - TradingView uses MACD.macd and MACD.signal
        elif filter_type == "macd":
            plot = config.get("plot", filter_def.get("default_plot", "Level"))
            plot_suffix = "macd" if plot == "Level" else "signal"
            return f"MACD.{plot_suffix}{tf_suffix}"
        
        # Ichimoku - TradingView uses Ichimoku.BLine, etc
        elif filter_type == "ichimoku":
            plot = config.get("plot", filter_def.get("default_plot", "Base Line"))
            plot_map = {"Base Line": "BLine", "Conversion Line": "CLine", "Leading Span A": "Lead1", "Leading Span B": "Lead2"}
            plot_suffix = plot_map.get(plot, "BLine")
            return f"Ichimoku.{plot_suffix}{tf_suffix}"
        
        # Channel indicators (Bollinger)
        elif filter_type == "channel":
            channel = config.get("channel", "Upper").lower()
            return f"{base_col}.{channel}{tf_suffix}"
        
        # Fixed channel (Keltner, Donchian)
        elif filter_type == "fixed_channel":
            channel = config.get("channel", "Upper").lower()
            return f"{base_col}.{channel}{tf_suffix}"
        
        # Fiscal period filters
        elif filter_type == "fiscal":
            fiscal_period = config.get("fiscal_period", filter_def.get("default_fiscal_period", "Annual"))
            suffix = self.FISCAL_PERIOD_MAP.get(fiscal_period, "fy")
            return f"{base_col}_{suffix}"
        
        # Locked fiscal
        elif filter_type == "locked_fiscal":
            fiscal_period = filter_def.get("locked_fiscal_period", "Annual")
            suffix = self.FISCAL_PERIOD_MAP.get(fiscal_period, "fy")
            return f"{base_col}_{suffix}"
        
        # Growth period filters
        elif filter_type == "growth":
            growth_period = config.get("growth_period", filter_def.get("default_growth_period", "TTM YoY"))
            suffix = self.GROWTH_PERIOD_MAP.get(growth_period, "ttm_yoy")
            return f"{base_col}_{suffix}"
        
        # Locked growth
        elif filter_type == "locked_growth":
            growth_period = filter_def.get("locked_growth_period", "Annual YoY")
            suffix = self.GROWTH_PERIOD_MAP.get(growth_period, "fy_yoy")
            return f"{base_col}_{suffix}"
        
        # Average volume
        elif filter_type == "avg_volume":
            period = config.get("period", filter_def.get("default_period", "10 days"))
            suffix = self.AVG_VOLUME_MAP.get(period, "10d")
            return f"{base_col}_{suffix}_calc"
        
        # Performance
        elif filter_type == "performance":
            period = config.get("period", filter_def.get("default_period", "Year to date"))
            suffix = self.PERFORMANCE_MAP.get(period, "YTD")
            return f"Perf.{suffix}"
        
        # Volatility
        elif filter_type == "volatility":
            timeframe = config.get("timeframe", "1 day")
            suffix = self.VOLATILITY_MAP.get(timeframe, "D")
            return f"Volatility.{suffix}"
        
        # Beta
        elif filter_type == "beta":
            period = config.get("period", "5 years")
            suffix = self.BETA_MAP.get(period, "5Y")
            return f"beta_{suffix}"
        
        # Rating filters (Recommend.All, Recommend.MA, Recommend.Other)
        elif filter_type == "rating":
            return f"{base_col}{tf_suffix}"
        
        # Standard with timeframe
        elif filter_type == "standard":
            if tf_suffix:
                return f"{base_col}{tf_suffix}"
            return base_col
        
        # Default
        return base_col
    
    def _build_target_column_name(self, config: Dict) -> Optional[str]:
        """Build target column name for field-to-field comparisons"""
        target_id = config.get("target")
        if not target_id or target_id == "value":
            return None
        
        target_def = next((t for t in self.TARGET_FIELDS if t["id"] == target_id), None)
        if not target_def:
            return None
        
        base_col = target_def.get("column")
        if not base_col:
            return None
        
        if target_def.get("type") == "moving_average":
            period = config.get("target_period", 50)
            timeframe = config.get("target_timeframe", "1 day")
            tf_suffix = self.TIMEFRAME_COLUMN_MAP.get(timeframe, "")
            return f"{base_col}{period}{tf_suffix}"
        else:
            timeframe = config.get("target_timeframe", "1 day")
            tf_suffix = self.TIMEFRAME_COLUMN_MAP.get(timeframe, "")
            return f"{base_col}{tf_suffix}"
    
    def _build_filter_object(self, filter_def: Dict, config: Dict, column_name: str):
        """Build the filter object for query"""
        filter_type = filter_def.get("type", "range")
        condition = config.get("condition", "above")
        
        # Checkbox list
        if filter_type in ["checkbox_list", "date_preset"]:
            selected = config.get("selected_values", [])
            if selected:
                return col(column_name).isin(selected)
            return None
        
        # Check for field-to-field comparison conditions
        if condition in ["above_pct", "below_pct", "between_pct", "crosses", "crosses_above", "crosses_below"]:
            return self._build_comparison_filter(column_name, config)
        
        # Standard numeric conditions
        value = config.get("value")
        value_to = config.get("value_to")
        
        if value is None:
            return None
        
        # Convert to appropriate type
        unit = filter_def.get("unit", "")
        if unit in ["USD", "shares", "count", "years"]:
            value = int(float(value))
            if value_to:
                value_to = int(float(value_to))
        else:
            value = float(value)
            if value_to:
                value_to = float(value_to)
        
        # Build condition
        if condition == "above":
            return col(column_name) > value
        elif condition == "below":
            return col(column_name) < value
        elif condition == "above_or_equal":
            return col(column_name) >= value
        elif condition == "below_or_equal":
            return col(column_name) <= value
        elif condition == "between" and value_to:
            return col(column_name).between(value, value_to)
        elif condition == "outside" and value_to is not None:
            return col(column_name).not_between(value, value_to)
        elif condition == "equals":
            return col(column_name) == value
        
        return col(column_name) > value
    
    def _build_comparison_filter(self, column_name: str, config: Dict):
        """Build filter for field-to-field and percentage-based comparisons
        
        Percentage and cross comparisons require a target field (not a static value).
        Use regular conditions (above/below) for static value comparisons.
        """
        condition = config.get("condition")
        target = config.get("target")
        
        if not target or target == "value":
            return None
        
        source_col = Column(column_name)
        target_column = self._build_target_column_name(config)
        if not target_column:
            return None
        
        target_col = Column(target_column)
        
        if condition == "crosses":
            return source_col.crosses(target_col)
        elif condition == "crosses_above":
            return source_col.crosses_above(target_col)
        elif condition == "crosses_below":
            return source_col.crosses_below(target_col)
        elif condition == "above_pct":
            pct = config.get("pct_min", config.get("pct", 0))
            return source_col.above_pct(target_col, float(pct))
        elif condition == "below_pct":
            pct = config.get("pct_min", config.get("pct", 0))
            return source_col.below_pct(target_col, float(pct))
        elif condition == "between_pct":
            pct_min = config.get("pct_min", 0)
            pct_max = config.get("pct_max")
            if pct_max is not None:
                return source_col.between_pct(target_col, float(pct_min), float(pct_max))
            return source_col.between_pct(target_col, float(pct_min))
        
        return None
    
    def _build_description(self, filter_def: Dict, config: Dict, column_name: str) -> str:
        """Build human-readable description"""
        name = filter_def["name"]
        condition = config.get("condition", "above")
        value = config.get("value", "")
        value_to = config.get("value_to", "")
        unit = filter_def.get("unit", "")
        
        # Build parameter string
        params = []
        if config.get("period"):
            params.append(str(config["period"]))
        if config.get("fiscal_period"):
            params.append(config["fiscal_period"])
        if config.get("growth_period"):
            params.append(config["growth_period"])
        if config.get("timeframe") and config["timeframe"] != "1 day":
            params.append(config["timeframe"])
        if config.get("inputs"):
            params.append(config["inputs"])
        if config.get("channel"):
            params.append(config["channel"])
        if config.get("plot"):
            params.append(config["plot"])
        
        param_str = f" ({', '.join(params)})" if params else ""
        
        # Build value string
        if config.get("selected_values"):
            vals = config["selected_values"]
            val_str = ", ".join(vals[:2]) + ("..." if len(vals) > 2 else "")
            return f"{name}{param_str}: {val_str}"
        
        # Handle comparison conditions
        if condition in ["above_pct", "below_pct", "between_pct", "crosses", "crosses_above", "crosses_below"]:
            return self._build_comparison_description(name, param_str, config)
        
        elif condition == "between":
            return f"{name}{param_str}: {value} to {value_to} {unit}".strip()
        elif condition == "outside":
            return f"{name}{param_str}: outside {value} to {value_to} {unit}".strip()
        else:
            cond_symbols = {"above": ">", "below": "<", "above_or_equal": ">=", "below_or_equal": "<=", "equals": "="}
            symbol = cond_symbols.get(condition, condition)
            return f"{name}{param_str}: {symbol} {value} {unit}".strip()
    
    def _build_comparison_description(self, name: str, param_str: str, config: Dict) -> str:
        """Build description for comparison conditions"""
        condition = config.get("condition")
        target = config.get("target", "value")
        
        target_name = "Value"
        if target != "value":
            target_def = next((t for t in self.TARGET_FIELDS if t["id"] == target), None)
            if target_def:
                target_name = target_def["name"]
                if target_def.get("type") == "moving_average":
                    period = config.get("target_period", 50)
                    target_name = f"{target_name} ({period})"
        
        if condition in ["crosses", "crosses_above", "crosses_below"]:
            cond_text = {"crosses": "crosses", "crosses_above": "crosses above", "crosses_below": "crosses below"}
            return f"{name}{param_str}: {cond_text[condition]} {target_name}"
        
        pct_min = config.get("pct_min", 0)
        pct_max = config.get("pct_max")
        
        if condition == "above_pct":
            if pct_max:
                return f"{name}{param_str}: {pct_min}% to {pct_max}% above {target_name}"
            return f"{name}{param_str}: {pct_min}%+ above {target_name}"
        elif condition == "below_pct":
            if pct_max:
                return f"{name}{param_str}: {pct_min}% to {pct_max}% below {target_name}"
            return f"{name}{param_str}: {pct_min}%+ below {target_name}"
        elif condition == "between_pct":
            if pct_max:
                return f"{name}{param_str}: {pct_min}% to {pct_max}% from {target_name}"
            return f"{name}{param_str}: within {pct_min}% of {target_name}"
        
        return f"{name}{param_str}: compared to {target_name}"


# ============================================================================
# API READY FOR FRONTEND INTEGRATION
# ============================================================================
# 
# Usage:
#   api = TradingViewScreenerAPI()
#   
#   # Get filter metadata for frontend display
#   categories = api.get_categories()
#   filters = api.get_filters_by_category("Technicals")
#   
#   # User adds filters via frontend
#   api.add_filter({"filter_id": "rsi", "period": 14, "condition": "below", "value": 30})
#   
#   # User clicks "Scan" button
#   results = api.execute_scan(limit=50)
#
