# Compact header review acceptance

Run from `next-js/`:

```powershell
python scripts/verify-header-design-rendering.py --serve
```

The script builds an isolated production application in an ignored `.tmp/`
directory and serves the actual review route at `/en/header/designs`. It uses
the real review component, Manrope font, global styles, styled-components
registry and copied local brand artwork. Its minimal root layout omits the
application's offline and analytics runtimes. No account, payment, provider or
database records are loaded.

Server-rendered checks cover all ten options, a desktop and mobile sample for
each, unique identifiers, branding asset availability, no session cookie and
`noindex, nofollow` metadata. Browser checks remain necessary for fitting,
controls, touch sizing and keyboard behavior.

After a successful build, `--fixture .tmp/<printed-directory> --serve` reruns
the checks and serves the same build. Rebuild after source changes.
