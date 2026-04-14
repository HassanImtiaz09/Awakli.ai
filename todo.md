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

## Freemium Funnel & Anime Preview System

### Database Changes
- [x] Create tier_limits table with all tier configuration
- [x] Seed tier_limits: free (3 projects, 3 chapters, 20 panels, 0 anime, sonnet, 720p, watermark), creator (10, 12, 30, 5, opus, 1080p, no watermark), studio (999, 999, 999, 20, opus, 4K, no watermark)
- [x] Add anime_preview_used BOOLEAN DEFAULT false to users table
- [x] Add preview_video_url TEXT to projects table
- [x] Add is_premium ENUM('free','premium','pay_per_view') DEFAULT 'free' to episodes table
- [x] Add ppv_price_cents INT to episodes table
- [x] Migration SQL generated and applied

### Stripe Products Update
- [x] Rename Pro -> Creator ($19/mo, $15/mo annual)
- [x] Update Studio ($49/mo, $39/mo annual)
- [x] Update products.ts with new tier names and prices
- [x] Update Stripe checkout to use new price IDs

### Backend: Tier Enforcement Middleware
- [x] checkTierLimit(userId, actionType) -> { allowed, reason, upgradeTier, upgradeBenefit }
- [x] Actions: create_project, create_chapter, create_panel, generate_anime, clone_voice, train_lora, export_manga, export_anime, set_premium
- [x] Enforce at tRPC procedure level before every generation action
- [x] Return structured upgrade prompt data

### Backend: Anime Preview System
- [x] POST generate-anime-preview: select best scene, run abbreviated pipeline
- [x] Preview = 1-3 min clip, watermarked, 720p
- [x] One preview per account (check anime_preview_used)
- [x] Save preview_video_url on project
- [x] Trigger points: first manga complete, 50% vote threshold, manual button

### Backend: Export System
- [x] Manga export: PDF, PNG, ZIP formats based on tier
- [x] Anime export: MP4 (Creator), MP4+ProRes+stems+SRT (Studio)
- [x] Generate presigned download URLs (24h expiry)
- [x] File size estimation before download

### Backend: Premium Episodes & Earnings
- [x] Set episode premium status (free/premium/ppv)
- [x] Enhanced earnings dashboard with breakdown by project/episode/type
- [x] Payout history tracking

### Frontend: Pricing Page Rewrite
- [x] Three cards: Free/$0, Creator/$19 (highlighted), Studio/$49
- [x] Monthly/Annual toggle with 20% discount
- [x] Feature comparison with checkmarks
- [x] FAQ section below cards
- [x] Updated CTAs: Get Started / Start Creating / Go Studio

### Frontend: Upgrade Modals
- [x] Contextual upgrade modal: shows reason, benefit, upgrade CTA
- [x] Appears when tier limit is hit (not annoying, only on action)
- [x] Links to Stripe checkout for the recommended tier

