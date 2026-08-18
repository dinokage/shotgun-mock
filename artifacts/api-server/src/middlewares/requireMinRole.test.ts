import { describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import { requireMinRole } from "./requireMinRole";

function mockRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("requireMinRole", () => {
  it("allows a role at or above the minimum", () => {
    const req = { user: { id: "u1", studioId: "s1", role: "supervisor" } } as any;
    const res = mockRes();
    const next = vi.fn();

    requireMinRole("lead")(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects a role below the minimum with 403", () => {
    const req = { user: { id: "u1", studioId: "s1", role: "artist" } } as any;
    const res = mockRes();
    const next = vi.fn();

    requireMinRole("lead")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request with 401", () => {
    const req = {} as any;
    const res = mockRes();
    const next = vi.fn();

    requireMinRole("lead")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
