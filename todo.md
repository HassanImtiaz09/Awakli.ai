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

## Phase 5: Anime Production Pipeline & Mission Control

### 5A. Database Schema
- [x] pipeline_runs table (id, episodeId, status, currentNode, progress, estimatedTime, cost, errors, timestamps)
- [x] pipeline_assets table (id, episodeId, panelId, assetType ENUM, url, metadata JSON, createdAt)
- [x] Add voiceId, voiceCloneUrl columns to characters table
- [x] Add videoUrl, thumbnailUrl columns to episodes table
- [x] Migration SQL generated and applied

### 5B. Pipeline Agent Nodes (Server-Side)
- [x] Video Generation Agent: builds prompt from scene desc + camera movement, calls image gen as proxy, stores clips
- [x] Voice Generation Agent: TTS for dialogue lines using character voice settings
- [x] Lip Sync Agent: composites voice onto video clips (simulated)
- [x] Background Music Agent: generates per-episode music segments
- [x] Assembly Agent: creates final video asset, generates thumbnail, updates episode URLs
- [x] Pipeline orchestrator: runs 5 nodes sequentially (video_gen → voice_gen → lip_sync → music_gen → assembly)
- [x] Retry logic: creates new pipeline run for failed episodes
- [x] Cost tracking per node and per episode
- [x] Owner notification on pipeline complete/fail

### 5C. tRPC Procedures
- [x] pipeline.start: starts pipeline for an episode
- [x] pipeline.getStatus: returns run with nodeStatuses, progress, cost, ETA
- [x] pipeline.retry: creates new run for failed episode pipeline
- [x] pipeline.approve: approves QA review, sets episode to published
- [x] pipeline.reject: flags issues on specific nodes for re-processing
- [x] pipeline.publish: publishes approved episode
- [x] pipeline.listByProject / pipeline.listByEpisode: lists pipeline runs
- [x] voice.clone: accepts audio URL, creates simulated voice clone for character
- [x] voice.test: generates simulated TTS sample via S3 placeholder

### 5D. Pipeline Dashboard UI (/studio/[projectId]/pipeline)
- [x] Visual node graph: horizontal flow diagram with 5 agent nodes as connected rounded rectangles
- [x] Node status styling: pending (gray), running (cyan pulsing glow + progress ring), complete (green check), failed (red X + retry)
- [x] SVG connection lines: animated dashed stroke (cyan) when flowing, solid (green) when complete
- [x] Overall progress bar with gradient-accent fill and estimated time remaining
- [x] Click node to expand detail panel below graph (Framer Motion)
- [x] Video Gen detail: grid of video clip thumbnails with play overlay buttons
- [x] Voice Gen detail: waveform visualizations with audio playback per voice clip
- [x] Lip Sync detail: before/after video comparison layout per synced clip
- [x] Music Gen detail: audio player bars with mood and duration per music segment
- [x] Assembly detail: full video preview player with subtitle download link
- [x] Each detail panel shows: processing time, API cost, output count, and error log
- [x] Episode pipeline list table: Episode | Status | Progress | Duration | Cost | Actions
- [x] Batch actions: multi-select checkboxes + Start Pipeline for multiple episodes
- [x] Per-episode Start/Retry/View actions in pipeline table

### 5E. QA Review Screen
- [x] Full-width video player with assembled episode
- [x] Approve & Publish button (accent-pink) and Request Changes button (secondary)
- [x] Request Changes modal: checkboxes for issue types (visual, audio, sync, quality, other)
- [x] Other issue type has text area for description
- [x] Submitted issues flagged on specific nodes for re-processing

### 5F. Voice Cloning UI (/studio/[projectId]/characters/[id]/voice)
- [x] Audio upload drag-and-drop zone with waveform preview
- [x] Clone Voice button with progress animation
- [x] Test section: type text, click Test Voice to hear sample
- [x] Side-by-side: original audio vs cloned audio playback

### 5G. Testing
- [x] Vitest: pipeline start, status, retry procedures
- [x] Vitest: pipeline approve/reject/publish procedures
- [x] Vitest: voice cloning and test voice procedures
- [x] Vitest: pipeline list runs procedure (covered in pipeline.listByProject auth test)

