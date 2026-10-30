# 181 — Consolidate mobile slip access guidance

Remove the duplicate Unlock new slips panel below Best Slips filters. The shared
confirmed-session mobile banner below the app header now includes:

> Completed slips are public. Subscribe for live/upcoming.

The existing price, Sign up / Sign in, Subscribe, payment and account actions
retain their session-driven behavior and return destinations. Active subscribers
do not receive the acquisition note. Other mobile surfaces retain their approved
single-row banner. Desktop guidance remains in its existing banner.

The obsolete mobile-only panel and unused translations are removed. Server
access projections, completed-only public slips, private identities and forecast
redaction remain unchanged. SSR assertions check the absence of the obsolete
panel while retaining their private-data checks; the subscription fixture also
exercises Best Slips header guidance with confirmed account states.

Browser checks passed at 320px, 375px and 430px for signed-out, member, expired,
pending-payment and active-subscriber states. Session transitions retain the
appropriate actions; the note is absent from other pages and active accounts.
