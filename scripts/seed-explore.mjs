/**
 * Seed Explore/Feed — Insert sample projects so the community features feel alive during beta.
 * Creates 2 demo users and 12 published projects with cover images across genres.
 * Run: node scripts/seed-explore.mjs
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const pool = mysql.createPool(process.env.DATABASE_URL);

// CDN cover image URLs (compressed webp from generate_image)
const COVERS = [
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/seed-cover-1-8yzXGPpxjKjLqZXJBwPjYf.webp",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/seed-cover-2-HJjKqFNHkPWMwzNVGvTXWP.webp",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/seed-cover-3-7UVNwVXdvHNLuNJwJPuCVo.webp",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/seed-cover-4-Ug3Nh4X7kcUvjXLuPvLdJn.webp",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/seed-cover-5-5Dj3nLBuPkJRcWNRBjGLFo.webp",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/seed-cover-6-Ls5L8HBjRiRtihmAnh6B3o.webp",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/seed-cover-7-KYd4EMhSyZYotxKWmifCp4.webp",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/seed-cover-8-7JZ6p83JDZdeWYdiiikyJV.webp",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/seed-cover-9-P5W2tPh7YcjL6atVsidRFb.webp",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/seed-cover-10-GWqgqByy3vdGLsvLZndP79.webp",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/seed-cover-11-TLBBgbiqzrLc59jqGA9t7n.webp",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/seed-cover-12-W7rFoJXs8DW23eUUoMMVg6.webp",
];

const SEED_PROJECTS = [
  {
    title: "Crimson Vanguard",
    description: "In a world where elemental warriors protect the last free city, a young fire-wielder discovers a power that could save — or destroy — everything.",
    genre: "Action,Fantasy",
    animeStyle: "shonen",
    slug: "crimson-vanguard",
    viewCount: 1847,
    voteScore: 342,
    totalVotes: 410,
  },
  {
    title: "Neon Requiem",
    description: "Neo-Tokyo 2099. A rogue hacker and a sentient AI must unravel a conspiracy that threatens to merge human consciousness with the machine network.",
    genre: "Sci-Fi,Action",
    animeStyle: "cyberpunk",
    slug: "neon-requiem",
    viewCount: 2341,
    voteScore: 489,
    totalVotes: 560,
  },
  {
    title: "Moonlit Academy",
    description: "At an elite academy for gifted students, hidden romances bloom under cherry blossoms while dark secrets lurk beneath the school's prestigious facade.",
    genre: "Romance,Drama",
    animeStyle: "shoujo",
    slug: "moonlit-academy",
    viewCount: 3120,
    voteScore: 567,
    totalVotes: 620,
  },
  {
    title: "Steel Horizon",
    description: "Giant mechs clash in the wastelands as rival factions fight for the last energy source on a dying Earth. One pilot holds the key to peace.",
    genre: "Mecha,Sci-Fi",
    animeStyle: "mecha",
    slug: "steel-horizon",
    viewCount: 1562,
    voteScore: 278,
    totalVotes: 340,
  },
  {
    title: "Phantom Detective",
    description: "A detective who can see ghosts teams up with a centuries-old spirit to solve impossible cold cases in modern-day Kyoto.",
    genre: "Mystery,Supernatural",
    animeStyle: "seinen",
    slug: "phantom-detective",
    viewCount: 2890,
    voteScore: 512,
    totalVotes: 580,
  },
  {
    title: "Sky-Color Diary",
    description: "Five friends navigate the bittersweet final year of high school, chasing dreams and discovering what truly matters before they part ways forever.",
    genre: "Slice of Life,Drama",
    animeStyle: "watercolor",
    slug: "sky-color-diary",
    viewCount: 4210,
    voteScore: 723,
    totalVotes: 800,
  },
  {
    title: "Shadow Ronin",
    description: "A disgraced samurai walks the path of vengeance through feudal Japan, haunted by the ghosts of those he failed to protect.",
    genre: "Action,Drama",
    animeStyle: "noir",
    slug: "shadow-ronin",
    viewCount: 1980,
    voteScore: 398,
    totalVotes: 450,
  },
  {
    title: "Starlight Sparks",
    description: "Four magical girls must balance school life with saving the universe from interdimensional threats — armed with friendship and sparkly transformations!",
    genre: "Comedy,Fantasy",
    animeStyle: "chibi",
    slug: "starlight-sparks",
    viewCount: 5670,
    voteScore: 891,
    totalVotes: 950,
  },
  {
    title: "Aether Ascension",
    description: "Humanity's last hope drifts among the stars. A lone astronaut discovers an ancient alien signal that could lead to a new home — or extinction.",
    genre: "Sci-Fi,Mystery",
    animeStyle: "realistic",
    slug: "aether-ascension",
    viewCount: 2450,
    voteScore: 445,
    totalVotes: 510,
  },
  {
    title: "Dragon Fist Legacy",
    description: "A young martial artist inherits the legendary Dragon Fist technique and must master it before the tournament that decides the fate of her clan.",
    genre: "Action,Fantasy",
    animeStyle: "shonen",
    slug: "dragon-fist-legacy",
    viewCount: 3890,
    voteScore: 634,
    totalVotes: 710,
  },
  {
    title: "Whispers of the Schoolyard",
    description: "When students start disappearing from Kurogane Academy, the school newspaper club uncovers a terrifying supernatural truth hidden for decades.",
    genre: "Horror,Mystery",
    animeStyle: "seinen",
    slug: "whispers-schoolyard",
    viewCount: 1340,
    voteScore: 267,
    totalVotes: 320,
  },
  {
    title: "Court Pressure",
    description: "An underdog basketball team from a small town takes on the national championship, fueled by raw talent, fierce rivalry, and unbreakable bonds.",
    genre: "Action,Drama",
    animeStyle: "shonen",
    slug: "court-pressure",
    viewCount: 2780,
    voteScore: 501,
    totalVotes: 570,
  },
];

async function main() {
  const conn = await pool.getConnection();
  try {
    // 1. Create two demo users (idempotent via INSERT IGNORE on unique openId)
    const demoUsers = [
      { openId: "seed_user_alpha_001", name: "TakeshiArt", email: "takeshi@demo.awakli.com" },
      { openId: "seed_user_beta_002", name: "MikuCreates", email: "miku@demo.awakli.com" },
    ];
    for (const u of demoUsers) {
      await conn.execute(
        `INSERT IGNORE INTO users (openId, name, email, role, createdAt, updatedAt, lastSignedIn)
         VALUES (?, ?, ?, 'user', NOW(), NOW(), NOW())`,
        [u.openId, u.name, u.email]
      );
    }
    // Get user IDs
    const [userRows] = await conn.execute(
      `SELECT id, openId FROM users WHERE openId IN (?, ?)`,
      [demoUsers[0].openId, demoUsers[1].openId]
    );
    const userMap = {};
    for (const r of userRows) userMap[r.openId] = r.id;
    const userIds = [userMap[demoUsers[0].openId], userMap[demoUsers[1].openId]];
    console.log(`Demo users: ${JSON.stringify(userMap)}`);

    // 2. Insert projects (skip if slug already exists)
    let inserted = 0;
    for (let i = 0; i < SEED_PROJECTS.length; i++) {
      const p = SEED_PROJECTS[i];
      const userId = userIds[i % 2]; // alternate between two users
      const coverUrl = COVERS[i];

      const [existing] = await conn.execute(
        `SELECT id FROM projects WHERE slug = ?`, [p.slug]
      );
      if (existing.length > 0) {
        console.log(`  [skip] ${p.slug} already exists (id=${existing[0].id})`);
        continue;
      }

      const [result] = await conn.execute(
        `INSERT INTO projects (userId, title, description, genre, coverImageUrl, status, visibility, animeStyle, slug, viewCount, voteScore, totalVotes, publication_status, publishedAt, projectState, wizardStage, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, 'active', 'public', ?, ?, ?, ?, ?, 'published', NOW(), 'published_manga', 6, DATE_SUB(NOW(), INTERVAL ? DAY), NOW())`,
        [
          userId,
          p.title,
          p.description,
          p.genre,
          coverUrl,
          p.animeStyle,
          p.slug,
          p.viewCount,
          p.voteScore,
          p.totalVotes,
          // Stagger creation dates so "newest" sort looks natural
          Math.floor(Math.random() * 30) + 1,
        ]
      );
      const projectId = result.insertId;

      // 3. Create a single episode for each project so the manga reader has something to show
      await conn.execute(
        `INSERT INTO episodes (projectId, episodeNumber, title, synopsis, status, panelCount, viewCount, createdAt, updatedAt)
         VALUES (?, 1, ?, ?, 'published', 0, ?, NOW(), NOW())`,
        [projectId, `Chapter 1: ${p.title}`, p.description, Math.floor(p.viewCount * 0.7)]
      );

      inserted++;
      console.log(`  [ok] ${p.slug} → project #${projectId}`);
    }

    console.log(`\nDone! Inserted ${inserted} new projects (${SEED_PROJECTS.length - inserted} skipped).`);
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
