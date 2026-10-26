# 070 — Interactive payment flow samples

## Scope

Give the owner ten navigable alternatives for the proposed manual payment
journey before choosing a production design. Keep the current subscription
screen and payment APIs unchanged.

## Implementation

- Serve a dependency-free gallery at `/payment-samples/index.html` from the
  existing Next.js public directory. Publish the same files as a separate,
  private review Site.
- Share one state and validation engine across ten distinct compositions:
  centered card, journey rail, guided question, folded sections, payment pass,
  timeline, bottom action dock, page trail, checkout window, helpful guide.
- Show package selection, manual MTN/Airtel payment instructions, payer phone
  and screenshot, then review and explicit confirmation. Follow submission
  with a pending-verification screen and a support-message preview.
- Preserve values and screenshot previews when navigating Back or editing.
  Screen-size changes preserve the preview iframe and its current form.
- Provide mobile/desktop preview controls, direct full-screen links, shareable
  sample links, and browser-local favorites.
- Use square component edges, local brand/network artwork, native labeled
  form controls, visible keyboard focus, and inline validation.

## Demo boundaries

Use documented default prices (Daily 1,000 / Weekly 5,000 / Monthly 20,000 UGX),
not a claim about current admin-configured offers. Recipient numbers contain X
characters and cannot receive payments. Never include private wallet or support
configuration. All inputs and screenshot objects remain in memory; no API,
message, call, payment, or proof upload is triggered. Only favorite sample IDs
are stored in localStorage. Reloading a sample clears its form.

The proposed flow requires a screenshot and omits the transaction ID, as the
owner requested. The current production contract instead requires a transaction
ID and makes the screenshot optional. Adopting a sample must explicitly reconcile
that server contract; this gallery does not change it. Pending status is always
a demonstration, never a claim of real verification or activated access.

## Verification

Check all ten complete journeys on mobile and desktop previews. Check selection,
proof and confirmation gates; image decoding/type/size errors; retained values;
network/amount changes; favorites; device switching without reset; and direct
sample links. Inspect representative screenshots for readable layouts and
horizontal overflow. Record actual results in `docs/payment-flow-samples.md`.

## Publication

The tracked Site identity is in `payment-flow-site/.openai/hosting.json`.
`python scripts/prepare-payment-samples.py` stages the exact public sources in
the ignored `.tmp/payment-flow-site` directory. Use the Sites source workflow
there, passing credentials only through stdin, and package outside that checkout.
Never commit publication credentials or generated archives to this repository.
