import jwt from "jsonwebtoken";
import type { Role } from "@workspace/db";

export interface SessionPayload {
  sub: string;
  studioId: string;
  role: Role;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set. Did you forget to provision it?`);
  }
  return value;
}

// Declared via a function with an explicit `string` return type (rather than
// `const JWT_SECRET = process.env.JWT_SECRET; if (!JWT_SECRET) throw ...`) so
// the `string` narrowing survives being captured by the closures below — TS
// does not retain narrowing of an outer `const` inside a nested function.
const JWT_SECRET = requireEnv("JWT_SECRET");

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: SESSION_TTL_SECONDS });
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}
