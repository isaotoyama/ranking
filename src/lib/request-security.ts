import "server-only";

export function requireTrustedMutationRequest(request: Request, maxBytes = 64 * 1024) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) throw new Error("UNSUPPORTED_MEDIA_TYPE");
  const length = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > maxBytes) throw new Error("PAYLOAD_TOO_LARGE");

  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  if (!origin || !host) throw new Error("INVALID_ORIGIN");
  let originUrl: URL;
  try { originUrl = new URL(origin); } catch { throw new Error("INVALID_ORIGIN"); }
  if (originUrl.host !== host || originUrl.protocol !== `${proto}:`) throw new Error("INVALID_ORIGIN");
}

export function mutationErrorStatus(error: unknown) {
  const code = error instanceof Error ? error.message : "BAD_REQUEST";
  if (code === "PAYLOAD_TOO_LARGE") return 413;
  if (code === "UNSUPPORTED_MEDIA_TYPE") return 415;
  if (code === "INVALID_ORIGIN") return 403;
  return 400;
}
