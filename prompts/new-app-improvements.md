# App improvements

## App-wide

- Minimum odd is `1.01`.
- Select/dropdown components have a selection bug: the first click closes the dropdown without selecting; the second open-and-click selects. Fix so one click selects.

## Account

- Add a wallet screen under the user account section.
- Users can top up their wallet.
- Users with wallet credit can enable subscription auto-renewal.
- Wallet balance cannot be withdrawn.

## Slips page

## Footer

- On desktop, reduce the footer’s vertical padding so it uses less vertical space.

## Builder page

- Add a **Date and time** section header above the From/To date-time inputs.
- Rename labels: `From date and time` → `From`; `To date and time` → `To`.
- Size those inputs to content width (avoid excess horizontal space).
- Label the markets control **Markets**; it opens the Markets dialog. Remove the right-pointing arrow.
- Add appropriate icons to **Markets**, **Custom filters**, **Reset**, and **Build slips**.
- When **Build slips** is locked, its icon is a lock.
- Standardize these buttons wherever they appear in the app.

## Custom Filters dialog

- Add an appropriate icon to the dialog title.
- Place **Choose a filter** select/dropdown component at the top.
- Above that dropdown, show: `x of N filters saved. You can save up to a maximum of N custom filters`.
- Remove the `x of N saved` text that currently sits below the dropdown.
- Default custom filter is selected by default in **Choose a filter**.
- Below **Choose a filter**, show a filters form like the Builder page, prefilled with the selected filter’s values.
- The markets button opens a nested Markets dialog (not an inline market form).
- Keep all action buttons inside the Custom Filters dialog and place them in the dialog's footer:
  - **Create** — nested dialog for the new filter name; names must be unique.
  - **Rename** — nested dialog for renaming the selected filter; names must be unique.
  - **Update** — replace the selected filter’s values with the current form values.
  - **Delete** — delete the selected filter.
  - **Use selected filter (rename to "Apply")** — apply the selected filter’s values to the Builder page filters.
- Action buttons need appropriate confirmation, validation, and warnings.
- Selecting a filter in **Choose a filter** fills the Custom Filters form only; it does not update Builder filters until **Use selected filter (renamed to "Apply")**.
- Dismiss only via close (`x`), **Use selected filter (renamed to "Apply")**, or `Esc`.

## Invite friends

- Logged out: **Invite friends** in the app menu opens the device share UI with the app website link and a short advertising message.
- Logged in: share the user’s referral link. Completing registration via that link earns the inviter points (24 hours of access).

## Results and Performance (Rename to "Performance")

- Add the logo to the **Results and Performance** section title.
- Keep the filters section (from date, to date, prediction market, prediction source), revised as follows:
  - Date filter: include time with the date — both **From** and **To** have date and time.
  - Prediction markets: replace the current dropdown/dialog with a button labeled **Markets** that opens a dialog listing the different markets.
  - Prediction source: three sources — API Football, Local Engine, and AI.
  - Rename **Apply Periods** to **Apply** (applies periods, predictions, and source).
- Remove the helper text below that filter section (e.g. “choose up to 30 days” and similar).

### Individual Predictions

- **Individual Predictions** is a title on its own.
- Remove the existing words in that area — specifically lines like: “One locked selection per market and fixture, grouped by kickoff date. A fixture can appear in several market rows; do not add those rows as unique matches. **Fixtures in period: 600"** and related items.
- Reuse the tab component already implemented on the match details page, used the same way on mobile and desktop. Each tab represents a market.
- Markets include: match results, double chance, under, over, both teams to score, and so on (the different markets available).
- Each tab’s content holds the details for that market’s individual prediction analysis.

### Results by League

- Each league is represented by a single tab.
- Reuse the same tab pattern as the match-details tabs, used the same way on mobile and desktop.
