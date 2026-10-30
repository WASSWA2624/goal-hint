# Deployment packages

Current deliverables are **development versions, 1.0.0**. Keep that version until
the first production deployment. All final ZIPs and SHA256 checksums belong here;
Linux is excluded. Build scripts and this guide are committed, while generated
packages and private configuration are ignored.

| Development ZIP | Use |
| --- | --- |
| `goal-hint-nextjs-1.0.0-dev.zip` | Extract the clean web source and follow `DEVELOPMENT.md` to install dependencies and start the development server. |
| `goal-hint-android-1.0.0-dev.zip` | Extract and install the debug-signed APK. The phone must reach the configured web development server. |
| `goal-hint-windows-1.0.0-dev.zip` | Extract and run the development setup executable. Microsoft WebView2 and the documented developer runtime are required. |
| iOS | Pending a Mac with Xcode and suitable Apple development provisioning for an installable IPA. |
| macOS | Pending a Mac with Xcode. |

No empty or substitute Apple ZIPs are supplied. A missing ZIP means that platform
has not been built. Development packages are for testing; production signing
checks remain enabled in the separate release tooling.

## Build and test locally

Run commands from the repository root with each application's pinned toolchain:

```powershell
npm --prefix next-js run package:development
python flutter/tool/package_development.py android --origin http://192.168.1.148:3000
python flutter/tool/package_development.py windows --origin http://localhost:3000
```

Use your development computer's current LAN address for the physical Android
device. Windows on the same computer uses `http://localhost:3000`.
Start the Next.js development server on port 3000, allow it through the local
firewall as appropriate, and keep the computer and test device on a network
where they can reach each other. The packaged instructions record the origin
used for that particular native build. Data features still need their local
settings.

## Production and private files

Production commands remain available in the [cPanel guide](../next-js/docs/deployment/README.md)
and [native release guide](../flutter/docs/releases.md). They produce
`goal-hint-<platform>-1.0.0.zip` when the required host and signing setup exist.
Android needs a release-signing key; iOS/macOS need a Mac and Apple's signing setup.
The earlier validated cPanel build is retained under `.private/previous-builds/`.

Private cPanel environment files, credentials and operator state are preserved in
`.private/nextjs/`. They stay out of distributable ZIPs and Git. `.staging/` holds
temporary packaging files. Required application build caches remain ignored
inside their application folders; distribution archives belong in this folder.
