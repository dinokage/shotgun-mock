import * as argon2 from "argon2";
import jwt from "jsonwebtoken";

const JWT_SECRET =
  process.env.JWT_SECRET || "fallback_super_secret_jwt_key_for_dev";

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
