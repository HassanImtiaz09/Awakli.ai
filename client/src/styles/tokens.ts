/**
 * Awakli Design Token System
 * ─────────────────────────────────────────────────────────────
 * Single source of truth for the visual language.
 * Every downstream component references these tokens —
 * no hex literals in JSX beyond logo SVG and loading shimmer.
 *
 * Tokens are registered as:
 *   1. Typed TS exports  → import { colors, radii } from '@/styles/tokens'
 *   2. Tailwind theme extensions  → bg-violet, rounded-card, shadow-hover
 *   3. CSS custom properties  → var(--token-cyan), animatable by Framer Motion
 */

// ─── Colors ────────────────────────────────────────────────────

export const colors = {
  /** Primary brand cyan — highlights, links, interactive focus */
  cyan:     '#00F0FF',
  /** Primary brand violet — buttons, accents, primary actions */
  violet:   '#6B5BFF',
  /** Secondary lavender — soft accents, tags, secondary surfaces */
  lavender: '#B388FF',
  /** Accent gold — badges, warnings, premium indicators */
  gold:     '#FFD60A',
  /** Accent magenta — hearts, votes, destructive-adjacent */
  magenta:  '#FF2D7A',
  /** Accent mint — success states, confirmations */
  mint:     '#00E5A0',
  /** Deep ink — primary dark surface, body background */
  ink:      '#0B0B18',
  /** Paper — light surface for inverse / light mode contexts */
  paper:    '#F7F7FB',
} as const;

export type TokenColor = keyof typeof colors;

// ─── Radii ─────────────────────────────────────────────────────

export const radii = {
  /** Compact elements: pills, chips, small tags */
  chip:  '14px',
  /** Standard cards, modals, popovers */
  card:  '28px',
  /** Large sheets, bottom drawers, hero panels */
  sheet: '36px',
  /** Fully circular: avatars, icon buttons, sigils */
  sigil: '999px',
} as const;

export type TokenRadius = keyof typeof radii;

// ─── Type Scale ────────────────────────────────────────────────

export const typeScale = {
  'display-hero': { fontSize: '72px', lineHeight: '80px',  fontWeight: 900 },
  'display-md':   { fontSize: '56px', lineHeight: '64px',  fontWeight: 800 },
  'h1':           { fontSize: '40px', lineHeight: '48px',  fontWeight: 700 },
  'h2':           { fontSize: '28px', lineHeight: '36px',  fontWeight: 600 },
  'body':         { fontSize: '16px', lineHeight: '26px',  fontWeight: 400 },
  'micro':        { fontSize: '12px', lineHeight: '16px',  fontWeight: 500 },
} as const;

export type TokenTypeScale = keyof typeof typeScale;

// ─── Elevations (Box Shadows) ──────────────────────────────────

export const elevations = {
  /** Default resting state — subtle depth */
  rest:   '0 1px 2px rgba(11, 11, 24, 0.08)',
  /** Hovered / focused — violet glow lift */
  hover:  '0 6px 24px rgba(107, 91, 255, 0.20)',
  /** Active / pressed — deeper violet glow */
  active: '0 10px 36px rgba(107, 91, 255, 0.30)',
} as const;

export type TokenElevation = keyof typeof elevations;

// ─── Focus Ring ────────────────────────────────────────────────

export const focusRing = {
  /** Conic gradient 220deg from cyan → violet → magenta at 90% stop */
  gradient: 'conic-gradient(from 220deg, #00F0FF, #6B5BFF, #FF2D7A 90%, #00F0FF)',
  /** Width of the focus ring border */
  width: '2px',
  /** Offset from the element edge */
  offset: '3px',
} as const;

// ─── Surface Variants ──────────────────────────────────────────

export const surfaces = {
  /** Default — dark cinema surface (standard pages) */
  default: {
    background: '#0B0B18',
    foreground: '#F0F0F5',
    muted:      '#5C5C7A',
  },
  /** Inverse — light surface for contrast panels */
  inverse: {
    background: '#F7F7FB',
    foreground: '#0B0B18',
    muted:      '#6B6B8A',
  },
  /** Cinema — extra-dark for video review, immersive contexts */
  cinema: {
    background: '#05050C',
    foreground: '#F0F0F5',
    muted:      '#5C5C7A',
  },
} as const;

export type TokenSurface = keyof typeof surfaces;

// ─── Gradients ─────────────────────────────────────────────────

export const gradients = {
  opening:  `linear-gradient(135deg, ${colors.cyan} 0%, ${colors.violet} 55%, ${colors.lavender} 100%)`,
  heat:     `linear-gradient(135deg, ${colors.gold} 0%, #FF8A00 50%, ${colors.magenta} 100%)`,
  night:    `linear-gradient(135deg, ${colors.cyan}, ${colors.violet})`,
  sakuga:   `linear-gradient(90deg, ${colors.mint}, ${colors.cyan})`,
  moonrise: `linear-gradient(180deg, #05050C, #151528)`,
} as const;

// ─── Tailwind-Compatible Exports ───────────────────────────────
// These objects can be spread directly into tailwind.config.ts theme.extend

export const tailwindColors = {
  'token-cyan':     colors.cyan,
  'token-violet':   colors.violet,
  'token-lavender': colors.lavender,
  'token-gold':     colors.gold,
  'token-magenta':  colors.magenta,
  'token-mint':     colors.mint,
  'token-ink':      colors.ink,
  'token-paper':    colors.paper,
} as const;

export const tailwindBorderRadius = {
  chip:  radii.chip,
  card:  radii.card,
  sheet: radii.sheet,
  sigil: radii.sigil,
} as const;

export const tailwindFontSize = {
  'display-hero': [typeScale['display-hero'].fontSize, { lineHeight: typeScale['display-hero'].lineHeight }] as [string, { lineHeight: string }],
  'display-md':   [typeScale['display-md'].fontSize,   { lineHeight: typeScale['display-md'].lineHeight }]   as [string, { lineHeight: string }],
  'token-h1':     [typeScale['h1'].fontSize,            { lineHeight: typeScale['h1'].lineHeight }]            as [string, { lineHeight: string }],
  'token-h2':     [typeScale['h2'].fontSize,            { lineHeight: typeScale['h2'].lineHeight }]            as [string, { lineHeight: string }],
  'token-body':   [typeScale['body'].fontSize,          { lineHeight: typeScale['body'].lineHeight }]          as [string, { lineHeight: string }],
  'token-micro':  [typeScale['micro'].fontSize,         { lineHeight: typeScale['micro'].lineHeight }]         as [string, { lineHeight: string }],
} as const;

export const tailwindBoxShadow = {
  rest:   elevations.rest,
  hover:  elevations.hover,
  active: elevations.active,
} as const;

// ─── All Tokens (convenience re-export) ────────────────────────

const tokens = {
  colors,
  radii,
  typeScale,
  elevations,
  focusRing,
  surfaces,
  gradients,
} as const;

export default tokens;
