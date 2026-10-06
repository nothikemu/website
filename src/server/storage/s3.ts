import "server-only";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { GetUrlOptions, StorageDriver } from "./types";

export class S3Storage implements StorageDriver {
  readonly name = "s3";
  private client: S3Client;
  constructor(
    private bucket: string,
    cfg: { endpoint?: string; region: string; accessKeyId: string; secretAccessKey: string; forcePathStyle: boolean },
  ) {
    this.client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint || undefined,
      forcePathStyle: cfg.forcePathStyle,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  }

  async presignPut(key: string, opts: { contentType: string; contentLength: number; expiresIn?: number }) {
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: opts.contentType,
      ContentLength: opts.contentLength,
    });
    const url = await getSignedUrl(this.client, cmd, { expiresIn: opts.expiresIn ?? 900 });
    return { url, method: "PUT" as const, headers: { "Content-Type": opts.contentType } };
  }

  async createMultipart(key: string, contentType: string) {
    const r = await this.client.send(new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }));
    if (!r.UploadId) throw new Error("Storage did not return an upload id");
    return r.UploadId;
  }

  async presignPart(key: string, uploadId: string, partNumber: number, expiresIn = 3600) {
    const cmd = new UploadPartCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, PartNumber: partNumber });
    return { url: await getSignedUrl(this.client, cmd, { expiresIn }), method: "PUT" as const, headers: {} };
  }

  async completeMultipart(key: string, uploadId: string, parts: { partNumber: number; etag: string }[]) {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })) },
      }),
    );
  }

  async abortMultipart(key: string, uploadId: string) {
    await this.client.send(new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId }));
  }

  async presignGet(key: string, opts: GetUrlOptions) {
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentType: opts.contentType,
      ResponseContentDisposition: `${opts.disposition}; filename*=UTF-8''${encodeURIComponent(opts.filename)}`,
    });
    return getSignedUrl(this.client, cmd, { expiresIn: opts.expiresIn ?? 300 });
  }

  async head(key: string) {
    try {
      const r = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: Number(r.ContentLength ?? 0), contentType: r.ContentType };
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw err;
    }
  }

  async getRange(key: string, start: number, endInclusive: number) {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=${start}-${endInclusive}` }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }

  async getObject(key: string) {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }

  async putObject(key: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
