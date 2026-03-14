# Google OAuth Authentication Blueprint
# Based on Replit's flask_google_oauth integration

import json
import os
import secrets

import requests
from flask import Blueprint, redirect, request, session
from flask_login import login_user
from oauthlib.oauth2 import WebApplicationClient

google_auth = Blueprint("google_auth", __name__)

GOOGLE_DISCOVERY_URL = "https://accounts.google.com/.well-known/openid-configuration"

def get_google_client():
    client_id = os.environ.get("GOOGLE_OAUTH_CLIENT_ID")
    if not client_id:
        return None, None
    client_secret = os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET")
    return WebApplicationClient(client_id), client_secret

def print_setup_instructions():
    dev_domain = os.environ.get("REPLIT_DEV_DOMAIN", "your-repl.repl.co")
    print(f"""
================================================================================
To make Google authentication work:
1. Go to https://console.cloud.google.com/apis/credentials
2. Create a new OAuth 2.0 Client ID
3. Add https://{dev_domain}/google_login/callback to Authorized redirect URIs

For detailed instructions, see:
https://docs.replit.com/additional-resources/google-auth-in-flask#set-up-your-oauth-app--client
================================================================================
""")

@google_auth.route("/google_login")
def login():
    client, _ = get_google_client()
    if not client:
        return "Google OAuth is not configured. Please set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.", 500
    
    google_provider_cfg = requests.get(GOOGLE_DISCOVERY_URL, timeout=10).json()
    authorization_endpoint = google_provider_cfg["authorization_endpoint"]
    
    redirect_uri = request.base_url.replace("http://", "https://") + "/callback"
    state = secrets.token_urlsafe(32)
    session["google_oauth_state"] = state

    request_uri = client.prepare_request_uri(
        authorization_endpoint,
        redirect_uri=redirect_uri,
        scope=["openid", "email", "profile"],
        state=state,
    )
    return redirect(request_uri)


@google_auth.route("/google_login/callback")
def callback():
    from main import app, db, User
    
    error = request.args.get("error")
    if error:
        error_desc = request.args.get("error_description", "Google authentication was cancelled or failed.")
        print(f"Google OAuth error: {error} - {error_desc}")
        return redirect('/login?error=google_auth_failed')
    
    client, client_secret = get_google_client()
    if not client:
        return "Google OAuth is not configured.", 500
    
    client_id = os.environ.get("GOOGLE_OAUTH_CLIENT_ID")
    code = request.args.get("code")
    
    if not code:
        print("Google OAuth callback received without code parameter")
        return redirect('/login?error=google_auth_failed')

    request_state = request.args.get("state")
    session_state = session.pop("google_oauth_state", None)
    if not request_state or not session_state or request_state != session_state:
        print("Google OAuth callback state mismatch")
        return redirect('/login?error=google_auth_failed')
    
    google_provider_cfg = requests.get(GOOGLE_DISCOVERY_URL, timeout=10).json()
    token_endpoint = google_provider_cfg["token_endpoint"]

    token_url, headers, body = client.prepare_token_request(
        token_endpoint,
        authorization_response=request.url.replace("http://", "https://"),
        redirect_url=request.base_url.replace("http://", "https://"),
        code=code,
    )
    token_response = requests.post(
        token_url,
        headers=headers,
        data=body,
        auth=(client_id, client_secret),
        timeout=10,
    )

    client.parse_request_body_response(json.dumps(token_response.json()))

    userinfo_endpoint = google_provider_cfg["userinfo_endpoint"]
    uri, headers, body = client.add_token(userinfo_endpoint)
    userinfo_response = requests.get(uri, headers=headers, data=body, timeout=10)

    userinfo = userinfo_response.json()
    if userinfo.get("email_verified"):
        users_email = userinfo["email"].lower()
        users_name = userinfo.get("name") or userinfo.get("given_name", "User")
    else:
        return "User email not available or not verified by Google.", 400

    with app.app_context():
        user = User.query.filter_by(email=users_email).first()
        if not user:
            user = User(
                email=users_email,
                name=users_name,
                is_verified=True,
                selected_plan='free',
                auth_provider='google'
            )
            user.set_password(os.urandom(32).hex())
            db.session.add(user)
            db.session.commit()
        elif user.auth_provider == 'email':
            return redirect('/login?error=email_account_exists')

        login_user(user)
        return redirect("/dashboard")
