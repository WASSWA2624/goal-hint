# Payment-network marks

Subscribe identifies its payment-network choices with artwork served locally from
`public/payment-networks/`. The downloaded files are unchanged; their colours,
shapes and proportions are preserved.

- **MTN MoMo:** `mtn-momo.jpg` (557 × 359 pixels), the owner-selected yellow MTN
  logo downloaded on 2026-10-24 from the
  [supplied image](https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQCTKZJtK4y3CzpfEl0Hhrp2BNo0dnZxX2RvXo0jAUHTUzPJI3HhUUJRVf4&s=10).
- **Airtel Money:** `airtel-money.svg` (viewBox `0 0 54.496 56.721`), the red Airtel
  symbol from Airtel Uganda's website, downloaded on 2026-10-20 and accompanied by the visible Airtel Money name.
  [Original SVG](https://cdn-webportal.airtelstream.net/website/uganda/assets/icons/loadingLogo.svg).
  The SVG contains a single path and no scripts, event handlers or external references.

The reusable logo component crops the MTN image around its oval mark, keeping a
tight yellow surround while removing the white/checkered edges and excess spacing.
The artwork is not stretched or recoloured.
Airtel retains its original proportions. The images have empty alternative text and
an `aria-hidden` wrapper because each choice already has a visible provider name.
Native radio controls expose the selected provider and retain keyboard operation.
The selected wallet shows `Pay to:` with its local Ugandan number beginning with
`0`, and `Names:` with the registered name. Copy uses the same local number.

Local serving keeps the payment page independent of provider image hosts. The
marks identify receiving networks and do not imply automatic collection or
provider endorsement.

Only networks with an environment-configured receiving number and registered
name are offered. The owner supplied both local wallets; support numbers use
separate environment variables. See [subscription configuration](subscriptions.md).
