# BacktestPro

## Overview
BacktestPro is a web-based platform designed for backtesting trading strategies against historical market data for both options and stocks. It provides a dashboard for users to configure backtests, analyze results, and manage their strategies. The platform integrates with market data providers and supports a wide range of options strategies, aiming to empower users with robust tools for financial strategy validation.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is a Single Page Application (SPA) built with vanilla JavaScript and HTML, utilizing dynamic page loading and a component-based structure. It features a custom, Phoenix-inspired light theme with a white sidebar, blue primary accents, and a light gray background. The UI is authentication-aware, adapting the landing experience and feature access based on user login status. SPA navigation is managed with the History API for a seamless user experience.

### Backend
The backend is built with Flask (Python) and Flask-CORS, serving as both an API and static file server. It implements RESTful API endpoints and uses Flask-Login for authentication, supporting both authenticated and unauthenticated usage. Authentication uses a hybrid cookie + token approach: Flask-Login cookies for direct browser access, and Bearer tokens (stored in localStorage, sent via Authorization header) as fallback for iframe/proxy environments where third-party cookies are blocked. Tokens expire after 7 days and are rotated on each login.

### Backtesting Engines
The system incorporates two distinct backtesting engines: one for options (supporting 16+ strategies) and another for stocks (with custom condition builders). Both engines are wrapped for web API consumption.

#### Options Backtester Strike Selection Methods
The options backtester supports 6 strike selection methods for each leg:
1. **Mid Price Range**: Select strikes based on option mid price range
2. **% Distance from Underlying**: Calculate strike as percentage above/below spot price
3. **$ Distance from Underlying**: Calculate strike as dollar amount above/below spot price
4. **% Distance from Another Leg**: Reference another leg with percentage offset
5. **$ Distance from Another Leg**: Reference another leg with dollar offset
6. **Delta-Based Selection**: Select strikes based on target delta values using Black-Scholes Greeks calculations. Supports methods: closest, above, below, between, exactly.

### Data Storage
User-specific backtest results employ a hybrid storage model: metadata is stored in PostgreSQL, while detailed JSON results, trade logs (CSV), and equity curves (PNG) are stored on the filesystem. All result access requires authentication and ownership verification.

### Key Design Patterns
The architecture utilizes a Wrapper Pattern for API-to-engine communication, Lazy Loading for page scripts, and local storage for API keys and cached data. Hybrid persistence combines database and filesystem storage, with robust authorization checks ensuring data security.

### UI/UX Decisions
- **Design Theme**: Custom implementation inspired by Phoenix Dashboard using CSS variables.
- **Color Scheme**: White sidebar (`#ffffff`), blue primary (`#3b7cff`), soft orange accent (`#f4a261`), light gray background (`#f6f8fb`).
- **Authentication-Aware UI**: Features like backtester fields are dynamically enabled/disabled based on user authentication status.

