# Server services

Place database access, provider adapters, validated private configuration and
reusable application services here. Every executable module must include the
side-effect import `import "server-only";`, including re-export modules. ESLint
requires the marker and Next.js rejects transitive imports into client bundles.

Share these services with server routes and durable workers; do not import
worker entry points here. Public response contracts belong in `@/domain` and
must exclude credentials and raw private payloads. Integration begins with
runtime policy in prompt 002 and Prisma in prompt 003.
