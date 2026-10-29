# Subscriber interface samples

Open `/admin-subscriber-designs` on the running application, normally
<http://localhost:3000/admin-subscriber-designs>. Samples **01–10** share the
existing subscriber detail, access form, admin record workspace, controls,
typography, themes, and provider artwork. The live Subscribers layout is not
replaced by these studies.

| Sample | Name | Arrangement |
| --- | --- | --- |
| 01 | Balanced compact | Compact identity, facts, actions, and adjacent tabs |
| 02 | Subscriber ledger | Fine rules and aligned account facts |
| 03 | Identity strip | Highlighted phone number above compact account tools |
| 04 | Split summary | Identity beside facts, with a shared action row |
| 05 | Action ribbon | Distinct compact action strip above record tabs |
| 06 | Quiet profile | Centered identity with restrained account controls |
| 07 | Dense desk | Short list rows and minimal summary spacing |
| 08 | Accent edge | A narrow brand rail connects selection and details |
| 09 | Status first | Account status leads the directory and summary |
| 10 | Detail focus | Narrower directory leaves more room for record content |

Use the numbered strip, selector, previous/next buttons, or overview cards to
compare samples. Fragments `#01` through `#10` link to individual samples. Theme
switching changes the entire preview, including dialogs. Reset restores the
fictional accounts, filters, selection, and drafts.

## Search, filters, and data meaning

- Search updates immediately as text changes. It accepts partial phone numbers,
  local or international phone forms, account IDs, package names, access-code
  and payment references, and private sample notes. There is no Search button
  or phone-country selector in the search field.
- Filters combine account state (Open, Blocked, Erased), current access (Active,
  Queued, None), current package, and recent sign-in. Counts and selected details
  follow the visible results. Search and filters remain separate from scrolling.
- Recent sign-in is measured against the illustrative 29 October 2026 snapshot.
  The application’s device timestamps do not establish real-time online status;
  no sample claims that a member is online now.
- MTN and Airtel badges use existing artwork with explicitly fictional carrier
  assignments. Unknown networks have a neutral globe. Real subscriber accounts
  currently store no carrier, and configured prefix mappings are empty. A
  payment’s provider cannot establish the subscriber’s phone carrier.
- The current production directory provides recent accounts or an exact full
  phone search. Broad server search and enriched list filters need implementation
  after a layout is selected; the samples operate on their own enriched records.

## Dialogs and reusable components

The sample header keeps Subscribers on the left and the add/grant action on the
right. Selecting a record shows compact account facts and actions with the
Overview, Access, Payments, Credit, and Devices tabs immediately below.

Grant access, Change number, Block/Unblock, and Sign out devices
open native modal dialogs. Existing access and account forms retain their
validation, with scrollable dialog bodies, visible action footers, Escape,
keyboard focus containment, and return focus. Reset password is omitted from
these samples, as requested.

The real SubscriberDetail accepts an optional sample presentation; its default
live presentation is retained. The shared phone country picker places its menu
inside a containing native dialog when needed, keeping the picker interactive
in the browser’s modal layer.

All sample mutations use an in-memory transport. Native form fallbacks also
avoid live admin endpoints. No private account records, messages, credentials,
or business storage are accessed. The gallery is marked `noindex, nofollow`.

## Verification

Run `python scripts/verify-subscriber-designs-rendering.py` from `next-js/` to
build the real gallery in an isolated production fixture and inspect rendered
controls, sample options, asset availability, identifiers, and safe form
actions. Add `--serve` for browser review. Generated artifacts belong in ignored
`.tmp/` and `output/playwright/` directories.
