"""The continuous importer follows provider limits and never treats a drained pass as full coverage."""
import importlib.util
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch


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
        replay = {"status": "partial", "stopped": None, "requests": 0, "imported": 2}
        with patch.object(runner, "run_batch", side_effect=[(0, fixture, None), (0, detail, None),
                                                          (0, reference, None), (0, replay, None), (130, None, None)]) as run, \
             patch.object(runner, "report_state"), patch.object(runner.time, "sleep") as sleep:
            self.assertEqual(runner.run_continuous(["node"], ["--requests", "2"], {}), 130)
        self.assertEqual([call.args[0] for call in run.call_args_list], [
            ["node", "--requests", "2"], ["node", "--requests", "2", "--details"],
            ["node", "--requests", "2", "--reference"], ["node", "--replay"], ["node", "--requests", "2"],
        ])
        sleep.assert_not_called()

    def test_quota_pauses_the_entire_import_and_a_drained_pass_waits(self):
        denied = {"status": "partial", "stopped": "quota-denied", "requests": 0}
        drained = {"status": "complete", "stopped": None, "requests": 0}
        with patch.object(runner, "run_batch", side_effect=[(0, denied, None), (0, denied, None),
                                                          *((0, drained, None),) * 4, (130, None, None)]) as run, \
             patch.object(runner, "report_state"), patch.object(runner.time, "sleep") as sleep:
            self.assertEqual(runner.run_continuous(["node"], [], {}), 130)
        self.assertEqual([call.args[0] for call in run.call_args_list[:4]], [["node"], ["node", "--details"],
                                                                            ["node", "--reference"], ["node", "--replay"]])
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [30, 60, 900])

    def test_storage_failures_back_off_and_access_failures_stop(self):
        transient = {"reason": "database-conflict", "retryable": True}
        drained = {"status": "complete", "stopped": None, "requests": 0}
        denied = {"status": "catalog-unavailable", "reason": "invalid-credential", "requests": 0}
        with patch.object(runner, "run_batch", side_effect=[(1, None, transient), (0, drained, None),
                                                          (0, drained, None), (0, drained, None), (1, denied, None)]) as run, \
             patch.object(runner, "report_state") as report, patch.object(runner.time, "sleep") as sleep:
            self.assertEqual(runner.run_continuous(["node"], [], {}), 1)
        self.assertEqual(run.call_count, 5)
        sleep.assert_called_once_with(30)
        report.assert_any_call("blocked", phase="fixtures", reason="invalid-credential")

    def test_quota_pause_after_a_worked_batch_yields_to_the_next_phase(self):
        worked = {"status": "partial", "stopped": "quota-denied", "requests": 2, "imported": 2}
        with patch.object(runner, "run_batch", side_effect=[(0, worked, None), (130, None, None)]) as run, \
             patch.object(runner, "report_state"), patch.object(runner.time, "sleep") as sleep:
            self.assertEqual(runner.run_continuous(["node"], [], {}), 130)
        self.assertEqual(run.call_args_list[1].args[0], ["node", "--details"])
        sleep.assert_called_once_with(30)

    def test_provider_transport_pause_backs_off_across_phases(self):
        unavailable = {"status": "partial", "stopped": "provider-transport-unavailable", "requests": 3}
        with patch.object(runner, "run_batch", side_effect=[(0, unavailable, None), (0, unavailable, None),
                                                          (130, None, None)]) as run, \
             patch.object(runner, "report_state") as report, patch.object(runner.time, "sleep") as sleep:
            self.assertEqual(runner.run_continuous(["node"], [], {}), 130)
        self.assertEqual([call.args[0] for call in run.call_args_list], [["node"], ["node", "--details"],
                                                                     ["node", "--reference"]])
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [30, 60])
        report.assert_any_call("waiting-for-provider", retrySeconds=60)

    def test_unavailable_owned_database_prepares_once_per_retry_without_advancing_the_phase(self):
        unavailable = {"reason": "local-target-unavailable", "retryable": True}
        prepare = Mock()
        with patch.object(runner, "run_batch", side_effect=[(1, None, unavailable), (130, None, None)]) as run, \
             patch.object(runner, "report_state") as report, patch.object(runner.time, "sleep") as sleep:
            self.assertEqual(runner.run_continuous(["node"], [], {}, prepare_database=prepare), 130)
        self.assertEqual([call.args[0] for call in run.call_args_list], [["node"], ["node"]])
        prepare.assert_called_once_with()
        sleep.assert_called_once_with(30)
        report.assert_any_call("waiting-for-local-database", retrySeconds=30)

    def test_prepare_uses_the_owned_snapshot_launcher_without_inheriting_live_mode(self):
        def prepare_once(*_args, prepare_database):
            prepare_database()
            return 0

        with TemporaryDirectory() as folder:
            root = Path(folder)
            database = root / ".goal-hint" / runner.LocalFootballMysql.directory_name
            (database / "mysql").mkdir(parents=True)
            (database / "owner.txt").touch()
            with patch.object(runner, "ROOT", root), patch.object(runner, "node_binary", return_value="node"), \
                 patch.object(runner, "run_continuous", side_effect=prepare_once), patch.object(runner, "report_state"), \
                 patch.object(runner.subprocess, "Popen") as spawn, \
                 patch.dict(runner.os.environ, {"GOAL_HINT_DEMO": "false"}), \
                 patch.object(runner.sys, "argv", ["runner", "--continuous", "--prepare-database"]):
                self.assertEqual(runner.main(), 0)
            self.assertEqual(spawn.call_args.args[0][-2:], [str(root / "scripts" / "development.py"), "--prepare-local-football"])
            self.assertNotIn("GOAL_HINT_DEMO", spawn.call_args.kwargs["env"])
