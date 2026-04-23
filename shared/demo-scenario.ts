/**
 * Demo Scenario: "Neon Dreams: The Awakening"
 * Used for the landing page demo video and asset generation pipeline.
 */

export const DEMO_SCENARIO = {
  title: "Neon Dreams: The Awakening",
  prompt:
    "A cyberpunk detective with a cybernetic eye solves crimes by entering people's dreams in a neon-lit future Tokyo",
  genre: ["sci-fi", "action"] as const,
  style: "cyberpunk" as const,
  tone: "dark_mysterious",
  chapters: 1,
  chapterLength: "standard" as const,
};

export const DEMO_CHARACTERS = {
  kai: {
    name: "Kai Tanaka",
    role: "protagonist" as const,
    description:
      "Male, short silver hair, cybernetic left eye (glowing blue), tall lean build, dark trench coat with neon circuit patterns",
    visualTraits: {
      hairColor: "silver",
      eyeColor: "blue (cybernetic left eye glowing)",
      bodyType: "tall lean",
      clothing: "dark trench coat with neon circuit patterns",
      distinguishingFeatures: "cybernetic left eye with blue glow",
    },
  },
  nexus: {
    name: "NEXUS",
    role: "supporting" as const,
    description:
      "AI entity, appears as a holographic figure, translucent blue, geometric face, shifting data patterns",
    visualTraits: {
      hairColor: "none (holographic)",
      eyeColor: "translucent blue",
      bodyType: "geometric holographic figure",
      clothing: "none (data patterns)",
      distinguishingFeatures: "translucent blue hologram with shifting data patterns",
    },
  },
};

export const DEMO_PANELS = [
  {
    index: 1,
    description:
      "Wide establishing shot - Neo-Tokyo skyline at night, neon signs, rain, flying vehicles in the distance",
    width: 1024,
    height: 576,
    camera: "wide" as const,
    fluxPrompt:
      "anime manga panel, wide establishing shot, Neo-Tokyo cyberpunk skyline at night, towering skyscrapers with holographic billboards, neon signs in Japanese, heavy rain, flying vehicles in the distance, dark moody atmosphere, cinematic composition, cyberpunk aesthetic, detailed background, no text, no speech bubbles",
  },
  {
    index: 2,
    description:
      "Close-up - Kai's face, cybernetic eye glowing blue, rain drops on his face, intense expression, neon reflections",
    width: 768,
    height: 1024,
    camera: "extreme-close-up" as const,
    fluxPrompt:
      "anime manga panel, extreme close-up, male detective face, short silver hair, cybernetic left eye glowing bright blue, rain drops on face, intense determined expression, neon light reflections on skin, dark trench coat collar visible, cyberpunk aesthetic, dramatic lighting, no text, no speech bubbles",
  },
  {
    index: 3,
    description:
      "Medium shot - Kai walking through a dark alley, neon signs overhead casting colored shadows, steam rising",
    width: 1024,
    height: 768,
    camera: "medium" as const,
    fluxPrompt:
      "anime manga panel, medium shot, male detective with silver hair walking through dark cyberpunk alley, dark trench coat with neon circuit patterns, neon signs overhead casting pink and blue shadows, steam rising from vents, wet ground reflections, atmospheric perspective, cyberpunk aesthetic, no text, no speech bubbles",
  },
  {
    index: 4,
    description:
      "Action - Kai leaping between rooftops, coat flowing behind him, city lights streaking, dynamic angle",
    width: 1024,
    height: 768,
    camera: "birds-eye" as const,
    fluxPrompt:
      "anime manga panel, dynamic birds-eye view, male detective leaping between rooftops, dark trench coat flowing dramatically behind, silver hair wind-swept, city lights streaking below, motion blur effects, cyberpunk cityscape, dramatic action pose, speed lines, no text, no speech bubbles",
  },
  {
    index: 5,
    description:
      "Medium-close - A mysterious hooded figure in shadow, one hand outstretched, data streams swirling around fingers",
    width: 768,
    height: 1024,
    camera: "close-up" as const,
    fluxPrompt:
      "anime manga panel, close-up, mysterious hooded figure in deep shadow, one hand outstretched toward viewer, glowing data streams and digital particles swirling around fingers, translucent blue holographic effect, dark background with faint neon glow, cyberpunk aesthetic, dramatic lighting, no text, no speech bubbles",
  },
  {
    index: 6,
    description:
      "Splash panel - Kai entering a dream world, reality shattering like glass around him, swirling colors and fractured imagery",
    width: 1024,
    height: 768,
    camera: "wide" as const,
    fluxPrompt:
      "anime manga splash panel, epic wide shot, male detective with silver hair and cybernetic eye entering a dream world, reality shattering like glass shards around him, swirling neon colors purple blue pink, fractured imagery of cityscape breaking apart, most visually dramatic composition, cyberpunk aesthetic, ethereal atmosphere, no text, no speech bubbles",
  },
];

export const DEMO_CHARACTER_VIEWS = [
  "portrait",
  "full_body",
  "three_quarter",
  "action_pose",
  "expression_sheet",
] as const;

/** Shot timing for the ~90-second demo video (V4) */
export const DEMO_SHOTS = {
  prompt: { start: 0, duration: 8000, label: "Step 1: Describe your story" },
  script: { start: 8000, duration: 7000, label: "AI writes the script in real-time" },
  panels: { start: 15000, duration: 13000, label: "AI generates manga panels from your story" },
  customize: { start: 28000, duration: 12000, label: "Customize every detail" },
  transform: { start: 40000, duration: 10000, label: "Manga to anime — same scene, brought to life" },
  liveDag: { start: 50000, duration: 10000, label: "Real-time generation dashboard" },
  loraMarket: { start: 60000, duration: 10000, label: "LoRA Marketplace — fork & fine-tune" },
  community: { start: 70000, duration: 10000, label: "Join the anime community" },
  cta: { start: 80000, duration: 10000, label: "" },
} as const;

export const DEMO_TOTAL_DURATION_MS = 90000;

/** Platform config keys for demo video */
export const DEMO_CONFIG_KEYS = {
  STREAM_ID: "demo_video_stream_id",
  POSTER_URL: "demo_video_poster_url",
  UPDATED_AT: "demo_video_updated_at",
  PANEL_URLS: "demo_panel_urls",
  CHARACTER_URLS: "demo_character_urls",
  ANIME_CLIP_URL: "demo_anime_clip_url",
  BGM_URL: "demo_bgm_url",
  FALLBACK_URLS: "demo_fallback_urls",
  STATUS: "demo_pipeline_status",
} as const;
