# Windows native UI acceptance

This check uses the actual Windows adapter, shared Goal Hint providers, brand,
theme button and form controls. Its public draft, file chooser and two local
routes are isolated acceptance content, not an account/payment implementation.
It sends no message, writes no database and never uploads a selected file.
The production origin and Release configuration are unchanged.

Native keyboard/window/handler actions come from the operator. The harness
records trusted input events, focus, document identity, history, viewport and
lifecycle signals. It does not type or click through JavaScript to claim native
input. DOM labels and widget semantics do not prove native accessibility.
See [007](../dev-plan/007-platform-builds-and-release.md),
[the tracker](../dev-tracker.md) and [release boundaries](releases.md).

## Prepare the owned fixture

Run from `flutter/` using the pinned SDK and installed web dependencies:

```sh
python tool/serve_windows_ui_fixture.py --build-only
python tool/serve_windows_ui_fixture.py --reuse <reported-fixture-directory> --port 3195
```

The helper builds a real isolated Next.js app under `next-js/.tmp/windows-ui-*`
and binds only loopback. Actual app traffic uses `windows-ui.localhost`; external
handler traffic uses `windows-handler.localhost`, keeping both separate from the
normal development hosts and their host-scoped cookies. Chromium resolves these
reserved `.localhost` names to loopback without an OS DNS change. Only the helper's
readiness probe uses numeric loopback. Retain its ready output and owned server PID. In that
directory create `windows-ui-control.json` containing `{"advance":""}` as UTF-8.
Create a nonempty public text file named `windows-ui-selection.txt` under
`flutter/.dart_tool/`. Use only that file in the chooser; its contents are never
read by the page or sent anywhere.

```sh
flutter test integration_test/windows_ui_test.dart -d windows --no-uninstall --dart-define=APP_ENV=development --dart-define=DEV_APP_ORIGIN=http://windows-ui.localhost:3195 --dart-define=WINDOWS_UI_CONTROL_FILE=<absolute-control-file>
```

The fixture marker/path guard confines file controls to the owned directory.
The harness temporarily enables the test binding's real device-pointer
propagation inside this test and restores its prior value in `finally` (with a
teardown fallback). The initial native attempt reached `theme-light`, but the
binding's default intercepted the actual mouse click for finder diagnostics;
that attempt is a harness failure, not evidence of a product theme defect.
The corrected harness requires a new native run with the same assertions.
Each gate checks a ten-minute deadline between live frame pumps; the runner's
overall test timeout is 45 minutes. These are not guaranteed wall-clock gate
bounds while the native host is minimized: an awaited frame pump, or an optional
browser observation on a suspended document, may not finish until it is restored.
Restore the owned window before continuing, or stop the owned interrupted test
and rerun an expired checkpoint. A future frame-independent timeout needs its
own native qualification; do not weaken the acceptance assertions to bypass a
blocked operator surface.
`windows-ui-control-checkpoint.json` identifies the current stage, app PID and
public starting metrics. After completing a stage, change the control to
`{"advance":"<stage>"}`. To obtain public metrics without advancing, use a new
observation token, for example `{"advance":"","observe":"narrow-1"}`; read the
sibling `windows-ui-control-observation.json`. Do not start another Flutter build
or clear the browser profile during the check.

## Native operator stages

| Stage | Real action and assertion |
| --- | --- |
| `theme-light` | Physically use the existing header theme toggle until Light is selected. The shared CSS scheme and saved web preference must be light; every public metadata color must equal the adapter's native appearance. Capture the real light native caption beside the web page. No OS setting is changed. |
| `theme-dark` | Physically toggle to Dark. The same metadata/native-color checks must pass, with a real dark-caption/page observation. The harness restores the fixture's exact initial saved preference during teardown. |
| `keyboard` | Click **Acceptance draft**, select its existing text if any, type exactly `Goal Hint keyboard 007`, then press Tab. The input must receive trusted events and focus must move to **Open internal detail**. |
| `navigate` | With that link focused, press Enter. The actual Next.js `/native-details` route must appear. |
| `back` | Press native Alt+Left in the app. The home route and its saved synthetic draft must return. The harness does not call the adapter's Back method for this evidence. |
| `narrow` | Resize the actual native window so its web viewport is at most 700 CSS pixels wide. Confirm the full draft remains and the page has no horizontal overflow. Use an observation token to check the measured width. |
| `wide` | Enlarge/maximize the actual window to a viewport of at least 900 CSS pixels. The draft and layout must remain intact. |
| `zoom` | Focus the web content, then use the native Ctrl+Plus keyboard accelerator repeatedly until browser zoom reaches at least 190% of its baseline. Five normal Chrome/WebView2 increments reach 200%; use observations to verify the `viewport.dpr` ratio. Reflow must avoid horizontal scrolling. This is browser-zoom evidence, not an OS text-size setting test. |
| `zoom-reset` | Press native Ctrl+0 in the web content to restore the original browser zoom. |
| `external` | Click **Open system browser**. Inspect the OS-registered browser's new owned tab: URL `http://windows-handler.localhost:3195/native-handler`, title/heading **Goal Hint native external handler**. The hostname differs from the embedded `windows-ui.localhost` origin, so this exercises real external handoff. Confirm the app's draft/document is preserved, close only this owned browser tab, and return to the native app. |
| `file` | Click **Local text file (never uploaded)** and use the actual system chooser to select the owned `windows-ui-selection.txt`. The page must report selection, a positive size and a trusted change event. No form/POST/upload exists. |
| `lifecycle` | Minimize the actual window, wait briefly, and restore it. The harness checks new Flutter hidden/resumed and document hidden/visible events, unchanged document identity and the draft. Capture the installed/taskbar icon only if the actual native surface is available; a file reference is not visual qualification. |
| `accessibility` | Inspect the native accessibility tree and, where available, an actual screen reader. The web heading, labelled textbox, link/button and file control must be exposed with useful roles/names and focus. Record the observed outcomes as described below. DOM ARIA attributes or a screenshot cannot substitute for this native check. |

