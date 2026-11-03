# Shared slip links

Published Best Slips retain their canonical publication links. New custom slips
remain in browser memory and share their prepared images. Existing `/s/<token>`
links continue reading their immutable, sealed snapshots, including previously
shared custom slips. Display numbers never replace internal identities or URLs.

Unfinished selections require authenticated eligible access on the receiving
device. Completed slips are readable without access. A link never grants
entitlement. Public responses exclude account IDs, phones, sessions, owner
digests and rate-limit data.

## Current sharing contracts

`POST /api/slips/share` accepts a published source identity:

```json
{"source":"best","day":"2026-10-29","slipId":"server-generated identity"}
```

The same-origin request resolves the sealed daily publication rather than
accepting client prices or outcomes. Completed public slips are available
without subscription; unfinished slips require current eligible access, checked
again after number allocation. The response includes the original slip,
publication URL/time, current status, eight-digit number and enabled public
support contacts. It creates no new SharedSlip snapshot.

`POST /api/slips/number` allocates a stable display number for an entitled custom
slip fingerprint or an accessible legacy token. Its registry retains only the
fingerprint and assigned number, without personal selections or account IDs.
See [slip sharing](slip-sharing.md) for the two-action drawer, image design,
numbering and native-host contracts.

## Existing token links

`GET /api/slips/share/<token>` and `/s/<token>` read only existing shared records.
Tokens retain their fixed lowercase hexadecimal shape and 128 bits of entropy.
Readers verify the stored JSON integrity seal and schema before projecting the
public allowlist. Original selections, prices and forecast references remain
independent of later publications or account erasure. Progress is resolved from
those original forecast bindings.

The landing distinguishes access-required, missing/invalid and temporarily
unavailable states. Restricted HTML/RSC responses contain no snapshot or
selection aggregates. Social metadata is generic and never reads a slip.
Pages and APIs are private/no-store, unframed and noindex. Access is rechecked
before releasing unfinished selections, including expiry races.

Sign-in and Get access retain only canonical `/s/<32 lowercase hex>` return
paths; external addresses, escapes, queries and fragments are rejected.
Verification/recovery preserves that path. The subscription page provides a
Return to shared slip link without bypassing permissions.

## Storage and deployment

The original `20261029180000_shared_slips` migration and insert-only SharedSlip
storage remain compatible. The transient-slip migration preserves existing
records. Database triggers reject updates and deletion; there is no expiry or
prune job. The private owner digest contains no raw account ID.

Deploy the readable-code migration and application-role grants described in
[slip sharing](slip-sharing.md) before using the new number registry. Creating
source files does not migrate a deployed database or grant privileges. Missing
database capabilities fail closed.

## Verification

Domain/service/HTTP checks cover canonical URLs, privacy, entitlement expiry,
original forecast bindings, number deduplication, throttling, corruption refusal
and legacy token reads. Isolated MySQL checks apply real migrations and verify
immutable legacy storage, concurrent numbering and referral-code compatibility.
The [implementation plan](../dev-plan/255-branded-slip-sharing-and-readable-codes.md)
records actual results and outstanding release checks.
