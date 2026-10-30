# Slip sharing rendering fixture

This isolated acceptance application uses the production `SlipCard` and sharing
drawer with synthetic, schema-valid public snapshots. It never reads a database,
creates real public links, or contacts a WhatsApp recipient.

Create with `create_fixture("slip-sharing")` from `scripts/lib/rendering.py`.
The normal fixture helper supplies the root layout, theme, brand assets, and flags.

- `/` or `/builder`: custom-builder source and three selections.
- `/best`: editorial source and the same three selections.
- `/shared` or `/s/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`: existing public record;
  opening Share does not call POST.
- `/unauthorized`, `/changed`, `/failure`: preparation API returns 403, 409, or
  503 respectively. Each still uses the production drawer error UI.
- `/long`: all 800 selections, exercising image pagination and ZIP generation.

`POST /api/slips/share` checks the real strict source schema and the exact fixture
identity. Unknown/extra fields and unknown slip identities fail. It returns a
real `sharedSlipSchema`-validated synthetic response for successful scenarios.
`GET /api/slips/share/<id>` exposes only a known fixture token. There are no live
member, publication, or stored-football reads.
