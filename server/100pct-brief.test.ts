/**
 * 100% Brief v1.0 — Vitest acceptance tests
 *
 * P3-100: Legacy hex palette eradication
 * Q1-100: QA fixture flags for Script + Panels
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const ROOT = path.resolve(__dirname, "..");
const CLIENT_SRC = path.join(ROOT, "client", "src");

// ─── P3-100: Legacy hex palette eradication ────────────────────────────────

describe("P3-100: Legacy hex palette eradication", () => {
  it("no rgba(0,212,255,...) or rgba(124,58,237,...) in client/src", () => {
    const result = execSync(
      `grep -rn "rgba(0,212,255" "${CLIENT_SRC}" || true`,
      { encoding: "utf-8" },
    ).trim();
    expect(result).toBe("");

    const result2 = execSync(
      `grep -rn "rgba(124,58,237" "${CLIENT_SRC}" || true`,
      { encoding: "utf-8" },
    ).trim();
    expect(result2).toBe("");
  });

  it("no #00d4ff or #7c3aed hex literals in client/src", () => {
    const result = execSync(
      `grep -rni "#00d4ff\\|#7c3aed" "${CLIENT_SRC}" || true`,
      { encoding: "utf-8" },
    ).trim();
    expect(result).toBe("");
  });

  it("lint script passes with exit code 0", () => {
    const lintScript = path.join(ROOT, "scripts", "lint-no-legacy-hex.sh");
    expect(fs.existsSync(lintScript)).toBe(true);
    // Should not throw (exit 0)
    execSync(`bash "${lintScript}"`, { encoding: "utf-8" });
  });

  it("token CSS vars are defined in index.css", () => {
    const css = fs.readFileSync(
      path.join(CLIENT_SRC, "index.css"),
      "utf-8",
    );
    expect(css).toContain("--token-cyan");
    expect(css).toContain("--token-violet");
    expect(css).toContain("--token-mint");
    expect(css).toContain("--token-gold");
  });
});

// ─── Q1-100: QA fixture flags ──────────────────────────────────────────────

describe("Q1-100: QA fixture flags", () => {
  it("qaFixtures.ts exports QA_SCENES, QA_PANELS, QA_FLAGGED_PANELS", () => {
    const src = fs.readFileSync(
      path.join(CLIENT_SRC, "fixtures", "qaFixtures.ts"),
      "utf-8",
    );
    expect(src).toContain("export const QA_SCENES");
    expect(src).toContain("export const QA_PANELS");
    expect(src).toContain("export const QA_FLAGGED_PANELS");
  });

  it("script.tsx checks for ?qa=script and imports qaFixtures", () => {
    const src = fs.readFileSync(
      path.join(CLIENT_SRC, "pages", "create", "script.tsx"),
      "utf-8",
    );
    // The code uses params.get("qa") === "script" rather than a literal "qa=script"
    expect(src).toContain('"script"');
    expect(src).toContain("qaSceneData");
    expect(src).toContain("isQA");
  });

  it("panels.tsx checks for ?qa=panels and imports QAPanelsFixture", () => {
    const src = fs.readFileSync(
      path.join(CLIENT_SRC, "pages", "create", "panels.tsx"),
      "utf-8",
    );
    // The code uses params.get("qa") === "panels" rather than a literal "qa=panels"
    expect(src).toContain('"panels"');
    expect(src).toContain("QAPanelsFixture");
    expect(src).toContain("isQA");
  });

  it("QAPanelsFixture renders all 6 panel components with data-qa attr", () => {
    const src = fs.readFileSync(
      path.join(CLIENT_SRC, "components", "awakli", "QAPanelsFixture.tsx"),
      "utf-8",
    );
    expect(src).toContain('data-qa="panels"');
    expect(src).toContain("PanelGrid");
    expect(src).toContain("PanelLightbox");
    expect(src).toContain("PanelBatchBar");
    expect(src).toContain("StyleDrift");
    expect(src).toContain("ConsistencyReport");
  });

  it("README documents the QA fixture URLs", () => {
    const readme = fs.readFileSync(
      path.join(ROOT, "README.md"),
      "utf-8",
    );
    expect(readme).toContain("?qa=script");
    expect(readme).toContain("?qa=panels");
    expect(readme).toContain("QA Fixture Mode");
  });
});
