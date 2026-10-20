# Payment-network marks

Get access (design 08, "Plain Instructions", 2026-10-20) marks each receiving wallet
with a square text chip instead of provider artwork: **MTN** in navy on yellow
(`#FFCC00`/`#071747`) and **airtel** in white on red (`#E4002B`/`#FFFFFF`). Both pairs
keep 4.5:1 or better and are the same in light and dark themes. The chips are
decorative (`aria-hidden`); each row also carries the network name for screen
readers, the formatted number, the registered name and the dial code.

No provider asset is loaded, copied or recoloured, so the page makes no requests to
MTN or Airtel hosts and a provider outage cannot affect it. The chips identify a
receiving network and do not imply automatic collection or provider endorsement.
The earlier remote artwork (`MobileMoneyLogo`) was removed with this redesign; restore
it from git history if official artwork is wanted again.

Only networks with an environment-configured receiving number and registered
name are offered. The owner supplied both local wallets; support numbers use
separate environment variables. See [subscription configuration](subscriptions.md).
