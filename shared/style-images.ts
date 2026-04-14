// CDN URLs for style comparison images (Phase 14)
// Generated AI images for the visual style picker

export const STYLE_IMAGES = {
  male: {
    shonen: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/style-male-shonen-C3VGAJVFmGFJRPVBSBLqkn.webp",
    seinen: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/style-male-seinen-EjR8Xq5YVmBqPi3Xhj3fwh.webp",
    shoujo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/style-male-shoujo-fTrHxwJFqEjBmfhPQfQdqh.webp",
    chibi: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/style-male-chibi-8vZJdXhXRoNHEZmDkKCZZU.webp",
    cyberpunk: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/style-male-cyberpunk-d3Nt9RzLi2JKqAJrQdqxaY.webp",
    watercolor: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/style-male-watercolor-BCroUoTJryXGjCN7P5K4P8.webp",
    noir: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/style-male-noir-HnFsTrLnRRkdpZJLMeo2b8.webp",
    realistic: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/style-male-realistic-ncD8zzYsanAkonMyNUh9B5.webp",
  },
  female: {
    shonen: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/style-female-shonen-KTLXj3UqPnVRbBQrQxXz8k.webp",
    seinen: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/style-female-seinen-gS7xPjnxXxK6UtvkiND3LY.webp",
    shoujo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/style-female-shoujo-FDtmy7S2PKjxUaCs99qYzz.webp",
    chibi: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/style-female-chibi-cqgzEmBAiuyRR9D6CpHATk.webp",
    cyberpunk: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/style-female-cyberpunk-n62aucBh8mqF26zb5ass7A.webp",
    watercolor: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/style-female-watercolor-BCroUoTJryXGjCN7P5K4P8.webp",
    noir: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/style-female-noir-HnFsTrLnRRkdpZJLMeo2b8.webp",
    realistic: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/style-female-realistic-ncD8zzYsanAkonMyNUh9B5.webp",
  },
} as const;

export const TONE_IMAGES = {
  epic: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/tone-epic-CQPDbcBjfzmJEGk4tzbgCH.webp",
  fun: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/tone-fun-RNGa99JUUhF9pDarKAaWaa.webp",
  dark: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/tone-dark-d94ZtVx4279bCmAyu7w53H.webp",
  romantic: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/tone-romantic-RvHxHkQigprDrWqGSsCnTF.webp",
  mystery: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/tone-mystery-GFXQZqNmNncyDjNaPk2Yex.webp",
  comedy: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/tone-comedy-hsPzJB3M4eGXnCyzSo7eR5.webp",
} as const;

export type StyleKey = keyof typeof STYLE_IMAGES.male;
export type ToneKey = keyof typeof TONE_IMAGES;

export const STYLE_INFO: Record<StyleKey, { name: string; description: string }> = {
  shonen: { name: "Bold & Dynamic", description: "Thick lines, vivid colors, speed lines — Dragon Ball, Naruto vibes" },
  seinen: { name: "Mature & Detailed", description: "Realistic proportions, complex shading — Berserk, Vagabond style" },
  shoujo: { name: "Elegant & Expressive", description: "Soft lines, sparkles, pastels — Sailor Moon, Fruits Basket feel" },
  chibi: { name: "Cute & Playful", description: "Oversized heads, big eyes, kawaii — perfect for comedy and slice-of-life" },
  cyberpunk: { name: "Neon & Futuristic", description: "Glow effects, sharp lines, neon palette — Akira, Ghost in the Shell" },
  watercolor: { name: "Painted & Artistic", description: "Soft washes, visible brushstrokes, dreamy — unique artistic feel" },
  noir: { name: "Dark & Moody", description: "High contrast B&W, heavy shadows, film noir — Sin City aesthetic" },
  realistic: { name: "Cinematic & Realistic", description: "Photorealistic rendering, cinematic lighting — movie-quality detail" },
};

export const TONE_INFO: Record<ToneKey, { name: string; description: string; emoji: string }> = {
  epic: { name: "Epic & Intense", description: "High stakes, dramatic battles, world-changing events", emoji: "⚔️" },
  fun: { name: "Fun & Light", description: "Cheerful adventures, comedic moments, feel-good stories", emoji: "🌟" },
  dark: { name: "Dark & Psychological", description: "Mind games, moral dilemmas, haunting atmosphere", emoji: "🌑" },
  romantic: { name: "Romantic & Emotional", description: "Love stories, deep connections, heartfelt moments", emoji: "💕" },
  mystery: { name: "Mystery & Suspense", description: "Clues, twists, detective work, keeping readers guessing", emoji: "🔍" },
  comedy: { name: "Comedy & Satire", description: "Laugh-out-loud humor, parody, witty dialogue", emoji: "😂" },
};
