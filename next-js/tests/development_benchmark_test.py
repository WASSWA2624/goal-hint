"""Development benchmark isolation and sampling checks; no server is launched."""
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("development_benchmark", ROOT / "scripts/benchmark-development.py")
benchmark = importlib.util.module_from_spec(spec)
spec.loader.exec_module(benchmark)


class DevelopmentBenchmarkTests(unittest.TestCase):
    def test_benchmarks_reject_a_different_system_node_before_starting_services(self):
        ui = benchmark.load_script("benchmark-ui")
        expected = json.loads((ROOT / "package.json").read_text())["engines"]["node"]
        with patch.object(ui, "run_node", return_value=SimpleNamespace(stdout="v0.0.0\n")):
            with self.assertRaisesRegex(ui.CommandError, "pinned Node"):
                ui.runtime_info()
        with patch.object(ui, "run_node", return_value=SimpleNamespace(stdout=f"v{expected}\n")):
            self.assertEqual(ui.runtime_info()["node"], expected)

    def test_child_environment_disables_application_services_and_inherited_node_options(self):
        with patch.dict(os.environ, {"DATABASE_URL": "private-database", "AI_API_KEY": "private-key",
                                     "GOAL_HINT_ADMIN_PASSWORD": "private-password", "NEXT_PUBLIC_GOAL_HINT_DEMO": "true",
                                     "NODE_OPTIONS": "--inspect=9229"}):
            env = benchmark.benchmark_environment()
        self.assertNotIn("DATABASE_URL", env)
        self.assertNotIn("AI_API_KEY", env)
        self.assertNotIn("GOAL_HINT_ADMIN_PASSWORD", env)
        self.assertEqual(env["GOAL_HINT_DATABASE_ENABLED"], "false")
        self.assertEqual(env["GOAL_HINT_FOOTBALL_ENABLED"], "false")
        self.assertEqual(env["NEXT_PUBLIC_GOAL_HINT_DEMO"], "false")
        self.assertEqual(env["NODE_OPTIONS"], "")
        self.assertEqual(env["NODE_ENV"], "development")

    def test_fixture_copy_preserves_inputs_without_private_files_or_prior_compilation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            template, target = root / "source", root / "target"
            for name in ("app/page.tsx", "public/brand/logo.svg", "package.json", "next-env.d.ts", ".env.local",
                         "app/.env.test", "public/.env", ".next/cache/private", "node_modules/private", "server.log"):
                path = template / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("synthetic", encoding="utf-8")
            compiler_root = benchmark.copy_fixture(template, target, root)
            files = {path.relative_to(target).as_posix() for path in target.rglob("*") if path.is_file()}
            self.assertEqual(files, {"app/page.tsx", "public/brand/logo.svg", "package.json", "next-env.d.ts",
                                     "tsconfig.json", "next.config.mjs"})
            self.assertEqual(compiler_root, root.resolve())
            config = (target / "next.config.mjs").read_text(encoding="utf-8")
            self.assertIn(json.dumps(str(root.resolve())), config)
            self.assertEqual(json.loads((target / "tsconfig.json").read_text())["compilerOptions"]["paths"],
                             {"@/*": ["../src/*"]})
            self.assertEqual((template / ".env.local").read_text(), "synthetic")

    def test_resolved_dependency_root_can_include_a_sibling_checkout(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.assertEqual(benchmark.common_root(root / "worktree/next-js", root / "primary/next-js/node_modules"), root.resolve())

    def test_application_snapshot_preserves_real_hooks_and_config_without_environment_or_output(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source, snapshot, target = root / "source", root / "snapshot", root / "target"
            files = {"src/instrumentation.ts": "export function register() {}",
                     "src/proxy.ts": "export const proxy = () => {};",
                     "src/app/layout.tsx": "export default function Layout() {}",
                     "assets/font.woff2": "font", "public/offline-worker.js": "worker",
                     "package.json": "{}", "tsconfig.json": '{"compilerOptions":{"paths":{"@/*":["./src/*"]}}}',
                     "next.config.ts": 'export default { poweredByHeader: false, turbopack: { resolveAlias: {} } };',
                     ".env.local": "secret", "src/.private/key.json": "secret", ".goal-hint/settings.json": "secret",
                     ".next/dev/server.js": "compiled", "node_modules/package/private": "private"}
            for name, content in files.items():
                path = source / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content, encoding="utf-8")
            benchmark.copy_application_inputs(source, snapshot)
            self.assertEqual((snapshot / "next.config.ts").read_text(), files["next.config.ts"])
            benchmark.copy_application(snapshot, target, root)
            self.assertEqual((target / "src/instrumentation.ts").read_text(), files["src/instrumentation.ts"])
            self.assertEqual((target / "src/proxy.ts").read_text(), files["src/proxy.ts"])
            self.assertEqual((target / "tsconfig.json").read_text(), files["tsconfig.json"])
            self.assertEqual((target / "application.next.config.ts").read_text(), files["next.config.ts"])
            self.assertIn("...applicationConfig.turbopack", (target / "next.config.ts").read_text())
            self.assertEqual((source / "next.config.ts").read_text(), files["next.config.ts"])
            self.assertFalse(any("secret" in path.read_text() for path in target.rglob("*") if path.is_file()))
            self.assertFalse((target / ".next").exists())
            self.assertFalse((target / "node_modules").exists())

    def test_application_mode_cannot_silently_omit_startup_hooks(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with self.assertRaisesRegex(benchmark.CommandError, "instrumentation"), \
                    patch.object(benchmark.shutil, "copytree") as copy:
                benchmark.copy_application_inputs(root, root / "snapshot")
            copy.assert_not_called()
            self.assertFalse((root / "snapshot").exists())

    def test_driver_externalization_only_changes_the_generated_config(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source, target = root / "source", root / "candidate"
            config = 'export default { serverExternalPackages: ["existing"], poweredByHeader: false };'
            for name in ("src/instrumentation.ts", "src/proxy.ts", "tsconfig.json", "package.json", "next.config.ts"):
                path = source / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(config if name == "next.config.ts" else "{}", encoding="utf-8")
            benchmark.copy_application(source, target, root, server_externals=benchmark.SERVER_EXTERNAL_CANDIDATE)
            wrapper = (target / "next.config.ts").read_text()
            self.assertIn("...(applicationConfig.serverExternalPackages ?? [])", wrapper)
            self.assertIn(json.dumps(list(benchmark.SERVER_EXTERNAL_CANDIDATE)), wrapper)
            self.assertIn("new Set", wrapper)
            self.assertEqual((source / "next.config.ts").read_text(), config)
            self.assertEqual((target / "application.next.config.ts").read_text(), config)

    def test_each_route_has_one_first_request_and_five_warm_samples(self):
        samples = [({"ttfbMs": value, "completeMs": value * 2, "responseBytes": 100}, b"<html/>")
                   for value in [100, 5, 1, 9, 3, 7, 200, 2, 4, 6, 8, 10]]
        with patch.object(benchmark.local, "measure_request", side_effect=samples) as measure, patch("sys.stdout", io.StringIO()):
            results = benchmark.measure_routes(12345, ("/first", "/second"))
        self.assertEqual([call.args for call in measure.call_args_list],
                         [(12345, "/first")] * 6 + [(12345, "/second")] * 6)
        self.assertEqual(results[0]["firstRequest"]["completeMs"], 200)
        self.assertEqual(results[0]["warmMedianCompleteMs"], 10)
        self.assertEqual(results[1]["warmMedianTtfbMs"], 6)

    def test_invalid_mode_cannot_launch_or_stop_a_process(self):
        with patch.object(benchmark.subprocess, "Popen") as launch, patch.object(benchmark, "stop_process") as stop:
            with self.assertRaises(benchmark.CommandError), benchmark.server(Path("unused"), "unknown", {}):
                pass
        launch.assert_not_called()
        stop.assert_not_called()

    def test_server_cleanup_targets_only_its_owned_process_and_preserves_the_log(self):
        class Child:
            pid = 12345
            stdout = io.StringIO("Ready in 1ms\n")

            def poll(self):
                return None

            def wait(self, timeout):
                return 0

        child, record = Child(), {"pid": 12345, "started": "synthetic-start"}
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            with patch.object(benchmark, "node_binary", return_value="synthetic-node"), \
                    patch.object(benchmark.subprocess, "Popen", return_value=child) as launch, \
                    patch.object(benchmark, "process_record", return_value=record) as inspect, \
                    patch.object(benchmark, "stop_process") as stop:
                with self.assertRaisesRegex(RuntimeError, "synthetic"), benchmark.server(directory, "webpack", {}) as server:
                    self.assertEqual(server[1], child)
                    self.assertIn("startupMs", server[3])
                    raise RuntimeError("synthetic measurement failure")
            inspect.assert_called_once_with(child.pid)
            stop.assert_called_once_with(record, tree=True)
            self.assertIn("--webpack", launch.call_args.args[0])
            self.assertEqual(launch.call_args.kwargs["cwd"], directory)
            self.assertEqual((directory / "server.log").read_text(), "Ready in 1ms\n")


if __name__ == "__main__":
    unittest.main()
