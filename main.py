"""
Polygon.io API Backend Server
Flask application to proxy API calls and handle data processing
"""

from pathlib import Path

from flask import Flask, request, jsonify, send_from_directory, send_file, redirect, url_for, render_template, abort
from flask_cors import CORS
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
import requests
import os
from datetime import datetime, timedelta
import json
import subprocess
import tempfile
import csv
import base64
import re
import threading
import uuid
from flask_mail import Mail, Message
import stripe
from sqlalchemy import text

from database import db

try:
    from flask_migrate import Migrate
except ImportError:
    Migrate = None

# Import stocks backtest V3 wrapper
try:
    from stock_backtester_v3_wrapper import StockBacktesterV3Wrapper
    STOCKS_V3_WRAPPER_AVAILABLE = True
except ImportError:
    STOCKS_V3_WRAPPER_AVAILABLE = False
    print("⚠️  WARNING: stock_backtester_v3_wrapper.py not found. Stocks V3 backtester will not be available.")

BASE_DIR = Path(__file__).resolve().parent
INSTANCE_DIR = BASE_DIR / 'instance'
INSTANCE_DIR.mkdir(exist_ok=True)

PUBLIC_ROOT_EXTENSIONS = {
    '.css', '.gif', '.html', '.ico', '.jpeg', '.jpg', '.js', '.png', '.svg', '.txt', '.webp'
}
IS_PRODUCTION = (
    os.environ.get("REPLIT_DEPLOYMENT") == '1'
    or os.environ.get("FLASK_ENV", "").lower() == 'production'
)
MIGRATIONS_ENABLED = Migrate is not None


def env_bool(name, default=False):
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {'1', 'true', 'yes', 'on'}


def get_secret_key():
    secret_key = os.environ.get("FLASK_SECRET_KEY") or os.environ.get("SESSION_SECRET")
    if secret_key:
        return secret_key
    if IS_PRODUCTION:
        raise RuntimeError("FLASK_SECRET_KEY must be set in production.")
    print("⚠️  WARNING: FLASK_SECRET_KEY is not set. Using a development-only fallback secret.")
    return "dev-only-change-me"


def get_database_uri():
    database_url = os.environ.get("DATABASE_URL")
    if database_url:
        # Convert relative sqlite paths to absolute so they work regardless of CWD
        if database_url.startswith("sqlite:///") and not database_url.startswith("sqlite:////"):
            relative_part = database_url[len("sqlite:///"):]
            abs_path = (BASE_DIR / relative_part).resolve()
            return f"sqlite:///{abs_path}"
        return database_url
    sqlite_path = INSTANCE_DIR / "backtestpro.db"
    return f"sqlite:///{sqlite_path}"


def get_cors_origins():
    configured = os.environ.get("CORS_ORIGINS", "")
    return [origin.strip() for origin in configured.split(',') if origin.strip()]


app = Flask(__name__, static_folder='static', static_url_path='/static')
app.secret_key = get_secret_key()
app.config["SQLALCHEMY_DATABASE_URI"] = get_database_uri()
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
    "pool_recycle": 300,
    "pool_pre_ping": True,
}
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["MAX_CONTENT_LENGTH"] = int(os.environ.get("MAX_CONTENT_LENGTH", 5 * 1024 * 1024))
db.init_app(app)
migrate = Migrate(app, db, compare_type=True) if MIGRATIONS_ENABLED else None

cors_origins = get_cors_origins()
if cors_origins:
    CORS(
        app,
        resources={r"/api/*": {"origins": cors_origins}},
        supports_credentials=True,
    )

# Session cookie configuration for Replit proxy environment
cross_site_cookies = env_bool('SESSION_COOKIE_CROSS_SITE', False)
app.config['SESSION_COOKIE_SAMESITE'] = 'None' if cross_site_cookies else 'Lax'
app.config['SESSION_COOKIE_SECURE'] = env_bool(
    'SESSION_COOKIE_SECURE',
    IS_PRODUCTION or cross_site_cookies,
)
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_NAME'] = 'backtestpro_session'
# Explicitly set domain to None to allow the browser to manage it in the proxy
app.config['SESSION_COOKIE_DOMAIN'] = None
# Ensure cookies are handled correctly with proxies
app.config['USE_X_SENDFILE'] = False
app.config['PREFERRED_URL_SCHEME'] = 'https' if app.config['SESSION_COOKIE_SECURE'] else 'http'

# Replit Specific Proxy Fix
from werkzeug.middleware.proxy_fix import ProxyFix
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

# Flask-Mail configuration for Mailtrap
app.config['MAIL_SERVER'] = os.environ.get('MAILTRAP_HOST', 'sandbox.smtp.mailtrap.io')
app.config['MAIL_PORT'] = int(os.environ.get('MAILTRAP_PORT', 2525))
app.config['MAIL_USERNAME'] = os.environ.get('MAILTRAP_USERNAME')
app.config['MAIL_PASSWORD'] = os.environ.get('MAILTRAP_PASSWORD')
app.config['MAIL_USE_TLS'] = True
app.config['MAIL_USE_SSL'] = False
app.config['MAIL_DEFAULT_SENDER'] = ('BacktestPro', 'noreply@backtestpro.com')
app.config['MAIL_DEBUG'] = env_bool('MAIL_DEBUG', False)
mail = Mail(app)

# Flask-Login setup
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login_page'

@login_manager.unauthorized_handler
def unauthorized_callback():
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Authentication required', 'auth_required': True}), 401
    return redirect(url_for('login_page'))

# User model
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
import secrets

class User(UserMixin, db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    name = db.Column(db.String(100), nullable=True)
    is_verified = db.Column(db.Boolean, default=False)
    is_admin = db.Column(db.Boolean, default=False, nullable=False)
    verification_token = db.Column(db.String(100), nullable=True)
    verification_token_expires = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    selected_plan = db.Column(db.String(50), nullable=True)
    stripe_customer_id = db.Column(db.String(100), nullable=True)
    stripe_subscription_id = db.Column(db.String(100), nullable=True)
    auth_provider = db.Column(db.String(20), default='email')
    password_reset_token = db.Column(db.String(100), nullable=True)
    password_reset_expires = db.Column(db.DateTime, nullable=True)
    pending_email = db.Column(db.String(120), nullable=True)
    email_change_token = db.Column(db.String(100), nullable=True)
    email_change_expires = db.Column(db.DateTime, nullable=True)
    pending_plan = db.Column(db.String(50), nullable=True)
    # Billing cycle tracking to prevent duplicate proration charges
    billing_cycle_start = db.Column(db.DateTime, nullable=True)
    highest_paid_plan_this_cycle = db.Column(db.String(50), nullable=True)
    highest_paid_price_this_cycle = db.Column(db.Integer, default=0)  # in cents
    
    # API key storage (encrypted)
    polygon_api_key = db.Column(db.String(256), nullable=True)
    profile_picture = db.Column(db.String(500), nullable=True)
    notifications_viewed_at = db.Column(db.DateTime, nullable=True)
    auth_token = db.Column(db.String(100), nullable=True, index=True)
    auth_token_expires = db.Column(db.DateTime, nullable=True)
    
    def generate_auth_token(self):
        self.auth_token = secrets.token_urlsafe(48)
        self.auth_token_expires = datetime.utcnow() + timedelta(days=7)
        return self.auth_token
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    def generate_verification_token(self):
        self.verification_token = secrets.token_urlsafe(32)
        self.verification_token_expires = datetime.utcnow() + timedelta(hours=24)
        return self.verification_token
    
    def generate_password_reset_token(self):
        self.password_reset_token = secrets.token_urlsafe(32)
        self.password_reset_expires = datetime.utcnow() + timedelta(hours=1)
        return self.password_reset_token
    
    def generate_email_change_token(self, new_email):
        self.pending_email = new_email
        self.email_change_token = secrets.token_urlsafe(32)
        self.email_change_expires = datetime.utcnow() + timedelta(hours=24)
        return self.email_change_token


class BacktestResult(db.Model):
    """Stores backtest results metadata associated with users"""
    __tablename__ = 'backtest_results'
    
    id = db.Column(db.String(100), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    backtest_type = db.Column(db.String(20), nullable=False)  # 'options' or 'stocks'
    symbol = db.Column(db.String(20), nullable=True)
    strategy = db.Column(db.String(100), nullable=True)
    status = db.Column(db.String(20), default='running')  # running, completed, failed
    total_pnl = db.Column(db.Float, nullable=True)
    total_return = db.Column(db.Float, nullable=True)
    win_rate = db.Column(db.Float, nullable=True)
    total_trades = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    completed_at = db.Column(db.DateTime, nullable=True)
    config_json = db.Column(db.Text, nullable=True)  # Store full config as JSON
    
    # Relationship to user
    user = db.relationship('User', backref=db.backref('backtest_results', lazy='dynamic'))
    
    def to_dict(self):
        return {
            'id': self.id,
            'backtest_type': self.backtest_type,
            'symbol': self.symbol,
            'strategy': self.strategy,
            'status': self.status,
            'total_pnl': self.total_pnl,
            'total_return': self.total_return,
            'win_rate': self.win_rate,
            'total_trades': self.total_trades,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None
        }


class SavedFilter(db.Model):
    """Stores saved screener filter configurations for users"""
    __tablename__ = 'saved_filters'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)
    filter_config = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    user = db.relationship('User', backref=db.backref('saved_filters', lazy='dynamic'))
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'filter_config': json.loads(self.filter_config),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class BacktestTemplate(db.Model):
    """Stores saved backtester template configurations for users"""
    __tablename__ = 'backtest_templates'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)
    template_type = db.Column(db.String(20), nullable=False)  # 'options' or 'stocks'
    template_config = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    user = db.relationship('User', backref=db.backref('backtest_templates', lazy='dynamic'))
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'template_type': self.template_type,
            'template_config': json.loads(self.template_config),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

@app.before_request
def load_user_from_token():
    if current_user.is_authenticated:
        return
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        token = auth_header[7:]
        if token:
            user = User.query.filter_by(auth_token=token).first()
            if user and user.auth_token_expires and user.auth_token_expires > datetime.utcnow():
                login_user(user, remember=False)
            elif user:
                user.auth_token = None
                user.auth_token_expires = None
                db.session.commit()

def should_auto_create_schema():
    """Keep legacy create_all behavior unless explicitly disabled."""
    return env_bool("AUTO_CREATE_SCHEMA", True)


def ensure_database_schema():
    """Create tables for environments that still rely on implicit schema creation."""
    if not should_auto_create_schema():
        return False
    with app.app_context():
        db.create_all()
        is_sqlite = 'sqlite' in str(db.engine.url)
        col_defs = [
            ("profile_picture", "VARCHAR(500)"),
            ("notifications_viewed_at", "TIMESTAMP" if not is_sqlite else "DATETIME"),
        ]
        for col_name, col_type in col_defs:
            try:
                db.session.execute(text(f"SELECT {col_name} FROM users LIMIT 1"))
            except Exception:
                db.session.rollback()
                try:
                    db.session.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}"))
                    db.session.commit()
                    logging.info(f"Added {col_name} column to users table")
                except Exception:
                    db.session.rollback()
    return True


def check_database_connection():
    """Run a trivial query to confirm the configured database is reachable."""
    try:
        with app.app_context():
            db.session.execute(text("SELECT 1"))
        return {"status": "ok"}
    except Exception as exc:
        return {"status": "error", "error": str(exc)}


def bootstrap_admin_user():
    """Create the first admin user from environment variables when enabled."""
    if not env_bool('ADMIN_BOOTSTRAP_ENABLED', False):
        return {'created': False, 'reason': 'disabled'}

    admin_email = (os.environ.get('ADMIN_EMAIL') or '').strip().lower()
    admin_password = os.environ.get('ADMIN_PASSWORD') or ''
    admin_name = (os.environ.get('ADMIN_NAME') or 'Admin').strip()

    if not admin_email or not admin_password:
        return {'created': False, 'reason': 'missing_credentials'}

    if len(admin_password) < 6:
        return {'created': False, 'reason': 'weak_password'}

    with app.app_context():
        user = User.query.filter_by(email=admin_email).first()
        if user:
            changed = False
            if not user.is_admin:
                user.is_admin = True
                changed = True
            if not user.is_verified:
                user.is_verified = True
                changed = True
            if changed:
                db.session.commit()
            return {'created': changed, 'reason': 'updated_existing' if changed else 'already_exists'}

        user = User(
            email=admin_email,
            name=admin_name,
            selected_plan='free',
            is_verified=True,
            is_admin=True,
        )
        user.set_password(admin_password)
        db.session.add(user)
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()
            user = User.query.filter_by(email=admin_email).first()
            if user:
                return {'created': False, 'reason': 'already_exists'}
            raise
        return {'created': True, 'reason': 'created'}


def seed_test_accounts():
    if not env_bool('SEED_TEST_ACCOUNTS', False):
        return
    with app.app_context():
        test_accounts = [
            {'email': 'standard@gmail.com', 'name': 'StandardUser', 'plan': 'standard', 'password': 'Standard123!@#'},
            {'email': 'premium@gmail.com', 'name': 'PremiumUser', 'plan': 'premium', 'password': 'Premium123!@#'},
        ]
        for acct in test_accounts:
            user = User.query.filter_by(email=acct['email']).first()
            if not user:
                user = User(email=acct['email'], name=acct['name'], selected_plan=acct['plan'], is_verified=True, is_admin=True)
                user.set_password(acct['password'])
                db.session.add(user)
            else:
                user.selected_plan = acct['plan']
            try:
                db.session.commit()
            except Exception:
                db.session.rollback()


def initialize_app_runtime(enable_scheduler=False):
    """Run safe startup tasks for local/dev entrypoints."""
    schema_created = ensure_database_schema()
    scheduler_started = False
    scheduler_error = None
    admin_bootstrap = bootstrap_admin_user()

    if enable_scheduler:
        try:
            init_scheduler(app)
            scheduler_started = True
        except Exception as exc:
            scheduler_error = str(exc)
            print(f"Warning: Could not initialize scheduler: {exc}")

    return {
        "schema_created": schema_created,
        "scheduler_started": scheduler_started,
        "scheduler_error": scheduler_error,
        "admin_bootstrap": admin_bootstrap,
    }


def cleanup_orphaned_backtests():
    """
    Any backtest left in 'running' status when the app starts was killed mid-run
    (e.g. by a restart or crash). Mark them as failed so the UI doesn't show
    them as permanently pending.
    """
    with app.app_context():
        try:
            result = db.session.execute(
                text("UPDATE backtest_results SET status='error' WHERE status='running'")
            )
            if result.rowcount:
                print(f"  ⚠ Marked {result.rowcount} orphaned backtest(s) as failed (process was killed)")
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            print(f"  Warning: could not clean up orphaned backtests: {e}")


ensure_database_schema()
cleanup_orphaned_backtests()
bootstrap_admin_user()
seed_test_accounts()

# Register Google OAuth blueprint
try:
    from google_auth import google_auth, print_setup_instructions
    app.register_blueprint(google_auth)
    if os.environ.get("GOOGLE_OAUTH_CLIENT_ID"):
        print("Google OAuth is configured and ready")
    else:
        print_setup_instructions()
except ImportError as e:
    print(f"Google OAuth not available: {e}")

# Force no caching to prevent 304 responses with stale files
@app.after_request
def add_no_cache_headers(response):
    """Prevent browser caching for dynamic responses and add basic security headers."""
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    if request.is_secure:
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    return response

# Configuration
POLYGON_BASE_URL = 'https://api.polygon.io'

# Store API key (you'll set this via environment variable or config)
# For development, you can set it here, but use environment variables for production
API_KEY = os.environ.get('POLYGON_API_KEY', '')

# Initialize stocks V3 wrapper
stocks_v3_wrapper = None  # Will be initialized when needed

# Track running backtests for async processing
running_backtests = {}  # {backtest_id: {'status': 'running'|'completed'|'error', 'error': None|str, 'process': subprocess.Popen|None, 'user_id': int|None}}
running_stock_backtests = {}  # Track running stock backtests

@app.route('/')
def landing():
    """Serve the dashboard as the main landing page"""
    return send_from_directory('.', 'index.html')

@app.route('/dashboard')
def dashboard():
    """Serve the main dashboard (same as landing)"""
    return send_from_directory('.', 'index.html')

@app.route('/stock-backtest-results.html')
def stock_backtest_results():
    """Serve the stock backtest results page"""
    return send_from_directory('.', 'stock-backtest-results.html')

@app.route('/options-backtest-results.html')
def options_backtest_results():
    """Serve the options backtest results page"""
    return send_from_directory('.', 'options-backtest-results.html')

@app.route('/options-backtest-result-detail.html')
def options_backtest_result_detail():
    """Serve the options backtest result detail page"""
    return send_from_directory('.', 'options-backtest-result-detail.html')

@app.route('/stock-backtest-results-list.html')
def stock_backtest_results_list():
    """Serve the stock backtest results list page"""
    return send_from_directory('.', 'stock-backtest-results-list.html')

@app.route('/api/backtests/<backtest_id>/details')
def redirect_to_options_detail(backtest_id):
    """Redirect old API URL to SPA detail page"""
    return redirect(f'/?page=optionsResultDetail&id={backtest_id}')

@app.route('/stock-backtest-detail.html')
def redirect_to_stock_detail():
    """Redirect old stock detail URL to SPA detail page"""
    backtest_id = request.args.get('id', '')
    return redirect(f'/?page=stockResultDetail&id={backtest_id}')

@app.route('/login')
def login_page():
    """Serve the login page"""
    return send_from_directory('.', 'login.html')

@app.route('/register')
def register_page():
    """Serve the register page"""
    return send_from_directory('.', 'register.html')

@app.route('/features')
def features_page():
    """Serve the features page"""
    return send_from_directory('.', 'features.html')

@app.route('/how-it-works')
def how_it_works_page():
    """Serve the how it works page"""
    return send_from_directory('.', 'how-it-works.html')

@app.route('/pricing')
def pricing_page():
    """Serve the pricing page"""
    return render_template('pricing.html')

@app.route('/verify-email')
def verify_email_page():
    """Serve the verify email page"""
    return send_from_directory('.', 'verify-email.html')

@app.route('/terms')
def terms_page():
    """Serve the terms of service page"""
    return send_from_directory('.', 'terms.html')

@app.route('/privacy')
def privacy_page():
    """Serve the privacy policy page"""
    return send_from_directory('.', 'privacy.html')

@app.route('/faq')
def faq_page():
    """Serve the FAQ page"""
    return send_from_directory('.', 'faq.html')

@app.route('/contact')
def contact_page():
    """Serve the contact page"""
    return send_from_directory('.', 'contact.html')

@app.route('/verify/<token>')
def verify_email(token):
    """Verify user email"""
    user = User.query.filter_by(verification_token=token).first()
    if user and user.verification_token_expires and user.verification_token_expires > datetime.utcnow():
        user.is_verified = True
        user.verification_token = None
        user.verification_token_expires = None
        db.session.commit()
        login_user(user)
        if user.selected_plan and user.selected_plan != 'free' and not user.stripe_subscription_id:
            return redirect('/dashboard?section=subscription&setup_payment=true')
        return redirect('/dashboard')
    return redirect('/login?error=invalid_token')

