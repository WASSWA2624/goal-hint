# Payment-network marks

Get access identifies its payment-network choices with official provider artwork
served locally from `public/payment-networks/`. The original files were downloaded
unchanged on 2026-10-20; their colours, shapes and proportions are preserved.

- **MTN MoMo:** `mtn-momo.png` (628 × 294 pixels), the blue logo from the
  [official MTN MoMo brand guidelines](https://momoapi.mtn.com/content/html_widgets/5svt2.html).
  [Original PNG](https://momoapi.mtn.com/content/momo_mtnb.png).
- **Airtel Money:** `airtel-money.svg` (viewBox `0 0 54.496 56.721`), the red Airtel
  symbol from Airtel Uganda's website, accompanied by the visible Airtel Money name.
  [Original SVG](https://cdn-webportal.airtelstream.net/website/uganda/assets/icons/loadingLogo.svg).
  The SVG contains a single path and no scripts, event handlers or external references.

The reusable logo component displays each mark on white with clear space, without
cropping, stretching or recolouring it. The images have empty alternative text and
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
