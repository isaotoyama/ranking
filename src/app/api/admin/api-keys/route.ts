import { db } from "@/db";
import { apiKeys, auditLogs } from "@/db/schema";
import { requireOrgRole } from "@/lib/auth";
import { createRawApiKey, hashApiKey } from "@/lib/api-keys";

import { mutationErrorStatus, requireTrustedMutationRequest } from "@/lib/request-security";
export async function POST(request: Request) {
  try { requireTrustedMutationRequest(request); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "BAD_REQUEST" }, { status: mutationErrorStatus(error) }); }
  const body = await request.json();
  if (typeof body.organizationId !== "string" || typeof body.name !== "string" || body.name.length < 2 || body.name.length > 80) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { user } = await requireOrgRole(body.organizationId, "admin");
  const raw = createRawApiKey();
  const prefix = raw.slice(0, 14);
  const [created] = await db.insert(apiKeys).values({ organizationId: body.organizationId, name: body.name, keyPrefix: prefix, keyHash: hashApiKey(raw), lastFour: raw.slice(-4), createdByUserId: user.id }).returning({ id: apiKeys.id });
  await db.insert(auditLogs).values({ organizationId: body.organizationId, actorUserId: user.id, action: "api_key.created", entityType: "api_key", entityId: created.id, payload: { name: body.name, prefix } });
  return Response.json({ key: raw, warning: "This key is shown once. Store it securely." }, { status: 201 });
}