### Feature Specifications
- **Authentication**: Supports email/password and Google OAuth, including password reset and email change flows.
- **Top Gainers/Losers Widget**: Displays real-time market movers data from Webull, refreshing automatically and adapting to market sessions.
- **Dashboard Data Feeds**: Most Active, Trending, Sector Performance, Indices, and Upcoming Earnings cards are powered by `yfinance` (free, no API key). Gainers/Losers remain on Webull. All feeds use background thread caching with configurable refresh intervals (30-300s).
- **FRED Macro Economic Data**: Integrated with the Federal Reserve (FRED) API via `fredapi` library. Displays 10 key macro indicators on the dashboard: Fed Funds Rate, Unemployment, CPI, Core CPI, GDP, Nonfarm Payrolls, Retail Sales, Consumer Sentiment, Housing Starts, and Industrial Production. Each card shows the latest value, month-over-month change, and data date. Color-coded by category (rates=blue, labor=violet, inflation=red, output=green, consumer=amber, housing=cyan). Refreshes every 10 minutes. Requires `FRED_API_KEY` environment secret.
- **Public Pages**: Includes landing, terms, privacy, FAQ, and contact pages.
- **Subscription Management**: Integrates with Stripe for billing, plan upgrades/downgrades with proration logic, and customer portal access.
- **Settings Page**: Allows account management, API key configuration, and notification preferences.
- **Stock Screener**: Filters stocks by technical and fundamental criteria, supporting saved filters for logged-in users.
- **Dashboard Access Control**: Protected routes ensure only authenticated users can access dashboard features.
- **Notification System**: Allows users to create automated stock scanners that run on a schedule and deliver alerts via Email or Telegram. Uses APScheduler for background jobs and encrypts sensitive credentials.
- **Ticker Detail Page**: Standalone page at `/ticker/<symbol>` showing real-time price, stats grid (market cap, P/E, EPS, volume, sector, etc.), interactive Chart.js price chart with period selector (5D/1M/3M/6M/1Y/5Y), ticker-specific news, and tabbed financial statements (income/balance/cashflow) from yfinance. Clicking any row in the financials table renders a bar+line trend chart below showing that metric across years (e.g., Total Revenue trend). Supports Treasury rate symbols (^TNX, ^TYX, etc.) and economic indicators (^VIX, DX-Y.NYB, CL=F, GC=F) with full chart history. All dashboard ticker symbols are clickable links navigating to the detail page. Backend validates symbols and sanitizes all data; frontend escapes all dynamic content to prevent XSS.
- **Backtester Templates**: "Use Template" button on results pages stores config in sessionStorage and navigates back to config page with settings pre-filled.
- **Pre-Backtest Confirmation Modal**: Before running any backtest, a summary overlay shows all configuration settings. User must click "Confirm" (Run Backtest) or "Modify" to go back and adjust settings.
- **Decision Tree Log**: Both stock and options backtest results include a per-day decision log showing every trading day in the period. Stock: engine (`backtester_engine_v3_0__6_.py`) builds `decision_log` alongside trades. Options: engine (`options_backtester_v2_3_3_5.py`) `run_backtest()` returns 3-tuple `(trades, equity, decision_log)`, wrapper saves as `decision_log_{id}.json`, metadata endpoint includes it. Each day tracks: underlying price, conditions checked, whether met, entry details (legs, premium, contracts), exit details (reason, P&L), or skip reason (data gaps, premium filter, insufficient capital). Frontend renders as expandable day-by-day log with color-coded statuses.
- **Simulated Trading**: Two-page architecture: config page (`simulatedTradingPage`) for session setup + active session cards, and a dedicated full-screen dark-themed trading page (`simTradingActivePage`) with TradingView Lightweight Charts v4. Config page lets users set symbol, date range, trading start date, mode (stock/options), and initial balance. Active session cards show saved sessions with Resume/End buttons. Trading page features: professional candlestick + volume chart via Lightweight Charts API, OHLC bar, timeframe switching (1m/5m/15m/30m/1h/2h/4h via client-side aggregation from 1m bars), bar navigation (prev/next/play/pause), go-to-date/time, position price lines on chart. Stock mode: Buy/Sell with quantity. Options mode: 16 strategies, configurable leg strike selection (% underlying, $ underlying, exact, delta, mid-price, $ from leg, % from leg), TP/SL, partial closes, expiration tracking. Session persistence via localStorage — saves config + trading state (not raw bars), re-fetches bars on resume. End session runs full analytics (equity curve, win rate, Sharpe ratio, profit factor, max drawdown, etc.) and navigates to results page. Sessions stored with format DDMMYYHHMM(S/O) as Session ID.
- **Underlying Price Conditions**: Advanced entry filtering system supporting both preset and custom conditions for both stock and options backtesters. **Preset conditions**: Premarket Change %, Change %, Gap %, Change-Open %, and Velocity (rate of change over N minutes). **Custom conditions**: Technical indicators (SMA, EMA, RSI, MACD) supporting both intraday minute bars and day-level bars. Day candle conditions compare daily OHLC values with proper timezone conversion from UTC to Eastern. When Day candle type is selected, entry time auto-locks to 09:30 AM. Both sides support SMA/EMA (configurable period and series), RSI (configurable period, always uses close), MACD (configurable short/long/signal windows, component selection: histogram/signal/MACD line). Right side also supports a fixed numeric "Value" type for absolute comparisons (e.g., RSI < 30, MACD histogram > 0). Indicators are computed locally from minute-level OHLCV data using up to 60 days of history, with lookahead bias prevention.
- **Input Validation**: Both stock and options backtesters perform comprehensive client-side validation before submission. Checks include: date range validity (start < end, not future, max 2 years), symbol format, entry time bounds, indicator window bounds (SMA/EMA 2-500, RSI 2-100), MACD short < long period, position sizing limits, TP/SL positivity, PDT+0DTE conflict detection, leg self-reference detection, allocation bounds, velocity lookback limits, and custom condition completeness. All errors displayed inline before API call.

