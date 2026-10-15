import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const orgRole = pgEnum("org_role", ["owner", "admin", "scorer", "viewer"]);
export const plan = pgEnum("plan", ["free", "organizer", "league", "data", "enterprise"]);
export const competitionStatus = pgEnum("competition_status", ["draft", "open", "running", "completed", "archived"]);
export const competitionVisibility = pgEnum("competition_visibility", ["public", "unlisted", "private"]);
export const metricType = pgEnum("metric_type", ["time", "score", "points", "position"]);
export const aggregationType = pgEnum("aggregation_type", ["min", "max", "sum", "average", "best_n_sum", "final_only", "position_points"]);
export const directionType = pgEnum("direction_type", ["asc", "desc"]);
export const resultStatus = pgEnum("result_status", ["valid", "dns", "dnf", "dsq", "void"]);
export const rankingScope = pgEnum("ranking_scope", ["competition", "series", "season", "year", "all_time"]);
export const rankingRunStatus = pgEnum("ranking_run_status", ["building", "published", "superseded", "failed"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text("email"),
  displayName: text("display_name"),
  imageUrl: text("image_url"),
  clerkUpdatedAt: bigint("clerk_updated_at", { mode: "number" }).default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const players = pgTable("players", {
  id: uuid("id").defaultRandom().primaryKey(),
  claimedByUserId: uuid("claimed_by_user_id").references(() => users.id, { onDelete: "set null" }),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  countryCode: text("country_code"),
  imageUrl: text("image_url"),
  verified: boolean("verified").default(false).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerUserId: uuid("owner_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  plan: plan("plan").default("free").notNull(),
  stripeCustomerId: text("stripe_customer_id").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const organizationMembers = pgTable("organization_members", {
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: orgRole("role").default("viewer").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.organizationId, t.userId] })]);

export const series = pgTable("series", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("series_org_slug_uq").on(t.organizationId, t.slug)]);

export const seasons = pgTable("seasons", {
  id: uuid("id").defaultRandom().primaryKey(),
  seriesId: uuid("series_id").notNull().references(() => series.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  year: integer("year"),
  startsOn: date("starts_on"),
  endsOn: date("ends_on"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("season_series_year_uq").on(t.seriesId, t.year)]);

export type CompetitionSettings = {
  attemptAggregation?: "min" | "max" | "latest" | "sum" | "average";
  bestN?: number;
  positionPoints?: Record<string, number>;
  roundWeights?: Record<string, number>;
  tieBreakers?: Array<"best_round" | "second_best_round" | "wins" | "earliest_result">;
};

export const competitions = pgTable("competitions", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  seasonId: uuid("season_id").references(() => seasons.id, { onDelete: "set null" }),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  status: competitionStatus("status").default("draft").notNull(),
  visibility: competitionVisibility("visibility").default("public").notNull(),
  metric: metricType("metric").notNull(),
  aggregation: aggregationType("aggregation").notNull(),
  direction: directionType("direction").notNull(),
  unit: text("unit").notNull(),
  settings: jsonb("settings").$type<CompetitionSettings>().default({}).notNull(),
  publishedRankingRunId: uuid("published_ranking_run_id"),
  rankingGeneration: integer("ranking_generation").default(0).notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("competition_org_slug_uq").on(t.organizationId, t.slug),
  index("competition_org_idx").on(t.organizationId),
  index("competition_season_idx").on(t.seasonId),
]);

export const rounds = pgTable("rounds", {
  id: uuid("id").defaultRandom().primaryKey(),
  competitionId: uuid("competition_id").notNull().references(() => competitions.id, { onDelete: "cascade" }),
  roundNumber: integer("round_number").notNull(),
  label: text("label"),
  weight: doublePrecision("weight").default(1).notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("round_comp_number_uq").on(t.competitionId, t.roundNumber)]);

export const competitionParticipants = pgTable("competition_participants", {
  competitionId: uuid("competition_id").notNull().references(() => competitions.id, { onDelete: "cascade" }),
  playerId: uuid("player_id").notNull().references(() => players.id, { onDelete: "restrict" }),
  seed: integer("seed"),
  bib: text("bib"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.competitionId, t.playerId] })]);

