# BacktestPro

## Overview
BacktestPro is a web-based platform for backtesting trading strategies across options and stocks using historical market data. It offers a dashboard for configuring backtests, analyzing results, and managing strategies, integrating with various market data providers. The platform aims to provide robust tools for financial strategy validation, empowering users with comprehensive insights into strategy performance and market potential.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is a vanilla JavaScript and HTML Single Page Application (SPA) with a component-based structure. It features a custom light theme (Phoenix-inspired) with a white sidebar, blue accents, and a light gray background. The UI adapts based on user authentication, and navigation uses the History API.

### Backend
Built with Flask, the backend provides a RESTful API and serves static files. It uses Flask-Login for authentication, supporting both authenticated and unauthenticated access via a hybrid cookie + Bearer token approach.

### Backtesting Engines
The system includes specialized backtesting engines for options (supporting 22+ strategies including calendar/diagonal spreads) and stocks (with custom condition builders), both exposed via web APIs. The options engine supports 6 strike selection methods, and strategies like calendar/diagonal spreads use per-leg DTE. An IV% entry condition filter is also available.

### Data Storage
Backtest results use a hybrid storage model: metadata in PostgreSQL, and detailed JSON results, trade logs, and equity curves stored on the filesystem, with access secured by authentication and ownership verification.

### Key Design Patterns
The architecture employs a Wrapper Pattern for API-to-engine communication, Lazy Loading for scripts, and server-side environment secrets. It uses hybrid persistence (database + filesystem) and robust authorization checks.

### UI/UX Decisions
-   **Design Theme**: Custom Phoenix Dashboard-inspired CSS with a white sidebar, blue primary, soft orange accent, and light gray background.
-   **Authentication-Aware UI**: Dynamic feature access based on user login status.
-   **Backtester Form Redesign**: Both options and stock backtester forms share a modern UX/UI pattern with gradient card headers, numbered step indicators, toggle buttons, side-by-side TP/SL cards, allocation type buttons, collapsible optional sections, and a sticky run bar.

### Feature Specifications
-   **Authentication**: Supports email/password and Google OAuth, including password and email management.
-   **Market Data Widgets**: Displays Top Gainers/Losers, Most Active, Trending, Sector Performance, Indices, and Upcoming Earnings with background server-side and client-side caching.
-   **FRED Macro Economic Data**: Displays 10 key indicators from the Federal Reserve (FRED) API.
-   **Public Pages**: Includes landing, terms, privacy, FAQ, and contact pages.
-   **Strategy Guide**: A comprehensive reference page with 3 main tabs: (1) Strategy Guide covering 22 options strategies with SVG payoff diagrams, (2) Backtester Reference with Options/Stock sub-toggle (Options: 14 form sections; Stock: 7 form sections), (3) Results Reference with Options/Stock sub-toggle (Options: SVG mock visualizations, 39-column trade log, decision tree events; Stock: equity curve, 10-column trade log, decision tree). All tabs and sub-tabs support search filtering.
-   **Subscription Management**: A 3-tier system (Free, Standard, Premium) with Stripe integration, enforcing tier restrictions client-side and server-side.
-   **Settings Page**: Allows users to manage account, password, notification preferences, and upload a custom profile picture or use a generated default.
-   **Stock Screener**: Filters stocks by technical/fundamental criteria across 7 categories, supports saved filters, and validates against TradingView API field names.
-   **Notification System**: Automated stock scanners with alerts via Email or Telegram, managed via APScheduler. Features a notifications page with search, detail modals, and an unread count badge.
-   **Options Market Data Widget**: Displays live options market data from Yahoo Finance with a dropdown for Most Active, Top Gainers, Top Losers, Highest IV, and Highest OI.
-   **Ticker Detail Page**: Dedicated page showing real-time price, stats, interactive candlestick chart, news, tabbed financial statements, and an options chain with a 3-panel butterfly layout.
-   **Backtester Templates**: Allows saving and reusing backtest configurations.
-   **Pre-Backtest Confirmation**: A modal summary of settings before running a backtest.
-   **Decision Tree Log**: Provides detailed per-day decision logs for both stock and options backtests.
-   **Backtest Result Detail Pages (SPA)**: Options and stock backtest results are rendered as SPA pages, providing equity curves, performance stats, configuration cards, trade logs, and decision tree rendering with CSV download.
-   **Simulated Trading**: A two-page interface for stock/options simulation with a dark-themed trading page using TradingView Lightweight Charts, featuring candlestick charts, indicators (SMA, EMA, VWAP), position management, and session persistence. Guest users have limited functionality.
-   **Underlying Price Conditions**: Advanced entry filtering for backtesters with preset and custom conditions (e.g., SMA, EMA, RSI, MACD), supporting intraday and daily bars with lookahead bias prevention.
-   **Exit Conditions**: Both stock and options backtesters support signal-based exit conditions in addition to TP/SL, offering Preset and Custom Builder modes, with careful temporal ordering.
-   **Background Backtest Execution & Concurrency Control**: Backtests run asynchronously, limited to one per user, with running detection, cancellation, and HTTP 429 blocking.
-   **Input Validation**: Comprehensive client-side validation for all backtester inputs.
-   **SPY Data Cache**: A local Parquet file containing 2 years of SPY 1-minute OHLCV+VWAP data for reduced external API calls.

## External Dependencies

### Third-Party APIs
-   **Polygon.io**: Primary market data.
-   **Webull**: Real-time market movers.
-   **Stripe**: Payment processing.
-   **Mailtrap**: SMTP service for email.
-   **Telegram Bot API**: Scanner notifications.
-   **FRED API**: Macroeconomic data.
-   **TradingView Screener Library**: Stock filtering.
-   **yfinance**: Financial data feeds.

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
-   `fredapi`: FRED API client.

### Frontend Libraries (CDN)
-   `Chart.js`: Data visualization.
-   `TradingView Lightweight Charts v4`: Candlestick charts.
-   `Font Awesome`: Icons.
-   `Material Symbols Rounded`: Icons.
-   `Inter Font`: Typography.

### Database
-   **PostgreSQL**: User data, saved filters, and backtest metadata.

## Replit Migration Notes
- The app runs as a Flask/Gunicorn web service on port 5000 in Replit.
- Development defaults to the local SQLite database path when `DATABASE_URL` is not provided.
- Demo/test accounts are no longer seeded automatically; set `SEED_TEST_ACCOUNTS=1` only when that behavior is intentionally needed.