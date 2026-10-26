# UI design exploration

Create 10 distinct design options for the specified UI component(s) or screen. Show mobile and desktop layouts side by side for every option so I can compare them and select one for later implementation.

Minimize text and maximize useful visuals in both the designs and their presentation. Let the interface communicate at a glance.

This is a design and preview task. Create only the isolated browser-preview artifacts needed to review the options. Do not integrate them into the application or change its routes, business logic, data, or dependencies.

## Scope and consistency

- Inspect the existing UI, content, user flows, and shared components before designing. Follow the supplied requirements and repository guidance.
- Preserve the required information and actions in every option. Use the same representative content and state across options so the comparison is fair. Clearly label sample data where needed.
- Keep the scope focused on the specified component(s) or screen. Do not invent features, claims, metrics, or unrelated content.
- Reuse the established visual language and component patterns unless a requested change requires otherwise. Keep repeated controls and shared elements consistent within and across screens.

## Design criteria

- **Compact and complete:** Minimize wasted vertical space, oversized headers, unnecessary containers, and repeated information. Keep essential content and actions easy to find. Do not achieve density through tiny text, cramped controls, or hidden requirements.
- **Visual first:** Give most of the space to the UI and meaningful visual information. Use icons, diagrams, charts, and visual states where they communicate more clearly than prose. Keep headings, labels, and helper text as short as possible; remove redundant explanations. Preserve essential instructions, values, units, and accessible control names. Avoid decorative filler and ambiguous icon-only actions.
- **Clear and intuitive:** Use a strong visual hierarchy, concise labels, and an obvious primary action where appropriate. Keep navigation and task flows straightforward.
- **Elegant and restrained:** Use deliberate spacing, alignment, typography, and contrast. Prefer square corners; use rounded corners only where functionally necessary. Avoid decorative clutter and unnecessary effects.
- **Accessible and responsive:** Maintain readable text, sufficient contrast, usable touch targets, visible keyboard focus, and clear control labels. Adapt the layout to each viewport without clipping, overlap, or unintended horizontal scrolling.
- **Meaningfully different:** Explore useful differences in layout, grouping, information hierarchy, action placement, or navigation. Each option should offer a distinct approach, rather than merely changing colors or spacing. Preserve familiar shared controls unless those controls are the subject of the exploration.

## Browser preview

1. Deliver all 10 complete options in a lightweight, visual comparison gallery. Use only an option number and short name around each sample; let the previews show the differences. Avoid descriptive paragraphs and repeated captions.
2. Show clearly labeled mobile and desktop previews together for every option. Render them at representative viewport widths, with each layout responding to its own preview width. Allow the comparison area to scroll on narrow review windows instead of shrinking text to fit.
3. Use reusable preview components and shared styles where practical. Keep any simulated interactions local to the preview, with no live API calls or data mutations.
4. Show the key state needed to understand each design. Include additional states or simple interactions only where necessary to evaluate the specified flow, and keep these comparable across options.
5. Open and inspect the gallery in a browser. Verify that all options render, both viewport layouts remain usable, and any included preview controls work.

## Delivery

Provide a direct link or local file path to the browser preview. Recommend the strongest option in one short sentence, then wait for my selection before implementing it in the application. Keep the response focused on the visuals.
