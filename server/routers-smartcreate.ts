import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── Style Mapping Constants ─────────────────────────────────────────────

export const STYLE_MAP: Record<string, { internal: string; display: string; description: string }> = {
  shonen: { internal: "shonen", display: "Bold & Dynamic", description: "High-energy action with bold lines and vivid colors" },
  seinen: { internal: "seinen", display: "Mature & Detailed", description: "Realistic detail with complex shading and darker tones" },
  shoujo: { internal: "shoujo", display: "Elegant & Expressive", description: "Beautiful, emotional art with soft colors and flowing lines" },
  chibi: { internal: "chibi", display: "Cute & Playful", description: "Adorable characters with playful, rounded designs" },
  cyberpunk: { internal: "cyberpunk", display: "Neon & Futuristic", description: "Futuristic tech aesthetic with neon lights and sharp edges" },
  watercolor: { internal: "watercolor", display: "Painted & Artistic", description: "Hand-painted feel with soft textures and artistic flair" },
  noir: { internal: "noir", display: "Dark & Moody", description: "Dramatic shadows and high contrast for intense stories" },
  realistic: { internal: "realistic", display: "Cinematic & Realistic", description: "Movie-quality detail with cinematic framing" },
};

export const TONE_MAP: Record<string, { display: string; colors: string[] }> = {
  epic: { display: "Epic & Intense", colors: ["#8B0000", "#1a1a1a", "#FF4500"] },
  fun: { display: "Fun & Light", colors: ["#FFD700", "#00BFFF", "#FF69B4"] },
  dark: { display: "Dark & Mysterious", colors: ["#2D1B69", "#4A4A4A", "#6B3FA0"] },
  romantic: { display: "Romantic & Emotional", colors: ["#FF69B4", "#FFD700", "#FFA07A"] },
  scary: { display: "Scary & Suspenseful", colors: ["#000000", "#006400", "#2F4F4F"] },
  comedic: { display: "Comedic & Wacky", colors: ["#FF1493", "#00FF00", "#FFD700"] },
};

// Genre to style mapping rules
const GENRE_STYLE_MAP: Record<string, string> = {
  action: "shonen", adventure: "shonen", "martial arts": "shonen",
  thriller: "seinen", psychological: "seinen", political: "seinen",
  romance: "shoujo", drama: "shoujo", "slice of life": "shoujo",
  comedy: "chibi", parody: "chibi", kids: "chibi",
  "sci-fi": "cyberpunk", cyberpunk: "cyberpunk", mecha: "cyberpunk",
  fantasy: "watercolor", mythical: "watercolor", spiritual: "watercolor",
  horror: "noir", mystery: "noir", crime: "noir",
  epic: "realistic", war: "realistic", historical: "realistic",
};

// ─── Smart Create Router ─────────────────────────────────────────────────

