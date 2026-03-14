/**
 * TradingView Stock Screener - Frontend Script
 * Complete version matching CLI with 170 filters across 7 categories
 */

// =============================================================================
// CONSTANTS (use var to allow SPA reloads)
// =============================================================================

var CATEGORIES = [
    { id: "security_info", name: "Security Info", icon: "info" },
    { id: "market_data", name: "Market Data", icon: "trending_up" },
    { id: "technicals", name: "Technicals", icon: "show_chart" },
    { id: "financials", name: "Financials", icon: "account_balance" },
    { id: "margin_ratios", name: "Margin & Ratios", icon: "analytics" },
    { id: "valuation_growth", name: "Valuation & Growth", icon: "insights" },
    { id: "dividends", name: "Dividends", icon: "payments" }
];

var CONDITIONS = [
    { id: "above", name: "Above", symbol: ">" },
    { id: "below", name: "Below", symbol: "<" },
    { id: "above_or_equal", name: "Above or Equal", symbol: ">=" },
    { id: "below_or_equal", name: "Below or Equal", symbol: "<=" },
    { id: "between", name: "Between", symbol: "↔" },
    { id: "outside", name: "Outside", symbol: "⇕" },
    { id: "equals", name: "Equals", symbol: "=" }
];

var ADVANCED_CONDITIONS = [
    { id: "above_pct", name: "Above %", symbol: "%↑" },
    { id: "below_pct", name: "Below %", symbol: "%↓" },
    { id: "between_pct", name: "Between %", symbol: "%↔" },
    { id: "crosses", name: "Crosses", symbol: "✕" },
    { id: "crosses_above", name: "Crosses Above", symbol: "↗" },
    { id: "crosses_below", name: "Crosses Below", symbol: "↘" }
];

var PERCENTAGE_RANGES = [
    { id: "0_3", name: "0% to 3%", min: 0, max: 3 },
    { id: "0_5", name: "0% to 5%", min: 0, max: 5 },
    { id: "0_10", name: "0% to 10%", min: 0, max: 10 },
    { id: "0_20", name: "0% to 20%", min: 0, max: 20 },
    { id: "3_plus", name: "3% or more", min: 3, max: null },
    { id: "5_plus", name: "5% or more", min: 5, max: null },
    { id: "10_plus", name: "10% or more", min: 10, max: null },
    { id: "20_plus", name: "20% or more", min: 20, max: null },
    { id: "custom", name: "Custom", min: null, max: null }
];

var TARGET_FIELDS = [
    { id: "open", name: "Open", type: "price", column: "open" },
    { id: "high", name: "High", type: "price", column: "high" },
    { id: "low", name: "Low", type: "price", column: "low" },
    { id: "close", name: "Close", type: "price", column: "close" },
    { id: "sma", name: "Simple Moving Average", type: "moving_average", column: "SMA", periods: [5, 10, 20, 50, 100, 200] },
    { id: "ema", name: "Exponential Moving Average", type: "moving_average", column: "EMA", periods: [5, 10, 20, 50, 100, 200] },
    { id: "vwap", name: "VWAP", type: "indicator", column: "VWAP" },
    { id: "psar", name: "Parabolic SAR", type: "indicator", column: "P.SAR" },
    { id: "bb_upper", name: "Bollinger Upper", type: "channel", column: "BB.upper" },
    { id: "bb_lower", name: "Bollinger Lower", type: "channel", column: "BB.lower" },
    { id: "bb_basis", name: "Bollinger Basis", type: "channel", column: "BB.basis" }
];

var FILTERS_WITH_ADVANCED_COMPARISON = ['price', 'open', 'high', 'low', 'sma', 'ema', 'hullma', 'vwma', 'vwap', 'bb', 'kc', 'donch', 'psar', 'ichimoku'];

var TIMEFRAMES = ["1 minute", "5 minutes", "15 minutes", "30 minutes", "1 hour", "2 hours", "4 hours", "1 day", "1 week", "1 month"];
var FISCAL_PERIODS = ["Quarterly", "Semi-annual", "Annual", "Trailing 12 months"];
var GROWTH_PERIODS = ["TTM YoY", "Annual YoY", "Quarterly YoY", "Quarterly QoQ"];

var EXCHANGES = ["CBOE", "NASDAQ", "NYSE", "NYSE Arca", "OTC"];
var SECTORS = ["Commercial services", "Communications", "Consumer durables", "Consumer non-durables", "Consumer services", "Distribution services", "Electronic technology", "Energy minerals", "Finance", "Government", "Health services", "Health technology", "Industrial services", "Miscellaneous", "Non-energy minerals", "Process industries", "Producer manufacturing", "Retail trade", "Technology services", "Transportation", "Utilities"];
var INDUSTRIES = ["Building products", "Cable/Satellite TV", "Casinos/Gaming", "Commercial printing/Forms", "Construction materials", "Containers/Packaging", "Department stores", "EDP services", "Electric utilities", "Electrical products", "Electronic components", "Electronics distributors", "Engineering & construction", "Financial publishing/Services", "Food retail", "Food: major diversified", "Food: meat/Fish/Dairy", "Food: specialty/Candy", "Home improvement chains", "Hospital/Nursing management", "Hotels/Resorts/Cruise lines", "Industrial conglomerates", "Industrial machinery", "Insurance brokers/Services", "Internet retail", "Investment banks/Brokers", "Investment managers", "Investment trusts", "Major banks", "Major telecommunications", "Managed health care", "Marine shipping", "Media conglomerates", "Medical distributors", "Medical/Nursing services", "Metal fabrications", "Miscellaneous commercial services", "Miscellaneous manufacturing", "Movies/Entertainment", "Multi-line insurance", "Office equipment/Supplies", "Oil & gas pipelines", "Oil & gas production", "Oil refining/Marketing", "Oilfield services/Equipment", "Other consumer services", "Other consumer specialties", "Other metals/Minerals", "Other transportation", "Package goods/Cosmetics", "Packaged software", "Personnel services", "Pharmaceuticals: major", "Property/Casualty insurance", "Publishing: newspapers", "Railroads", "Real estate development", "Real estate investment trusts", "Recreational products", "Regional banks", "Restaurants", "Savings institutions", "Semiconductors", "Specialty insurance", "Specialty stores", "Specialty telecommunications", "Steel", "Telecommunications equipment", "Textiles", "Tobacco", "Tools & hardware", "Trucking", "Wholesale distributors", "Wireless telecommunications"];
var RATING_OPTIONS = ["Strong sell", "Sell", "Neutral", "Buy", "Strong buy"];

var IPO_DATE_OPTIONS = ["Current trading day", "Previous day", "This week", "This month", "This year", "Past 3 months", "Past 6 months", "Past 12 months", "Past 2 years", "Past 3 years", "Past 5 years", "More than 1 year ago", "More than 5 years ago", "More than 10 years ago", "More than 15 years ago", "More than 20 years ago", "More than 25 years ago"];
var IPO_DEAL_AMOUNTS = ["1B and above", "500M to 1B", "250M to 500M", "100M to 250M", "50M to 100M", "50M and below"];
var IPO_OFFER_PRICES = ["Above 1000", "500 to 1000", "100 to 500", "25 to 100", "5 to 25", "Below 5"];
var EARNINGS_DATE_OPTIONS = ["Current trading day", "Next day", "Next 5 days", "This week", "Next week", "This month"];

var RSI_PERIODS = [2, 3, 4, 5, 7, 9, 10, 14, 20, 21, 30];
var ADX_PERIODS = [9, 14, 20, 50, 100];
var MOMENTUM_PERIODS = [10, 14, 20];
var MA_PERIODS = [5, 10, 20, 50, 100, 200];
var BB_PERIODS = [20, 50];
var STOCHASTIC_INPUTS = ["5,3,3", "6,3,3", "8,3,3", "14,1,3", "14,3,3"];

var CANDLESTICK_PATTERNS = ["Abandoned Baby Bearish", "Abandoned Baby Bullish", "Bearish Engulfing", "Bearish Harami", "Bullish Engulfing", "Bullish Harami", "Doji", "Dragonfly Doji", "Evening Star", "Gravestone Doji", "Hammer", "Hanging Man", "Inverted Hammer", "Kicking Bearish", "Kicking Bullish", "Morning Star", "Shooting Star", "Spinning Top Black", "Spinning Top White", "Three Black Crows", "Three White Soldiers", "Tri-Star Bearish", "Tri-Star Bullish"];

// =============================================================================
// FILTER DEFINITIONS - 170 FILTERS MATCHING CLI
// =============================================================================

