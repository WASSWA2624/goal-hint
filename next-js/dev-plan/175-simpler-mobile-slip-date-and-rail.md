# 175 — Simpler mobile slip date and square rail

## Scope

Remove the year and the pipe between the slip number and weekday in shared
mobile headers. Square the leading corners so the blue rail has straight ends.
Make the desktop and mobile chevrons more prominent.

## Implementation

- Omit the year from both timestamp and date-only mobile labels. Retain the
  original machine-readable date/time and full desktop date formatting.
- Remove the pipe markup and its unused style from the shared mobile header.
- Set both leading card corners to `theme.radius.none`, retaining the trailing
  control-radius corners and the rounded disclosure indicator.
- Reuse the existing component across mobile slip contexts. No data, filter,
  status, pagination or disclosure behavior changes.
- Double the shared chevron stroke to 3px on both layouts while retaining the
  rounded frame dimensions and centered placement.

## Verification

- Scoped ESLint and whitespace checks passed.
- 42 browser assertions passed at 320/390px mobile and 1440px desktop in both
  themes: shortened mobile dates, unchanged desktop/year-bearing ISO timestamps,
  no pipe, square leading rail corners, preserved trailing corners, no page
  overflow and native keyboard disclosure.
- Verified the bolder chevrons on both layouts with device-pixel rounding
  tolerance: the 20px/28px frames and expansion/collapse behavior are unchanged.
- Generated browser output remains ignored. No business logic changed.
