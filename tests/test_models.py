import unittest

from models import Scanner, ScannerRun, UserNotificationChannel


class ModelUtilityTestCase(unittest.TestCase):
    def test_scanner_symbol_helpers_normalize_input(self):
        scanner = Scanner(symbols=" aapl, msft , spy ")

        self.assertEqual(scanner.get_symbols_list(), ["AAPL", "MSFT", "SPY"])

    def test_scanner_run_results_cleanup_replaces_nan_and_inf(self):
        run = ScannerRun()
        run.results_json = (
            '[{"ticker": "AAPL", "value": NaN}, '
            '{"ticker": "MSFT", "value": Infinity}, '
            '{"ticker": "SPY", "value": 1.5}]'
        )

        results = run.get_results()

        self.assertIsNone(results[0]["value"])
        self.assertIsNone(results[1]["value"])
        self.assertEqual(results[2]["value"], 1.5)

    def test_notification_channel_masks_sensitive_config(self):
        channel = UserNotificationChannel(channel_type="telegram")
        channel.set_config(
            {
                "bot_token": "1234567890:ABCDEF1234567890",
                "chat_id": "42",
                "api_key": "secret-api-key",
            }
        )

        masked = channel.to_dict()["config"]

        self.assertTrue(masked["bot_token"].startswith("***"))
        self.assertEqual(masked["chat_id"], "42")
        self.assertTrue(masked["api_key"].startswith("***"))


if __name__ == "__main__":
    unittest.main()