var FILTERS = {
    // ==================== SECURITY INFO (13 filters) ====================
    "Security Info": [
        { id: "exchange", name: "Exchange", type: "checkbox_list", column: "exchange", options: EXCHANGES },
        { id: "sector", name: "Sector", type: "checkbox_list", column: "sector", options: SECTORS },
        { id: "industry", name: "Industry", type: "checkbox_list", column: "industry", options: INDUSTRIES },
        { id: "free_float", name: "Free Float", type: "range", column: "free_float", unit: "shares" },
        { id: "free_float_percent", name: "Free Float %", type: "range", column: "free_float_percent", unit: "%" },
        { id: "shares_outstanding", name: "Total Common Shares Outstanding", type: "range", column: "total_shares_outstanding", unit: "shares" },
        { id: "ipo_date", name: "IPO Offer Date", type: "date_preset", column: "ipo_date", options: IPO_DATE_OPTIONS },
        { id: "ipo_deal_amount", name: "IPO Deal Amount", type: "predefined_ranges", column: "ipo_deal_amount", options: IPO_DEAL_AMOUNTS },
        { id: "ipo_price", name: "IPO Offer Price", type: "predefined_ranges", column: "ipo_price", options: IPO_OFFER_PRICES },
        { id: "number_of_shareholders", name: "Number of Shareholders", type: "locked_fiscal", column: "number_of_shareholders", locked_fiscal_period: "Annual", unit: "count" },
        { id: "earnings_release_date", name: "Upcoming Earnings Date", type: "date_preset", column: "earnings_release_date", options: EARNINGS_DATE_OPTIONS },
        { id: "earnings_release_date_recent", name: "Recent Earnings Date", type: "date_preset", column: "earnings_release_date_recent", options: IPO_DATE_OPTIONS },
        { id: "analyst_rating", name: "Analyst Rating", type: "checkbox_list", column: "Recommend.All", options: RATING_OPTIONS }
    ],

    // ==================== MARKET DATA (35 filters) ====================
    "Market Data": [
        { id: "price", name: "Price", type: "standard", column: "close", timeframes: ["Current"], default_timeframe: "Current", unit: "USD" },
        { id: "change_percent", name: "Change %", type: "standard", column: "change", timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "%" },
        { id: "change_abs", name: "Change", type: "standard", column: "change_abs", timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "USD" },
        { id: "volume", name: "Volume", type: "standard", column: "volume", timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "shares" },
        { id: "avg_volume", name: "Average Volume", type: "avg_volume", column: "average_volume", period_options: ["10 days", "30 days", "60 days", "90 days"], default_period: "10 days", unit: "shares" },
        { id: "volume_change", name: "Volume Change", type: "standard", column: "volume_change", timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "shares" },
        { id: "volume_change_percent", name: "Volume Change %", type: "standard", column: "volume_change_percent", timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "%" },
        { id: "open", name: "Open", type: "standard", column: "open", timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "USD" },
        { id: "high", name: "High", type: "standard", column: "high", timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "USD" },
        { id: "low", name: "Low", type: "standard", column: "low", timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "USD" },
        { id: "performance", name: "Performance %", type: "performance", column: "Perf", period_options: ["1 week", "1 month", "3 months", "6 months", "Year to date", "1 year", "5 years"], default_period: "Year to date", unit: "%" },
        { id: "beta", name: "Beta", type: "beta", column: "beta", period_options: ["1 year", "5 years"], default_period: "5 years", unit: "ratio" },
        { id: "volatility", name: "Volatility", type: "volatility", column: "Volatility", timeframes: ["1 day", "1 week", "1 month"], default_timeframe: "1 day", unit: "%" },
        { id: "gap", name: "Gap %", type: "standard", column: "gap", timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "%" },
        { id: "relative_volume", name: "Relative Volume", type: "standard", column: "relative_volume_10d_calc", timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "ratio" },
        { id: "relative_volume_at_time", name: "Relative Volume at Time", type: "standard", column: "relative_volume_at_time", timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "ratio" },
        { id: "price_x_volume", name: "Price × Volume", type: "standard", column: "price_x_volume", timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "USD" },
        { id: "change_from_open", name: "Change from Open", type: "standard", column: "change_from_open", timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "USD" },
        { id: "change_from_open_percent", name: "Change from Open %", type: "standard", column: "change_from_open_percent", timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "%" },
        { id: "premarket_close", name: "Pre-market Price", type: "standard", column: "premarket_close", timeframes: ["Current"], default_timeframe: "Current", unit: "USD" },
        { id: "premarket_change", name: "Pre-market Change", type: "standard", column: "premarket_change", timeframes: ["Current"], default_timeframe: "Current", unit: "USD" },
        { id: "premarket_change_percent", name: "Pre-market Change %", type: "standard", column: "premarket_change_percent", timeframes: ["Current"], default_timeframe: "Current", unit: "%" },
        { id: "premarket_volume", name: "Pre-market Volume", type: "standard", column: "premarket_volume", timeframes: ["Current"], default_timeframe: "Current", unit: "shares" },
        { id: "premarket_open", name: "Pre-market Open", type: "standard", column: "premarket_open", timeframes: ["Current"], default_timeframe: "Current", unit: "USD" },
        { id: "premarket_high", name: "Pre-market High", type: "standard", column: "premarket_high", timeframes: ["Current"], default_timeframe: "Current", unit: "USD" },
        { id: "premarket_low", name: "Pre-market Low", type: "standard", column: "premarket_low", timeframes: ["Current"], default_timeframe: "Current", unit: "USD" },
        { id: "premarket_gap_percent", name: "Pre-market Gap %", type: "standard", column: "premarket_gap_percent", timeframes: ["Current"], default_timeframe: "Current", unit: "%" },
        { id: "premarket_change_from_open", name: "Pre-market Change from Open", type: "standard", column: "premarket_change_from_open", timeframes: ["Current"], default_timeframe: "Current", unit: "USD" },
        { id: "postmarket_close", name: "Post-market Price", type: "standard", column: "postmarket_close", timeframes: ["Current"], default_timeframe: "Current", unit: "USD" },
        { id: "postmarket_change", name: "Post-market Change", type: "standard", column: "postmarket_change", timeframes: ["Current"], default_timeframe: "Current", unit: "USD" },
        { id: "postmarket_change_percent", name: "Post-market Change %", type: "standard", column: "postmarket_change_percent", timeframes: ["Current"], default_timeframe: "Current", unit: "%" },
        { id: "postmarket_volume", name: "Post-market Volume", type: "standard", column: "postmarket_volume", timeframes: ["Current"], default_timeframe: "Current", unit: "shares" },
        { id: "postmarket_open", name: "Post-market Open", type: "standard", column: "postmarket_open", timeframes: ["Current"], default_timeframe: "Current", unit: "USD" },
        { id: "postmarket_high", name: "Post-market High", type: "standard", column: "postmarket_high", timeframes: ["Current"], default_timeframe: "Current", unit: "USD" },
        { id: "postmarket_low", name: "Post-market Low", type: "standard", column: "postmarket_low", timeframes: ["Current"], default_timeframe: "Current", unit: "USD" }
    ],

    // ==================== TECHNICALS (36 filters) ====================
    "Technicals": [
        // Oscillators
        { id: "rsi", name: "RSI", type: "predefined_period", column: "RSI", period_options: RSI_PERIODS, default_period: 14, timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "numeric" },
        { id: "stoch_k", name: "Stochastic %K", type: "stochastic", column: "Stoch.K", input_options: STOCHASTIC_INPUTS, default_input: "14,1,3", timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "numeric" },
        { id: "stoch_d", name: "Stochastic %D", type: "stochastic", column: "Stoch.D", input_options: STOCHASTIC_INPUTS, default_input: "14,1,3", timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "numeric" },
        { id: "cci", name: "Commodity Channel Index", type: "fixed_period", column: "CCI", fixed_period: 20, timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "numeric" },
        { id: "adx", name: "Average Directional Index", type: "predefined_period", column: "ADX", period_options: ADX_PERIODS, default_period: 14, timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "numeric" },
        { id: "ao", name: "Awesome Oscillator", type: "timeframe_only", column: "AO", timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "numeric" },
        { id: "momentum", name: "Momentum", type: "predefined_period", column: "Mom", period_options: MOMENTUM_PERIODS, default_period: 10, timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "numeric" },
        { id: "macd", name: "MACD", type: "macd", column: "MACD", fixed_periods: [12, 26], plot_options: ["Level", "Signal"], default_plot: "Level", timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "numeric" },
        { id: "stoch_rsi", name: "Stochastic RSI", type: "locked_inputs", column: "Stoch.RSI.K", locked_inputs: "3,3,14,14", timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "numeric" },
        { id: "williams_r", name: "Williams Percent Range", type: "fixed_period", column: "W.R", fixed_period: 14, timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "numeric" },
        { id: "bbpower", name: "Bull Bear Power", type: "fixed_period", column: "BBPower", fixed_period: 13, timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "numeric" },
        { id: "uo", name: "Ultimate Oscillator", type: "locked_inputs", column: "UO", locked_inputs: "7,14,28", timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "numeric" },
        { id: "roc", name: "Rate of Change", type: "fixed_period", column: "ROC", fixed_period: 9, timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "numeric" },
        // Moving Averages
        { id: "sma", name: "Simple Moving Average", type: "predefined_period", column: "SMA", period_options: MA_PERIODS, default_period: 50, timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "USD" },
        { id: "ema", name: "Exponential Moving Average", type: "predefined_period", column: "EMA", period_options: MA_PERIODS, default_period: 50, timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "USD" },
        { id: "hullma", name: "Hull Moving Average", type: "predefined_period", column: "HullMA", period_options: [9, 14, 20], default_period: 9, timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "USD" },
        { id: "vwma", name: "Volume Weighted Moving Average", type: "fixed_period", column: "VWMA", fixed_period: 20, timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "USD" },
        { id: "vwap", name: "Volume Weighted Average Price", type: "timeframe_only", column: "VWAP", timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "USD" },
        // Bands & Channels
        { id: "bb", name: "Bollinger Bands", type: "channel", column: "BB", period_options: BB_PERIODS, default_period: 20, channels: ["Upper", "Basis", "Lower"], timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "USD" },
        { id: "kc", name: "Keltner Channels", type: "fixed_channel", column: "KC", fixed_period: 20, channels: ["Upper", "Basis", "Lower"], timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "USD" },
        { id: "donch", name: "Donchian Channels", type: "fixed_channel", column: "DonchCh", fixed_period: 20, channels: ["Upper", "Basis", "Lower"], timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "USD" },
        { id: "ichimoku", name: "Ichimoku Cloud", type: "ichimoku", column: "Ichimoku", input_options: ["9,26,52,26", "20,60,120,30"], default_input: "9,26,52,26", plot_options: ["Conversion Line", "Base Line", "Leading Span A", "Leading Span B", "Lagging Span"], timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "USD" },
        // Volatility & Volume
        { id: "atr", name: "Average True Range", type: "fixed_period", column: "ATR", fixed_period: 14, timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "USD" },
        { id: "adr", name: "Average Daily Range", type: "range", column: "ADR", unit: "USD" },
        { id: "adr_percent", name: "Average Daily Range %", type: "range", column: "ADR_percent", unit: "%" },
        { id: "cmf", name: "Chaikin Money Flow", type: "fixed_period", column: "CMF", fixed_period: 20, timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "numeric" },
        { id: "mfi", name: "Money Flow Index", type: "fixed_period", column: "MFI", fixed_period: 14, timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "numeric" },
        // Aroon & DMI
        { id: "aroon_up", name: "Aroon Up", type: "fixed_period", column: "Aroon.Up", fixed_period: 25, timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "numeric" },
        { id: "aroon_down", name: "Aroon Down", type: "fixed_period", column: "Aroon.Down", fixed_period: 25, timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "numeric" },
        { id: "di_plus", name: "Directional Movement Index +DI", type: "fixed_period", column: "DI.plus", fixed_period: 14, timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "numeric" },
        { id: "di_minus", name: "Directional Movement Index -DI", type: "fixed_period", column: "DI.minus", fixed_period: 14, timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "numeric" },
        { id: "psar", name: "Parabolic SAR", type: "timeframe_only", column: "P.SAR", timeframes: TIMEFRAMES, default_timeframe: "1 day", unit: "USD" },
        // Patterns & Ratings
        { id: "candlestick_pattern", name: "Candlestick Pattern", type: "checkbox_list", column: "candle_pattern", options: CANDLESTICK_PATTERNS },
        { id: "oscillators_rating", name: "Oscillators Rating", type: "checkbox_list", column: "Recommend.Other", options: RATING_OPTIONS, timeframes: TIMEFRAMES, default_timeframe: "1 day" },
        { id: "ma_rating", name: "Moving Averages Rating", type: "checkbox_list", column: "Recommend.MA", options: RATING_OPTIONS, timeframes: TIMEFRAMES, default_timeframe: "1 day" },
        { id: "technical_rating", name: "Technical Rating", type: "checkbox_list", column: "Recommend.All", options: RATING_OPTIONS, timeframes: TIMEFRAMES, default_timeframe: "1 day" }
    ],

    // ==================== FINANCIALS (37 filters) ====================
    "Financials": [
        // Income Statement
        { id: "eps_diluted", name: "EPS Diluted", type: "fiscal", column: "earnings_per_share_diluted", fiscal_periods: FISCAL_PERIODS, default_fiscal_period: "Trailing 12 months", unit: "USD" },
        { id: "eps_basic", name: "EPS Basic", type: "fiscal", column: "earnings_per_share_basic", fiscal_periods: ["Trailing 12 months", "Annual", "Quarterly"], default_fiscal_period: "Trailing 12 months", unit: "USD" },
        { id: "total_revenue", name: "Total Revenue", type: "fiscal", column: "total_revenue", fiscal_periods: ["Annual", "Quarterly", "Trailing 12 months"], default_fiscal_period: "Annual", unit: "USD" },
        { id: "gross_profit", name: "Gross Profit", type: "fiscal", column: "gross_profit", fiscal_periods: ["Annual", "Quarterly", "Trailing 12 months"], default_fiscal_period: "Annual", unit: "USD" },
        { id: "operating_income", name: "Operating Income", type: "fiscal", column: "operating_income", fiscal_periods: FISCAL_PERIODS, default_fiscal_period: "Trailing 12 months", unit: "USD" },
        { id: "pretax_income", name: "Pre-tax Income", type: "fiscal", column: "pre_tax_income", fiscal_periods: FISCAL_PERIODS, default_fiscal_period: "Trailing 12 months", unit: "USD" },
        { id: "net_income", name: "Net Income", type: "fiscal", column: "net_income", fiscal_periods: ["Annual", "Quarterly", "Trailing 12 months"], default_fiscal_period: "Annual", unit: "USD" },
        { id: "ebitda", name: "EBITDA", type: "fiscal", column: "ebitda", fiscal_periods: FISCAL_PERIODS, default_fiscal_period: "Trailing 12 months", unit: "USD" },
        { id: "ebit", name: "EBIT", type: "fiscal", column: "ebit", fiscal_periods: FISCAL_PERIODS, default_fiscal_period: "Trailing 12 months", unit: "USD" },
        { id: "interest_expense", name: "Interest Expense", type: "fiscal", column: "interest_expense", fiscal_periods: FISCAL_PERIODS, default_fiscal_period: "Trailing 12 months", unit: "USD" },
        { id: "r_and_d", name: "Research & Development", type: "fiscal", column: "research_and_development", fiscal_periods: FISCAL_PERIODS, default_fiscal_period: "Trailing 12 months", unit: "USD" },
        { id: "selling_admin", name: "Selling & Admin Expenses", type: "fiscal", column: "selling_and_administrative_expenses", fiscal_periods: FISCAL_PERIODS, default_fiscal_period: "Trailing 12 months", unit: "USD" },
        // Balance Sheet
        { id: "total_assets", name: "Total Assets", type: "fiscal", column: "total_assets", fiscal_periods: ["Quarterly", "Annual"], default_fiscal_period: "Quarterly", unit: "USD" },
        { id: "total_current_assets", name: "Total Current Assets", type: "fiscal", column: "total_current_assets", fiscal_periods: ["Quarterly", "Annual"], default_fiscal_period: "Quarterly", unit: "USD" },
        { id: "cash_short_term", name: "Cash & Short Term Investments", type: "fiscal", column: "cash_and_short_term_investments", fiscal_periods: ["Quarterly", "Annual"], default_fiscal_period: "Quarterly", unit: "USD" },
        { id: "total_liabilities", name: "Total Liabilities", type: "fiscal", column: "total_liabilities", fiscal_periods: ["Annual", "Quarterly"], default_fiscal_period: "Annual", unit: "USD" },
        { id: "total_current_liabilities", name: "Total Current Liabilities", type: "fiscal", column: "total_current_liabilities", fiscal_periods: ["Quarterly", "Annual"], default_fiscal_period: "Quarterly", unit: "USD" },
        { id: "total_equity", name: "Total Equity", type: "fiscal", column: "total_equity", fiscal_periods: ["Quarterly", "Annual"], default_fiscal_period: "Quarterly", unit: "USD" },
        { id: "total_debt", name: "Total Debt", type: "fiscal", column: "total_debt", fiscal_periods: ["Annual", "Quarterly"], default_fiscal_period: "Annual", unit: "USD" },
        { id: "long_term_debt", name: "Long Term Debt", type: "fiscal", column: "long_term_debt", fiscal_periods: ["Annual", "Quarterly"], default_fiscal_period: "Annual", unit: "USD" },
        { id: "short_term_debt", name: "Short Term Debt", type: "fiscal", column: "short_term_debt", fiscal_periods: ["Quarterly", "Annual"], default_fiscal_period: "Quarterly", unit: "USD" },
        { id: "goodwill", name: "Goodwill", type: "fiscal", column: "goodwill", fiscal_periods: ["Quarterly", "Annual"], default_fiscal_period: "Quarterly", unit: "USD" },
        { id: "intangibles", name: "Intangible Assets", type: "fiscal", column: "intangible_assets", fiscal_periods: ["Quarterly", "Annual"], default_fiscal_period: "Quarterly", unit: "USD" },
        { id: "book_value", name: "Book Value per Share", type: "fiscal", column: "book_value_per_share", fiscal_periods: ["Quarterly", "Annual"], default_fiscal_period: "Quarterly", unit: "USD" },
        // Cash Flow
        { id: "free_cash_flow", name: "Free Cash Flow", type: "fiscal", column: "free_cash_flow", fiscal_periods: ["Annual", "Quarterly", "Trailing 12 months"], default_fiscal_period: "Annual", unit: "USD" },
        { id: "cash_from_ops", name: "Cash from Operating Activities", type: "fiscal", column: "cash_from_operating_activities", fiscal_periods: ["Trailing 12 months", "Annual", "Quarterly"], default_fiscal_period: "Trailing 12 months", unit: "USD" },
        { id: "cash_from_investing", name: "Cash from Investing Activities", type: "fiscal", column: "cash_from_investing_activities", fiscal_periods: ["Trailing 12 months", "Annual", "Quarterly"], default_fiscal_period: "Trailing 12 months", unit: "USD" },
        { id: "cash_from_financing", name: "Cash from Financing Activities", type: "fiscal", column: "cash_from_financing_activities", fiscal_periods: ["Trailing 12 months", "Annual", "Quarterly"], default_fiscal_period: "Trailing 12 months", unit: "USD" },
        { id: "capex", name: "Capital Expenditures", type: "fiscal", column: "capital_expenditures", fiscal_periods: ["Trailing 12 months", "Annual", "Quarterly"], default_fiscal_period: "Trailing 12 months", unit: "USD" },
        // Per Employee Metrics
        { id: "employees", name: "Number of Employees", type: "locked_fiscal", column: "number_of_employees", locked_fiscal_period: "Annual", unit: "count" },
        { id: "revenue_per_employee", name: "Revenue per Employee", type: "locked_fiscal", column: "revenue_per_employee", locked_fiscal_period: "Annual", unit: "USD" },
        { id: "net_income_per_employee", name: "Net Income per Employee", type: "locked_fiscal", column: "net_income_per_employee", locked_fiscal_period: "Annual", unit: "USD" },
        { id: "operating_income_per_employee", name: "Operating Income per Employee", type: "locked_fiscal", column: "operating_income_per_employee", locked_fiscal_period: "Annual", unit: "USD" },
        { id: "ebitda_per_employee", name: "EBITDA per Employee", type: "locked_fiscal", column: "ebitda_per_employee", locked_fiscal_period: "Annual", unit: "USD" },
        { id: "fcf_per_employee", name: "Free Cash Flow per Employee", type: "locked_fiscal", column: "free_cash_flow_per_employee", locked_fiscal_period: "Annual", unit: "USD" },
        { id: "assets_per_employee", name: "Total Assets per Employee", type: "locked_fiscal", column: "total_assets_per_employee", locked_fiscal_period: "Annual", unit: "USD" },
        { id: "debt_per_employee", name: "Total Debt per Employee", type: "locked_fiscal", column: "total_debt_per_employee", locked_fiscal_period: "Annual", unit: "USD" }
    ],

    // ==================== MARGIN & RATIOS (14 filters) ====================
    "Margin & Ratios": [
        // Profitability Ratios
        { id: "roe", name: "Return on Equity %", type: "fiscal", column: "return_on_equity", fiscal_periods: ["Trailing 12 months", "Annual"], default_fiscal_period: "Trailing 12 months", unit: "%" },
        { id: "roa", name: "Return on Assets %", type: "fiscal", column: "return_on_assets", fiscal_periods: ["Trailing 12 months", "Annual"], default_fiscal_period: "Trailing 12 months", unit: "%" },
        { id: "roic", name: "Return on Invested Capital %", type: "fiscal", column: "return_on_invested_capital", fiscal_periods: ["Trailing 12 months", "Annual"], default_fiscal_period: "Trailing 12 months", unit: "%" },
        // Margin Ratios
        { id: "gross_margin", name: "Gross Margin %", type: "fiscal", column: "gross_margin", fiscal_periods: ["Annual", "Quarterly", "Trailing 12 months"], default_fiscal_period: "Annual", unit: "%" },
        { id: "operating_margin", name: "Operating Margin %", type: "fiscal", column: "operating_margin", fiscal_periods: ["Annual", "Trailing 12 months", "Quarterly"], default_fiscal_period: "Annual", unit: "%" },
        { id: "net_margin", name: "Net Margin %", type: "fiscal", column: "net_margin", fiscal_periods: ["Annual", "Quarterly", "Trailing 12 months"], default_fiscal_period: "Annual", unit: "%" },
        { id: "ebitda_margin", name: "EBITDA Margin %", type: "fiscal", column: "ebitda_margin", fiscal_periods: ["Trailing 12 months", "Annual"], default_fiscal_period: "Trailing 12 months", unit: "%" },
        { id: "pretax_margin", name: "Pre-tax Margin %", type: "fiscal", column: "pre_tax_margin", fiscal_periods: ["Annual", "Trailing 12 months"], default_fiscal_period: "Annual", unit: "%" },
        { id: "fcf_margin", name: "Free Cash Flow Margin %", type: "fiscal", column: "free_cash_flow_margin", fiscal_periods: ["Trailing 12 months", "Annual"], default_fiscal_period: "Trailing 12 months", unit: "%" },
        // Liquidity Ratios
        { id: "current_ratio", name: "Current Ratio", type: "fiscal", column: "current_ratio", fiscal_periods: ["Quarterly", "Annual"], default_fiscal_period: "Quarterly", unit: "ratio" },
        { id: "quick_ratio", name: "Quick Ratio", type: "fiscal", column: "quick_ratio", fiscal_periods: ["Quarterly", "Annual"], default_fiscal_period: "Quarterly", unit: "ratio" },
        { id: "debt_to_equity", name: "Debt to Equity", type: "fiscal", column: "debt_to_equity", fiscal_periods: ["Quarterly", "Annual"], default_fiscal_period: "Quarterly", unit: "ratio" },
        { id: "debt_to_assets", name: "Debt to Assets", type: "fiscal", column: "debt_to_assets", fiscal_periods: ["Quarterly", "Annual"], default_fiscal_period: "Quarterly", unit: "ratio" },
        { id: "interest_coverage", name: "Interest Coverage", type: "fiscal", column: "interest_coverage", fiscal_periods: ["Trailing 12 months", "Annual"], default_fiscal_period: "Trailing 12 months", unit: "ratio" }
    ],

    // ==================== VALUATION & GROWTH (27 filters) ====================
    "Valuation & Growth": [
        // Valuation Ratios
        { id: "pe_ratio", name: "Price to Earnings Ratio", type: "range", column: "price_earnings_ttm", unit: "ratio" },
        { id: "forward_pe", name: "Forward P/E", type: "locked_fiscal", column: "forward_pe", locked_fiscal_period: "Annual", unit: "ratio" },
        { id: "peg_ratio", name: "PEG Ratio", type: "locked_fiscal", column: "peg_ratio", locked_fiscal_period: "Trailing 12 months", unit: "ratio" },
        { id: "pb_ratio", name: "Price to Book Ratio", type: "range", column: "price_book_ratio", unit: "ratio" },
        { id: "ps_ratio", name: "Price to Sales Ratio", type: "range", column: "price_sales_ratio", unit: "ratio" },
        { id: "pcf_ratio", name: "Price to Cash Flow", type: "locked_fiscal", column: "price_to_cash_flow", locked_fiscal_period: "Trailing 12 months", unit: "ratio" },
        { id: "pfcf_ratio", name: "Price to Free Cash Flow", type: "locked_fiscal", column: "price_to_free_cash_flow", locked_fiscal_period: "Trailing 12 months", unit: "ratio" },
        { id: "market_cap", name: "Market Capitalization", type: "range", column: "market_cap_basic", unit: "USD" },
        { id: "enterprise_value", name: "Enterprise Value", type: "range", column: "enterprise_value_fq", unit: "USD" },
        { id: "ev_to_ebitda", name: "EV/EBITDA", type: "locked_fiscal", column: "enterprise_value_to_ebitda", locked_fiscal_period: "Trailing 12 months", unit: "ratio" },
        { id: "ev_to_revenue", name: "EV/Revenue", type: "locked_fiscal", column: "enterprise_value_to_revenue", locked_fiscal_period: "Trailing 12 months", unit: "ratio" },
        { id: "ev_to_fcf", name: "EV/Free Cash Flow", type: "fiscal", column: "enterprise_value_to_free_cash_flow", fiscal_periods: ["Trailing 12 months", "Annual"], default_fiscal_period: "Trailing 12 months", unit: "ratio" },
        { id: "earnings_yield", name: "Earnings Yield %", type: "locked_fiscal", column: "earnings_yield", locked_fiscal_period: "Trailing 12 months", unit: "%" },
        // Growth Metrics
        { id: "revenue_growth", name: "Revenue Growth %", type: "growth", column: "revenue_growth", growth_periods: GROWTH_PERIODS, default_growth_period: "TTM YoY", unit: "%" },
        { id: "gross_profit_growth", name: "Gross Profit Growth %", type: "growth", column: "gross_profit_growth", growth_periods: GROWTH_PERIODS, default_growth_period: "TTM YoY", unit: "%" },
        { id: "operating_income_growth", name: "Operating Income Growth %", type: "growth", column: "operating_income_growth", growth_periods: ["TTM YoY", "Annual YoY"], default_growth_period: "TTM YoY", unit: "%" },
        { id: "net_income_growth", name: "Net Income Growth %", type: "growth", column: "net_income_growth", growth_periods: ["TTM YoY", "Annual YoY"], default_growth_period: "TTM YoY", unit: "%" },
        { id: "ebitda_growth", name: "EBITDA Growth %", type: "growth", column: "ebitda_growth", growth_periods: ["TTM YoY", "Annual YoY"], default_growth_period: "TTM YoY", unit: "%" },
        { id: "eps_growth", name: "EPS Diluted Growth %", type: "growth", column: "eps_diluted_growth", growth_periods: ["TTM YoY", "Annual YoY"], default_growth_period: "TTM YoY", unit: "%" },
        { id: "fcf_growth", name: "Free Cash Flow Growth %", type: "growth", column: "free_cash_flow_growth", growth_periods: ["TTM YoY", "Annual YoY"], default_growth_period: "TTM YoY", unit: "%" },
        { id: "capex_growth", name: "Capital Expenditures Growth %", type: "growth", column: "capex_growth", growth_periods: ["TTM YoY", "Annual YoY"], default_growth_period: "TTM YoY", unit: "%" },
        { id: "debt_growth", name: "Total Debt Growth %", type: "growth", column: "total_debt_growth", growth_periods: ["Annual YoY"], default_growth_period: "Annual YoY", unit: "%" },
        { id: "assets_growth", name: "Total Assets Growth %", type: "growth", column: "total_assets_growth", growth_periods: ["Annual YoY"], default_growth_period: "Annual YoY", unit: "%" },
        { id: "equity_growth", name: "Total Equity Growth %", type: "growth", column: "total_equity_growth", growth_periods: ["Annual YoY"], default_growth_period: "Annual YoY", unit: "%" },
        { id: "cash_growth", name: "Cash & Equivalents Growth %", type: "growth", column: "cash_and_equivalents_growth", growth_periods: ["Annual YoY"], default_growth_period: "Annual YoY", unit: "%" },
        { id: "book_value_growth", name: "Book Value per Share Growth %", type: "growth", column: "book_value_per_share_growth", growth_periods: ["Annual YoY"], default_growth_period: "Annual YoY", unit: "%" },
        { id: "employees_growth", name: "Employees Growth %", type: "locked_growth", column: "employees_growth", locked_growth_period: "Annual YoY", unit: "%" }
    ],

    // ==================== DIVIDENDS (8 filters) ====================
    "Dividends": [
        { id: "dividend_yield_indicated", name: "Dividend Yield % (Indicated)", type: "range", column: "dividend_yield_indicated", unit: "%" },
        { id: "dividend_yield", name: "Dividend Yield %", type: "fiscal", column: "dividend_yield", fiscal_periods: ["Trailing 12 months", "Annual"], default_fiscal_period: "Trailing 12 months", unit: "%" },
        { id: "dps", name: "Dividends per Share", type: "fiscal", column: "dividends_per_share", fiscal_periods: ["Annual", "Quarterly", "Semi-annual", "Trailing 12 months"], default_fiscal_period: "Annual", unit: "USD" },
        { id: "payout_ratio", name: "Dividend Payout Ratio %", type: "fiscal", column: "dividend_payout_ratio", fiscal_periods: ["Trailing 12 months", "Annual"], default_fiscal_period: "Trailing 12 months", unit: "%" },
        { id: "dps_growth", name: "Dividends per Share Growth %", type: "locked_growth", column: "dividends_growth", locked_growth_period: "Annual YoY", unit: "%" },
        { id: "continuous_dividend_growth", name: "Continuous Dividend Growth", type: "range", column: "continuous_dividend_growth", unit: "years" },
        { id: "continuous_dividend_payout", name: "Continuous Dividend Payout", type: "range", column: "continuous_dividend_payout", unit: "years" },
        { id: "total_dividends_paid", name: "Total Cash Dividends Paid", type: "fiscal", column: "total_cash_dividends_paid", fiscal_periods: ["Annual", "Quarterly"], default_fiscal_period: "Annual", unit: "USD" }
    ]
};

