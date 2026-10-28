# Goal Hint 1.0.0 development package

Extract `goal-hint-nextjs-1.0.0-dev.zip` and open a terminal in its
`goal-hint-nextjs/` folder. Install Node.js **24.18.1**, npm **11.16.0**, and
Python **3.11 or later**, then run:

```sh
npm ci
npm run dev -- --hostname 0.0.0.0 --port 3000
```

Open `http://localhost:3000` on this computer. For a phone on the same LAN, use
the computer's reachable IP, for example `http://192.168.1.148:3000`. Allow the
development server through the local firewall if needed. The Android development
shell uses `APP_ENV=development` and that address as `DEV_APP_ORIGIN`; use the
actual current address of the development computer.

The source export includes the lockfile and `.env.example`. Dependencies, build
caches and private settings are excluded. Development starts with the
[comprehensive football demo](../development-demo.md), using Python and a genuine
MySQL 8.4+ executable to own a separate persistent loopback database. It includes
560 synthetic fixtures per day from January through November 2026 and uses the
normal application screens and services. Set `GOAL_HINT_DEMO_MYSQL_BINARY` if
MySQL is not discovered automatically.

To use configured development services, copy `.env.example` to `.env.local`,
edit it privately and run `npm run dev:live`. Development packages do not contain
production credentials or enable production services.

`BUILD_INFO.json` identifies the source revision and development configuration.
The adjacent `.zip.sha256` file verifies the downloaded archive. From the full
repository, rebuild the ZIP with `npm --prefix next-js run package:development`;
all generated packages live in the repository's root `deploy/` folder.
