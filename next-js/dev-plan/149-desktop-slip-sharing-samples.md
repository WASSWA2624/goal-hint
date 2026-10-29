# 149 — Desktop slip sharing samples

## Scope

Prepare ten reviewable desktop concepts for sharing the common Best Slips and
Slip Builder slip presentation on WhatsApp. The user will select a concept
before the working feature is implemented. Mobile design is deferred.

## Design deliverable

- Keep the review under `next-js/design/desktop-slip-sharing/`, using the
  interactive `desktop-slip-sharing.html` fragment and its README.
- Show Header menu, Preview dialog, Right drawer, Inline expansion, Guided steps,
  Split workspace, Bottom tray, Image lightbox, Export checklist, and Share studio.
- Reuse the existing Goal Hint identity, compact desktop Aligned ledger geometry,
  uniform controls, theme relationships, and square corners.
- Support Best Slips and Slip Builder contexts with the same illustrative
  three-selection slip, combined odds of 4.10, and mean probability of 75.8%.
- Include a Share action in each slip header and show the WhatsApp choice, image
  and caption review, app URL, proposed unique slip link, and desktop handoff.
- Brand the exported-image concept `Created with Goal Hint`. Mark
  `https://goalhint.com/s/GH-26K-8F2` as illustrative; this change adds no `/s/`
  route or persistent slip-sharing identity.
- Keep every send, download, copy, recipient, and handoff interaction a local
  simulation. Do not contact recipients or modify production slip components.
- Supply host carousel navigation and standalone-wrapper navigation fallback so
  all ten samples can be reviewed.

## Platform constraints for later implementation

The desktop flow must allow saving the image, copying its caption, opening
WhatsApp, and attaching the saved image manually. A plain WhatsApp link cannot
promise an automatic image attachment. Native file sharing requires runtime
capability checks and uses the destinations offered by the operating system.

Source references:

- [Web Share specification](https://www.w3.org/TR/web-share/)
- [WhatsApp click-to-chat guidance](https://faq.whatsapp.com/5913398998672934)
- [WhatsApp web media guidance](https://faq.whatsapp.com/453914586839706/?cms_platform=web&locale=en_US)

Public-slip access, durable snapshot storage, real image generation, actual
sharing, link previews, and installed-app HTTPS linking follow selection and
implementation approval.

## Verification

Completed source syntax and fragment validation, all 20 complete flow checks
across both pages, ten review-layout containment checks at each of three browser
widths, light and dark visual inspection, required-link preservation, and modal
keyboard checks. The browser console reported no errors or warnings. Details
are recorded in the design README.

The gallery opens each concept at its image review and provides the four flow
stages above the app. Downloads, copying, and the WhatsApp handoff are simulated.
No production app build or sharing integration is claimed by this design-only
plan. Await concept selection before changing the shared runtime slip header.