At the last gate set an explicit observed result, for example:

```json
{"advance":"accessibility","accessibility":"fail","screenReader":"not-tested","note":"Native UIA contains only the host pane; no web heading or input is exposed."}
```

Allowed outcomes are `pass`, `fail` and `not-tested`; record only what was
actually inspected. A missing web tree is a native accessibility **Fail**.
Screen-reader output remains separate; never promote it from DOM or UIA names
alone. The harness writes all public evidence before its final accessibility
assertion. It deliberately exits failed if native accessibility did not pass,
even when preceding keyboard/resize/handler checks passed. An exit-zero harness
with an untested screen reader still does not claim spoken-output acceptance.

## Handoff and cleanup

The evidence JSON contains only the synthetic phrase, owned basename/size,
public routes/runtime/theme colors, native lifecycle and manual accessibility outcomes.
Retain screenshots and native accessibility observations under ignored output;
record actual results and failures in 007/the tracker. The harness restores the
exact original `goal-hint-theme` value (including absence) only for its dedicated
fixture origin, notifies the existing shared storage listener without a document
reload, removes its synthetic session-storage draft key and releases its browser.
The evidence records whether preference restoration succeeded.
Close its owned system-browser tab/dialog, wait for the native host and children
to exit, stop only the owned fixture server, then rebuild normal `lib/main.dart`
for the usual development origin.

This check does not qualify real production account mutation, private backend
services, a signed installer or the suspended production deployment. Account
acceptance must follow the application's current source contract and recorded
HTTP/backend evidence; this dedicated UI fixture makes no account-lifecycle
claim. The unavailable production backend remains a separate acceptance gate.
Android device checks remain deferred.

## Retained interrupted attempts

The first native attempt reached `theme-light`, but the test binding intercepted
the real device-pointer event for finder diagnostics. The corrected test enables
pointer propagation only within its callback and restores the prior binding value;
this initial failure does not establish a product theme defect.

The corrected-pointer attempt, native PID 17752, also reached `theme-light`.
At the retained 00:35:29 EAT checkpoint and the 00:48:27 observation on
27 October 2026, the window remained minimized. Native control repeatedly
reported `user-input-detected` when restoration was requested, including after
the documented fresh-selection recovery. The gate remained pending beyond ten
minutes, consistent with the live-frame waiting limitation above. That attempt
was stopped and the normal development build was restored before a subsequent
user-assisted rerun.

Neither interrupted attempt qualifies light/dark interaction or any later
keyboard, window, handler, chooser, lifecycle or accessibility stage. In
particular, no native accessibility or screen-reader failure is inferred from
unexecuted stages or static plugin inspection. Subsequent attempts need their
own observations and logs; [the tracker](../dev-tracker.md) records their final
outcomes separately from this retained history.

## Partial native UI qualification — 27 October 2026 (EAT)

The later user-assisted attempt ran as native PID 38292 at
`http://windows-ui.localhost:3195`. Its Debug build passed in 72.7s; the native
test ended with exit 1 after 8m04s, including operator waiting. These durations
are not startup-performance measurements.

Both `theme-light` and `theme-dark` passed through real shared-toggle interaction:
CSS scheme, saved web preference, strict public appearance metadata and all five
native colors matched. The actual light and dark native captions were visually
inspected beside their web pages. Final evidence records the initial preference
as `dark` and `themePreferenceRestored: true`; no OS appearance setting changed.

The owner reported that text appeared and Tab moved focus. By the retained
observation, navigation had already reached `/native-details` before the
`keyboard` gate was acknowledged. Native Alt+Left returned home with the phrase
retained and the same document time origin. That home remount resets the fixture's
input/key counters, so these observations cannot satisfy the ordered trusted-input
and final Tab-focus assertions. Subsequent tool typing/focus observations were
unreliable. The operator advanced `keyboard` only to let the test restore its
preference and close; it failed the expected `internal-link` focus assertion with
actual `acceptance-draft` at the retained source line 104.

This is an incomplete ordered acceptance attempt, not proof of a product keyboard
defect. No production focus integration was changed, no keyboard assertion was
weakened, and no JavaScript typing was substituted for physical input. The human
report remains separate from automated evidence. `navigate`/`back` did not complete
as ordered gates; narrow/wide resize, zoom, external handler, file chooser,
lifecycle, native accessibility and screen-reader stages were not executed.
They remain **Not tested**, without inferring accessibility or spoken-output
failure from source inspection or a host-pane observation.

Retained ignored evidence includes `.dart_tool/windows007-ui-native-resumed.log`,
`.dart_tool/windows007-ui-human-evidence.json`, `.dart_tool/windows007-ui-dark.jpg`
and the owned fixture's `windows-ui-control-evidence.json`. The initial finder
failure and minimized-window interruption retain their separate logs. Production
launch remains blocked by HTTP 403 / Account Suspended; Android device checks
remain deferred. See [the tracker](../dev-tracker.md) for the matrix and normal
development cleanup, rather than promoting this partial run to a Windows release.
