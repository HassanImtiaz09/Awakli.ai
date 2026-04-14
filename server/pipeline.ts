import { generateImage } from "./_core/imageGeneration";
import { notifyOwner } from "./_core/notification";
import {
  getJobById,
  getMangaUploadById,
  updateJob,
  updateMangaUploadStatus,
} from "./db";

const STYLE_PROMPTS: Record<string, string> = {
  shonen: "dynamic shonen anime style, bold lines, vibrant colors, action-oriented, Naruto/Dragon Ball aesthetic",
  seinen: "mature seinen anime style, detailed linework, realistic proportions, cinematic lighting, Berserk/Vinland Saga aesthetic",
  shoujo: "soft shoujo anime style, delicate lines, pastel colors, expressive eyes, Sailor Moon/Cardcaptor aesthetic",
  chibi: "chibi anime style, super-deformed proportions, cute round faces, oversized heads, comedic expressions",
  cyberpunk: "cyberpunk anime style, neon lighting, futuristic cityscapes, holographic elements, Ghost in the Shell/Akira aesthetic",
  watercolor: "watercolor anime style, soft washes, painterly textures, dreamy atmosphere, Studio Ghibli aesthetic",
  noir: "noir anime style, high contrast, deep shadows, dramatic chiaroscuro, Cowboy Bebop/Psycho-Pass aesthetic",
  realistic: "realistic anime style, photorealistic proportions, detailed textures, cinematic composition, Makoto Shinkai aesthetic",
  mecha: "mecha anime style, mechanical details, metallic sheen, dramatic lighting, Gundam/Evangelion aesthetic",
  default: "high-quality anime style, clean linework, vibrant colors, professional studio animation quality",
};

export async function runMangaToAnimeJob(jobId: number, userId: number): Promise<void> {
  const job = await getJobById(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  // Mark as processing
  await updateJob(jobId, {
    status: "processing",
    processingStartedAt: new Date(),
    progress: 10,
  });

  try {
    const inputUrl = job.inputImageUrl;
    if (!inputUrl) throw new Error("No input image URL for job");

    const stylePrompt = STYLE_PROMPTS[job.animeStyle] ?? STYLE_PROMPTS.default;

    // Update progress
    await updateJob(jobId, { progress: 30 });

    // Generate anime-style frame using the image generation helper
    const prompt = `Convert this manga panel into a stunning ${stylePrompt}. Maintain the original composition, characters, and scene layout. High quality, detailed, professional anime production quality.`;

    const { url: generatedUrl } = await generateImage({
      prompt,
      originalImages: [{ url: inputUrl, mimeType: "image/jpeg" }],
    });

    await updateJob(jobId, { progress: 80 });

    // Store result
    const resultUrls = [generatedUrl];
    await updateJob(jobId, {
      status: "completed",
      progress: 100,
      resultUrls,
      processingCompletedAt: new Date(),
    });

    // Update upload status
    await updateMangaUploadStatus(job.uploadId, "completed");

    // Notify owner
    await notifyOwner({
      title: "Manga-to-Anime Job Completed",
      content: `Job #${jobId} for user #${userId} completed successfully. Generated ${resultUrls.length} anime frame(s).`,
    });

    console.log(`[Pipeline] Job ${jobId} completed. Generated ${resultUrls.length} frame(s).`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Pipeline] Job ${jobId} failed:`, errorMessage);

    await updateJob(jobId, {
      status: "failed",
      errorMessage,
      processingCompletedAt: new Date(),
    });

    await updateMangaUploadStatus(job.uploadId, "failed");

    // Notify owner of failure
    await notifyOwner({
      title: "Manga-to-Anime Job Failed",
      content: `Job #${jobId} for user #${userId} failed: ${errorMessage}`,
    });

    throw error;
  }
}
