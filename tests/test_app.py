import importlib
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock


def load_main_module():
    """Import the Flask app with isolated environment settings."""
    db_fd, db_path = tempfile.mkstemp(prefix="backtestpro-test-", suffix=".db")
    os.close(db_fd)

    os.environ["FLASK_SECRET_KEY"] = "test-secret-key"
    os.environ["DATABASE_URL"] = f"sqlite:///{db_path}"
    os.environ["AUTO_CREATE_SCHEMA"] = "1"
    os.environ["ENABLE_SCHEDULER"] = "0"
    os.environ["STRIPE_WEBHOOK_SECRET"] = "whsec_test"
    os.environ.pop("MAILTRAP_USERNAME", None)
    os.environ.pop("MAILTRAP_PASSWORD", None)
    os.environ.pop("GOOGLE_OAUTH_CLIENT_ID", None)
    os.environ.pop("GOOGLE_OAUTH_CLIENT_SECRET", None)

    for module_name in ["main", "google_auth"]:
        sys.modules.pop(module_name, None)

    module = importlib.import_module("main")
    return module, Path(db_path)


class AppTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.main, cls.db_path = load_main_module()
        cls.app = cls.main.app
        cls.db = cls.main.db

    @classmethod
    def tearDownClass(cls):
        if cls.db_path.exists():
            cls.db_path.unlink()

    def setUp(self):
        self.client = self.app.test_client()
        with self.app.app_context():
            self.db.session.remove()
            self.db.drop_all()
            self.db.create_all()

    def create_user(self, **overrides):
        user = self.main.User(
            email=overrides.get("email", "user@example.com"),
            name=overrides.get("name", "Test User"),
            is_verified=overrides.get("is_verified", True),
            selected_plan=overrides.get("selected_plan", "free"),
            stripe_customer_id=overrides.get("stripe_customer_id"),
            stripe_subscription_id=overrides.get("stripe_subscription_id"),
            auth_provider=overrides.get("auth_provider", "email"),
        )
        user.set_password(overrides.get("password", "correct-horse-battery"))
        with self.app.app_context():
            self.db.session.add(user)
            self.db.session.commit()
            return user.id

    def login(self, email="user@example.com", password="correct-horse-battery"):
        return self.client.post(
            "/api/auth/login",
            json={"email": email, "password": password},
        )

    def test_register_creates_verified_user_without_mailtrap(self):
        response = self.client.post(
            "/api/auth/register",
            json={
                "email": "new@example.com",
                "password": "super-secure-password",
                "name": "New User",
                "plan": "free",
            },
        )

        self.assertEqual(response.status_code, 201)
        body = response.get_json()
        self.assertEqual(body["redirect"], "/login")

        with self.app.app_context():
            user = self.main.User.query.filter_by(email="new@example.com").first()
            self.assertIsNotNone(user)
            self.assertTrue(user.is_verified)

    def test_register_rejects_unknown_plan(self):
        response = self.client.post(
            "/api/auth/register",
            json={
                "email": "badplan@example.com",
                "password": "super-secure-password",
                "plan": "enterprise-root-shell",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["error"], "Invalid plan selected")

    def test_login_returns_token_and_bearer_auth_loads_user(self):
        self.create_user(email="login@example.com")

        login_response = self.client.post(
            "/api/auth/login",
            json={"email": "login@example.com", "password": "correct-horse-battery"},
        )

        self.assertEqual(login_response.status_code, 200)
        token = login_response.get_json()["token"]
        self.assertTrue(token)

        auth_response = self.client.get(
            "/api/auth/user",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(auth_response.status_code, 200)
        self.assertEqual(auth_response.get_json()["email"], "login@example.com")

    def test_expired_bearer_token_is_cleared(self):
        user_id = self.create_user(email="expired@example.com")

        with self.app.app_context():
            user = self.main.User.query.get(user_id)
            user.generate_auth_token()
            user.auth_token_expires = self.main.datetime.utcnow() - self.main.timedelta(minutes=1)
            expired_token = user.auth_token
            self.db.session.commit()

        response = self.client.get(
            "/api/auth/status",
            headers={"Authorization": f"Bearer {expired_token}"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.get_json()["authenticated"])

        with self.app.app_context():
            user = self.main.User.query.get(user_id)
            self.assertIsNone(user.auth_token)
            self.assertIsNone(user.auth_token_expires)

    def test_resend_verification_is_generic_for_missing_account(self):
        response = self.client.post(
            "/api/auth/resend-verification",
            json={"email": "missing@example.com"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("If an unverified account exists", response.get_json()["message"])

    def test_reset_password_revokes_existing_bearer_token(self):
        user_id = self.create_user(email="reset@example.com")

        with self.app.app_context():
            user = self.main.User.query.get(user_id)
            user.generate_auth_token()
            user.generate_password_reset_token()
            reset_token = user.password_reset_token
            self.db.session.commit()

        response = self.client.post(
            "/api/auth/reset-password",
            json={"token": reset_token, "password": "new-password-123"},
        )

        self.assertEqual(response.status_code, 200)
        with self.app.app_context():
            user = self.main.User.query.get(user_id)
            self.assertIsNone(user.auth_token)
            self.assertIsNone(user.auth_token_expires)
            self.assertTrue(user.check_password("new-password-123"))

    def test_update_plan_rejects_paid_plan_without_billing_confirmation(self):
        self.create_user(email="plan@example.com")
        self.login(email="plan@example.com")

        response = self.client.post(
            "/api/user/update-plan",
            json={"plan": "options-advanced"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Only free plans", response.get_json()["error"])

    def test_confirm_subscription_rejects_foreign_stripe_customer(self):
        self.create_user(
            email="billing@example.com",
            stripe_customer_id="cus_local",
        )
        self.login(email="billing@example.com")
        subscription = SimpleNamespace(
            id="sub_123",
            status="active",
            customer="cus_other",
            metadata={"plan_id": "options-starter", "user_id": "1"},
        )

        with mock.patch.object(self.main, "get_stripe_credentials", return_value=("pk_test", "sk_test")):
            with mock.patch.object(self.main.stripe.Subscription, "retrieve", return_value=subscription):
                response = self.client.post(
                    "/api/stripe/confirm-subscription",
                    json={"subscription_id": "sub_123"},
                )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.get_json()["error"], "Subscription does not belong to this account")

    def test_confirm_upgrade_rejects_plan_mismatch(self):
        self.create_user(
            email="upgrade@example.com",
            selected_plan="options-starter",
            stripe_customer_id="cus_local",
            stripe_subscription_id="sub_local",
        )
        self.login(email="upgrade@example.com")
        payment_intent = SimpleNamespace(
            id="pi_123",
            status="succeeded",
            customer="cus_local",
            invoice=None,
        )
        subscription = SimpleNamespace(
            id="sub_local",
            customer="cus_local",
            metadata={"plan_id": "options-developer", "user_id": "1"},
            current_period_start=None,
        )

        with mock.patch.object(self.main, "get_stripe_credentials", return_value=("pk_test", "sk_test")):
            with mock.patch.object(self.main.stripe.PaymentIntent, "retrieve", return_value=payment_intent):
                with mock.patch.object(self.main.stripe.Subscription, "retrieve", return_value=subscription):
                    response = self.client.post(
                        "/api/stripe/confirm-upgrade",
                        json={"payment_intent_id": "pi_123", "plan_id": "options-advanced"},
                    )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["error"], "Plan confirmation mismatch")

    def test_webhook_rejects_missing_signature(self):
        response = self.client.post("/api/stripe/webhook", data=b"{}")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["error"], "Missing Stripe signature")

    def test_webhook_updates_user_entitlement_from_subscription_event(self):
        user_id = self.create_user(
            email="webhook@example.com",
            selected_plan="free",
            stripe_customer_id="cus_webhook",
        )
        subscription = {
            "id": "sub_webhook",
            "status": "active",
            "customer": "cus_webhook",
            "metadata": {"plan_id": "options-starter", "user_id": str(user_id)},
            "items": {"data": [{"price": {"unit_amount": 4900}}]},
            "current_period_start": 1_700_000_000,
            "cancel_at_period_end": False,
            "cancel_at": None,
        }
        event = {"type": "customer.subscription.updated", "data": {"object": subscription}}

        with mock.patch.object(self.main.stripe.Webhook, "construct_event", return_value=event):
            response = self.client.post(
                "/api/stripe/webhook",
                data=b"{}",
                headers={"Stripe-Signature": "sig_test"},
            )

        self.assertEqual(response.status_code, 200)
        with self.app.app_context():
            user = self.main.User.query.get(user_id)
            self.assertEqual(user.selected_plan, "options-starter")
            self.assertEqual(user.stripe_subscription_id, "sub_webhook")
            self.assertEqual(user.highest_paid_plan_this_cycle, "options-starter")
            self.assertEqual(user.highest_paid_price_this_cycle, 4900)

    def test_webhook_clears_entitlement_on_subscription_deleted(self):
        user_id = self.create_user(
            email="deleted@example.com",
            selected_plan="options-starter",
            stripe_customer_id="cus_deleted",
            stripe_subscription_id="sub_deleted",
        )
        event = {
            "type": "customer.subscription.deleted",
            "data": {
                "object": {
                    "id": "sub_deleted",
                    "status": "canceled",
                    "customer": "cus_deleted",
                    "metadata": {"user_id": str(user_id)},
                }
            },
        }

        with mock.patch.object(self.main.stripe.Webhook, "construct_event", return_value=event):
            response = self.client.post(
                "/api/stripe/webhook",
                data=b"{}",
                headers={"Stripe-Signature": "sig_test"},
            )

        self.assertEqual(response.status_code, 200)
        with self.app.app_context():
            user = self.main.User.query.get(user_id)
            self.assertEqual(user.selected_plan, "free")
            self.assertIsNone(user.stripe_subscription_id)
            self.assertEqual(user.stripe_customer_id, "cus_deleted")

    def test_invoice_payment_failed_revokes_entitlement_when_subscription_is_unpaid(self):
        user_id = self.create_user(
            email="failed@example.com",
            selected_plan="options-starter",
            stripe_customer_id="cus_failed",
            stripe_subscription_id="sub_failed",
        )
        event = {
            "type": "invoice.payment_failed",
            "data": {
                "object": {
                    "id": "in_failed",
                    "customer": "cus_failed",
                    "subscription": "sub_failed",
                }
            },
        }
        subscription = {
            "id": "sub_failed",
            "status": "unpaid",
            "customer": "cus_failed",
            "metadata": {"plan_id": "options-starter", "user_id": str(user_id)},
            "items": {"data": [{"price": {"unit_amount": 4900}}]},
            "cancel_at_period_end": False,
            "cancel_at": None,
        }

        with mock.patch.object(self.main.stripe.Webhook, "construct_event", return_value=event):
            with mock.patch.object(self.main, "get_stripe_credentials", return_value=("pk_test", "sk_test")):
                with mock.patch.object(self.main.stripe.Subscription, "retrieve", return_value=subscription):
                    response = self.client.post(
                        "/api/stripe/webhook",
                        data=b"{}",
                        headers={"Stripe-Signature": "sig_test"},
                    )

        self.assertEqual(response.status_code, 200)
        with self.app.app_context():
            user = self.main.User.query.get(user_id)
            self.assertEqual(user.selected_plan, "free")
            self.assertIsNone(user.stripe_subscription_id)

    def test_health_endpoint_reports_database_status(self):
        response = self.client.get("/api/health")

        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual(body["status"], "healthy")
        self.assertEqual(body["database"]["status"], "ok")
        self.assertIn("migrations_enabled", body)
        self.assertIn("auto_create_schema", body)

    def test_liveness_endpoint_is_lightweight(self):
        response = self.client.get("/api/health/live")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["status"], "alive")

    def test_convert_legs_array_to_dict_ignores_invalid_items(self):
        result = self.main.convert_legs_array_to_dict(
            [
                {
                    "name": "Long Call",
                    "config_type": "pct_underlying",
                    "params": {"offset": 5},
                },
                {"config_type": "missing_name"},
                "not-a-dict",
            ]
        )

        self.assertEqual(
            result,
            {"Long Call": {"config_type": "pct_underlying", "params": {"offset": 5}}},
        )


if __name__ == "__main__":
    unittest.main()
