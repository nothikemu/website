import "server-only";
import { mkdir, open, readFile, readdir, rm, stat, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { signPayload } from "@/server/crypto";
import type { GetUrlOptions, StorageDriver } from "./types";

/**
 * Filesystem storage for local development and tests. Mirrors the S3 flow:
 * clients receive short-lived HMAC-signed URLs served by /api/storage/local.
 * Not intended for production (no shared disk on serverless platforms).
 */
export type LocalTokenPayload = {
  op: "put" | "get" | "part";
  k: string;
  exp: number;
  ct?: string;
  len?: number;
  uid?: string;
  pn?: number;
  fn?: string;
  disp?: "inline" | "attachment";
};

export class LocalStorage implements StorageDriver {
  readonly name = "local";
  constructor(
    private root: string,
    private baseUrl: string,
  ) {}

  private resolve(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Invalid storage key");
    return full;
  }

  private url(payload: LocalTokenPayload) {
    return `${this.baseUrl}/api/storage/local/${signPayload(payload)}`;
  }

  async presignPut(key: string, opts: { contentType: string; contentLength: number; expiresIn?: number }) {
    const exp = Date.now() + (opts.expiresIn ?? 900) * 1000;
    return {
      url: this.url({ op: "put", k: key, exp, ct: opts.contentType, len: opts.contentLength }),
      method: "PUT" as const,
      headers: { "Content-Type": opts.contentType },
    };
  }

  async createMultipart(key: string) {
    const id = randomUUID();
    await mkdir(this.resolve(`${key}.parts/${id}`), { recursive: true });
    return id;
  }

  async presignPart(key: string, uploadId: string, partNumber: number, expiresIn = 3600) {
    return {
      url: this.url({ op: "part", k: key, uid: uploadId, pn: partNumber, exp: Date.now() + expiresIn * 1000 }),
      method: "PUT" as const,
      headers: {},
    };
  }

  async completeMultipart(key: string, uploadId: string, parts: { partNumber: number; etag: string }[]) {
    const dir = this.resolve(`${key}.parts/${uploadId}`);
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, Buffer.alloc(0));
    for (const p of [...parts].sort((a, b) => a.partNumber - b.partNumber)) {
      await appendFile(target, await readFile(path.join(dir, String(p.partNumber))));
    }
    await rm(this.resolve(`${key}.parts`), { recursive: true, force: true });
  }

  async abortMultipart(key: string) {
    await rm(this.resolve(`${key}.parts`), { recursive: true, force: true });
  }

  async writePart(key: string, uploadId: string, partNumber: number, body: Buffer) {
    const dir = this.resolve(`${key}.parts/${uploadId}`);
    const exists = await readdir(dir).then(() => true, () => false);
    if (!exists) throw new Error("Unknown multipart upload");
    await writeFile(path.join(dir, String(partNumber)), body);
  }

  async presignGet(key: string, opts: GetUrlOptions) {
    return this.url({
      op: "get",
      k: key,
      exp: Date.now() + (opts.expiresIn ?? 300) * 1000,
      ct: opts.contentType,
      fn: opts.filename,
      disp: opts.disposition,
    });
  }

  async head(key: string) {
    try {
      const s = await stat(this.resolve(key));
      return { size: s.size };
    } catch {
      return null;
    }
  }

  async getRange(key: string, start: number, endInclusive: number) {
    const fh = await open(this.resolve(key), "r");
    try {
      const len = Math.max(0, endInclusive - start + 1);
      const buf = Buffer.alloc(len);
      const { bytesRead } = await fh.read(buf, 0, len, start);
      return buf.subarray(0, bytesRead);
    } finally {
      await fh.close();
    }
  }

  async getObject(key: string) {
    return readFile(this.resolve(key));
  }

  async putObject(key: string, body: Buffer) {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }

  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}