## Phase 6: Commerce, Landing Page & Launch Polish

### 6A. Stripe Subscription System
- [x] Set up Stripe integration via webdev_add_feature
- [x] Three tiers: Free ($0), Pro ($29/mo), Studio ($99/mo)
- [x] Stripe Checkout Sessions for subscription creation
- [x] Webhook handler for subscription events
- [x] Tier-based feature gating middleware
- [x] Billing portal for subscription management

### 6B. Usage Tracking & Credits
- [x] usage_records table tracking all AI generation actions
- [x] Credits per action: script=10, panel=2, video=20, voice=1, lora_train=50
- [x] Monthly allocation: Free=100, Pro=2000, Studio=10000
- [x] Overage handling: $0.05/credit for Pro/Studio
- [x] Usage dashboard UI: animated circular progress ring
- [x] Segmented arcs by action type, history table below

### 6C. Creator Marketplace Foundation
- [x] Premium episodes (require Pro viewer subscription)
- [x] Tip jar via Stripe (80/20 split)
- [x] Creator earnings dashboard with payout chart

### 6D. Admin Dashboard (/admin)
- [x] Dark-themed analytics dashboard
- [x] Metric cards: total users, creators, projects, revenue (with trend arrows)
- [x] Subscription distribution chart
- [x] Content moderation queue
- [x] User management table with pagination

### 6E. Landing Page (MOST IMPORTANT - must be stunning)
- [x] Section 1 - Hero (100vh): Ken Burns zoom on anime image, floating particles, AWAKLI wordmark with glow, sequential word fade-in tagline, dual CTAs, social proof count-up, scroll indicator
- [x] Section 2 - Showcase Reel: dual-row auto-scrolling marquee (opposite directions), film strip tilt, overlaid text fade-in
- [x] Section 3 - How It Works: 3 large cards (Write/Generate/Watch) with animated icons, connected by SVG dotted line with flowing dots, stagger reveal
- [x] Section 4 - Before/After: interactive comparison slider (text vs anime), 3 cycling examples, draggable divider
- [x] Section 5 - Feature Grid: 2x3 cards with icon glow, scroll-reveal stagger
- [x] Section 6 - Pricing Table: 3 cards, Pro highlighted with gradient border, Monthly/Annual toggle, 20% discount badge
- [x] Section 7 - Testimonials: horizontal auto-scrolling carousel, pause on hover, placeholder testimonials
- [x] Section 8 - Final CTA: gradient background, large text, glow pulse button
- [x] Footer: 4-column grid, wordmark, social icons
- [x] Global animations: Intersection Observer + Framer Motion scroll reveal, stagger, parallax, prefers-reduced-motion respect

### 6F. Onboarding Flow
- [x] Step 1: Welcome with feature overview
- [x] Step 2: Choose Your Style (6 anime style options)
- [x] Step 3: Your First Project (Upload/AI Script/Explore)

### 6G. SEO & Performance
- [x] robots.txt and sitemap.xml
- [x] OG tags and Twitter Card meta
- [x] Security headers (Stripe webhook raw body, CORS)

### 6H. Testing
- [x] Vitest: billing/subscription procedures (getTiers, getSubscription)
- [x] Vitest: usage tracking procedures (getSummary, getHistory)
- [x] Vitest: admin procedures (getMetrics, getUsers, getModerationQueue, getSubscriptions)
- [x] Vitest: creator marketplace procedures (getEarnings, getTips)
- [x] All 115 tests passing across 7 test files

## Corrective Update: Platform Identity & Messaging

### Copy & Branding
- [x] Landing page hero: headline → 'Turn Your Ideas Into Anime', subheadline → 'Write a story. AI creates the manga. The community decides what becomes anime.'
- [x] Landing page hero: CTA → 'Start Writing — Free' + 'Explore Manga'
- [x] How It Works: change from 3 steps to 4 (Write → Generate → Share & Vote → Animate)
- [x] Feature grid: update descriptions to emphasize text-to-manga as primary path
- [x] Testimonials: update to reflect manga creation, not manga-to-anime conversion
- [x] Final CTA section: update copy to reflect broader platform identity
- [x] Footer tagline: 'Where stories become manga, and manga becomes anime.'

