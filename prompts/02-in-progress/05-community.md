# GoalHint — 05: Community Invitations and Reminders

## Objective
Add the agreed **Community** invitation/reminder behavior for logged-in users and guests. Refer to it as **Community** in general messaging, not merely “WhatsApp channel.” Preserve the existing GoalHint navigation, design, and configured WhatsApp Group/Channel destinations. Execute last because it touches guest and signed-in state.

## First inspect
Find the existing Community screen/links, popup components, account model, session state, and browser storage. **No screenshots are supplied.** Reuse shared dialogs and WhatsApp URLs already configured in the app; don't create duplicate hardcoded destinations.

## Invitation rules
1. On app entry, check whether this person has **confirmed** joining the Community. For a logged-in account, use persistent **account/database** status; for a guest, use persistent **browser/device storage**.
2. If confirmed joined, do **not** show the invitation. Otherwise, show it on first eligible visit, **at most once per rolling 24 hours**. Closing it or choosing **No** must not cause another invitation the same day; remind again after 24 hours until confirmed joined.
3. The invitation offers **Close**, **WhatsApp Group**, and **WhatsApp Channel**. Tapping either destination closes the invitation and opens the configured WhatsApp link; record that the user left to try joining.
4. **On return to GoalHint after tapping a destination**, show a short separate confirmation dialog: **“Did you join our community?”** with **Yes** and **No**. **Yes** marks joined and permanently stops automatic reminders. **No** leaves unjoined; the invitation becomes eligible again after the 24-hour interval. Don't assume a tap proves membership.
5. Apply the same invitation/confirmation flow to **guests** without forcing registration. Guest state may be lost if local browser storage is cleared or the device changes. For logged-in users, retain state across devices using their account. If the same guest subsequently registers/logs in on the device, reconcile their locally confirmed joined state without overwriting a previously confirmed account state.
6. Preserve existing app behavior and avoid intrusive popups when users navigate repeatedly during one visit.

## Verify
Test logged-in vs guest, first visit, same-day revisits, 24-hour expiry, Close, Group/Channel outbound links, returning Yes/No, already-confirmed users, cleared browser data, and login/register transitions. Don't claim automatic WhatsApp membership verification or require new external integrations. Report changed files and tests.
