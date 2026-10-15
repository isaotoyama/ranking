# Architecture

## Domain flow

```text
Organization
  └─ Series
      └─ Season
          └─ Competition
              ├─ Participants → Players
              └─ Rounds
                  └─ Results / Attempts (append-only)
                      └─ Adjustments (append-only)

Results → attempt aggregation → round value → competition aggregation → published ranking run
Competition placements → championship points → series/season/year/all-time ranking run
```

### Two-stage competition calculation

A competition can have multiple **attempts inside a round** and multiple **rounds inside a competition**. Those are separate aggregation stages.

Example:

```text
Round 1: attempt 1 = 43.2, attempt 2 = 42.9 → round value = 42.9 (min)
Round 2: attempt 1 = 44.1, attempt 2 = 42.3 → round value = 42.3 (min)
...
Competition final = 42.3 (min across rounds)
```

Supported attempt aggregation: `min`, `max`, `latest`, `sum`, `average`.

Supported competition aggregation: `min`, `max`, `sum`, `average`, `best_n_sum`, `final_only`, `position_points`.

### Cross-competition ranking

Raw metrics such as seconds and game points are never compared across unrelated competitions. A published competition **rank** is first converted to championship points using the ranking definition's position table, then those normalized points are aggregated for a series, season, calendar year, or all-time table.

## Published snapshot model

Rankings use immutable-ish generated runs:

1. Increment a generation counter.
2. Create a `ranking_run` in `building` state.
3. Insert all `ranking_entries`.
4. Change the owning competition/definition pointer only if its generation still matches.
5. Mark the run `published`; a slower concurrent build becomes `superseded`.

Readers use only the pointer. They do not query partially generated ranking rows.

## Data ownership

- Clerk owns credentials/session identity.
- `users` mirrors only the application fields needed to join authorization/audit data.
- A `player` may exist without a Clerk account, which supports historical competitors.
- Organizations own competition administration, API keys and billing.
- Player identity and competition participation are separate.

## Vercel runtime

The application uses Neon HTTP through Drizzle for low-overhead serverless queries. Interactive session transactions are intentionally not assumed. Multi-query workflows are therefore designed to be retryable/idempotent and published with pointer/generation patterns rather than relying on a long-lived DB connection.