@app.route('/api/auth/register', methods=['POST'])
def api_register():
    """Register a new user"""
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')
        name = data.get('name', '').strip()
        selected_plan = data.get('plan', 'free')
        
        if not email or not password:
            return jsonify({'error': 'Email and password are required'}), 400
        
        if len(password) < 8:
            return jsonify({'error': 'Password must be at least 8 characters'}), 400

        if not is_known_plan(selected_plan):
            return jsonify({'error': 'Invalid plan selected'}), 400
        
        existing_user = User.query.filter_by(email=email).first()
        if existing_user:
            return jsonify({'error': 'An account with this email already exists'}), 400
        
        user = User(email=email, name=name, selected_plan=selected_plan)
        user.set_password(password)
        token = user.generate_verification_token()
        
        mailtrap_configured = app.config.get('MAIL_USERNAME') and app.config.get('MAIL_PASSWORD')
        if mailtrap_configured:
            db.session.add(user)
            db.session.commit()
            try:
                send_verification_email(email, token)
            except Exception as e:
                print(f"Email sending failed: {e}")
            return jsonify({
                'message': 'Account created! Please check your email to verify your account.',
                'requires_verification': True,
                'redirect': f'/verify-email?email={email}'
            }), 201
        else:
            user.is_verified = True
            db.session.add(user)
            db.session.commit()
            return jsonify({
                'message': 'Account created successfully!',
                'redirect': '/login'
            }), 201
            
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/login', methods=['POST'])
def api_login():
    """Login user"""
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')
        remember = data.get('remember', False)
        
        user = User.query.filter_by(email=email).first()
        
        if not user or not user.check_password(password):
            return jsonify({'error': 'Invalid email or password'}), 401
        
        if not user.is_verified:
            return jsonify({'error': 'Please verify your email before logging in'}), 401
        
        login_user(user, remember=remember)
        
        token = user.generate_auth_token()
        db.session.commit()
        
        redirect_url = '/dashboard'
        stripe_configured = bool(os.environ.get('STRIPE_SECRET_KEY'))
        if stripe_configured and user.selected_plan and user.selected_plan != 'free' and not user.stripe_subscription_id:
            redirect_url = '/dashboard?section=subscription&setup_payment=true'
        
        return jsonify({
            'message': 'Login successful',
            'redirect': redirect_url,
            'token': token
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/logout', methods=['POST'])
def api_logout():
    """Logout user"""
    if current_user.is_authenticated:
        current_user.auth_token = None
        current_user.auth_token_expires = None
        db.session.commit()
    else:
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]
            if token:
                user = User.query.filter_by(auth_token=token).first()
                if user:
                    user.auth_token = None
                    user.auth_token_expires = None
                    db.session.commit()
    logout_user()
    return jsonify({'message': 'Logged out successfully', 'redirect': '/'}), 200

@app.route('/api/auth/status')
def api_auth_status():
    """Check if user is authenticated"""
    if current_user.is_authenticated:
        return jsonify({
            'authenticated': True,
            'user': {
                'name': current_user.name or current_user.email.split('@')[0],
                'email': current_user.email,
                'profile_picture': current_user.profile_picture,
                'plan': current_user.selected_plan or 'free',
                'tier': get_user_tier(),
            },
        }), 200
    return jsonify({'authenticated': False, 'tier': 'free'}), 200

@app.route('/api/auth/user')
def api_auth_user():
    """Get current user info"""
    if current_user.is_authenticated:
        return jsonify({
            'name': current_user.name or current_user.email.split('@')[0],
            'email': current_user.email,
            'plan': current_user.selected_plan or 'free',
            'is_admin': bool(getattr(current_user, 'is_admin', False)),
            'profile_picture': current_user.profile_picture
        }), 200
    return jsonify({'error': 'Not authenticated'}), 401


@app.route('/api/tier-restrictions')
def api_tier_restrictions():
    tier = get_user_tier()
    restrictions = TIER_RESTRICTIONS.get(tier, TIER_RESTRICTIONS['free'])
    return jsonify({'tier': tier, 'restrictions': restrictions}), 200


@app.route('/api/market-movers')
def api_market_movers():
    """Get market movers (gainers and losers) — reads from centralized cache"""
    with _cache_lock:
        cached = _dashboard_cache['gainers_losers']
    # Remap for backward compatibility (old format used 'ticker' and 'todaysChangePerc')
    gainers = [{'ticker': g.get('symbol', 'N/A'), 'todaysChangePerc': g.get('change_pct', 0)} for g in cached.get('gainers', [])[:5]]
    losers = [{'ticker': l.get('symbol', 'N/A'), 'todaysChangePerc': l.get('change_pct', 0)} for l in cached.get('losers', [])[:5]]
    return jsonify({'gainers': gainers, 'losers': losers})

@app.route('/logout')
def logout():
    """Logout user and redirect to landing page"""
    if current_user.is_authenticated:
        current_user.auth_token = None
        current_user.auth_token_expires = None
        db.session.commit()
    logout_user()
    return redirect('/')

@app.route('/landing')
def landing_redirect():
    """Redirect /landing to root"""
    return redirect('/')

@app.route('/api/auth/resend-verification', methods=['POST'])
def resend_verification():
    """Resend verification email"""
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        
        if not email:
            return jsonify({'error': 'Email is required'}), 400
        
        user = User.query.filter_by(email=email).first()

        if user and not user.is_verified:
            token = user.generate_verification_token()
            db.session.commit()
            send_verification_email(email, token)

        return jsonify({'message': 'If an unverified account exists with this email, a verification email has been sent.'}), 200
        
    except Exception as e:
        print(f"Resend verification error: {e}")
        return jsonify({'error': 'Failed to send email. Please try again.'}), 500

def send_verification_email(email, token):
    """Send verification email using Flask-Mail with Mailtrap"""
    verify_url = f"{request.host_url}verify/{token}"
    
    html = f"""
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #1a9988;">Welcome to BacktestPro!</h2>
            <p>Thank you for creating an account. Please verify your email address by clicking the button below:</p>
            <p style="text-align: center; margin: 30px 0;">
                <a href="{verify_url}" style="background: linear-gradient(135deg, #1a9988, #14b8a6); color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold;">Verify Email</a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #1a9988;">{verify_url}</p>
            <p>This link will expire in 24 hours.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #666; font-size: 12px;">If you didn't create an account, you can safely ignore this email.</p>
        </div>
    </body>
    </html>
    """
    
    msg = Message(
        subject='Verify your BacktestPro account',
        recipients=[email],
        html=html
    )
    mail.send(msg)
    print(f"Verification email sent to {email}")

def send_password_reset_email(email, token):
    """Send password reset email"""
    reset_url = f"{request.host_url}reset-password/{token}"
    
    html = f"""
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #1a9988;">Password Reset Request</h2>
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
            <p style="text-align: center; margin: 30px 0;">
                <a href="{reset_url}" style="background: linear-gradient(135deg, #1a9988, #14b8a6); color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold;">Reset Password</a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #1a9988;">{reset_url}</p>
            <p>This link will expire in 1 hour.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #666; font-size: 12px;">If you didn't request a password reset, you can safely ignore this email.</p>
        </div>
    </body>
    </html>
    """
    
    msg = Message(
        subject='Reset your BacktestPro password',
        recipients=[email],
        html=html
    )
    mail.send(msg)
    print(f"Password reset email sent to {email}")

def send_email_change_verification(new_email, token):
    """Send verification email for email change"""
    verify_url = f"{request.host_url}verify-email-change/{token}"
    
    html = f"""
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #1a9988;">Verify Your New Email Address</h2>
            <p>You've requested to change your email address to this one. Click the button below to confirm:</p>
            <p style="text-align: center; margin: 30px 0;">
                <a href="{verify_url}" style="background: linear-gradient(135deg, #1a9988, #14b8a6); color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold;">Verify New Email</a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #1a9988;">{verify_url}</p>
            <p>This link will expire in 24 hours.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #666; font-size: 12px;">If you didn't request this change, you can safely ignore this email.</p>
        </div>
    </body>
    </html>
    """
    
    msg = Message(
        subject='Verify your new email address - BacktestPro',
        recipients=[new_email],
        html=html
    )
    mail.send(msg)
    print(f"Email change verification sent to {new_email}")

def send_email_change_notification(old_email, new_email):
    """Send notification to old email about email change"""
    html = f"""
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #1a9988;">Email Address Change Requested</h2>
            <p>A request has been made to change your BacktestPro account email address to:</p>
            <p style="font-weight: bold; color: #1a9988;">{new_email}</p>
            <p>If you made this request, please check your new email address for a verification link.</p>
            <p>If you did NOT request this change, please contact us immediately as your account may be compromised.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #666; font-size: 12px;">This is a security notification from BacktestPro.</p>
        </div>
    </body>
    </html>
    """
    
    msg = Message(
        subject='Security Alert: Email change requested - BacktestPro',
        recipients=[old_email],
        html=html
    )
    mail.send(msg)
    print(f"Email change notification sent to {old_email}")

@app.route('/forgot-password')
def forgot_password_page():
    """Serve the forgot password page"""
    return send_from_directory('.', 'forgot-password.html')

@app.route('/reset-password/<token>')
def reset_password_page(token):
    """Serve the reset password page"""
    user = User.query.filter_by(password_reset_token=token).first()
    if not user or not user.password_reset_expires or user.password_reset_expires < datetime.utcnow():
        return redirect('/login?error=invalid_reset_token')
    return send_from_directory('.', 'reset-password.html')

@app.route('/api/auth/forgot-password', methods=['POST'])
def api_forgot_password():
    """Request password reset"""
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        
        if not email:
            return jsonify({'error': 'Email is required'}), 400
        
        user = User.query.filter_by(email=email).first()
        
        if user:
            if user.auth_provider == 'google':
                return jsonify({'error': 'This account uses Google sign-in. Please use "Sign in with Google" instead.'}), 400
            
            token = user.generate_password_reset_token()
            db.session.commit()
            
            try:
                send_password_reset_email(email, token)
            except Exception as e:
                print(f"Password reset email failed: {e}")
        
        return jsonify({'message': 'If an account exists with this email, you will receive a password reset link.'}), 200
        
    except Exception as e:
        print(f"Forgot password error: {e}")
        return jsonify({'error': 'An error occurred. Please try again.'}), 500

@app.route('/api/auth/reset-password', methods=['POST'])
def api_reset_password():
    """Reset password with token"""
    try:
        data = request.get_json()
        token = data.get('token', '')
        new_password = data.get('password', '')
        
        if not token or not new_password:
            return jsonify({'error': 'Token and password are required'}), 400
        
        if len(new_password) < 8:
            return jsonify({'error': 'Password must be at least 8 characters'}), 400
        
        user = User.query.filter_by(password_reset_token=token).first()
        
        if not user or not user.password_reset_expires or user.password_reset_expires < datetime.utcnow():
            return jsonify({'error': 'Invalid or expired reset link'}), 400
        
        user.set_password(new_password)
        user.password_reset_token = None
        user.password_reset_expires = None
        revoke_user_auth_token(user)
        db.session.commit()
        
        return jsonify({'message': 'Password reset successfully. You can now sign in.', 'redirect': '/login'}), 200
        
    except Exception as e:
        print(f"Reset password error: {e}")
        return jsonify({'error': 'An error occurred. Please try again.'}), 500

@app.route('/api/user/request-email-change', methods=['POST'])
@login_required
def request_email_change():
    """Request email change - requires password verification"""
    try:
        data = request.get_json()
        current_password = data.get('current_password', '')
        new_email = data.get('new_email', '').strip().lower()
        
        if not current_password or not new_email:
            return jsonify({'error': 'Current password and new email are required'}), 400
        
        if current_user.auth_provider == 'google':
            return jsonify({'error': 'Google accounts cannot change email. Your email is managed by Google.'}), 400
        
        if not current_user.check_password(current_password):
            return jsonify({'error': 'Current password is incorrect'}), 401
        
        if new_email == current_user.email:
            return jsonify({'error': 'New email is the same as current email'}), 400
        
        existing_user = User.query.filter_by(email=new_email).first()
        if existing_user:
            return jsonify({'error': 'An account with this email already exists'}), 400
        
        token = current_user.generate_email_change_token(new_email)
        db.session.commit()
        
        try:
            send_email_change_verification(new_email, token)
            send_email_change_notification(current_user.email, new_email)
        except Exception as e:
            print(f"Email change notification failed: {e}")
        
        return jsonify({'message': 'Verification email sent to your new address. Please check your inbox.'}), 200
        
    except Exception as e:
        print(f"Request email change error: {e}")
        return jsonify({'error': 'An error occurred. Please try again.'}), 500

@app.route('/verify-email-change/<token>')
def verify_email_change(token):
    """Verify and complete email change"""
    user = User.query.filter_by(email_change_token=token).first()
    
    if not user or not user.email_change_expires or user.email_change_expires < datetime.utcnow():
        return redirect('/login?error=invalid_email_change_token')
    
    if not user.pending_email:
        return redirect('/login?error=invalid_email_change_token')
    
    existing_user = User.query.filter_by(email=user.pending_email).first()
    if existing_user:
        return redirect('/login?error=email_already_taken')
    
    user.email = user.pending_email
    user.pending_email = None
    user.email_change_token = None
    user.email_change_expires = None
    revoke_user_auth_token(user)
    db.session.commit()
    
    logout_user()
    
    return redirect('/login?message=email_changed')

@app.route('/test-email')
def test_email():
    """Test route to verify Mailtrap email is working"""
    if not env_bool('ENABLE_TEST_EMAIL_ROUTE', False):
        abort(404)
    try:
        msg = Message(
            subject='Test Email from BacktestPro',
            sender=('BacktestPro', 'noreply@backtestpro.com'),
            recipients=['test@example.com'],
            body='Success! Your Mailtrap integration is working.'
        )
        mail.send(msg)
        return 'Email sent! Check your Mailtrap inbox at mailtrap.io'
    except Exception as e:
        return f'Error: {str(e)}', 500

def get_stripe_credentials():
    """Fetch Stripe credentials from Replit connection API or environment variables"""
    publishable = os.environ.get('STRIPE_PUBLISHABLE_KEY')
    secret = os.environ.get('STRIPE_SECRET_KEY')
    if publishable and secret:
        return publishable, secret
    
    hostname = os.environ.get('REPLIT_CONNECTORS_HOSTNAME')
    repl_identity = os.environ.get('REPL_IDENTITY')
    web_repl_renewal = os.environ.get('WEB_REPL_RENEWAL')
    
    if repl_identity:
        x_replit_token = 'repl ' + repl_identity
    elif web_repl_renewal:
        x_replit_token = 'depl ' + web_repl_renewal
    else:
        return None, None
    
    is_production = os.environ.get('REPLIT_DEPLOYMENT') == '1'
    target_environment = 'production' if is_production else 'development'
    
    try:
        url = f"https://{hostname}/api/v2/connection"
        response = requests.get(
            url,
            params={
                'include_secrets': 'true',
                'connector_names': 'stripe',
                'environment': target_environment
            },
            headers={
                'Accept': 'application/json',
                'X_REPLIT_TOKEN': x_replit_token
            },
            timeout=10
        )
        data = response.json()
        connection = data.get('items', [{}])[0]
        settings = connection.get('settings', {})
        return settings.get('publishable'), settings.get('secret')
    except Exception as e:
        print(f"Error fetching Stripe credentials: {e}")
        return None, None

PLAN_PRICES = {
    'free': {'amount': 0, 'price_id': None, 'tier': 'free', 'display_name': 'Free'},
    'standard': {'amount': 2999, 'price_id': None, 'tier': 'standard', 'display_name': 'Standard'},
    'premium': {'amount': 4999, 'price_id': None, 'tier': 'premium', 'display_name': 'Premium'},
}


def get_user_tier(user=None):
    if user is None:
        if not current_user.is_authenticated:
            return 'free'
        user = current_user
    plan = getattr(user, 'selected_plan', 'free') or 'free'
    config = PLAN_PRICES.get(plan)
    if config:
        return config.get('tier', 'free')
    return 'free'


TIER_RESTRICTIONS = {
    'free': {
        'allowed_symbols': ['SPY', 'GLD', 'QQQ'],
        'min_date': '2025-03-01',
        'max_date': datetime.today().strftime('%Y-%m-%d'),
        'max_dte': 3,
        'allow_custom_builder': True,
        'allow_multiple_symbols': False,
        'allow_csv': False,
        'allow_csv_download': False,
        'allow_notifications': False,
    },
    'standard': {
        'allowed_symbols': None,
        'blocked_symbol_types': ['index', 'forex'],
        'min_date': '2023-03-01',
        'max_date': datetime.today().strftime('%Y-%m-%d'),
        'max_dte': 10,
        'allow_custom_builder': True,
        'allow_multiple_symbols': True,
        'allow_csv': True,
        'allow_csv_download': True,
        'allow_notifications': True,
    },
    'premium': {
        'allowed_symbols': None,
        'blocked_symbol_types': [],
        'min_date': None,
        'max_date': None,
        'max_dte': None,
        'allow_custom_builder': True,
        'allow_multiple_symbols': True,
        'allow_csv': True,
        'allow_csv_download': True,
        'allow_notifications': True,
    },
}

INDEX_SYMBOLS = ['^DJI', '^GSPC', '^IXIC', '^RUT', '^VIX', 'DIA', 'IWM', 'UVXY', 'VXX', 'VIXY']
FOREX_PREFIXES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD']


def validate_tier_restrictions(tier, symbol, start_date=None, end_date=None, dte=None):
    restrictions = TIER_RESTRICTIONS.get(tier, TIER_RESTRICTIONS['free'])
    errors = []
    sym_upper = (symbol or '').upper().strip()

    if restrictions.get('allowed_symbols'):
        if sym_upper not in restrictions['allowed_symbols']:
            errors.append(f'Your {tier.title()} plan only allows these symbols: {", ".join(restrictions["allowed_symbols"])}. Upgrade for more.')

    blocked = restrictions.get('blocked_symbol_types', [])
    if 'index' in blocked and (sym_upper.startswith('^') or sym_upper in INDEX_SYMBOLS):
        errors.append(f'Index symbols are not available on the {tier.title()} plan. Upgrade to Premium.')
    if 'forex' in blocked:
        is_forex = any(sym_upper.startswith(p) and len(sym_upper) == 6 for p in FOREX_PREFIXES)
        if is_forex or '/' in sym_upper:
            errors.append(f'Forex symbols are not available on the {tier.title()} plan. Upgrade to Premium.')

    if restrictions.get('min_date') and start_date:
        if str(start_date) < restrictions['min_date']:
            errors.append(f'Your plan does not allow dates before {restrictions["min_date"]}.')
    if restrictions.get('max_date') and end_date:
        if str(end_date) > restrictions['max_date']:
            errors.append(f'Your plan does not allow dates after {restrictions["max_date"]}.')

    if restrictions.get('max_dte') is not None and dte is not None:
        try:
            if int(dte) > restrictions['max_dte']:
                errors.append(f'Your plan limits DTE to {restrictions["max_dte"]} days. Upgrade for more.')
        except (ValueError, TypeError):
            pass

    return errors


def is_known_plan(plan_id):
    return plan_id in PLAN_PRICES


def is_zero_cost_plan(plan_id):
    return is_known_plan(plan_id) and PLAN_PRICES[plan_id]['amount'] == 0


def get_stripe_object_value(obj, key, default=None):
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def get_stripe_customer_id(stripe_customer):
    if not stripe_customer:
        return None
    if isinstance(stripe_customer, str):
        return stripe_customer
    return getattr(stripe_customer, 'id', None)


def get_plan_id_from_subscription(subscription, fallback='free'):
    items = get_stripe_object_value(get_stripe_object_value(subscription, 'items', {}), 'data', []) or []
    for item in items:
        price = get_stripe_object_value(item, 'price')
        amount = get_stripe_object_value(price, 'unit_amount')
        for plan_id, config in PLAN_PRICES.items():
            if config['amount'] == amount:
                return plan_id
    return fallback


def stripe_subscription_belongs_to_user(subscription, user):
    metadata = get_stripe_object_value(subscription, 'metadata', {}) or {}
    metadata_user_id = metadata.get('user_id')
    customer_id = get_stripe_customer_id(get_stripe_object_value(subscription, 'customer'))

    if metadata_user_id and metadata_user_id != str(user.id):
        return False
    if user.stripe_customer_id and customer_id and customer_id != user.stripe_customer_id:
        return False
    if not metadata_user_id and not user.stripe_customer_id:
        return False
    return True


def revoke_user_auth_token(user):
    user.auth_token = None
    user.auth_token_expires = None


def get_stripe_webhook_secret():
    return os.environ.get('STRIPE_WEBHOOK_SECRET')


def get_datetime_from_stripe_timestamp(timestamp):
    if not timestamp:
        return None
    return datetime.utcfromtimestamp(timestamp)


def get_subscription_metadata(subscription):
    return get_stripe_object_value(subscription, 'metadata', {}) or {}


def get_pending_plan_from_subscription(subscription):
    metadata = get_subscription_metadata(subscription)
    pending_plan = metadata.get('pending_downgrade_plan') or None
    if pending_plan and is_known_plan(pending_plan):
        return pending_plan

    if get_stripe_object_value(subscription, 'cancel_at_period_end') or get_stripe_object_value(subscription, 'cancel_at'):
        return 'free'
    return None


def get_effective_plan_from_subscription(subscription, fallback='free'):
    metadata = get_subscription_metadata(subscription)
    metadata_plan = metadata.get('plan_id')
    if metadata_plan and is_known_plan(metadata_plan):
        fallback = metadata_plan
    return get_plan_id_from_subscription(subscription, fallback=fallback)


def sync_user_billing_cycle(user, subscription, plan_id):
    period_start = get_datetime_from_stripe_timestamp(
        get_stripe_object_value(subscription, 'current_period_start')
    )
    if period_start and (user.billing_cycle_start is None or period_start > user.billing_cycle_start):
        user.billing_cycle_start = period_start
        user.highest_paid_plan_this_cycle = None
        user.highest_paid_price_this_cycle = 0

    plan_price = PLAN_PRICES.get(plan_id, {}).get('amount', 0)
    if plan_price > (user.highest_paid_price_this_cycle or 0):
        user.highest_paid_plan_this_cycle = plan_id
        user.highest_paid_price_this_cycle = plan_price


def clear_user_subscription_state(user):
    user.selected_plan = 'free'
    user.pending_plan = None
    user.stripe_subscription_id = None


def sync_user_subscription_state(user, subscription=None, *, subscription_deleted=False):
    if user is None:
        return None

    if subscription_deleted or subscription is None:
        clear_user_subscription_state(user)
        return {
            'status': 'deleted',
            'plan': 'free',
            'pending_plan': None,
        }

    customer_id = get_stripe_customer_id(get_stripe_object_value(subscription, 'customer'))
    if customer_id:
        user.stripe_customer_id = customer_id

    status = get_stripe_object_value(subscription, 'status')
    if status and status != 'canceled':
        user.stripe_subscription_id = get_stripe_object_value(subscription, 'id')

    effective_plan = get_effective_plan_from_subscription(
        subscription,
        fallback=user.selected_plan or 'free'
    )
    pending_plan = get_pending_plan_from_subscription(subscription)

    entitling_statuses = {'active', 'trialing', 'past_due'}
    if status in entitling_statuses:
        user.selected_plan = effective_plan
        user.pending_plan = pending_plan if pending_plan != effective_plan else None
        sync_user_billing_cycle(user, subscription, effective_plan)
    elif status in {'canceled', 'incomplete', 'incomplete_expired', 'paused', 'unpaid'}:
        clear_user_subscription_state(user)
    else:
        user.pending_plan = pending_plan if pending_plan and pending_plan != user.selected_plan else None

    return {
        'status': status,
        'plan': user.selected_plan or 'free',
        'pending_plan': user.pending_plan,
    }


def find_user_for_stripe_event(*, customer_id=None, subscription_id=None, user_id=None):
    query = User.query

    if user_id:
        try:
            user = query.filter_by(id=int(user_id)).first()
            if user:
                return user
        except (TypeError, ValueError):
            pass

    if subscription_id:
        user = query.filter_by(stripe_subscription_id=subscription_id).first()
        if user:
            return user

    if customer_id:
        user = query.filter_by(stripe_customer_id=customer_id).first()
        if user:
            return user

    return None


def sync_user_from_stripe_subscription(subscription, *, user=None, commit=True, subscription_deleted=False):
    customer_id = None
    subscription_id = None
    metadata_user_id = None

    if subscription is not None:
        customer_id = get_stripe_customer_id(get_stripe_object_value(subscription, 'customer'))
        subscription_id = get_stripe_object_value(subscription, 'id')
        metadata_user_id = get_subscription_metadata(subscription).get('user_id')

    user = user or find_user_for_stripe_event(
        customer_id=customer_id,
        subscription_id=subscription_id,
        user_id=metadata_user_id,
    )
    if user is None:
        return None

    result = sync_user_subscription_state(
        user,
        subscription=subscription,
        subscription_deleted=subscription_deleted,
    )

    if customer_id and not user.stripe_customer_id:
        user.stripe_customer_id = customer_id

    if commit:
        db.session.commit()

    return user, result


def handle_stripe_invoice_event(invoice, *, payment_failed=False):
    customer_id = get_stripe_customer_id(get_stripe_object_value(invoice, 'customer'))
    subscription_id = get_stripe_object_value(invoice, 'subscription')
    user = find_user_for_stripe_event(customer_id=customer_id, subscription_id=subscription_id)
    if user is None:
        return False

    if customer_id and not user.stripe_customer_id:
        user.stripe_customer_id = customer_id

    if subscription_id:
        _, secret_key = get_stripe_credentials()
        if secret_key:
            stripe.api_key = secret_key
            subscription = stripe.Subscription.retrieve(subscription_id, expand=['customer', 'items.data.price'])
            sync_user_from_stripe_subscription(subscription, user=user, commit=False)
    elif payment_failed:
        clear_user_subscription_state(user)

    db.session.commit()
    return True

def get_or_create_stripe_price(plan_id, secret_key):
    """Get existing or create a new Stripe price for a plan. Caches price IDs."""
    if plan_id not in PLAN_PRICES:
        return None
    
    plan_config = PLAN_PRICES[plan_id]
    
    if plan_config.get('price_id'):
        return plan_config['price_id']
    
    stripe.api_key = secret_key
    plan_name = plan_id.replace('-', ' ').title()
    
    try:
        prices = stripe.Price.search(
            query=f"metadata['plan_id']:'{plan_id}' AND active:'true'"
        )
        if prices.data:
            plan_config['price_id'] = prices.data[0].id
            return prices.data[0].id
    except Exception as e:
        print(f"Price search failed, creating new: {e}")
    
    price = stripe.Price.create(
        currency='usd',
        unit_amount=plan_config['amount'],
        recurring={'interval': 'month'},
        product_data={'name': f'BacktestPro - {plan_name}'},
        metadata={'plan_id': plan_id}
    )
    
    plan_config['price_id'] = price.id
    return price.id


@app.route('/api/stripe/webhook', methods=['POST'])
def stripe_webhook():
    """Handle verified Stripe webhook events."""
    webhook_secret = get_stripe_webhook_secret()
    if not webhook_secret:
        return jsonify({'error': 'Stripe webhook is not configured'}), 500

    signature = request.headers.get('Stripe-Signature')
    if not signature:
        return jsonify({'error': 'Missing Stripe signature'}), 400

    payload = request.get_data(cache=False, as_text=False)

    try:
        event = stripe.Webhook.construct_event(payload, signature, webhook_secret)
    except ValueError:
        return jsonify({'error': 'Invalid webhook payload'}), 400
    except stripe.error.SignatureVerificationError:
        return jsonify({'error': 'Invalid Stripe signature'}), 400

    event_type = event.get('type')
    event_object = event.get('data', {}).get('object', {})

    try:
        if event_type == 'checkout.session.completed':
            if event_object.get('mode') == 'subscription' and event_object.get('subscription'):
                _, secret_key = get_stripe_credentials()
                if secret_key:
                    stripe.api_key = secret_key
                    subscription = stripe.Subscription.retrieve(
                        event_object['subscription'],
                        expand=['customer', 'items.data.price']
                    )
                    sync_user_from_stripe_subscription(subscription)
        elif event_type in {
            'customer.subscription.created',
            'customer.subscription.updated',
        }:
            sync_user_from_stripe_subscription(event_object)
        elif event_type == 'customer.subscription.deleted':
            sync_user_from_stripe_subscription(event_object, subscription_deleted=True)
        elif event_type == 'invoice.paid':
            handle_stripe_invoice_event(event_object)
        elif event_type == 'invoice.payment_failed':
            handle_stripe_invoice_event(event_object, payment_failed=True)
    except Exception as e:
        db.session.rollback()
        print(f"Stripe webhook handler error for {event_type}: {e}")
        return jsonify({'error': 'Webhook processing failed'}), 500

    return jsonify({'received': True})

@app.route('/api/stripe/create-checkout-session', methods=['POST'])
@login_required
def create_checkout_session():
    """Create a Stripe Checkout session for subscription"""
    try:
        publishable_key, secret_key = get_stripe_credentials()
        if not secret_key:
            return jsonify({'error': 'Stripe is not configured'}), 500
        
        stripe.api_key = secret_key
        data = request.get_json()
        plan_id = data.get('plan_id', current_user.selected_plan)
        
        if not plan_id or is_zero_cost_plan(plan_id):
            return jsonify({'error': 'No paid plan selected'}), 400
        if not is_known_plan(plan_id):
            return jsonify({'error': 'Invalid plan selected'}), 400
        
        plan_name = plan_id.replace('-', ' ').title()
        price_id = get_or_create_stripe_price(plan_id, secret_key)
        if not price_id:
            return jsonify({'error': 'Could not create price for plan'}), 500
        
        if not current_user.stripe_customer_id:
            customer = stripe.Customer.create(
                email=current_user.email,
                name=current_user.name,
                metadata={'user_id': str(current_user.id)}
            )
            current_user.stripe_customer_id = customer.id
            db.session.commit()
        
        session = stripe.checkout.Session.create(
            customer=current_user.stripe_customer_id,
            payment_method_types=['card'],
            line_items=[{
                'price': price_id,
                'quantity': 1,
            }],
            mode='subscription',
            client_reference_id=str(current_user.id),
            subscription_data={
                'metadata': {'plan_id': plan_id, 'user_id': str(current_user.id)}
            },
            success_url=request.host_url + 'dashboard?section=subscription&payment=success',
            cancel_url=request.host_url + 'dashboard?section=subscription&payment=cancelled',
        )
        
        return jsonify({'checkout_url': session.url})
    
    except Exception as e:
        print(f"Stripe checkout error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/stripe/publishable-key', methods=['GET'])
def get_stripe_publishable_key():
    """Get Stripe publishable key for frontend"""
    publishable_key, _ = get_stripe_credentials()
    if not publishable_key:
        return jsonify({'error': 'Stripe is not configured'}), 500
    return jsonify({'publishable_key': publishable_key})

@app.route('/api/stripe/create-subscription', methods=['POST'])
@login_required
def create_subscription():
    """Create a subscription with embedded payment - returns client secret for Stripe Elements"""
    try:
        publishable_key, secret_key = get_stripe_credentials()
        if not secret_key:
            return jsonify({'error': 'Stripe is not configured'}), 500
        
        stripe.api_key = secret_key
        data = request.get_json()
        plan_id = data.get('plan_id', current_user.selected_plan)
        
        if not plan_id or is_zero_cost_plan(plan_id):
            return jsonify({'error': 'No paid plan selected'}), 400
        
        if plan_id not in PLAN_PRICES:
            return jsonify({'error': 'Invalid plan selected'}), 400
        
        if not current_user.stripe_customer_id:
            customer = stripe.Customer.create(
                email=current_user.email,
                name=current_user.name,
                metadata={'user_id': str(current_user.id)}
            )
            current_user.stripe_customer_id = customer.id
            db.session.commit()
        
        price_id = get_or_create_stripe_price(plan_id, secret_key)
        if not price_id:
            return jsonify({'error': 'Could not create price for plan'}), 500
        
        subscription = stripe.Subscription.create(
            customer=current_user.stripe_customer_id,
            items=[{'price': price_id}],
            payment_behavior='default_incomplete',
            payment_settings={'save_default_payment_method': 'on_subscription'},
            expand=['latest_invoice.confirmation_secret', 'pending_setup_intent'],
            metadata={'plan_id': plan_id, 'user_id': str(current_user.id)}
        )

        client_secret = None
        if hasattr(subscription.latest_invoice, 'confirmation_secret') and subscription.latest_invoice.confirmation_secret:
            client_secret = subscription.latest_invoice.confirmation_secret.client_secret
        elif hasattr(subscription, 'pending_setup_intent') and subscription.pending_setup_intent:
            client_secret = subscription.pending_setup_intent.client_secret
        
        if not client_secret:
            return jsonify({'error': 'Could not get payment client secret'}), 500
        
        return jsonify({
            'subscription_id': subscription.id,
            'client_secret': client_secret,
            'publishable_key': publishable_key
        })
    
    except Exception as e:
        print(f"Stripe subscription error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/stripe/confirm-subscription', methods=['POST'])
@login_required
def confirm_subscription():
    """Confirm a subscription after successful payment"""
    try:
        _, secret_key = get_stripe_credentials()
        if not secret_key:
            return jsonify({'error': 'Stripe is not configured'}), 500
        
        stripe.api_key = secret_key
        data = request.get_json()
        subscription_id = data.get('subscription_id')
        
        if not subscription_id:
            return jsonify({'error': 'Subscription ID required'}), 400
        
        subscription = stripe.Subscription.retrieve(subscription_id, expand=['customer'])
        if not stripe_subscription_belongs_to_user(subscription, current_user):
            return jsonify({'error': 'Subscription does not belong to this account'}), 403
        
        if subscription.status in ['active', 'trialing']:
            _, result = sync_user_from_stripe_subscription(subscription, user=current_user)
            
            return jsonify({
                'success': True,
                'status': subscription.status,
                'plan': result['plan']
            })
        else:
            return jsonify({
                'success': False,
                'status': subscription.status,
                'error': 'Subscription not yet active'
            })
    
    except Exception as e:
        print(f"Subscription confirmation error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/stripe/change-plan', methods=['POST'])
@login_required
def change_subscription_plan():
    """Change subscription plan - upgrades apply immediately, downgrades scheduled for end of period"""
    try:
        publishable_key, secret_key = get_stripe_credentials()
        if not secret_key:
            return jsonify({'error': 'Stripe is not configured'}), 500
        
        stripe.api_key = secret_key
        data = request.get_json()
        new_plan_id = data.get('plan_id')
        payment_method_id = data.get('payment_method_id')
        
        if not new_plan_id or new_plan_id == 'free':
            return jsonify({'error': 'Invalid plan selected'}), 400
        
        if new_plan_id not in PLAN_PRICES:
            return jsonify({'error': 'Invalid plan selected'}), 400
        
        if not current_user.stripe_subscription_id:
            return jsonify({'error': 'No active subscription to change', 'needs_new_subscription': True}), 400
        
        subscription = stripe.Subscription.retrieve(
            current_user.stripe_subscription_id,
            expand=['items.data.price', 'customer']
        )

        if not stripe_subscription_belongs_to_user(subscription, current_user):
            return jsonify({'error': 'Subscription does not belong to this account'}), 403
        
        if subscription.status not in ['active', 'trialing']:
            return jsonify({'error': 'Subscription is not active', 'needs_new_subscription': True}), 400
        
        current_plan_id = current_user.selected_plan or 'free'
        actual_plan_id = get_plan_id_from_subscription(subscription, fallback=current_plan_id)
        if not current_user.pending_plan and actual_plan_id in PLAN_PRICES:
            current_plan_id = actual_plan_id
            if current_user.selected_plan != actual_plan_id:
                current_user.selected_plan = actual_plan_id
        current_price = PLAN_PRICES.get(current_plan_id, {}).get('amount', 0)
        new_price = PLAN_PRICES.get(new_plan_id, {}).get('amount', 0)
        
        # Special case: User selecting same plan to cancel pending downgrade
        # This happens when user has pending_plan set or cancel_at_period_end is true
        has_pending_downgrade = current_user.pending_plan is not None or getattr(subscription, 'cancel_at_period_end', False)
        
        if new_plan_id == current_plan_id and has_pending_downgrade:
            print(f"User canceling pending downgrade - keeping current plan {current_plan_id}")
            
            # Cancel any pending subscription schedules
            customer_id = subscription.customer if isinstance(subscription.customer, str) else subscription.customer.id
            try:
                schedules = stripe.SubscriptionSchedule.list(customer=customer_id, limit=10)
                for schedule in schedules.data:
                    if schedule.status == 'active' and hasattr(schedule, 'subscription') and schedule.subscription == subscription.id:
                        stripe.SubscriptionSchedule.release(schedule.id)
                        print(f"Released schedule {schedule.id}")
            except stripe.error.StripeError as e:
                print(f"Error releasing schedules: {e}")
            
            # Clear cancel_at_period_end and metadata
            try:
                stripe.Subscription.modify(
                    subscription.id,
                    cancel_at_period_end=False,
                    metadata={
                        'pending_downgrade_plan': '',
                        'pending_downgrade_price_id': '',
                        'pending_downgrade_date': ''
                    }
                )
                print("Cleared cancel_at_period_end and pending downgrade metadata")
            except stripe.error.StripeError as e:
                print(f"Error clearing subscription state: {e}")
                return jsonify({'error': 'Could not cancel pending downgrade. Please try again.'}), 500
            
            # Get the cancelled pending plan before clearing
            cancelled_pending_plan = current_user.pending_plan
            
            # Clear database pending plan
            current_user.pending_plan = None
            db.session.commit()
            
            # Send email notification about downgrade cancellation
            send_downgrade_cancelled_email(current_user, current_plan_id, cancelled_pending_plan)
            
            return jsonify({
                'success': True,
                'type': 'cancel_downgrade',
                'message': f'Your {current_plan_id.replace("-", " ").title()} plan has been restored!',
                'new_plan': current_plan_id,
                'effective_immediately': True
            })
        
        is_upgrade = new_price > current_price
        new_price_id = get_or_create_stripe_price(new_plan_id, secret_key)
        
        if not new_price_id:
            return jsonify({'error': 'Could not create price for new plan'}), 500
        
        subscription_item_id = subscription['items']['data'][0]['id']
        customer_id = subscription.customer if isinstance(subscription.customer, str) else subscription.customer.id
        
        if is_upgrade:
            # Check if user already paid for this level or higher in current billing cycle
            # If so, skip proration charge
            period_start_timestamp = getattr(subscription, 'current_period_start', None)
            stripe_billing_start = datetime.fromtimestamp(period_start_timestamp) if period_start_timestamp else None
            
            # First, detect if this is a new billing cycle and reset tracking if so
            if stripe_billing_start:
                if current_user.billing_cycle_start is None or stripe_billing_start > current_user.billing_cycle_start:
                    # New billing cycle - reset highest paid tracking before evaluating skip_proration
                    current_user.billing_cycle_start = stripe_billing_start
                    current_user.highest_paid_plan_this_cycle = None
                    current_user.highest_paid_price_this_cycle = 0
                    print(f"New billing cycle detected (Stripe: {stripe_billing_start}), reset highest paid tracking")
            
            # Now evaluate proration based on current (possibly reset) tracking
            # Three scenarios:
            # 1. new_price <= highest_paid: Skip proration entirely (already paid for this level)
            # 2. new_price > highest_paid AND highest_paid > 0: Partial proration (charge difference from highest_paid)
            # 3. new_price > highest_paid AND highest_paid == 0: Full proration (first upgrade this cycle)
            highest_paid = current_user.highest_paid_price_this_cycle or 0
            skip_proration = False
            use_custom_proration = False
            custom_proration_amount = 0
            
            if new_price <= highest_paid:
                skip_proration = True
                print(f"Skipping proration: user already paid ${highest_paid/100} this cycle, new plan is ${new_price/100}")
            elif highest_paid > 0:
                # User paid for something this cycle, need partial proration
                # Calculate what they still owe: new_price - highest_paid
                use_custom_proration = True
                custom_proration_amount = new_price - highest_paid
                print(f"Using custom proration: user paid ${highest_paid/100} this cycle, upgrading to ${new_price/100}, charging ${custom_proration_amount/100}")
            
            # Cancel any pending subscription schedules (e.g., scheduled downgrades)
            # This must succeed before proceeding with the upgrade to maintain consistency
            try:
                has_more = True
                starting_after = None
                schedule_released = False
                while has_more:
                    params = {'customer': customer_id, 'limit': 25}
                    if starting_after:
                        params['starting_after'] = starting_after
                    schedules = stripe.SubscriptionSchedule.list(**params)
                    for schedule in schedules.data:
                        if schedule.status == 'active' and hasattr(schedule, 'subscription') and schedule.subscription == subscription.id:
                            stripe.SubscriptionSchedule.release(schedule.id)
                            print(f"Cancelled subscription schedule {schedule.id} for upgrade")
                            schedule_released = True
                    has_more = schedules.has_more
                    if schedules.data:
                        starting_after = schedules.data[-1].id
                if schedule_released:
                    print("Successfully released pending downgrade schedule")
            except stripe.error.StripeError as e:
                print(f"Failed to cancel subscription schedules: {e}")
                return jsonify({'error': 'Could not cancel pending downgrade. Please try again or contact support.'}), 500
            
            # Clear any pending cancellation and downgrade metadata from the subscription
            try:
                stripe.Subscription.modify(
                    subscription.id,
                    cancel_at_period_end=False,  # Reactivate if was set to cancel
                    metadata={
                        'pending_downgrade_plan': '',
                        'pending_downgrade_price_id': '',
                        'pending_downgrade_date': ''
                    }
                )
                print(f"Cleared cancel_at_period_end and pending downgrade for upgrade")
            except stripe.error.StripeError as e:
                print(f"Failed to clear downgrade metadata: {e}")
                return jsonify({'error': 'Could not prepare upgrade. Please try again.'}), 500
            
            if payment_method_id:
                try:
                    stripe.PaymentMethod.attach(payment_method_id, customer=customer_id)
                    stripe.Customer.modify(
                        customer_id,
                        invoice_settings={'default_payment_method': payment_method_id}
                    )
                except stripe.error.StripeError as e:
                    if 'already been attached' not in str(e):
                        print(f"Could not attach payment method: {e}")
            
            # Use 'none' for proration if skipping or using custom proration
            # Custom proration: we create our own invoice item for the correct difference
            proration_behavior = 'none' if (skip_proration or use_custom_proration) else 'always_invoice'
            payment_behavior = 'allow_incomplete' if skip_proration else 'error_if_incomplete'
            
            # If using custom proration, create an invoice item for the difference first
            if use_custom_proration and custom_proration_amount > 0:
                try:
                    stripe.InvoiceItem.create(
                        customer=customer_id,
                        amount=custom_proration_amount,  # in cents
                        currency='usd',
                        description=f'Upgrade proration: difference from previously paid plan this billing cycle'
                    )
                    print(f"Created custom invoice item for ${custom_proration_amount/100}")
                except stripe.error.StripeError as e:
                    print(f"Failed to create custom invoice item: {e}")
                    return jsonify({'error': 'Could not create proration charge. Please try again.'}), 500
            
            updated_subscription = stripe.Subscription.modify(
                subscription.id,
                items=[{
                    'id': subscription_item_id,
                    'price': new_price_id,
                }],
                proration_behavior=proration_behavior,
                billing_cycle_anchor='unchanged',
                payment_behavior=payment_behavior,
                metadata={'plan_id': new_plan_id, 'user_id': str(current_user.id)},
                expand=['latest_invoice.payment_intent']
            )
            
            invoice_id = updated_subscription.latest_invoice
            if isinstance(invoice_id, str):
                invoice = stripe.Invoice.retrieve(invoice_id, expand=['payment_intent', 'lines'])
            else:
                invoice = invoice_id
                if invoice:
                    invoice = stripe.Invoice.retrieve(invoice.id, expand=['payment_intent', 'lines'])
            
            if invoice and getattr(invoice, 'status', None) == 'draft':
                invoice = stripe.Invoice.finalize_invoice(invoice.id)
                invoice = stripe.Invoice.retrieve(invoice.id, expand=['payment_intent', 'lines'])
            
            payment_intent = None
            if invoice:
                pi = getattr(invoice, 'payment_intent', None)
                if pi:
                    if isinstance(pi, str):
                        payment_intent = stripe.PaymentIntent.retrieve(pi)
                    else:
                        payment_intent = pi
            
            if payment_intent:
                if payment_intent.status == 'requires_action':
                    proration_amount = (invoice.amount_due or 0) / 100
                    return jsonify({
                        'requires_action': True,
                        'client_secret': payment_intent.client_secret,
                        'proration_amount': proration_amount,
                        'subscription_id': updated_subscription.id,
                        'new_plan_id': new_plan_id
                    })
                
                if payment_intent.status == 'requires_payment_method':
                    return jsonify({
                        'error': 'Payment failed. Please try a different card.',
                        'requires_action': False
                    }), 400
            
            current_user.selected_plan = new_plan_id
            current_user.pending_plan = None  # Clear pending downgrade on successful upgrade
            
            # Update billing cycle tracking
            # Always sync billing_cycle_start with Stripe's current period
            period_start_timestamp = getattr(subscription, 'current_period_start', None)
            if period_start_timestamp:
                stripe_billing_start = datetime.fromtimestamp(period_start_timestamp)
                # Check if this is a new billing cycle (reset tracking)
                if current_user.billing_cycle_start is None or stripe_billing_start > current_user.billing_cycle_start:
                    # New billing cycle - reset highest paid tracking
                    current_user.billing_cycle_start = stripe_billing_start
                    current_user.highest_paid_plan_this_cycle = None
                    current_user.highest_paid_price_this_cycle = 0
                    print(f"New billing cycle detected, reset highest paid tracking")
            
            # Update highest paid if this upgrade is higher than previous in this cycle
            if new_price > (current_user.highest_paid_price_this_cycle or 0):
                current_user.highest_paid_plan_this_cycle = new_plan_id
                current_user.highest_paid_price_this_cycle = new_price
                print(f"Updated highest paid: {new_plan_id} at ${new_price/100}")
            
            db.session.commit()
            
            proration_amount = 0
            invoice_number = None
            invoice_pdf = None
            payment_method_used = None
            
            if invoice:
                proration_amount = (getattr(invoice, 'amount_paid', 0) or getattr(invoice, 'total', 0) or 0) / 100
                invoice_number = getattr(invoice, 'number', None)
                invoice_pdf = getattr(invoice, 'invoice_pdf', None)
                
                print(f"Upgrade invoice: id={invoice.id}, amount_paid={getattr(invoice, 'amount_paid', 0)/100}, total={getattr(invoice, 'total', 0)/100}, number={invoice_number}")
            
            if proration_amount == 0:
                proration_amount = (new_price - current_price) / 100  # Convert cents to dollars
            
            send_upgrade_transaction_email(
                current_user, 
                current_plan_id, 
                new_plan_id, 
                proration_amount,
                invoice_number,
                invoice_pdf,
                payment_method_used
            )
            
            return jsonify({
                'success': True,
                'type': 'upgrade',
                'message': 'Your plan has been upgraded!',
                'new_plan': new_plan_id,
                'proration_amount': proration_amount,
                'invoice_number': invoice_number,
                'invoice_pdf': invoice_pdf,
                'effective_immediately': True
            })
        else:
            # DOWNGRADE: Change subscription price with no proration
            # The price change takes effect immediately but billing continues at current amount until next cycle
            period_end_timestamp = getattr(subscription, 'current_period_end', None)
            if period_end_timestamp:
                period_end = datetime.fromtimestamp(period_end_timestamp)
                effective_date = period_end.strftime('%B %d, %Y')
            else:
                from datetime import timedelta
                period_end = datetime.now() + timedelta(days=30)
                effective_date = period_end.strftime('%B %d, %Y')
                period_end_timestamp = int(period_end.timestamp())
            
            # Check if downgrading to free plan (cancel subscription)
            if new_price == 0:
                # Cancel subscription at period end for free plan
                stripe.Subscription.modify(
                    subscription.id,
                    cancel_at_period_end=True,
                    metadata={
                        'plan_id': new_plan_id,
                        'user_id': str(current_user.id),
                        'pending_downgrade_plan': new_plan_id,
                        'pending_downgrade_date': effective_date
                    }
                )
                print(f"Subscription {subscription.id} set to cancel at period end ({effective_date}) for free plan")
            else:
                # PAID DOWNGRADE: Don't change Stripe immediately
                # Just track in database and store in Stripe metadata
                # The actual price change will happen at renewal via webhook or manual sync
                try:
                    # Release any existing subscription schedules first
                    schedules = stripe.SubscriptionSchedule.list(customer=customer_id, limit=10)
                    for schedule in schedules.data:
                        if schedule.status == 'active' and hasattr(schedule, 'subscription') and schedule.subscription == subscription.id:
                            try:
                                stripe.SubscriptionSchedule.release(schedule.id)
                                print(f"Released existing schedule {schedule.id}")
                            except stripe.error.StripeError as se:
                                print(f"Could not release schedule {schedule.id}: {se}")
                    
                    # Store pending downgrade in Stripe metadata (without changing price)
                    stripe.Subscription.modify(
                        subscription.id,
                        metadata={
                            'pending_downgrade_plan': new_plan_id,
                            'pending_downgrade_price_id': new_price_id,
                            'pending_downgrade_date': effective_date
                        }
                    )
                    print(f"Stored pending downgrade in metadata: {subscription.id} will change to {new_plan_id} on {effective_date}")
                except stripe.error.StripeError as e:
                    print(f"Failed to store downgrade metadata: {e}")
                    # Continue anyway - database tracking is the primary source of truth
            
            # Update database - keep current plan active, set pending change
            # User keeps current features until period end
            current_user.pending_plan = new_plan_id  # What it will become
            # selected_plan stays as current_plan_id (the higher plan they paid for)
            db.session.commit()
            
            send_plan_change_email(current_user, current_plan_id, new_plan_id, is_upgrade=False, effective_date=effective_date)
            
            return jsonify({
                'success': True,
                'type': 'downgrade',
                'message': f'Your plan will change to {new_plan_id.replace("-", " ").title()} on {effective_date}. You keep all current features until then.',
                'new_plan': new_plan_id,
                'current_plan': current_plan_id,
                'effective_date': effective_date,
                'effective_immediately': False
            })
    
    except stripe.error.StripeError as e:
        print(f"Stripe error changing plan: {e}")
        return jsonify({'error': str(e)}), 500
    except Exception as e:
        print(f"Error changing plan: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/stripe/confirm-upgrade', methods=['POST'])
@login_required
def confirm_upgrade_after_3ds():
    """Confirm upgrade after 3D Secure authentication completes"""
    try:
        publishable_key, secret_key = get_stripe_credentials()
        if not secret_key:
            return jsonify({'error': 'Stripe is not configured'}), 500
        
        stripe.api_key = secret_key
        data = request.get_json()
        plan_id = data.get('plan_id')
        payment_intent_id = data.get('payment_intent_id')
        
        if not plan_id or not payment_intent_id:
            return jsonify({'error': 'Missing required parameters'}), 400
        if not is_known_plan(plan_id) or is_zero_cost_plan(plan_id):
            return jsonify({'error': 'Invalid plan selected'}), 400
        
        payment_intent = stripe.PaymentIntent.retrieve(payment_intent_id)
        payment_intent_customer = get_stripe_customer_id(get_stripe_object_value(payment_intent, 'customer'))
        if current_user.stripe_customer_id and payment_intent_customer and payment_intent_customer != current_user.stripe_customer_id:
            return jsonify({'error': 'Payment does not belong to this account'}), 403
        
        if payment_intent.status != 'succeeded':
            return jsonify({'error': 'Payment was not successful'}), 400

        subscription = None
        if current_user.stripe_subscription_id:
            subscription = stripe.Subscription.retrieve(
                current_user.stripe_subscription_id,
                expand=['customer']
            )
            if not stripe_subscription_belongs_to_user(subscription, current_user):
                return jsonify({'error': 'Subscription does not belong to this account'}), 403
            expected_plan_id = get_stripe_object_value(subscription, 'metadata', {}).get('plan_id')
            if expected_plan_id and expected_plan_id != plan_id:
                return jsonify({'error': 'Plan confirmation mismatch'}), 400
        
        old_plan = current_user.selected_plan or 'free'
        if subscription:
            sync_user_from_stripe_subscription(subscription, user=current_user)
        else:
            current_user.selected_plan = plan_id
            current_user.pending_plan = None
            db.session.commit()
        
        proration_amount = 0
        invoice_number = None
        invoice_pdf = None
        payment_method_used = None
        
        try:
            if payment_intent.invoice:
                invoice = stripe.Invoice.retrieve(payment_intent.invoice)
                proration_amount = abs(invoice.amount_paid or invoice.amount_due or 0) / 100
                invoice_number = invoice.number
                invoice_pdf = invoice.invoice_pdf
                
                if invoice.charge:
                    charge = stripe.Charge.retrieve(invoice.charge)
                    if charge.payment_method_details and charge.payment_method_details.card:
                        card = charge.payment_method_details.card
                        payment_method_used = {
                            'brand': card.brand,
                            'last4': card.last4
                        }
        except Exception as e:
            print(f"Could not get invoice details: {e}")
        
        send_upgrade_transaction_email(
            current_user,
            old_plan,
            plan_id,
            proration_amount,
            invoice_number,
            invoice_pdf,
            payment_method_used
        )
        
        return jsonify({
            'success': True,
            'type': 'upgrade',
            'message': 'Your plan has been upgraded!',
            'new_plan': plan_id,
            'proration_amount': proration_amount,
            'invoice_number': invoice_number,
            'invoice_pdf': invoice_pdf,
            'effective_immediately': True
        })
    
    except Exception as e:
        print(f"Error confirming upgrade: {e}")
        return jsonify({'error': str(e)}), 500

def send_downgrade_cancelled_email(user, current_plan, cancelled_plan):
    """Send email notification when a pending downgrade is cancelled"""
    try:
        current_plan_name = current_plan.replace('-', ' ').title() if current_plan else 'Current'
        cancelled_plan_name = cancelled_plan.replace('-', ' ').title() if cancelled_plan else 'Previous'
        current_price = PLAN_PRICES.get(current_plan, {}).get('amount', 0) / 100
        
        subject = f"BacktestPro - Plan Change Cancelled"
        body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #14b8a6, #0d9488); padding: 30px; text-align: center;">
                <h1 style="color: white; margin: 0;">Plan Restored!</h1>
            </div>
            <div style="padding: 30px; background: #f8fafc;">
                <p>Hi {user.name or 'there'},</p>
                <p>Good news! Your scheduled plan change has been cancelled. Your subscription will continue on your current plan.</p>
                <div style="background: white; border-radius: 10px; padding: 20px; margin: 20px 0;">
                    <p><strong>Your Plan:</strong> {current_plan_name} (${current_price:.2f}/month)</p>
                    <p><strong>Status:</strong> <span style="color: #14b8a6;">Active - No changes scheduled</span></p>
                </div>
                <p>Your subscription will continue to renew automatically at ${current_price:.2f}/month. All your current features remain active.</p>
                <p>Thank you for staying with us!</p>
                <p>The BacktestPro Team</p>
            </div>
        </body>
        </html>
        """
        
        mailtrap_configured = app.config.get('MAIL_USERNAME') and app.config.get('MAIL_PASSWORD')
        
        if mailtrap_configured:
            msg = Message(
                subject=subject,
                recipients=[user.email],
                html=body
            )
            mail.send(msg)
            print(f"Downgrade cancelled email sent to {user.email}")
        else:
            print(f"Email not configured - would send downgrade cancelled email to {user.email}")
    
    except Exception as e:
        print(f"Error sending downgrade cancelled email: {e}")

def send_plan_change_email(user, old_plan, new_plan, is_upgrade=True, effective_date=None):
    """Send email notification for plan changes"""
    try:
        old_plan_name = old_plan.replace('-', ' ').title()
        new_plan_name = new_plan.replace('-', ' ').title()
        old_price = PLAN_PRICES.get(old_plan, {}).get('amount', 0) / 100
        new_price = PLAN_PRICES.get(new_plan, {}).get('amount', 0) / 100
        
        if is_upgrade:
            subject = f"BacktestPro - Plan Upgraded to {new_plan_name}"
            body = f"""
            <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #14b8a6, #0d9488); padding: 30px; text-align: center;">
                    <h1 style="color: white; margin: 0;">Plan Upgraded!</h1>
                </div>
                <div style="padding: 30px; background: #f8fafc;">
                    <p>Hi {user.name or 'there'},</p>
                    <p>Great news! Your BacktestPro subscription has been upgraded.</p>
                    <div style="background: white; border-radius: 10px; padding: 20px; margin: 20px 0;">
                        <p><strong>Previous Plan:</strong> {old_plan_name} (${old_price:.2f}/month)</p>
                        <p><strong>New Plan:</strong> {new_plan_name} (${new_price:.2f}/month)</p>
                        <p><strong>Status:</strong> <span style="color: #14b8a6;">Active immediately</span></p>
                    </div>
                    <p>Your new features are available right now. Any prorated charges for the remainder of your billing cycle have been applied to your account.</p>
                    <p>Thank you for upgrading!</p>
                    <p>The BacktestPro Team</p>
                </div>
            </body>
            </html>
            """
        else:
            subject = f"BacktestPro - Plan Change Scheduled"
            body = f"""
            <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #64748b, #475569); padding: 30px; text-align: center;">
                    <h1 style="color: white; margin: 0;">Plan Change Scheduled</h1>
                </div>
                <div style="padding: 30px; background: #f8fafc;">
                    <p>Hi {user.name or 'there'},</p>
                    <p>Your plan change request has been received and scheduled.</p>
                    <div style="background: white; border-radius: 10px; padding: 20px; margin: 20px 0;">
                        <p><strong>Current Plan:</strong> {old_plan_name} (${old_price:.2f}/month)</p>
                        <p><strong>New Plan:</strong> {new_plan_name} (${new_price:.2f}/month)</p>
                        <p><strong>Effective Date:</strong> {effective_date}</p>
                    </div>
                    <p><strong>Important:</strong> You will retain access to all your current plan features until {effective_date}. After this date, your plan will change and some features may no longer be available.</p>
                    <p>If you change your mind, you can update your plan anytime before the effective date.</p>
                    <p>The BacktestPro Team</p>
                </div>
            </body>
            </html>
            """
        
        mailtrap_configured = app.config.get('MAIL_USERNAME') and app.config.get('MAIL_PASSWORD')
        
        if mailtrap_configured:
            msg = Message(
                subject=subject,
                recipients=[user.email],
                html=body
            )
            mail.send(msg)
            print(f"Plan change email sent to {user.email}")
        else:
            print(f"Email not configured - would send plan change email to {user.email}")
    
    except Exception as e:
        print(f"Error sending plan change email: {e}")

def send_upgrade_transaction_email(user, old_plan, new_plan, amount, invoice_number, invoice_pdf, payment_method):
    """Send transaction confirmation email for upgrades with invoice details"""
    try:
        from datetime import datetime
        
        old_plan_name = old_plan.replace('-', ' ').title()
        new_plan_name = new_plan.replace('-', ' ').title()
        old_price = PLAN_PRICES.get(old_plan, {}).get('amount', 0) / 100
        new_price = PLAN_PRICES.get(new_plan, {}).get('amount', 0) / 100
        transaction_date = datetime.now().strftime('%B %d, %Y at %I:%M %p')
        
        payment_info = ""
        if payment_method:
            brand = payment_method.get('brand', 'Card').capitalize()
            last4 = payment_method.get('last4', '****')
            payment_info = f"{brand} ending in {last4}"
        else:
            payment_info = "Your default payment method"
        
        invoice_link = ""
        if invoice_pdf:
            invoice_link = f'<a href="{invoice_pdf}" style="color: #14b8a6; text-decoration: none;">Download Invoice PDF</a>'
        
        subject = f"BacktestPro - Payment Receipt for Upgrade to {new_plan_name}"
        body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc;">
            <div style="background: linear-gradient(135deg, #14b8a6, #0d9488); padding: 30px; text-align: center;">
                <h1 style="color: white; margin: 0;">Payment Successful</h1>
            </div>
            <div style="padding: 30px; background: white;">
                <p style="font-size: 16px;">Hi {user.name or 'there'},</p>
                <p>Thank you for upgrading your BacktestPro subscription! Your payment has been processed successfully.</p>
                
                <div style="background: #f0fdfa; border-radius: 10px; padding: 20px; margin: 24px 0; border-left: 4px solid #14b8a6;">
                    <h3 style="margin: 0 0 16px; color: #0d9488;">Transaction Details</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; color: #64748b;">Date:</td>
                            <td style="padding: 8px 0; text-align: right; color: #1e293b;">{transaction_date}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b;">Invoice Number:</td>
                            <td style="padding: 8px 0; text-align: right; color: #1e293b;">{invoice_number or 'N/A'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b;">Payment Method:</td>
                            <td style="padding: 8px 0; text-align: right; color: #1e293b;">{payment_info}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b;">Previous Plan:</td>
                            <td style="padding: 8px 0; text-align: right; color: #1e293b;">{old_plan_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b;">New Plan:</td>
                            <td style="padding: 8px 0; text-align: right; color: #1e293b; font-weight: bold;">{new_plan_name}</td>
                        </tr>
                        <tr style="border-top: 1px solid #e2e8f0;">
                            <td style="padding: 12px 0 8px; color: #0d9488; font-weight: bold;">Amount Charged:</td>
                            <td style="padding: 12px 0 8px; text-align: right; color: #0d9488; font-weight: bold; font-size: 18px;">${amount:.2f}</td>
                        </tr>
                    </table>
                </div>
                
                <div style="background: #f8fafc; border-radius: 10px; padding: 16px; margin: 20px 0; text-align: center;">
                    <p style="margin: 0 0 8px; color: #64748b; font-size: 14px;">Your new monthly rate will be:</p>
                    <p style="margin: 0; color: #1e293b; font-size: 24px; font-weight: bold;">${new_price:.2f}/month</p>
                </div>
                
                {f'<p style="text-align: center; margin: 24px 0;">{invoice_link}</p>' if invoice_link else ''}
                
                <p style="color: #64748b; font-size: 14px;">Your upgraded features are now active. If you have any questions about your billing, please visit your subscription settings or contact our support team.</p>
                
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
                
                <p style="color: #94a3b8; font-size: 12px; text-align: center;">
                    This is an automated payment receipt from BacktestPro.<br>
                    Please keep this email for your records.
                </p>
            </div>
        </body>
        </html>
        """
        
        mailtrap_configured = app.config.get('MAIL_USERNAME') and app.config.get('MAIL_PASSWORD')
        
        if mailtrap_configured:
            msg = Message(
                subject=subject,
                recipients=[user.email],
                html=body,
                sender=('BacktestPro Billing', 'billing@backtestpro.com')
            )
            mail.send(msg)
            print(f"Upgrade transaction email sent to {user.email}")
        else:
            print(f"Email not configured - would send upgrade transaction email to {user.email}")
    
    except Exception as e:
        print(f"Error sending upgrade transaction email: {e}")

@app.route('/api/billing/subscription', methods=['GET'])
@login_required
def get_billing_subscription():
    """Get current subscription status from Stripe"""
    try:
        _, secret_key = get_stripe_credentials()
        if not secret_key:
            plan_name = current_user.selected_plan or 'free'
            display_name = plan_name.replace('-', ' ').title() if plan_name != 'free' else 'Free'
            return jsonify({
                'subscription': None,
                'plan': plan_name,
                'plan_display_name': display_name,
                'price': PLAN_PRICES.get(plan_name, {}).get('amount', 0) / 100 if plan_name != 'free' else 0,
                'status': 'no_subscription'
            })
        
        stripe.api_key = secret_key
        subscription = None
        
        if current_user.stripe_subscription_id:
            try:
                # Force fresh fetch with expand to ensure we get latest data
                subscription = stripe.Subscription.retrieve(
                    current_user.stripe_subscription_id,
                    expand=['customer', 'default_payment_method', 'items.data.price']
                )
                print(f"Subscription retrieved: id={subscription.id}, cancel_at_period_end={subscription.cancel_at_period_end}")
            except stripe.error.InvalidRequestError as e:
                print(f"Error retrieving subscription: {e}")
                subscription = None
        
        if not subscription and current_user.stripe_customer_id:
            try:
                subscriptions = stripe.Subscription.list(
                    customer=current_user.stripe_customer_id,
                    limit=5
                )
                if subscriptions.data:
                    active_subs = [s for s in subscriptions.data if s.status in ['active', 'trialing']]
                    if active_subs:
                        subscription = active_subs[0]
                    else:
                        subscription = subscriptions.data[0]
                    sync_user_from_stripe_subscription(subscription, user=current_user)
            except Exception as e:
                print(f"Error listing subscriptions: {e}")
        
        plan_name = current_user.selected_plan or 'free'
        display_name = plan_name.replace('-', ' ').title() if plan_name != 'free' else 'Free'
        
        if not subscription:
            return jsonify({
                'subscription': None,
                'plan': plan_name,
                'plan_display_name': display_name,
                'price': PLAN_PRICES.get(plan_name, {}).get('amount', 0) / 100 if plan_name != 'free' else 0,
                'status': 'no_subscription'
            })

        sync_user_subscription_state(current_user, subscription)
        db.session.commit()
        plan_name = current_user.selected_plan or 'free'
        display_name = plan_name.replace('-', ' ').title() if plan_name != 'free' else 'Free'

        price_amount = 0
        price_amount_cents = 0
        try:
            items_data = subscription.get('items', {}).get('data', []) if isinstance(subscription, dict) else getattr(subscription.items, 'data', [])
            if items_data:
                item = items_data[0]
                price_obj = item.get('price') if isinstance(item, dict) else getattr(item, 'price', None)
                if price_obj:
                    unit_amount = price_obj.get('unit_amount', 0) if isinstance(price_obj, dict) else getattr(price_obj, 'unit_amount', 0)
                    price_amount_cents = unit_amount or 0
                    price_amount = price_amount_cents / 100
        except Exception as e:
            print(f"Error accessing subscription items: {e}")
            price_amount = PLAN_PRICES.get(plan_name, {}).get('amount', 0) / 100 if plan_name != 'free' else 0
            price_amount_cents = int(price_amount * 100)

        if plan_name == 'free':
            price_amount = 0
            price_amount_cents = 0

        next_billing_date = None
        current_period_end = getattr(subscription, 'current_period_end', None)
        if current_period_end:
            next_billing_date = datetime.fromtimestamp(current_period_end).strftime('%B %d, %Y')
        else:
            created = getattr(subscription, 'created', None) or getattr(subscription, 'start_date', None)
            if created:
                next_date = datetime.fromtimestamp(created) + timedelta(days=30)
                next_billing_date = next_date.strftime('%B %d, %Y')
        
        # Get cancel_at_period_end - try multiple access methods
        cancel_at_period_end = False
        cancel_at = None
        if isinstance(subscription, dict):
            cancel_at_period_end = subscription.get('cancel_at_period_end', False)
            cancel_at = subscription.get('cancel_at')
        else:
            cancel_at_period_end = getattr(subscription, 'cancel_at_period_end', False)
            cancel_at = getattr(subscription, 'cancel_at', None)
        
        # If cancel_at is set, subscription will cancel at that time
        cancel_date = None
        if cancel_at:
            cancel_date = datetime.fromtimestamp(cancel_at).strftime('%B %d, %Y')
            cancel_at_period_end = True  # Override if cancel_at is set
        elif cancel_at_period_end and current_period_end:
            cancel_date = datetime.fromtimestamp(current_period_end).strftime('%B %d, %Y')
        
        print(f"Subscription debug: status={subscription.status}, period_end={current_period_end}, next_billing={next_billing_date}, cancel_at_period_end={cancel_at_period_end}, cancel_at={cancel_at}")
        print(f"Subscription raw cancel_at_period_end: {subscription.get('cancel_at_period_end') if isinstance(subscription, dict) else subscription.cancel_at_period_end}")
        
        pending_plan = current_user.pending_plan
        pending_plan_display = None
        pending_plan_price = None
        pending_effective_date = None
        
        if pending_plan:
            pending_plan_display = pending_plan.replace('-', ' ').title()
            pending_plan_price = PLAN_PRICES.get(pending_plan, {}).get('amount', 0) / 100
            if current_period_end:
                pending_effective_date = datetime.fromtimestamp(current_period_end).strftime('%B %d, %Y')
        
        return jsonify({
            'subscription': {
                'id': subscription.id,
                'status': subscription.status,
                'current_period_end': current_period_end,
                'cancel_at_period_end': cancel_at_period_end,
                'cancel_at': cancel_at,
                'cancel_date': cancel_date,
            },
            'plan': plan_name,
            'plan_display_name': display_name,
            'price': price_amount,
            'next_billing_date': next_billing_date,
            'cancel_date': cancel_date,
            'status': subscription.status,
            'pending_plan': pending_plan,
            'pending_plan_display': pending_plan_display,
            'pending_plan_price': pending_plan_price,
            'pending_effective_date': pending_effective_date
        })
        
    except stripe.error.InvalidRequestError as e:
        plan_name = current_user.selected_plan or 'free'
        display_name = plan_name.replace('-', ' ').title() if plan_name != 'free' else 'Free'
        return jsonify({
            'subscription': None,
            'plan': plan_name,
            'plan_display_name': display_name,
            'status': 'invalid',
            'error': str(e)
        })
    except Exception as e:
        print(f"Error fetching subscription: {e}")
        plan_name = current_user.selected_plan or 'free'
        display_name = plan_name.replace('-', ' ').title() if plan_name != 'free' else 'Free'
        return jsonify({
            'subscription': None,
            'plan': plan_name,
            'plan_display_name': display_name,
            'status': 'error',
            'error': str(e)
        })

@app.route('/api/billing/invoices', methods=['GET'])
@login_required
def get_billing_invoices():
    """Get invoices from Stripe"""
    try:
        _, secret_key = get_stripe_credentials()
        if not secret_key:
            return jsonify({'invoices': [], 'error': 'Stripe not configured'})
        
        stripe.api_key = secret_key
        
        if not current_user.stripe_customer_id:
            return jsonify({'invoices': []})
        
        invoices = stripe.Invoice.list(
            customer=current_user.stripe_customer_id,
            limit=10
        )
        
        invoice_list = []
        for inv in invoices.data:
            invoice_list.append({
                'id': inv.id,
                'number': inv.number,
                'amount_paid': inv.amount_paid / 100 if inv.amount_paid else 0,
                'currency': inv.currency.upper(),
                'status': inv.status,
                'created': inv.created,
                'invoice_pdf': inv.invoice_pdf,
                'hosted_invoice_url': inv.hosted_invoice_url,
            })
        
        return jsonify({'invoices': invoice_list})
        
    except Exception as e:
        print(f"Error fetching invoices: {e}")
        return jsonify({'invoices': [], 'error': str(e)})

@app.route('/api/billing/payment-methods', methods=['GET'])
@login_required
def get_billing_payment_methods():
    """Get payment methods from Stripe"""
    try:
        _, secret_key = get_stripe_credentials()
        if not secret_key:
            print("Payment methods: Stripe not configured")
            return jsonify({'payment_methods': [], 'error': 'Stripe not configured'})
        
        stripe.api_key = secret_key
        
        if not current_user.stripe_customer_id:
            print(f"Payment methods: No customer ID for user {current_user.email}")
            return jsonify({'payment_methods': []})
        
        print(f"Payment methods: Fetching for customer {current_user.stripe_customer_id}")
        payment_methods = stripe.PaymentMethod.list(
            customer=current_user.stripe_customer_id,
            type='card'
        )
        
        print(f"Payment methods: Found {len(payment_methods.data)} cards")
        pm_list = []
        for pm in payment_methods.data:
            card = pm.card
            pm_list.append({
                'id': pm.id,
                'brand': card.brand,
                'last4': card.last4,
                'exp_month': card.exp_month,
                'exp_year': card.exp_year,
            })
        
        return jsonify({'payment_methods': pm_list})
        
    except Exception as e:
        print(f"Error fetching payment methods: {e}")
        return jsonify({'payment_methods': [], 'error': str(e)})

@app.route('/api/billing/portal', methods=['POST'])
@login_required
def create_billing_portal():
    """Create a Stripe Customer Portal session with optional flow type"""
    try:
        _, secret_key = get_stripe_credentials()
        if not secret_key:
            return jsonify({'error': 'Stripe is not configured'}), 500
        
        stripe.api_key = secret_key
        
        if not current_user.stripe_customer_id:
            customer = stripe.Customer.create(
                email=current_user.email,
                name=current_user.name,
                metadata={'user_id': str(current_user.id)}
            )
            current_user.stripe_customer_id = customer.id
            db.session.commit()
        
        data = request.get_json() or {}
        flow_type = data.get('flow_type')
        return_url = request.host_url + 'dashboard?section=billing'
        
        session_params = {
            'customer': current_user.stripe_customer_id,
            'return_url': return_url,
        }
        
        if flow_type == 'subscription_cancel':
            if not current_user.stripe_subscription_id:
                return jsonify({'error': 'No active subscription to manage'}), 400
            session_params['flow_data'] = {
                'type': 'subscription_cancel',
                'subscription_cancel': {
                    'subscription': current_user.stripe_subscription_id
                }
            }
        elif flow_type == 'payment_method_update':
            session_params['flow_data'] = {
                'type': 'payment_method_update',
            }
        
        try:
            session = stripe.billing_portal.Session.create(**session_params)
        except stripe.error.InvalidRequestError as e:
            # If specific flow fails (e.g., already cancelled), fall back to general portal
            print(f"Flow-specific portal failed: {e}, falling back to general portal")
            session = stripe.billing_portal.Session.create(
                customer=current_user.stripe_customer_id,
                return_url=return_url,
            )
        
        return jsonify({'portal_url': session.url})
        
    except Exception as e:
        print(f"Error creating portal session: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/user/info', methods=['GET'])
@login_required
def get_user_info():
    """Get current user info including selected plan"""
    return jsonify({
        'id': current_user.id,
        'email': current_user.email,
        'name': current_user.name,
        'selected_plan': current_user.selected_plan,
        'stripe_customer_id': current_user.stripe_customer_id,
        'stripe_subscription_id': current_user.stripe_subscription_id,
        'auth_provider': current_user.auth_provider or 'email',
        'is_admin': bool(getattr(current_user, 'is_admin', False)),
        'profile_picture': current_user.profile_picture
    })

@app.route('/api/user/update-plan', methods=['POST'])
@login_required
def update_user_plan():
    """Update user's selected plan"""
    try:
        data = request.get_json()
        new_plan = data.get('plan', 'free')
        if not is_zero_cost_plan(new_plan):
            return jsonify({'error': 'Only free plans can be selected without billing confirmation'}), 400
        if current_user.stripe_subscription_id:
            return jsonify({'error': 'Use billing to change an active subscription'}), 400
        current_user.selected_plan = new_plan
        current_user.pending_plan = None
        db.session.commit()
        return jsonify({'success': True, 'plan': new_plan})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/user/update', methods=['POST'])
@login_required
def update_user_info():
    """Update user's account information"""
    try:
        data = request.get_json()
        name = data.get('name', '').strip()
        
        if name:
            current_user.name = name
        
        db.session.commit()
        return jsonify({'success': True, 'name': current_user.name})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/user/upload-avatar', methods=['POST'])
@login_required
def upload_avatar():
    """Upload or update user's profile picture"""
    try:
        if 'avatar' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['avatar']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        allowed_extensions = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
        ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
        if ext not in allowed_extensions:
            return jsonify({'error': 'Invalid file type. Use PNG, JPG, GIF, or WebP'}), 400
        
        file.seek(0, 2)
        file_size = file.tell()
        file.seek(0)
        if file_size > 5 * 1024 * 1024:
            return jsonify({'error': 'File too large. Maximum 5MB'}), 400
        
        import uuid
        filename = f"avatar_{current_user.id}_{uuid.uuid4().hex[:8]}.{ext}"
        upload_dir = os.path.join('static', 'uploads', 'avatars')
        os.makedirs(upload_dir, exist_ok=True)
        
        if current_user.profile_picture:
            old_path = current_user.profile_picture.lstrip('/')
            if os.path.exists(old_path):
                try:
                    os.remove(old_path)
                except Exception:
                    pass
        
        filepath = os.path.join(upload_dir, filename)
        file.save(filepath)
        
        url_path = f"/static/uploads/avatars/{filename}"
        current_user.profile_picture = url_path
        db.session.commit()
        
        return jsonify({'success': True, 'profile_picture': url_path})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/user/remove-avatar', methods=['POST'])
@login_required
def remove_avatar():
    """Remove user's profile picture"""
    try:
        if current_user.profile_picture:
            old_path = current_user.profile_picture.lstrip('/')
            if os.path.exists(old_path):
                try:
                    os.remove(old_path)
                except Exception:
                    pass
            current_user.profile_picture = None
            db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/user/change-password', methods=['POST'])
@login_required
def change_user_password():
    """Change user's password"""
    try:
        data = request.get_json()
        current_password = data.get('current_password', '')
        new_password = data.get('new_password', '')
        
        if not current_password or not new_password:
            return jsonify({'error': 'Both current and new password are required'}), 400
        
        if not current_user.check_password(current_password):
            return jsonify({'error': 'Current password is incorrect'}), 401
        
        if len(new_password) < 8:
            return jsonify({'error': 'New password must be at least 8 characters'}), 400
        
        current_user.set_password(new_password)
        revoke_user_auth_token(current_user)
        db.session.commit()
        return jsonify({'success': True, 'message': 'Password updated successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/<path:path>')
def serve_static(path):
    """Serve explicit public root assets without exposing source or result files."""
    requested = Path(path)
    if requested.is_absolute() or len(requested.parts) != 1 or requested.name.startswith('.'):
        abort(404)

    extension = requested.suffix.lower()
    candidate = BASE_DIR / requested.name
    if extension not in PUBLIC_ROOT_EXTENSIONS or not candidate.is_file():
        abort(404)

    return send_from_directory(BASE_DIR, requested.name)

@app.route('/api/config', methods=['GET'])
def get_config():
    """Check if API key is configured"""
    return jsonify({
        'api_key_configured': bool(API_KEY)
    })

@app.route('/api/aggregates/<ticker>', methods=['GET'])
def get_aggregates(ticker):
    """
    Fetch aggregate bars (OHLCV data)
    Query params: multiplier, timespan, from, to, limit
    """
    try:
        # Get query parameters
        multiplier = request.args.get('multiplier', '1')
        timespan = request.args.get('timespan', 'day')
        from_date = request.args.get('from')
        to_date = request.args.get('to')
        limit = request.args.get('limit', '100')
        adjusted = request.args.get('adjusted', 'true')
        sort = request.args.get('sort', 'asc')
        
        # Get API key from header or use server key
        api_key = request.headers.get('X-API-Key', API_KEY)
        
        if not api_key:
            return jsonify({'error': 'API key not configured'}), 401
        
        # Build Polygon URL
        url = f"{POLYGON_BASE_URL}/v2/aggs/ticker/{ticker}/range/{multiplier}/{timespan}/{from_date}/{to_date}"
        
        params = {
            'adjusted': adjusted,
            'sort': sort,
            'limit': limit,
            'apiKey': api_key
        }
        
        # Make request to Polygon
        response = requests.get(url, params=params, timeout=30)
        
        if response.status_code != 200:
            return jsonify({
                'error': f'Polygon API error: {response.status_code}',
                'message': response.text
            }), response.status_code
        
        data = response.json()
        
        # Add metadata
        data['metadata'] = {
            'ticker': ticker,
            'timeframe': f"{multiplier} {timespan}",
            'from': from_date,
            'to': to_date,
            'fetched_at': datetime.now().isoformat()
        }
        
        return jsonify(data)
        
    except requests.exceptions.RequestException as e:
        return jsonify({'error': f'Network error: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/api/snapshot/<ticker>', methods=['GET'])
def get_snapshot(ticker):
    """
    Fetch current snapshot for a ticker
    """
    try:
        api_key = request.headers.get('X-API-Key', API_KEY)
        
        if not api_key:
            return jsonify({'error': 'API key not configured'}), 401
        
        url = f"{POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/{ticker}"
        params = {'apiKey': api_key}
        
        response = requests.get(url, params=params, timeout=30)
        
        if response.status_code != 200:
            return jsonify({
                'error': f'Polygon API error: {response.status_code}',
                'message': response.text
            }), response.status_code
        
        data = response.json()
        data['fetched_at'] = datetime.now().isoformat()
        
        return jsonify(data)
        
    except requests.exceptions.RequestException as e:
        return jsonify({'error': f'Network error: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/api/quotes/<ticker>', methods=['GET'])
def get_quotes(ticker):
    """
    Fetch quotes for a ticker
    Query params: timestamp_gte, timestamp_lte, limit
    """
    try:
        api_key = request.headers.get('X-API-Key', API_KEY)
        
        if not api_key:
            return jsonify({'error': 'API key not configured'}), 401
        
        # Get query parameters
        timestamp_gte = request.args.get('timestamp_gte')
        timestamp_lte = request.args.get('timestamp_lte')
        limit = request.args.get('limit', '100')
        
        url = f"{POLYGON_BASE_URL}/v3/quotes/{ticker}"
        
        params = {
            'apiKey': api_key,
            'limit': limit
        }
        
        if timestamp_gte:
            params['timestamp.gte'] = timestamp_gte
        if timestamp_lte:
            params['timestamp.lte'] = timestamp_lte
        
        response = requests.get(url, params=params, timeout=30)
        
        if response.status_code != 200:
            return jsonify({
                'error': f'Polygon API error: {response.status_code}',
                'message': response.text
            }), response.status_code
        
        return jsonify(response.json())
        
    except requests.exceptions.RequestException as e:
        return jsonify({'error': f'Network error: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/api/trades/<ticker>', methods=['GET'])
def get_trades(ticker):
    """
    Fetch trades for a ticker
    Query params: timestamp_gte, timestamp_lte, limit
    """
    try:
        api_key = request.headers.get('X-API-Key', API_KEY)
        
        if not api_key:
            return jsonify({'error': 'API key not configured'}), 401
        
        # Get query parameters
        timestamp_gte = request.args.get('timestamp_gte')
        timestamp_lte = request.args.get('timestamp_lte')
        limit = request.args.get('limit', '100')
        
        url = f"{POLYGON_BASE_URL}/v3/trades/{ticker}"
        
        params = {
            'apiKey': api_key,
            'limit': limit
        }
        
        if timestamp_gte:
            params['timestamp.gte'] = timestamp_gte
        if timestamp_lte:
            params['timestamp.lte'] = timestamp_lte
        
        response = requests.get(url, params=params, timeout=30)
        
        if response.status_code != 200:
            return jsonify({
                'error': f'Polygon API error: {response.status_code}',
                'message': response.text
            }), response.status_code
        
        return jsonify(response.json())
        
    except requests.exceptions.RequestException as e:
        return jsonify({'error': f'Network error: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/api/options/chain/<ticker>', methods=['GET'])
def get_options_chain(ticker):
    """
    Fetch options chain for a ticker
    Query params: expiration_date, strike_price
    """
    try:
        api_key = request.headers.get('X-API-Key', API_KEY)
        
        if not api_key:
            return jsonify({'error': 'API key not configured'}), 401
        
        # Get query parameters
        expiration_date = request.args.get('expiration_date')
        strike_price = request.args.get('strike_price')
        
        url = f"{POLYGON_BASE_URL}/v3/snapshot/options/{ticker}"
        
        params = {'apiKey': api_key}
        
        if expiration_date:
            params['expiration_date'] = expiration_date
        if strike_price:
            params['strike_price'] = strike_price
        
        response = requests.get(url, params=params, timeout=30)
        
        if response.status_code != 200:
            return jsonify({
                'error': f'Polygon API error: {response.status_code}',
                'message': response.text
            }), response.status_code
        
        return jsonify(response.json())
        
    except requests.exceptions.RequestException as e:
        return jsonify({'error': f'Network error: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/api/options/aggregates/<ticker>', methods=['GET'])
def get_options_aggregates(ticker):
    """
    Fetch aggregate bars for options contracts
    Similar to stocks aggregates but for options tickers
    """
    try:
        # Get query parameters
        multiplier = request.args.get('multiplier', '1')
        timespan = request.args.get('timespan', 'day')
        from_date = request.args.get('from')
        to_date = request.args.get('to')
        limit = request.args.get('limit', '120')
        adjusted = request.args.get('adjusted', 'true')
        sort = request.args.get('sort', 'asc')
        
        # Get API key from header or use server key
        api_key = request.headers.get('X-API-Key', API_KEY)
        
        if not api_key:
            return jsonify({'error': 'API key not configured'}), 401
        
        # Build Polygon URL for options
        url = f"{POLYGON_BASE_URL}/v2/aggs/ticker/{ticker}/range/{multiplier}/{timespan}/{from_date}/{to_date}"
        
        params = {
            'adjusted': adjusted,
            'sort': sort,
            'limit': limit,
            'apiKey': api_key
        }
        
        # Make request to Polygon
        response = requests.get(url, params=params, timeout=30)
        
        if response.status_code != 200:
            return jsonify({
                'error': f'Polygon API error: {response.status_code}',
                'message': response.text
            }), response.status_code
        
        data = response.json()
        
        # Add metadata
        data['metadata'] = {
            'ticker': ticker,
            'timeframe': f"{multiplier} {timespan}",
            'from': from_date,
            'to': to_date,
            'fetched_at': datetime.now().isoformat()
        }
        
        return jsonify(data)
        
    except requests.exceptions.RequestException as e:
        return jsonify({'error': f'Network error: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """Readiness-style health check with database connectivity."""
    database = check_database_connection()
    status_code = 200 if database["status"] == "ok" else 503
    return jsonify({
        'status': 'healthy' if status_code == 200 else 'degraded',
        'timestamp': datetime.now().isoformat(),
        'api_key_configured': bool(API_KEY),
        'database': database,
        'migrations_enabled': MIGRATIONS_ENABLED,
        'auto_create_schema': should_auto_create_schema(),
    }), status_code


@app.route('/api/health/live', methods=['GET'])
def liveness_check():
    """Lightweight liveness probe that avoids downstream dependencies."""
    return jsonify({
        'status': 'alive',
        'timestamp': datetime.now().isoformat(),
    }), 200

def convert_legs_array_to_dict(legs_array):
    """Convert legs array to dictionary format for easier display.
    
    Input: [{name: "Long Call", config_type: "pct_underlying", params: {...}}]
    Output: {"Long Call": {config_type: "pct_underlying", params: {...}}}
    """
    if not legs_array or not isinstance(legs_array, list):
        return {}
    
    legs_dict = {}
    for leg in legs_array:
        if isinstance(leg, dict) and 'name' in leg:
            leg_name = leg['name']
            # Copy leg data without the name field
            leg_data = {k: v for k, v in leg.items() if k != 'name'}
            legs_dict[leg_name] = leg_data
    
    return legs_dict

@app.route('/api/backtest/start', methods=['POST'])
@login_required
def start_backtest_async():
    """Start options strategy backtest asynchronously - returns immediately with backtest_id"""
    try:
        params = request.json
        api_key = request.headers.get('X-API-Key', API_KEY)
        
        if not api_key:
            return jsonify({'error': 'API key required'}), 401
        
        # Generate unique backtest ID
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        unique_id = str(uuid.uuid4())[:8]
        backtest_id = f"{timestamp}_{unique_id}"
        
        # Get current user for result association
        user_id = current_user.id
        
        tier = get_user_tier()
        tier_errors = validate_tier_restrictions(
            tier,
            params.get('symbol', ''),
            start_date=params.get('start_date'),
            end_date=params.get('end_date'),
            dte=params.get('dte')
        )
        if tier_errors:
            return jsonify({'error': tier_errors[0]}), 403

        # Check if user already has a running backtest
        for bid, binfo in running_backtests.items():
            if binfo.get('user_id') == user_id and binfo.get('status') == 'running':
                return jsonify({'error': 'You already have a backtest running. Please wait for it to complete or cancel it before starting a new one.'}), 429
        for bid, binfo in running_stock_backtests.items():
            if binfo.get('user_id') == user_id and binfo.get('status') == 'running':
                return jsonify({'error': 'You already have a stock backtest running. Please wait for it to complete or cancel it before starting a new one.'}), 429
        
        print("\n" + "="*60)
        print("ASYNC BACKTEST STARTED")
        print(f"Backtest ID: {backtest_id}")
        print(f"User ID: {user_id}")
        print("="*60 + "\n")
        
        # Create initial metadata with running status
        output_dir = 'backtest_results'
        os.makedirs(output_dir, exist_ok=True)
        
        initial_metadata = {
            'id': backtest_id,
            'timestamp': datetime.now().isoformat(),
            'status': 'running',
            'name': params.get('backtest_name') or params.get('backtestName', ''),
            'config': {
                'backtest_name': params.get('backtest_name') or params.get('backtestName', ''),
                'name': params.get('backtest_name') or params.get('backtestName', ''),
                'symbol': params.get('symbol', 'SPX'),
                'dte': params.get('dte', 0),
                'strategy': params.get('strategy', ''),
                'legs': params.get('legs', []),
                'start_date': params.get('start_date') or params.get('startDate'),
                'end_date': params.get('end_date') or params.get('endDate'),
                'entry_time': params.get('entry_time') or params.get('entryTime', '10:00'),
                'entry_time_max': params.get('entry_time_max') or params.get('entryTimeMax', ''),
                'initial_capital': params.get('starting_capital') or params.get('startingCapital', 100000),
                'allocation_type': params.get('allocation_type') or params.get('allocationType', 'pct'),
                'allocation_value': params.get('allocation_value') or params.get('allocationValue', 10),
                'take_profit_pct': params.get('take_profit_pct') or params.get('takeProfitPct'),
                'take_profit_dollar': params.get('take_profit_dollar') or params.get('takeProfitDollar'),
                'stop_loss_pct': params.get('stop_loss_pct') or params.get('stopLossPct'),
                'stop_loss_dollar': params.get('stop_loss_dollar') or params.get('stopLossDollar'),
                'detection_bar_size': params.get('detection_bar_size') or params.get('detectionBarSize', 1),
                'net_premium_min': params.get('net_premium_min') or params.get('netPremiumMin'),
                'net_premium_max': params.get('net_premium_max') or params.get('netPremiumMax'),
                'avoid_pdt': params.get('avoid_pdt') or params.get('avoidPdt', False),
                'concurrent_trades': params.get('concurrent_trades') or params.get('concurrentTrades', False),
                'allow_skewed_wings': params.get('allow_skewed_wings') or params.get('allowSkewedWings', False),
                'options_entry_type': params.get('options_entry_type') or params.get('optionsEntryType', 'none'),
                'preset_condition': params.get('preset_condition') or params.get('presetCondition', ''),
                'preset_operator': params.get('preset_operator') or params.get('presetOperator', '>'),
                'preset_threshold': params.get('preset_threshold') or params.get('presetThreshold', ''),
                'velocity_lookback': params.get('velocity_lookback') or params.get('velocityLookback', '5'),
                'price_conditions': params.get('price_conditions') or params.get('priceConditions', []),
                'eod_action': params.get('eod_action') or params.get('eodAction', 'close'),
                'trade_frequency': params.get('trade_frequency') or params.get('tradeFrequency', 'daily'),
                'entry_days': params.get('entry_days') or params.get('entryDays', []),
            },
            'summary': {}
        }
        
        metadata_path = os.path.join(output_dir, f'metadata_{backtest_id}.json')
        with open(metadata_path, 'w') as f:
            json.dump(initial_metadata, f, indent=2)
        
        # Save to database for user association
        backtest_record = BacktestResult(
            id=backtest_id,
            user_id=user_id,
            backtest_type='options',
            symbol=params.get('symbol'),
            strategy=params.get('strategy'),
            status='running',
            config_json=json.dumps(params)
        )
        db.session.add(backtest_record)
        db.session.commit()
        
        # Track this backtest
        running_backtests[backtest_id] = {'status': 'running', 'error': None, 'process': None, 'user_id': user_id}
        
        # Run backtest in background thread
        def run_async():
            try:
                result = run_backtester_script_with_id(params, api_key, backtest_id)
                running_backtests[backtest_id]['status'] = 'completed'
                
                # Update metadata with completed status
                # Note: run_backtester_script_with_id already wrote full metadata with config + summary
                # We just need to ensure status is marked completed and summary has avg_win/avg_loss
                try:
                    with open(metadata_path, 'r') as f:
                        metadata = json.load(f)
                    metadata['status'] = 'completed'
                    
                    # If summary is missing avg_win/avg_loss, compute from trade log
                    summary = metadata.get('summary', {})
                    if 'avg_win' not in summary or 'avg_loss' not in summary:
                        trade_log_path = os.path.join(output_dir, f'trade_log_{backtest_id}.csv')
                        if os.path.exists(trade_log_path):
                            try:
                                import csv
                                trades = []
                                with open(trade_log_path, 'r') as csvfile:
                                    reader = csv.DictReader(csvfile)
                                    for row in reader:
                                        trades.append(row)
                                
                                if trades:
                                    total_pnl = sum(float(t.get('pnl', 0) or 0) for t in trades)
                                    initial_cap = params.get('starting_capital', 50000)
                                    winners_list = [t for t in trades if round(float(t.get('pnl', 0) or 0), 2) > 0]
                                    losers_list = [t for t in trades if round(float(t.get('pnl', 0) or 0), 2) < 0]
                                    avg_win_val = round(sum(float(t.get('pnl', 0) or 0) for t in winners_list) / len(winners_list), 2) if winners_list else 0
                                    avg_loss_val = round(sum(float(t.get('pnl', 0) or 0) for t in losers_list) / len(losers_list), 2) if losers_list else 0
                                    
                                    balance = initial_cap
                                    peak = initial_cap
                                    max_dd = 0
                                    total_wins = 0
                                    total_losses = 0
                                    for t in trades:
                                        pnl_val = float(t.get('pnl', 0) or 0)
                                        balance += pnl_val
                                        if pnl_val > 0:
                                            total_wins += pnl_val
                                        else:
                                            total_losses += abs(pnl_val)
                                        if balance > peak:
                                            peak = balance
                                        dd = ((balance - peak) / peak) * 100 if peak > 0 else 0
                                        if dd < max_dd:
                                            max_dd = dd
                                    
                                    metadata['summary'] = {
                                        'total_trades': len(trades),
                                        'winning_trades': len(winners_list),
                                        'losing_trades': len(losers_list),
                                        'win_rate': round(len(winners_list) / len(trades) * 100, 2) if trades else 0,
                                        'total_pnl': round(total_pnl, 2),
                                        'total_return': round((total_pnl / initial_cap) * 100, 2) if initial_cap else 0,
                                        'avg_trade': round(total_pnl / len(trades), 2) if trades else 0,
                                        'avg_win': avg_win_val,
                                        'avg_loss': avg_loss_val,
                                        'max_drawdown': round(max_dd, 2),
                                        'profit_factor': round(total_wins / total_losses, 2) if total_losses > 0 else 0,
                                        'final_capital': round(initial_cap + total_pnl, 2)
                                    }
                            except Exception as csv_err:
                                print(f"Error parsing trade log for summary: {csv_err}")
                    
                    with open(metadata_path, 'w') as f:
                        json.dump(metadata, f, indent=2)
                    
                    # Update database record with results
                    with app.app_context():
                        try:
                            record = BacktestResult.query.get(backtest_id)
                            if record:
                                record.status = 'completed'
                                record.completed_at = datetime.utcnow()
                                summary = metadata.get('summary', {})
                                record.total_pnl = summary.get('total_pnl')
                                record.total_return = summary.get('total_return')
                                record.win_rate = summary.get('win_rate')
                                record.total_trades = summary.get('total_trades')
                                db.session.commit()
                        except Exception as db_err:
                            print(f"Error updating database record: {db_err}")
                except Exception as meta_err:
                    print(f"Error updating metadata: {meta_err}")
                    
            except Exception as e:
                print(f"Async backtest error: {e}")
                running_backtests[backtest_id]['status'] = 'error'
                running_backtests[backtest_id]['error'] = str(e)
                # Update metadata with error
                try:
                    with open(metadata_path, 'r') as f:
                        metadata = json.load(f)
                    metadata['status'] = 'error'
                    metadata['error'] = str(e)
                    with open(metadata_path, 'w') as f:
                        json.dump(metadata, f, indent=2)
                except:
                    pass
                # Update database record with error status
                with app.app_context():
                    try:
                        record = BacktestResult.query.get(backtest_id)
                        if record:
                            record.status = 'failed'
                            db.session.commit()
                    except:
                        pass
        
        thread = threading.Thread(target=run_async)
        thread.start()
        
        return jsonify({
            'backtest_id': backtest_id,
            'status': 'running',
            'message': 'Backtest started'
        })
        
    except Exception as e:
        import traceback
        print(f"\nERROR starting async backtest:")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/backtest/status/<backtest_id>', methods=['GET'])
def get_backtest_status(backtest_id):
    """Get status of a running backtest"""
    # First check in-memory status
    if backtest_id in running_backtests:
        bt_info = running_backtests[backtest_id]
        return jsonify({
            'status': bt_info.get('status'),
            'error': bt_info.get('error'),
            'user_id': bt_info.get('user_id')
        })
    
    # Check metadata file
    metadata_path = os.path.join('backtest_results', f'metadata_{backtest_id}.json')
    if os.path.exists(metadata_path):
        try:
            with open(metadata_path, 'r') as f:
                metadata = json.load(f)
            return jsonify({
                'status': metadata.get('status', 'completed'),
                'error': metadata.get('error')
            })
        except:
            pass
    
    return jsonify({'status': 'not_found', 'error': 'Backtest not found'}), 404


@app.route('/api/backtest/cancel/<backtest_id>', methods=['POST'])
@login_required
def cancel_backtest(backtest_id):
    """Cancel a running backtest by killing its subprocess"""
    import signal
    user_id = current_user.id
    
    # Check options backtests
    if backtest_id in running_backtests:
        bt = running_backtests[backtest_id]
        if bt.get('user_id') != user_id:
            return jsonify({'error': 'Not authorized to cancel this backtest'}), 403
        if bt.get('status') != 'running':
            return jsonify({'error': 'Backtest is not running'}), 400
        
        proc = bt.get('process')
        if proc and proc.poll() is None:
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
        
        bt['status'] = 'cancelled'
        bt['error'] = 'Cancelled by user'
        
        # Update metadata
        metadata_path = os.path.join('backtest_results', f'metadata_{backtest_id}.json')
        if os.path.exists(metadata_path):
            try:
                with open(metadata_path, 'r') as f:
                    metadata = json.load(f)
                metadata['status'] = 'cancelled'
                metadata['error'] = 'Cancelled by user'
                with open(metadata_path, 'w') as f:
                    json.dump(metadata, f, indent=2)
            except:
                pass
        
        # Update database
        try:
            record = BacktestResult.query.get(backtest_id)
            if record:
                record.status = 'cancelled'
                db.session.commit()
        except:
            pass
        
        return jsonify({'status': 'cancelled', 'message': 'Backtest cancelled'})
    
    # Check stock backtests
    if backtest_id in running_stock_backtests:
        bt = running_stock_backtests[backtest_id]
        if bt.get('user_id') != user_id:
            return jsonify({'error': 'Not authorized to cancel this backtest'}), 403
        if bt.get('status') != 'running':
            return jsonify({'error': 'Backtest is not running'}), 400
        
        proc = bt.get('process')
        if proc and proc.poll() is None:
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
        
        bt['status'] = 'cancelled'
        bt['error'] = 'Cancelled by user'
        
        metadata_path = os.path.join('stock_backtest_v3_results', f'{backtest_id}.json')
        if os.path.exists(metadata_path):
            try:
                with open(metadata_path, 'r') as f:
                    metadata = json.load(f)
                metadata['status'] = 'cancelled'
                metadata['error'] = 'Cancelled by user'
                with open(metadata_path, 'w') as f:
                    json.dump(metadata, f, indent=2)
            except:
                pass
        
        try:
            record = BacktestResult.query.get(backtest_id)
            if record:
                record.status = 'cancelled'
                db.session.commit()
        except:
            pass
        
        return jsonify({'status': 'cancelled', 'message': 'Stock backtest cancelled'})
    
    return jsonify({'error': 'Backtest not found or not running'}), 404


@app.route('/api/backtest/running', methods=['GET'])
@login_required
def check_running_backtests():
    """Check if the current user has any running backtests"""
    user_id = current_user.id
    running = []
    
    for bid, binfo in running_backtests.items():
        if binfo.get('user_id') == user_id and binfo.get('status') == 'running':
            running.append({'backtest_id': bid, 'type': 'options'})
    
    for bid, binfo in running_stock_backtests.items():
        if binfo.get('user_id') == user_id and binfo.get('status') == 'running':
            running.append({'backtest_id': bid, 'type': 'stocks'})
    
    # Also check database for running backtests (in case of server restart)
    if not running:
        try:
            db_running = BacktestResult.query.filter_by(user_id=user_id, status='running').all()
            for record in db_running:
                running.append({'backtest_id': record.id, 'type': record.backtest_type or 'options'})
        except:
            pass
    
    return jsonify({
        'has_running': len(running) > 0,
        'running_backtests': running
    })


@app.route('/api/backtest/run', methods=['POST'])
def run_backtest():
    """Run options strategy backtest using the real backtest engine"""
    try:
        params = request.json
        api_key = request.headers.get('X-API-Key', API_KEY)
        
        if not api_key:
            return jsonify({'error': 'API key required'}), 401
        
        print("\n" + "="*60)
        print("BACKTEST REQUEST RECEIVED")
        print("="*60)
        print(f"Symbol: {params.get('symbol')}")
        print(f"Strategy: {params.get('strategy')}")
        print(f"Date Range: {params.get('start_date')} to {params.get('end_date')}")
        print("="*60 + "\n")
        
        # Run the actual Python backtester script
        result = run_backtester_script(params, api_key)
        
        return jsonify(result)
        
    except Exception as e:
        import traceback
        print(f"\nERROR in backtest endpoint:")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/backtests/list', methods=['GET'])
@login_required
def list_backtests():
    """List user's saved options backtests - redirects to user-specific endpoint"""
    try:
        backtests = BacktestResult.query.filter_by(
            user_id=current_user.id,
            backtest_type='options'
        ).order_by(BacktestResult.created_at.desc()).all()
        
        results = []
        for record in backtests:
            metadata_path = os.path.join('backtest_results', f'metadata_{record.id}.json')
            if os.path.exists(metadata_path):
                try:
                    with open(metadata_path, 'r') as f:
                        metadata = json.load(f)
                        metadata['status'] = record.status or 'completed'
                        summary = metadata.get('summary') or {}
                        if 'avg_win' not in summary or 'avg_loss' not in summary:
                            trade_log_path = os.path.join('backtest_results', f'trade_log_{record.id}.csv')
                            if os.path.exists(trade_log_path):
                                try:
                                    import csv as csv_mod
                                    with open(trade_log_path, 'r') as csvf:
                                        reader = csv_mod.DictReader(csvf)
                                        tlog = list(reader)
                                    if tlog:
                                        w = [t for t in tlog if round(float(t.get('pnl', 0) or 0), 2) > 0]
                                        l = [t for t in tlog if round(float(t.get('pnl', 0) or 0), 2) < 0]
                                        summary['avg_win'] = round(sum(float(t.get('pnl', 0) or 0) for t in w) / len(w), 2) if w else 0
                                        summary['avg_loss'] = round(sum(float(t.get('pnl', 0) or 0) for t in l) / len(l), 2) if l else 0
                                        metadata['summary'] = summary
                                except Exception:
                                    pass
                        results.append(metadata)
                except Exception as e:
                    print(f"Error reading metadata for {record.id}: {e}")
                    continue
            elif record.status == 'running':
                config_data = {}
                if record.config_json:
                    try:
                        config_data = json.loads(record.config_json)
                    except:
                        pass
                results.append({
                    'id': record.id,
                    'timestamp': record.created_at.isoformat() if record.created_at else '',
                    'status': 'running',
                    'config': config_data,
                    'summary': {}
                })
        
        results.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
        
        return jsonify({'backtests': results})
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/backtests/<backtest_id>', methods=['DELETE'])
@login_required
def delete_backtest(backtest_id):
    """Delete a backtest and its associated files"""
    try:
        # Check ownership
        record = BacktestResult.query.get(backtest_id)
        if record and record.user_id != current_user.id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        output_dir = 'backtest_results'
        
        # Delete all files associated with this backtest
        files_to_delete = [
            f'metadata_{backtest_id}.json',
            f'trade_log_{backtest_id}.csv',
            f'equity_curve_{backtest_id}.png'
        ]
        
        deleted_files = []
        for filename in files_to_delete:
            filepath = os.path.join(output_dir, filename)
            if os.path.exists(filepath):
                os.remove(filepath)
                deleted_files.append(filename)
        
        # Delete from database
        if record:
            db.session.delete(record)
            db.session.commit()
        
        return jsonify({
            'success': True,
            'deleted_files': deleted_files,
            'backtest_id': backtest_id
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/my/backtests', methods=['GET'])
@login_required
def list_my_backtests():
    """List all backtests for the current authenticated user"""
    try:
        # Get all backtest records for current user from database
        backtests = BacktestResult.query.filter_by(user_id=current_user.id)\
            .order_by(BacktestResult.created_at.desc()).all()
        
        results = []
        for record in backtests:
            result_data = record.to_dict()
            
            # For options backtests, try to get additional data from file
            if record.backtest_type == 'options':
                metadata_path = os.path.join('backtest_results', f'metadata_{record.id}.json')
                if os.path.exists(metadata_path):
                    try:
                        with open(metadata_path, 'r') as f:
                            file_data = json.load(f)
                            result_data['config'] = file_data.get('config', {})
                            result_data['summary'] = file_data.get('summary', {})
                    except:
                        pass
            # For stock backtests, get from their directory
            elif record.backtest_type == 'stocks':
                metadata_path = os.path.join('stock_backtest_v3_results', f'{record.id}.json')
                if os.path.exists(metadata_path):
                    try:
                        with open(metadata_path, 'r') as f:
                            file_data = json.load(f)
                            result_data['config'] = file_data.get('config', {})
                            result_data['summary'] = file_data.get('summary', {})
                    except:
                        pass
            
            results.append(result_data)
        
        return jsonify({'backtests': results})
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/my/backtests/options', methods=['GET'])
@login_required
def list_my_options_backtests():
    """List options backtests for the current authenticated user"""
    try:
        backtests = BacktestResult.query.filter_by(
            user_id=current_user.id, 
            backtest_type='options'
        ).order_by(BacktestResult.created_at.desc()).all()
        
        results = []
        for record in backtests:
            result_data = record.to_dict()
            metadata_path = os.path.join('backtest_results', f'metadata_{record.id}.json')
            if os.path.exists(metadata_path):
                try:
                    with open(metadata_path, 'r') as f:
                        file_data = json.load(f)
                        result_data['config'] = file_data.get('config', {})
                        result_data['summary'] = file_data.get('summary', {})
                except:
                    pass
            results.append(result_data)
        
        return jsonify({'backtests': results})
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/my/backtests/stocks', methods=['GET'])
@login_required
def list_my_stocks_backtests():
    """List stock backtests for the current authenticated user"""
    try:
        backtests = BacktestResult.query.filter_by(
            user_id=current_user.id, 
            backtest_type='stocks'
        ).order_by(BacktestResult.created_at.desc()).all()
        
        results = []
        for record in backtests:
            result_data = record.to_dict()
            metadata_path = os.path.join('stock_backtest_v3_results', f'{record.id}.json')
            if os.path.exists(metadata_path):
                try:
                    with open(metadata_path, 'r') as f:
                        file_data = json.load(f)
                        result_data['config'] = file_data.get('config', {})
                        result_data['summary'] = file_data.get('summary', {})
                except:
                    pass
            results.append(result_data)
        
        return jsonify({'backtests': results})
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/files/equity-curve/<backtest_id>', methods=['GET'])
@login_required
def get_equity_curve(backtest_id):
    """Serve equity curve PNG file (ownership verified)"""
    try:
        # Verify ownership
        record = BacktestResult.query.get(backtest_id)
        if not record or record.user_id != current_user.id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        filename = f'equity_curve_{backtest_id}.png'
        filepath = os.path.join('backtest_results', filename)
        
        if not os.path.exists(filepath):
            return jsonify({'error': 'Equity curve not found'}), 404
        
        return send_file(filepath, mimetype='image/png')
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/files/trade-log/<backtest_id>', methods=['GET'])
@login_required
def get_trade_log(backtest_id):
    """Serve trade log CSV file (ownership verified)"""
    try:
        # Verify ownership
        record = BacktestResult.query.get(backtest_id)
        if not record or record.user_id != current_user.id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        filename = f'trade_log_{backtest_id}.csv'
        filepath = os.path.join('backtest_results', filename)
        
        if not os.path.exists(filepath):
            return jsonify({'error': 'Trade log not found'}), 404
        
        return send_file(filepath, mimetype='text/csv', as_attachment=False)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/files/metadata/<backtest_id>', methods=['GET'])
@login_required
def get_metadata(backtest_id):
    """Serve metadata JSON file (ownership verified)"""
    try:
        # Verify ownership
        record = BacktestResult.query.get(backtest_id)
        if not record or record.user_id != current_user.id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        filename = f'metadata_{backtest_id}.json'
        filepath = os.path.join('backtest_results', filename)
        
        if not os.path.exists(filepath):
            return jsonify({'error': 'Metadata not found'}), 404
        
        with open(filepath, 'r') as f:
            metadata = json.load(f)
        
        summary = metadata.get('summary') or {}
        if 'avg_win' not in summary or 'avg_loss' not in summary:
            trade_log_path = os.path.join('backtest_results', f'trade_log_{backtest_id}.csv')
            if os.path.exists(trade_log_path):
                try:
                    import csv as csv_mod
                    with open(trade_log_path, 'r') as csvf:
                        reader = csv_mod.DictReader(csvf)
                        tlog = list(reader)
                    if tlog:
                        w = [t for t in tlog if round(float(t.get('pnl', 0) or 0), 2) > 0]
                        l = [t for t in tlog if round(float(t.get('pnl', 0) or 0), 2) < 0]
                        summary['avg_win'] = round(sum(float(t.get('pnl', 0) or 0) for t in w) / len(w), 2) if w else 0
                        summary['avg_loss'] = round(sum(float(t.get('pnl', 0) or 0) for t in l) / len(l), 2) if l else 0
                        metadata['summary'] = summary
                except Exception:
                    pass
        
        return jsonify(metadata)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def run_backtester_script(config, api_key):
    """
    Execute the backtest_wrapper.py script with config
    Returns results in format expected by frontend
    """
    import subprocess
    import json
    import tempfile
    import os
    import csv as csv_module
    import uuid
    from datetime import datetime
    import base64
    
    # Generate unique backtest ID
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    unique_id = str(uuid.uuid4())[:8]
    backtest_id = f"{timestamp}_{unique_id}"
    
    print(f"\n{'='*60}")
    print(f"  Generated Backtest ID: {backtest_id}")
    print(f"{'='*60}\n")
    
    # Create temp file with config
    config_file = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
    json.dump(config, config_file)
    config_file.close()
    
    try:
        # Set API key in environment
        env = os.environ.copy()
        env['POLYGON_API_KEY'] = api_key
        
        # Run the Python script with config file AND backtest ID
        script_path = os.path.join(os.path.dirname(__file__), 'backtest_wrapper.py')
        
        print(f"  Running backtest script: {script_path}")
        print(f"  Config file: {config_file.name}")
        print(f"  Backtest ID: {backtest_id}")
        
        process = subprocess.Popen(
            ['python3', script_path, '--config', config_file.name, '--id', backtest_id],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,  # Capture both stdout and stderr
            text=True
        )
        
        # Stream output in real-time
        output_lines = []
        for line in iter(process.stdout.readline, ''):
            if line:
                print(line.rstrip())
                output_lines.append(line.rstrip())
        
        process.wait(timeout=600)  # 10 minute timeout
        
        if process.returncode != 0:
            # Show last 20 lines of output for debugging
            error_context = '\n'.join(output_lines[-20:]) if output_lines else 'No output captured'
            raise Exception(
                f"Backtest script failed with return code {process.returncode}\n\n"
                f"Last 20 lines of output:\n{error_context}"
            )
        
        # Parse output to get results - use backtest_id in filename
        output_dir = 'backtest_results'
        csv_path = os.path.join(output_dir, f'trade_log_{backtest_id}.csv')
        png_path = os.path.join(output_dir, f'equity_curve_{backtest_id}.png')
        
        # List all files in output directory for debugging
        if os.path.exists(output_dir):
            print(f"\n  Files in {output_dir}:")
            for f in os.listdir(output_dir):
                print(f"    - {f}")
        
        if not os.path.exists(csv_path):
            # Check if "No trades executed" was in output
            no_trades_output = any('No trades executed' in line for line in output_lines)
            
            if no_trades_output:
                # Extract key information from terminal output
                error_lines = []
                
                # Extract symbol and price
                for line in output_lines:
                    if 'SPX:' in line or 'SPY:' in line:
                        # Extract just the symbol and price line
                        match = re.search(r'\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\].*?(SPX|SPY):\s*([\d.]+)', line)
                        if match:
                            error_lines.append(f"{match.group(2)}: {match.group(3)}")
                            error_lines.append(f"{match.group(1)}")
                            break
                
                # Extract leg strike information
                for line in output_lines:
                    if 'Strike' in line and ':' in line:
                        # Extract leg name and strike
                        match = re.search(r'(Short Put|Long Put|Short Call|Long Call):\s*Strike\s*([\d.]+)', line)
                        if match:
                            error_lines.append(f"{match.group(1)}: Strike {match.group(2)}")
                
                # Extract skip/error reasons
                for line in output_lines:
                    if 'SKIPPING' in line or '❌' in line:
                        error_lines.append(line.strip())
                
                # Build concise error message
                if error_lines:
                    error_msg = "No trades executed.\n\n" + "\n".join(error_lines[:10])
                else:
                    # Fallback: show last 10 lines
                    error_msg = "No trades executed.\n\nLast lines from terminal:\n"
                    for line in output_lines[-10:]:
                        if line.strip():
                            error_msg += f"{line}\n"
                
                raise Exception(error_msg)
            
            # More helpful error message for missing CSV
            available_csvs = [f for f in os.listdir(output_dir) if f.startswith('trade_log_') and f.endswith('.csv')]
            error_msg = f"Trade log CSV not found at {csv_path}"
            if available_csvs:
                error_msg += f"\n  Available CSV files: {', '.join(available_csvs)}"
            else:
                error_msg += "\n  No trade log CSV files found in output directory!"
            raise Exception(error_msg)
        
        print(f"\n  Reading trade log from: {csv_path}")
        
        # Read CSV and parse results
        trades = []
        with open(csv_path, 'r') as f:
            reader = csv_module.DictReader(f)
            for row in reader:
                # Parse legs
                legs = []
                leg_num = 1
                while f'leg{leg_num}_symbol' in row and row[f'leg{leg_num}_symbol']:
                    # Try both column names for backward compatibility
                    exit_price_col = f'leg{leg_num}_exit_price' if f'leg{leg_num}_exit_price' in row else f'leg{leg_num}_close'
                    
                    legs.append({
                        'symbol': row[f'leg{leg_num}_symbol'],
                        'name': row[f'leg{leg_num}_name'],
                        'strike': float(row[f'leg{leg_num}_strike']),
                        'entry_price': float(row[f'leg{leg_num}_entry_price']),
                        'exit_price': float(row[exit_price_col])
                    })
                    leg_num += 1
                
                # Read any indicator snapshot columns (SMA/EMA/VWAP values at entry)
                known_fields = {
                    'entry_date','entry_time','entry_timestamp','underlying_price',
                    'exit_date','exit_time','exit_timestamp','underlying_exit_price',
                    'strategy','num_contracts','net_premium_entry','net_premium_exit',
                    'max_risk','pnl','exit_reason','dte','dit','capital_before','capital_after'
                }
                indicator_snapshot = {}
                for col, val in row.items():
                    if col and val and col not in known_fields and not col.startswith('leg') and val.strip():
                        try:
                            indicator_snapshot[col] = float(val)
                        except (ValueError, TypeError):
                            pass

                trades.append({
                    'entry_date': row['entry_date'],
                    'entry_time': row['entry_time'],
                    'entry_timestamp': row['entry_timestamp'],
                    'underlying_price': float(row['underlying_price']),
                    'exit_date': row['exit_date'],
                    'exit_time': row['exit_time'],
                    'exit_timestamp': row['exit_timestamp'],
                    'underlying_exit_price': float(row['underlying_exit_price']),
                    'strategy': row['strategy'],
                    'num_contracts': int(row['num_contracts']),
                    'net_premium_entry': float(row['net_premium_entry']),
                    'net_premium_exit': float(row['net_premium_exit']),
                    'max_risk': None if row['max_risk'] == 'N/A' else float(row['max_risk']),
                    'pnl': float(row['pnl']),
                    'exit_reason': row['exit_reason'],
                    'dte': int(row['dte']),
                    'dit': float(row['dit']),
                    'capital_before': float(row['capital_before']),
                    'capital_after': float(row['capital_after']),
                    'indicator_snapshot': indicator_snapshot,
                    'legs': legs
                })
        
        print(f"  Parsed {len(trades)} trades from CSV")
        
        # Calculate statistics
        if trades:
            total_trades = len(trades)
            winners = [t for t in trades if round(t['pnl'], 2) > 0]
            losers = [t for t in trades if round(t['pnl'], 2) < 0]
            breakevens = [t for t in trades if round(t['pnl'], 2) == 0]

            total_pnl = sum(t['pnl'] for t in trades)
            win_rate = len(winners) / total_trades * 100 if total_trades > 0 else 0
            avg_win = sum(t['pnl'] for t in winners) / len(winners) if winners else 0
            avg_loss = sum(t['pnl'] for t in losers) / len(losers) if losers else 0
            avg_win_per_contract = (
                sum(t['pnl'] / t['num_contracts'] for t in winners) / len(winners)
            ) if winners else 0
            avg_loss_per_contract = (
                sum(t['pnl'] / t['num_contracts'] for t in losers) / len(losers)
            ) if losers else 0

            gross_profit = sum(t['pnl'] for t in winners) if winners else 0
            gross_loss = abs(sum(t['pnl'] for t in losers)) if losers else 0
            profit_factor = gross_profit / gross_loss if gross_loss > 0 else float('inf')
            
            # Calculate max drawdown
            max_dd = 0
            peak = config['starting_capital']
            for t in trades:
                peak = max(peak, t['capital_after'])
                dd = (t['capital_after'] - peak) / peak * 100
                max_dd = min(max_dd, dd)
            
            final_capital = trades[-1]['capital_after']
            total_return = (final_capital - config['starting_capital']) / config['starting_capital'] * 100
            
            # Build equity curve
            equity_curve = [{'trade': 0, 'capital': config['starting_capital']}]
            for i, t in enumerate(trades):
                equity_curve.append({
                    'trade': i + 1,
                    'capital': t['capital_after']
                })
        else:
            total_trades = 0
            win_rate = 0
            total_pnl = 0
            avg_win = 0
            avg_loss = 0
            avg_win_per_contract = 0
            avg_loss_per_contract = 0
            profit_factor = 0
            max_dd = 0
            total_return = 0
            equity_curve = []
        
        # Read CSV data for download
        with open(csv_path, 'r') as f:
            csv_data = f.read()
        
        # Read equity curve image if it exists
        equity_curve_base64 = None
        if os.path.exists(png_path):
            try:
                with open(png_path, 'rb') as f:
                    image_bytes = f.read()
                    equity_curve_base64 = base64.b64encode(image_bytes).decode('utf-8')
                print(f"  ✓ Equity curve image loaded: {png_path}")
                print(f"    Image size: {len(image_bytes)} bytes")
                print(f"    Base64 length: {len(equity_curve_base64)} characters")
            except Exception as e:
                print(f"  ✗ Error reading equity curve image: {e}")
                equity_curve_base64 = None
        else:
            print(f"  ⚠️  WARNING: Equity curve image not found at {png_path}")
        
        # Save backtest metadata for history
        metadata = {
            'id': backtest_id,
            'timestamp': datetime.now().isoformat(),
            'name': config.get('backtest_name') or config.get('backtestName', ''),  # Match stock backtest format
            'config': {
                'backtest_name': config.get('backtest_name') or config.get('backtestName', ''),
                'name': config.get('backtest_name') or config.get('backtestName', ''),
                'symbol': config.get('symbol', 'SPX'),
                'dte': config.get('dte', 0),
                'strategy': config.get('strategy', ''),
                'legs': config.get('legs', []),
                'start_date': config.get('start_date') or config.get('startDate'),
                'end_date': config.get('end_date') or config.get('endDate'),
                'entry_time': config.get('entry_time') or config.get('entryTime', '10:00'),
                'entry_time_max': config.get('entry_time_max') or config.get('entryTimeMax', ''),
                'initial_capital': config.get('starting_capital') or config.get('startingCapital', 100000),
                'allocation_type': config.get('allocation_type') or config.get('allocationType', 'pct'),
                'allocation_value': config.get('allocation_value') or config.get('allocationValue', 10),
                'take_profit_pct': config.get('take_profit_pct') or config.get('takeProfitPct'),
                'take_profit_dollar': config.get('take_profit_dollar') or config.get('takeProfitDollar'),
                'stop_loss_pct': config.get('stop_loss_pct') or config.get('stopLossPct'),
                'stop_loss_dollar': config.get('stop_loss_dollar') or config.get('stopLossDollar'),
                'detection_bar_size': config.get('detection_bar_size') or config.get('detectionBarSize', 1),
                'net_premium_min': config.get('net_premium_min') or config.get('netPremiumMin'),
                'net_premium_max': config.get('net_premium_max') or config.get('netPremiumMax'),
                'avoid_pdt': config.get('avoid_pdt') or config.get('avoidPdt', False),
                'concurrent_trades': config.get('concurrent_trades') or config.get('concurrentTrades', False),
                'allow_skewed_wings': config.get('allow_skewed_wings') or config.get('allowSkewedWings', False),
                'options_entry_type': config.get('options_entry_type') or config.get('optionsEntryType', 'none'),
                'preset_condition': config.get('preset_condition') or config.get('presetCondition', ''),
                'preset_operator': config.get('preset_operator') or config.get('presetOperator', '>'),
                'preset_threshold': config.get('preset_threshold') or config.get('presetThreshold', ''),
                'velocity_lookback': config.get('velocity_lookback') or config.get('velocityLookback', '5'),
                'price_conditions': config.get('price_conditions') or config.get('priceConditions', []),
                'eod_action': config.get('eod_action') or config.get('eodAction', 'close'),
                'trade_frequency': config.get('trade_frequency') or config.get('tradeFrequency', 'daily'),
                'entry_days': config.get('entry_days') or config.get('entryDays', []),
            },
            'summary': {
                'total_trades': total_trades,
                'win_rate': win_rate,
                'total_pnl': total_pnl,
                'total_return': total_return,
                'max_drawdown': max_dd,
                'profit_factor': profit_factor if profit_factor != float('inf') else 999.99,
                'avg_win': avg_win if avg_win != float('inf') else 0,
                'avg_loss': avg_loss if avg_loss != float('inf') else 0,
                'avg_win_per_contract': round(avg_win_per_contract, 2),
                'avg_loss_per_contract': round(avg_loss_per_contract, 2),
                'final_capital': (config.get('starting_capital') or config.get('startingCapital', 100000)) + total_pnl
            },
            'files': {
                'csv': f'trade_log_{backtest_id}.csv',
                'image': f'equity_curve_{backtest_id}.png'
            }
        }
        
        # Log what we captured for debugging
        print(f"\n{'='*60}")
        print(f"METADATA CAPTURED:")
        print(f"{'='*60}")
        for key, value in metadata['config'].items():
            if key == 'legs':
                print(f"  {key}: {json.dumps(value, indent=4)}")
            else:
                print(f"  {key}: {value}")
        print(f"{'='*60}\n")
        
        # Load decision log if it exists
        dl_path = os.path.join(output_dir, f'decision_log_{backtest_id}.json')
        decision_log_data = []
        if os.path.exists(dl_path):
            try:
                with open(dl_path, 'r') as f:
                    decision_log_data = json.load(f)
                print(f"  ✅ Decision log loaded: {len(decision_log_data)} days")
            except Exception as e:
                print(f"  ⚠️ Error loading decision log: {e}")
        
        metadata['decision_log'] = decision_log_data
        
        metadata_path = os.path.join(output_dir, f'metadata_{backtest_id}.json')
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        print(f"  ✅ Metadata saved: {metadata_path}")
        
        print(f"\n  Backtest completed successfully!")
        print(f"  Backtest ID: {backtest_id}")
        print(f"  Total trades: {total_trades}")
        print(f"  Win rate: {win_rate:.1f}%")
        print(f"  Total P&L: ${total_pnl:,.2f}\n")
        
        return {
            'status': 'completed',
            'backtest_id': backtest_id,
            'total_trades': total_trades,
            'win_rate': win_rate,
            'total_pnl': total_pnl,
            'avg_win': avg_win,
            'avg_loss': avg_loss,
            'avg_win_per_contract': round(avg_win_per_contract, 2),
            'avg_loss_per_contract': round(avg_loss_per_contract, 2),
            'profit_factor': profit_factor if profit_factor != float('inf') else 999.99,
            'max_drawdown': max_dd,
            'total_return': total_return,
            'equity_curve': equity_curve,
            'equity_curve_image': equity_curve_base64,
            'trades': trades,
            'csv_data': csv_data
        }
    
    finally:
        # Cleanup temp file
        try:
            os.unlink(config_file.name)
        except:
            pass


def run_backtester_script_with_id(config, api_key, backtest_id):
    """
    Execute the backtest_wrapper.py script with config using provided backtest_id.
    Updates metadata file with final results when complete.
    """
    import subprocess
    import json as json_module
    import tempfile
    import os as os_module
    import csv as csv_module
    import base64 as base64_module
    
    output_dir = 'backtest_results'
    os_module.makedirs(output_dir, exist_ok=True)
    
    print(f"\n{'='*60}")
    print(f"  Running Backtest ID: {backtest_id}")
    print(f"{'='*60}\n")
    
    # Create temp file with config
    config_file = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
    json_module.dump(config, config_file)
    config_file.close()
    
    try:
        # Set API key in environment
        env = os_module.environ.copy()
        env['POLYGON_API_KEY'] = api_key
        
        # Run the Python script with config file AND backtest ID
        script_path = os_module.path.join(os_module.path.dirname(__file__), 'backtest_wrapper.py')
        
        process = subprocess.Popen(
            ['python3', script_path, '--config', config_file.name, '--id', backtest_id],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True
        )
        
        # Store process reference for cancel support
        if backtest_id in running_backtests:
            running_backtests[backtest_id]['process'] = process
        
        output_lines = []
        for line in iter(process.stdout.readline, ''):
            if line:
                print(line.rstrip())
                output_lines.append(line.rstrip())
        
        process.wait(timeout=600)
        
        if process.returncode != 0:
            error_context = '\n'.join(output_lines[-20:]) if output_lines else 'No output captured'
            raise Exception(f"Backtest script failed: {error_context}")
        
        # Update metadata to completed status and add decision log
        metadata_path = os_module.path.join(output_dir, f'metadata_{backtest_id}.json')
        if os_module.path.exists(metadata_path):
            with open(metadata_path, 'r') as f:
                metadata = json_module.load(f)
            metadata['status'] = 'completed'
            
            dl_path = os_module.path.join(output_dir, f'decision_log_{backtest_id}.json')
            if os_module.path.exists(dl_path):
                try:
                    with open(dl_path, 'r') as f:
                        metadata['decision_log'] = json_module.load(f)
                except Exception:
                    metadata['decision_log'] = []
            
            with open(metadata_path, 'w') as f:
                json_module.dump(metadata, f, indent=2)
        
        return {'status': 'completed', 'backtest_id': backtest_id}
        
    finally:
        try:
            os_module.unlink(config_file.name)
        except:
            pass


# ============================================================================
# STOCK BACKTESTER V3.0 ROUTES
# ============================================================================

@app.route('/api/stocks-backtest-v3/run', methods=['POST'])
def run_stocks_backtest_v3():
    """Run a stock backtest using V3.0 engine"""
    try:
        # Get configuration from request
        config = request.json
        
        # Get API key
        api_key = request.headers.get('X-API-Key') or API_KEY
        
        if not api_key:
            return jsonify({'error': 'API key required'}), 401
        
        # Check if V3 wrapper is available
        if not STOCKS_V3_WRAPPER_AVAILABLE:
            return jsonify({
                'error': 'Stocks V3 backtester not available. Missing stock_backtester_v3_wrapper.py'
            }), 503
        
        # Initialize wrapper if needed
        global stocks_v3_wrapper
        if stocks_v3_wrapper is None:
            stocks_v3_wrapper = StockBacktesterV3Wrapper(api_key, output_dir='stock_backtest_v3_results')
        
        print(f"\n{'='*60}")
        print(f"STOCKS BACKTEST V3.0 REQUEST RECEIVED")
        print(f"{'='*60}")
        print(f"Name: {config.get('name', 'Unnamed')}")
        print(f"Date Range: {config.get('start_date')} to {config.get('end_date')}")
        print(f"Symbols: {config.get('symbol_mode')} mode")
        print(f"Entry Type: {config.get('entry_type')}")
        print(f"{'='*60}\n")
        
        # Run the backtest
        results = stocks_v3_wrapper.run_backtest(config)
        
        if results['status'] == 'error':
            return jsonify(results), 500
        
        # Return just the backtest ID initially
        return jsonify({
            'backtest_id': results['backtest_id'],
            'status': 'completed'
        })
    
    except Exception as e:
        print(f"\nERROR in stocks V3 backtest endpoint:")
        print(f"  {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/stocks-backtest-v3/start', methods=['POST'])
@login_required
def start_stocks_backtest_v3_async():
    """Start stock backtest asynchronously - returns immediately with backtest_id"""
    try:
        config = request.json
        api_key = request.headers.get('X-API-Key') or API_KEY
        
        if not api_key:
            return jsonify({'error': 'API key required'}), 401
        
        if not STOCKS_V3_WRAPPER_AVAILABLE:
            return jsonify({
                'error': 'Stocks V3 backtester not available'
            }), 503
        
        # Generate unique backtest ID
        unique_id = str(uuid.uuid4())[:8]
        
        # Get current user for result association
        user_id = current_user.id
        
        tier = get_user_tier()
        symbols_raw = config.get('symbol', config.get('symbols', ''))
        primary_symbol = symbols_raw.split(',')[0].strip() if isinstance(symbols_raw, str) else str(symbols_raw)
        tier_errors = validate_tier_restrictions(
            tier,
            primary_symbol,
            start_date=config.get('start_date'),
            end_date=config.get('end_date')
        )
        restrictions = TIER_RESTRICTIONS.get(tier, TIER_RESTRICTIONS['free'])
        if not restrictions.get('allow_multiple_symbols') and config.get('symbol_mode') == 'multiple':
            tier_errors.append('Multiple symbols are not available on your plan.')
        if not restrictions.get('allow_csv') and config.get('symbol_mode') == 'csv':
            tier_errors.append('CSV upload is not available on your plan.')
        if tier_errors:
            return jsonify({'error': tier_errors[0]}), 403

        # Check if user already has a running backtest
        for bid, binfo in running_backtests.items():
            if binfo.get('user_id') == user_id and binfo.get('status') == 'running':
                return jsonify({'error': 'You already have an options backtest running. Please wait for it to complete or cancel it before starting a new one.'}), 429
        for bid, binfo in running_stock_backtests.items():
            if binfo.get('user_id') == user_id and binfo.get('status') == 'running':
                return jsonify({'error': 'You already have a stock backtest running. Please wait for it to complete or cancel it before starting a new one.'}), 429
        
        print(f"\n{'='*60}")
        print(f"STOCK BACKTEST V3.0 - STARTING ASYNC")
        print(f"{'='*60}")
        print(f"Backtest ID: {unique_id}")
        print(f"User ID: {user_id}")
        print(f"Name: {config.get('name', 'Unnamed')}")
        print(f"Date Range: {config.get('start_date')} to {config.get('end_date')}")
        print(f"{'='*60}\n")
        
        # Create initial metadata with running status
        output_dir = 'stock_backtest_v3_results'
        os.makedirs(output_dir, exist_ok=True)
        
        initial_metadata = {
            'backtest_id': unique_id,
            'timestamp': datetime.now().isoformat(),
            'status': 'running',
            'config': config
        }
        
        metadata_path = os.path.join(output_dir, f'{unique_id}.json')
        with open(metadata_path, 'w') as f:
            json.dump(initial_metadata, f, indent=2)
        
        # Save to database for user association
        symbols = config.get('symbols', [])
        symbol_str = symbols[0] if isinstance(symbols, list) and symbols else config.get('symbol', 'Multiple')
        backtest_record = BacktestResult(
            id=unique_id,
            user_id=user_id,
            backtest_type='stocks',
            symbol=symbol_str,
            strategy=config.get('name', 'Stock Backtest'),
            status='running',
            config_json=json.dumps(config)
        )
        db.session.add(backtest_record)
        db.session.commit()
        
        # Track this backtest
        running_stock_backtests[unique_id] = {'status': 'running', 'error': None, 'process': None, 'user_id': user_id}
        
        # Initialize wrapper
        global stocks_v3_wrapper
        if stocks_v3_wrapper is None:
            stocks_v3_wrapper = StockBacktesterV3Wrapper(api_key, output_dir='stock_backtest_v3_results')
        
        # Run backtest in background thread
        def run_async():
            try:
                print(f"\n{'='*60}")
                print(f"STOCK BACKTEST V3.0 - RUNNING IN BACKGROUND")
                print(f"Backtest ID: {unique_id}")
                print(f"{'='*60}\n")
                
                # Run the backtest with a specific ID
                result = stocks_v3_wrapper.run_backtest_with_id(config, unique_id)
                
                if result.get('status') == 'error':
                    running_stock_backtests[unique_id] = {'status': 'error', 'error': result.get('error', 'Unknown error')}
                    # Update database record with error
                    with app.app_context():
                        try:
                            record = BacktestResult.query.get(unique_id)
                            if record:
                                record.status = 'failed'
                                db.session.commit()
                        except:
                            pass
                else:
                    running_stock_backtests[unique_id] = {'status': 'completed', 'error': None}
                    # Update database record with completed status
                    with app.app_context():
                        try:
                            record = BacktestResult.query.get(unique_id)
                            if record:
                                record.status = 'completed'
                                record.completed_at = datetime.utcnow()
                                # Try to get summary from result
                                summary = result.get('summary', {})
                                record.total_pnl = summary.get('total_pnl')
                                record.total_return = summary.get('total_return')
                                record.win_rate = summary.get('win_rate')
                                record.total_trades = summary.get('total_trades')
                                db.session.commit()
                        except Exception as db_err:
                            print(f"Error updating stock backtest database record: {db_err}")
                
                print(f"\n{'='*60}")
                print(f"STOCK BACKTEST COMPLETE: {unique_id}")
                print(f"Status: {running_stock_backtests[unique_id]['status']}")
                print(f"{'='*60}\n")
                
            except Exception as e:
                print(f"Async stock backtest error: {e}")
                import traceback
                traceback.print_exc()
                running_stock_backtests[unique_id] = {'status': 'error', 'error': str(e)}
                
                # Update metadata with error
                try:
                    with open(metadata_path, 'r') as f:
                        metadata = json.load(f)
                    metadata['status'] = 'error'
                    metadata['error'] = str(e)
                    with open(metadata_path, 'w') as f:
                        json.dump(metadata, f, indent=2)
                except:
                    pass
                # Update database record with error status
                with app.app_context():
                    try:
                        record = BacktestResult.query.get(unique_id)
                        if record:
                            record.status = 'failed'
                            db.session.commit()
                    except:
                        pass
        
        thread = threading.Thread(target=run_async)
        thread.start()
        
        return jsonify({
            'backtest_id': unique_id,
            'status': 'running',
            'config': config,
            'message': 'Backtest started'
        })
        
    except Exception as e:
        import traceback
        print(f"\nERROR starting async stock backtest:")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/stocks-backtest-v3/status/<backtest_id>', methods=['GET'])
def get_stocks_backtest_v3_status(backtest_id):
    """Get status of a running stock backtest"""
    # First check in-memory status
    if backtest_id in running_stock_backtests:
        return jsonify(running_stock_backtests[backtest_id])
    
    # Check metadata file
    metadata_path = os.path.join('stock_backtest_v3_results', f'{backtest_id}.json')
    if os.path.exists(metadata_path):
        try:
            with open(metadata_path, 'r') as f:
                metadata = json.load(f)
            return jsonify({
                'status': metadata.get('status', 'completed'),
                'error': metadata.get('error')
            })
        except:
            pass
    
    return jsonify({'status': 'not_found', 'error': 'Backtest not found'}), 404


@app.route('/api/stocks-backtest-v3/results/<backtest_id>', methods=['GET'])
@login_required
def get_stocks_backtest_v3_results(backtest_id):
    """Get results for a specific stocks V3 backtest (ownership verified)"""
    try:
        # Verify ownership
        record = BacktestResult.query.get(backtest_id)
        if not record or record.user_id != current_user.id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        print(f"\n{'='*60}")
        print(f"API: GET RESULTS REQUEST")
        print(f"{'='*60}")
        print(f"Backtest ID: {backtest_id}")
        
        # Check if V3 wrapper is available
        if not STOCKS_V3_WRAPPER_AVAILABLE:
            return jsonify({
                'error': 'Stocks V3 backtester not available'
            }), 503
        
        # Initialize wrapper if needed (with dummy API key since we're just reading files)
        global stocks_v3_wrapper
        if stocks_v3_wrapper is None:
            print("Initializing wrapper for results retrieval...")
            stocks_v3_wrapper = StockBacktesterV3Wrapper('dummy_key', output_dir='stock_backtest_v3_results')
        
        # Get results (doesn't need API key - just reads local files)
        print("Calling wrapper.get_results()...")
        results = stocks_v3_wrapper.get_results(backtest_id)
        
        print(f"Results retrieved. Keys: {list(results.keys())}")
        print(f"Has stats? {'stats' in results}")
        print(f"Stats keys: {list(results.get('stats', {}).keys()) if 'stats' in results else 'N/A'}")
        print(f"{'='*60}\n")
        
        return jsonify(results)
    
    except FileNotFoundError as e:
        print(f"ERROR: File not found - {str(e)}")
        return jsonify({'error': str(e)}), 404
    
    except Exception as e:
        print(f"\nERROR retrieving stocks V3 backtest results:")
        print(f"  {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/stocks-backtest-v3/list', methods=['GET'])
@login_required
def list_stocks_backtests_v3():
    """List user's stocks V3 backtests"""
    try:
        # Get user's stock backtests from database
        records = BacktestResult.query.filter_by(
            user_id=current_user.id,
            backtest_type='stocks'
        ).order_by(BacktestResult.created_at.desc()).all()
        
        backtests = []
        output_dir = 'stock_backtest_v3_results'
        
        for record in records:
            backtest_id = record.id
            filepath = os.path.join(output_dir, f'{backtest_id}.json')
            
            if os.path.exists(filepath):
                try:
                    with open(filepath, 'r') as f:
                        data = json.load(f)
                    
                    summary = data.get('summary', {})
                    meta = data.get('metadata', {})
                    config = data.get('config', {})

                    if not summary or not summary.get('total_pnl') and summary.get('total_pnl') != 0:
                        raw_trades = data.get('trades', [])
                        if raw_trades:
                            starting_capital = config.get('starting_capital', 50000)
                            total_pnl = sum(float(t.get('pnl', 0) or 0) for t in raw_trades)
                            winners = [t for t in raw_trades if round(float(t.get('pnl', 0) or 0), 2) > 0]
                            losers = [t for t in raw_trades if round(float(t.get('pnl', 0) or 0), 2) < 0]
                            total_wins_val = sum(float(t.get('pnl', 0)) for t in winners)
                            total_losses_val = abs(sum(float(t.get('pnl', 0)) for t in losers))
                            n = len(raw_trades)
                            balance = starting_capital
                            peak = starting_capital
                            max_dd_val = 0
                            for t in raw_trades:
                                balance += float(t.get('pnl', 0) or 0)
                                if balance > peak:
                                    peak = balance
                                dd_val = ((balance - peak) / peak * 100) if peak > 0 else 0
                                if dd_val < max_dd_val:
                                    max_dd_val = dd_val
                            summary = {
                                'total_trades': n,
                                'win_rate': round(len(winners) / n * 100, 2) if n else 0,
                                'total_pnl': round(total_pnl, 2),
                                'total_return': round((total_pnl / starting_capital) * 100, 2) if starting_capital else 0,
                                'avg_win': round(total_wins_val / len(winners), 2) if winners else 0,
                                'avg_loss': round(total_losses_val / len(losers), 2) if losers else 0,
                                'profit_factor': round(total_wins_val / total_losses_val, 2) if total_losses_val > 0 else 0,
                                'max_drawdown': round(max_dd_val, 2)
                            }
                        elif meta:
                            summary = meta

                    backtests.append({
                        'id': backtest_id,
                        'name': config.get('name', 'Unnamed'),
                        'timestamp': record.created_at.isoformat() if record.created_at else '',
                        'total_trades': summary.get('total_trades', meta.get('total_trades', 0)),
                        'symbol_count': meta.get('symbol_count', 0),
                        'config': config,
                        'summary': summary,
                        'status': record.status or 'completed'
                    })
                except Exception as e:
                    print(f"Error reading {backtest_id}.json: {e}")
                    continue
            elif record.status == 'running':
                config_data = {}
                if record.config_json:
                    try:
                        config_data = json.loads(record.config_json)
                    except:
                        pass
                backtests.append({
                    'id': backtest_id,
                    'name': config_data.get('name', 'Processing...'),
                    'timestamp': record.created_at.isoformat() if record.created_at else '',
                    'total_trades': 0,
                    'symbol_count': 0,
                    'config': config_data,
                    'summary': {},
                    'status': 'running'
                })
        
        return jsonify({'backtests': backtests})
    
    except Exception as e:
        print(f"\nERROR listing stocks V3 backtests:")
        print(f"  {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/stocks-backtest-v3/<backtest_id>', methods=['DELETE'])
@login_required
def delete_stocks_backtest_v3(backtest_id):
    """Delete a stocks V3 backtest (ownership verified)"""
    try:
        # Verify ownership
        record = BacktestResult.query.get(backtest_id)
        if not record or record.user_id != current_user.id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        output_dir = 'stock_backtest_v3_results'
        
        # Delete all files associated with this backtest
        files_deleted = 0
        
        for filename in os.listdir(output_dir):
            if filename.startswith(backtest_id):
                filepath = os.path.join(output_dir, filename)
                os.remove(filepath)
                files_deleted += 1
        
        # Delete database record
        db.session.delete(record)
        db.session.commit()
        
        if files_deleted == 0:
            return jsonify({'error': 'Backtest not found'}), 404
        
        return jsonify({
            'message': f'Deleted {files_deleted} files',
            'backtest_id': backtest_id
        })
    
    except Exception as e:
        print(f"\nERROR deleting stocks V3 backtest:")
        print(f"  {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/dashboard/top-backtests', methods=['GET'])
def get_dashboard_top_backtests():
    """Get top backtest results for dashboard display"""
    try:
        results = {
            'options_backtests': [],
            'stock_backtests': []
        }
        
        # Get options backtest results
        options_dir = 'backtest_results'
        if os.path.exists(options_dir):
            json_files = [f for f in os.listdir(options_dir) if f.endswith('.json')]
            options_results = []
            
            for filename in json_files:
                try:
                    filepath = os.path.join(options_dir, filename)
                    with open(filepath, 'r') as f:
                        data = json.load(f)
                        if 'summary' in data:
                            options_results.append({
                                'id': data.get('id', filename.replace('.json', '')),
                                'symbol': data.get('config', {}).get('symbol', 'N/A'),
                                'strategy': data.get('config', {}).get('strategy', 'N/A'),
                                'total_pnl': data.get('summary', {}).get('total_pnl', 0),
                                'total_return': data.get('summary', {}).get('total_return', 0),
                                'win_rate': data.get('summary', {}).get('win_rate', 0),
                                'total_trades': data.get('summary', {}).get('total_trades', 0),
                                'equity_curve': data.get('files', {}).get('image', None),
                                'timestamp': data.get('timestamp', '')
                            })
                except Exception as e:
                    continue
            
            # Sort by total_return descending and get top 5
            options_results.sort(key=lambda x: x.get('total_return', 0), reverse=True)
            results['options_backtests'] = options_results[:5]
        
        # Get stock backtest results
        stocks_dir = 'stock_backtest_v3_results'
        if os.path.exists(stocks_dir):
            json_files = [f for f in os.listdir(stocks_dir) if f.endswith('.json')]
            stock_results = []
            
            for filename in json_files:
                try:
                    filepath = os.path.join(stocks_dir, filename)
                    with open(filepath, 'r') as f:
                        data = json.load(f)
                        trades = data.get('trades', [])
                        total_pnl = sum(t.get('pnl', 0) for t in trades)
                        total_pnl_pct = sum(t.get('pnl_pct', 0) for t in trades)
                        wins = len([t for t in trades if t.get('pnl', 0) > 0])
                        win_rate = (wins / len(trades) * 100) if trades else 0
                        
                        stock_results.append({
                            'id': data.get('backtest_id', filename.replace('.json', '')),
                            'name': data.get('config', {}).get('name', 'N/A'),
                            'symbol': data.get('config', {}).get('symbol', 'N/A'),
                            'total_pnl': round(total_pnl, 2),
                            'total_return': round(total_pnl_pct, 2),
                            'win_rate': round(win_rate, 2),
                            'total_trades': len(trades),
                            'timestamp': data.get('timestamp', '')
                        })
                except Exception as e:
                    continue
            
            # Sort by total_pnl descending and get top 5
            stock_results.sort(key=lambda x: x.get('total_pnl', 0), reverse=True)
            results['stock_backtests'] = stock_results[:5]
        
        return jsonify(results)
    
    except Exception as e:
        print(f"Error getting dashboard backtests: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/dashboard/watchlist', methods=['GET'])
def get_dashboard_watchlist():
    """Get watchlist/top gainers for dashboard"""
    # Sample watchlist data - in production this would come from real-time data
    watchlist = [
        {'symbol': 'AAPL', 'name': 'Apple Inc.', 'price': 189.95, 'change': 2.34, 'change_pct': 1.25},
        {'symbol': 'MSFT', 'name': 'Microsoft Corp', 'price': 378.91, 'change': 5.67, 'change_pct': 1.52},
        {'symbol': 'GOOGL', 'name': 'Alphabet Inc.', 'price': 141.80, 'change': -0.89, 'change_pct': -0.62},
        {'symbol': 'AMZN', 'name': 'Amazon.com', 'price': 186.75, 'change': 3.21, 'change_pct': 1.75},
        {'symbol': 'NVDA', 'name': 'NVIDIA Corp', 'price': 495.22, 'change': 12.45, 'change_pct': 2.58},
        {'symbol': 'TSLA', 'name': 'Tesla Inc.', 'price': 251.44, 'change': -4.56, 'change_pct': -1.78},
        {'symbol': 'META', 'name': 'Meta Platforms', 'price': 354.89, 'change': 6.78, 'change_pct': 1.95}
    ]
    return jsonify({'watchlist': watchlist})


@app.route('/api/dashboard/best-backtest', methods=['GET'])
def get_best_backtest():
    """Get the best performing backtest by combined win rate and PnL score"""
    try:
        result = {
            'options_best': None,
            'stock_best': None
        }
        
        # Get best options backtest
        options_dir = 'backtest_results'
        if os.path.exists(options_dir):
            json_files = [f for f in os.listdir(options_dir) if f.endswith('.json')]
            best_score = -float('inf')
            best_backtest = None
            
            for filename in json_files:
                try:
                    filepath = os.path.join(options_dir, filename)
                    with open(filepath, 'r') as f:
                        data = json.load(f)
                        if 'summary' in data:
                            win_rate = data.get('summary', {}).get('win_rate', 0)
                            total_pnl = data.get('summary', {}).get('total_pnl', 0)
                            # Score = win_rate * 0.5 + normalized PnL score
                            score = win_rate * 0.5 + (total_pnl / 1000) * 0.5
                            
                            if score > best_score:
                                best_score = score
                                equity_curve = data.get('files', {}).get('image', None)
                                if equity_curve:
                                    equity_curve = f"backtest_results/{equity_curve}"
                                best_backtest = {
                                    'id': data.get('id', filename.replace('.json', '')),
                                    'symbol': data.get('config', {}).get('symbol', 'N/A'),
                                    'strategy': data.get('config', {}).get('strategy', 'N/A'),
                                    'total_pnl': data.get('summary', {}).get('total_pnl', 0),
                                    'total_return': data.get('summary', {}).get('total_return', 0),
                                    'win_rate': data.get('summary', {}).get('win_rate', 0),
                                    'total_trades': data.get('summary', {}).get('total_trades', 0),
                                    'equity_curve': equity_curve,
                                    'timestamp': data.get('timestamp', '')
                                }
                except Exception as e:
                    continue
            
            result['options_best'] = best_backtest
        
        # Get best stock backtest
        stocks_dir = 'stock_backtest_v3_results'
        if os.path.exists(stocks_dir):
            json_files = [f for f in os.listdir(stocks_dir) if f.endswith('.json')]
            best_score = -float('inf')
            best_backtest = None
            
            for filename in json_files:
                try:
                    filepath = os.path.join(stocks_dir, filename)
                    with open(filepath, 'r') as f:
                        data = json.load(f)
                        trades = data.get('trades', [])
                        if not trades:
                            continue
                        
                        total_pnl = sum(t.get('pnl', 0) for t in trades)
                        wins = len([t for t in trades if t.get('pnl', 0) > 0])
                        win_rate = (wins / len(trades) * 100) if trades else 0
                        
                        # Score = win_rate * 0.5 + normalized PnL score
                        score = win_rate * 0.5 + (total_pnl / 1000) * 0.5
                        
                        if score > best_score:
                            best_score = score
                            # Get equity curve from trades
                            equity_data = []
                            running_balance = data.get('config', {}).get('initial_capital', 50000)
                            for trade in trades:
                                running_balance += trade.get('pnl', 0)
                                equity_data.append(round(running_balance, 2))
                            
                            best_backtest = {
                                'id': data.get('backtest_id', filename.replace('.json', '')),
                                'name': data.get('config', {}).get('name', 'N/A'),
                                'symbol': data.get('config', {}).get('symbol', 'N/A'),
                                'total_pnl': round(total_pnl, 2),
                                'win_rate': round(win_rate, 2),
                                'total_trades': len(trades),
                                'equity_data': equity_data,
                                'initial_capital': data.get('config', {}).get('initial_capital', 50000),
                                'timestamp': data.get('timestamp', '')
                            }
                except Exception as e:
                    continue
            
            result['stock_best'] = best_backtest
        
        return jsonify(result)
    
    except Exception as e:
        print(f"Error getting best backtest: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/dashboard/economic-calendar', methods=['GET'])
def get_economic_calendar():
    """Get economic calendar events"""
    from datetime import datetime, timedelta
    
    # Sample economic calendar data - in production this would come from an API like Finnhub
    today = datetime.now()
    events = [
        {
            'time': (today + timedelta(hours=2)).strftime('%H:%M'),
            'currency': 'USD',
            'event': 'Fed Interest Rate Decision',
            'impact': 'high',
            'forecast': '5.50%',
            'previous': '5.50%'
        },
        {
            'time': (today + timedelta(hours=4)).strftime('%H:%M'),
            'currency': 'EUR',
            'event': 'ECB Press Conference',
            'impact': 'high',
            'forecast': '-',
            'previous': '-'
        },
        {
            'time': (today + timedelta(hours=6)).strftime('%H:%M'),
            'currency': 'USD',
            'event': 'Initial Jobless Claims',
            'impact': 'medium',
            'forecast': '210K',
            'previous': '218K'
        },
        {
            'time': (today + timedelta(hours=8)).strftime('%H:%M'),
            'currency': 'GBP',
            'event': 'BOE Rate Decision',
            'impact': 'high',
            'forecast': '5.25%',
            'previous': '5.25%'
        },
        {
            'time': (today + timedelta(hours=10)).strftime('%H:%M'),
            'currency': 'JPY',
            'event': 'Trade Balance',
            'impact': 'medium',
            'forecast': '-0.4T',
            'previous': '-0.6T'
        },
        {
            'time': (today + timedelta(hours=12)).strftime('%H:%M'),
            'currency': 'USD',
            'event': 'Crude Oil Inventories',
            'impact': 'medium',
            'forecast': '-1.2M',
            'previous': '+0.8M'
        }
    ]
    
    return jsonify({'events': events, 'date': today.strftime('%Y-%m-%d')})


# =============================================================================
# DASHBOARD DATA FEEDS — CENTRALIZED CACHE
# All Webull data is fetched once on a background timer and cached in memory.
# Every user request reads from the same cache. Zero duplicate API calls.
# =============================================================================
import threading

try:
    from webull import webull as wb_module
    WEBULL_AVAILABLE = True
except ImportError:
    WEBULL_AVAILABLE = False
    print("⚠️  WARNING: webull package not found. Gainers/Losers widget will not be available.")

# Shared cache — all users read from this dict
_dashboard_cache = {
    'gainers_losers': {'gainers': [], 'losers': [], 'session': 'closed', 'timestamp': ''},
    'indices': {'indices': [], 'timestamp': ''},
    'sectors': {'sectors': [], 'timestamp': ''},
    'most_active': {'active': [], 'timestamp': ''},
    'trending': {'trending': [], 'timestamp': ''},
    'earnings': {'earnings': [], 'timestamp': ''},
    'news': {'articles': [], 'timestamp': ''},
    'treasury': {'rates': [], 'timestamp': ''},
    'economic': {'indicators': [], 'timestamp': ''},
    'fred': {'series': [], 'timestamp': ''},
}
_cache_lock = threading.Lock()
_cache_timers = {}


def _get_market_session():
    """Determine current market session based on Eastern Time"""
    from datetime import time as dt_time
    import pytz
    eastern = pytz.timezone('America/New_York')
    now = datetime.now(eastern).time()
    if dt_time(4, 0) <= now < dt_time(9, 30):
        return 'premarket', 'preMarket'
    elif dt_time(9, 30) <= now < dt_time(16, 0):
        return 'regular', '1d'
    elif dt_time(16, 0) <= now < dt_time(20, 0):
        return 'afterhours', 'afterMarket'
    else:
        return 'closed', '1d'


def _refresh_gainers_losers():
    """Background task: fetch gainers/losers from Webull"""
    if not WEBULL_AVAILABLE:
        return
    try:
        wb = wb_module()
        session, rank_type = _get_market_session()
        gainers, losers = [], []

        try:
            gd = wb.active_gainer_loser(direction='gainer', rank_type=rank_type, count=10)
            if gd and 'data' in gd:
                for item in gd['data']:
                    t = item.get('ticker', {})
                    v = item.get('values', {})
                    gainers.append({
                        'symbol': t.get('symbol', 'N/A'),
                        'price': float(v.get('price', 0) or 0),
                        'change_pct': round(float(v.get('changeRatio', 0) or 0) * 100, 2),
                        'volume': int(float(t.get('volume', 0) or 0))
                    })
        except Exception as e:
            print(f"Cache: Error fetching gainers: {e}")

        try:
            ld = wb.active_gainer_loser(direction='loser', rank_type=rank_type, count=10)
            if ld and 'data' in ld:
                for item in ld['data']:
                    t = item.get('ticker', {})
                    v = item.get('values', {})
                    losers.append({
                        'symbol': t.get('symbol', 'N/A'),
                        'price': float(v.get('price', 0) or 0),
                        'change_pct': round(float(v.get('changeRatio', 0) or 0) * 100, 2),
                        'volume': int(float(t.get('volume', 0) or 0))
                    })
        except Exception as e:
            print(f"Cache: Error fetching losers: {e}")

        with _cache_lock:
            _dashboard_cache['gainers_losers'] = {
                'gainers': gainers, 'losers': losers,
                'session': session, 'timestamp': datetime.now().strftime('%H:%M:%S')
            }
    except Exception as e:
        print(f"Cache: gainers/losers refresh failed: {e}")


def _yf_get_close(df):
    """Get the close column from a yfinance dataframe, handling naming variants."""
    for col in ['Close', 'close', 'Adj Close', 'adj close']:
        if col in df.columns:
            return df[col]
    return df.iloc[:, 0]

def _refresh_indices():
    """Background task: fetch index quotes via yfinance"""
    try:
        import yfinance as yf
        symbols = ['SPY', 'QQQ', 'DIA', 'IWM', 'UVXY']
        indices = []
        for symbol in symbols:
            try:
                t = yf.Ticker(symbol)
                hist = t.history(period='2d')
                if hist is not None and len(hist) >= 1:
                    closes = _yf_get_close(hist)
                    price = round(float(closes.iloc[-1]), 2)
                    prev = round(float(closes.iloc[-2]), 2) if len(hist) >= 2 else price
                    chg = round(price - prev, 2)
                    pct = round((chg / prev * 100), 2) if prev else 0
                    indices.append({'symbol': symbol, 'price': price, 'change': chg, 'change_pct': pct})
                else:
                    indices.append({'symbol': symbol, 'price': 0, 'change': 0, 'change_pct': 0})
            except Exception as e:
                print(f"Cache: Error fetching index {symbol}: {e}")
                indices.append({'symbol': symbol, 'price': 0, 'change': 0, 'change_pct': 0})
        with _cache_lock:
            _dashboard_cache['indices'] = {'indices': indices, 'timestamp': datetime.now().strftime('%H:%M:%S')}
        print("Cache: indices refreshed OK (yfinance)")
    except Exception as e:
        print(f"Cache: indices refresh failed: {e}")


def _refresh_sectors():
    """Background task: fetch sector ETF quotes via yfinance"""
    try:
        import yfinance as yf
        etfs = {'XLK': 'Technology', 'XLF': 'Financials', 'XLE': 'Energy', 'XLV': 'Healthcare',
                'XLC': 'Comm Svcs', 'XLI': 'Industrials', 'XLP': 'Staples', 'XLU': 'Utilities',
                'XLRE': 'Real Estate', 'XLB': 'Materials', 'XLY': 'Discretionary'}
        sectors = []
        for ticker, name in etfs.items():
            try:
                t = yf.Ticker(ticker)
                hist = t.history(period='2d')
                if hist is not None and len(hist) >= 1:
                    closes = _yf_get_close(hist)
                    price = round(float(closes.iloc[-1]), 2)
                    prev = round(float(closes.iloc[-2]), 2) if len(hist) >= 2 else price
                    pct = round(((price - prev) / prev * 100), 2) if prev else 0
                    sectors.append({'symbol': ticker, 'name': name, 'change_pct': pct, 'price': price})
                else:
                    sectors.append({'symbol': ticker, 'name': name, 'change_pct': 0, 'price': 0})
            except Exception as e:
                print(f"Cache: Error fetching sector {ticker}: {e}")
                sectors.append({'symbol': ticker, 'name': name, 'change_pct': 0, 'price': 0})
        sectors.sort(key=lambda x: x['change_pct'], reverse=True)
        with _cache_lock:
            _dashboard_cache['sectors'] = {'sectors': sectors, 'timestamp': datetime.now().strftime('%H:%M:%S')}
        print("Cache: sectors refreshed OK (yfinance)")
    except Exception as e:
        print(f"Cache: sectors refresh failed: {e}")


def _refresh_most_active():
    """Background task: fetch most active by volume via yfinance screener"""
    try:
        import yfinance as yf
        active = []
        result = yf.screen('most_actives')
        if result and 'quotes' in result:
            for item in result['quotes'][:10]:
                active.append({
                    'symbol': item.get('symbol', 'N/A'),
                    'price': round(float(item.get('regularMarketPrice', 0) or 0), 2),
                    'change_pct': round(float(item.get('regularMarketChangePercent', 0) or 0), 2),
                    'volume': int(item.get('regularMarketVolume', 0) or 0)
                })
        with _cache_lock:
            _dashboard_cache['most_active'] = {'active': active, 'timestamp': datetime.now().strftime('%H:%M:%S')}
        print("Cache: most-active refreshed OK (yfinance)")
    except Exception as e:
        print(f"Cache: most-active refresh failed: {e}")


def _refresh_trending():
    """Background task: fetch trending tickers via yfinance screener"""
    try:
        import yfinance as yf
        trending = []
        result = yf.screen('day_gainers')
        if result and 'quotes' in result:
            for item in result['quotes'][:10]:
                trending.append({
                    'symbol': item.get('symbol', 'N/A'),
                    'price': round(float(item.get('regularMarketPrice', 0) or 0), 2),
                    'change_pct': round(float(item.get('regularMarketChangePercent', 0) or 0), 2)
                })
        with _cache_lock:
            _dashboard_cache['trending'] = {'trending': trending, 'timestamp': datetime.now().strftime('%H:%M:%S')}
        print("Cache: trending refreshed OK (yfinance)")
    except Exception as e:
        print(f"Cache: trending refresh failed: {e}")


def _refresh_earnings():
    """Background task: fetch upcoming earnings via yfinance ticker calendars"""
    try:
        import yfinance as yf
        earnings = []
        tickers_to_check = [
            'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'JPM', 'V', 'WMT',
            'JNJ', 'PG', 'UNH', 'HD', 'DIS', 'BA', 'NFLX', 'COST', 'AMD', 'INTC',
            'CRM', 'ORCL', 'ADBE', 'PYPL', 'MA', 'KO', 'PEP', 'MCD', 'NKE', 'T',
            'UBER', 'SQ', 'SNAP', 'ROKU', 'ZM', 'SHOP', 'ABNB', 'COIN', 'PLTR', 'SOFI'
        ]
        today = datetime.now().date()
        for sym in tickers_to_check:
            try:
                t = yf.Ticker(sym)
                cal_data = t.calendar
                if cal_data is not None and isinstance(cal_data, dict):
                    ed = cal_data.get('Earnings Date', [])
                    if ed:
                        date_val = ed[0] if isinstance(ed, list) else ed
                        date_str = str(date_val)[:10]
                        earnings.append({
                            'symbol': sym,
                            'name': cal_data.get('Company Name', sym),
                            'date': date_str,
                            'time': 'N/A'
                        })
            except:
                continue
            if len(earnings) >= 15:
                break
        earnings.sort(key=lambda x: x.get('date', '9999'))
        with _cache_lock:
            _dashboard_cache['earnings'] = {'earnings': earnings, 'timestamp': datetime.now().strftime('%H:%M:%S')}
        print(f"Cache: earnings refreshed OK (yfinance) — {len(earnings)} items")
    except Exception as e:
        print(f"Cache: earnings refresh failed: {e}")


def _refresh_news():
    """Background task: fetch headline news via yfinance + finviz"""
    try:
        import yfinance as yf
        articles = []
        for sym in ['SPY', 'QQQ', '^GSPC']:
            try:
                t = yf.Ticker(sym)
                news = t.news
                if news:
                    for item in news[:8]:
                        content = item.get('content', {})
                        title = content.get('title', '') or item.get('title', '')
                        if not title:
                            continue
                        provider = content.get('provider', {})
                        publisher = provider.get('displayName', '') or item.get('publisher', '')
                        thumbnail = content.get('thumbnail', {})
                        resolutions = thumbnail.get('resolutions', [])
                        thumb_url = resolutions[0]['url'] if resolutions else ''
                        click_url = content.get('clickThroughUrl', {}).get('url', '')
                        canonical_url = content.get('canonicalUrl', {}).get('url', '')
                        link = click_url or canonical_url or item.get('link', '')
                        pub_date = content.get('pubDate', '') or item.get('providerPublishTime', '')
                        if isinstance(pub_date, (int, float)):
                            pub_date = datetime.utcfromtimestamp(pub_date).strftime('%Y-%m-%dT%H:%M:%SZ')
                        articles.append({
                            'title': title,
                            'publisher': publisher,
                            'link': link,
                            'thumbnail': thumb_url,
                            'published': pub_date,
                            'source_symbol': sym,
                            'source_feed': 'yahoo',
                        })
            except Exception as e:
                print(f"Cache: Error fetching news for {sym}: {e}")

        try:
            from finvizfinance.news import News
            fnews = News()
            all_news = fnews.get_news()
            for category in ['news', 'blogs']:
                items = all_news.get(category, [])
                if hasattr(items, 'iterrows'):
                    for _, row in items.head(15).iterrows():
                        title = str(row.get('Title', ''))
                        if not title:
                            continue
                        pub_date = str(row.get('Date', ''))
                        articles.append({
                            'title': title,
                            'publisher': str(row.get('Source', 'Finviz')),
                            'link': str(row.get('Link', '')),
                            'thumbnail': '',
                            'published': pub_date,
                            'source_symbol': '',
                            'source_feed': 'finviz',
                        })
        except Exception as e:
            print(f"Cache: Error fetching finviz news: {e}")

        seen_titles = set()
        unique = []
        for a in articles:
            if a['title'] not in seen_titles:
                seen_titles.add(a['title'])
                unique.append(a)
        unique.sort(key=lambda x: x.get('published', ''), reverse=True)

        with _cache_lock:
            _dashboard_cache['news'] = {
                'articles': unique[:20],
                'timestamp': datetime.now().strftime('%H:%M:%S')
            }
        print(f"Cache: news refreshed OK — {len(unique[:12])} articles")
    except Exception as e:
        print(f"Cache: news refresh failed: {e}")


def _refresh_treasury():
    """Background task: fetch treasury rates via yfinance"""
    try:
        import yfinance as yf
        treasury_symbols = {
            '^IRX': {'name': '13-Week', 'maturity': '13W'},
            '^FVX': {'name': '5-Year', 'maturity': '5Y'},
            '^TNX': {'name': '10-Year', 'maturity': '10Y'},
            '^TYX': {'name': '30-Year', 'maturity': '30Y'},
        }
        rates = []
        for sym, info in treasury_symbols.items():
            try:
                t = yf.Ticker(sym)
                fi = t.fast_info
                rate = round(float(fi.last_price), 3)
                prev = round(float(fi.previous_close), 3)
                change = round(rate - prev, 3)
                rates.append({
                    'symbol': sym,
                    'name': info['name'],
                    'maturity': info['maturity'],
                    'rate': rate,
                    'prev_rate': prev,
                    'change': change,
                })
            except Exception as e:
                print(f"Cache: Error fetching treasury {sym}: {e}")
                rates.append({
                    'symbol': sym, 'name': info['name'],
                    'maturity': info['maturity'],
                    'rate': 0, 'prev_rate': 0, 'change': 0,
                })
        with _cache_lock:
            _dashboard_cache['treasury'] = {
                'rates': rates,
                'timestamp': datetime.now().strftime('%H:%M:%S')
            }
        print("Cache: treasury rates refreshed OK")
    except Exception as e:
        print(f"Cache: treasury refresh failed: {e}")


def _refresh_economic():
    """Background task: fetch economic indicators via yfinance"""
    try:
        import yfinance as yf
        indicators_config = {
            '^VIX': {'name': 'VIX', 'category': 'volatility', 'format': 'number'},
            'DX-Y.NYB': {'name': 'US Dollar (DXY)', 'category': 'currency', 'format': 'number'},
            'GC=F': {'name': 'Gold', 'category': 'commodity', 'format': 'currency'},
            'CL=F': {'name': 'Crude Oil', 'category': 'commodity', 'format': 'currency'},
            'BTC-USD': {'name': 'Bitcoin', 'category': 'crypto', 'format': 'currency'},
            'SI=F': {'name': 'Silver', 'category': 'commodity', 'format': 'currency'},
        }
        indicators = []
        for sym, info in indicators_config.items():
            try:
                t = yf.Ticker(sym)
                fi = t.fast_info
                price = round(float(fi.last_price), 2)
                prev = round(float(fi.previous_close), 2)
                change = round(price - prev, 2)
                change_pct = round((change / prev * 100), 2) if prev else 0
                indicators.append({
                    'symbol': sym,
                    'name': info['name'],
                    'category': info['category'],
                    'format': info['format'],
                    'price': price,
                    'prev_price': prev,
                    'change': change,
                    'change_pct': change_pct,
                })
            except Exception as e:
                print(f"Cache: Error fetching indicator {sym}: {e}")
                indicators.append({
                    'symbol': sym, 'name': info['name'],
                    'category': info['category'], 'format': info['format'],
                    'price': 0, 'prev_price': 0, 'change': 0, 'change_pct': 0,
                })
        with _cache_lock:
            _dashboard_cache['economic'] = {
                'indicators': indicators,
                'timestamp': datetime.now().strftime('%H:%M:%S')
            }
        print("Cache: economic indicators refreshed OK")
    except Exception as e:
        print(f"Cache: economic indicators refresh failed: {e}")


def _refresh_fred():
    """Background task: fetch macro economic data from FRED API"""
    try:
        fred_key = os.environ.get('FRED_API_KEY')
        if not fred_key:
            print("Cache: FRED_API_KEY not set — skipping FRED refresh")
            with _cache_lock:
                _dashboard_cache['fred'] = {
                    'series': [],
                    'timestamp': datetime.now().strftime('%H:%M:%S')
                }
            return
        from fredapi import Fred
        fred = Fred(api_key=fred_key)

        series_config = [
            {'id': 'FEDFUNDS', 'name': 'Fed Funds Rate', 'unit': '%', 'decimals': 2, 'category': 'rates'},
            {'id': 'UNRATE', 'name': 'Unemployment', 'unit': '%', 'decimals': 1, 'category': 'labor'},
            {'id': 'CPIAUCSL', 'name': 'CPI Index', 'unit': '', 'decimals': 1, 'category': 'inflation'},
            {'id': 'CPILFESL', 'name': 'Core CPI', 'unit': '', 'decimals': 1, 'category': 'inflation'},
            {'id': 'GDP', 'name': 'GDP', 'unit': 'B', 'decimals': 1, 'category': 'output'},
            {'id': 'PAYEMS', 'name': 'Nonfarm Payrolls', 'unit': 'K', 'decimals': 0, 'category': 'labor'},
            {'id': 'RSAFS', 'name': 'Retail Sales', 'unit': 'M', 'decimals': 0, 'category': 'consumer'},
            {'id': 'UMCSENT', 'name': 'Consumer Sentiment', 'unit': '', 'decimals': 1, 'category': 'consumer'},
            {'id': 'HOUST', 'name': 'Housing Starts', 'unit': 'K', 'decimals': 0, 'category': 'housing'},
            {'id': 'INDPRO', 'name': 'Industrial Production', 'unit': '', 'decimals': 1, 'category': 'output'},
        ]
        results = []
        for cfg in series_config:
            try:
                s = fred.get_series(cfg['id'], observation_start='2023-01-01')
                if s.empty:
                    continue
                s = s.dropna()
                if s.empty or len(s) < 1:
                    continue
                latest = round(float(s.iloc[-1]), cfg['decimals'])
                prev = round(float(s.iloc[-2]), cfg['decimals']) if len(s) >= 2 else latest
                change = round(latest - prev, cfg['decimals'])
                latest_date = s.index[-1].strftime('%b %Y')

                if cfg['unit'] == '%':
                    display = f"{latest}%"
                elif cfg['unit'] == 'B':
                    display = f"${latest / 1000:.1f}T" if latest >= 10000 else f"${latest:.0f}B"
                elif cfg['unit'] == 'K':
                    display = f"{latest / 1000:.1f}M" if latest >= 1000 else f"{latest:.0f}K"
                elif cfg['unit'] == 'M':
                    display = f"${latest / 1000:.1f}B" if latest >= 1000 else f"${latest:.0f}M"
                else:
                    display = f"{latest}"

                if cfg['unit'] == '%':
                    change_display = f"{change:+.2f} pp"
                elif cfg['unit'] == 'K' and abs(change) >= 1000:
                    change_display = f"{change / 1000:+.1f}M"
                elif cfg['unit'] == 'K':
                    change_display = f"{change:+.0f}K"
                elif cfg['unit'] == 'B':
                    change_display = f"${change:+.1f}B"
                elif cfg['unit'] == 'M':
                    change_display = f"${change:+.0f}M"
                else:
                    change_display = f"{change:+.1f}"

                results.append({
                    'id': cfg['id'],
                    'name': cfg['name'],
                    'value': latest,
                    'prev_value': prev,
                    'change': change,
                    'change_display': change_display,
                    'display': display,
                    'unit': cfg['unit'],
                    'date': latest_date,
                    'category': cfg['category'],
                })
            except Exception as e:
                print(f"Cache: Error fetching FRED series {cfg['id']}: {e}")

        with _cache_lock:
            _dashboard_cache['fred'] = {
                'series': results,
                'timestamp': datetime.now().strftime('%H:%M:%S')
            }
        print(f"Cache: FRED macro data refreshed OK — {len(results)} series")
    except Exception as e:
        print(f"Cache: FRED refresh failed: {e}")


def _run_periodic(func, interval_sec, name):
    """Run a function in a background thread immediately, then repeat on interval.
    The first call is non-blocking so app.run() starts right away."""
    def _loop():
        func()
        timer = threading.Timer(interval_sec, _loop)
        timer.daemon = True
        timer.start()
        _cache_timers[name] = timer
    t = threading.Thread(target=_loop, daemon=True, name=f'cache-{name}')
    t.start()


_dashboard_cache_started = False

def start_dashboard_cache():
    """Start all background refresh timers. Call once at app startup."""
    global _dashboard_cache_started
    if _dashboard_cache_started:
        return
    _dashboard_cache_started = True
    print("🚀 Starting dashboard data cache...")
    if WEBULL_AVAILABLE:
        _run_periodic(_refresh_gainers_losers, 30, 'gainers_losers')
    else:
        print("⚠️  Webull not available — gainers/losers feed disabled")
    _run_periodic(_refresh_indices, 30, 'indices')
    _run_periodic(_refresh_most_active, 60, 'most_active')
    _run_periodic(_refresh_trending, 60, 'trending')
    _run_periodic(_refresh_sectors, 60, 'sectors')
    _run_periodic(_refresh_earnings, 300, 'earnings')
    _run_periodic(_refresh_news, 300, 'news')
    _run_periodic(_refresh_treasury, 120, 'treasury')
    _run_periodic(_refresh_economic, 120, 'economic')
    _run_periodic(_refresh_fred, 600, 'fred')


# ── Thin API endpoints — just serve from cache, no Webull calls ──
# loading=True means the background thread hasn't finished its first fetch yet.

def _sanitize_nan(obj):
    """Recursively replace NaN/Inf floats with None so JSON serialization succeeds."""
    import math
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {k: _sanitize_nan(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_nan(v) for v in obj]
    return obj


def _cache_response(key):
    with _cache_lock:
        data = dict(_dashboard_cache[key])
    data['loading'] = not bool(data.get('timestamp'))
    return jsonify(_sanitize_nan(data))

@app.route('/api/dashboard/gainers-losers')
def get_gainers_losers():
    return _cache_response('gainers_losers')

@app.route('/api/dashboard/indices')
def get_indices():
    return _cache_response('indices')

@app.route('/api/dashboard/sectors')
def get_sectors():
    return _cache_response('sectors')

@app.route('/api/dashboard/most-active')
def get_most_active():
    return _cache_response('most_active')

@app.route('/api/dashboard/trending')
def get_trending():
    return _cache_response('trending')

@app.route('/api/dashboard/earnings')
def get_earnings_calendar():
    return _cache_response('earnings')

@app.route('/api/dashboard/news')
def get_dashboard_news():
    return _cache_response('news')

@app.route('/api/dashboard/treasury')
def get_treasury_rates():
    return _cache_response('treasury')

@app.route('/api/dashboard/economic')
def get_economic_indicators():
    return _cache_response('economic')

@app.route('/api/dashboard/fred')
def get_fred_data():
    return _cache_response('fred')


# =============================================================================
# TICKER DETAIL PAGE & API ROUTES
# =============================================================================

@app.route('/ticker/<symbol>')
def ticker_page(symbol):
    return send_from_directory('.', 'ticker.html')


import re as _re
_TICKER_RE = _re.compile(r'^[A-Za-z0-9.\-^=]{1,12}$')

def _valid_symbol(symbol):
    return bool(_TICKER_RE.match(symbol))


@app.route('/api/ticker/<symbol>/info')
def ticker_info(symbol):
    if not _valid_symbol(symbol):
        return jsonify({'error': 'Invalid ticker symbol'}), 400
    try:
        import yfinance as yf
        t = yf.Ticker(symbol.upper())
        info = t.info or {}
        prev = info.get('previousClose') or info.get('regularMarketPreviousClose')
        price = info.get('regularMarketPrice') or info.get('currentPrice') or prev
        change = (price - prev) if price and prev else None
        change_pct = (change / prev * 100) if change and prev else None
        return jsonify(_sanitize_nan({
            'symbol': symbol.upper(),
            'name': info.get('shortName') or info.get('longName', ''),
            'price': price,
            'change': change,
            'change_pct': change_pct,
            'market_cap': info.get('marketCap'),
            'pe_ratio': info.get('trailingPE'),
            'forward_pe': info.get('forwardPE'),
            'eps': info.get('trailingEps'),
            'dividend_yield': info.get('dividendYield'),
            'high_52w': info.get('fiftyTwoWeekHigh'),
            'low_52w': info.get('fiftyTwoWeekLow'),
            'volume': info.get('volume'),
            'avg_volume': info.get('averageVolume'),
            'beta': info.get('beta'),
            'sector': info.get('sector'),
            'industry': info.get('industry'),
        }))
    except Exception as e:
        logging.error(f'Ticker info error for {symbol}: {e}')
        return jsonify({'error': 'Failed to fetch ticker info'}), 500


@app.route('/api/ticker/<symbol>/chart')
def ticker_chart(symbol):
    if not _valid_symbol(symbol):
        return jsonify({'error': 'Invalid ticker symbol'}), 400
    try:
        import yfinance as yf
        period = request.args.get('period', '3mo')
        valid_periods = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y']
        if period not in valid_periods:
            period = '3mo'
        interval_map = {'1d': '5m', '5d': '15m', '1mo': '1h', '3mo': '1d', '6mo': '1d', '1y': '1d', '2y': '1wk', '5y': '1wk'}
        interval = interval_map.get(period, '1d')
        t = yf.Ticker(symbol.upper())
        hist = t.history(period=period, interval=interval)
        if hist.empty:
            return jsonify({'prices': []})
        prices = []
        for idx, row in hist.iterrows():
            date_str = idx.strftime('%Y-%m-%d %H:%M') if interval in ('15m', '1h') else idx.strftime('%Y-%m-%d')
            prices.append({
                'date': date_str,
                'open': row.get('Open'),
                'high': row.get('High'),
                'low': row.get('Low'),
                'close': row.get('Close'),
                'volume': row.get('Volume'),
            })
        return jsonify(_sanitize_nan({'prices': prices}))
    except Exception as e:
        logging.error(f'Ticker chart error for {symbol}: {e}')
        return jsonify({'error': 'Failed to fetch chart data'}), 500


@app.route('/api/ticker/<symbol>/news')
def ticker_news(symbol):
    if not _valid_symbol(symbol):
        return jsonify({'error': 'Invalid ticker symbol', 'articles': []}), 400
    try:
        import yfinance as yf
        articles = []

        t = yf.Ticker(symbol.upper())
        raw_news = t.news or []
        for item in raw_news[:15]:
            content = item.get('content', {}) if isinstance(item, dict) else {}
            thumbnail = None
            thumb_obj = content.get('thumbnail')
            if thumb_obj and isinstance(thumb_obj, dict):
                resolutions = thumb_obj.get('resolutions', [])
                if resolutions:
                    thumbnail = resolutions[-1].get('url')
            pub_date = content.get('pubDate')
            articles.append({
                'title': content.get('title', ''),
                'link': content.get('canonicalUrl', {}).get('url', '') if isinstance(content.get('canonicalUrl'), dict) else '',
                'publisher': content.get('provider', {}).get('displayName', '') if isinstance(content.get('provider'), dict) else '',
                'published': pub_date,
                'thumbnail': thumbnail,
                'source_feed': 'yahoo',
            })

        try:
            clean_sym = symbol.upper().replace('^', '').replace('=', '')
            if clean_sym and len(clean_sym) <= 5 and clean_sym.isalpha():
                from finvizfinance.quote import finvizfinance as fvf
                stock = fvf(clean_sym)
                fnews = stock.ticker_news()
                if fnews is not None and not fnews.empty:
                    for _, row in fnews.head(15).iterrows():
                        title = str(row.get('Title', ''))
                        if not title:
                            continue
                        articles.append({
                            'title': title,
                            'link': str(row.get('Link', '')),
                            'publisher': str(row.get('Source', 'Finviz')),
                            'published': str(row.get('Date', '')),
                            'thumbnail': None,
                            'source_feed': 'finviz',
                        })
        except Exception as e:
            logging.debug(f'Finviz news unavailable for {symbol}: {e}')

        seen = set()
        unique = []
        for a in articles:
            if a['title'] and a['title'] not in seen:
                seen.add(a['title'])
                unique.append(a)

        return jsonify({'articles': unique[:20]})
    except Exception as e:
        logging.error(f'Ticker news error for {symbol}: {e}')
        return jsonify({'error': 'Failed to fetch news', 'articles': []}), 500


@app.route('/api/ticker/<symbol>/financials')
def ticker_financials(symbol):
    if not _valid_symbol(symbol):
        return jsonify({'error': 'Invalid ticker symbol'}), 400
    try:
        import yfinance as yf
        import math
        t = yf.Ticker(symbol.upper())

        def df_to_dict(df, max_rows=15):
            if df is None or df.empty:
                return {'columns': [], 'rows': []}
            cols = [c.strftime('%Y') if hasattr(c, 'strftime') else str(c) for c in df.columns[:5]]
            rows = []
            for label, row_data in list(df.iterrows())[:max_rows]:
                vals = []
                for c in df.columns[:5]:
                    v = row_data.get(c)
                    if v is None or (isinstance(v, float) and math.isnan(v)):
                        vals.append(None)
                    else:
                        vals.append(float(v))
                rows.append({'label': str(label), 'values': vals})
            return {'columns': cols, 'rows': rows}

        key_income_rows = [
            'Total Revenue', 'Cost Of Revenue', 'Gross Profit',
            'Operating Expense', 'Operating Income', 'Net Income',
            'EBITDA', 'Basic EPS', 'Diluted EPS',
        ]
        key_balance_rows = [
            'Total Assets', 'Total Liabilities Net Minority Interest',
            'Total Equity Gross Minority Interest', 'Cash And Cash Equivalents',
            'Total Debt', 'Net Debt', 'Share Issued',
        ]
        key_cashflow_rows = [
            'Operating Cash Flow', 'Capital Expenditure', 'Free Cash Flow',
            'Investing Cash Flow', 'Financing Cash Flow',
            'Repurchase Of Capital Stock', 'Cash Dividends Paid',
        ]

        def filter_df(df, keys):
            if df is None or df.empty:
                return df
            available = [k for k in keys if k in df.index]
            return df.loc[available] if available else df.head(15)

        return jsonify({
            'income': df_to_dict(filter_df(t.financials, key_income_rows)),
            'balance': df_to_dict(filter_df(t.balance_sheet, key_balance_rows)),
            'cashflow': df_to_dict(filter_df(t.cashflow, key_cashflow_rows)),
        })
    except Exception as e:
        logging.error(f'Ticker financials error for {symbol}: {e}')
        return jsonify({'error': 'Failed to fetch financials'}), 500


@app.route('/api/ticker/<symbol>/options')
def ticker_options(symbol):
    """Return options chain data from yfinance — calls and puts with open interest."""
    if not _valid_symbol(symbol):
        return jsonify({'error': 'Invalid ticker symbol'}), 400
    try:
        import yfinance as yf
        import math

        t = yf.Ticker(symbol.upper())
        expirations = t.options
        if not expirations:
            return jsonify({'expirations': [], 'calls': [], 'puts': [], 'expiration': None})

        # Default to the nearest expiration; allow client to request a specific one
        requested_exp = request.args.get('expiration', expirations[0])
        if requested_exp not in expirations:
            requested_exp = expirations[0]

        chain = t.option_chain(requested_exp)

        def chain_to_list(df, option_type):
            rows = []
            if df is None or df.empty:
                return rows
            want = ['strike', 'lastPrice', 'bid', 'ask', 'volume', 'openInterest',
                    'impliedVolatility', 'inTheMoney', 'percentChange', 'contractSymbol']
            for _, row in df.iterrows():
                entry = {'type': option_type}
                for col in want:
                    val = row.get(col)
                    if val is None:
                        entry[col] = None
                    elif isinstance(val, float) and math.isnan(val):
                        entry[col] = None
                    elif isinstance(val, bool):
                        entry[col] = bool(val)
                    else:
                        try:
                            entry[col] = round(float(val), 4)
                        except (TypeError, ValueError):
                            entry[col] = str(val)
                rows.append(entry)
            return rows

        calls = chain_to_list(chain.calls, 'call')
        puts  = chain_to_list(chain.puts,  'put')
        return jsonify({
            'expirations': list(expirations),
            'expiration': requested_exp,
            'calls': calls,
            'puts': puts,
        })
    except Exception as e:
        logging.error(f'Ticker options error for {symbol}: {e}')
        return jsonify({'error': 'Failed to fetch options data', 'expirations': [], 'calls': [], 'puts': []}), 500


@app.route('/api/search')
def ticker_search():
    """Autocomplete endpoint — returns matching tickers and company names."""
    query = (request.args.get('q') or '').strip()
    if not query or len(query) < 1:
        return jsonify({'results': []})
    try:
        import yfinance as yf
        search = yf.Search(query, max_results=10, enable_fuzzy_query=True)
        quotes = search.quotes or []
        results = []
        seen = set()
        for q in quotes:
            sym = (q.get('symbol') or '').strip().upper()
            name = q.get('longname') or q.get('shortname') or q.get('name') or ''
            qtype = q.get('quoteType') or ''
            exchange = q.get('exchange') or ''
            if sym and sym not in seen:
                seen.add(sym)
                results.append({'symbol': sym, 'name': name, 'type': qtype, 'exchange': exchange})
        return jsonify({'results': results[:10]})
    except Exception as e:
        logging.error(f'Ticker search error: {e}')
        return jsonify({'results': []})


# =============================================================================
# SCREENER API ROUTES
# =============================================================================

# Import the screener API (lazy load to avoid import errors)
try:
    from tradingview_screener_api_complete import TradingViewScreenerAPI
    screener = TradingViewScreenerAPI()
    SCREENER_AVAILABLE = True
except ImportError as e:
    SCREENER_AVAILABLE = False
    print(f"⚠️  WARNING: TradingView Screener not available: {e}")


@app.route('/api/options-market', methods=['GET'])
def get_options_market_data():
    import re as _re
    category = request.args.get('category', 'most-active')
    allowed = ['most-active', 'gainers', 'losers', 'highest-implied-volatility', 'highest-open-interest']
    if category not in allowed:
        return jsonify({'error': 'Invalid category'}), 400
    try:
        import requests as _requests
        url = f'https://finance.yahoo.com/markets/options/{category}/'
        headers = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}
        resp = _requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()

        scripts = _re.findall(r'<script[^>]*>(.*?)</script>', resp.text, _re.DOTALL)
        records_out = []
        total = 0
        for script in scripts:
            if 'openInterest' not in script and 'impliedVolatility' not in script:
                continue
            try:
                data = json.loads(script)
                body = json.loads(data.get('body', '{}'))
                results = body.get('finance', {}).get('result', [])
                if not results:
                    continue
                raw_records = results[0].get('records', [])
                total = results[0].get('total', len(raw_records))
                for r in raw_records:
                    exp_raw = r.get('expireDate', {}).get('raw', 0)
                    exp_str = ''
                    if exp_raw:
                        from datetime import datetime as _dt
                        exp_str = _dt.utcfromtimestamp(exp_raw).strftime('%Y-%m-%d')
                    records_out.append({
                        'ticker': r.get('ticker', ''),
                        'name': r.get('companyName', ''),
                        'underlying': r.get('underlyingSymbol', ''),
                        'strike': r.get('strike', {}).get('raw'),
                        'expiration': exp_str,
                        'price': r.get('regularMarketPrice', {}).get('raw'),
                        'change': r.get('regularMarketChange', {}).get('raw'),
                        'changePercent': r.get('regularMarketChangePercent', {}).get('raw'),
                        'bid': r.get('bid', {}).get('raw'),
                        'ask': r.get('ask', {}).get('raw'),
                        'volume': r.get('regularMarketVolume', {}).get('raw'),
                        'openInterest': r.get('openInterest', {}).get('raw'),
                        'impliedVolatility': r.get('impliedVolatility', {}).get('raw'),
                    })
                break
            except (json.JSONDecodeError, KeyError):
                continue
        return jsonify({'records': records_out, 'total': total, 'category': category})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/screener/categories', methods=['GET'])
def get_screener_categories():
    """Get all filter categories"""
    if not SCREENER_AVAILABLE:
        return jsonify({"success": False, "error": "Screener not available"}), 503
    try:
        categories = screener.get_categories()
        return jsonify({"success": True, "categories": categories})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/screener/filters/<category>', methods=['GET'])
def get_screener_filters(category):
    """Get filters for a specific category"""
    if not SCREENER_AVAILABLE:
        return jsonify({"success": False, "error": "Screener not available"}), 503
    try:
        filters = screener.get_filters_by_category(category)
        return jsonify({"success": True, "filters": filters})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/screener/filters', methods=['GET'])
def get_all_screener_filters():
    """Get all filters organized by category"""
    if not SCREENER_AVAILABLE:
        return jsonify({"success": False, "error": "Screener not available"}), 503
    try:
        filters = screener.get_all_filters()
        categories = screener.get_categories()
        return jsonify({"success": True, "filters": filters, "categories": categories})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/screener/scan', methods=['POST'])
def run_screener_scan():
    """Execute a scan with provided filters"""
    if not SCREENER_AVAILABLE:
        return jsonify({"success": False, "error": "Screener not available"}), 503
    try:
        data = request.json
        filters = data.get('filters', [])
        limit = data.get('limit', 50)
        offset = data.get('offset', 0)
        
        # Reset screener for fresh scan
        screener.reset()
        
        # Add each filter
        for filter_config in filters:
            result = screener.add_filter(filter_config)
            if not result.get('success'):
                print(f"Warning: Failed to add filter {filter_config.get('filter_id')}: {result.get('error')}")
        
        # Execute scan
        results = screener.execute_scan(limit=limit, offset=offset)
        
        return jsonify(results)
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/screener/export', methods=['POST'])
def export_screener_csv():
    """Export scan results as CSV"""
    if not SCREENER_AVAILABLE:
        return jsonify({"success": False, "error": "Screener not available"}), 503
    try:
        data = request.json
        filters = data.get('filters', [])
        limit = data.get('limit', 10000)
        
        # Reset and add filters
        screener.reset()
        for filter_config in filters:
            screener.add_filter(filter_config)
        
        # Get CSV
        csv_content = screener.export_csv(limit=limit)
        
        return csv_content, 200, {
            'Content-Type': 'text/csv',
            'Content-Disposition': 'attachment; filename=screener_results.csv'
        }
        
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/screener/clear', methods=['POST'])
def clear_screener_filters():
    """Clear all filters"""
    if not SCREENER_AVAILABLE:
        return jsonify({"success": False, "error": "Screener not available"}), 503
    try:
        result = screener.clear_filters()
        return jsonify(result)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/simulated-trading/bars', methods=['POST'])
def get_simulated_trading_bars():
    """Fetch OHLCV bars for simulated trading chart — uses SPY cache when available"""
    try:
        data = request.json
        symbol = data.get('symbol', '').upper().strip()
        start_date = data.get('start_date')
        end_date = data.get('end_date')
        bar_size = data.get('bar_size', 'day')
        multiplier = int(data.get('multiplier', 1))

        if not symbol or not start_date or not end_date:
            return jsonify({'error': 'Symbol, start_date, and end_date are required'}), 400

        tier = get_user_tier()
        tier_errors = validate_tier_restrictions(tier, symbol, start_date=start_date, end_date=end_date)
        if tier_errors:
            return jsonify({'error': tier_errors[0]}), 403

        if symbol == 'SPY' and bar_size == 'minute' and multiplier == 1:
            import pandas as _pd
            cache_info = spy_data_cache.get_cache_info()
            if cache_info.get('exists'):
                from datetime import datetime as dt_cls
                req_start = dt_cls.strptime(start_date, '%Y-%m-%d').date()
                req_end = dt_cls.strptime(end_date, '%Y-%m-%d').date()
                cache_first = _pd.to_datetime(cache_info['first_date']).date()
                cache_last = _pd.to_datetime(cache_info['last_date']).date()

                needs_before = req_start < cache_first
                needs_after = req_end > cache_last

                if not needs_before and not needs_after:
                    cached_bars = spy_data_cache.load_cached_bars_as_list(start_date, end_date)
                    bars = [{'timestamp': int(b['timestamp']), 'open': b['open'], 'high': b['high'],
                             'low': b['low'], 'close': b['close'], 'volume': b['volume'],
                             'vwap': b.get('vwap')} for b in cached_bars]
                    print(f"[SPY Cache] Served {len(bars)} bars from cache for {start_date} to {end_date}")
                    return jsonify({'success': True, 'symbol': symbol, 'bar_size': bar_size,
                                    'multiplier': multiplier, 'bars': bars, 'count': len(bars), 'source': 'cache'})

                bars = []
                source = 'cache'
                cached_bars = spy_data_cache.load_cached_bars_as_list(
                    max(start_date, cache_first.strftime('%Y-%m-%d')),
                    min(end_date, cache_last.strftime('%Y-%m-%d'))
                )
                for b in (cached_bars or []):
                    bars.append({'timestamp': int(b['timestamp']), 'open': b['open'], 'high': b['high'],
                                 'low': b['low'], 'close': b['close'], 'volume': b['volume'],
                                 'vwap': b.get('vwap')})
                cached_count = len(bars)

                api_key = request.headers.get('X-API-Key') or API_KEY
                if api_key:
                    from polygon.rest import RESTClient
                    client = RESTClient(api_key)
                    gap_ranges = []
                    if needs_before:
                        gap_ranges.append((start_date, (cache_first - timedelta(days=1)).strftime('%Y-%m-%d')))
                    if needs_after:
                        gap_ranges.append(((cache_last + timedelta(days=1)).strftime('%Y-%m-%d'), end_date))

                    for gap_start, gap_end in gap_ranges:
                        try:
                            aggs = client.get_aggs(ticker='SPY', multiplier=1, timespan='minute',
                                                   from_=gap_start, to=gap_end, limit=50000)
                            if aggs:
                                for agg in aggs:
                                    ts = agg.timestamp
                                    if hasattr(ts, 'timestamp'):
                                        ts = int(ts.timestamp() * 1000)
                                    else:
                                        ts = int(ts)
                                    bars.append({'timestamp': ts, 'open': agg.open, 'high': agg.high,
                                                 'low': agg.low, 'close': agg.close, 'volume': agg.volume,
                                                 'vwap': getattr(agg, 'vwap', None)})
                                source = 'cache+live'
                        except Exception as live_err:
                            print(f"[SPY Cache] Live fetch for gap {gap_start}-{gap_end} failed: {live_err}")

                live_count = len(bars) - cached_count
                print(f"[SPY Cache] Served {cached_count} cached + {live_count} live bars")
                bars.sort(key=lambda x: x['timestamp'])
                seen = set()
                unique_bars = []
                for b in bars:
                    if b['timestamp'] not in seen:
                        seen.add(b['timestamp'])
                        unique_bars.append(b)
                return jsonify({'success': True, 'symbol': symbol, 'bar_size': bar_size,
                                'multiplier': multiplier, 'bars': unique_bars, 'count': len(unique_bars),
                                'source': source})

        api_key = request.headers.get('X-API-Key') or API_KEY
        if not api_key:
            return jsonify({'error': 'Polygon API key not configured'}), 400

        from polygon.rest import RESTClient
        client = RESTClient(api_key)

        bars = []
        try:
            aggs = client.get_aggs(
                ticker=symbol,
                multiplier=multiplier,
                timespan=bar_size,
                from_=start_date,
                to=end_date,
                limit=50000
            )

            for agg in aggs:
                ts = agg.timestamp
                if hasattr(ts, 'timestamp'):
                    ts = int(ts.timestamp() * 1000)
                elif isinstance(ts, (int, float)):
                    ts = int(ts)
                else:
                    ts = int(ts)
                bars.append({
                    'timestamp': ts,
                    'open': agg.open,
                    'high': agg.high,
                    'low': agg.low,
                    'close': agg.close,
                    'volume': agg.volume,
                    'vwap': getattr(agg, 'vwap', None),
                })
        except Exception as e:
            return jsonify({'error': f'Failed to fetch data from Polygon: {str(e)}'}), 500

        bars.sort(key=lambda x: x['timestamp'])

        return jsonify({
            'success': True,
            'symbol': symbol,
            'bar_size': bar_size,
            'multiplier': multiplier,
            'bars': bars,
            'count': len(bars),
            'source': 'live'
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


def estimate_strike_from_delta(underlying_price, target_delta, option_type, symbol, delta_method='closest'):
    """
    Estimate strike price from target delta using Black-Scholes approximation.
    Uses simplified formula without needing to fetch market data.
    
    For 0DTE/intraday trades, uses shorter time to expiration for more accurate delta.
    """
    import numpy as np
    from scipy.stats import norm
    
    S = underlying_price
    sigma = 0.25  # Assume 25% IV for estimation (more realistic for options)
    T = 7/365.25  # Assume 7 days for more stable delta estimation
    r = 0.045  # Risk-free rate
    q = 0.013  # Dividend yield
    
    opt_type = 'call' if option_type.upper() == 'C' else 'put'
    
    try:
        if opt_type == 'call':
            adjusted_delta = target_delta / np.exp(-q * T)
            adjusted_delta = min(0.9999, max(0.0001, adjusted_delta))
            d1 = norm.ppf(adjusted_delta)
        else:
            adjusted_delta = abs(target_delta) / np.exp(-q * T)
            adjusted_delta = min(0.9999, max(0.0001, adjusted_delta))
            d1 = -norm.ppf(adjusted_delta)
        
        ln_S_over_K = d1 * sigma * np.sqrt(T) - (r - q + 0.5 * sigma**2) * T
        K_estimated = S / np.exp(ln_S_over_K)
        
        strike = round_strike_for_symbol(K_estimated, symbol, delta_method if delta_method in ['closest', 'above', 'below'] else 'closest')
        
        print(f"[Delta Estimation] S={S:.2f}, target_delta={target_delta}, opt_type={opt_type}, K_estimated={K_estimated:.2f}, final_strike={strike}")
        return strike
    except Exception as e:
        print(f"[Delta Estimation] Error: {e}, falling back to ATM")
        return round_strike_for_symbol(underlying_price, symbol, 'closest')


def round_strike_for_symbol(target_strike, symbol, fallback='closest'):
    """Round strike to valid increment based on symbol"""
    import math
    
    if symbol in ['SPY', 'QQQ', 'IWM']:
        increment = 1
    elif symbol in ['SPX', 'SPXW', 'NDX']:
        increment = 5
    else:
        increment = 1
    
    if fallback == 'exactly':
        return round(target_strike)
    elif fallback == 'higher':
        return math.ceil(target_strike / increment) * increment
    elif fallback == 'lower':
        return (target_strike // increment) * increment
    else:  # 'closest'
        return round(target_strike / increment) * increment


@app.route('/api/simulated-trading/option-bars', methods=['POST'])
def get_simulated_trading_option_bars():
    """Fetch OHLCV bars for an option contract in simulated trading"""
    try:
        data = request.json
        symbol = data.get('symbol', '').upper().strip()
        option_type = data.get('option_type', 'C').upper()
        expiration_date = data.get('expiration_date')
        start_date = data.get('start_date')
        end_date = data.get('end_date')
        multiplier = int(data.get('multiplier', 1))
        fallback = data.get('fallback', 'closest')
        
        underlying_price = data.get('underlying_price')
        strike_method = data.get('strike_method', 'exact_strike')
        method_value = data.get('method_value', 0)
        raw_strike = data.get('strike', 0)
        
        delta_value = data.get('delta')
        delta_method = data.get('delta_method', 'closest')
        mid_price_min = data.get('mid_price_min')
        mid_price_max = data.get('mid_price_max')
        
        if strike_method == 'pct_underlying' and underlying_price:
            pct = float(method_value) / 100.0
            target_strike = float(underlying_price) * (1 + pct)
            strike = round_strike_for_symbol(target_strike, symbol, fallback)
        elif strike_method == 'dollar_underlying' and underlying_price:
            target_strike = float(underlying_price) + float(method_value)
            strike = round_strike_for_symbol(target_strike, symbol, fallback)
        elif strike_method == 'delta' and delta_value is not None and underlying_price:
            strike = estimate_strike_from_delta(
                float(underlying_price), 
                float(delta_value), 
                option_type,
                symbol,
                delta_method
            )
            print(f"[SimTrading] Delta selection: target_delta={delta_value}, method={delta_method}, estimated_strike={strike}")
        elif strike_method == 'mid_price' and mid_price_min is not None and underlying_price:
            strike = round_strike_for_symbol(float(underlying_price), symbol, fallback)
        elif raw_strike:
            strike = round_strike_for_symbol(float(raw_strike), symbol, fallback)
        else:
            strike = 0
        
        print(f"[SimTrading Option Bars] Request: symbol={symbol}, method={strike_method}, underlying={underlying_price}, value={method_value}, calculated_strike={strike}, type={option_type}, exp={expiration_date}")
        
        if not symbol or not strike or not expiration_date or not start_date:
            print(f"[SimTrading Option Bars] Missing required fields: symbol={bool(symbol)}, strike={strike}, exp={bool(expiration_date)}, start={bool(start_date)}")
            return jsonify({'error': 'Symbol, strike, expiration_date, and start_date are required'}), 400
        
        api_key = request.headers.get('X-API-Key') or API_KEY
        if not api_key:
            return jsonify({'error': 'Polygon API key not configured'}), 400
        
        from polygon.rest import RESTClient
        from datetime import datetime as dt
        client = RESTClient(api_key)
        
        exp_dt = dt.strptime(expiration_date, '%Y-%m-%d')
        
        if symbol == 'SPX':
            option_symbol_base = 'SPXW'
        else:
            option_symbol_base = symbol
        
        date_part = exp_dt.strftime('%y%m%d')
        strike_int = int(strike * 1000)
        strike_str = f"{strike_int:08d}"
        option_symbol = f"O:{option_symbol_base}{date_part}{option_type}{strike_str}"
        
        bars = []
        try:
            aggs = client.get_aggs(
                ticker=option_symbol,
                multiplier=multiplier,
                timespan='minute',
                from_=start_date,
                to=end_date or start_date,
                limit=50000
            )
            
            for agg in aggs:
                ts = agg.timestamp
                if hasattr(ts, 'timestamp'):
                    ts = int(ts.timestamp() * 1000)
                elif isinstance(ts, (int, float)):
                    ts = int(ts)
                else:
                    ts = int(ts)
                
                vwap = None
                if hasattr(agg, 'vw') and agg.vw is not None:
                    vwap = agg.vw
                elif hasattr(agg, 'vwap') and agg.vwap is not None:
                    vwap = agg.vwap
                else:
                    vwap = agg.close
                
                bars.append({
                    'timestamp': ts,
                    'open': agg.open,
                    'high': agg.high,
                    'low': agg.low,
                    'close': agg.close,
                    'vwap': vwap,
                    'volume': getattr(agg, 'volume', 0)
                })
        except Exception as e:
            if fallback != 'exactly':
                increment = 1 if symbol in ['SPY', 'QQQ', 'IWM'] else 5
                if fallback == 'closest':
                    adjusted_strike = round(strike / increment) * increment
                elif fallback == 'higher':
                    adjusted_strike = ((strike // increment) + 1) * increment
                elif fallback == 'lower':
                    adjusted_strike = (strike // increment) * increment
                else:
                    adjusted_strike = strike
                
                if adjusted_strike != strike:
                    strike_int = int(adjusted_strike * 1000)
                    strike_str = f"{strike_int:08d}"
                    option_symbol = f"O:{option_symbol_base}{date_part}{option_type}{strike_str}"
                    
                    try:
                        aggs = client.get_aggs(
                            ticker=option_symbol,
                            multiplier=multiplier,
                            timespan='minute',
                            from_=start_date,
                            to=end_date or start_date,
                            limit=50000
                        )
                        
                        for agg in aggs:
                            ts = agg.timestamp
                            if hasattr(ts, 'timestamp'):
                                ts = int(ts.timestamp() * 1000)
                            elif isinstance(ts, (int, float)):
                                ts = int(ts)
                            else:
                                ts = int(ts)
                            
                            vwap = None
                            if hasattr(agg, 'vw') and agg.vw is not None:
                                vwap = agg.vw
                            elif hasattr(agg, 'vwap') and agg.vwap is not None:
                                vwap = agg.vwap
                            else:
                                vwap = agg.close
                            
                            bars.append({
                                'timestamp': ts,
                                'open': agg.open,
                                'high': agg.high,
                                'low': agg.low,
                                'close': agg.close,
                                'vwap': vwap,
                                'volume': getattr(agg, 'volume', 0)
                            })
                        strike = adjusted_strike
                    except Exception as e2:
                        return jsonify({'error': f'Failed to fetch option data: {str(e)} (fallback also failed: {str(e2)})'}), 500
                else:
                    return jsonify({'error': f'Failed to fetch option data: {str(e)}'}), 500
            else:
                return jsonify({'error': f'Failed to fetch option data: {str(e)}'}), 500
        
        bars.sort(key=lambda x: x['timestamp'])
        
        from datetime import datetime as _dt_cls, timezone as _tz
        import pytz
        et_tz = pytz.timezone('America/New_York')
        filtered_bars = []
        for b in bars:
            bar_dt = _dt_cls.fromtimestamp(b['timestamp'] / 1000, tz=_tz.utc).astimezone(et_tz)
            if bar_dt.hour > 9 or (bar_dt.hour == 9 and bar_dt.minute >= 30):
                filtered_bars.append(b)
        bars = filtered_bars
        
        print(f"[SimTrading Option Bars] Success: {option_symbol}, {len(bars)} bars returned")
        
        return jsonify({
            'success': True,
            'option_symbol': option_symbol,
            'underlying': symbol,
            'strike': strike,
            'option_type': option_type,
            'expiration': expiration_date,
            'bars': bars,
            'count': len(bars)
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/simulated-trading/compute-greeks', methods=['POST'])
def compute_option_greeks():
    """Compute option Greeks using the same GreeksCalculator as the backtester"""
    try:
        from options_backtester_v2_3_3_5 import GreeksCalculator
        data = request.json
        if not data or not isinstance(data, dict):
            return jsonify({'error': 'Invalid request body'}), 400

        legs = data.get('legs', [])
        underlying_price = float(data.get('underlying_price', 0))
        entry_timestamp = data.get('entry_timestamp')
        expiration_date = data.get('expiration_date')

        if not underlying_price or not entry_timestamp or not expiration_date or not legs:
            return jsonify({'error': 'Missing required fields'}), 400

        import pytz
        from datetime import datetime as _dt

        eastern = pytz.timezone('US/Eastern')

        if isinstance(entry_timestamp, (int, float)):
            entry_dt = _dt.fromtimestamp(entry_timestamp / 1000, tz=pytz.UTC).astimezone(eastern)
        elif isinstance(entry_timestamp, str):
            try:
                ts_val = float(entry_timestamp)
                entry_dt = _dt.fromtimestamp(ts_val / 1000, tz=pytz.UTC).astimezone(eastern)
            except ValueError:
                entry_dt = _dt.fromisoformat(entry_timestamp.replace('Z', '+00:00')).astimezone(eastern)
        else:
            return jsonify({'error': 'Invalid entry_timestamp format'}), 400

        try:
            exp_parts = str(expiration_date).split('-')
            exp_date_dt = _dt(int(exp_parts[0]), int(exp_parts[1]), int(exp_parts[2]), 16, 0, 0)
        except (ValueError, IndexError):
            return jsonify({'error': 'Invalid expiration_date format, expected YYYY-MM-DD'}), 400

        exp_dt = eastern.localize(exp_date_dt)
        T = max((exp_dt - entry_dt).total_seconds() / (365.25 * 24 * 3600), 1 / (365.25 * 24 * 60))

        r = 0.045
        q = 0.013

        results = []
        for leg in legs:
            strike = float(leg.get('strike', 0))
            entry_price = float(leg.get('entryPrice', 0))
            option_type = leg.get('type', 'call').lower()
            if option_type in ('c', 'call'):
                option_type = 'call'
            else:
                option_type = 'put'

            if not strike or not entry_price:
                results.append({'iv': None, 'delta': None, 'gamma': None, 'theta': None, 'vega': None})
                continue

            leg_exp = leg.get('expiration_date', expiration_date)
            if leg_exp and leg_exp != expiration_date:
                try:
                    lep = str(leg_exp).split('-')
                    leg_exp_dt = eastern.localize(_dt(int(lep[0]), int(lep[1]), int(lep[2]), 16, 0, 0))
                    leg_T = max((leg_exp_dt - entry_dt).total_seconds() / (365.25 * 24 * 3600), 1 / (365.25 * 24 * 60))
                except (ValueError, IndexError):
                    leg_T = T
            else:
                leg_T = T

            try:
                calc = GreeksCalculator(S=underlying_price, K=strike, T=leg_T, r=r, q=q, option_type=option_type)
                iv = calc.calculate_implied_volatility(entry_price)
                if iv is not None and iv > 0:
                    greeks = calc.calculate_greeks(iv)
                    results.append({
                        'iv': round(float(iv), 6),
                        'delta': round(float(greeks['delta']), 6),
                        'gamma': round(float(greeks['gamma']), 8),
                        'theta': round(float(greeks['theta']), 6),
                        'vega': round(float(greeks['vega']), 6)
                    })
                else:
                    results.append({'iv': None, 'delta': None, 'gamma': None, 'theta': None, 'vega': None})
            except Exception as leg_err:
                print(f"[SimTrading Greeks] Error computing Greeks for leg: {leg_err}")
                results.append({'iv': None, 'delta': None, 'gamma': None, 'theta': None, 'vega': None})

        return jsonify({'success': True, 'greeks': results})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/simulated-trading/option-bars-by-symbol', methods=['POST'])
@login_required
def get_option_bars_by_symbol():
    """Fetch option bars by known option symbol (for session restore)"""
    try:
        data = request.json
        option_symbol = data.get('option_symbol', '')
        start_date = data.get('start_date')
        end_date = data.get('end_date')
        multiplier = int(data.get('multiplier', 1))

        if not option_symbol or not start_date:
            return jsonify({'error': 'option_symbol and start_date are required'}), 400

        api_key = request.headers.get('X-API-Key') or API_KEY
        if not api_key:
            return jsonify({'error': 'Polygon API key not configured'}), 400

        from polygon.rest import RESTClient
        from datetime import datetime as _dt_cls, timezone as _tz
        import pytz
        client = RESTClient(api_key)

        bars = []
        aggs = client.get_aggs(
            ticker=option_symbol,
            multiplier=multiplier,
            timespan='minute',
            from_=start_date,
            to=end_date or start_date,
            limit=50000
        )
        for agg in aggs:
            ts = agg.timestamp
            if hasattr(ts, 'timestamp'):
                ts = int(ts.timestamp() * 1000)
            elif isinstance(ts, (int, float)):
                ts = int(ts)
            vwap = None
            if hasattr(agg, 'vw') and agg.vw is not None:
                vwap = agg.vw
            elif hasattr(agg, 'vwap') and agg.vwap is not None:
                vwap = agg.vwap
            else:
                vwap = agg.close
            bars.append({
                'timestamp': ts, 'open': agg.open, 'high': agg.high,
                'low': agg.low, 'close': agg.close, 'vwap': vwap,
                'volume': getattr(agg, 'volume', 0)
            })

        bars.sort(key=lambda x: x['timestamp'])
        et_tz = pytz.timezone('America/New_York')
        filtered_bars = []
        for b in bars:
            bar_dt = _dt_cls.fromtimestamp(b['timestamp'] / 1000, tz=_tz.utc).astimezone(et_tz)
            if bar_dt.hour > 9 or (bar_dt.hour == 9 and bar_dt.minute >= 30):
                filtered_bars.append(b)

        print(f"[SimTrading Option Restore] {option_symbol}: {len(filtered_bars)} bars")
        return jsonify({'success': True, 'option_symbol': option_symbol, 'bars': filtered_bars, 'count': len(filtered_bars)})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/saved-filters', methods=['GET'])
@login_required
def get_saved_filters():
    """Get all saved filters for the current user"""
    try:
        filters = SavedFilter.query.filter_by(user_id=current_user.id).order_by(SavedFilter.updated_at.desc()).all()
        return jsonify({
            "success": True,
            "filters": [f.to_dict() for f in filters]
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/saved-filters', methods=['POST'])
@login_required
def save_filter():
    """Save a new filter configuration"""
    try:
        data = request.json
        name = data.get('name', '').strip()
        filter_config = data.get('filter_config', [])
        
        if not name:
            return jsonify({"success": False, "error": "Filter name is required"}), 400
        
        if not filter_config:
            return jsonify({"success": False, "error": "Filter configuration is required"}), 400
        
        existing = SavedFilter.query.filter_by(user_id=current_user.id, name=name).first()
        if existing:
            existing.filter_config = json.dumps(filter_config)
            existing.updated_at = datetime.utcnow()
            db.session.commit()
            return jsonify({
                "success": True,
                "message": "Filter updated successfully",
                "filter": existing.to_dict()
            })
        
        new_filter = SavedFilter(
            user_id=current_user.id,
            name=name,
            filter_config=json.dumps(filter_config)
        )
        db.session.add(new_filter)
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": "Filter saved successfully",
            "filter": new_filter.to_dict()
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/saved-filters/<int:filter_id>', methods=['DELETE'])
@login_required
def delete_saved_filter(filter_id):
    """Delete a saved filter"""
    try:
        saved_filter = SavedFilter.query.filter_by(id=filter_id, user_id=current_user.id).first()
        
        if not saved_filter:
            return jsonify({"success": False, "error": "Filter not found"}), 404
        
        db.session.delete(saved_filter)
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": "Filter deleted successfully"
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/backtest-templates', methods=['GET'])
@login_required
def get_backtest_templates():
    """Get all backtest templates for the current user"""
    try:
        template_type = request.args.get('type', None)
        query = BacktestTemplate.query.filter_by(user_id=current_user.id)
        if template_type:
            query = query.filter_by(template_type=template_type)
        templates = query.order_by(BacktestTemplate.updated_at.desc()).all()
        return jsonify({
            "success": True,
            "templates": [t.to_dict() for t in templates]
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/backtest-templates', methods=['POST'])
@login_required
def save_backtest_template():
    """Save a new backtest template configuration"""
    try:
        data = request.json
        name = data.get('name', '').strip()
        template_type = data.get('template_type', 'options')
        template_config = data.get('template_config', {})
        
        if not name:
            return jsonify({"success": False, "error": "Template name is required"}), 400
        
        if not template_config:
            return jsonify({"success": False, "error": "Template configuration is required"}), 400
        
        if template_type not in ['options', 'stocks']:
            return jsonify({"success": False, "error": "Invalid template type"}), 400
        
        existing = BacktestTemplate.query.filter_by(
            user_id=current_user.id, 
            name=name,
            template_type=template_type
        ).first()
        
        if existing:
            existing.template_config = json.dumps(template_config)
            existing.updated_at = datetime.utcnow()
            db.session.commit()
            return jsonify({
                "success": True,
                "message": "Template updated successfully",
                "template": existing.to_dict()
            })
        
        new_template = BacktestTemplate(
            user_id=current_user.id,
            name=name,
            template_type=template_type,
            template_config=json.dumps(template_config)
        )
        db.session.add(new_template)
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": "Template saved successfully",
            "template": new_template.to_dict()
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/backtest-templates/<int:template_id>', methods=['DELETE'])
@login_required
def delete_backtest_template(template_id):
    """Delete a backtest template"""
    try:
        template = BacktestTemplate.query.filter_by(id=template_id, user_id=current_user.id).first()
        
        if not template:
            return jsonify({"success": False, "error": "Template not found"}), 404
        
        db.session.delete(template)
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": "Template deleted successfully"
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


# =============================================================================
# TECHNICAL INDICATORS API (for Price Conditions)
# =============================================================================

@app.route('/api/indicators/<indicator_type>/<symbol>', methods=['GET'])
def get_technical_indicator(indicator_type, symbol):
    """
    Fetch technical indicators from Polygon.io
    Supports: sma, ema, rsi, macd
    """
    try:
        api_key = request.headers.get('X-API-Key', API_KEY)
        if not api_key:
            return jsonify({'error': 'API key required'}), 401
        
        # Get query parameters
        timespan = request.args.get('timespan', 'day')
        window = request.args.get('window', '14')
        series_type = request.args.get('series_type', 'close')
        timestamp = request.args.get('timestamp')
        timestamp_gte = request.args.get('timestamp_gte')
        timestamp_lte = request.args.get('timestamp_lte')
        adjusted = request.args.get('adjusted', 'true')
        limit = request.args.get('limit', '100')
        
        # MACD specific params
        short_window = request.args.get('short_window', '12')
        long_window = request.args.get('long_window', '26')
        signal_window = request.args.get('signal_window', '9')
        
        # Build base URL
        base_url = f"https://api.polygon.io/v1/indicators/{indicator_type}/{symbol.upper()}"
        
        # Build query params
        params = {
            'apiKey': api_key,
            'timespan': timespan,
            'series_type': series_type,
            'adjusted': adjusted,
            'limit': limit
        }
        
        # Add window or MACD-specific params
        if indicator_type == 'macd':
            params['short_window'] = short_window
            params['long_window'] = long_window
            params['signal_window'] = signal_window
        else:
            params['window'] = window
        
        # Add timestamp filters
        if timestamp:
            params['timestamp'] = timestamp
        if timestamp_gte:
            params['timestamp.gte'] = timestamp_gte
        if timestamp_lte:
            params['timestamp.lte'] = timestamp_lte
        
        response = requests.get(base_url, params=params)
        
        if response.status_code == 200:
            data = response.json()
            return jsonify({
                'success': True,
                'indicator': indicator_type,
                'symbol': symbol.upper(),
                'results': data.get('results', {}),
                'status': data.get('status')
            })
        else:
            return jsonify({
                'success': False,
                'error': f"Polygon API error: {response.status_code}",
                'details': response.text
            }), response.status_code
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/indicators/evaluate-conditions', methods=['POST'])
def evaluate_price_conditions():
    """
    Evaluate multiple price conditions for a given symbol and timestamp
    Returns whether all conditions are met
    """
    try:
        data = request.json
        api_key = request.headers.get('X-API-Key', API_KEY)
        
        if not api_key:
            return jsonify({'error': 'API key required'}), 401
        
        symbol = data.get('symbol')
        conditions = data.get('conditions', [])
        timestamp = data.get('timestamp')
        
        if not symbol or not conditions:
            return jsonify({'error': 'Symbol and conditions required'}), 400
        
        results = []
        all_met = True
        
        for idx, condition in enumerate(conditions):
            try:
                result = evaluate_single_condition(condition, symbol, timestamp, api_key)
                results.append({
                    'condition_index': idx,
                    'met': result['met'],
                    'left_value': result.get('left_value'),
                    'right_value': result.get('right_value'),
                    'details': result.get('details', '')
                })
                if not result['met']:
                    all_met = False
            except Exception as e:
                results.append({
                    'condition_index': idx,
                    'met': False,
                    'error': str(e)
                })
                all_met = False
        
        return jsonify({
            'success': True,
            'all_conditions_met': all_met,
            'results': results
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


def evaluate_single_condition(condition, symbol, timestamp, api_key):
    """Evaluate a single price condition"""
    metric = condition.get('metric', 'price')
    operator = condition.get('operator', '>')
    comparator = condition.get('comparator', 'value')
    left = condition.get('left', {})
    
    # Get left side value
    left_value = get_indicator_value(
        symbol=symbol,
        metric=metric,
        params=left,
        timestamp=timestamp,
        api_key=api_key
    )
    
    # Get right side value
    if comparator == 'value':
        right_value = condition.get('compare_value', 0)
    else:
        right = condition.get('right', {})
        right_metric = comparator.replace('compare_', '')
        right_value = get_indicator_value(
            symbol=symbol,
            metric=right_metric,
            params=right,
            timestamp=timestamp,
            api_key=api_key
        )
        
        # Apply threshold if present
        threshold = condition.get('threshold', {})
        if threshold:
            threshold_value = threshold.get('value', 0)
            threshold_unit = threshold.get('unit', 'percent')
            if threshold_unit == 'percent':
                right_value = right_value * (1 + threshold_value / 100)
            else:
                right_value = right_value + threshold_value
    
    # Evaluate condition
    met = False
    if operator == '>':
        met = left_value > right_value
    elif operator == '<':
        met = left_value < right_value
    elif operator == '>=':
        met = left_value >= right_value
    elif operator == '<=':
        met = left_value <= right_value
    elif operator == '==':
        met = abs(left_value - right_value) < 0.0001
    elif operator == '><':
        # Between operator - would need a second right value
        met = False  # Not fully implemented for between
    
    return {
        'met': met,
        'left_value': left_value,
        'right_value': right_value,
        'details': f'{left_value} {operator} {right_value}'
    }


def get_indicator_value(symbol, metric, params, timestamp, api_key):
    """Fetch indicator value from Polygon.io"""
    import requests
    
    timespan = params.get('candle_type', 'day')
    series_type = params.get('series_type', 'close')
    
    if metric == 'price':
        # Get price from aggregates
        url = f"https://api.polygon.io/v2/aggs/ticker/{symbol}/prev"
        response = requests.get(url, params={'apiKey': api_key})
        if response.status_code == 200:
            data = response.json()
            if data.get('results') and len(data['results']) > 0:
                bar = data['results'][0]
                price_map = {'open': 'o', 'high': 'h', 'low': 'l', 'close': 'c'}
                return bar.get(price_map.get(series_type, 'c'), 0)
        return 0
    
    elif metric in ['sma', 'ema', 'rsi']:
        window = params.get('window', 14)
        url = f"https://api.polygon.io/v1/indicators/{metric}/{symbol}"
        query_params = {
            'apiKey': api_key,
            'timespan': timespan,
            'window': window,
            'series_type': series_type,
            'limit': 1
        }
        if timestamp:
            query_params['timestamp.lte'] = timestamp
        
        response = requests.get(url, params=query_params)
        if response.status_code == 200:
            data = response.json()
            values = data.get('results', {}).get('values', [])
            if values:
                return values[0].get('value', 0)
        return 0
    
    elif metric == 'macd':
        short_window = params.get('short_window', 12)
        long_window = params.get('long_window', 26)
        signal_window = params.get('signal_window', 9)
        component = params.get('component', 'histogram')
        
        url = f"https://api.polygon.io/v1/indicators/macd/{symbol}"
        query_params = {
            'apiKey': api_key,
            'timespan': timespan,
            'short_window': short_window,
            'long_window': long_window,
            'signal_window': signal_window,
            'series_type': series_type,
            'limit': 1
        }
        if timestamp:
            query_params['timestamp.lte'] = timestamp
        
        response = requests.get(url, params=query_params)
        if response.status_code == 200:
            data = response.json()
            values = data.get('results', {}).get('values', [])
            if values:
                val = values[0]
                if component == 'histogram':
                    return val.get('histogram', 0)
                elif component == 'signal':
                    return val.get('signal', 0)
                else:  # macd_line
                    return val.get('value', 0)
        return 0
    
    return 0


from scanner_scheduler import (
    scheduler, init_scheduler, schedule_scanner, unschedule_scanner, 
    PRESET_FILTERS, run_scanner_job
)
from models import Scanner, ScannerRun, NotificationDelivery, UserNotificationChannel

@app.route('/api/scanners', methods=['GET'])
@login_required
def get_scanners():
    """Get all scanners for current user"""
    try:
        scanners = Scanner.query.filter_by(user_id=current_user.id).order_by(Scanner.created_at.desc()).all()
        return jsonify({
            "success": True,
            "scanners": [s.to_dict() for s in scanners]
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/scanners', methods=['POST'])
@login_required
def create_scanner():
    """Create a new scanner"""
    try:
        data = request.get_json()
        
        name = data.get('name', 'My Scanner')
        symbol_scope = data.get('symbol_scope', 'any')
        symbols = data.get('symbols', '')
        filter_type = data.get('filter_type', 'preset')
        preset_filter_id = data.get('preset_filter_id')
        saved_filter_id = data.get('saved_filter_id')
        frequency = data.get('frequency', '1hr')
        channel_type = data.get('channel_type', 'email')
        channel_target = data.get('channel_target', current_user.email)
        active_from_time = data.get('active_from_time')
        active_to_time = data.get('active_to_time')
        expires_at_str = data.get('expires_at')
        filter_repeat_symbols = data.get('filter_repeat_symbols', False)
        repeat_threshold = data.get('repeat_threshold', 5)
        
        expires_at = None
        if expires_at_str:
            from datetime import datetime as dt
            expires_at = dt.strptime(expires_at_str, '%Y-%m-%d').date()
        
        if symbol_scope == 'specific' and isinstance(symbols, list):
            symbols = ','.join(symbols)
        
        scanner = Scanner(
            user_id=current_user.id,
            name=name,
            symbol_scope=symbol_scope,
            symbols=symbols if symbol_scope == 'specific' else None,
            filter_type=filter_type,
            preset_filter_id=preset_filter_id if filter_type == 'preset' else None,
            saved_filter_id=saved_filter_id if filter_type == 'saved' else None,
            frequency=frequency,
            channel_type=channel_type,
            channel_target=channel_target,
            active_from_time=active_from_time,
            active_to_time=active_to_time,
            expires_at=expires_at,
            filter_repeat_symbols=filter_repeat_symbols,
            repeat_threshold=repeat_threshold,
            is_active=True
        )
        
        db.session.add(scanner)
        db.session.commit()
        
        schedule_scanner(scanner, app)
        
        import threading
        def run_initial_scan():
            with app.app_context():
                run_scanner_job(scanner.id, app)
        threading.Thread(target=run_initial_scan, daemon=True).start()
        
        return jsonify({
            "success": True,
            "message": "Scanner created and running initial scan",
            "scanner": scanner.to_dict()
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/scanners/<int:scanner_id>', methods=['GET'])
@login_required
def get_scanner(scanner_id):
    """Get a specific scanner"""
    try:
        scanner = Scanner.query.filter_by(id=scanner_id, user_id=current_user.id).first()
        if not scanner:
            return jsonify({"success": False, "error": "Scanner not found"}), 404
        
        return jsonify({
            "success": True,
            "scanner": scanner.to_dict()
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/scanners/<int:scanner_id>', methods=['PUT'])
@login_required
def update_scanner(scanner_id):
    """Update a scanner"""
    try:
        scanner = Scanner.query.filter_by(id=scanner_id, user_id=current_user.id).first()
        if not scanner:
            return jsonify({"success": False, "error": "Scanner not found"}), 404
        
        data = request.get_json()
        
        if 'name' in data:
            scanner.name = data['name']
        if 'symbol_scope' in data:
            scanner.symbol_scope = data['symbol_scope']
        if 'symbols' in data:
            symbols = data['symbols']
            if isinstance(symbols, list):
                symbols = ','.join(symbols)
            scanner.symbols = symbols
        if 'filter_type' in data:
            scanner.filter_type = data['filter_type']
        if 'preset_filter_id' in data:
            scanner.preset_filter_id = data['preset_filter_id']
        if 'saved_filter_id' in data:
            scanner.saved_filter_id = data['saved_filter_id']
        if 'frequency' in data:
            scanner.frequency = data['frequency']
        if 'channel_type' in data:
            scanner.channel_type = data['channel_type']
        if 'channel_target' in data:
            scanner.channel_target = data['channel_target']
        if 'is_active' in data:
            scanner.is_active = data['is_active']
        if 'active_from_time' in data:
            scanner.active_from_time = data['active_from_time'] or None
        if 'active_to_time' in data:
            scanner.active_to_time = data['active_to_time'] or None
        if 'expires_at' in data:
            if data['expires_at']:
                scanner.expires_at = datetime.strptime(data['expires_at'], '%Y-%m-%d')
            else:
                scanner.expires_at = None
        if 'filter_repeat_symbols' in data:
            scanner.filter_repeat_symbols = data['filter_repeat_symbols']
        if 'repeat_threshold' in data:
            scanner.repeat_threshold = data['repeat_threshold']
        
        db.session.commit()
        
        unschedule_scanner(scanner.id)
        if scanner.is_active:
            schedule_scanner(scanner, app)
        
        return jsonify({
            "success": True,
            "message": "Scanner updated and restarted",
            "scanner": scanner.to_dict()
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/scanners/<int:scanner_id>', methods=['DELETE'])
@login_required
def delete_scanner(scanner_id):
    """Delete a scanner (preserves run history)"""
    try:
        scanner = Scanner.query.filter_by(id=scanner_id, user_id=current_user.id).first()
        if not scanner:
            return jsonify({"success": False, "error": "Scanner not found"}), 404
        
        unschedule_scanner(scanner.id)
        
        for run in ScannerRun.query.filter_by(scanner_id=scanner.id).all():
            if not run.scanner_name_cached:
                run.scanner_name_cached = scanner.name
        
        db.session.delete(scanner)
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": "Scanner deleted successfully"
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/scanners/<int:scanner_id>/toggle', methods=['POST'])
@login_required
def toggle_scanner(scanner_id):
    """Toggle scanner active status"""
    try:
        scanner = Scanner.query.filter_by(id=scanner_id, user_id=current_user.id).first()
        if not scanner:
            return jsonify({"success": False, "error": "Scanner not found"}), 404
        
        scanner.is_active = not scanner.is_active
        db.session.commit()
        
        if scanner.is_active:
            schedule_scanner(scanner, app)
        else:
            unschedule_scanner(scanner.id)
        
        return jsonify({
            "success": True,
            "message": f"Scanner {'activated' if scanner.is_active else 'paused'}",
            "scanner": scanner.to_dict()
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/scanners/<int:scanner_id>/run-now', methods=['POST'])
@login_required
def run_scanner_now(scanner_id):
    """Run a scanner immediately"""
    try:
        scanner = Scanner.query.filter_by(id=scanner_id, user_id=current_user.id).first()
        if not scanner:
            return jsonify({"success": False, "error": "Scanner not found"}), 404
        
        import threading
        thread = threading.Thread(target=run_scanner_job, args=(scanner.id, app))
        thread.start()
        
        return jsonify({
            "success": True,
            "message": "Scanner run started"
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/scanners/<int:scanner_id>/runs', methods=['GET'])
@login_required
def get_scanner_runs(scanner_id):
    """Get runs for a specific scanner"""
    try:
        scanner = Scanner.query.filter_by(id=scanner_id, user_id=current_user.id).first()
        if not scanner:
            return jsonify({"success": False, "error": "Scanner not found"}), 404
        
        runs = ScannerRun.query.filter_by(scanner_id=scanner_id).order_by(ScannerRun.started_at.desc()).limit(50).all()
        
        return jsonify({
            "success": True,
            "runs": [r.to_dict() for r in runs]
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/notifications/recent', methods=['GET'])
@login_required
def get_recent_notifications():
    """Get recent notifications for current user"""
    try:
        from sqlalchemy import or_
        
        scanner_ids = [s.id for s in Scanner.query.filter_by(user_id=current_user.id).all()]
        
        conditions = [ScannerRun.user_id == current_user.id]
        if scanner_ids:
            conditions.append(ScannerRun.scanner_id.in_(scanner_ids))
        
        limit = min(max(request.args.get('limit', 50, type=int), 1), 50)
        runs = ScannerRun.query.filter(
            or_(*conditions),
            ScannerRun.status == 'completed'
        ).order_by(ScannerRun.finished_at.desc()).limit(limit).all()
        
        notifications = []
        for run in runs:
            scanner_name = 'Deleted Scanner'
            filter_config = 'Custom'
            if run.scanner:
                scanner_name = run.scanner.name
                filter_config = run.scanner.preset_filter_id or 'Custom'
            elif run.scanner_name_cached:
                scanner_name = run.scanner_name_cached
            
            notifications.append({
                'id': run.id,
                'scanner_name': scanner_name,
                'scanner_id': run.scanner_id,
                'time': run.finished_at.isoformat() if run.finished_at else None,
                'symbols_found': run.symbols_found,
                'results': run.get_results(),
                'filter_config': filter_config,
                'status': run.status
            })
        
        return jsonify({
            "success": True,
            "notifications": notifications
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/notifications/unread-count', methods=['GET'])
@login_required
def get_unread_notification_count():
    """Get count of notifications the user has not yet viewed"""
    try:
        from sqlalchemy import or_
        
        scanner_ids = [s.id for s in Scanner.query.filter_by(user_id=current_user.id).all()]
        conditions = [ScannerRun.user_id == current_user.id]
        if scanner_ids:
            conditions.append(ScannerRun.scanner_id.in_(scanner_ids))
        
        query = ScannerRun.query.filter(
            or_(*conditions),
            ScannerRun.status == 'completed'
        )
        
        if current_user.notifications_viewed_at:
            query = query.filter(ScannerRun.finished_at > current_user.notifications_viewed_at)
        
        count = query.count()
        return jsonify({"success": True, "count": count})
    except Exception as e:
        return jsonify({"success": False, "error": str(e), "count": 0}), 500

@app.route('/api/notifications/mark-viewed', methods=['POST'])
@login_required
def mark_notifications_viewed():
    """Mark all notifications as viewed by updating the user's last-viewed timestamp"""
    try:
        current_user.notifications_viewed_at = datetime.utcnow()
        db.session.commit()
        return jsonify({"success": True})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/notifications/<int:notification_id>', methods=['DELETE'])
@login_required
def delete_notification(notification_id):
    """Delete a notification (scanner run) by ID"""
    try:
        run = ScannerRun.query.filter_by(id=notification_id, user_id=current_user.id).first()
        
        if not run:
            scanner_ids = [s.id for s in Scanner.query.filter_by(user_id=current_user.id).all()]
            if scanner_ids:
                run = ScannerRun.query.filter(
                    ScannerRun.id == notification_id,
                    ScannerRun.scanner_id.in_(scanner_ids)
                ).first()
        
        if not run:
            return jsonify({"success": False, "error": "Notification not found or not authorized"}), 404
        
        db.session.delete(run)
        db.session.commit()
        
        return jsonify({"success": True, "message": "Notification deleted"})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/notifications/clear-all', methods=['DELETE'])
@login_required
def clear_all_notifications():
    """Delete all notifications for the current user"""
    try:
        scanner_ids = [s.id for s in Scanner.query.filter_by(user_id=current_user.id).all()]
        
        deleted_count = 0
        if scanner_ids:
            deleted_count = ScannerRun.query.filter(
                ScannerRun.scanner_id.in_(scanner_ids)
            ).delete(synchronize_session=False)
        
        runs_by_user = ScannerRun.query.filter_by(user_id=current_user.id).delete(synchronize_session=False)
        deleted_count += runs_by_user
        
        db.session.commit()
        
        return jsonify({
            "success": True, 
            "message": f"Deleted {deleted_count} notifications"
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/preset-filters', methods=['GET'])
def get_preset_filters():
    """Get available preset filters"""
    presets = []
    for key, value in PRESET_FILTERS.items():
        presets.append({
            'id': key,
            'name': value['name'],
            'description': value['description']
        })
    return jsonify({
        "success": True,
        "presets": presets
    })


@app.route('/api/notification-channels', methods=['GET'])
@login_required
def get_notification_channels():
    """Get user's notification channels"""
    try:
        channels = UserNotificationChannel.query.filter_by(user_id=current_user.id).all()
        return jsonify({
            "success": True,
            "channels": [c.to_dict() for c in channels]
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/notification-channels', methods=['POST'])
@login_required
def save_notification_channel():
    """Save a notification channel (Telegram config)"""
    try:
        data = request.get_json()
        channel_type = data.get('channel_type')
        config = data.get('config', {})
        
        if channel_type not in ['email', 'telegram']:
            return jsonify({"success": False, "error": "Invalid channel type"}), 400
        
        existing = UserNotificationChannel.query.filter_by(
            user_id=current_user.id,
            channel_type=channel_type
        ).first()
        
        if existing:
            existing.set_config(config)
            existing.is_verified = False
            db.session.commit()
            channel = existing
        else:
            channel = UserNotificationChannel(
                user_id=current_user.id,
                channel_type=channel_type
            )
            channel.set_config(config)
            db.session.add(channel)
            db.session.commit()
        
        return jsonify({
            "success": True,
            "message": "Channel saved successfully",
            "channel": channel.to_dict()
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/notification-channels/<int:channel_id>/test', methods=['POST'])
@login_required
def test_notification_channel(channel_id):
    """Test a notification channel"""
    try:
        channel = UserNotificationChannel.query.filter_by(
            id=channel_id,
            user_id=current_user.id
        ).first()
        
        if not channel:
            return jsonify({"success": False, "error": "Channel not found"}), 404
        
        config = channel.get_config()
        
        if channel.channel_type == 'telegram':
            import requests as req
            bot_token = config.get('bot_token')
            chat_id = config.get('chat_id')
            
            if not bot_token or not chat_id:
                return jsonify({"success": False, "error": "Missing bot_token or chat_id"}), 400
            
            url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
            response = req.post(url, json={
                'chat_id': chat_id,
                'text': '✅ BacktestPro Test Message\n\nYour Telegram notifications are working!',
                'parse_mode': 'Markdown'
            })
            
            if response.status_code == 200:
                channel.is_verified = True
                db.session.commit()
                return jsonify({"success": True, "message": "Test message sent successfully"})
            else:
                return jsonify({"success": False, "error": f"Telegram API error: {response.text}"}), 400
        
        return jsonify({"success": False, "error": "Testing not supported for this channel type"}), 400
        
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


import spy_data_cache

@app.route('/api/spy-cache/info', methods=['GET'])
@login_required
def spy_cache_info():
    info = spy_data_cache.get_cache_info()
    return jsonify(info)


@app.route('/api/spy-cache/build', methods=['POST'])
@login_required
def spy_cache_build():
    if current_user.email != os.environ.get('ADMIN_EMAIL', ''):
        return jsonify({'error': 'Admin only'}), 403

    import threading

    def run_build():
        with app.app_context():
            spy_data_cache.build_full_cache(years=2)

    t = threading.Thread(target=run_build, daemon=True)
    t.start()
    return jsonify({'status': 'started', 'message': 'Building SPY 2-year cache in background. This takes several minutes due to API rate limits.'})


@app.route('/api/spy-cache/update', methods=['POST'])
@login_required
def spy_cache_update():
    if current_user.email != os.environ.get('ADMIN_EMAIL', ''):
        return jsonify({'error': 'Admin only'}), 403

    import threading

    def run_update():
        with app.app_context():
            spy_data_cache.daily_update()

    t = threading.Thread(target=run_update, daemon=True)
    t.start()
    return jsonify({'status': 'started', 'message': 'Fetching latest SPY data in background.'})


@app.route('/api/spy-cache/data', methods=['GET'])
@login_required
def spy_cache_data():
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    bars = spy_data_cache.load_cached_bars_as_list(start_date, end_date)
    if bars is None:
        return jsonify({'error': 'No cached data available. Build the cache first.'}), 404

    return jsonify({
        'symbol': 'SPY',
        'total_bars': len(bars),
        'bars': bars,
    })


# Start dashboard cache for gunicorn/wsgi (won't hit __main__ block)
# Safe to call multiple times — timers are daemon threads
start_dashboard_cache()

# Bootstrap admin user and ensure schema for gunicorn/wsgi
ensure_database_schema()
cleanup_orphaned_backtests()
bootstrap_admin_user()
seed_test_accounts()

# Initialize scanner scheduler for gunicorn/wsgi (won't hit __main__ block)
import sys
try:
    if env_bool('ENABLE_SCHEDULER', True):
        init_scheduler(app)
        print("✅ Scanner scheduler initialized", flush=True)
    else:
        print("⚠️ Scanner scheduler disabled", flush=True)
except Exception as exc:
    import traceback
    print(f"❌ Could not initialize scanner scheduler: {exc}", flush=True)
    traceback.print_exc()


if __name__ == '__main__':
    startup_state = initialize_app_runtime(
        enable_scheduler=env_bool('ENABLE_SCHEDULER', True),
    )
    # Check if API key is set
    if not API_KEY:
        print("\n" + "="*60)
        print("WARNING: POLYGON_API_KEY environment variable not set!")
        print("Set it with: export POLYGON_API_KEY='your_key_here'")
        print("Or the frontend will need to provide the API key")
        print("="*60 + "\n")
    
    # Check if stocks V3 wrapper is available
    if STOCKS_V3_WRAPPER_AVAILABLE:
        print("✅ Stocks V3 backtester is available")
    else:
        print("⚠️  Stocks V3 backtester is NOT available (missing wrapper)")
    
    # Run the server
    print(f"\n🚀 Starting Polygon API Server...")
    print(f"📊 Access the dashboard at: http://localhost:5000")
    print(f"🔧 API endpoints available at: http://localhost:5000/api/")
    print(f"🩺 Health checks: http://localhost:5000/api/health and /api/health/live")
    if MIGRATIONS_ENABLED:
        print("🗃️  Flask-Migrate is available for managed schema migrations")
    elif not MIGRATIONS_ENABLED:
        print("⚠️  Flask-Migrate is not installed; migration commands will be unavailable")
    if startup_state['scheduler_error']:
        print(f"⚠️  Scheduler startup failed: {startup_state['scheduler_error']}")
    admin_bootstrap = startup_state.get('admin_bootstrap', {})
    if admin_bootstrap.get('reason') == 'created':
        print('✅ Admin bootstrap user created from environment variables')
    elif admin_bootstrap.get('reason') == 'updated_existing':
        print('✅ Existing admin user verified from environment variables')
    elif admin_bootstrap.get('reason') == 'weak_password':
        print('⚠️  ADMIN_PASSWORD must be at least 12 characters; admin bootstrap skipped')
    elif admin_bootstrap.get('reason') == 'missing_credentials':
        print('⚠️  ADMIN_BOOTSTRAP_ENABLED is on but ADMIN_EMAIL or ADMIN_PASSWORD is missing')
    print(f"\nAvailable Backtester Endpoints:")
    print(f"  • Options Backtest: POST /api/backtest/run")
    if STOCKS_V3_WRAPPER_AVAILABLE:
        print(f"  • Stocks V3 Backtest: POST /api/stocks-backtest-v3/run")
    print(f"\nPress CTRL+C to stop the server\n")
    
    # Start centralized dashboard data cache
    start_dashboard_cache()
    
    app.run(
        debug=env_bool('FLASK_DEBUG', False),
        host='0.0.0.0',
        port=int(os.environ.get('PORT', 5000)),
    )
