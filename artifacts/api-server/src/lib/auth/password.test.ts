import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies a matching password", async () => {
    const hash = await hashPassword("forge123");
    await expect(verifyPassword("forge123", hash)).resolves.toBe(true);
  });

  it("rejects a non-matching password", async () => {
    const hash = await hashPassword("forge123");
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("produces a hash different from the plaintext input", async () => {
    const hash = await hashPassword("forge123");
    expect(hash).not.toBe("forge123");
  });
});