### Navigation
- [x] Add 'Create' as top-level nav item
- [x] Restructure nav: Create | Discover | Leaderboard | Studio

### Meta & SEO
- [x] Page title: 'Awakli — Turn Your Ideas Into Anime'
- [x] OG tags: update og:description to 'Create manga from your story ideas. The best get voted into anime.'
- [x] Twitter card: update description
- [x] Meta description: update to reflect broader identity

### Onboarding
- [x] Step 1 choice: 'Create a Manga' (primary) | 'Watch & Discover' (secondary)
- [x] Remove references to 'anime production' as primary activity

### Secondary Pages
- [x] Discover page: verified clean (no old identity references)
- [x] Pricing page: updated descriptions to emphasize text-to-manga + community voting
- [x] StudioDashboard: updated empty states and subtitles
- [x] MangaUpload: updated header and sign-in copy
- [x] PipelineDashboard: updated subtitle
- [x] Server LLM prompts: updated to remove manga-to-anime references

## Public Text-to-Manga Creation Flow

### Database Changes
- [x] Add original_prompt TEXT column to projects table
- [x] Add creation_mode ENUM('quick_create', 'studio', 'upload') DEFAULT 'quick_create' to projects
- [x] Add anime_eligible BOOLEAN DEFAULT false to projects
- [x] Migration SQL generated and applied

### Backend: Quick-Create API
- [x] quick-create tRPC procedure: accepts { prompt, genre, style, chapters }, auto-creates project, starts script generation, returns { projectId }
- [x] Auto-generate project title from prompt using LLM
- [x] SSE streaming endpoint GET /api/v1/projects/{id}/generation-stream
- [x] Stream script text line-by-line as LLM generates it
- [x] Stream panel generation status updates (pending → generating → generated)
- [x] Auto-generate panels after script is complete

### Frontend: /create Prompt Page
- [x] Clean, focused, immersive single-screen design (no wizard)
- [x] Large textarea with story prompt placeholder
- [x] Inline options: Genre pill selector, Style dropdown, Chapters number input (1-12, default 3)
- [x] 'Generate My Manga' CTA button (full-width, glow effect)
- [x] Auth gate: if not logged in, show auth modal on Generate click
- [x] Tier gate: if over free tier limit, show upgrade prompt

### Frontend: /create/[id] Live Generation View
- [x] Full-screen generation experience
- [x] Top: auto-generated story title + overall progress indicator
- [x] Left side (1/3): script generation feed with typewriter/terminal style, streaming text
- [x] Right side (2/3): panel generation grid with skeleton → shimmer → fade-in reveal
- [x] Panels appear in order (Scene 1 Panel 1, etc.)
- [x] Click any panel to zoom in (lightbox)
- [x] Bottom: overall progress bar + 'Chapter X of Y: Z% complete'
- [x] Auto-transition to reader when generation complete

### Frontend: /create/[id]/read Manga Reader
- [x] Full manga reader (dark bg, panel-by-panel navigation)
- [x] Keyboard navigation (arrow keys, spacebar)
- [x] Panel thumbnail strip at bottom
- [x] Dialogue overlays on panels
- [x] Fullscreen mode toggle
- [x] Publish modal with success state
- [x] Publish makes manga visible on Discover page

### Navigation Update
- [x] Top nav 'Create' button styled as accent-pink pill with Wand2 icon
- [x] Mobile: floating action button (bottom-right, accent-pink, circular, + icon) hidden on /create pages
- [x] Mobile drawer: Create Manga link with Wand2 icon at top
- [x] Dropdown: Create Manga link with PenTool icon

### Discover Page Update
- [x] Add 'Just Created' content row with real tRPC data from quickCreate.justCreated
- [x] Empty state with CTA to create manga
- [x] Loading skeleton state

