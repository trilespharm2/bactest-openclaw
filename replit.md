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
- **Public Pages**: Includes landing, terms, privacy, FAQ, and contact pages.
- **Subscription Management**: Integrates with Stripe for billing, plan upgrades/downgrades with proration logic, and customer portal access.
- **Settings Page**: Allows account management, API key configuration, and notification preferences.
- **Stock Screener**: Filters stocks by technical and fundamental criteria, supporting saved filters for logged-in users.
- **Dashboard Access Control**: Protected routes ensure only authenticated users can access dashboard features.
- **Notification System**: Allows users to create automated stock scanners that run on a schedule and deliver alerts via Email or Telegram. Uses APScheduler for background jobs and encrypts sensitive credentials.
- **Backtester Templates**: Users can save and load strategy configurations for both options and stock backtesters. Templates save all form settings except name and dates, allowing quick switching between strategy configurations. Templates are stored per-user in the database via BacktestTemplate model.
- **Simulated Trading**: Bar-by-bar historical trading simulator with Stock and Options trading modes. Features a Trading Mode selector, Buy/Sell controls for stocks, and full options strategy execution (16 strategies, TP/SL, DTE, detection bars). Includes a "Run Analysis" button that generates comprehensive session analytics: equity curve, performance stats (win rate, Sharpe ratio, profit factor, risk per trade, return on risk, max drawdown, consecutive wins/losses, etc.), and a paginated trade log with CSV download. Sessions are stored in localStorage with format DDMMYYHHMM(S/O) as Session ID. Results accessible via Results > Simulated Trading in sidebar.
- **Underlying Price Conditions**: Advanced entry filtering system with technical indicators (SMA, EMA, RSI, MACD) supporting both intraday minute bars and day-level bars. Day candle conditions compare daily OHLC values (e.g., today's open vs yesterday's close) with proper timezone conversion from UTC to Eastern. When Day candle type is selected, entry time auto-locks to 09:30 AM.

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
-   `Font Awesome`: Icons.
-   `Material Symbols Rounded`: Google Material icons.
-   `Inter Font`: Typography.

### Database
-   `PostgreSQL`: Used for user authentication, saved filters, and backtest metadata storage. Configured with SQLAlchemy ORM and connection pooling.