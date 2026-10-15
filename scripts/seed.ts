import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

import { db } from "../src/db";
import {
  competitionParticipants,
  competitions,
  organizationMembers,
  organizations,
  players,
  rankingDefinitions,
  results,
  rounds,
  seasons,
  series,
  users,
} from "../src/db/schema";
import { rebuildCompetitionRanking } from "../src/lib/rebuild-ranking";
import { rebuildScopedRanking } from "../src/lib/rebuild-scoped-ranking";

const [user] = await db.insert(users).values({ clerkUserId: "seed_user", email: "seed@example.invalid", displayName: "Seed Admin" }).onConflictDoUpdate({ target: users.clerkUserId, set: { displayName: "Seed Admin" } }).returning();
const [org] = await db.insert(organizations).values({ ownerUserId: user.id, slug: "demo-league", name: "Demo League" }).onConflictDoUpdate({ target: organizations.slug, set: { name: "Demo League" } }).returning();
await db.insert(organizationMembers).values({ organizationId: org.id, userId: user.id, role: "owner" }).onConflictDoNothing();

const [demoSeries] = await db.insert(series).values({ organizationId: org.id, slug: "demo-world-series", name: "Demo World Series" }).onConflictDoUpdate({ target: [series.organizationId, series.slug], set: { name: "Demo World Series" } }).returning();
const [season] = await db.insert(seasons).values({ seriesId: demoSeries.id, name: "2026 Season", year: 2026, startsOn: "2026-01-01", endsOn: "2026-12-31" }).onConflictDoUpdate({ target: [seasons.seriesId, seasons.year], set: { name: "2026 Season" } }).returning();

const people = await Promise.all(["Maya Chen", "Isao Toyama", "Alex Rivera", "Jordan Lee"].map(async (name) => {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const [p] = await db.insert(players).values({ slug, displayName: name }).onConflictDoUpdate({ target: players.slug, set: { displayName: name } }).returning();
  return p;
}));

const [competition] = await db.insert(competitions).values({
  organizationId: org.id,
  seasonId: season.id,
  slug: "tokyo-score-series",
  name: "Tokyo Score Series",
  metric: "score",
  aggregation: "max",
  direction: "desc",
  unit: "pts",
  status: "running",
  startsAt: new Date("2026-10-16T09:00:00+09:00"),
  settings: { attemptAggregation: "max" },
  createdByUserId: user.id,
}).onConflictDoUpdate({ target: [competitions.organizationId, competitions.slug], set: { status: "running", startsAt: new Date("2026-10-16T09:00:00+09:00"), seasonId: season.id } }).returning();

const roundRows = [];
for (let i = 1; i <= 6; i++) {
  const [r] = await db.insert(rounds).values({ competitionId: competition.id, roundNumber: i, label: `Round ${i}` }).onConflictDoUpdate({ target: [rounds.competitionId, rounds.roundNumber], set: { label: `Round ${i}` } }).returning();
  roundRows.push(r);
}
for (const p of people) await db.insert(competitionParticipants).values({ competitionId: competition.id, playerId: p.id }).onConflictDoNothing();

const scoreSets = [
  [82, 91, 87, 96, 88, 83],
  [80, 84, 89, 91, 86, 90],
  [78, 88, 82, 86, 88, 84],
  [75, 82, 84, 79, 81, 83],
];
for (let pi = 0; pi < people.length; pi++) {
  for (let ri = 0; ri < 6; ri++) {
    await db.insert(results).values({
      competitionId: competition.id,
      roundId: roundRows[ri].id,
      playerId: people[pi].id,
      rawValue: scoreSets[pi][ri],
      submissionKey: `seed-${people[pi].id}-${ri}`,
      submittedByUserId: user.id,
    }).onConflictDoNothing();
  }
}
const competitionRunId = await rebuildCompetitionRanking(competition.id);

const points = { "1": 25, "2": 18, "3": 15, "4": 12, "5": 10, "6": 8, "7": 6, "8": 4, "9": 2, "10": 1 };
const definitions = [
  { scope: "series" as const, scopeKey: demoSeries.id, name: "Demo World Series" },
  { scope: "season" as const, scopeKey: season.id, name: "2026 Season" },
  { scope: "year" as const, scopeKey: "2026", name: "2026 Ranking" },
  { scope: "all_time" as const, scopeKey: "all", name: "All-Time Ranking" },
];
const scopedRuns: Record<string, string> = {};
for (const d of definitions) {
  const [definition] = await db.insert(rankingDefinitions).values({ organizationId: org.id, ...d, config: { positionPoints: points } }).onConflictDoUpdate({ target: [rankingDefinitions.organizationId, rankingDefinitions.scope, rankingDefinitions.scopeKey], set: { name: d.name, config: { positionPoints: points }, updatedAt: new Date() } }).returning();
  scopedRuns[d.scope] = await rebuildScopedRanking(definition.id);
}

console.log({ organizationId: org.id, seriesId: demoSeries.id, seasonId: season.id, competitionId: competition.id, competitionRunId, scopedRuns });
