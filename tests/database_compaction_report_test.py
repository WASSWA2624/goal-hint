"""The compaction census command is read-only, bounded and independent of real database access."""
from contextlib import redirect_stderr, redirect_stdout
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("database_compaction_report", ROOT / "scripts/database-compaction-report.py")
report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(report)
from lib.runtime import CommandError  # noqa: E402

FIXTURE = "0000000a-0000-4000-8000-00000000000b"


def measured(coverage="complete"):
    return {"status": "measured", "report": {"version": 1, "mode": "dry-run", "scope": {"coverage": coverage}}}


def parse(*argv):
    with redirect_stderr(io.StringIO()):
        return report.parser().parse_args(list(argv))


class CompactionReportTests(unittest.TestCase):
    def test_the_parser_has_no_apply_delete_or_execute_option(self):
        for flag in ["--apply", "--delete", "--execute", "--force", "--record"]:
            with self.subTest(flag=flag), self.assertRaises(SystemExit) as raised:
                parse(flag)
            self.assertEqual(raised.exception.code, 2)
        options = {action.dest for action in report.parser()._actions}
        self.assertEqual(options, {"help", "max_fixtures", "page_size", "max_batches", "after_fixture", "after_batch"})

    def test_bounds_and_cursors_are_validated_before_the_service(self):
        for argv in [["--max-fixtures", "0"], ["--max-fixtures", "20001"], ["--page-size", "501"], ["--page-size", "1.5"],
                     ["--max-batches", "-1"], ["--after-fixture", "not-a-uuid"], ["--after-fixture", FIXTURE.upper()],
                     ["--after-batch", "a" * 63], ["--after-batch", "A" * 64]]:
            with self.subTest(argv=argv), self.assertRaises(SystemExit) as raised:
                parse(*argv)
            self.assertEqual(raised.exception.code, 2)

    def test_payload_carries_the_bounds_and_the_long_timeout(self):
        args = parse("--max-fixtures", "50", "--page-size", "10", "--max-batches", "0", "--after-fixture", FIXTURE, "--after-batch", "b" * 64)
        with patch.object(report, "service", return_value=measured()) as service, redirect_stdout(io.StringIO()) as output:
            self.assertEqual(report.run(args), 0)
        service.assert_called_once_with("database-compaction-report", {"maxFixtures": 50, "pageSize": 10, "maxBatches": 0,
                                                                        "afterFixture": FIXTURE, "afterBatch": "b" * 64}, timeout=600)
        self.assertEqual(json.loads(output.getvalue())["report"]["mode"], "dry-run")
        defaults = report.payload(parse())
        self.assertEqual(defaults, {"maxFixtures": 2000, "pageSize": 200, "maxBatches": 5000, "afterFixture": None, "afterBatch": None})

    def test_exit_codes_distinguish_complete_partial_and_unavailable(self):
        for response, code in [(measured(), 0), (measured("partial"), 3), ({"status": "disabled"}, 1), (None, 1)]:
            with self.subTest(code=code), patch.object(report, "service", return_value=response), redirect_stdout(io.StringIO()):
                self.assertEqual(report.run(parse()), code)
        with patch.object(report, "service", side_effect=CommandError("History compaction report unavailable.")):
            with redirect_stderr(io.StringIO()) as errors, self.assertRaises(SystemExit) as raised:
                report.main_guard(lambda: report.run(parse()))
        self.assertEqual(raised.exception.code, 1)
        self.assertIn("unavailable", errors.getvalue())

    def test_no_files_are_created(self):
        with tempfile.TemporaryDirectory() as directory:
            before = os.getcwd()
            os.chdir(directory)
            try:
                for response in [measured(), measured("partial"), {"status": "disabled"}]:
                    with patch.object(report, "service", return_value=response), redirect_stdout(io.StringIO()):
                        report.run(parse())
                self.assertEqual(list(Path(directory).iterdir()), [])
            finally:
                os.chdir(before)
        self.assertFalse((ROOT / ".goal-hint" / "compaction").exists())


if __name__ == "__main__":
    unittest.main()
