import { colors, radii, typeScale, elevations, focusRing, surfaces, gradients } from "@/styles/tokens";

// ─── Swatch Grid ───────────────────────────────────────────────

function ColorSwatch({ name, hex }: { name: string; hex: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className="w-full aspect-square rounded-card border border-white/10 shadow-rest"
        style={{ backgroundColor: hex }}
      />
      <div>
        <p className="text-sm font-semibold text-token-paper">{name}</p>
        <p className="text-xs text-token-paper/50 font-mono">{hex}</p>
      </div>
    </div>
  );
}

// ─── Type Scale Preview ────────────────────────────────────────

function TypeScaleRow({ name, spec }: { name: string; spec: { fontSize: string; lineHeight: string; fontWeight: number } }) {
  return (
    <div className="flex items-baseline gap-6 py-4 border-b border-white/5">
      <div className="w-40 shrink-0">
        <p className="text-xs font-mono text-token-paper/50">{name}</p>
        <p className="text-xs text-token-paper/30">
          {spec.fontSize} / {spec.lineHeight} · w{spec.fontWeight}
        </p>
      </div>
      <p
        className="text-token-paper font-sans"
        style={{
          fontSize: spec.fontSize,
          lineHeight: spec.lineHeight,
          fontWeight: spec.fontWeight,
        }}
      >
        The quick brown fox
      </p>
    </div>
  );
}

// ─── Radius Preview ────────────────────────────────────────────

function RadiusPreview({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="w-24 h-24 bg-token-violet/20 border-2 border-token-violet"
        style={{ borderRadius: value }}
      />
      <div className="text-center">
        <p className="text-sm font-semibold text-token-paper">{name}</p>
        <p className="text-xs font-mono text-token-paper/50">{value}</p>
      </div>
    </div>
  );
}

// ─── Elevation Preview ─────────────────────────────────────────

function ElevationPreview({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="w-32 h-20 bg-[#151528] rounded-card"
        style={{ boxShadow: value }}
      />
      <div className="text-center">
        <p className="text-sm font-semibold text-token-paper">{name}</p>
        <p className="text-xs font-mono text-token-paper/50 max-w-[200px] break-all">{value}</p>
      </div>
    </div>
  );
}

// ─── Surface Variant Preview ───────────────────────────────────

function SurfacePreview({ name, surface }: { name: string; surface: { background: string; foreground: string; muted: string } }) {
  return (
    <div
      className="p-6 rounded-card border border-white/10"
      style={{ backgroundColor: surface.background }}
    >
      <p className="text-sm font-semibold mb-2" style={{ color: surface.foreground }}>{name}</p>
      <p className="text-sm" style={{ color: surface.foreground }}>Foreground text on this surface</p>
      <p className="text-sm mt-1" style={{ color: surface.muted }}>Muted text on this surface</p>
      <div className="flex gap-2 mt-3">
        <span className="text-xs font-mono px-2 py-0.5 rounded-chip" style={{ backgroundColor: surface.foreground + '15', color: surface.foreground }}>
          bg: {surface.background}
        </span>
        <span className="text-xs font-mono px-2 py-0.5 rounded-chip" style={{ backgroundColor: surface.foreground + '15', color: surface.foreground }}>
          fg: {surface.foreground}
        </span>
      </div>
    </div>
  );
}

// ─── Gradient Preview ──────────────────────────────────────────

function GradientPreview({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className="w-full h-16 rounded-card border border-white/10"
        style={{ background: value }}
      />
      <p className="text-sm font-semibold text-token-paper">{name}</p>
    </div>
  );
}

// ─── Focus Ring Preview ────────────────────────────────────────

function FocusRingPreview() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold text-token-paper">Focus Ring</p>
      <div className="relative inline-flex w-fit">
        <div
          className="absolute inset-0 rounded-card"
          style={{
            background: focusRing.gradient,
            padding: focusRing.width,
            margin: `-${focusRing.offset}`,
            borderRadius: 'calc(28px + 3px)',
          }}
        />
        <div className="relative bg-[#151528] rounded-card px-8 py-4 text-token-paper text-sm">
          Focused element
        </div>
      </div>
      <p className="text-xs font-mono text-token-paper/50">
        conic-gradient(from 220deg, cyan → violet → magenta 90%)
      </p>
    </div>
  );
}

// ─── Tailwind Class Verification ───────────────────────────────

