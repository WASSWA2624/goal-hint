"""The demo launcher must never inherit real provider/database configuration."""
import importlib.util
import io
from pathlib import Path
import sys
import unittest
import subprocess
from unittest.mock import patch
from unittest.mock import MagicMock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
SPEC = importlib.util.spec_from_file_location("development_demo_launcher", ROOT / "scripts/development.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class DemoEnvironmentTests(unittest.TestCase):
    def test_private_targets_and_paid_provider_settings_are_replaced(self):
        source = {"DATABASE_URL": "mysql://private@remote.invalid/real", "API_FOOTBALL_KEY": "private-football-key",
                  "AI_API_KEY": "private-ai-key", "GOAL_HINT_OPERATION_SCOPE": "production",
                  "GOAL_HINT_ADMIN_PASSWORD": "private-admin-password", "GOAL_HINT_FOOTBALL_ENABLED": "true",
                  "GOAL_HINT_AI_ENABLED": "true", "NEXT_PUBLIC_OTHER_FLAG": "secret", "PATH": "runtime-path"}
        env = MODULE.demo_environment("mysql://root@127.0.0.1:43210/goal_hint_demo", source)
        self.assertEqual(env["DATABASE_URL"], "mysql://root@127.0.0.1:43210/goal_hint_demo")
        self.assertEqual(env["MIGRATION_DATABASE_URL"], env["DATABASE_URL"])
        self.assertEqual(env["GOAL_HINT_OPERATION_SCOPE"], "disabled")
        self.assertEqual(env["GOAL_HINT_FOOTBALL_ENABLED"], "false")
        self.assertEqual(env["GOAL_HINT_AI_ENABLED"], "false")
        self.assertEqual(env["GOAL_HINT_ADMIN_PASSWORD"], "DemoGoalHintAdmin2026!")
        self.assertEqual(env["GOAL_HINT_ADMIN_PHONES"], '["256700000099"]')
        self.assertEqual(env.get("GOAL_HINT_ADMIN_PASSWORD_HASH", ""), "")
        self.assertEqual(env["API_FOOTBALL_KEY"], "")
        self.assertEqual(env["AI_API_KEY"], "")
        self.assertEqual(env["NEXT_PUBLIC_OTHER_FLAG"], "")
        self.assertEqual(env["PATH"], "runtime-path")
        self.assertEqual(source["GOAL_HINT_OPERATION_SCOPE"], "production")

    def test_demo_members_can_be_explicitly_disabled(self):
        env = MODULE.demo_environment("mysql://root@127.0.0.1:43210/goal_hint_demo", {"GOAL_HINT_DEMO_MEMBER": "false"})
        self.assertEqual(env["GOAL_HINT_DEMO_MEMBER"], "false")
        self.assertEqual(env["NODE_ENV"], "development")
        self.assertEqual(env["NEXT_PUBLIC_GOAL_HINT_DEMO"], "true")

    def test_launcher_environment_satisfies_the_actual_runtime_policy(self):
        source = dict(MODULE.os.environ, GOAL_HINT_DEMO_MYSQL_BINARY="C:/mysql/bin/mysqld.exe")
        env = MODULE.demo_environment("mysql://root@127.0.0.1:43210/goal_hint_demo", source)
        result = subprocess.run([MODULE.node_binary(), "--conditions=react-server", "--input-type=module", "-e",
            "import {parseRuntimePolicy} from './src/server/config/runtime-policy.ts'; "
            "const p=parseRuntimePolicy(process.env); if(p.mode!=='development'||!p.capabilities.database) process.exit(1)"],
            cwd=ROOT, env=env, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_npm_runtime_wins_over_an_unrelated_machine_runtime(self):
        with patch.dict(MODULE.os.environ, {"npm_node_execpath": "project-node", "NODE_BINARY": "other-tool-node"}):
            self.assertEqual(MODULE.development_node_binary(), "project-node")


class DevelopmentRestartTests(unittest.TestCase):
    def test_requested_port_overrides_environment_and_is_passed_explicitly(self):
        cases = [([], {}, 3000), ([], {"PORT": "4100"}, 4100),
                 (["--port", "4200"], {"PORT": "invalid"}, 4200),
                 (["-p", "4300"], {}, 4300), (["--port=4400"], {}, 4400),
                 (["-p=4500"], {}, 4500), (["-p4600"], {}, 4600),
                 (["--port", "4000", "--port=4700"], {}, 4700)]
        for args, env, expected in cases:
            with self.subTest(args=args):
                forwarded, port = MODULE.web_arguments(["--hostname", "127.0.0.1", *args], env)
                self.assertEqual(port, expected)
                self.assertEqual(forwarded, ["--hostname", "127.0.0.1", "--port", str(expected)])

    def test_invalid_ports_fail_before_releasing_any_process(self):
        for value in ["0", "65536", "-1", "1.5", "", "abc"]:
            with self.subTest(value=value), self.assertRaises(MODULE.CommandError):
                MODULE.web_arguments(["--port", value], {})
        with self.assertRaises(MODULE.CommandError):
            MODULE.web_arguments(["--port"], {})

    def test_only_this_checkout_web_processes_are_selected_for_orphan_cleanup(self):
        project = str(ROOT / "node_modules/next/dist/bin/next")
        owned = {"pid": 40, "name": "node.exe", "command": f'node "{project}" dev --port 4000'}
        foreign = {"pid": 41, "name": "node.exe", "command": 'node "D:/another-app/node_modules/next/dist/bin/next" dev'}
        production = {"pid": 42, "name": "node.exe", "command": f'node "{project}" start --port 3001'}
        inspector = {"pid": 43, "name": "powershell.exe", "command": f'Write-Output "{project} dev"'}
        with patch.object(MODULE, "release_port") as release, patch.object(MODULE, "process_snapshot", return_value=[owned, foreign, production, inspector]), \
                patch.object(MODULE, "stop_process") as stop:
            MODULE.release_development_web(3000)
        release.assert_called_once_with(3000)
        stop.assert_called_once_with(owned, tree=True)

    def test_binding_race_releases_and_retries_only_the_web_process(self):
        failed, ready = MagicMock(), MagicMock()
        failed.stdout = io.StringIO("Error: listen EADDRINUSE: address already in use\n")
        failed.wait.return_value = 1
        failed.poll.return_value = 1
        ready.stdout = io.StringIO("Ready\n")
        ready.wait.return_value = 0
        ready.poll.return_value = 0
        with patch.object(MODULE.subprocess, "Popen", side_effect=[failed, ready]) as spawn, \
                patch.object(MODULE, "release_port") as release:
            self.assertEqual(MODULE.run_web(["--port", "3000"], {}, 3000), 0)
        self.assertEqual(release.call_count, 2)
        self.assertEqual(spawn.call_count, 2)

    def test_non_port_failures_are_returned_without_a_restart_loop(self):
        failed = MagicMock()
        failed.stdout = io.StringIO("Invalid Next configuration\n")
        failed.wait.return_value = 1
        failed.poll.return_value = 1
        with patch.object(MODULE.subprocess, "Popen", return_value=failed) as spawn, \
                patch.object(MODULE, "release_port"):
            self.assertEqual(MODULE.run_web(["--port", "3000"], {}, 3000), 1)
        spawn.assert_called_once()

    def test_repeated_binding_races_have_a_bounded_restart_count(self):
        children = []
        for _ in range(3):
            child = MagicMock()
            child.stdout = io.StringIO("EADDRINUSE\n")
            child.wait.return_value = 1
            child.poll.return_value = 1
            children.append(child)
        with patch.object(MODULE.subprocess, "Popen", side_effect=children) as spawn, \
                patch.object(MODULE, "release_port"):
            self.assertEqual(MODULE.run_web(["--port", "3000"], {}, 3000), 1)
        self.assertEqual(spawn.call_count, 3)

    def test_interruption_stops_the_known_posix_web_tree(self):
        child = MagicMock()
        child.pid = 30
        child.poll.return_value = None
        child.stdout.__iter__.side_effect = KeyboardInterrupt
        identity = {"pid": 30, "started": "original"}
        with patch.object(MODULE.os, "name", "posix"), \
                patch.object(MODULE.subprocess, "Popen", return_value=child), \
                patch.object(MODULE, "release_port"), \
                patch.object(MODULE, "process_record", return_value=identity), \
                patch.object(MODULE, "stop_process") as stop:
            with self.assertRaises(KeyboardInterrupt):
                MODULE.run_web(["--port", "3000"], {}, 3000)
        stop.assert_called_once_with(identity, tree=True)
        child.terminate.assert_not_called()


if __name__ == "__main__":
    unittest.main()
