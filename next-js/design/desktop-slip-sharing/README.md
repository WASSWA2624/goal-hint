# Desktop slip sharing samples

Ten interactive desktop concepts show where the slip-header Share action sits
and how a visitor prepares a branded slip image and message for WhatsApp. The
gallery supports both **Best Slips** and **Slip Builder**, following the existing
shared Aligned ledger slip presentation, Manrope typography, cool blue surfaces,
compact controls, and square edges.

These are design samples awaiting selection. No production sharing component,
public-slip route, image export service, or app-link registration is implemented.

## Concepts

| No. | Concept | Sharing arrangement |
| --- | --- | --- |
| 01 | Header menu | A compact menu anchored to the slip-header Share action. |
| 02 | Preview dialog | A centered image-and-message review dialog. |
| 03 | Right drawer | A sharing panel beside the slip list. |
| 04 | Inline expansion | Sharing controls expand beneath the selected slip header. |
| 05 | Guided steps | A sequential destination, preview, and handoff flow. |
| 06 | Split workspace | The selected slip and sharing preparation appear side by side. |
| 07 | Bottom tray | A desktop tray keeps sharing controls below the slip context. |
| 08 | Image lightbox | A larger image preview leads to the sharing controls. |
| 09 | Export checklist | An explicit preparation checklist accompanies the preview. |
| 10 | Share studio | A dedicated sharing workspace groups image and message controls. |

Every concept includes the header trigger, WhatsApp choice, branded image and
caption review, and the desktop save/copy/open/attach handoff. Other destinations
are reserved for later design and implementation.

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
`GH-26K-8F2` and `https://goalhint.com/s/GH-26K-8F2` are illustrative. The `/s/`
route does not exist as part of this change. Both the app URL and proposed
individual-slip URL appear in the review.

## Preview behavior

`desktop-slip-sharing.html` is the editable, standalone-compatible HTML fragment.
The conversation host supplies the concept carousel; the generated standalone
wrapper supplies navigation fallback for browser review. Switch the application
context to compare the same sharing design on Best Slips and Slip Builder.
Each concept starts at its image review. The four stage controls above the
application show the header trigger, WhatsApp options, review, and handoff;
Restart returns to the initial slip header. The bottom concept picker supplies
all ten named samples. The optional host design controls compare page context,
image-footer wording, and appearance. The page-context navigation also works
without those optional controls.

Opening the fragment directly does not load the host carousel. For a complete
local browser preview, render a wrapper with the installed visualization skill:

```powershell
python "C:/Users/WASSWA WILSON/.codex/plugins/cache/openai-bundled/visualize/1.0.57/skills/visualize/scripts/render.py" "next-js/design/desktop-slip-sharing/desktop-slip-sharing.html" "next-js/output/desktop-slip-sharing-preview.html" --force
python -m http.server 8357 --bind 127.0.0.1 --directory "next-js/output"
```

Run from the repository root, then open
`http://127.0.0.1:8357/desktop-slip-sharing-preview.html`. The renderer path is
workstation-specific. The wrapper and browser screenshots stay in ignored
`next-js/output/`; only the editable design source and documentation are tracked.

All sends, downloads, copies, recipient choices, and handoff actions are local
preview simulations. No real WhatsApp recipient is selected, no message is sent,
and no production data or account state is changed. The samples demonstrate the
interface to review before implementation approval.

## Desktop handoff and future linking

The designs include a manual desktop path: save the slip image, copy the caption,
open WhatsApp, attach the image, paste the caption, and choose a recipient there.
An ordinary WhatsApp URL does not by itself attach a generated image. Native
file sharing must later be checked against the browser's supported share data
and available targets; selecting WhatsApp cannot be guaranteed by the website.
See the [Web Share specification](https://www.w3.org/TR/web-share/) and WhatsApp's
guidance on [click to chat](https://faq.whatsapp.com/5913398998672934) and
[sending media on the web](https://faq.whatsapp.com/453914586839706/?cms_platform=web&locale=en_US).

Permanent slip storage, public-slip access rules, link previews, and HTTPS app
links that open an installed app require later implementation after a concept is
chosen. The preview does not claim those capabilities are already available.

## Verification

- JavaScript syntax passed `node --check` on the extracted script. Fragment
  validation confirmed ten variants, one script, no document wrapper, and a size
  below 1 MB.
- Chromium exercised all ten complete sharing flows in each application context
  (20 flows), including the image preview, caption preparation, simulated handoff,
  return controls, and separate slip disclosure control.
- All ten review layouts were checked at browser widths of 1080, 800, and 390px
  with no horizontal overflow or sharing panel extending beyond the app surface.
  The narrow check verifies containment, not a proposed mobile design.
- Light screenshots of all ten review arrangements and a dark dialog screenshot
  were inspected. PNG concepts intentionally retain their light paper treatment
  in dark app chrome.
- Editable notes keep the app URL, slip URL, and branding in a separate fixed
  caption block. Export checklist handoff proceeds in one action.
- Modal Tab containment and Escape dismissal with focus returned to the Share
  action passed. A repeated local state notification preserves keyboard focus.
- Final browser console reported no errors or warnings.

Production integration checks and a production build were not run because this
change contains isolated design HTML and documentation, with no runtime edits.