## External Dependencies

### Third-Party APIs
-   **Polygon.io**: Primary market data for stocks and options.
-   **Webull**: Real-time market movers data (Top Gainers/Losers).
-   **Stripe**: Payment processing and subscription management.
-   **Mailtrap**: SMTP service for email delivery (e.g., password resets, email verification, scanner notifications).
-   **Telegram Bot API**: For delivering scanner notifications.
-   **TradingView Screener Library**: Used by the stock screener and notification system for filtering.

### Python Libraries
-   `Flask`: Web framework.
-   `Flask-CORS`: Cross-origin resource sharing.
-   `Requests`: HTTP client.
-   `Flask-Login`: User session management.
-   `Flask-SQLAlchemy`: ORM for database interaction.
-   `polygon-api-client`: Python client for Polygon.io.
-   `webull`: Python library for Webull data.
-   `APScheduler`: For background task scheduling (scanner notifications).
-   `cryptography`: For encryption (Telegram tokens).
-   `scipy`: For Black-Scholes options Greeks calculations (norm, brentq optimizer).

### Frontend Libraries (CDN)
-   `Chart.js`: For data visualization (equity curves, performance charts).
-   `TradingView Lightweight Charts v4`: Professional candlestick/volume charting for simulated trading.
-   `Font Awesome`: Icons.
-   `Material Symbols Rounded`: Google Material icons.
-   `Inter Font`: Typography.

## Replit Environment Setup

### Configuration
- Workflow: "Backend Server" runs `python3 main.py` (uses `.pythonlibs` virtualenv automatically)
- Deployment: `gunicorn --bind 0.0.0.0:5000 main:app`
- Port: 5000 (mapped to external port 80)

### Secrets (stored in Replit Secrets — never in .replit)
- `FLASK_SECRET_KEY`: Flask session signing key
- `ADMIN_PASSWORD`: Admin user bootstrap password
- `POLYGON_API_KEY`: Polygon.io API key
- `ENCRYPTION_KEY`: Encryption key for sensitive data

### Env Vars (non-sensitive, in .replit userenv.shared)
- `FLASK_DEBUG`, `PORT`, `AUTO_CREATE_SCHEMA`, `ENABLE_SCHEDULER`
- `SESSION_COOKIE_SECURE`, `CORS_ORIGINS`
- `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_BOOTSTRAP_ENABLED`

### Known Quirks
- Some market tickers (QQQ, IWM) occasionally return NaN from yfinance; handled server-side via `_sanitize_nan()` and client-side via `_fmt()` helper
- Admin bootstrap is idempotent — safe to restart with ADMIN_BOOTSTRAP_ENABLED=1

### Database
-   `PostgreSQL`: Used for user authentication, saved filters, and backtest metadata storage. Configured with SQLAlchemy ORM and connection pooling.