# Desktop banner design review

Open `/en/banner/designs` to compare ten concepts. All thirty combinations of
design and account state appear initially. The controls can isolate a design or
account state, switch theme, or change the desktop canvas width. The canvases
remain desktop-sized when viewed in a narrow window.

Sample actions only show review feedback. Shortlisting does not apply a design.
The production banner and mobile interfaces are unchanged. App-wide adoption of
the shared Sign in / Sign up / Sign out vocabulary follows design selection.

The advertised UGX 1,000 is an illustrative review value. Production must read
the current subscription offer and real account/subscription state, including
loading, payment-pending and expired-access cases.

Run the isolated rendering preview without application data:

```text
python scripts/verify-banner-design-rendering.py --serve
```

The script prints its local URL and verifies the production-rendered review.
