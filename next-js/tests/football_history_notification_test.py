"""Archive completion receipts suppress repeated accepted messages and permit retries."""
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from lib import football_history_notification as notification


class FootballHistoryNotificationTests(unittest.TestCase):
    def test_accepted_message_creates_a_receipt_for_the_completion_key(self):
        with TemporaryDirectory() as folder, patch.object(notification, "_post_windows_message", return_value=True) as post:
            directory = Path(folder)
            message = "API-Football archive verified."
            self.assertEqual(notification.notify_archive_complete(directory, "first", message), "delivered")
            self.assertEqual(notification.notify_archive_complete(directory, "first", message), "already-delivered")
            post.assert_called_once_with(message)
            self.assertEqual(notification.notify_archive_complete(directory, "second", message), "delivered")
            self.assertEqual(post.call_count, 2)

    def test_unavailable_session_keeps_the_verified_message_for_a_later_run(self):
        with TemporaryDirectory() as folder, patch.object(notification, "_post_windows_message") as post:
            directory = Path(folder)
            message = "API-Football archive verified."
            receipt_directory = directory / "history-completion-notifications"

            def unavailable(text):
                self.assertEqual(text, message)
                records = [json.loads(path.read_bytes()) for path in receipt_directory.iterdir()]
                self.assertIn({"status": "pending", "message": message}, records)
                return False

            self.assertEqual(notification.retry_archive_notification(directory, "first"), "pending")
            self.assertFalse(receipt_directory.exists())
            post.side_effect = unavailable
            self.assertEqual(notification.notify_archive_complete(directory, "first", message), "retryable")
            self.assertEqual(len(list(receipt_directory.iterdir())), 1)
            post.side_effect = None
            post.return_value = True
            self.assertEqual(notification.retry_archive_notification(directory, "first"), "delivered")
            self.assertEqual(notification.retry_archive_notification(directory, "first"), "already-delivered")
            self.assertEqual(post.call_count, 2)

    def test_unwritable_receipt_directory_leaves_notification_pending(self):
        with TemporaryDirectory() as folder, patch.object(notification, "_post_windows_message") as post:
            directory = Path(folder)
            (directory / "history-completion-notifications").touch()
            result = notification.notify_archive_complete(directory, "first", "API-Football archive verified.")
            self.assertEqual(result, "retryable")
            post.assert_not_called()
