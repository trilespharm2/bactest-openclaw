from datetime import datetime, timedelta
import json
from cryptography.fernet import Fernet
import os
import base64
import hashlib
from database import db

def get_encryption_key():
    key = os.environ.get('ENCRYPTION_KEY')
    if not key:
        # Derive a stable development key from FLASK_SECRET_KEY so encrypted data
        # remains decryptable across process restarts when ENCRYPTION_KEY is unset.
        secret_source = os.environ.get('FLASK_SECRET_KEY', 'dev-only-change-me')
        return base64.urlsafe_b64encode(hashlib.sha256(secret_source.encode()).digest())
    if isinstance(key, str):
        try:
            decoded = base64.urlsafe_b64decode(key)
            if len(decoded) == 32:
                return key.encode()
        except Exception:
            key_bytes = key.encode()
            return base64.urlsafe_b64encode(hashlib.sha256(key_bytes).digest())
    return key

def encrypt_value(value):
    if not value:
        return None
    f = Fernet(get_encryption_key())
    return f.encrypt(value.encode()).decode()

def decrypt_value(encrypted_value):
    if not encrypted_value:
        return None
    try:
        f = Fernet(get_encryption_key())
        return f.decrypt(encrypted_value.encode()).decode()
    except Exception:
        return None


class Scanner(db.Model):
    __tablename__ = 'scanners'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    symbol_scope = db.Column(db.String(20), nullable=False, default='any')
    symbols = db.Column(db.Text, nullable=True)
    filter_type = db.Column(db.String(20), nullable=False, default='preset')
    preset_filter_id = db.Column(db.String(50), nullable=True)
    saved_filter_id = db.Column(db.Integer, db.ForeignKey('saved_filters.id'), nullable=True)
    filter_config_json = db.Column(db.Text, nullable=True)
    frequency = db.Column(db.String(20), nullable=False, default='1hr')
    channel_type = db.Column(db.String(20), nullable=False, default='email')
    channel_target = db.Column(db.String(255), nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    last_run_at = db.Column(db.DateTime, nullable=True)
    next_run_at = db.Column(db.DateTime, nullable=True)
    active_from_time = db.Column(db.String(10), nullable=True)
    active_to_time = db.Column(db.String(10), nullable=True)
    expires_at = db.Column(db.Date, nullable=True)
    filter_repeat_symbols = db.Column(db.Boolean, default=False)
    repeat_threshold = db.Column(db.Integer, default=5)
    symbol_occurrence_counts = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    user = db.relationship('User', backref=db.backref('scanners', lazy=True))
    saved_filter = db.relationship('SavedFilter', backref=db.backref('scanners', lazy=True))
    
    def get_symbols_list(self):
        if not self.symbols:
            return []
        return [s.strip().upper() for s in self.symbols.split(',') if s.strip()]
    
    def get_filter_config(self):
        if self.filter_config_json:
            return json.loads(self.filter_config_json)
        return None
    
    def get_symbol_counts(self):
        if self.symbol_occurrence_counts:
            return json.loads(self.symbol_occurrence_counts)
        return {}
    
    def set_symbol_counts(self, counts):
        self.symbol_occurrence_counts = json.dumps(counts)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'symbol_scope': self.symbol_scope,
            'symbols': self.get_symbols_list(),
            'filter_type': self.filter_type,
            'preset_filter_id': self.preset_filter_id,
            'saved_filter_id': self.saved_filter_id,
            'frequency': self.frequency,
            'channel_type': self.channel_type,
            'channel_target': self.channel_target,
            'is_active': self.is_active,
            'last_run_at': self.last_run_at.isoformat() if self.last_run_at else None,
            'next_run_at': self.next_run_at.isoformat() if self.next_run_at else None,
            'active_from_time': self.active_from_time,
            'active_to_time': self.active_to_time,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'filter_repeat_symbols': self.filter_repeat_symbols,
            'repeat_threshold': self.repeat_threshold,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class ScannerRun(db.Model):
    __tablename__ = 'scanner_runs'
    
    id = db.Column(db.Integer, primary_key=True)
    scanner_id = db.Column(db.Integer, db.ForeignKey('scanners.id', ondelete='SET NULL'), nullable=True)
    scanner_name_cached = db.Column(db.String(100), nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    started_at = db.Column(db.DateTime, default=datetime.utcnow)
    finished_at = db.Column(db.DateTime, nullable=True)
    status = db.Column(db.String(20), default='running')
    symbols_found = db.Column(db.Integer, default=0)
    results_json = db.Column(db.Text, nullable=True)
    error_message = db.Column(db.Text, nullable=True)
    
    scanner = db.relationship('Scanner', backref=db.backref('runs', lazy=True, order_by='ScannerRun.started_at.desc()'))
    
    def get_results(self):
        import math
        if self.results_json:
            results = json.loads(self.results_json)
            cleaned = []
            for r in results:
                clean_r = {}
                for k, v in r.items():
                    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                        clean_r[k] = None
                    else:
                        clean_r[k] = v
                cleaned.append(clean_r)
            return cleaned
        return []
    
    def to_dict(self):
        return {
            'id': self.id,
            'scanner_id': self.scanner_id,
            'scanner_name': self.scanner.name if self.scanner else self.scanner_name_cached or 'Deleted Scanner',
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'finished_at': self.finished_at.isoformat() if self.finished_at else None,
            'status': self.status,
            'symbols_found': self.symbols_found,
            'results': self.get_results()[:10],
            'error_message': self.error_message
        }


class NotificationDelivery(db.Model):
    __tablename__ = 'notification_deliveries'
    
    id = db.Column(db.Integer, primary_key=True)
    run_id = db.Column(db.Integer, db.ForeignKey('scanner_runs.id'), nullable=False)
    channel_type = db.Column(db.String(20), nullable=False)
    channel_target = db.Column(db.String(255), nullable=True)
    status = db.Column(db.String(20), default='pending')
    sent_at = db.Column(db.DateTime, nullable=True)
    error_message = db.Column(db.Text, nullable=True)
    
    run = db.relationship('ScannerRun', backref=db.backref('notifications', lazy=True))
    
    def to_dict(self):
        return {
            'id': self.id,
            'run_id': self.run_id,
            'channel_type': self.channel_type,
            'status': self.status,
            'sent_at': self.sent_at.isoformat() if self.sent_at else None,
            'error_message': self.error_message
        }


class UserNotificationChannel(db.Model):
    __tablename__ = 'user_notification_channels'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    channel_type = db.Column(db.String(20), nullable=False)
    channel_config_encrypted = db.Column(db.Text, nullable=True)
    is_verified = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    user = db.relationship('User', backref=db.backref('notification_channels', lazy=True))
    
    def set_config(self, config_dict):
        self.channel_config_encrypted = encrypt_value(json.dumps(config_dict))
    
    def get_config(self):
        if self.channel_config_encrypted:
            decrypted = decrypt_value(self.channel_config_encrypted)
            if decrypted:
                return json.loads(decrypted)
        return {}
    
    def to_dict(self):
        config = self.get_config()
        masked_config = {}
        for key, value in config.items():
            if key in ['bot_token', 'api_key']:
                masked_config[key] = '***' + value[-4:] if value and len(value) > 4 else '****'
            else:
                masked_config[key] = value
        return {
            'id': self.id,
            'channel_type': self.channel_type,
            'config': masked_config,
            'is_verified': self.is_verified,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
