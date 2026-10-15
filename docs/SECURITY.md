# Security model

This starter assumes an internet-facing SaaS with multi-tenant organizer data and public/paid ranking APIs.

## Identity and authorization

- Clerk authenticates users.
- `proxy.ts` protects dashboard and admin/billing routes.
- Authentication at the proxy is **not** considered authorization. Every resource mutation repeats organization/role checks server-side.
- Organization roles are `owner > admin > scorer > viewer`.
- Result correction requires `admin` or `owner`.

## SQL defense in depth

`ops/security_hardening.sql` adds controls that are independent of Next.js:

- raw `results` are append-only;
- `result_adjustments` are append-only;
- audit/webhook event logs are append-only;
- a result insert is rejected unless the round belongs to the competition and the player is a registered participant;
- a result insert is rejected unless the submitting user is an authorized scorer/admin/owner;
- an adjustment is rejected unless its actor is admin/owner;
- structural checks reject invalid round numbers/weights and invalid ranks.

Production should use two Neon credentials:

- `DATABASE_URL`: restricted `ranking_app` runtime role; no DDL, no table ownership, no broad delete privileges.
- `DATABASE_MIGRATION_URL`: owner/migration credential used only for migrations/operations, not exposed to the running application.

The project does not currently turn on PostgreSQL RLS. With Neon HTTP, session-local tenant state must be established within each transaction/batch to make RLS reliable. The current design instead uses application resource authorization plus SQL triggers/least-privilege grants. If regulatory requirements demand database-enforced tenant SELECT isolation, move tenant-scoped flows to a transaction-capable connection path and add transaction-scoped `SET LOCAL`/RLS policies.

## Result integrity

Raw evidence is not edited. Corrections are additive adjustment rows with actor, reason and timestamp. Ranking calculations store a breakdown showing counted rounds and adjusted values.

Submission keys make result ingestion idempotent at the database level (`competition_id + submission_key`). A second unique key on `(competition_id, round_id, player_id, attempt_number)` prevents the same logical attempt from being double-counted under a different submission key.

## API keys and billing

- API keys contain 256 bits of randomness.
- Only the SHA-256 hash is stored; the raw key is displayed once.
- Revocation is timestamp-based.
- Scope entitlements are derived from the organization's Stripe-controlled plan.
- Monthly billing quota consumption is updated atomically to avoid concurrent requests racing past the limit.
- Daily usage is stored separately for reporting.

Monthly quotas are not the same as burst protection. Add an edge/WAF rate limiter before a public launch.

## Stripe

- Checkout Sessions are created only on the server.
- Client-supplied Stripe Price IDs must be in the server-side allowlist.
- Webhooks are verified with Stripe's signing secret over the raw request body.
- Subscription webhook updates carry Stripe event timestamps; older deliveries cannot overwrite newer subscription state.
- Browser success redirects are not trusted as proof of payment; plan state is driven by webhooks.

## Clerk webhooks

Clerk webhooks are verified before writes. The local user mirror tracks Clerk's source update timestamp so older user events cannot overwrite newer profile state. User deletion clears mirrored PII but preserves the internal user row so historical audit foreign keys remain valid.

## Browser mutation routes

Cookie-authenticated JSON mutations require a same-origin `Origin`/host match, a JSON content type and a bounded request body. Server Actions additionally receive Next.js' built-in action protections.

## Not yet production-complete

Before handling high-value commercial competitions, add:

- edge/burst rate limiting and bot controls;
- organization invitations and API-key scopes per endpoint/resource;
- dual approval for post-publication high-impact result corrections;
- audit log export/monitoring and anomaly alerts;
- CSP tuned to the exact Clerk/Stripe/custom domains;
- backup/PITR restore exercises;
- privacy export/deletion/retention workflows;
- CI tests on disposable Neon branches;
- centralized error/trace collection;
- abuse handling for public player identity/profile claims.
