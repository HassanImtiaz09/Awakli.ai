# Awakli - Project TODO

## Design System
- [x] Global CSS variables (deep-space color palette, typography scale, spacing)
- [x] Tailwind custom tokens (colors, fonts, shadows, gradients)
- [x] Google Fonts: Inter + Orbitron/Space Grotesk loaded in index.html
- [x] Dark theme applied globally, no white flash

## Component Library
- [x] Button variants (primary gradient, secondary outline, ghost, sizes)
- [x] Card component with hover glow and lift effect
- [x] Badge/Tag with genre color pairs
- [x] Modal/Dialog (Framer Motion animated enter/exit)
- [x] Toast notifications (Sonner, dark themed)
- [x] Skeleton loader with shimmer animation
- [x] Progress bar component
- [x] Input/Textarea with focus ring

## Layout Shells
- [x] Top navbar (fixed, blur, logo, nav links, auth state, user avatar)
- [x] Mobile hamburger drawer
- [x] Studio sidebar (collapsible, icon-only mode)
- [x] Marketing footer (4-column grid)
- [x] Framer Motion page transition wrapper

## Pages
- [x] Landing page: asymmetric hero section
- [x] Landing page: feature highlights section
- [x] Landing page: pricing tiers section
- [x] Landing page: CTA section
- [x] Sign-in page with animated star background
- [x] Sign-up page with animated star background
- [x] Manga upload page with S3 file upload
- [x] Studio dashboard: project list, processing status, anime frame preview
- [x] Discover page: featured banner, trending grid, recently added
- [x] Project Detail page: uploads, active jobs, generated frames gallery

## Database (Drizzle ORM)
- [x] projects table (id, userId, title, status, settings, timestamps)
- [x] manga_uploads table (id, projectId, fileUrl, fileKey, pageCount, status)
- [x] processing_jobs table (id, uploadId, projectId, status, resultUrls, error, timestamps)
- [x] Migration SQL generated (drizzle/0001_thick_steel_serpent.sql)
- [x] Tables applied to database

## tRPC API
- [x] projects.list procedure (protected)
- [x] projects.create procedure (protected)
- [x] projects.get procedure (protected)
- [x] projects.update procedure (protected)
- [x] projects.delete procedure (protected)
- [x] uploads.getUploadUrl procedure (protected)
- [x] uploads.confirmUpload procedure (protected, S3 upload)
- [x] uploads.listByProject procedure (protected)
- [x] jobs.getStatus procedure (protected)
- [x] jobs.list procedure (protected)
- [x] jobs.listByProject procedure (protected)
- [x] jobs.trigger procedure (protected, starts AI pipeline)

## AI Pipeline
- [x] Server-side image generation pipeline (manga panel → anime frame)
- [x] Style prompts for shonen/seinen/shoujo/mecha/default
- [x] Store generated CDN URLs in processing_jobs resultUrls
- [x] Owner notification on job completion/failure (notifyOwner)

## Animations (Framer Motion)
- [x] Page transition wrapper (AnimatePresence fade + slide-up)
- [x] Scroll-reveal on landing page sections (useInView)
- [x] Stagger children on feature cards
- [x] Hover micro-interactions on buttons and cards
- [x] Animated star/particle background on auth pages
- [x] Floating badge animations on hero demo visual

## Tests
- [x] Vitest: auth.logout (2 tests)
- [x] Vitest: auth.me authenticated and unauthenticated
- [x] Vitest: projects CRUD authorization
- [x] Vitest: jobs authorization and NOT_FOUND
- [x] Vitest: uploads authorization and NOT_FOUND
- [x] All 11 tests passing (Phase 1)
- [x] All 31 tests passing (Phase 1 + Phase 2)

## Phase 2: Script Architect & Character Creator

### 2A. Project Creation Wizard (/dashboard/new)
- [x] Full-screen wizard with 4-step indicator (dots + line, pink/cyan/muted)
- [x] Step 1 - Name Your Story: title input, genre multi-select pills, tone dropdown, audience cards
- [x] Step 2 - Describe Your World: textarea with char count, AI enhance button (LLM), before/after toggle
- [x] Step 3 - Choose Your Style: 8 art style preset cards (3:4 aspect), selected glow + scale
- [x] Step 4 - Review & Create: summary card, create button with loading, confetti on success, auto-redirect
- [x] Framer Motion slide transitions between steps

### 2B. Script Generation Engine
- [x] tRPC procedure: episodes.generateScript (accepts episode numbers + style notes)
- [x] LLM integration for structured JSON script output (episode_title, synopsis, scenes, panels)
- [x] Store script in episodes.scriptContent, create panel records
- [x] Return jobId for status polling

