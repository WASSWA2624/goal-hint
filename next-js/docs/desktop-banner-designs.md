# Desktop banner design review

Open `/en/banner/designs` to compare ten concepts. All thirty combinations of
design and account state appear initially. The controls can isolate a design or
account state, switch theme, or change the desktop canvas width. The canvases
remain desktop-sized when viewed in a narrow window.

Option 01, **Inline invitation**, is applied on desktop. Sample actions only show
review feedback; shortlisting does not apply another design. The mobile banner's
layout and styling are unchanged. Authentication actions throughout the app use
the shared `auth.signIn`, `auth.signUp` and `auth.signOut` catalog keys from
`src/i18n/messages/auth.ts`.

The advertised UGX 1,000 is an illustrative review value. Production reads the
current subscription offer and real account/subscription state. Loading has no
banner. Guests see Sign up / Sign in; members without access see Subscribe;
pending payments show their review status; expired access offers a new plan;
active subscriptions confirm access and link to Account (or View payment for a
pending renewal). Sales-closed states do not advertise a new plan, while active
access and pending payments remain manageable. No private status is embedded in
shared server-rendered page HTML.

Run the isolated rendering preview without application data:

```text
python scripts/verify-banner-design-rendering.py --serve
```

The script prints its local URL and verifies the production-rendered review.
