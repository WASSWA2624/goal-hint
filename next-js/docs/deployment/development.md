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
caches and private settings are excluded. To configure local features, copy
`.env.example` to `.env.local` and edit it privately. With no settings, the app
starts with database and providers disabled. Development packages do not contain
production credentials or enable production services.

`BUILD_INFO.json` identifies the source revision and development configuration.
The adjacent `.zip.sha256` file verifies the downloaded archive. From the full
repository, rebuild the ZIP with `npm --prefix next-js run package:development`;
all generated packages live in the repository's root `deploy/` folder.
