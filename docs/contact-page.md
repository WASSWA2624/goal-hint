# Contact page and correction reporting

`/en/contact` uses the existing reusable information/public shell, semantic headings
and square components. Its canonical remains `https://goalhint.com/en/contact`.

## Confirmed contact facts

On **12 October 2026**, the owner confirmed Wilson Wasswa, Uganda, as Goal Hint's
operator and the person responsible for general questions, privacy requests,
corrections and disputes. The intended audience is worldwide English-speaking
football fans aged 18+. These shared facts live in `src/domain/public-operator.ts`.

The exact owner-approved public email is **wasswawilon0002@gmail.com**. Preserve
that spelling. `contactNotice` records `publication: available`, `releaseReady:
true` and the fixed bare `mailto:` destination. The Contact page opens the visitor's
email application; no contact form, mailbox creation, email backend, test message
or delivery guarantee is added. There is no promised response deadline.

These new facts supersede the earlier OP-25/27/28 deferrals for contact identity,
responsibility and destination. The owner confirmed the destination for public
use; a successful delivery test is not claimed. Contact readiness alone cannot
enable indexing: privacy, terms and the overall release gate remain incomplete.
The intended launch is 1 November 2026; no automatic release is scheduled here.

## Reporting and policy integration

Reports should include the match/revision URL, observed issue or proposed
correction and a supporting public source when available. Sensitive personal
information is unnecessary. Wilson reviews reports against the available evidence.
Verified result corrections preserve the immutable locked forecast and can leave
an outcome pending while verified settlement is resolved. Reports themselves do
not mutate stored results or forecasts; no automatic correction is promised.

Existing Privacy, Terms and Help links and anchors remain in place. Privacy and
Terms now identify the responsible person and direct requests to this page.

## Link and input boundary

The mailto is a source-owned constant, not built from visitor input. It contains
only the approved email with no subject, body, additional recipient, query or
fragment. Query fields such as email, operator, destination, subject, body and
returnTo never alter the link or visible operator information. All other links
remain fixed same-origin navigation.

## Local acceptance

After a production build, run `npm run test:contact:html -- http://127.0.0.1:PORT`
alongside privacy, terms and navigation verifiers. The contact verifier checks the
single exact mailto, no mail headers, query-injection isolation, owner facts,
no forms, canonical/noindex behavior and contextual policy links, without sending
an email. Synthetic approved-production SEO checks include Contact in discovery;
actual production discovery remains disabled by unfinished global release gates.