function TailwindClassGrid() {
  const classes = [
    { label: 'bg-token-cyan', className: 'bg-token-cyan' },
    { label: 'bg-token-violet', className: 'bg-token-violet' },
    { label: 'bg-token-lavender', className: 'bg-token-lavender' },
    { label: 'bg-token-gold', className: 'bg-token-gold' },
    { label: 'bg-token-magenta', className: 'bg-token-magenta' },
    { label: 'bg-token-mint', className: 'bg-token-mint' },
    { label: 'bg-token-ink', className: 'bg-token-ink border border-white/20' },
    { label: 'bg-token-paper', className: 'bg-token-paper' },
  ];

  return (
    <div>
      <p className="text-sm font-semibold text-token-paper mb-3">Tailwind Utility Verification</p>
      <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
        {classes.map((c) => (
          <div key={c.label} className="flex flex-col items-center gap-1">
            <div className={`w-12 h-12 rounded-chip ${c.className}`} />
            <p className="text-[10px] font-mono text-token-paper/50 text-center">{c.label}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-3 mt-4">
        <div className="rounded-chip bg-token-violet/20 border border-token-violet px-4 py-2 text-xs text-token-paper font-mono">rounded-chip</div>
        <div className="rounded-card bg-token-violet/20 border border-token-violet px-4 py-2 text-xs text-token-paper font-mono">rounded-card</div>
        <div className="rounded-sheet bg-token-violet/20 border border-token-violet px-4 py-2 text-xs text-token-paper font-mono">rounded-sheet</div>
        <div className="rounded-sigil bg-token-violet/20 border border-token-violet w-10 h-10 flex items-center justify-center text-xs text-token-paper font-mono">sigil</div>
      </div>
      <div className="flex gap-3 mt-4">
        <div className="shadow-rest bg-[#151528] rounded-card px-4 py-2 text-xs text-token-paper font-mono">shadow-rest</div>
        <div className="shadow-hover bg-[#151528] rounded-card px-4 py-2 text-xs text-token-paper font-mono">shadow-hover</div>
        <div className="shadow-active bg-[#151528] rounded-card px-4 py-2 text-xs text-token-paper font-mono">shadow-active</div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────

export default function DebugTokens() {
  return (
    <div className="min-h-screen bg-token-ink text-token-paper p-8 md:p-12 max-w-6xl mx-auto">
      <header className="mb-12">
        <p className="text-xs font-mono text-token-cyan mb-2 tracking-widest uppercase">Debug / Tokens</p>
        <h1 className="text-display-hero font-display font-black text-token-paper leading-tight">
          Awakli Design Tokens
        </h1>
        <p className="text-token-body text-token-paper/60 mt-3 max-w-2xl">
          Single source of truth for the visual language. Import from{' '}
          <code className="text-token-cyan font-mono text-sm">@/styles/tokens</code>.
          Every token is available as a typed TS export, a Tailwind utility class, and a CSS custom property.
        </p>
      </header>

      {/* ── Colors ── */}
      <section className="mb-16">
        <h2 className="text-token-h2 font-display font-bold mb-6 text-token-cyan">Colors</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-4">
          {Object.entries(colors).map(([name, hex]) => (
            <ColorSwatch key={name} name={name} hex={hex} />
          ))}
        </div>
      </section>

      {/* ── Tailwind Verification ── */}
      <section className="mb-16">
        <h2 className="text-token-h2 font-display font-bold mb-6 text-token-violet">Tailwind Classes</h2>
        <TailwindClassGrid />
      </section>

      {/* ── Type Scale ── */}
      <section className="mb-16">
        <h2 className="text-token-h2 font-display font-bold mb-6 text-token-lavender">Type Scale</h2>
        <div className="overflow-x-auto">
          {Object.entries(typeScale).map(([name, spec]) => (
            <TypeScaleRow key={name} name={name} spec={spec} />
          ))}
        </div>
      </section>

      {/* ── Radii ── */}
      <section className="mb-16">
        <h2 className="text-token-h2 font-display font-bold mb-6 text-token-gold">Radii</h2>
        <div className="flex flex-wrap gap-8">
          {Object.entries(radii).map(([name, value]) => (
            <RadiusPreview key={name} name={name} value={value} />
          ))}
        </div>
      </section>

      {/* ── Elevations ── */}
      <section className="mb-16">
        <h2 className="text-token-h2 font-display font-bold mb-6 text-token-magenta">Elevations</h2>
        <div className="flex flex-wrap gap-8">
          {Object.entries(elevations).map(([name, value]) => (
            <ElevationPreview key={name} name={name} value={value} />
          ))}
        </div>
      </section>

      {/* ── Surfaces ── */}
      <section className="mb-16">
        <h2 className="text-token-h2 font-display font-bold mb-6 text-token-mint">Surface Variants</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(surfaces).map(([name, surface]) => (
            <SurfacePreview key={name} name={name} surface={surface} />
          ))}
        </div>
      </section>

      {/* ── Gradients ── */}
      <section className="mb-16">
        <h2 className="text-token-h2 font-display font-bold mb-6 text-token-cyan">Gradients</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {Object.entries(gradients).map(([name, value]) => (
            <GradientPreview key={name} name={name} value={value} />
          ))}
        </div>
      </section>

      {/* ── Focus Ring ── */}
      <section className="mb-16">
        <h2 className="text-token-h2 font-display font-bold mb-6 text-token-violet">Focus Ring</h2>
        <FocusRingPreview />
      </section>

      {/* ── CSS Variable Reference ── */}
      <section className="mb-16">
        <h2 className="text-token-h2 font-display font-bold mb-6 text-token-gold">CSS Variable Reference</h2>
        <div className="bg-[#0D0D1A] rounded-card p-6 border border-white/5 overflow-x-auto">
          <pre className="text-xs font-mono text-token-paper/70 leading-relaxed whitespace-pre">
{`/* Colors */
var(--token-cyan)       → ${colors.cyan}
var(--token-violet)     → ${colors.violet}
var(--token-lavender)   → ${colors.lavender}
var(--token-gold)       → ${colors.gold}
var(--token-magenta)    → ${colors.magenta}
var(--token-mint)       → ${colors.mint}
var(--token-ink)        → ${colors.ink}
var(--token-paper)      → ${colors.paper}

/* Radii */
var(--token-radius-chip)   → ${radii.chip}
var(--token-radius-card)   → ${radii.card}
var(--token-radius-sheet)  → ${radii.sheet}
var(--token-radius-sigil)  → ${radii.sigil}

/* Elevations */
var(--token-shadow-rest)   → ${elevations.rest}
var(--token-shadow-hover)  → ${elevations.hover}
var(--token-shadow-active) → ${elevations.active}

/* Surfaces (contextual — change with .surface-inverse / .surface-cinema) */
var(--token-surface-bg)
var(--token-surface-fg)
var(--token-surface-muted)`}
          </pre>
        </div>
      </section>
    </div>
  );
}
