import { describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import { requireAuth } from "./requireAuth";
import { signSessionToken } from "../lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "../lib/auth/cookies";

function mockRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("requireAuth", () => {
  it("attaches req.user for a valid session cookie", () => {
    const token = signSessionToken({ sub: "u1", studioId: "s1", role: "artist" });
    const req = { cookies: { [SESSION_COOKIE_NAME]: token } } as any;
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(req.user).toEqual({ id: "u1", studioId: "s1", role: "artist" });
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("responds 401 when there is no session cookie", () => {
    const req = { cookies: {} } as any;
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("responds 401 for a tampered session cookie", () => {
    const token = signSessionToken({ sub: "u1", studioId: "s1", role: "artist" });
    const req = {
      cookies: { [SESSION_COOKIE_NAME]: `${token}tampered` },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