// =============================================================================
// STATE MANAGEMENT
// =============================================================================

var state = {
    currentCategory: null,
    selectedFilters: [],
    results: null,
    isLoading: false,
    isLoggedIn: false,
    savedFilters: [],
    searchTerm: null
};

// =============================================================================
// INITIALIZATION
// =============================================================================

// SPA entry point - called by main-script.js when navigating to screener
function initScreenerPage() {
    initializeTabs();
    setupEventListeners();
    checkLoginStatusAndLoadFilters();
}

// Direct page load support
document.addEventListener('DOMContentLoaded', () => {
    // Only init if on screener page and not already initialized by SPA
    if (document.getElementById('categoryTabs') && !document.getElementById('categoryTabs').children.length) {
        initScreenerPage();
    }
});

function initializeTabs() {
    var tabsContainer = document.getElementById('categoryTabs');
    
    // Remove existing tab buttons but keep the search container
    var existingTabs = tabsContainer.querySelectorAll('.tab-btn');
    existingTabs.forEach(tab => tab.remove());
    
    CATEGORIES.forEach((cat, index) => {
        const filterCount = FILTERS[cat.name]?.length || 0;
        const btn = document.createElement('button');
        btn.className = 'tab-btn' + (index === 0 ? ' active' : '');
        btn.dataset.category = cat.name;
        btn.innerHTML = `
            <span class="material-symbols-rounded">${cat.icon}</span>
            ${cat.name}
            <span class="count">${filterCount}</span>
        `;
        btn.addEventListener('click', () => selectCategory(cat.name));
        tabsContainer.appendChild(btn);
    });
    
    if (CATEGORIES.length > 0) {
        selectCategory(CATEGORIES[0].name);
    }
}