### Testing
- [x] Vitest: quickCreate.justCreated (public, returns array, respects limit)
- [x] Vitest: quickCreate.status (throws NOT_FOUND for non-existent)
- [x] Vitest: quickCreate.getScript (throws NOT_FOUND for non-existent)
- [x] Vitest: quickCreate.getPanels (returns empty array for non-existent)
- [x] Vitest: quickCreate.start (requires auth, validates prompt length)
- [x] Vitest: quickCreate.publish (requires auth, throws NOT_FOUND)
- [x] All 124 tests passing across 8 test files

## Community Voting Gate & Anime Promotion

### Database Changes
- [x] Add total_votes INT DEFAULT 0 to projects table
- [x] Add anime_status ENUM('not_eligible','eligible','in_production','completed') DEFAULT 'not_eligible' to projects
- [x] Add anime_promoted_at TIMESTAMP to projects
- [x] Create platform_config table (key VARCHAR PK, value TEXT, updated_at TIMESTAMP)
- [x] Seed platform_config: anime_vote_threshold=500, anime_featured_threshold=1000
- [x] Create anime_promotions table (id, project_id UNIQUE FK, vote_count_at_promotion, promoted_at, production_started_at, production_completed_at, status ENUM)
- [x] Migration SQL generated and applied

### Backend: Voting & Anime Procedures
- [x] vote-progress procedure: returns { totalVotes, threshold, percentage, isEligible }
- [x] Enhanced vote procedure: after vote, check threshold, auto-promote if crossed
- [x] start-anime procedure: creator confirms anime production start
- [x] rising procedure: manga between 50-80% of threshold, sorted by proximity
- [x] becoming-anime procedure: manga that crossed threshold, anime in production
- [x] leaderboard/rising: sorted by vote count, closest to threshold first
- [x] leaderboard/promoted: sorted by promotion date
- [x] leaderboard/completed: finished anime series
- [x] Notification to creator when threshold crossed

### Frontend: Vote Progress Bar Component
- [x] Wide progress bar: gradient fill, animated shimmer at leading edge
- [x] Label: '{current_votes} / {threshold} votes for anime'
- [x] Near threshold (>80%): pulsing glow, accent-pink text, 'Almost there!' message
- [x] Threshold reached: confetti, gold bar, 'Voted for anime!' message

### Frontend: Enhanced Voting UX
- [x] After voting toast: 'You voted! {X} more votes until this becomes anime.'
- [x] Vote button hover tooltip: 'Vote to help this manga become anime'
- [x] First-time voter explainer modal (integrated into VoteProgressBar)

### Frontend: Discover Page New Sections
- [x] 'Rising Stars' row: manga 50-80% of threshold, mini vote progress on cards
- [x] 'Becoming Anime' row: in-production manga with status badge

### Frontend: Road to Anime Leaderboard (3 tabs)
- [x] Tab 1 'Rising': rank, cover, title, creator, vote count, progress bar, inline Vote button
- [x] Tab 2 'Promoted': promoted manga with anime production status
- [x] Tab 3 'Completed': finished anime with 'Watch Anime' button

### Frontend: Project Page Manga/Anime Tabs
- [x] VoteProgressBar integrated into WatchProject sidebar
- [x] Anime status section: shows progress, in-production, or completed state
- [x] Correct animeStatus enum handling (not_eligible/eligible/in_production/completed)

### Frontend: Studio Home 3 Creation Paths
- [x] Card 1: 'Quick Create' (accent-pink, Wand2 icon) -> /create
- [x] Card 2: 'Studio Project' (accent-purple, PenTool icon) -> /studio/new
- [x] Card 3: 'Upload Manga' (accent-cyan, Upload icon) -> /studio/upload

### Frontend: Creator Dashboard Promotion Status
- [x] AnimePromotionStatus component shows promoted/eligible projects
- [x] Promoted: gold accent with Trophy icon, In Production/Completed badge
- [x] Eligible: orange accent with Flame icon, 'Start Anime' button
- [x] Auto-hides when no promoted/eligible projects

