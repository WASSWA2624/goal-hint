# Owned offline acceptance fixture

`scripts/serve-offline-fixture.py` builds the actual offline entry, client code,
manifest and worker with synthetic public/private HTTP responses. It uses no
real account, database, payment or message service. Keep its generated directory
under `.tmp/`; the `.offline-fixture` marker identifies an owned fixture.

For reconnection/update acceptance, `scripts/serve-offline-proxy.py` adds a
loopback-only fault proxy in front of that server. It rejects an unmarked fixture
directory or a backend whose `/en` document lacks the synthetic fixture marker.
Control and counters are host files under `.tmp/`, never application endpoints
or production switches. Backend requests explicitly disable environment HTTP
proxies, keeping traffic on loopback even without a `NO_PROXY` setting. The helper forwards no real application write: only the
existing `/api/account/fixture` synthetic POST is permitted.

Run the backend and each proxy in separate owned terminals/processes. Replace
`offline-id` with the fixture directory reported by the builder:

```sh
python scripts/serve-offline-fixture.py --port 3189 --reuse .tmp/offline-id --rebuild
python scripts/serve-offline-proxy.py --backend http://127.0.0.1:3189 --port 3191 --fixture-dir .tmp/offline-id --control .tmp/offline005-browser-control.json --stats .tmp/offline005-browser-stats.json
python scripts/serve-offline-proxy.py --backend http://127.0.0.1:3189 --port 3192 --fixture-dir .tmp/offline-id --control .tmp/offline005-windows-control.json --stats .tmp/offline005-windows-stats.json
```

The browser and native harnesses use distinct origins/control/counter files so
their faults cannot affect each other. Do not launch either harness until its
coordinator reports the backend and selected proxy ready. Android checks are not
part of this harness run.

## File control

Write complete JSON, preferably by replacing a temporary file atomically:

```json
{
  "generation": "A",
  "fault": null,
  "authState": "active"
}
```

Every request reads a validated control snapshot. Unknown fields/modes or
incomplete state fail closed; a few brief read retries tolerate an atomic host
update. Healthy defaults are generation A, no fault and active synthetic auth.

```json
{
  "generation": "B",
  "fault": { "target": "asset", "mode": "stall-body", "delayMs": 12000 },
  "authState": "active"
}
```

| Field | Values |
| --- | --- |
| `generation` | `A` or `B`. |
| `fault.target` | `manifest`, `snapshot`, `asset`, `entry`, `document` or `private`. |
| `fault.mode` | `503`, `401`, `captive`, `redirect`, `missing`, `truncate`, `delay-headers`, `stall-body` or `disconnect`. |
| `fault.delayMs` | Integer 0–30000; defaults to 12000. Used by delayed headers/body. |
| `authState` | `active` or `expired`; independent of anonymous public content. |

`asset` means only the new B resource
`/_next/static/chunks/offline-fixture-b.js`. Existing verified assets can be
reused, so breaking an old unchanged asset would not necessarily test staging.
`document` covers normal page requests; RSC is counted separately. Other hashed
assets/brand files are counted as `static`.

Delay modes hold a request without blocking other threads. `stall-body` sends
headers/one byte, then waits; `truncate` closes with fewer bytes than its declared
length. `disconnect` closes before sending a response. Error, captive and redirect
responses use no-store and never pretend to be a valid public bundle. Changing
the control affects subsequent requests, not the captured mode of an in-flight
request. A held B asset is a useful minimize/cancel/resume checkpoint.

## Generations and privacy

A is the verified built entry/assets. B keeps those actual UI bytes and adds one
harmless, required manifest asset; it is not executed by the app. The manifest
hash/creation order and public snapshot versions/times advance together. This is
an explicitly **derived acceptance bundle**, not a second genuine Next build.
Plan 004 separately verified a real rebuilt UI transition. No component or
business logic is duplicated by the proxy.

The counter file retains the synthetic fixture epoch across restarts, making
A/B capture and kickoff/sync times deterministic. Existing public fixture
identities remain unchanged; B increments their canonical data versions. Snapshot
expiry remains 24 hours. The proxy retains immutable generation resources in
memory, so stopping only the backend does not model an outage. Stop the owned
proxy itself, or block the browser/native context's network, for a cold-offline
check. Preserve the installed profile and host counter/control files.

When `authState` is `expired`, only `GET /api/account/fixture` returns the
`synthetic-session-expired` 401 sentinel with `private, no-store` and `Vary:
Cookie`. This is HTTP transport/privacy evidence, not a newly implemented
authentication system. Existing real server resolver/session-expiry tests remain
the authorization evidence. No private result enters the anonymous projection.

## Counters

The stats file contains cumulative category counts, `writes`, `active`,
`peakActive`, `boots`, and monotonic `sequence`. Each bounded event records
`sequence`, `atMs`, `category`, `path`, `method`, `generation`, `fault`, `status`,
`finishedAtMs`, `elapsedMs` and `aborted`. It stores no request/response body,
cookie value, credential, query string or arbitrary header. Counters survive
proxy restarts; unfinished prior events are marked `restartAborted` and active
returns to zero. A received synthetic POST increments writes; a blocked offline
attempt cannot reach this counter. Reconnection must not create a later replay.

Use event timestamps/counts to distinguish manual hints from bounded automatic
retries, detect overlaps, and prove that background preparation did not request
a new normal document. Browser and native document/input/focus/scroll assertions
remain necessary; counters alone are not UI evidence. Keep logs, profiles and
control files ignored. Stop only the processes owned by this test.

Pure helper checks:

```sh
python -m unittest discover -s tests -p offline_proxy_test.py
```
