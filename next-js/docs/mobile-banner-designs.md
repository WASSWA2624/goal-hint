# Mobile banner design review

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

UGX 1,000 is an illustrative review offer, with no fabricated expiry or account
identity. Shortlisting does not apply a design. The desktop Inline invitation
and the live mobile banner remain unchanged until a mobile design is chosen.

Run the isolated production review without application data:

```text
python scripts/verify-mobile-banner-design-rendering.py --serve
```
