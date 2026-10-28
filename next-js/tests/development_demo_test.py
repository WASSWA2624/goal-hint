"""The demo launcher must never inherit real provider/database configuration."""
import importlib.util
from pathlib import Path
import sys
import unittest
import subprocess
from unittest.mock import patch

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


if __name__ == "__main__":
    unittest.main()
