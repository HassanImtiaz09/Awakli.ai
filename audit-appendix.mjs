/**
 * Appendix Audit Script
 * Checks the codebase against Appendix A (tier matrix), B (analytics), C (tokens)
 */
import fs from "fs";
import path from "path";

const issues = [];
const ok = [];

function check(label, condition, detail) {
  if (condition) {
    ok.push(`✓ ${label}`);
  } else {
    issues.push(`✗ ${label}: ${detail}`);
  }
}

// ─── APPENDIX A: Tier Capability Matrix ─────────────────────────────────────
console.log("\n═══ APPENDIX A · Tier Capability Matrix ═══\n");

// The tier mapping: Apprentice=free_trial, Mangaka=creator, Studio=creator_pro, Studio Pro=studio
// Appendix A capabilities and their expected min tiers:
const appendixA = {
  // Capability: [Apprentice, Mangaka, Studio, Studio Pro]
  // We check the MINIMUM tier that unlocks it
  "idea_to_script": { desc: "Idea-to-script (S0)", minTier: "free_trial", caps: { free_trial: "40 panels", creator: "120", creator_pro: "200", studio: "unlimited" } },
  "upload_manga": { desc: "Upload manga/webtoon (S0-B)", minTier: "creator" },
  "character_refs": { desc: "Character reference uploads (S0-C)", minTier: "creator_pro" },
  "script_regen": { desc: "Script regeneration (S1)", minTier: "free_trial", caps: { free_trial: "3/project", creator: "15/project", creator_pro: "unlimited", studio: "unlimited" } },
  "panel_batch": { desc: "Panel batch ops (S2-B)", minTier: "creator" },
  "consistency_autocorrect": { desc: "Consistency auto-correct (S2-B)", minTier: "studio" },
  "watermark_off": { desc: "Watermark off (S3)", minTier: "creator" },
  "custom_domain_rss": { desc: "Custom domain & RSS (S3)", minTier: "creator_pro" },
  "anime_gate_passthrough": { desc: "Anime gate pass-through (S4-B)", minTier: "creator" },
  "pose_regen": { desc: "Pose regen (S5-A)", minTier: "creator" },
  "lora_training": { desc: "LoRA training (S5-B)", minTier: "creator_pro" },
  "voice_cloning": { desc: "Voice cloning (S5-B)", minTier: "creator_pro" },
  "user_voice_overlay": { desc: "User-voice overlay (S5-B)", minTier: "creator_pro" },
  "video_runtime": { desc: "Video runtime cap (S6)", minTier: "creator", caps: { creator: "60s", creator_pro: "12 min", studio: "24 min" } },
  "export_4k_prores": { desc: "4K / ProRes export (S6-B)", minTier: "creator_pro" },
  "separated_stems": { desc: "Separated stems (S6-B)", minTier: "creator_pro" },
};

// Read the tierMatrix.ts file
const tierMatrixSrc = fs.readFileSync("shared/tierMatrix.ts", "utf-8");

// Check capability keys exist
const capKeys = [
  "batch_generation", "voice_cloning", "custom_lora_training", "hd_export",
  "character_foundation", "style_refs"
];

// Check the CAPABILITY_MIN_TIER mappings
// Expected mappings based on Appendix A:
const expectedMinTiers = {
  // batch_generation → Mangaka (creator) for panel batch ops
  batch_generation: "creator",       // Appendix says Mangaka gets "up to 8"
  // voice_cloning → Studio (creator_pro)
  voice_cloning: "creator_pro",      // Appendix says Studio gets ✓
  // custom_lora_training → Studio (creator_pro)
  custom_lora_training: "creator_pro", // Appendix says Studio gets ✓
  // hd_export → Studio (creator_pro) for 4K/ProRes
  hd_export: "creator_pro",         // Appendix says Studio gets ✓
  // character_foundation → Studio (creator_pro) for character refs
  character_foundation: "creator_pro", // Appendix says Studio gets ✓
};

// Parse the actual min tiers from the source
for (const [cap, expectedTier] of Object.entries(expectedMinTiers)) {
  const regex = new RegExp(`${cap}:\\s*"(\\w+)"`);
  const match = tierMatrixSrc.match(regex);
  if (match) {
    check(
      `CAPABILITY_MIN_TIER.${cap}`,
      match[1] === expectedTier,
      `expected "${expectedTier}", found "${match[1]}"`
    );
  } else {
    check(`CAPABILITY_MIN_TIER.${cap}`, false, "not found in tierMatrix.ts");
  }
}

// Check specific values from the matrix
// batch_generation should be "creator_pro" in current code but Appendix says Mangaka (creator) gets "up to 8"
// voice_cloning should be "studio" in current code but Appendix says Studio (creator_pro) gets ✓
// custom_lora_training should be "creator_pro" in current code — matches Appendix (Studio = creator_pro)

