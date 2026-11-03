# 266 — Consistent Performance and Predictions headers

- Reuse one themed section-header primitive for title size, medium weight,
  line height and padding on mobile and desktop.
- Share date metadata styling while retaining each header's existing layout.
- Keep the performance header's outer padding from doubling its shared inset.
- Verify resolved typography, padding, inline dates and overflow in both themes
  at mobile, tablet and desktop widths. Preserve unrelated Best Slips work.
- Mobile results use Matches and numeric publication dates, for example
  `28-10-2026 00:56 EAT`; desktop retains Predictions and the abbreviated weekday.
  Both variants share the same stored instant and display-zone formatter.

## Verification

- Focused lint, the theme-token contract and all 12 timestamp tests passed.
- The production header fixture compiled and typechecked with the app's Manrope font.
- Ten browser combinations passed: light/dark at 320, 390, 768, 1024 and 1440px.
  Header font family, size, weight, line height, metadata style and 8px padding
  match exactly. Dates remain inline and the 600-match count does not overflow.
- Mobile publication tests cover EAT, a previous local day, a half-hour zone,
  the year boundary and invalid instants. Desktop formatting remains unchanged.
- Integrated with the completed Best Slips changes on main. No deployment performed.
