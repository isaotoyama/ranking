# Rankbase

Production-oriented competition ranking infrastructure built with **Next.js 16, Clerk, Neon PostgreSQL, Drizzle ORM and Stripe**.

Rankbase is designed for competitions where the underlying result may be a fastest time, highest/best score, total points, position, best-N rounds, final-round-only result, or a position-to-points system. Players retain the full history behind the aggregate: competition → round → attempt → raw result → adjustment → final ranking.

## Included in this starter

### Product workflow

- Clerk sign-in and protected organizer dashboard.
- Create an organization.
- Create a competition with 1–100 rounds.
- Configure metric, ranking direction, attempt aggregation and final competition aggregation.
- Register players from the competition dashboard.
- Record multiple attempts and special statuses (`DNS`, `DNF`, `DSQ`, `void`).
- Automatically rebuild and atomically publish the competition ranking after a result.
- Player profile and competition detail pages show every round/attempt and how the published result was calculated.
- Series, season, calendar-year and all-time ranking definitions normalize competition placements into championship points before combining unlike competition metrics.
- Create API keys from the dashboard; the raw secret is displayed once.
- Stripe Checkout for Organizer, League and Data subscriptions.
- API plan entitlements and monthly usage quotas.

### Competition formulas

Attempt aggregation inside a round:

- `min`
- `max`
- `latest`
- `sum`
- `average`

Final aggregation across rounds:

- `min` — fastest / lowest result
- `max` — best / highest result
- `sum` — total of valid rounds
- `average`
- `best_n_sum`
- `final_only`
- `position_points`

Arbitrary organizer JavaScript is intentionally **not** executed. Custom behavior is expressed through declarative scoring configuration.

## Architecture

```text
Clerk
  └─ application user
       └─ organization / role
            ├─ series → season → competition
            │                    ├─ players / participants
            │                    └─ rounds → attempts/results → adjustments
            │                                      ↓
            │                            published competition ranking
            │                                      ↓
            └─ ranking definitions → series / season / year / all-time snapshots

Stripe → verified webhook → organization plan → API entitlements / quotas

API key → SHA-256 hash lookup → scope authorization → atomic quota consumption → published snapshot
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/SECURITY.md](docs/SECURITY.md), and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Security decisions

- Raw results, result adjustments, webhook-event records and audit logs are append-only at the SQL layer.
- Results are rejected by Postgres unless the round belongs to the competition, the player is registered, and the submitting user is an authorized scorer/admin/owner.
- A unique database key prevents a player/round/attempt from being counted twice.
- Numeric corrections are separate adjustment records rather than rewrites of historical evidence.
- Ranking builds use generation counters and publish pointers, so readers see either the previous complete snapshot or the new complete snapshot—never a half-built table.
- API keys contain 256 bits of randomness; only their SHA-256 hash is stored.
- Cookie-authenticated JSON mutations enforce same-origin requests, JSON content type and a bounded body size.
- Stripe Price IDs are server allowlisted; subscription state is accepted only from signature-verified webhooks.
- Clerk webhook updates are verified and timestamp-ordered to reduce out-of-order overwrite risk.
- Production is intended to use a restricted Neon runtime role for `DATABASE_URL` and a separate owner role for migrations.
- No secret belongs in a `NEXT_PUBLIC_*` variable.

Review and apply `ops/security_hardening.sql` after the base Drizzle migration.

## Local setup

```bash
cp .env.example .env.local
npm install
npm run db:generate
npm run db:migrate
psql "$DATABASE_MIGRATION_URL" -v ON_ERROR_STOP=1 -f ops/security_hardening.sql
npm run test:ranking
npm run dev
```

Optional demo seed:

```bash
npm run db:seed
```

### Clerk

Configure:

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
CLERK_WEBHOOK_SIGNING_SECRET
```

Webhook:

```text
POST https://YOUR_DOMAIN/api/webhooks/clerk
```

Listen for `user.created`, `user.updated`, and `user.deleted`.

### Neon

Use the **pooled restricted runtime connection** for `DATABASE_URL`. Use `DATABASE_MIGRATION_URL` only for schema operations. The recommended privilege matrix is documented at the bottom of `ops/security_hardening.sql`.

### Stripe

Configure recurring prices and:

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_ORGANIZER
STRIPE_PRICE_LEAGUE
STRIPE_PRICE_DATA
```

Webhook:

```text
POST https://YOUR_DOMAIN/api/webhooks/stripe
```

Listen for:

```text
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
```

## Main routes

```text
/                                  marketing/home
/dashboard                         organizer overview
/dashboard/setup                   create organization
/dashboard/competitions/new        create competition
/dashboard/competitions/:id        players, results, live ranking
/dashboard/api-keys                developer keys
/dashboard/billing                 Stripe subscription plans
/players/:slug                     public player history
/players/:slug/competitions/:id    all rounds + attempts + final calculation
/developers                        API overview
```

Public/paid API examples:

```text
GET /api/v1/rankings/competition/:competitionId
GET /api/v1/rankings/series/:scopeKey
GET /api/v1/rankings/season/:scopeKey
GET /api/v1/rankings/year/:scopeKey
GET /api/v1/rankings/all-time/:scopeKey
GET /api/v1/players/:playerId/competitions/:competitionId
```

Use:

```text
Authorization: Bearer rk_live_...
```

## Ranking validation examples

Six scores: `82, 91, 87, 96, 88, 83`

- best/max → **96**
- total/sum → **527**
- best 3 total → **275**

Six race times: `44.502, 43.810, 42.992, 42.381, 42.710, 43.122`

- fastest/min → **42.381 sec**

The included pure ranking-engine test also validates tied ranks, multiple-attempt aggregation and cross-competition drop-lowest logic.

## Vercel

The repository is structured for Vercel and includes `vercel.json` with a bounded daily ranking-maintenance cron protected by `CRON_SECRET`.

The Vercel account was **not connected/authorized in the ChatGPT session that generated this project**, so no deployment was performed. Follow `docs/DEPLOYMENT.md` after adding your production credentials.

## Validation performed in this build session

- TypeScript/TSX syntax transpilation over the source tree: passed.
- Pure ranking-engine tests: passed.
- Full `npm install` / `next build`: **not completed in the isolated build environment because package installation timed out**. Run `npm install && npm run typecheck && npm run build` in your local/CI environment before production deployment.

## Before production launch

Add edge/burst rate limiting, organization invitations, explicit per-key resource scopes, high-impact result-correction approval, observability/error reporting, backup/PITR restore exercises, privacy export/deletion/retention workflows, CI tests on disposable Neon branches, and a CSP tuned to the exact Clerk/Stripe/custom domains.
