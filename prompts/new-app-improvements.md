# App improvements

## App-wide

- Minimum odd is `1.01`.
- Select/dropdown components styled like **Match status** on the Advanced Filter dialog (`/en/matches`) have a selection bug: the first click closes the dropdown without selecting; the second open-and-click selects. Fix so one click selects.
- Keep constant chrome and value-only components from full remounts app-wide: do not reload UI that is unchanged across pages; update values in place when layout is fixed. Preserve UI and app logic; keep rendering efficient.

## Account

- Add a wallet screen under the user account section.
- Users can top up their wallet.
- Users with wallet credit can enable subscription auto-renewal.
- Wallet balance cannot be withdrawn.

## Slips page

- Remove `EAT` from the overall slips title.  
  Example: `Browsing: 06-Nov-2026 · EAT All slips Total odds: 2.50–5.00` → `Browsing: 06-Nov-2026 All slips Total odds: 2.50–5.00`
- On mobile, remove the word `Slip` from the slip number in the slip header.
- Thicken the left, right, and bottom borders of the slip; they should use the same background as the slip header.
- Remove these texts: `All slips in this selection are shown.` and `Estimates are not guarantees. A slip wins only if every selection wins.`

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
- Place **Choose a filter** at the top.
- Above that dropdown, show: `x of N filters saved. You can save up to a maximum of N custom filters`.
- Remove the `x of N saved` text that currently sits below the dropdown.
- Default custom filter is selected by default in **Choose a filter**.
- Below **Choose a filter**, show a filters form like the Builder page, prefilled with the selected filter’s values.
- The markets button opens a nested Markets dialog (not an inline market form).
- Keep all action buttons inside the Custom Filters dialog:
  - **Create** — nested dialog for the new filter name; names must be unique.
  - **Rename** — nested dialog for renaming the selected filter; names must be unique.
  - **Update** — replace the selected filter’s values with the current form values.
  - **Delete** — delete the selected filter.
  - **Use selected filter** — apply the selected filter’s values to the Builder page filters.
- Action buttons need appropriate confirmation, validation, and warnings.
- Selecting a filter in **Choose a filter** fills the Custom Filters form only; it does not update Builder filters until **Use selected filter**.
- Dismiss only via close (`x`), **Use selected filter**, or `Esc`.

## Invite friends

- Logged out: **Invite friends** in the app menu opens the device share UI with the app website link and a short advertising message.
- Logged in: share the user’s referral link. Completing registration via that link earns the inviter points (24 hours of access).

## Results & performance