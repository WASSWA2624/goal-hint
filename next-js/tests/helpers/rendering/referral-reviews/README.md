# Referral review rendering fixture

Run `npm run test:referral-reviews:rendering` for the production component build
and server-response privacy assertions. Add `-- --serve` to keep the isolated
fixture available for browser checks: `/` is the administrator workspace and
`/member` is the private Account review panel.

All identities, grants, evidence and mutation state are synthetic. The fixture
exercises layout and interaction only. Its transport does not model real
authentication, financial transactions, races or account ownership; those are
covered by `npm run test:referral-reviews` and its genuine MySQL suite.
