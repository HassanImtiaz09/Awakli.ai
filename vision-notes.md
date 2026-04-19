# Awakli Vision & Transformation — Implementation Notes

## Scope: Q1 Foundation (what to implement now)

### 1. Design System Rewrite (§3.1)
**Palette:**
- Void: #05050C (deepest black, page ambient)
- Ink: #0D0D1A (surface default, cards/panels)
- Twilight: #151528 (elevated surface, modals/nav)
- Kaelis Pink: #E94560 (primary accent, CTAs, logo) — KEEP existing
- Sakura: #FF5A7A (hover/secondary accent)
- Neon Cyan: #00D4FF (tech signalling, auth, links)
- Dragon Jade: #00FFB2 (success states, live indicators)
- Royal Violet: #7C3AED (premium tier, Studio accents)
- Ember: #FF8A3D (danger/energy, warnings)
- Bone: #F0F0F5 (primary text on dark)
- Smoke: #9494B8 (secondary text)

**Gradients:**
- Opening Sequence: Pink #E94560 → Violet #7C3AED at 45° (hero headline, primary CTA bg)
- Night Market: Cyan #00D4FF → Pink #E94560 at 135° (tier cards, feature highlights)
- Moonrise: Void #05050C → Twilight #151528 (page bg, hero vignette)
- Sakuga Glow: Jade #00FFB2 → Cyan #00D4FF at 90° (live indicators, success toasts)

**Typography:**
- Display: Zen Kaku Gothic New — 120px+ hero, -0.02em letter-spacing
- UI: Inter or Geist Sans
- Accent/Mono: JetBrains Mono — timestamps, stats, credit counts

**Motion Language (Framer Motion):**
- Entry (0-400ms): fade up, 24px y-translate, scale 0.96→1
- Hover (120ms): 1.02 scale, brightness +8%, shadow lift
- Beat (200ms): chromatic aberration flash + 60ms x-shake (Generate, Vote, Publish)
- Exit (0-200ms): slide out same axis, faster than entry

### 2. Landing Page Three-Act Sequence (§3.2)
**Act One — The Hook (above fold):**
- Full-viewport hero with anime character art/video
- Headline 120px: "Tonight, your idea becomes anime."
- Subhead: "Type a sentence. We will animate it. Before you go to bed."
- Single CTA: "Write the first scene" in Opening Sequence gradient
- Scroll indicator animating 24px up-down

**Act Two — Proof (5 scroll sections):**
1. "From a sentence." — animated typewriter + panels materializing
2. "To a character." — Character Creator time-lapse
3. "To a world." — Six world-setting tiles
4. "To a story voted on by thousands." — Live leaderboard
5. "To anime." — Before/after slider (manga → video)
- Each section: chromatic aberration cut on viewport entry

**Act Three — Invitation:**
- Creator cards grid (real people, real characters, real earnings)
- "This could be you next Friday."
- Lightweight prompt box on landing page
- Marquee footer with links + logo + social

### 3. Navigation Collapse (§3.3)
Four tabs: Feed | Create | Codex | Compete
- Desktop: left-rail vertical nav with icons + text
- Mobile: bottom tab bar, four icons, no text
- Active: Opening Sequence gradient under icon
- Pricing behind account menu + contextual upgrade prompts

### 4. Copy Rewrites (§10)
- Hero: "Tonight, your idea becomes anime."
- Sub: "Type a sentence. We will animate it. Before you go to bed."
- CTA: "Write the first scene"
- Free tier: "Start telling stories. Feel what creation feels like."
- Creator tier: "Become the animator you were always going to be."
- Studio tier: "Run the studio. Ship the universe."
- Empty state: "The director is scouting locations..."
- Generating: "Frame 01 is inking. Frame 02 is loading voice. Hold."
- Vote CTA: "Your vote is a casting decision."
- Publish success: "The curtain's up. Your manga is live."

### 5. Micro-interactions (§3.8)
- Character card hover: foil shimmer follows mouse, 4° parallax tilt
- Button hover: sakura-petal trail (2-3 petals, 200ms)
- Vote click: heart pulse, chromatic aberration flash, +1 spring-bounce
- Panel generated: camera-shutter flash 80ms, scale from 0.94
- Toast: Sakuga Glow, auto-dismiss 2s
- Error: 6px horizontal shake 200ms, border flash Ember
- Upload progress: Opening Sequence gradient bar, Dragon Jade glow head
- Scroll anchor: 400ms gradient sweep underline
- Keyboard focus: 2px Cyan outline + 8px Cyan glow
- Empty state: animated character silhouette waving

### 6. Pricing Page (§3.7)
Three narrative scenes, not boxes:
- Free: character with sketchbook, "Start telling stories..."
- Creator: character in colour with episode banner, "Become the animator..."
- Studio: character on director's chair with side-characters, "Run the studio..."
- Each scene 70vh tall
- Comparison table + FAQ below
- Refund policy card under each tier

### 7. Create Flow (§3.4)
- Full-viewport canvas, dark, soft character silhouette behind
- Prompt textarea 60vw, centred, glass card
- Rotating placeholder prompts with typewriter effect (8 prompts, 4s rotation)
- Cyan blinking cursor
- Generation: theatrical production sequence (script streams left, panels appear right)
- First-panel reveal: 400ms chromatic aberration + celebration particles (sakura)

### 8. Accessibility (§3.10)
- WCAG AA contrast ratios
- prefers-reduced-motion: fade-only fallbacks
- Video loops: aria-hidden poster, pause toggle
- Keyboard nav: Tab reachable, focus order = visual order, skip-to-main
- Auto-generated alt-text for panels