### Testing
- [x] Vitest: discoverVoting.rising (public, returns array)
- [x] Vitest: discoverVoting.becomingAnime (public, returns array)
- [x] Vitest: roadToAnime.rising (returns items + threshold)
- [x] Vitest: roadToAnime.promoted (returns array)
- [x] Vitest: roadToAnime.completed (returns array)
- [x] Vitest: voteProgress.get (returns progress data)
- [x] Vitest: voteProgress.getThreshold (returns threshold object)
- [x] Vitest: creatorVoting.projectsWithProgress (auth required, returns array)
- [x] Vitest: animeProduction.start (auth required, NOT_FOUND for non-existent)
- [x] All 135 tests passing across 9 test files

## Landing Page & Onboarding Rewrite

### Hero Section Rewrite
- [x] Cycling headline: 'Ideas' -> 'Stories' -> 'Dreams' -> 'Worlds' with vertical slide animation
- [x] Inline prompt input in hero (large text input + Create button)
- [x] Prompt pre-fills /create page on submit
- [x] Social proof counter animation: '12,000+ manga created | 500+ anime voted'
- [x] 'Now in Public Beta' animated badge (accent-cyan)

### Section 2: Showcase Gallery
- [x] Title: 'Created by people like you'
- [x] Masonry grid of manga panels + anime screenshots
- [x] Hover shows project title + creator + vote count
- [x] Auto-scrolling gentle animation

### Section 3: How It Works (4 Steps)
- [x] Title: 'From Idea to Anime in Four Steps'
- [x] Step 1 WRITE: pencil icon, 'Describe your story in plain text'
- [x] Step 2 GENERATE: wand icon, 'AI writes script and draws panels'
- [x] Step 3 SHARE & VOTE: heart icon, 'Publish and community votes'
- [x] Step 4 ANIMATE: film icon, 'Top-voted manga become anime'
- [x] Connected by animated flowing dotted line

### Section 4: Live Creation Demo
- [x] Title: 'See It In Action'
- [x] Interactive demo: click Generate to watch accelerated creation
- [x] Show prompt -> script streaming -> panels generating -> final manga
- [x] CTA: 'Try it yourself - free'

### Section 5: Two Audiences Split
- [x] Left: 'FOR READERS & FANS' with discover CTA
- [x] Right: 'FOR CREATORS' with create CTA
- [x] Dark cards with distinct illustrations

### Section 6: Feature Grid (Updated)
- [x] Title: 'Powered by the Best AI'
- [x] Cards: Claude Opus 4, FLUX 1.1 Pro, Kling 2.1, ElevenLabs, Community, Awakli Pipeline

### Section 7: Pricing (Updated Copy)
- [x] Title: 'Start Free. Create Unlimited.'
- [x] Free: 'Create manga from your ideas. Publish and earn votes.'
- [x] Pro: 'More power, direct anime access, no limits.'
- [x] Studio: 'Full pipeline control. Upload your own manga.'

### Section 8: CTA (Updated)
- [x] Headline: 'Every Great Anime Starts With an Idea'
- [x] Subtext: 'Yours could be next.'
- [x] Inline prompt input (same as hero)

### Onboarding Rewrite
- [x] Step 1: Welcome with two large cards: 'I Want to Create' vs 'I Want to Discover'
- [x] Creator path: shows example prompt, redirects to /create with pre-filled prompt
- [x] Reader path: explains voting flow, redirects to /discover
- [x] /create page reads ?prompt query param to pre-fill textarea
- [x] All 135 tests passing across 9 test files

## Enhanced Production Pipeline

### Pipeline Enhancement 1: Image Quality & Upscaling
- [x] Add quality_score FLOAT, quality_details JSON, generation_attempts INT DEFAULT 1 to panels table
- [x] Add upscaled_image_url TEXT to panels table
- [x] Quality Assessment Agent: quality.assess procedure using LLM vision
- [x] Score 5 criteria (1-10): prompt adherence, anatomy, style consistency, composition, character accuracy
- [x] Auto-actions: 8-10 auto-approve, 5-7 show with warning, 1-4 auto-regenerate (max 3 attempts)
- [x] Image Upscaler Agent: upscale.panel procedure using Real-ESRGAN via generateImage
- [x] Store upscaled version as separate URL, keep original
- [x] Upscaled version sent to Kling for video generation

