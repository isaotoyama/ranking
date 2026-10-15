# Deployment checklist

## 1. Neon

Create a Neon Postgres project and keep two credentials:

- runtime app connection → `DATABASE_URL`;
- owner/migration connection → `DATABASE_MIGRATION_URL`.

Generate/apply the Drizzle schema:

```bash
npm install
npm run db:generate
npm run db:migrate
```

Then apply database hardening as the owner:

```bash
psql "$DATABASE_MIGRATION_URL" -v ON_ERROR_STOP=1 -f ops/security_hardening.sql
```

Create the restricted `ranking_app` role using the privilege matrix in that file, then change `DATABASE_URL` to the restricted role connection string.

Optional demo data:

```bash
npm run db:seed
```

## 2. Clerk

Set:

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
CLERK_WEBHOOK_SIGNING_SECRET
```

Webhook URL:

```text
https://YOUR_DOMAIN/api/webhooks/clerk
```

Events:

```text
user.created
user.updated
user.deleted
```

## 3. Stripe

Create recurring Prices for Organizer, League and Data tiers, then set:

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_ORGANIZER
STRIPE_PRICE_LEAGUE
STRIPE_PRICE_DATA
```

Webhook URL:

```text
https://YOUR_DOMAIN/api/webhooks/stripe
```

Events:

```text
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
```

## 4. Application secrets

Set a random secret of at least 32 characters:

```text
CRON_SECRET
```

Set:

```text
NEXT_PUBLIC_APP_URL=https://YOUR_DOMAIN
```

Never put database, Clerk secret, Stripe secret or cron secret values in variables prefixed `NEXT_PUBLIC_`.

## 5. Vercel

This repository needs no custom build command beyond the Next.js default. `vercel.json` defines a daily maintenance rebuild. Add the environment variables to Production and Preview as appropriate, then deploy.

The Vercel account connection was not authorized in the ChatGPT session that generated this starter, so no remote project was created automatically.

## 6. Smoke tests

After deployment:

1. Load `/`.
2. Sign in with Clerk.
3. Create an organization at `/dashboard/setup`.
4. Create a six-round competition.
5. Add a player through `POST /api/admin/players` from the same-origin app/admin tooling.
6. Submit results through `POST /api/admin/results` using unique submission keys.
7. Verify the competition page shows a published ranking.
8. Generate an API key through `POST /api/admin/api-keys`.
9. Call `GET /api/v1/rankings/competition/:id` with `Authorization: Bearer rk_live_...`.
10. Verify Stripe test-mode subscription updates change the organization plan only after the signed webhook arrives.
