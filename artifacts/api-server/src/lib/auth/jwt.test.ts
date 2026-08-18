import { describe, expect, it } from "vitest";
import { signSessionToken, verifySessionToken } from "./jwt";

describe("session tokens", () => {
  const payload = {
    sub: "user-1",
    studioId: "studio-1",
    role: "artist" as const,
  };

  it("round-trips a signed token", () => {
    const token = signSessionToken(payload);
    expect(verifySessionToken(token)).toMatchObject(payload);
  });

  it("rejects a tampered token", () => {
    const token = signSessionToken(payload);
    expect(verifySessionToken(`${token}tampered`)).toBeNull();
  });

  it("rejects garbage input", () => {
    expect(verifySessionToken("not-a-jwt")).toBeNull();
  });
});
