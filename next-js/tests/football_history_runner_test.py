"""The continuous importer follows provider limits and never treats a drained pass as full coverage."""
import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import patch


SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
SPEC = importlib.util.spec_from_file_location("football_history_runner", SCRIPTS / "backfill-football-history.py")
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


class FootballHistoryRunnerTests(unittest.TestCase):
    def test_continuous_mode_advances_each_phase(self):
        fixture = {"status": "partial", "stopped": "request-budget", "requests": 2}
        detail = {"status": "complete", "stopped": None, "requests": 0}
        reference = {"status": "partial", "stopped": None, "requests": 2, "archived": 2}
        with patch.object(runner, "run_batch", side_effect=[(0, fixture, None), (0, detail, None),
                                                          (0, reference, None), (130, None, None)]) as run, \
             patch.object(runner, "report_state"), patch.object(runner.time, "sleep") as sleep:
            self.assertEqual(runner.run_continuous(["node"], ["--requests", "2"], {}), 130)
        self.assertEqual([call.args[0] for call in run.call_args_list], [
            ["node", "--requests", "2"], ["node", "--requests", "2", "--details"],
            ["node", "--requests", "2", "--reference"], ["node", "--requests", "2"],
        ])
        sleep.assert_not_called()

    def test_quota_pauses_the_entire_import_and_a_drained_pass_waits(self):
        denied = {"status": "partial", "stopped": "quota-denied", "requests": 0}
        drained = {"status": "complete", "stopped": None, "requests": 0}
        with patch.object(runner, "run_batch", side_effect=[(0, denied, None), (0, denied, None),
                                                          *((0, drained, None),) * 3, (130, None, None)]) as run, \
             patch.object(runner, "report_state"), patch.object(runner.time, "sleep") as sleep:
            self.assertEqual(runner.run_continuous(["node"], [], {}), 130)
        self.assertEqual([call.args[0] for call in run.call_args_list[:3]], [["node"]] * 3)
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [30, 60, 900])

    def test_storage_failures_back_off_and_access_failures_stop(self):
        transient = {"reason": "database-conflict", "retryable": True}
        drained = {"status": "complete", "stopped": None, "requests": 0}
        denied = {"status": "catalog-unavailable", "reason": "invalid-credential", "requests": 0}
        with patch.object(runner, "run_batch", side_effect=[(1, None, transient), (0, drained, None),
                                                          (0, drained, None), (1, denied, None)]) as run, \
             patch.object(runner, "report_state") as report, patch.object(runner.time, "sleep") as sleep:
            self.assertEqual(runner.run_continuous(["node"], [], {}), 1)
        self.assertEqual(run.call_count, 4)
        sleep.assert_called_once_with(30)
        report.assert_any_call("blocked", phase="fixtures", reason="invalid-credential")

    def test_quota_pause_after_a_worked_batch_yields_to_the_next_phase(self):
        worked = {"status": "partial", "stopped": "quota-denied", "requests": 2, "imported": 2}
        with patch.object(runner, "run_batch", side_effect=[(0, worked, None), (130, None, None)]) as run, \
             patch.object(runner, "report_state"), patch.object(runner.time, "sleep") as sleep:
            self.assertEqual(runner.run_continuous(["node"], [], {}), 130)
        self.assertEqual(run.call_args_list[1].args[0], ["node", "--details"])
        sleep.assert_called_once_with(30)
