# Change 11 — UI Improvements Batch

## Blocking Changes (1-4)
1. **Rogue pink "Get Started" button** — find in MarketingLayout or shared components, swap from #E94560/#FF6B81 gradient to bg-opening-sequence
2. **AWAKLI wordmark in MarketingLayout** — still 16px Inter 400, needs font-black text-[18px] uppercase tracking-[0.08em] text-gradient-opening (the TopNav was fixed but MarketingLayout may have a separate instance)
3. **Icon size ladder cleanup** — eliminate 14/15/19/31/38px outliers, standardize to 16/20/24/96 scale
4. **Stroke-weight refinement** — all w-4/w-5 icons get strokeWidth={1.5}, w-6 gets 1.75, keep 2 only for w-8+

## Smaller Residuals (non-blocking)
5. AI chip radius: change rounded-2xl to rounded-[14px] for game UI feel
6. Corner sigils: cycle colors (tl cyan, tr indigo, br magenta, bl gold)
7. ANIME accent: add second concentric bloom text-shadow: 0 0 60px rgba(0,240,255,0.3)