### Frontend: Anime Preview
- [x] Preview banner card on project page (for free users who haven't used preview)
- [x] 'Generate Anime Preview' button (accent-gold)
- [x] Full-screen preview player with upgrade CTAs below
- [x] Feature comparison: Preview vs Full side-by-side
- [x] After preview used: button changes to 'Upgrade for Full Anime Access'

### Frontend: Export Modal
- [x] Format selection (PDF/PNG/ZIP for manga, MP4/ProRes/stems for anime)
- [x] File size estimates
- [x] Download buttons with tier gating
- [x] Tier-locked formats show lock icon + upgrade prompt

### Frontend: Enhanced Creator Earnings
- [x] Top row: Total earnings, This month, Pending payout
- [x] Earnings over time line chart
- [x] Breakdown table by project/episode/type
- [x] Payout history with dates and amounts

### Testing
- [x] Vitest: tier enforcement middleware (all action types)
- [x] Vitest: anime preview generation procedure
- [x] Vitest: tier status procedure
- [x] Vitest: export procedures (manga + anime)
- [x] Vitest: premium episode procedures
- [x] Vitest: updated billing checkout with new tiers
- [x] All 160 tests passing across 11 test files

## Phase 13: Chapter Length, Anime Sneak Peek & Download System

### Part A: Chapter Length & Story Structure

#### Database Changes
- [x] Add chapter_title TEXT, panel_count INT, estimated_read_time FLOAT to episodes table
- [x] Add chapter_end_type ENUM('cliffhanger','resolution','serialized') to episodes table
- [x] Add next_chapter_hook TEXT to episodes table
- [x] Add chapter_length_preset ENUM('short','standard','long') DEFAULT 'standard' to projects table
- [x] Add pacing_style ENUM('action_heavy','dialogue_heavy','balanced') DEFAULT 'balanced' to projects table
- [x] Add chapter_ending_style ENUM('cliffhanger','resolution','serialized') DEFAULT 'cliffhanger' to projects table
- [x] Migration SQL generated and applied

#### Backend: Claude System Prompt Update
- [x] Update script generation system prompt with chapter structure rules (3-act structure)
- [x] Add panel variety requirements (establishing shots, medium shots, close-ups, splash panels)
- [x] Add dialogue distribution rules based on pacing_style
- [x] Add chapter ending rules based on ending_style
- [x] Add multi-chapter story arc guidance (inciting incident, midpoint twist, climax)
- [x] Add scene-to-panel ratio rules (3-8 panels per scene, 2-5 scenes per chapter)

#### Backend: Updated Script Output Schema
- [x] Update script JSON schema with chapter-level metadata (mood_arc, chapter_end_type, next_chapter_hook, estimated_read_time)
- [x] Include chapter_length_preset and pacing_style in generation input

#### Backend: Chapter Editor Procedures (Studio)
- [x] chapters.movePanel: move a panel between chapters
- [x] chapters.split: split a chapter at a panel boundary
- [x] chapters.merge: merge two adjacent chapters
- [x] chapters.reorderScenes: drag-and-drop scene reordering within a chapter
- [x] Auto-update panel numbering and scene flow after changes

#### Frontend: Create Page Updates
- [x] Add chapter count selector (1-12, default 3) to /create quick create page
- [x] Chapter count passed to script generation

#### Frontend: Studio Advanced Controls
- [x] Chapter count selector (1-24) in Studio project creation
- [x] Chapter length preset dropdown: Short / Standard / Long with descriptions
- [x] Pacing style selector: Action-heavy / Dialogue-heavy / Balanced
- [x] Chapter ending style selector: Cliffhanger / Resolution / Serialized

#### Frontend: Chapter Editor (Studio)
- [x] Timeline view showing chapters as horizontal blocks, panels as colored segments
- [x] Color coding: action scenes (red), dialogue scenes (blue), establishing (green)
- [x] Drag handles between chapters for split/merge
- [x] Drag-and-drop panel reordering between chapters
- [x] Auto-update panel numbering on changes

### Part B: Anime Sneak Peek (5-10s Auto-Clip)

#### Database Changes
- [x] Add sneak_peek_url TEXT to projects table
- [x] Add sneak_peek_status ENUM('none','generating','ready','failed') DEFAULT 'none' to projects table
- [x] Add sneak_peek_scene_id INT FK to projects table
- [x] Add sneak_peek_generated_at TIMESTAMPTZ to projects table

#### Backend: Best-Scene Selection Algorithm
- [x] Claude Haiku scene scoring: action/drama +3, character close-up +2, dialogue +2, climax/cliffhanger +3, multi-character +1, dynamic camera +1
- [x] Select highest-scoring scene, pick 2-3 best consecutive panels
- [x] sneakPeek.selectScene procedure

#### Backend: Abbreviated Pipeline
- [x] Upscale 2-3 selected panels (Real-ESRGAN)
- [x] Generate 5s video per panel via Kling (shortest duration, parallel)
- [x] Generate voice for 1-2 most dramatic dialogue lines (ElevenLabs default voice)
- [x] Add pre-made music sting (3-5s, from 10-option library, rotate)
- [x] FFmpeg assembly: concatenate + voice + music + fade-in/fade-out + watermark
- [x] Store as sneak_peek_url on project, update status to 'ready'
- [x] sneakPeek.generate procedure (async, auto-triggered after manga completion)

#### Backend: Sneak Peek Status & Cost Management
- [x] sneakPeek.getStatus procedure (poll progress)
- [x] Lower priority queue than paid pipeline jobs
- [x] Rate limit: max 100 sneak peeks per hour platform-wide
- [x] Cache: never regenerate unless panels edited

#### Frontend: Sneak Peek Card on Reader Page
- [x] Gradient card with film-strip decoration and shimmer border
- [x] Left: small 16:9 video player (muted autoplay, play button overlay)
- [x] Right: 'Your story as anime' heading, subtext, Watch/Make Full buttons
- [x] Loading state: 'Preparing your anime preview...' with animated progress

#### Frontend: Sneak Peek Post-Play Modal
- [x] Full-screen dark overlay modal with video player
- [x] After video ends: overlay with 'This was just 10 seconds. Imagine 10 minutes.'
- [x] Upgrade CTA: 'Upgrade to Creator - $19/mo' (primary, glow)
- [x] 'Maybe Later' ghost button
- [x] Small text: 'Or earn anime access through community votes - free'

#### Frontend: Sneak Peek on Project Page & Discover
- [x] Small 'Anime Preview' trailer above chapter list on public project page
- [x] Film-strip icon badge on Discover cards for projects with sneak peeks

### Part C: Download & Sharing System

#### Database Changes
- [x] Create exports table: id, user_id, project_id, episode_id, format, status, file_url, file_size_bytes, watermarked, resolution, expires_at, created_at

#### Backend: Manga Download Procedures
- [x] downloads.mangaPdf: generate PDF (72/150/300 DPI by tier, watermark for free)
- [x] downloads.panelsZip: generate PNG ZIP (1024px free / 2048px creator+)
- [x] downloads.epub: generate ePub format (Studio only)
- [x] downloads.cbz: generate CBZ format (Studio only)
- [x] Free tier: watermark + QR code on last page
- [x] Creator tier: no watermark, optional credits page + character sheets
- [x] Studio tier: 300 DPI, TIFF, layered files

#### Backend: Anime Download Procedures
- [x] downloads.mp4: generate MP4 (1080p creator / 4K studio)
- [x] downloads.prores: generate ProRes 422 (Studio only)
- [x] downloads.stems: generate audio stems (Studio only)
- [x] downloads.subtitles: generate SRT files
- [x] downloads.thumbnails: auto-generated 1920x1080 thumbnails (Studio)
- [x] downloads.batchAll: batch download all episodes as ZIP (Studio)

#### Backend: Export Status & Management
- [x] downloads.getStatus: poll export progress
- [x] downloads.getDownloadUrl: presigned URL with 24h expiry
- [x] downloads.listByProject: list all exports for a project
- [x] File size estimation before generation

#### Backend: Sharing System
- [x] sharing.getShareableLink: permanent public URL /read/{project-slug}
- [x] sharing.generateOgTags: cover image, title, synopsis, chapter count for OG/Twitter
- [x] sharing.getEmbedCode: iframe snippet for Creator/Studio tiers
- [x] sharing.generatePanelImage: social-media-ready panel image with title + URL

#### Frontend: Download Modal
- [x] Modal with two tabs: 'Manga' | 'Anime'
- [x] Manga tab: format selector (PDF/PNG/ePub/CBZ), chapter-by-chapter or all, quality indicator, file size estimates
- [x] Anime tab: format selector (MP4/ProRes/stems/SRT), episode-by-episode or batch
- [x] Tier-locked formats: grayed out with tier badge + upgrade prompt
- [x] Watermark note for free tier
- [x] Bottom: tier comparison showing current vs next tier benefits

#### Frontend: Share Buttons & Panel Sharing
- [x] Share dropdown: Copy Link, Twitter/X, Discord, Reddit, WhatsApp
- [x] Copy Link with toast notification
- [x] Pre-filled social media share text
- [x] Embed button with iframe code snippet (Creator/Studio)
- [x] Panel sharing: long-press/right-click panel -> 'Share This Panel'
- [x] Generated panel image with project title and awakli.ai URL

#### Frontend: Reader Download Button
- [x] Floating toolbar in manga reader: Download + Share buttons
- [x] Download icon opens download modal for current chapter

### Testing
- [x] Vitest: chapter structure procedures (movePanel, split, merge, reorderScenes)
- [x] Vitest: sneak peek procedures (selectScene, generate, getStatus)
- [x] Vitest: download procedures (getFormats, generate, getStatus, listByProject, estimate)
- [x] Vitest: sharing procedures (getShareData, getEmbedCode, generatePanelImage)
- [x] Vitest: export status and download URL procedures
- [x] All 203 tests passing across 12 test files with zero TypeScript errors

## Phase 14: Smart Creation Flow with Visual Customization

### Database Changes
- [x] Add preferences JSON column to users table (preferred_style, preferred_tone, preferred_chapter_length, preferred_audience, last_used_style)
- [x] Migration SQL generated and applied

### Backend: Prompt Analysis Procedure
- [x] create.analyzePrompt procedure (Claude Haiku): input prompt -> suggested_genre, suggested_style, suggested_style_display, suggested_tone, detected_characters, suggested_chapter_count, suggested_chapter_length, confidence
- [x] Genre-to-style mapping rules (action->Shonen, sci-fi->Cyberpunk, romance->Shojo, etc.)
- [x] Prompt keyword analysis for tone/style inference
- [x] Character detection from prompt (named characters, role descriptions)
- [x] Culturally appropriate auto-naming based on story setting
- [x] Response time target: < 2 seconds

### Backend: Updated Quick-Create
- [x] Accept optional customization params: style, tone, audience, characters[], chapter_count, chapter_length
- [x] Null fields = AI decides using analyzePrompt logic
- [x] Merge user customizations with AI defaults before generation

### Backend: User Preferences
- [x] create.savePreferences procedure: save style/tone/chapter/audience prefs
- [x] create.getPreferences procedure: load saved prefs for returning users
- [x] Auto-save preferences after each creation

### Pre-Generated Style Comparison Images
- [x] Generate male character in 8 styles (shonen, seinen, shojo, chibi, cyberpunk, watercolor, noir, realistic) at 512x768
- [x] Generate female character in 8 styles at 512x768
- [x] Generate 6 tone mood-board images at 400x300 (epic, fun, dark, romantic, scary, comedic)
- [x] Upload all 22 images to CDN via manus-upload-file --webdev
- [x] Create style/tone image URL constants file (shared/style-images.ts)

### Frontend: Two-Path Create Page
- [x] Replace single 'Generate My Manga' button with 'Generate Now' (primary pink glow) + 'Customize First' (outlined purple)
- [x] Help text below buttons explaining the two paths
- [x] 'Generate Now' triggers identical flow to current (zero friction)
- [x] 'Customize First' opens 4-step customization flow with slide animation
- [x] Smooth transitions between prompt mode and customize mode

### Frontend: Customization Flow Container
- [x] Step-by-step flow with one question at a time
- [x] Prompt preview pill showing story text throughout flow
- [x] Smooth slide animations between steps (AnimatePresence)
- [x] Progress indicator: 4 segmented dots showing current step

### Frontend: Q1 - Art Style Visual Picker (StylePicker.tsx)
- [x] 8-card grid (2 rows x 4 cols desktop, 2 cols mobile) with pre-generated character images
- [x] Accessible names: Bold & Dynamic, Mature & Detailed, Elegant & Expressive, Cute & Playful, Neon & Futuristic, Painted & Artistic, Dark & Moody, Cinematic & Realistic
- [x] One-line descriptions for each style
- [x] Male/Female toggle to switch character preview set
- [x] Selected card: accent-pink border + glow + scale(1.02) + check icon

### Frontend: Q2 - Character Cards
- [x] Deferred to Phase 15 (character customization is complex and benefits from dedicated implementation)

### Frontend: Q3 - Tone & Audience (TonePicker.tsx)
- [x] 6 mood-board style cards with AI-generated mood images + emoji + label
- [x] Tones: Epic & Intense, Fun & Light, Dark & Psychological, Romantic & Emotional, Mystery & Suspense, Comedy & Satire
- [x] Selected card: accent-purple border + glow + check icon

### Frontend: Q4 - Chapter Preferences (ChapterPrefs.tsx)
- [x] Chapter count slider (1-12) with visual display
- [x] 3 chapter length cards: Short / Standard / Long
- [x] 3 pacing style cards: Action-Heavy / Balanced / Dialogue-Heavy with icons
- [x] 3 ending style cards: Cliffhanger / Resolution / Serialized

### Frontend: Summary Card (CustomizeSummary.tsx)
- [x] 4-item grid showing Art Style, Tone, Chapters, and Genre with icons
- [x] Pacing and ending style shown as tags below
- [x] Large 'Generate My Manga' button (primary, full-width, glow)

### Mobile & Accessibility
- [x] Style grid reflows to 2 columns on mobile (sm:grid-cols-4)
- [x] Tone grid reflows to 2 columns on mobile (sm:grid-cols-3)
- [x] Touch-friendly card interactions with scale animations

### Testing
- [x] Vitest: style map constants (8 styles with internal/display/description)
- [x] Vitest: tone map constants (6 tones with display/colors)
- [x] Vitest: style images module (CDN URLs, STYLE_INFO, TONE_INFO)
- [x] Vitest: genre-to-style inference mapping
- [x] Vitest: two-path flow modes and 4 customization steps
- [x] Vitest: chapter preferences validation
- [x] Vitest: user preferences schema validation
- [x] All 226 tests passing across 13 test files with zero TypeScript errors

## Phase 15: Pro/Studio Pre-Production Suite

### Database Changes
- [x] Create pre_production_configs table (id, project_id UNIQUE, status ENUM in_progress/locked/archived, current_stage INT 1-6, character_approvals JSON, voice_assignments JSON, animation_style TEXT, style_mixing JSON, color_grading TEXT, atmospheric_effects JSON, aspect_ratio TEXT, opening_style TEXT, ending_style TEXT, pacing TEXT, subtitle_config JSON, audio_config JSON, environment_approvals JSON, estimated_cost_credits INT, locked_at, created_at, updated_at)
- [x] Create character_versions table (id, character_id FK, version_number INT, images JSON with 5 view URLs, description_used TEXT, quality_scores JSON, is_approved BOOLEAN, created_at)
- [x] Create voice_auditions table (id, character_id FK, voice_id TEXT, voice_name TEXT, dialogue_text TEXT, audio_url TEXT, is_selected BOOLEAN, created_at)
- [x] Migration SQL generated and applied

### Backend: Pre-Production Core
- [x] preProduction.start: initialize config for project (Creator/Studio only)
- [x] preProduction.getStatus: return current stage + all config data
- [x] preProduction.updateConfig: partial update production config fields
- [x] preProduction.advanceStage: move to next stage (with validation)

### Backend: Stage 1 - Character Gallery
- [x] characters.generateSheet: generate 5-view character sheet via FLUX (portrait, full body, 3/4, action, expressions)
- [x] characters.regenerateView: regenerate specific view with updated description
- [x] characters.approve: approve character design (lock with green border)
- [x] characters.getVersions: version history for a character
- [x] characters.revertVersion: revert to previous version
- [x] characters.updateStyle: per-character art style override
- [x] characters.trainLoRA: queue LoRA training from approved sheets (Studio only)

### Backend: Stage 2 - Voice Casting
- [x] voices.browseLibrary: browse ElevenLabs voice library with filters (gender, age, tone, accent)
- [x] voices.auditionWithScript: generate audition clip using character's first dialogue line (10 per character limit)
- [x] voices.castVoice: confirm voice selection for character
- [x] voices.uploadClone: upload audio for voice cloning (Creator: 2 clones, Studio: unlimited)
- [x] voices.testClone: test clone with script line
- [x] voices.autoAssign: auto-pick best matching voice based on character traits
- [x] voices.setNarrator: set narrator voice toggle and selection
- [x] voices.setDirectionNotes: save voice direction notes per character

### Backend: Stage 3 - Animation Style
- [x] animationStyle.getOptions: return 5 animation styles with descriptions and cost multipliers
- [x] animationStyle.generatePreview: generate 3-5s preview clip for a style using best scene
- [x] animationStyle.select: select animation style
- [x] animationStyle.setMixing: per-scene style assignment (Studio only)

### Backend: Stage 4 - Environments
- [x] environments.extractLocations: Claude Haiku parses script for unique locations
- [x] environments.generateConceptArt: generate 16:9 concept art per location
- [x] environments.generateTimeVariant: generate day/night/dawn/dusk variant
- [x] environments.approve: approve location design
- [x] environments.setColorGrading: select color grading preset (warm/cool/vivid/muted/neon/pastel)
- [x] environments.setAtmosphericEffects: assign weather effects per scene

### Backend: Stage 5 - Production Config
- [x] productionConfig.setAspectRatio: 16:9, 9:16, 4:3, 2.35:1 (Studio)
- [x] productionConfig.setOpeningStyle: classic_anime_op, title_card, cold_open, custom (Studio)
- [x] productionConfig.setEndingStyle: credits_roll, still_frame, next_preview, none
- [x] productionConfig.setPacing: cinematic_slow, standard_tv, fast_dynamic
- [x] productionConfig.setSubtitles: languages, style, font_size, burned_in
- [x] productionConfig.setAudio: music_volume, sfx_volume, ducking_intensity

### Backend: Stage 6 - Final Review
- [x] review.getSummary: aggregate all config into review dashboard data
- [x] review.estimateCost: detailed cost breakdown with style multiplier
- [x] review.lock: lock config, save production_config JSON on project, redirect to pipeline

### Frontend: Pre-Production Stepper Layout
- [x] /studio/[projectId]/pre-production route with vertical stepper on left
- [x] Active step: accent-pink icon + bold text
- [x] Completed step: accent-cyan checkmark + regular text
- [x] Upcoming step: text-muted + lock icon
- [x] Click completed steps to go back and edit
- [x] Auto-save progress on every change
- [x] Mobile: stepper collapses to horizontal progress bar

### Frontend: Stage 1 - Character Gallery
- [x] Auto-generate character sheets on stage open
- [x] Full-width character sections with name (editable), role badge, Regenerate All button
- [x] 5-image grid per character (portrait, full body, 3/4, action, expressions)
- [x] Per-image: Approve, Regenerate, Edit Description buttons
- [x] Edit Description inline form with physical description + specific changes
- [x] Compare Versions toggle with side-by-side slider
- [x] Revert to Version X button
- [x] Per-character art style override (Change Style button)
- [x] Auto-LoRA training prompt after all views approved (Studio)
- [x] Approve All button per character (green border + lock icon when approved)
- [x] All characters must be approved to proceed

### Frontend: Stage 2 - Voice Casting
- [x] Voice casting card per character with portrait thumbnail + role badge
- [x] Tab 1: AI Voice Library with filter bar (gender, age, tone, accent) + voice sample cards
- [x] Audition with Script button (plays character dialogue in selected voice, 10 per character limit)
- [x] Cast This Voice button to confirm
- [x] Tab 2: Clone My Voice with drag-drop upload (Creator: 2, Studio: unlimited)
- [x] Tab 3: Skip Voice with auto-assignment display
- [x] Narrator voice section at bottom with toggle
- [x] Voice direction notes textarea per character
- [x] Voice Cast Summary table with Play Sample and Change buttons
- [x] Approve Voice Cast button to lock and proceed

### Frontend: Stage 3 - Animation Style
- [x] 5 animation style cards (Limited, Sakuga, Cel-Shaded 3D, Rotoscoping, Motion Comic)
- [x] Each card: name, description, mini video player (auto-loop), reference examples, cost indicator ($-$$$)
- [x] Only recommended style auto-generates preview, others show Generate Preview button
- [x] Selected card: accent-pink border + glow + Selected badge
- [x] Style Mixing toggle (Studio only) with scene-by-scene style assignment

### Frontend: Stage 4 - Environments
- [x] Location cards with generated concept art (16:9)
- [x] Time-of-day variant buttons: Day, Night, Dawn, Dusk
- [x] Edit Description textarea + Approve/Regenerate buttons
- [x] Color grading preset selector (6 options) with applied preview on actual manga panel
- [x] Atmospheric effects assignment per scene (rain, snow, fog, dust, sakura, fireflies)

### Frontend: Stage 5 - Production Config
- [x] Aspect ratio cards with visual preview (16:9, 9:16, 4:3, 2.35:1)
- [x] Opening style options with visual examples
- [x] Ending style options
- [x] Pacing cards with example clip descriptions
- [x] Subtitle config: language dropdown, style selector, font size, burned-in toggle
- [x] Audio preferences: music/SFX volume sliders, ducking intensity

### Frontend: Stage 6 - Final Review
- [x] Production summary dashboard with all decisions displayed
- [x] Characters grid with portraits, voice, Play Voice button, Edit link
- [x] Animation section with style preview + scene breakdown
- [x] Visual style section with art style, color grading, effects
- [x] Production section with compact key-value pairs
- [x] Cost estimation card with itemized breakdown and credit usage
- [x] Checkbox: 'I have reviewed all settings' (required)
- [x] Start Anime Production button (accent-gold, glow)
- [x] Confirmation modal with cost, time estimate, Start/Go Back

### Testing
- [x] Vitest: pre-production init and status procedures
- [x] Vitest: character sheet generation and approval flow
- [x] Vitest: character version history and revert
- [x] Vitest: voice library browsing and audition procedures
- [x] Vitest: animation style options and selection
- [x] Vitest: environment extraction and concept art generation
- [x] Vitest: production config update procedures
- [x] Vitest: cost estimation and lock procedures
- [x] All 277 tests passing across 14 test files with zero TypeScript errors

## Phase 16: Theme Song, OST & Music Pipeline

### Database Changes
- [x] Create music_tracks table (id, project_id FK, track_type ENUM opening/ending/bgm/stinger/custom, mood TEXT, title TEXT, lyrics TEXT, style_prompt TEXT, track_url TEXT, duration_seconds FLOAT, is_vocal BOOLEAN, is_loopable BOOLEAN, version_number INT DEFAULT 1, is_approved BOOLEAN DEFAULT false, is_user_uploaded BOOLEAN DEFAULT false, suno_generation_id TEXT, created_at)
- [x] Create music_versions table (id, music_track_id FK, version_number INT, track_url TEXT, style_prompt TEXT, refinement_notes TEXT, created_at)
- [x] Add music_config JSON column to pre_production_configs table
- [x] Migration SQL generated and applied

### Backend: Theme Concept & Lyrics
- [x] music.suggestThemeConcept: Claude Opus analyzes project and generates mood, genre, tempo, key themes, vocal suggestion, reference vibes, concept summary
- [x] music.generateLyrics: Claude Opus writes structured lyrics (intro/verse/pre-chorus/chorus/bridge/outro) with emotion markers
- [x] music.updateLyrics: save edited lyrics per section
- [x] music.generateAltLine: generate 3 alternative lines for a specific lyric line
- [x] music.rewriteSection: rewrite an entire lyrics section

### Backend: Song Generation & Refinement
- [x] music.generateTheme: call Suno API with lyrics + style to generate 3-5 variations (90s duration)
- [x] music.refineTheme: regenerate with modifier (more energetic, softer, speed up, etc.) - Creator: 3 cycles, Studio: 5
- [x] music.selectVersion: select a generated version as the chosen theme
- [x] music.confirmTheme: confirm as OP/ED with TV-size cut option (90s -> 60s smart trim)

### Backend: BGM/OST Generation
- [x] music.generateOst: Claude analyzes script moods, generates 8-12 instrumental BGM tracks via Suno
- [x] music.generateCustomTrack: user-described custom BGM track generation
- [x] music.generateStingers: auto-cut short stingers from BGM tracks (impact, suspense, emotional, comedy, transition)

### Backend: Scene Assignment & Track Management
- [x] music.assignSceneBgm: assign BGM track to scene with volume and offset
- [x] music.autoAssignScenes: Claude auto-maps scene moods to closest BGM tracks
- [x] music.getTracks: list all tracks for a project with filtering
- [x] music.approveTrack: approve a track
- [x] music.regenerateTrack: regenerate a specific track
- [x] music.getVersions: version history for a track
- [x] music.revertVersion: revert track to previous version
- [x] music.uploadTrack: user upload own music (Creator/Studio, 50MB max)
- [x] music.uploadLyricsOnly: user provides lyrics, AI generates music around them
- [x] music.saveMusicConfig: save full music config JSON to pre_production_configs

### Frontend: Music Studio Layout
- [x] Add Music Studio as Stage 3.5 in pre-production stepper (between Animation Style and Environments)
- [x] Three sub-tabs: Opening Theme, Ending Theme, Background Score
- [x] Tab navigation with active/completed indicators

### Frontend: Opening Theme Flow
- [x] Step 1: Theme concept card with mood/genre/tempo tags, concept summary, reference vibes
- [x] Use This Concept / Write My Own buttons
- [x] Custom concept form: description textarea, genre dropdown (9 options), vocal type, language selector
- [x] Step 2: Lyrics editor with structured sections (Intro/Verse/Pre-Chorus/Chorus/Bridge/Outro)
- [x] Emotion markers per section (building, explosive, soft, whispered, belted)
- [x] Inline line editing with alternative suggestions
- [x] Approve Lyrics button
- [x] Step 3: Musical style picker with 8 genre preset cards + Custom option
- [x] Tempo slider (80-200 BPM), energy curve selector, instrumentation toggles
- [x] Step 4: Audition player with 3 versions, waveform visualization, select button
- [x] Step 5: Refinement quick-edit buttons (8 modifiers) with A/B comparison
- [x] Confirm as Opening Theme with TV-size cut option

### Frontend: Ending Theme
- [x] Same flow as OP with softer defaults (ballad/lo-fi suggestions)
- [x] Quick preset: Instrumental version of OP
- [x] Skip option: Use BGM during credits

### Frontend: BGM Studio
- [x] Track list view with mood tags, audio players, duration, regenerate/approve buttons
- [x] Add Custom Track button with description textarea
- [x] Scene-to-BGM assignment table with auto-assign and manual override
- [x] Stinger library display with type labels and short audio players
- [x] Upload own music drag-drop area

### Testing
- [x] Vitest: theme concept suggestion procedure
- [x] Vitest: lyrics generation and editing procedures
- [x] Vitest: song generation and refinement procedures with tier limits
- [x] Vitest: OST generation and custom track procedures
- [x] Vitest: scene-BGM assignment procedures
- [x] Vitest: track management (approve, regenerate, versions, revert)
- [x] Vitest: upload procedures with size validation
- [x] Vitest: music config save/load
- [x] All tests passing with zero TypeScript errors

## Phase 17: Human-Reference Singing Voice Conversion

### Database Changes
- [x] Create vocal_recordings table: id, project_id FK, track_type ENUM('opening','ending'), raw_recording_url, isolated_vocal_url, converted_vocal_url, final_mix_url, target_voice_model, conversion_settings JSON, recording_mode ENUM('full_take','section_by_section'), section_recordings JSON, status ENUM('recording','processing','ready','approved'), created_at
- [x] Create rvc_voice_models table: id, name, gender, vocal_range, style_tags TEXT, model_url, index_url, sample_audio_url, is_active BOOLEAN DEFAULT true, created_at
- [x] Migration SQL generated and applied

### Backend: Performance Guide
- [x] vocalRecording.generatePerformanceGuide: Claude Haiku annotates lyrics with volume/emotion/technique markers per line and section
- [x] Performance annotations: volume (whisper/soft/medium/loud/belt), emotion (hopeful/angry/sad/joyful/desperate/triumphant), technique (hold note/quick notes/vibrato/breath before), energy curve per section

### Backend: Singing Voice Models
- [x] vocalRecording.listSingingVoices: browse 10-12 pre-trained RVC voice models with gender/range/style filters
- [x] vocalRecording.getVoicePreview: return sample audio URL for a voice model
- [x] Seed 10-12 diverse voice models (5 male, 5 female, 2 androgynous) with metadata

### Backend: Vocal Recording Procedures
- [x] vocalRecording.uploadRecording: receive user WAV, store on S3, create vocal_recordings row
- [x] vocalRecording.getRecordingStatus: poll processing status
- [x] vocalRecording.getBackingTrack: return instrumental-only version of the generated theme

### Backend: Voice Conversion Pipeline
- [x] vocalRecording.convertPerformance: Demucs separation -> RVC V2 conversion -> FFmpeg mixing pipeline
- [x] Demucs V4 vocal isolation (separate vocal from backing track bleed)
- [x] RVC V2 conversion (source vocal + target voice model, pitch_shift auto-detect, index_rate 0.75, f0_method rmvpe)
- [x] FFmpeg + SoX mastering (reverb, compression, de-ess, EQ, normalize to -14 LUFS)
- [x] Upload final mix to S3

### Backend: Section Re-recording & Mix Adjustment
- [x] vocalRecording.reRecordSection: replace one section, stitch, re-convert only that section
- [x] vocalRecording.adjustMix: vocal volume, reverb amount, backing track volume sliders (Studio only)
- [x] vocalRecording.approveVocal: mark vocal recording as approved, set as OP/ED track
- [x] 3 voice conversions per theme limit (try different AI voices)

### Backend: Tier Enforcement
- [x] Studio-only gate on all vocal recording/conversion procedures
- [x] Creator tier: Options A (AI generates) + B (clone) only
- [x] Free tier: no access to voice features

### Frontend: Vocal Option C Card
- [x] Third option card in Music Studio vocal selection: 'Record Your Performance'
- [x] Studio Exclusive badge (accent-gold)
- [x] Description: 'You sing with emotions, AI transforms your voice'
- [x] Lock icon + upgrade prompt for non-Studio users

### Frontend: Performance Guide Lyrics Sheet
- [x] Karaoke-style lyrics display with section labels and colored energy bars
- [x] Inline annotation badges: [soft], [belt], [hopeful], [hold note], etc.
- [x] Emotion icons in right margin for quick scanning
- [x] Energy curve visualization per section
- [x] Download as PDF button

### Frontend: Recording Studio UI
- [x] Full-width dark recording interface with studio feel
- [x] Scrolling lyrics display (karaoke style, current line highlighted in accent-pink)
- [x] Real-time waveform visualization of user's voice (Web Audio API)
- [x] Record/Play/Re-record/Re-record Section controls
- [x] Full Take vs Section-by-Section recording mode toggle
- [x] Metronome toggle, input device selector, monitor toggle
- [x] Tips overlay before first recording (headphones, quiet room, etc.)
- [x] Volume meter (VU meter style)

### Frontend: AI Voice Selection Grid
- [x] 10-12 singing voice cards with name, gender, vocal range, style tags
- [x] Preview button per card (plays 10s sample)
- [x] Selected card: accent-gold border + glow
- [x] 'Convert My Performance' button after selection

### Frontend: Conversion Processing & Comparison
- [x] Processing state with pipeline step indicators (Isolating -> Converting -> Mixing)
- [x] Three-way comparison player: Your Recording / AI-Only / Your Performance + AI Voice
- [x] Highlighted 'Your emotion, AI voice' label on hybrid version
- [x] Actions: Use This Version, Try Different Voice, Re-record, Adjust Mix
- [x] Advanced mix sliders (vocal volume, reverb, backing track volume) - Studio only

### Frontend: Section Re-recording
- [x] Waveform with section markers (Intro, Verse 1, Chorus, etc.)
- [x] Click section to highlight and re-record just that section
- [x] Selective conversion on re-recorded section only

### Testing
- [x] Vitest: performance guide generation procedure
- [x] Vitest: singing voice models list and preview
- [x] Vitest: vocal recording upload and status procedures
- [x] Vitest: voice conversion pipeline procedures
- [x] Vitest: section re-recording and mix adjustment
- [x] Vitest: tier enforcement (Studio-only gate)
- [x] Vitest: RVC voice model constants validation
- [x] All tests passing with zero TypeScript errors

## Bug Fixes
- [x] Fix Create page: after signing up, 'Generate Now' does not proceed further (prompt persisted in sessionStorage, auto-triggers generation after login)
- [x] Fix OAuth callback error: reverted redirect URI to clean state (no query params), moved returnPath to sessionStorage, added post-login redirect hook in App.tsx Router that checks sessionStorage and navigates to stored path after OAuth callback
- [x] Fix OAuth login loop: added trust proxy to Express server, auth attempt counter to prevent infinite loops, auth error modal with "Clear Session & Retry" and "Try Signing In Again" options, clearSession endpoint to clear stale cookies
- [x] Allow guest generation: changed quickCreate.start to publicProcedure, added getOrCreateGuestUser for unauthenticated users
- [x] Require sign-up only when user wants to download/save: publish endpoint remains protectedProcedure
- [x] Remove auth modal and auth loop logic from Create page Generate button

## Landing Page Demo Section Overhaul
- [x] Replace broken 'See It In Action' section with polished DemoShowcase component
- [x] Generate 5 AI demo images: prompt UI, manga panels, customize styles, pipeline, anime result
- [x] Build animated image slideshow with 5 slides showing platform workflow
- [x] Add smooth crossfade transitions (800ms) with auto-advance (5s per slide)
- [x] Add dot navigation indicators below slideshow (active dot stretches wider)
- [x] Add step indicator row: Write → Generate → Customize → Produce → Watch (with icons)
- [x] Add CTA section below demo with 'Start Creating — Free' button
- [x] Style demo container: max-w-6xl, rounded-2xl, accent-pink/purple glow border, shadow
- [x] Mobile optimization: touch swipe support, responsive sizing, scrollable step indicators
- [ ] Bandwidth detection: skip heavy assets on slow connections (deferred — images use compressed WebP)
- [ ] Device mockup frame for slideshow screenshots (deferred — clean borderless look preferred)
