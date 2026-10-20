# Payment-network artwork

The receiving-wallet cards reuse `MobileMoneyLogo` and keep a visible network
name, number and registered name. Artwork remains remote, original and unchanged;
no provider asset is copied into the repository or recoloured. A failed image
load leaves all payment instructions usable. Logos identify a receiving network
and do not imply automatic collection or provider endorsement.

- MTN MoMo: original blue artwork from the [official brand guidelines](https://momoapi.mtn.com/content/html_widgets/5svt2.html),
  on white with clear space, at the payment card's bottom right.
- Airtel: original red symbol served by [Airtel Uganda's website](https://www.airtel.co.ug/),
  with the visible Airtel Money label. It sits at the top right on white with
  clear space, following the [Airtel brand placement guidance](https://developers.airtel.mw/brand-guidelines).

Only networks with an environment-configured receiving number and registered
name are offered. The owner supplied both local wallets; support numbers use
separate environment variables. See [subscription configuration](subscriptions.md).
