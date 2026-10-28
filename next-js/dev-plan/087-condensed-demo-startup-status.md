# 087 Condensed demo startup status

Replace per-date match/slip progress, report warmup messages and the raw coverage
JSON with one concise preparation status and ready summary.

- Interactive terminals show a preparation line that is replaced by the final
  verified coverage summary. Redirected logs receive only the final summary.
- Failed preparation replays captured diagnostics, and interruption clears the
  pending terminal line. Migration and verification output remain unchanged.
- Keep seed operations, data generation and application behavior unchanged.

Verified: all 132 Python tests passed, including terminal/redirected output
collapse and failed-preparation diagnostic replay. Python compilation and Git
whitespace checks passed. The running app did not need to restart for this
launcher-only change; subsequent launches use the concise status.
