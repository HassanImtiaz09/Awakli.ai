import { describe, it, expect } from "vitest";

describe("Modal credentials validation", () => {
  it("MODAL_TOKEN_ID is set and has correct format", () => {
    const tokenId = process.env.MODAL_TOKEN_ID;
    expect(tokenId).toBeDefined();
    expect(tokenId).not.toBe("");
    // Modal token IDs start with "ak-"
    expect(tokenId!.startsWith("ak-")).toBe(true);
  });

  it("MODAL_TOKEN_SECRET is set and has correct format", () => {
    const tokenSecret = process.env.MODAL_TOKEN_SECRET;
    expect(tokenSecret).toBeDefined();
    expect(tokenSecret).not.toBe("");
    // Modal token secrets start with "as-"
    expect(tokenSecret!.startsWith("as-")).toBe(true);
  });

  it("Modal credentials can be used to construct auth header", () => {
    const tokenId = process.env.MODAL_TOKEN_ID;
    const tokenSecret = process.env.MODAL_TOKEN_SECRET;
    // Verify both can be combined into a Basic auth header (Modal's REST pattern)
    const combined = `${tokenId}:${tokenSecret}`;
    const encoded = Buffer.from(combined).toString("base64");
    expect(encoded).toBeTruthy();
    expect(encoded.length).toBeGreaterThan(20);
  });
});
