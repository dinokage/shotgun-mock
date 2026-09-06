import * as argon2 from "argon2";
import jwt from "jsonwebtoken";

// No hardcoded fallback -- a fallback string baked into source is a public
// secret the moment this repo is (GitGuardian flagged exactly this pattern
// elsewhere in the codebase). Anyone who read this file could forge a valid
// session for any user, including admin, on any deployment that forgot to
// set a real one. Fail loudly at startup instead.
const rawJwtSecret = process.env.JWT_SECRET;
if (!rawJwtSecret) {
  throw new Error(
    "CRITICAL: Set JWT_SECRET in the environment. It is never hardcoded here.",
  );
}
const JWT_SECRET: string = rawJwtSecret;

export interface SessionPayload {
  userId: string | null; // null for a client-access session (no real users row behind it)
  tenantId: string;
  roleId: string;
  departmentId: string | null;
  clientAccessLinkId?: string; // present only for client-access sessions; Task 4's redeem route sets this, Task 6's client-review routes use it to scope queries
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch (err) {
    return false;
  }
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionPayload;
  } catch (err) {
    return null;
  }
}
