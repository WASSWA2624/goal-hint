# Website-only deployment acceptance

This Windows-only synthetic check runs one Debug native test process against
two independently built Next.js deployments at the same loopback origin. It
imports the real root providers, shared brand and website theme button. It
changes no live website, account, database, production origin or native bridge.
It qualifies website delivery through the native adapter; it does **not**
qualify the installed production Release package or offline update safety.
See [007](../dev-plan/007-platform-builds-and-release.md),
[the tracker](../dev-tracker.md), and
[the existing offline/reconnection checks](../integration_test/README.md#reachability-and-safe-updates)
for those separate results and limits.

Use the pinned SDK from [the Flutter README](../README.md). From `flutter/`,
build both public fixtures before starting the native process:

```sh
python tool/serve_release_fixture.py --generation A --build-only
python tool/serve_release_fixture.py --generation B --build-only
```

Each reports a different owned `next-js/.tmp/release-*` directory and its
actual `.next/BUILD_ID`. A and B differ in compiled page source, rather than
being a proxy rewrite or a runtime marker layered onto one build. The helper
writes only public generation/build metadata; it never copies local private
configuration. Retain both directories. Start A in a separate terminal:

```sh
python tool/serve_release_fixture.py --reuse <A-directory> --port 3194
```

Inside A's ignored directory create `website-control.json` as UTF-8 containing
`{"advance":""}`. Substitute its absolute path in the one native command:

```sh
flutter test integration_test/website_update_test.dart -d windows --no-uninstall --dart-define=APP_ENV=development --dart-define=DEV_APP_ORIGIN=http://127.0.0.1:3194 --dart-define=WEBSITE_UPDATE_CONTROL_FILE=<absolute-control-file>
```

Do not launch another Flutter build while this test is running. The sibling
`website-control-checkpoint.json` reports an owned PID and a bounded stage:

1. At `swap-to-b`, inspect/capture **Website update A** in the actual native
   window. Keep that native process and profile running. Stop only the owned
   A server (Ctrl+C), wait for its listener to close, then start B at the
   identical origin:

   ```sh
   python tool/serve_release_fixture.py --reuse <B-directory> --port 3194
   ```

   Wait for the helper's `ready` output. Update the control file to
   `{"advance":"swap-to-b"}`. No Flutter/native build, replacement, restart or
   profile clearing occurs. The harness reloads the normal native adapter.

2. At `generation-b`, inspect/capture **Website update B** in the same native
   window. Update the control to `{"advance":"generation-b"}` so it exits.

Each operator gate allows five minutes. The evidence file records both public
web generations, different Next.js build IDs and `performance.timeOrigin`
values, the same native process, and matching SHA256 manifests before/after
for its executable, native DLLs and complete Flutter `data/` tree. Hashing uses
Windows' `certutil.exe -hashfile`; no certificate store is accessed. Debug uses
`kernel_blob.bin`; absent `data/app.so` is explicitly recorded as absent,
without claiming AOT Release qualification. The generic WebView JavaScript
bridge must remain undefined. Cookies/private page content are never logged.

Wait for the native test command and owned host/browser children to exit, then
stop only B's owned server. Restore the normal `lib/main.dart` development build
after integration tests. Keep logs, controls, screenshots, fixture builds,
profiles and binaries ignored. A passing test is not a production deployment,
platform release, launch-performance measurement or another engine's evidence.