// ─── APPENDIX C: Token Reference ───────────────────────────────────────────
console.log("\n═══ APPENDIX C · Token Reference ═══\n");

// Check if tokens.ts exists
const tokenPaths = ["shared/tokens.ts", "client/src/lib/tokens.ts", "shared/designTokens.ts"];
let tokenFile = null;
for (const p of tokenPaths) {
  if (fs.existsSync(p)) {
    tokenFile = p;
    break;
  }
}

// Also check index.css for CSS variables
const indexCss = fs.readFileSync("client/src/index.css", "utf-8");

const expectedColors = {
  cyan: "#00F0FF",
  violet: "#6B5BFF",
  lavender: "#B388FF",
  gold: "#FFD60A",
  magenta: "#FF2D7A",
  mint: "#00E5A0",
  ink: "#0B0B18",
  paper: "#F7F7FB",
};

const expectedRadii = {
  chip: "14px",
  card: "28px",
  sheet: "36px",
  sigil: "9999px",
};

const expectedType = {
  "display-hero": "72/80",
  "display-md": "56/64",
  h1: "40/48",
  h2: "28/36",
  body: "16/26",
  micro: "12/16",
};

const expectedShadows = {
  rest: "0 1px 2px rgba(11,11,24,0.08)",
  hover: "0 6px 24px rgba(107,91,255,0.20)",
  active: "0 10px 36px rgba(107,91,255,0.30)",
};

if (tokenFile) {
  const tokenSrc = fs.readFileSync(tokenFile, "utf-8");
  
  // Check colors
  for (const [name, hex] of Object.entries(expectedColors)) {
    const found = tokenSrc.includes(hex) || tokenSrc.includes(hex.toLowerCase());
    check(`Token colors.${name} = ${hex}`, found, `${hex} not found in ${tokenFile}`);
  }
  
  // Check radii
  for (const [name, val] of Object.entries(expectedRadii)) {
    const found = tokenSrc.includes(val) || tokenSrc.includes(name);
    check(`Token radii.${name} = ${val}`, found, `${val} not found in ${tokenFile}`);
  }
  
  // Check shadows
  for (const [name, val] of Object.entries(expectedShadows)) {
    const found = tokenSrc.includes("0.08") && tokenSrc.includes("0.20") && tokenSrc.includes("0.30");
    check(`Token shadow.${name}`, found, `shadow value not found in ${tokenFile}`);
  }
} else {
  check("tokens.ts file exists", false, "No tokens file found at any expected path");
  
  // Check CSS variables instead
  for (const [name, hex] of Object.entries(expectedColors)) {
    const found = indexCss.includes(hex) || indexCss.includes(hex.toLowerCase());
    check(`CSS var --${name} = ${hex}`, found, `${hex} not found in index.css`);
  }
}

// ─── APPENDIX B: Analytics Event Dictionary ─────────────────────────────────
console.log("\n═══ APPENDIX B · Analytics Event Dictionary ═══\n");

const expectedEvents = {
  wizard_stage_enter: { props: ["projectId", "stage", "tier"] },
  credits_forecast_exceeds: { props: ["projectId", "stage", "forecast", "balance"] },
  tier_gate_shown: { props: ["featureKey", "requiredTier", "currentTier"] },
  upgrade_modal_open: { props: ["trigger", "target"] },
  stage0_idea_submit: { props: ["projectId", "chars", "length"] },
  stage1_scene_regen: { props: ["projectId", "sceneIndex", "credits"] },
  stage2_panel_regen: { props: ["projectId", "panelIndex", "credits"] },
  stage3_publish_complete: { props: ["projectId", "slug", "tier"] },
  stage4_checkout_opened: { props: ["projectId", "tier"] },
  stage5_lora_ready: { props: ["projectId", "characterId", "minutes"] },
  stage6_render_complete: { props: ["projectId", "seconds", "credits", "exportFormat"] },
};

// Search all source files for these event names
const srcDirs = ["client/src", "server"];
function findInSrc(pattern) {
  const results = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.includes("node_modules") && !entry.name.includes("_core")) {
        walk(full);
      } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
        const content = fs.readFileSync(full, "utf-8");
        if (content.includes(pattern)) {
          results.push(full);
        }
      }
    }
  }
  srcDirs.forEach(walk);
  return results;
}

for (const [event, { props }] of Object.entries(expectedEvents)) {
  const files = findInSrc(event);
  check(
    `Analytics event "${event}" exists in source`,
    files.length > 0,
    `event "${event}" not found in any source file`
  );
}

// ─── Summary ────────────────────────────────────────────────────────────────
console.log("\n═══ AUDIT SUMMARY ═══\n");
console.log(`Passed: ${ok.length}`);
ok.forEach(o => console.log(`  ${o}`));
console.log(`\nIssues: ${issues.length}`);
issues.forEach(i => console.log(`  ${i}`));
console.log("");
