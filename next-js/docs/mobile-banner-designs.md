# Mobile banner design review

Option 01, Inline invitation, is applied to the mobile app. The approved desktop
Inline invitation stays in place. The live mobile banner uses the confirmed
account session and the current lowest subscription offer supplied by the
server; it never takes pricing or account state from this review gallery.

Open `/en/banner/designs/mobile` to compare ten options. Each initially shows
signed-out visitors, signed-in members without a subscription, and active
subscribers. Use the controls to isolate a design or state, switch theme, or
compare 320/360/390/430px phone widths. Copy and actions fit a single banner row.
Previews retain their selected width in
narrow windows and can be scrolled horizontally within their own frames.

The mobile header context is consistent across options. Signed-out banners
offer the canonical Sign up / Sign in actions; members without access receive
Subscribe; subscribers receive access confirmation and account or prediction
actions. Authentication words come from the same shared labels as the app.
Sample actions show review feedback only and never authenticate or subscribe.

The live invitation stays in one row directly beneath the header, separated by
a thin rule. It offers authentication when signed out, subscription access to
members without a plan, and access confirmation to active subscribers. Pending
payments and expired access receive the next action appropriate to their
confirmed status. It stays hidden while account status is unresolved.

UGX 1,000 is an illustrative review offer, with no fabricated expiry or account
identity. Option 01 is marked Selected · Applied. The ten alternatives remain
available for comparison; shortlisting records a preference and does not apply
another design or change either live banner.

Run the isolated production review without application data:

```text
python scripts/verify-mobile-banner-design-rendering.py --serve
```
