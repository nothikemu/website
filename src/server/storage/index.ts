import "server-only";
import path from "node:path";
import { env } from "@/server/env";
import { LocalStorage } from "./local";
import { S3Storage } from "./s3";
import type { StorageDriver } from "./types";

let driver: StorageDriver | undefined;

export function storage(): StorageDriver {
  if (driver) return driver;
  const e = env();
  driver =
    e.STORAGE_DRIVER === "s3"
      ? new S3Storage(e.S3_BUCKET!, {
          endpoint: e.S3_ENDPOINT,
          region: e.S3_REGION,
          accessKeyId: e.S3_ACCESS_KEY_ID!,
          secretAccessKey: e.S3_SECRET_ACCESS_KEY!,
          forcePathStyle: e.S3_FORCE_PATH_STYLE,
        })
      : new LocalStorage(path.resolve(process.cwd(), e.STORAGE_LOCAL_DIR), "");
  return driver;
}

export function localStorageDriver(): LocalStorage | null {
  const d = storage();
  return d instanceof LocalStorage ? d : null;
}

export type { StorageDriver } from "./types";
