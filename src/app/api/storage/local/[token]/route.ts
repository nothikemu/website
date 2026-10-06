import { verifyPayload } from "@/server/crypto";
import { localStorageDriver } from "@/server/storage";
import type { LocalTokenPayload } from "@/server/storage/local";

/**
 * Serves the local filesystem storage driver through short-lived HMAC-signed
 * URLs, mirroring S3 presigned URLs. Only active when STORAGE_DRIVER=local.
 */
const MAX_PUT = 6 * 1024 * 1024 * 1024;

function check(token: string, op: LocalTokenPayload["op"] | LocalTokenPayload["op"][]) {
  const p = verifyPayload<LocalTokenPayload>(token);
  const ops = Array.isArray(op) ? op : [op];
  if (!p || !ops.includes(p.op) || p.exp < Date.now()) return null;
  return p;
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const driver = localStorageDriver();
  const p = check((await params).token, "get");
  if (!driver || !p) return new Response("Link expired or invalid", { status: 403 });
  try {
    const body = await driver.getObject(p.k);
    return new Response(new Uint8Array(body), {
      headers: {
        "content-type": p.ct ?? "application/octet-stream",
        "content-length": String(body.length),
        "content-disposition": `${p.disp ?? "attachment"}; filename*=UTF-8''${encodeURIComponent(p.fn ?? "download")}`,
        "cache-control": "private, max-age=300",
        "x-content-type-options": "nosniff",
        // Uploaded content can never run script in our origin.
        "content-security-policy": p.ct === "application/pdf" ? "default-src 'none'; style-src 'unsafe-inline'; img-src data:" : "default-src 'none'; img-src 'self' data:; media-src 'self'; sandbox",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const driver = localStorageDriver();
  const p = check((await params).token, ["put", "part"]);
  if (!driver || !p) return new Response("Link expired or invalid", { status: 403 });
  const body = Buffer.from(await req.arrayBuffer());
  if (body.length > MAX_PUT) return new Response("Too large", { status: 413 });
  if (p.op === "put") {
    if (p.len !== undefined && body.length !== p.len) return new Response("Content length mismatch", { status: 400 });
    await driver.putObject(p.k, body);
    return new Response(null, { status: 200, headers: { etag: `"${body.length}"` } });
  }
  await driver.writePart(p.k, p.uid!, p.pn!, body);
  return new Response(null, { status: 200, headers: { etag: `"part-${p.pn}"`, "access-control-expose-headers": "ETag" } });
}