### 2C. Script Editor UI (/studio/[projectId]/script)
- [x] Left panel: episode list as vertical cards with status badges
- [x] Generate New Episode button (dashed border card)
- [x] Main editor: episode title (editable), status badge, action buttons
- [x] Scene accordion sections (Radix Accordion) with panel cards
- [x] Panel card: image placeholder, editable visual description, dialogue rows, camera angle selector
- [x] Inline AI rewrite button with shimmer loading and diff highlight
- [x] Bottom toolbar: word/panel count, Regenerate Episode, Approve Script with confirmation modal

### 2D. Character Creator (/studio/[projectId]/characters)
- [x] Character card grid with role badges and visual trait pills
- [x] Add Character card (dashed border, + icon)
- [x] Add Character modal: two-column layout (form + live preview)
- [x] Name, role selector, personality tags, visual traits (hair/eyes color pickers, body type, clothing)
- [x] Generate Reference Sheet button using AI image generation
- [x] Loading skeleton for reference sheet generation
- [x] Result grid with approve/reject/regenerate per image
- [x] Upload approved images to S3 storage

### 2E. Database Schema Extensions
- [x] episodes table (id, projectId, episodeNumber, title, synopsis, scriptContent, status, timestamps)
- [x] panels table (id, episodeId, sceneNumber, panelNumber, visualDescription, cameraAngle, dialogue, sfx, transition, imageUrl, status)
- [x] characters table (id, projectId, name, role, personalityTraits, visualTraits, referenceImages, timestamps)
- [x] Migration SQL generated and applied

### 2F. Tests
- [x] Vitest: episodes procedures (generate, approve, update)
- [x] Vitest: characters procedures (create, update, delete, generate reference)

## Phase 3: Manga Panel Generation Engine

### 3A. Panel Generation Pipeline
- [x] tRPC procedure: episodes.generatePanels (reads script, builds FLUX prompts, generates images)
- [x] Prompt builder: art_style + camera_angle + visual_description + character traits + location + mood
- [x] Negative prompt handling for quality control
- [x] Concurrency control (4 panels simultaneously)
- [x] Retry with exponential backoff (3 attempts)
- [x] Upload generated images to S3, update panel records with imageUrl
- [x] Notify owner on completion/failure

### 3B. Dialogue & SFX Overlay Engine
- [x] tRPC procedure: panels.applyOverlay (composites dialogue/SFX onto panel image)
- [x] Speech bubble placement logic (server-side using canvas or image generation)
- [x] SFX text overlay (bold, angled, colored)
- [x] Store both raw and composite image URLs

### 3C. Panel Review Interface (/studio/[projectId]/panels)
- [x] Episode tab bar (horizontal scrollable, active tab with accent-pink underline)
- [x] Generation progress section (full-width gradient progress bar, panel count, estimated time)
- [x] Live panel fade-in as they complete (Framer Motion)
- [x] Masonry-style grid (3 cols desktop, 2 tablet, 1 mobile)
- [x] Panel card: generated image, hover overlay with action buttons (approve/reject/regenerate/edit)
- [x] Panel status styling: approved (green border), rejected (red border, grayed), generating (skeleton)
- [x] Batch action toolbar (sticky bottom: Approve All Visible, Regenerate Failed)

### 3D. Panel Detail Modal
- [x] Full-screen Radix Dialog overlay
- [x] Large image view with zoom on hover (transform-origin cursor position)
- [x] Toggle bar: Raw Panel / With Dialogue (segmented control)
- [x] Side panel: visual description (editable), FLUX prompt (collapsible), dialogue lines (editable)
- [x] Action buttons: Approve, Reject, Regenerate, Edit Prompt & Regenerate
- [x] Keyboard shortcuts: arrow keys navigate, A to approve, R to reject

### 3E. Storyboard Preview (/studio/[projectId]/storyboard)
- [x] Manga page reader layout (dark bg-void, panels centered)
- [x] Panels arranged 2-4 per row with varying sizes based on camera angle
- [x] Thin white borders between panels (manga gutter style)
- [x] Dialogue text rendered below each panel
- [x] Click-through slideshow mode (single panel fullscreen, fade transitions, typewriter dialogue)
- [x] Auto-advance timer in slideshow mode
- [x] Export as PDF button (jsPDF, manga chapter format)
- [x] Subtle paper texture overlay at 5% opacity

### 3F. LoRA Integration
- [x] tRPC procedure: characters.trainLora (upload reference images, start training)
- [x] tRPC procedure: characters.loraStatus (poll training progress)
- [x] Store lora_model_url in characters table
- [x] LoRA training UI: progress card with animated ring, stage labels
- [x] Sample generation test when training complete

