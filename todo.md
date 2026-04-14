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