### Pipeline Enhancement 2: Scene Consistency System
- [x] Create scenes table: id, episode_id FK, scene_number, location, time_of_day, mood, scene_context JSON, environment_lora_url
- [x] Scene Context Builder: scene.getContext extracts context from existing scenes
- [x] Context Injection: scene.buildPrompt prepends scene context to FLUX prompt for subsequent panels

### Pipeline Enhancement 3: Sound Effects Agent
- [x] Create episode_sfx table with episode_id FK, sfx_type, timestamp_ms, duration_ms, volume, sfx_url
- [x] sfx.getLibrary returns curated SFX categories (impact, ambient, ui, nature, etc.)
- [x] sfx.parseScript extracts SFX markers from episode scripts
- [x] Output: array of { type, timestamp_ms, volume, duration }
- [x] FFmpeg assembly mixes SFX into final audio alongside voice + music

### Pipeline Enhancement 4: Enhanced Video Generation
- [x] videoPrompt.getCameraPresets returns 10 camera angle presets with Kling motion prompts
- [x] videoPrompt.getTransitions returns 8 FFmpeg transition filter templates
- [x] videoPrompt.getMoodPresets returns 6 mood-to-motion-intensity mappings
- [x] videoPrompt.build composes full Kling prompt from visual + camera + mood + transition
- [x] FFmpeg transition template library: cross-dissolve, fade-to-black, wipe-right, slide-left, flash-white, zoom-in, zoom-out, blur

### Pipeline Enhancement 5: Narrator Voice
- [x] Add narrator_voice_id, narrator_enabled, narrator_style to episodes table
- [x] narrator.extractLines parses script for __narrator__ blocks
- [x] Default deep authoritative voice from ElevenLabs library
- [x] Narrator audio mixed at lower volume than character dialogue
- [x] narrator.getVoices returns available narrator voice options

### Pipeline Enhancement 6: Smart Cost Estimation
- [x] cost.estimate procedure calculates full pipeline cost breakdown
- [x] Calculate: panels * upscale + panels * video_gen + dialogue_lines * voice + music + sfx + assembly
- [x] CostEstimationCard component shows breakdown before Start Pipeline
- [x] Pre-flight checks card shows quality/moderation/upscale/SFX readiness

### Pipeline Enhancement 7: Content Moderation Gate
- [x] moderation.scanPanel procedure: LLM vision scans panel for policy violations
- [x] moderation.scanText procedure: LLM scans script text for policy violations
- [x] If flagged: mark panel as 'flagged', show warning to creator
- [x] moderation.getStatus returns moderation status and flags for a panel
- [x] ModerationBanner component shows warnings with acknowledge/appeal options

### Frontend Updates
- [x] QualityBadge component: green check for 8+, yellow warning for 5-7, red for auto-regenerated
- [x] QualityBadge shows upscale indicator when upscaled_image_url exists
- [x] CostEstimationCard on PipelineDashboard before Start Pipeline with full breakdown
- [x] ModerationBanner with revise/acknowledge options and severity-based styling
- [x] VideoPromptBuilder with camera/mood/transition selectors and live preview
- [x] Pre-flight checks card showing all pipeline gate readiness

### Testing
- [x] Vitest: quality.getScore and quality.assess (throws for non-existent panel)
- [x] Vitest: upscale.getStatus and upscale.panel (throws for non-existent panel)
- [x] Vitest: scene.buildPrompt (returns enhanced prompt with context)
- [x] Vitest: sfx.getLibrary (public, returns SFX categories)
- [x] Vitest: cost.estimate (throws for non-existent episode)
- [x] Vitest: moderation.getStatus (throws for non-existent panel)
- [x] Vitest: videoPrompt.getCameraPresets, getMoodPresets, getTransitions, build
- [x] Vitest: narrator.extractLines (returns lines array)
- [x] All 148 tests passing across 10 test files