### 3G. Database Schema Extensions
- [x] Add loraModelUrl, loraStatus, loraTriggerWord columns to characters table
- [x] Add compositeImageUrl, fluxPrompt, reviewStatus columns to panels table
- [x] Migration SQL generated and applied

### 3H. Tests
- [x] Vitest: panel generation procedures (generate, approve, reject, regenerate)
- [x] Vitest: overlay procedure
- [x] Vitest: batch actions (approve all, regenerate failed)
- [x] Vitest: LoRA training procedures

## Phase 4: Community, Voting & Streaming Platform

### 4A. Homepage & Discovery
- [x] Full-screen hero with featured project rotation (crossfade every 8s)
- [x] Hero: blurred background, title, synopsis, genre badges, creator avatar, CTA buttons
- [x] Scroll indicator (animated bouncing chevron)
- [x] Netflix-style content rows: Trending, New Releases, Top Rated, genre rows
- [x] Horizontal scroll carousel with peek, snap-to-card, arrow buttons on hover
- [x] Poster card (2:3): image, gradient overlay, title, episode count, vote count, genre badge
- [x] Poster card hover: scale(1.08), expand with synopsis and Watch Now button (absolute, no push)
- [x] Landscape card (16:9) for Continue Watching with progress bar
- [x] Search overlay: full-width bar, debounced 300ms, real-time results, keyboard navigable
- [x] Explore page (/explore): genre filter pills, sort dropdown, responsive grid

### 4B. Project Page (/watch/[slug])
- [x] Hero banner with cover image and gradient fade
- [x] Left column: title, creator card, synopsis, genre badges, stats row
- [x] Episode list: numbered cards with thumbnail, title, duration, vote count
- [x] Right column (sticky): Start/Continue Watching, Add to Watchlist, Share, Similar projects

### 4C. Video/Storyboard Player (/watch/[slug]/[episodeNumber])
- [x] Storyboard slideshow player for manga-only episodes (panels, crossfade, typewriter dialogue)
- [x] Custom overlay controls (hidden after 3s inactivity)
- [x] Episode end screen with next episode countdown and vote buttons
- [x] Episode info bar and tabbed section (Comments, Episode Details)

### 4D. Voting System
- [x] Custom animated upvote/downvote icons with bounce animation
- [x] Vote count animates (number rolls) on change
- [x] Weekly hot algorithm: score = upvotes - downvotes + recency_bonus * views
- [x] Leaderboard (/leaderboard): ranked list, medal icons, tabs (Week/Month/All Time)
- [x] Top 3 projects: larger cards with gold/silver/bronze border glow

### 4E. Comments & Discussion
- [x] Comment input with avatar + textarea + Post button
- [x] Comment card: avatar, username, timestamp, content, delete button
- [x] Threaded replies (max 3 levels, indented with accent-cyan border)
- [x] Sort tabs: Newest, Top, Oldest
- [x] Markdown support with sanitized rendering (**bold**, *italic*, `code`)

### 4F. User Profiles & Notifications
- [x] Profile page (/profile/[userId]): banner, avatar, stats, tabs (Created/Watchlist)
- [x] Follow button toggle
- [x] Notification center dropdown (bell icon, w-96, types: new episode/reply/vote milestone/follower)
- [x] Mark all read functionality

### 4G. Database Schema
- [x] votes table (userId, episodeId, type: up/down)
- [x] comments table (id, episodeId, userId, parentId, content, timestamps)
- [x] follows table (followerId, followingId)
- [x] watchlist table (userId, projectId, lastEpisodeId, progress)
- [x] notifications table (id, userId, type, content, read, timestamps)
- [x] Add slug, coverImageUrl, featured fields to projects table
- [x] Add viewCount, duration fields to episodes table
- [x] Migration SQL generated and applied

### 4H. tRPC Procedures
- [x] discover.trending, discover.newReleases, discover.topRated, discover.byGenre
- [x] search.projects (debounced full-text)
- [x] votes.cast, votes.remove, votes.getForEpisode
- [x] comments.list, comments.create, comments.delete
- [x] follows.toggle, follows.status
- [x] watchlist.add, watchlist.remove, watchlist.list, watchlist.updateProgress
- [x] notifications.list, notifications.markAllRead
- [x] leaderboard.get (week/month/all)
- [x] projects.getBySlug (public)

### 4I. Tests
- [x] Vitest: voting procedures (cast, remove, get)
- [x] Vitest: comments procedures (list, create, delete)
- [x] Vitest: follows and watchlist procedures
- [x] Vitest: leaderboard and discover procedures
- [x] Vitest: notifications procedures
