Add **Best Slips** to GoalHint’s Next.js app as the default homepage and menu item, preserving existing pages, functionality, and design.

- Automatically generate at least **10 distinct daily slips** from upcoming fixtures and current odds. Target configurable combined decimal odds around **5.00**. Prioritize overall win probability, then fewer matches, then higher odds within the target range.
- Rank slips by overall probability descending and matches by individual probability descending. Use calibrated model estimates accounting for correlations; never fabricate data.
- Publicly display only **total odds, estimated probability, and match count**.
- Reveal matches only to authenticated users with active access through verified payment or a valid redeemed activation code. Enforce authorization server-side across pages/APIs; prevent leaks through payloads or caches.
- Reuse existing authentication, billing, routing, and UI conventions. Securely validate and bind codes to accounts.
- Handle insufficient fixtures transparently. Verify access control, daily generation, rankings, and existing functionality.