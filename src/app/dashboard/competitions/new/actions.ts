"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, competitions, rounds } from "@/db/schema";
import { requireOrgRole } from "@/lib/auth";

const schema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  metric: z.enum(["time", "score", "points", "position"]),
  aggregation: z.enum(["min", "max", "sum", "average", "best_n_sum", "final_only", "position_points"]),
  direction: z.enum(["asc", "desc"]),
  unit: z.string().trim().min(1).max(20),
  roundCount: z.coerce.number().int().min(1).max(100),
  bestN: z.coerce.number().int().min(1).max(100).optional(),
  attemptAggregation: z.enum(["min", "max", "latest", "sum", "average"]),
});

export async function createCompetition(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  if (!raw.bestN) delete raw.bestN;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i)=>i.message).join(", "));
  const input = parsed.data;
  if (input.aggregation === "best_n_sum" && (!input.bestN || input.bestN > input.roundCount)) throw new Error("Best N must be between 1 and the round count");
  if (input.aggregation === "position_points" && input.direction !== "desc") throw new Error("Position-to-points rankings must use Higher wins");
  const { user } = await requireOrgRole(input.organizationId, "admin");
  const slug = input.name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,55) + `-${Date.now().toString(36)}`;
  const [competition] = await db.insert(competitions).values({
    organizationId: input.organizationId,
    name: input.name,
    slug,
    metric: input.metric,
    aggregation: input.aggregation,
    direction: input.direction,
    unit: input.unit,
    settings: { attemptAggregation: input.attemptAggregation, bestN: input.bestN, positionPoints: input.aggregation === "position_points" ? { "1":25,"2":18,"3":15,"4":12,"5":10,"6":8,"7":6,"8":4,"9":2,"10":1 } : undefined },
    createdByUserId: user.id,
  }).returning();
  await db.insert(rounds).values(Array.from({length:input.roundCount},(_,i)=>({competitionId:competition.id,roundNumber:i+1,label:`Round ${i+1}`})));
  await db.insert(auditLogs).values({ organizationId: input.organizationId, actorUserId: user.id, action: "competition.created", entityType: "competition", entityId: competition.id, payload: { metric: input.metric, aggregation: input.aggregation, roundCount: input.roundCount } });
  redirect(`/dashboard/competitions/${competition.id}`);
}
