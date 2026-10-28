# 085 Restartable development launcher

Make `npm run dev` replace a previous local development instance, reclaim its
requested web port and preserve the isolated demo database.

1. Resolve and validate CLI/environment ports before stopping processes; pass an
   explicit port to Next so it cannot silently select another.
2. Release listeners on that requested port and orphan development instances of
   this checkout, using process creation identities and bounded shutdown.
3. Recover the previous demo launcher or its orphan MySQL process using the exact
   owned data directory and SQL ownership checks. Preserve installed services and
   all database files; preparation/verification commands retain exclusive access.
4. Retry web-port binding races without repeating migrations or demo preparation.
5. Test lifecycle/ownership/argument handling, exercise real port contention and
   launcher replacement, verify the running app, then commit and push main.

Completed:

- Added reusable process inspection/termination helpers with creation-identity
  checks and bounded port release. CLI/environment port selection is explicit;
  only this checkout's orphan Next/nodemon instances are selected by project path.
- Added an OS startup mutex, atomic launcher ownership metadata, legacy-launcher
  recovery, owned orphan MySQL shutdown, and quoted-path handling. Database files
  remain intact. Preparation/verification commands do not replace an active app.
- A port-binding race retries only the web server, up to three attempts. Normal
  configuration errors still return their actual failure rather than looping.

Verification:

- All 127 Python tests passed, including real occupied-port release/rebinding,
  subprocess startup serialization, ownership and PID-reuse checks, quoted paths,
  CLI precedence, bounded retries and interrupted web-tree cleanup.
- Actual `npm run dev` reclaimed the previous port-3000 instance. A second launch
  replaced the first while its demo database lock was held during preparation.
- Before and after both restarts: 187,040 fixtures, 50 members and 94 saved slips.
  The separately installed MySQL service retained its original processes.
- `npm run demo:prepare` correctly refused exclusive access without changing the
  running launcher ownership.
- The normal home page, fixture list, half-time statistics and live-odds endpoints
  returned HTTP 200 on port 3000. The Kampala 30-November list retained 560 rows.
- Python compilation and Git whitespace checks passed. The app remains running.