export const smartCreateRouter = router({
  // Analyze a prompt and return AI suggestions
  analyzePrompt: protectedProcedure
    .input(z.object({
      prompt: z.string().min(10).max(5000),
    }))
    .mutation(async ({ ctx, input }) => {
      const prompt = input.prompt.trim();

      // Use Claude to analyze the prompt
      const analysisResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are a manga story analyst. Analyze the given story prompt and extract structured information.
Return a JSON object with these fields:
- suggested_genre: the primary genre (Action, Romance, Sci-Fi, Fantasy, Horror, Comedy, Mystery, Slice of Life, Thriller, Adventure)
- suggested_tone: one of (epic, fun, dark, romantic, scary, comedic)
- detected_characters: array of {role: "protagonist"|"antagonist"|"supporting"|"deuteragonist", suggested_name: string, description: string} - detect characters mentioned or implied in the prompt. Use culturally appropriate names based on the story setting (Japanese setting -> Japanese names, Western fantasy -> Western names, Sci-fi -> mix of conventional and invented names). If no characters are explicitly mentioned, create 2 (protagonist + antagonist).
- suggested_chapter_count: integer 1-12, based on story complexity
- suggested_chapter_length: "short"|"standard"|"long"
- story_setting: brief description of where/when the story takes place
- confidence: float 0-1, how confident you are in your analysis

IMPORTANT: Detect characters from context clues. "a young hacker" = 1 character. "twin brothers" = 2 characters. Named characters like "Kai" should be preserved. If the prompt mentions a group, estimate the count.
If more than 6 characters are detected, include only the 6 most important and add a note.

Output ONLY valid JSON. No markdown, no explanation.`,
          },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "prompt_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                suggested_genre: { type: "string" },
                suggested_tone: { type: "string", enum: ["epic", "fun", "dark", "romantic", "scary", "comedic"] },
                detected_characters: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      role: { type: "string", enum: ["protagonist", "antagonist", "supporting", "deuteragonist"] },
                      suggested_name: { type: "string" },
                      description: { type: "string" },
                    },
                    required: ["role", "suggested_name", "description"],
                    additionalProperties: false,
                  },
                },
                suggested_chapter_count: { type: "integer" },
                suggested_chapter_length: { type: "string", enum: ["short", "standard", "long"] },
                story_setting: { type: "string" },
                confidence: { type: "number" },
              },
              required: ["suggested_genre", "suggested_tone", "detected_characters", "suggested_chapter_count", "suggested_chapter_length", "story_setting", "confidence"],
              additionalProperties: false,
            },
          },
        },
      });

      const rawContent = analysisResponse.choices[0]?.message?.content;
      if (!rawContent || typeof rawContent !== "string") {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to analyze prompt" });
      }

      const analysis = JSON.parse(rawContent);

      // Map genre to style
      const genreLower = analysis.suggested_genre.toLowerCase();
      const mappedStyle = GENRE_STYLE_MAP[genreLower] || inferStyleFromPrompt(prompt);
      const styleInfo = STYLE_MAP[mappedStyle] || STYLE_MAP.shonen;

      // Load user preferences for returning users
      let userPrefs: any = null;
      try {
        const db = await getDb();
        if (db) {
          const [user] = await db.select({ preferences: users.preferences }).from(users).where(eq(users.id, ctx.user.id));
          if (user?.preferences) {
            userPrefs = typeof user.preferences === "string" ? JSON.parse(user.preferences) : user.preferences;
          }
        }
      } catch { /* ignore */ }

      return {
        suggested_genre: analysis.suggested_genre,
        suggested_style: mappedStyle,
        suggested_style_display: styleInfo.display,
        suggested_tone: analysis.suggested_tone,
        detected_characters: analysis.detected_characters,
        suggested_chapter_count: Math.min(12, Math.max(1, analysis.suggested_chapter_count)),
        suggested_chapter_length: analysis.suggested_chapter_length as "short" | "standard" | "long",
        story_setting: analysis.story_setting,
        confidence: analysis.confidence,
        user_preferences: userPrefs,
        character_warning: analysis.detected_characters.length > 6
          ? "Many characters detected. Consider focusing on 4-6 main characters for best quality."
          : null,
      };
    }),

  // Save user preferences after creation
  savePreferences: protectedProcedure
    .input(z.object({
      preferred_style: z.string().optional(),
      preferred_tone: z.string().optional(),
      preferred_chapter_length: z.enum(["short", "standard", "long"]).optional(),
      preferred_audience: z.enum(["everyone", "teens", "adults"]).optional(),
      last_used_style: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Merge with existing preferences
      const [existing] = await db.select({ preferences: users.preferences }).from(users).where(eq(users.id, ctx.user.id));
      const currentPrefs = existing?.preferences
        ? (typeof existing.preferences === "string" ? JSON.parse(existing.preferences) : existing.preferences)
        : {};

      const updatedPrefs = {
        ...currentPrefs,
        ...Object.fromEntries(Object.entries(input).filter(([_, v]) => v !== undefined)),
      };

      await db.update(users).set({ preferences: updatedPrefs }).where(eq(users.id, ctx.user.id));

      return { success: true, preferences: updatedPrefs };
    }),

  // Get user preferences
  getPreferences: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [user] = await db.select({ preferences: users.preferences }).from(users).where(eq(users.id, ctx.user.id));
      if (!user?.preferences) return null;

      return typeof user.preferences === "string" ? JSON.parse(user.preferences) : user.preferences;
    }),

  // Get style and tone constants for the frontend
  getStyleOptions: publicProcedure
    .query(() => {
      return {
        styles: Object.entries(STYLE_MAP).map(([key, val]) => ({
          key,
          display: val.display,
          description: val.description,
        })),
        tones: Object.entries(TONE_MAP).map(([key, val]) => ({
          key,
          display: val.display,
          colors: val.colors,
        })),
      };
    }),
});

// ─── Helper: Infer style from prompt keywords ───────────────────────────

function inferStyleFromPrompt(prompt: string): string {
  const lower = prompt.toLowerCase();

  if (/dark|violent|death|war|blood|kill|murder/.test(lower)) return "noir";
  if (/love|heart|crush|date|romance|kiss/.test(lower)) return "shoujo";
  if (/funny|silly|joke|prank|comedy|laugh/.test(lower)) return "chibi";
  if (/tech|cyber|hack|robot|ai|android|neon/.test(lower)) return "cyberpunk";
  if (/magic|dragon|kingdom|quest|wizard|enchant/.test(lower)) return "watercolor";
  if (/fight|battle|power|hero|warrior|punch/.test(lower)) return "shonen";
  if (/mystery|detective|crime|investigation/.test(lower)) return "seinen";
  if (/epic|empire|throne|army|conquest/.test(lower)) return "realistic";

  return "shonen"; // default
}
