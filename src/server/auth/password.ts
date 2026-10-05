import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Password hashing with scrypt (memory-hard, built into Node — no native deps).
 * Format: scrypt$N$r$p$salt$hash  (salt/hash base64url). Parameters are stored
 * with the hash so they can be raised later without invalidating old hashes.
 */
const N = 1 << 15;
const r = 8;
const p = 1;
const KEYLEN = 64;

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize("NFKC"), salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN, { N, r, p, maxmem: 128 * N * r * 2 });
  return ["scrypt", N, r, p, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, rr, pp, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !n || !rr || !pp || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(password, Buffer.from(salt, "base64url"), expected.length, {
    N: Number(n),
    r: Number(rr),
    p: Number(pp),
    maxmem: 128 * Number(n) * Number(rr) * 2,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** A precomputed hash used to keep login timing constant for unknown emails. */
let dummy: string | undefined;
export async function burnPasswordCheck(password: string) {
  dummy ??= await hashPassword("forgebase-timing-equaliser");
  await verifyPassword(password, dummy);
}
