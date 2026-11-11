from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from lib import development_warmup


class DevelopmentWarmupTests(unittest.TestCase):
    def test_warms_matches_and_only_distinct_local_next_scripts(self):
        document = b'''
            <link rel="preload" as="script" href="/_next/static/chunks/main.js?v=1">
            <script src="/_next/static/chunks/main.js?v=1"></script>
            <script src="/_next/static/chunks/route.js"></script>
            <script src="https://example.test/_next/static/chunks/remote.js"></script>
            <script src="//example.test/_next/static/chunks/remote.js"></script>
            <script src="/_next/static/%2e%2e/api/private.js"></script>
            <link rel="preload" as="style" href="/_next/static/chunks/layout.css">
        '''
        with patch.object(development_warmup, "_read_loopback", side_effect=lambda _port, path, _deadline:
                          document if path == "/en/matches" else b"local script") as read, patch("builtins.print"):
            development_warmup.warm_football_matches(3000)

        calls = [call.args for call in read.call_args_list]
        self.assertEqual(calls[0][:2], (3000, "/en/matches"))
        self.assertCountEqual([call[1] for call in calls[1:]], [
            "/_next/static/chunks/main.js?v=1", "/_next/static/chunks/route.js",
        ])
        self.assertTrue(all(port == 3000 and deadline == calls[0][2] for port, _, deadline in calls))

    def test_failed_document_does_not_request_assets(self):
        with patch.object(development_warmup, "_read_loopback", return_value=None) as read, patch("builtins.print"):
            development_warmup.warm_football_matches(3000)
        self.assertEqual(read.call_count, 1)
