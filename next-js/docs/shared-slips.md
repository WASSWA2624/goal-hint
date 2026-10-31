# Shared slip links

Desktop and phone sharing create an immutable snapshot at `/s/<token>`.
Unfinished selections require authenticated eligible access on the receiving
device. Completed slips are readable without access. The token does not grant
entitlement. No account ID, phone, session, owner digest, or rate-limit data appears in
the public response. The source slip's selections, original prices, and forecast
references are retained independently of future changes or account erasure.

## Creation and read contracts

`POST /api/slips/share` accepts exactly one source:

```json
{"source":"builder","criteria":"dateFrom=...","slipId":"server-generated identity"}
```

```json
{"source":"best","day":"2026-10-29","slipId":"server-generated identity"}
```

The request must be same-origin and belong to an authenticated, entitled member.
Builder selections are rebuilt from the bounded criteria and then bound again
under fixture locks. Best Slips selections come from the existing sealed daily
publication reader. A client-submitted snapshot, price, or claimed outcome is
never accepted. Account/session/subscription checks repeat under the member
account lock before publication. A changed builder selection returns `409`.

Successful creation returns `{id, url, createdAt, slip}`. The random token has
128 bits of entropy. A private keyed owner digest and snapshot fingerprint
deduplicate retries; an already-created link consumes no additional creation
quota. Only 30 new snapshots per member per hour are allowed. Each snapshot
retains the existing limit of 800 selections and is bounded to 8 MiB.

`GET /api/slips/share/<token>` and the `/s/<token>` page read only an explicitly
created shared record. Tokens have a fixed lowercase hexadecimal shape. Reads
check the stored JSON integrity seal and schema before projecting the public
allowlist. The sharing API is never cached or indexed. Shared pages are not
indexed and contain the original snapshot rather than claiming current scores.

The landing distinguishes access-required, missing/invalid and temporarily
unavailable states. Restricted HTML/RSC responses contain no snapshot or selection
aggregates. Social metadata is generic for every viewer and never reads a slip.
Pages and APIs are private/no-store, unframed and noindex. Access is rechecked
before releasing a snapshot, including races where a subscription expires.

Sign-in and Get access links retain only canonical `/s/<32 lowercase hex>` return
paths; external addresses, escapes, queries and fragments are rejected. Required
verification/recovery steps retain that path. Ordinary sign-ins still finish at
home and administrators retain their dashboard. The subscription page provides
an explicit Return to shared slip link before/after approval; returning early
shows the same gate without bypassing permissions.

The selected drawer creates the record when sharing is opened. Saving the image,
copying its caption, and handing off to WhatsApp use the shared response. Native
file sharing depends on browser support; the desktop manual attachment path
remains available. No message is sent without the user choosing it in WhatsApp.

## Storage and deployment

Apply `20261029180000_shared_slips` with the migration role before deploying the
new sharing API. MySQL uses the committed Prisma migration. MariaDB 11.4 uses
`prisma/mariadb/20261029180000_shared_slips.sql`, which records the exact Prisma
migration checksum after schema verification. DDL is nontransactional on MariaDB;
do not retry a partial import. The ordinary application role requires only
`SELECT, INSERT` on `SharedSlip`; the documented grant is in
`docs/deployment/shared-slip-grants.sql`.

There is no expiry, prune job, update path, or delete path for a shared record.
Database triggers reject updates and deletion. Private member saves keep their
existing account-erasure behavior; shared records remain independently stored, with the same completion/access
read checks. The owner digest stays private and does not contain a raw account ID.

Creating source files does not migrate a deployed database or grant database
privileges. Without the migration/grants the API fails closed with `503`.

## Verification

The new domain/service/HTTP unit tests cover source allowlisting, canonical URL
matching, ownership privacy, retry deduplication, authenticated entitlement,
forecast rebinding, throttling, corruption refusal, and unauthenticated reads.
The isolated MySQL integration test applies the actual migration and checks
insert-only privileges, permanent links after account erasure, and both immutable
triggers. It skips explicitly when a genuine MySQL test-server binary is absent.