export const results = pgTable("results", {
  id: uuid("id").defaultRandom().primaryKey(),
  competitionId: uuid("competition_id").notNull().references(() => competitions.id, { onDelete: "restrict" }),
  roundId: uuid("round_id").notNull().references(() => rounds.id, { onDelete: "restrict" }),
  playerId: uuid("player_id").notNull().references(() => players.id, { onDelete: "restrict" }),
  attemptNumber: integer("attempt_number").default(1).notNull(),
  rawValue: doublePrecision("raw_value"),
  status: resultStatus("status").default("valid").notNull(),
  submissionKey: text("submission_key"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  submittedByUserId: uuid("submitted_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("results_comp_player_idx").on(t.competitionId, t.playerId),
  index("results_round_idx").on(t.roundId),
  uniqueIndex("results_submission_key_uq").on(t.competitionId, t.submissionKey),
  uniqueIndex("results_round_player_attempt_uq").on(t.competitionId, t.roundId, t.playerId, t.attemptNumber),
]);

export const resultAdjustments = pgTable("result_adjustments", {
  id: uuid("id").defaultRandom().primaryKey(),
  resultId: uuid("result_id").notNull().references(() => results.id, { onDelete: "restrict" }),
  delta: doublePrecision("delta").default(0).notNull(),
  reason: text("reason").notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ScopeRankingConfig = {
  positionPoints: Record<string, number>;
  dropLowest?: number;
  minCompetitions?: number;
};

export const rankingDefinitions = pgTable("ranking_definitions", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  scope: rankingScope("scope").notNull(),
  scopeKey: text("scope_key").notNull(),
  name: text("name").notNull(),
  direction: directionType("direction").default("desc").notNull(),
  config: jsonb("config").$type<ScopeRankingConfig>().notNull(),
  publishedRankingRunId: uuid("published_ranking_run_id"),
  rankingGeneration: integer("ranking_generation").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("ranking_definition_scope_uq").on(t.organizationId, t.scope, t.scopeKey)]);

export const rankingRuns = pgTable("ranking_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  scope: rankingScope("scope").notNull(),
  scopeKey: text("scope_key").notNull(),
  competitionId: uuid("competition_id").references(() => competitions.id, { onDelete: "cascade" }),
  definitionId: uuid("definition_id").references(() => rankingDefinitions.id, { onDelete: "cascade" }),
  status: rankingRunStatus("status").default("building").notNull(),
  formulaVersion: integer("formula_version").default(1).notNull(),
  generation: integer("generation").default(0).notNull(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
}, (t) => [index("ranking_run_scope_idx").on(t.scope, t.scopeKey, t.status)]);

export type RankingBreakdown =
  | {
      kind: "competition";
      rounds: Array<{ roundId: string; roundNumber: number; value: number; adjustedValue: number; counted: boolean }>;
      aggregation: string;
      direction: string;
    }
  | {
      kind: "scope";
      competitions: Array<{ competitionId: string; rank: number; points: number; counted: boolean }>;
      dropLowest: number;
    };

export const rankingEntries = pgTable("ranking_entries", {
  rankingRunId: uuid("ranking_run_id").notNull().references(() => rankingRuns.id, { onDelete: "cascade" }),
  playerId: uuid("player_id").notNull().references(() => players.id, { onDelete: "restrict" }),
  rank: integer("rank").notNull(),
  value: doublePrecision("value").notNull(),
  breakdown: jsonb("breakdown").$type<RankingBreakdown>().notNull(),
  previousRank: integer("previous_rank"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.rankingRunId, t.playerId] }),
  index("ranking_entries_run_rank_idx").on(t.rankingRunId, t.rank),
]);

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  lastFour: text("last_four").notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("api_keys_org_idx").on(t.organizationId)]);

export const apiUsageMonthly = pgTable("api_usage_monthly", {
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  usageMonth: date("usage_month").notNull(),
  requestCount: bigint("request_count", { mode: "number" }).default(0).notNull(),
  billableUnits: bigint("billable_units", { mode: "number" }).default(0).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.organizationId, t.usageMonth] })]);

export const apiUsageDaily = pgTable("api_usage_daily", {
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  apiKeyId: uuid("api_key_id").notNull().references(() => apiKeys.id, { onDelete: "cascade" }),
  usageDate: date("usage_date").notNull(),
  requestCount: bigint("request_count", { mode: "number" }).default(0).notNull(),
  billableUnits: bigint("billable_units", { mode: "number" }).default(0).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.apiKeyId, t.usageDate] })]);

export const subscriptions = pgTable("subscriptions", {
  organizationId: uuid("organization_id").primaryKey().references(() => organizations.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id").notNull(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  stripePriceId: text("stripe_price_id"),
  status: text("status").notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  lastStripeEventCreated: bigint("last_stripe_event_created", { mode: "number" }).default(0).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const webhookEvents = pgTable("webhook_events", {
  provider: text("provider").notNull(),
  eventId: text("event_id").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.provider, t.eventId] })]);

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("audit_org_created_idx").on(t.organizationId, t.createdAt)]);
