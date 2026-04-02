# BacktestPro

## Overview
BacktestPro is a web-based platform for backtesting trading strategies across options and stocks using historical market data. It offers a dashboard for configuring backtests, analyzing results, and managing strategies, integrating with various market data providers. The platform aims to provide robust tools for financial strategy validation.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is a vanilla JavaScript and HTML Single Page Application (SPA) with a component-based structure. It features a custom light theme (Phoenix-inspired) with a white sidebar, blue accents, and a light gray background. The UI adapts based on user authentication, and navigation uses the History API.

### Backend
Built with Flask, the backend provides a RESTful API and serves static files. It uses Flask-Login for authentication, supporting both authenticated and unauthenticated access via a hybrid cookie + Bearer token approach.

### Backtesting Engines
The system includes specialized backtesting engines for options (supporting 16+ strategies) and stocks (with custom condition builders), both exposed via web APIs. The options engine supports 6 strike selection methods, including mid-price range, distance from underlying (percentage or dollar), distance from another leg, and delta-based selection.

### Data Storage
Backtest results use a hybrid storage model: metadata in PostgreSQL, and detailed JSON results, trade logs, and equity curves stored on the filesystem, with access secured by authentication and ownership verification.

### Key Design Patterns
The architecture employs a Wrapper Pattern for API-to-engine communication, Lazy Loading for scripts, and server-side environment secrets. It uses hybrid persistence (database + filesystem) and robust authorization checks.

### UI/UX Decisions
-   **Design Theme**: Custom Phoenix Dashboard-inspired CSS.
-   **Color Scheme**: White sidebar, blue primary, soft orange accent, light gray background.
-   **Authentication-Aware UI**: Dynamic feature access based on user login status.

