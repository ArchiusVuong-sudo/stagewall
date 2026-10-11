import { createHash, randomBytes } from "node:crypto";

/** A private manage link token. Only its SHA-256 hash is stored. */
export function newManageToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isTokenShape(token: string): boolean {
  return /^[A-Za-z0-9_-]{32}$/.test(token);
}
