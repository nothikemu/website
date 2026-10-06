export type PresignedRequest = { url: string; method: "PUT" | "GET"; headers: Record<string, string> };

export type GetUrlOptions = {
  filename: string;
  contentType: string;
  disposition: "inline" | "attachment";
  expiresIn?: number;
};

/**
 * Object storage driver. Implementations: S3-compatible (AWS S3, Cloudflare R2,
 * Supabase Storage S3 endpoint, MinIO) and a local filesystem driver for dev.
 * Keys are opaque, server-generated paths: org/<orgId>/project/<projectId>/<uuid>.
 */
export interface StorageDriver {
  readonly name: string;
  presignPut(key: string, opts: { contentType: string; contentLength: number; expiresIn?: number }): Promise<PresignedRequest>;
  createMultipart(key: string, contentType: string): Promise<string>;
  presignPart(key: string, uploadId: string, partNumber: number, expiresIn?: number): Promise<PresignedRequest>;
  completeMultipart(key: string, uploadId: string, parts: { partNumber: number; etag: string }[]): Promise<void>;
  abortMultipart(key: string, uploadId: string): Promise<void>;
  presignGet(key: string, opts: GetUrlOptions): Promise<string>;
  head(key: string): Promise<{ size: number; contentType?: string } | null>;
  getRange(key: string, start: number, endInclusive: number): Promise<Buffer>;
  getObject(key: string): Promise<Buffer>;
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
}