function setupEventListeners() {
    document.getElementById('scanBtn').addEventListener('click', runScan);
    document.getElementById('clearBtn').addEventListener('click', clearAllFilters);
    document.getElementById('exportBtn').addEventListener('click', exportResults);
    document.getElementById('saveFilterBtn').addEventListener('click', saveCurrentFilter);
    
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('storedFiltersMenu');
        const btn = document.getElementById('storedFiltersBtn');
        if (menu && !menu.contains(e.target) && !btn.contains(e.target)) {
            menu.style.display = 'none';
        }
    });
}

// =============================================================================
// CATEGORY SELECTION
// =============================================================================

function selectCategory(categoryName) {
    state.currentCategory = categoryName;
    state.searchTerm = null;
    
    // Clear search input when selecting a category
    var searchInput = document.getElementById('filterSearchInput');
    if (searchInput) searchInput.value = '';
    var clearBtn = document.getElementById('searchClearBtn');
    if (clearBtn) clearBtn.classList.remove('visible');
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === categoryName);
    });
    
    document.getElementById('currentCategoryName').textContent = categoryName;
    
    var filters = FILTERS[categoryName] || [];
    document.getElementById('filterCount').textContent = `${filters.length} filters`;
    
    renderFilterList(filters);
}

function renderFilterList(filters, searchTerm) {
    var container = document.getElementById('filterList');
    
    if (filters.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="material-icons">filter_list_off</span>
                <p>${searchTerm ? 'No filters match your search' : 'No filters available'}</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filters.map(filter => {
        const isSelected = state.selectedFilters.some(f => f.id === filter.id);
        let displayName = filter.name;
        if (searchTerm) {
            const regex = new RegExp(`(${escapeRegex(searchTerm)})`, 'gi');
            displayName = filter.name.replace(regex, '<span class="search-highlight">$1</span>');
        }
        return `
            <div class="filter-item ${isSelected ? 'selected' : ''}" 
                 data-filter-id="${filter.id}" 
                 onclick="toggleFilter('${filter.id}')">
                <div class="checkbox"></div>
                <span>${displayName}</span>
                ${filter._category ? `<span style="font-size: 11px; color: #94a3b8; margin-left: auto;">${filter._category}</span>` : ''}
            </div>
        `;
    }).join('');
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// =============================================================================
// FILTER SEARCH
// =============================================================================

function handleFilterSearch(searchTerm) {
    var clearBtn = document.getElementById('searchClearBtn');
    
    if (searchTerm.trim()) {
        clearBtn.classList.add('visible');
        state.searchTerm = searchTerm.trim().toLowerCase();
        
        // Search across all categories
        var allMatches = [];
        for (const [category, filters] of Object.entries(FILTERS)) {
            filters.forEach(filter => {
                if (filter.name.toLowerCase().includes(state.searchTerm)) {
                    allMatches.push({ ...filter, _category: category });
                }
            });
        }
        
        // Clear category selection visual
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById('currentCategoryName').textContent = `Search Results: "${searchTerm}"`;
        document.getElementById('filterCount').textContent = `${allMatches.length} matches`;
        
        renderFilterList(allMatches, searchTerm);
    } else {
        clearBtn.classList.remove('visible');
        state.searchTerm = null;
        
        // Restore current category view
        if (state.currentCategory) {
            selectCategory(state.currentCategory);
        } else {
            document.getElementById('currentCategoryName').textContent = 'Select a Category';
            document.getElementById('filterCount').textContent = '0 filters';
            document.getElementById('filterList').innerHTML = `
                <div class="empty-state">
                    <p>Select a category tab to view available filters</p>
                </div>
            `;
        }
    }
}

function clearFilterSearch() {
    var searchInput = document.getElementById('filterSearchInput');
    searchInput.value = '';
    handleFilterSearch('');
    searchInput.focus();
}

// =============================================================================
// FILTER MANAGEMENT
// =============================================================================

function toggleFilter(filterId) {
    var existingIndex = state.selectedFilters.findIndex(f => f.id === filterId);
    
    if (existingIndex >= 0) {
        state.selectedFilters.splice(existingIndex, 1);
    } else {
        const filter = findFilterById(filterId);
        if (filter) {
            state.selectedFilters.push({
                ...filter,
                config: getDefaultConfig(filter)
            });
        }
    }
    
    updateUI();
}

function findFilterById(filterId) {
    for (const category of Object.values(FILTERS)) {
        const filter = category.find(f => f.id === filterId);
        if (filter) return filter;
    }
    return null;
}

function getDefaultConfig(filter) {
    var config = { condition: 'above', value: '' };
    
    if (filter.period_options) config.period = filter.default_period || filter.period_options[0];
    if (filter.fixed_period) config.period = filter.fixed_period;
    if (filter.timeframes?.length > 0) config.timeframe = filter.default_timeframe || filter.timeframes[0];
    if (filter.fiscal_periods) config.fiscal_period = filter.default_fiscal_period || filter.fiscal_periods[0];
    if (filter.growth_periods) config.growth_period = filter.default_growth_period || filter.growth_periods[0];
    if (filter.input_options) config.inputs = filter.default_input || filter.input_options[0];
    if (filter.channels) config.channel = filter.channels[0];
    if (filter.plot_options) config.plot = filter.default_plot || filter.plot_options[0];
    if (filter.options) config.selected_values = [];
    
    return config;
}

function removeFilter(filterId) {
    state.selectedFilters = state.selectedFilters.filter(f => f.id !== filterId);
    updateUI();
}

function updateFilterConfig(filterId, field, value) {
    var filter = state.selectedFilters.find(f => f.id === filterId);
    if (filter) filter.config[field] = value;
    updateButtonStates();
}

function handleConditionChange(filterId, condition) {
    var filter = state.selectedFilters.find(f => f.id === filterId);
    if (filter) {
        filter.config.condition = condition;
        var isAdvanced = ADVANCED_CONDITIONS.some(c => c.id === condition);
        if (isAdvanced) {
            filter.config.target = filter.config.target || 'sma';
            filter.config.target_period = filter.config.target_period || 50;
            filter.config.pct_min = filter.config.pct_min || 0;
            filter.config.pct_max = filter.config.pct_max || 3;
        }
        updateUI();
    }
}

function handleTargetChange(filterId, targetId) {
    var filter = state.selectedFilters.find(f => f.id === filterId);
    if (filter) {
        filter.config.target = targetId;
        var targetDef = TARGET_FIELDS.find(t => t.id === targetId);
        if (targetDef && targetDef.periods) {
            filter.config.target_period = filter.config.target_period || targetDef.periods[2] || targetDef.periods[0];
        }
        updateUI();
    }
}

function handlePercentageRangeChange(filterId, rangeId) {
    var filter = state.selectedFilters.find(f => f.id === filterId);
    if (filter) {
        var range = PERCENTAGE_RANGES.find(r => r.id === rangeId);
        if (range) {
            filter.config.pct_range = rangeId;
            filter.config.pct_min = range.min;
            filter.config.pct_max = range.max;
        }
        updateUI();
    }
}

function renderAdvancedComparisonFields(filter, config) {
    var condition = config.condition;
    var isCrossCondition = ['crosses', 'crosses_above', 'crosses_below'].includes(condition);
    var isPctCondition = ['above_pct', 'below_pct', 'between_pct'].includes(condition);
    var selectedTarget = TARGET_FIELDS.find(t => t.id === config.target);
    
    var fields = '';
    
    if (isPctCondition) {
        var currentRange = config.pct_range || '0_3';
        fields += `
            <div class="field-group">
                <label>Percentage</label>
                <select onchange="handlePercentageRangeChange('${filter.id}', this.value)">
                    ${PERCENTAGE_RANGES.map(r => `<option value="${r.id}" ${currentRange === r.id ? 'selected' : ''}>${r.name}</option>`).join('')}
                </select>
            </div>
        `;
    }
    
    fields += `
        <div class="field-group">
            <label>Compare To</label>
            <select onchange="handleTargetChange('${filter.id}', this.value)">
                ${TARGET_FIELDS.map(t => `<option value="${t.id}" ${config.target === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
            </select>
        </div>
    `;
    
    if (selectedTarget && selectedTarget.periods) {
        fields += `
            <div class="field-group">
                <label>Period</label>
                <select onchange="updateFilterConfig('${filter.id}', 'target_period', parseInt(this.value))">
                    ${selectedTarget.periods.map(p => `<option value="${p}" ${config.target_period == p ? 'selected' : ''}>${p}</option>`).join('')}
                </select>
            </div>
        `;
    }
    
    return fields;
}

function toggleCheckboxOption(filterId, optionValue) {
    var filter = state.selectedFilters.find(f => f.id === filterId);
    if (filter?.config.selected_values) {
        const index = filter.config.selected_values.indexOf(optionValue);
        if (index >= 0) filter.config.selected_values.splice(index, 1);
        else filter.config.selected_values.push(optionValue);
    }
    updateButtonStates();
}

// =============================================================================
// UI RENDERING
// =============================================================================

function updateUI() {
    if (state.currentCategory) {
        renderFilterList(FILTERS[state.currentCategory] || []);
    }
    renderSelectedFilters();
    updateButtonStates();
}

function renderSelectedFilters() {
    var container = document.getElementById('selectedFilters');
    
    if (state.selectedFilters.length === 0) {
        container.innerHTML = `
            <div class="empty-state" id="emptyConfigState">
                <span class="material-icons">playlist_add</span>
                <p>Click on filters to add them here</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = state.selectedFilters.map(filter => renderConfigCard(filter)).join('');
}

function renderConfigCard(filter) {
    return `
        <div class="config-card" data-filter-id="${filter.id}">
            <div class="config-card-header">
                <h4>${filter.name}</h4>
                <button class="remove-btn" onclick="removeFilter('${filter.id}')">
                    <span class="material-icons">close</span>
                </button>
            </div>
            <div class="config-fields">
                ${renderConfigFields(filter)}
            </div>
        </div>
    `;
}

function renderConfigFields(filter) {
    var config = filter.config;
    let fields = '';
    
    // Period selection
    if (filter.period_options && !filter.fixed_period) {
        fields += `
            <div class="field-group">
                <label>Period</label>
                <select onchange="updateFilterConfig('${filter.id}', 'period', this.value)">
                    ${filter.period_options.map(p => `<option value="${p}" ${config.period == p ? 'selected' : ''}>${p}</option>`).join('')}
                </select>
            </div>
        `;
    } else if (filter.fixed_period) {
        fields += `<div class="field-group"><label>Period</label><input type="text" value="${filter.fixed_period}" disabled></div>`;
    }
    
    // Timeframe selection
    if (filter.timeframes?.length > 1) {
        fields += `
            <div class="field-group">
                <label>Timeframe</label>
                <select onchange="updateFilterConfig('${filter.id}', 'timeframe', this.value)">
                    ${filter.timeframes.map(t => `<option value="${t}" ${config.timeframe === t ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
            </div>
        `;
    }
    
    // Fiscal period
    if (filter.fiscal_periods) {
        fields += `
            <div class="field-group">
                <label>Fiscal Period</label>
                <select onchange="updateFilterConfig('${filter.id}', 'fiscal_period', this.value)">
                    ${filter.fiscal_periods.map(p => `<option value="${p}" ${config.fiscal_period === p ? 'selected' : ''}>${p}</option>`).join('')}
                </select>
            </div>
        `;
    }
    
    // Growth period
    if (filter.growth_periods) {
        fields += `
            <div class="field-group">
                <label>Growth Period</label>
                <select onchange="updateFilterConfig('${filter.id}', 'growth_period', this.value)">
                    ${filter.growth_periods.map(p => `<option value="${p}" ${config.growth_period === p ? 'selected' : ''}>${p}</option>`).join('')}
                </select>
            </div>
        `;
    }
    
    // Stochastic/Ichimoku inputs
    if (filter.input_options) {
        fields += `
            <div class="field-group">
                <label>Inputs</label>
                <select onchange="updateFilterConfig('${filter.id}', 'inputs', this.value)">
                    ${filter.input_options.map(i => `<option value="${i}" ${config.inputs === i ? 'selected' : ''}>${i}</option>`).join('')}
                </select>
            </div>
        `;
    }
    
    // Channel selection
    if (filter.channels) {
        fields += `
            <div class="field-group">
                <label>Channel</label>
                <select onchange="updateFilterConfig('${filter.id}', 'channel', this.value)">
                    ${filter.channels.map(c => `<option value="${c}" ${config.channel === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
            </div>
        `;
    }
    
    // MACD/Ichimoku plot selection
    if (filter.plot_options) {
        fields += `
            <div class="field-group">
                <label>Plot</label>
                <select onchange="updateFilterConfig('${filter.id}', 'plot', this.value)">
                    ${filter.plot_options.map(p => `<option value="${p}" ${config.plot === p ? 'selected' : ''}>${p}</option>`).join('')}
                </select>
            </div>
        `;
    }
    
    // Checkbox list for multi-select
    if (filter.options && filter.type === 'checkbox_list') {
        fields += `
            <div class="field-group" style="grid-column: 1 / -1;">
                <label>Select Options</label>
                <div class="checkbox-list">
                    ${filter.options.map(opt => `
                        <label class="checkbox-option">
                            <input type="checkbox" ${config.selected_values?.includes(opt) ? 'checked' : ''} onchange="toggleCheckboxOption('${filter.id}', '${opt}')">
                            ${opt}
                        </label>
                    `).join('')}
                </div>
            </div>
        `;
    } else if (filter.type !== 'date_preset' && filter.type !== 'predefined_ranges') {
        var supportsAdvanced = FILTERS_WITH_ADVANCED_COMPARISON.includes(filter.id);
        var allConditions = supportsAdvanced ? [...CONDITIONS, ...ADVANCED_CONDITIONS] : CONDITIONS;
        var isAdvancedCondition = ADVANCED_CONDITIONS.some(c => c.id === config.condition);
        
        fields += `
            <div class="field-group">
                <label>Condition</label>
                <select onchange="handleConditionChange('${filter.id}', this.value)">
                    ${allConditions.map(c => `<option value="${c.id}" ${config.condition === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
                </select>
            </div>
        `;
        
        if (isAdvancedCondition && supportsAdvanced) {
            fields += renderAdvancedComparisonFields(filter, config);
        } else {
            fields += `
                <div class="field-group">
                    <label>Value ${filter.unit ? `(${filter.unit})` : ''}</label>
                    <input type="number" step="any" value="${config.value || ''}" placeholder="Enter value" onchange="updateFilterConfig('${filter.id}', 'value', this.value)">
                </div>
            `;
            if (config.condition === 'between' || config.condition === 'outside') {
                fields += `
                    <div class="field-group">
                        <label>To Value</label>
                        <input type="number" step="any" value="${config.value_to || ''}" placeholder="Max value" onchange="updateFilterConfig('${filter.id}', 'value_to', this.value)">
                    </div>
                `;
            }
        }
    }
    
    // Date preset / predefined ranges
    if (filter.type === 'date_preset' || filter.type === 'predefined_ranges') {
        fields += `
            <div class="field-group" style="grid-column: 1 / -1;">
                <label>Select Option</label>
                <select onchange="updateFilterConfig('${filter.id}', 'selected_option', this.value)">
                    <option value="">-- Select --</option>
                    ${filter.options.map(opt => `<option value="${opt}" ${config.selected_option === opt ? 'selected' : ''}>${opt}</option>`).join('')}
                </select>
            </div>
        `;
    }
    
    return fields;
}

function updateButtonStates() {
    document.getElementById('appliedCount').textContent = state.selectedFilters.length;
    
    var hasValidFilter = state.selectedFilters.some(f => {
        if (f.type === 'checkbox_list') return f.config.selected_values?.length > 0;
        if (f.type === 'date_preset' || f.type === 'predefined_ranges') return !!f.config.selected_option;
        var isAdvanced = ADVANCED_CONDITIONS.some(c => c.id === f.config.condition);
        if (isAdvanced) return !!f.config.target;
        return f.config.value !== '' && f.config.value !== undefined;
    });
    
    document.getElementById('scanBtn').disabled = !hasValidFilter;
    document.getElementById('exportBtn').disabled = !state.results;
    updateSaveFilterButton();
}

// =============================================================================
// SCAN EXECUTION
// =============================================================================

async function runScan() {
    var scanBtn = document.getElementById('scanBtn');
    var resultsPanel = document.getElementById('resultsPanel');
    var errorMessage = document.getElementById('errorMessage');
    
    scanBtn.disabled = true;
    scanBtn.innerHTML = '<div class="spinner"></div> Scanning...';
    resultsPanel.style.display = 'block';
    errorMessage.style.display = 'none';
    
    document.getElementById('resultsSummary').innerHTML = '';
    document.getElementById('resultsHead').innerHTML = '';
    document.getElementById('resultsBody').innerHTML = `<tr><td colspan="10" class="loading"><div class="spinner"></div> Searching stocks...</td></tr>`;
    
    try {
        const filters = state.selectedFilters.map(f => ({ filter_id: f.id, ...f.config }));
        
        const response = await authFetch(`${API_BASE_URL}/screener/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filters, limit: 50 })
        });
        
        const data = await response.json();
        
        if (data.success) {
            state.results = data;
            renderResults(data);
        } else {
            throw new Error(data.error || 'Scan failed');
        }
    } catch (error) {
        console.error('Scan error:', error);
        errorMessage.textContent = `Error: ${error.message}`;
        errorMessage.style.display = 'block';
        document.getElementById('resultsBody').innerHTML = '';
    } finally {
        scanBtn.disabled = false;
        scanBtn.innerHTML = '<span class="material-icons">search</span> Run Scan';
        updateButtonStates();
    }
}

function renderResults(data) {
    document.getElementById('resultsSummary').innerHTML = `
        <div class="summary-stat"><div class="label">Total Matches</div><div class="value">${data.total_count?.toLocaleString() || 0}</div></div>
        <div class="summary-stat"><div class="label">Showing</div><div class="value">${data.showing || 0}</div></div>
    `;
    
    var columns = data.columns || ['ticker', 'name', 'close', 'change', 'volume'];
    document.getElementById('resultsHead').innerHTML = `<tr>${columns.map(col => `<th>${formatColumnName(col)}</th>`).join('')}</tr>`;
    
    var results = data.results || [];
    if (results.length === 0) {
        document.getElementById('resultsBody').innerHTML = `<tr><td colspan="${columns.length}" class="empty-state"><span class="material-icons">search_off</span><p>No results found</p></td></tr>`;
        return;
    }
    
    document.getElementById('resultsBody').innerHTML = results.map(row => 
        `<tr>${columns.map(col => `<td class="${getCellClass(col, row[col])}">${formatCellValue(col, row[col])}</td>`).join('')}</tr>`
    ).join('');
}

function formatColumnName(col) {
    var names = { 'ticker': 'Ticker', 'name': 'Company', 'close': 'Price', 'change': 'Change %', 'volume': 'Volume', 'market_cap_basic': 'Market Cap' };
    return names[col] || col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatCellValue(col, value) {
    if (value === null || value === undefined) return '—';
    if (col === 'ticker') return value;
    if (col === 'name') return value.length > 30 ? value.substring(0, 30) + '...' : value;
    if (col === 'close') return '$' + parseFloat(value).toFixed(2);
    if (col === 'change') return (value >= 0 ? '+' : '') + parseFloat(value).toFixed(2) + '%';
    if (col === 'volume') return formatNumber(value);
    if (col === 'market_cap_basic') return '$' + formatNumber(value);
    if (typeof value === 'number') return value.toFixed(2);
    return value;
}

function formatNumber(num) {
    if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
    return num.toString();
}

function getCellClass(col, value) {
    if (col === 'ticker') return 'ticker-cell';
    if (col === 'change' && typeof value === 'number') return value >= 0 ? 'positive' : 'negative';
    return '';
}

// =============================================================================
// ACTIONS
// =============================================================================

function clearAllFilters() {
    state.selectedFilters = [];
    state.results = null;
    document.getElementById('resultsPanel').style.display = 'none';
    updateUI();
}

async function exportResults() {
    if (!state.results?.results) return alert('No results to export');
    
    var results = state.results.results;
    var columns = state.results.columns;
    
    let csv = columns.join(',') + '\n';
    results.forEach(row => {
        csv += columns.map(col => {
            const val = row[col];
            if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
            return val ?? '';
        }).join(',') + '\n';
    });
    
    var blob = new Blob([csv], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'screener_results.csv';
    a.click();
    URL.revokeObjectURL(url);
}

// =============================================================================
// SAVED FILTERS MANAGEMENT
// =============================================================================

async function checkLoginStatusAndLoadFilters() {
    try {
        const response = await authFetch(`${API_BASE_URL}/auth/status`);
        const data = await response.json();
        state.isLoggedIn = data.authenticated === true;
        updateSaveFilterButton();
        
        if (state.isLoggedIn) {
            await loadSavedFilters();
        } else {
            state.savedFilters = [];
            renderStoredFiltersMenu();
        }
    } catch (error) {
        state.isLoggedIn = false;
        state.savedFilters = [];
        updateSaveFilterButton();
        renderStoredFiltersMenu();
    }
}

async function loadSavedFilters() {
    if (!state.isLoggedIn) {
        state.savedFilters = [];
        renderStoredFiltersMenu();
        return;
    }
    
    try {
        const response = await authFetch(`${API_BASE_URL}/saved-filters`);
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                state.savedFilters = data.filters || [];
                renderStoredFiltersMenu();
            }
        }
    } catch (error) {
        console.log('Could not load saved filters:', error.message);
    }
}

function toggleStoredFiltersMenu() {
    var menu = document.getElementById('storedFiltersMenu');
    if (menu.style.display === 'none') {
        menu.style.display = 'block';
    } else {
        menu.style.display = 'none';
    }
}

function renderStoredFiltersMenu() {
    var container = document.getElementById('storedFiltersList');
    if (!container) return;
    
    if (!state.isLoggedIn) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 16px; text-align: center; color: #94a3b8; font-size: 13px;">
                Login to save and view filters
            </div>
        `;
        return;
    }
    
    if (state.savedFilters.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 16px; text-align: center; color: #94a3b8; font-size: 13px;">
                No saved filters yet
            </div>
        `;
        return;
    }
    
    container.innerHTML = state.savedFilters.map(filter => `
        <div class="stored-filter-item" onclick="applyStoredFilter(${filter.id})">
            <span class="stored-filter-name">${filter.name}</span>
            <button class="stored-filter-delete" onclick="deleteStoredFilter(${filter.id}, event)" title="Delete filter">
                <span class="material-symbols-rounded">delete</span>
            </button>
        </div>
    `).join('');
}

function updateSaveFilterButton() {
    var saveBtn = document.getElementById('saveFilterBtn');
    if (!saveBtn) return;
    
    if (!state.isLoggedIn) {
        saveBtn.disabled = true;
        saveBtn.title = 'Login to save filters';
    } else if (state.selectedFilters.length === 0) {
        saveBtn.disabled = true;
        saveBtn.title = 'Select filters first';
    } else {
        saveBtn.disabled = false;
        saveBtn.title = 'Save current filter configuration';
    }
}

async function saveCurrentFilter() {
    if (!state.isLoggedIn) {
        alert('Please login to save filters');
        return;
    }
    
    if (state.selectedFilters.length === 0) {
        alert('Please select at least one filter to save');
        return;
    }
    
    var filterName = prompt('Enter a name for this filter configuration:');
    if (!filterName || !filterName.trim()) return;
    
    var filterConfig = state.selectedFilters.map(filter => ({
        filter_id: filter.id,
        category: filter.category || state.currentCategory,
        ...filter.config
    }));
    
    try {
        const response = await authFetch(`${API_BASE_URL}/saved-filters`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: filterName.trim(), filter_config: filterConfig })
        });
        
        const data = await response.json();
        if (data.success) {
            await loadSavedFilters();
            alert('Filter saved successfully!');
        } else {
            alert('Error saving filter: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        alert('Error saving filter: ' + error.message);
    }
}

async function applyStoredFilter(filterId) {
    var savedFilter = state.savedFilters.find(f => f.id === filterId);
    if (!savedFilter) return;
    
    clearAllFilters();
    
    var filterConfig = savedFilter.filter_config;
    
    for (const config of filterConfig) {
        const filterIdFromConfig = config.filter_id;
        let filterDef = null;
        let categoryName = config.category;
        
        for (const [catName, filters] of Object.entries(FILTERS)) {
            const found = filters.find(f => f.id === filterIdFromConfig);
            if (found) {
                filterDef = found;
                categoryName = catName;
                break;
            }
        }
        
        if (filterDef) {
            const defaultConfig = getDefaultConfig(filterDef);
            
            const mergedConfig = { ...defaultConfig };
            for (const [key, value] of Object.entries(config)) {
                if (key !== 'filter_id' && key !== 'category' && value !== undefined && value !== null) {
                    mergedConfig[key] = value;
                }
            }
            
            const newFilter = {
                ...filterDef,
                category: categoryName,
                config: mergedConfig
            };
            state.selectedFilters.push(newFilter);
        }
    }
    
    document.getElementById('storedFiltersMenu').style.display = 'none';
    updateUI();
    updateSaveFilterButton();
}

async function deleteStoredFilter(filterId, event) {
    event.stopPropagation();
    
    if (!confirm('Are you sure you want to delete this saved filter?')) return;
    
    try {
        const response = await authFetch(`${API_BASE_URL}/saved-filters/${filterId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        if (data.success) {
            await loadSavedFilters();
        } else {
            alert('Error deleting filter: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        alert('Error deleting filter: ' + error.message);
    }
}