### Feature Specifications
-   **Authentication**: Email/password and Google OAuth, including password and email management.
-   **Market Data Widgets**: Top Gainers/Losers (Webull), Most Active, Trending, Sector Performance, Indices, Upcoming Earnings (yfinance). All use background server-side caching. Client-side localStorage caching (5-min TTL, `dash_` prefix) renders cached data instantly on re-navigation and refreshes every 5 minutes. All ticker symbols are clickable links to `/ticker/<SYMBOL>` pages. Earnings entries with NA/N/A symbols or dates are filtered out; NA timing badges are hidden. Both `dashboard-script.js` and the duplicate renderers in `main-script.js` must stay in sync.
-   **FRED Macro Economic Data**: Displays 10 key indicators from the Federal Reserve (FRED) API, updated every 10 minutes.
-   **Public Pages**: Landing, terms, privacy, FAQ, and contact.
-   **Subscription Management**: Stripe integration for billing and plan management.
-   **Settings Page**: Account, password, notification preferences, and profile picture upload. Users can upload a custom avatar (PNG/JPG/GIF/WebP, max 5MB) or use a default letter-initial avatar with gradient coloring derived from their name. Profile pictures are stored in `static/uploads/avatars/`. The avatar is displayed across all pages (dashboard, public pages, backtest results) replacing the old static profile.jpg.
-   **Stock Screener**: Filters stocks by technical/fundamental criteria across 7 categories (Security Info, Market Data, Technicals, Financials, Margin & Ratios, Valuation & Growth, Dividends) with filter IDs aligned between frontend and backend; supports saved filters for logged-in users. Filter column names are validated against TradingView's actual API field names. Growth filters use base column + GROWTH_PERIOD_MAP suffix pattern (e.g., `total_revenue_yoy_growth_ttm`). Removed unavailable filters: IPO fields, Keltner Channels, candlestick patterns, forward_pe, peg_ratio, interest_expense, selling_admin, intangibles, interest_coverage, and several growth metrics. Both `screener-script.js` (root) and `static/js/screener-script.js` must stay in sync.
-   **Notification System**: Automated stock scanners with alerts via Email or Telegram, scheduled via APScheduler. Scanner scheduler uses US/Eastern time for active hours. Notifications page features scrollable sections with search bars (appear when content exceeds threshold), clickable notification items that open a detail modal showing filter parameters and all matched symbols. The header bell icon shows an unread count badge (hidden when 0) that resets when the dropdown is opened. The dropdown loads the 10 most recent notifications with scanner name, symbol count, symbol preview, and relative time. A "View More" link appears when there are more than 10 and navigates to the full notifications page. Unread tracking uses `notifications_viewed_at` on the User model. Count auto-refreshes every 60 seconds.
-   **Options Market Data Page**: Displays live options market data from Yahoo Finance with five tabs: Most Active, Top Gainers, Top Losers, Highest Implied Volatility, Highest Open Interest. Shows contract symbol, underlying, strike, expiration, price, change, bid/ask, volume, open interest, and implied volatility. Backend API (`/api/options-market`) scrapes Yahoo Finance's embedded JSON data. Files: `options-market.html`, `static/js/options-market-script.js`.
-   **Screener Stored Filters Modal**: Replaced dropdown with a full modal overlay (`#storedFiltersModal`) with search, scrollable list, filter count badges, and click-to-apply. `escapeHtml()` helper added to screener script.
-   **Ticker Detail Page**: Dedicated page showing real-time price, stats, interactive candlestick chart (Chart.js bar + custom wick plugin), news, and tabbed financial statements from yfinance. Supports 1D/5D/1M/3M/6M/1Y/5Y periods. Header/sidebar is identical to the dashboard (dark logo bar, full sidebar navigation, search bar, user profile). Options chain uses a 3-panel butterfly layout: calls panel | fixed strike panel | puts panel. ATM row is positioned 3rd from top. Range slider reveals outer/inner metrics on both sides.
-   **Backtester Templates**: Allows saving and reusing backtest configurations.
-   **Pre-Backtest Confirmation**: A modal summary of settings before running a backtest.
-   **Decision Tree Log**: Detailed per-day decision logs for both stock and options backtests, showing conditions, entry/exit details, and P&L.
-   **Simulated Trading**: A two-page interface for setting up and conducting simulated trading sessions (stock/options) with a dark-themed, full-screen trading page using TradingView Lightweight Charts. Features include candlestick charts, OHLC bars, timeframe switching, bar navigation, position management, and session persistence.
-   **Underlying Price Conditions**: Advanced entry filtering for backtesters with preset (e.g., Change %, Gap %) and custom (e.g., SMA, EMA, RSI, MACD) conditions, supporting both intraday and daily bars. Indicators are computed locally with lookahead bias prevention.
-   **Background Backtest Execution & Concurrency Control**: Backtests run asynchronously, limited to one per user. The system provides running detection, cancellation support, and HTTP 429 blocking for concurrent requests.
-   **Input Validation**: Comprehensive client-side validation for all backtester inputs, covering date ranges, symbol formats, indicator bounds, and financial constraints.
-   **SPY Data Cache**: A local Parquet file (`data/spy_1min.parquet`) containing 2 years of SPY 1-minute OHLCV+VWAP data, updated daily, to reduce external API calls.

## External Dependencies

### Third-Party APIs
-   **Polygon.io**: Primary market data.
-   **Webull**: Real-time market movers.
-   **Stripe**: Payment processing.
-   **Mailtrap**: SMTP service for email.
-   **Telegram Bot API**: Scanner notifications.
-   **FRED API**: Macroeconomic data.
-   **TradingView Screener Library**: Stock filtering.

### Python Libraries
-   `Flask`: Web framework.
-   `Flask-CORS`: CORS handling.
-   `Requests`: HTTP client.
-   `Flask-Login`: User sessions.
-   `Flask-SQLAlchemy`: ORM.
-   `polygon-api-client`: Polygon.io client.
-   `webull`: Webull data.
-   `APScheduler`: Background tasks.
-   `cryptography`: Encryption.
-   `scipy`: Black-Scholes calculations.
-   `yfinance`: Financial data feeds.
-   `fredapi`: FRED API client.

### Frontend Libraries (CDN)
-   `Chart.js`: Data visualization.
-   `TradingView Lightweight Charts v4`: Candlestick charts.
-   `Font Awesome`: Icons.
-   `Material Symbols Rounded`: Icons.
-   `Inter Font`: Typography.

### Database
-   **PostgreSQL**: User data, saved filters, and backtest metadata.