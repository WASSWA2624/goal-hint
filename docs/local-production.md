# Local production startup

The local production profile configured on 26 October 2026 runs the built Next.js
application against the existing MySQL database with verified TLS. From the
repository root, stop the development server and run:

```sh
npm run build
npm run start
```

Open [localhost:3000/en](http://localhost:3000/en). Both development and production
default to port 3000. If another server should keep that port, run
`npm start -- --port 3001` and open [localhost:3001/en](http://localhost:3001/en).

## Private local configuration

Next.js loads the ignored root `.env.production.local` before `.env.local` during
production builds and startup. Exported process variables take precedence over
both files. The profile inherits the existing private application connection URL
from `.env.local` and supplies these local choices:

- Deployment classification remains `development`; operation scope is `disabled`.
- Database access remains enabled, using direct TCP and an explicit pool limit.
- Football, AI and research providers remain disabled in the web process.
- `GOAL_HINT_DATABASE_TLS_MODE=required`; the trusted CA is
  `.goal-hint/local-production-20261026/mysql-ca.pem`.
- The infrastructure cap is explicitly `0`, covering this existing local runtime.
  Database-access and budget references match the private
  `.goal-hint/owner-approvals.json` register and the user's local-start request.

Those records apply to the inspected loopback MySQL target on `127.0.0.1:3307`,
UUID `2f3984e9-c6e2-11f1-9e3a-6c2408f48ddb`, with separate application and
migration roles. Keep the environment file and approval register private.
This local profile does not qualify hosted production, public indexing or paid
provider operations; those require their own configuration and evidence.

## TLS maintenance

The live server certificate and private key are under the real, unvirtualized
`%LOCALAPPDATA%\GoalHint\tls\local-production-20261026` directory. MySQL persists
their `ssl_cert` and `ssl_key` paths. The certificate covers `localhost`,
`127.0.0.1` and `::1`, and expires on **27 November 2027 at 02:36 EAT**.

Renew before expiry using the existing local CA and preserve the private key's
restricted permissions. Verify the live server identity before administration;
the [local database guide](local-database.md#msix-filesystem-virtualization-during-local-administration)
explains why packaged applications can see stale AppData files. Use the same-user
administrative helper to persist replacement certificate paths and run
`ALTER INSTANCE RELOAD TLS`. Verify hostname validation and an encrypted
application session, then restart the web server. Certificate verification must
remain enabled.

Private evidence in `.goal-hint/local-production-20261026/` preserves the previous
TLS settings, approval-register backup, inspected grants, trusted CA and TLS
verification receipt. Preserve those records and the previous certificate files
until a replacement is verified. The initial application check reported database
health `ready` and a nonempty TLS cipher through the production database adapter.
