import { randomUUID } from "node:crypto";
import { errorResponse, clientIp } from "@/server/http/api";
import { handleDelivery } from "@/server/services/webhooks";
import { enforce, RATE_RULES } from "@/server/ratelimit";
import { requestContext } from "@/server/observability/context";

const MAX_BODY = 2 * 1024 * 1024;

/** Inbound webhook receiver (GitHub push, CI test results, deployments). Authenticated by HMAC signature. */
export async function POST(req: Request, { params }: { params: Promise<{ endpointId: string }> }) {
  const requestId = randomUUID();
  return requestContext.run({ requestId, ip: clientIp(req), userAgent: req.headers.get("user-agent") }, async () => {
    try {
      const { endpointId } = await params;
      if (!/^[0-9a-f-]{36}$/i.test(endpointId)) return new Response("Not found", { status: 404 });
      await enforce(`webhook:${endpointId}`, RATE_RULES.webhook);
      if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return new Response("Payload too large", { status: 413 });
      const raw = await req.text();
      if (raw.length > MAX_BODY) return new Response("Payload too large", { status: 413 });
      return Response.json(await handleDelivery(endpointId, req.headers, raw), { headers: { "x-request-id": requestId } });
    } catch (err) {
      return errorResponse(err, requestId);
    }
  });
}
