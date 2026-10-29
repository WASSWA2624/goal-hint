# Desktop slip sharing samples

Ten simple desktop concepts show the slip-header Share action, a branded slip
image, and a short WhatsApp caption. The gallery supports both **Best Slips** and
**Slip Builder**, following the existing shared Aligned ledger presentation,
Manrope typography, cool blue surfaces, compact controls, and square edges.

**Selected: 03, Slim drawer.** The shared desktop implementation is tracked in
[plan 153](../../dev-plan/153-slim-drawer-slip-sharing.md) and documented in
[Desktop slip sharing](../../docs/slip-sharing.md). The gallery itself remains
a simulated design reference; its other nine concepts are not production UI.

## Concepts

| No. | Concept | Sharing arrangement |
| --- | --- | --- |
| 01 | Compact menu | A small preview anchored to the header action. |
| 02 | Centered preview | A compact dialog keeps the image and caption together. |
| 03 | Slim drawer — selected | A narrow side panel preserves the slip context. |
| 04 | Inline preview | Sharing opens directly beneath the slip. |
| 05 | Quick WhatsApp | A direct WhatsApp action keeps preparation brief. |
| 06 | Split preview | The slip and its share preview sit side by side. |
| 07 | Bottom bar | Sharing actions appear below the slip context. |
| 08 | Image first | The branded image leads a restrained preview. |
| 09 | Quick actions | A small action area keeps sharing controls close together. |
| 10 | Minimal sheet | A quiet sheet groups the image, caption, and primary action. |

Each concept uses one or two interactions: the header action opens a short
WhatsApp preview, with one main WhatsApp action and secondary **Save image** and
**Copy caption** actions. Feedback stays in the preview. There is no separate
handoff screen or technical route explanation in the product UI.

## Shared sample

All ten concepts use the same illustrative slip so the layouts can be compared
directly:

| Fixture | League | Selection | Odds | Estimated probability |
| --- | --- | --- | --- | --- |
| Arsenal vs Chelsea | Premier League | Home win | 1.72 | 76.2% |
| Inter Milan vs Napoli | Serie A | Over 2.5 | 1.42 | 81.7% |
| Sporting CP vs Braga | Primeira Liga | Both teams to score: Yes | 1.68 | 69.4% |

The combined odds are **4.10**. The **75.8%** average is the mean of the individual
selection probabilities; it is not the probability that the entire slip wins.

The image uses **Created with Goal Hint**, matching the existing application's
brand and canonical website, `https://goalhint.com`. The proposed slip reference
`GH-26K-8F2` and `https://goalhint.com/s/GH-26K-8F2` are illustrative and are not
valid production share tokens. The implemented `/s/` route uses a random
32-character lowercase hexadecimal token. Both the app URL and example
individual-slip URL appear in this simulated review.

## Preview behavior

`desktop-slip-sharing.html` is the editable fragment used by the conversation
host carousel. The standalone browser builder combines it with
`browser-controls.html`, adding visible **01–10** buttons, **Previous**, **Next**,
and **Show all 10** at the top. Show all displays the ten designs one below
another. The browser controls work without the conversation host.

Switch the app navigation between Best Slips and Slip Builder to compare the
same sharing design in both page contexts. The source remains a design preview;
opening the generated browser page provides the complete navigation controls.

Run these commands from the repository root:

```powershell
python next-js/design/desktop-slip-sharing/build-preview.py
python -m http.server 8357 --bind 127.0.0.1 --directory "next-js/output"
```

Open `http://127.0.0.1:8357/desktop-slip-sharing-preview.html`. The generated page
and browser screenshots stay in ignored `next-js/output/`; the editable design
sources, browser builder, and documentation are tracked.

All sends, downloads, copies, recipient choices, and WhatsApp actions are local
preview simulations. No real WhatsApp recipient is selected, no message is sent,
and no production data or account state is changed. The samples demonstrate the
selected interface and preserve the alternatives for design review.

## Desktop handoff and future linking

The designs include a manual desktop path: save the slip image, copy the caption,
open WhatsApp, attach the image, paste the caption, and choose a recipient there.
An ordinary WhatsApp URL does not by itself attach a generated image. The chosen
production implementation checks native file-sharing capability and retains the
manual attachment path; available targets are controlled by the browser and OS.
See the [Web Share specification](https://www.w3.org/TR/web-share/) and WhatsApp's
guidance on [click to chat](https://faq.whatsapp.com/5913398998672934) and
[sending media on the web](https://faq.whatsapp.com/453914586839706/?cms_platform=web&locale=en_US).

The production storage and linking requirements are documented separately in
[shared slip storage](../../docs/shared-slips.md) and
[app-link setup](../../docs/slip-app-links.md). Database migration/grants,
deployed association configuration, and signed-device verification are not
established by this simulated gallery.

## Verification

- Python builder syntax and both browser scripts passed syntax checks.
- All ten numbered buttons, Previous/Next, Show all 10, and return to one design
  passed browser checks. The numbered buttons appear in the first viewport.
- All ten sharing flows passed in both Best Slips and Slip Builder (20 flows).
  Most designs open the preview directly; Compact menu and Quick actions first
  offer a compact sharing choice. Feedback remains within the same panel.
- Thirty layout checks covered all ten previews at browser widths of 1200,
  800, and 390px, with no horizontal overflow or panels extending outside the
  app. The narrow check is containment verification, not a new mobile design.
- All ten designs remained visible and contained in Show all mode. Numbered
  keyboard activation, menu toggling, and Escape dismissal restoring focus passed.
- Compact dialog, landscape sheet, and dark-theme screenshots received visual
  review with no material clipping, contrast, or spacing issues.
- The browser console reported zero errors and warnings.

These results describe the simulated gallery revision. Production implementation
and its verification are tracked separately in
[plan 153](../../dev-plan/153-slim-drawer-slip-sharing.md).
