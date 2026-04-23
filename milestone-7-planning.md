# Milestone 7 Planning Notes

## Already Implemented
- HITL Gate Architecture: 12 modules in server/hitl/, 6 tRPC routers, orchestrator bridge, cron scheduler, SSE handler
- HITL Frontend: PendingGatesBanner.tsx with gate review cards
- Pipeline Orchestrator: HITL gates at video_gen, voice_gen, music_gen, foley/ambient, assembly stages
- Publish Router: publish/unpublish/checkEligibility in routers-public-content.ts
- Export Modal: ExportModal.tsx with manga/anime tabs including SRT format
- Subtitle Config: preProductionConfigs.subtitleConfig JSON field exists
- Stream Delivery: Milestone 6 complete with Cloudflare Stream integration

## What's Missing (Gaps in the Pipeline)
1. **SRT/Subtitle Generation Service** — No actual subtitle generation from slice dialogue timecodes
2. **Subtitle Burn-in** — No FFmpeg subtitle overlay during assembly
3. **Anime Publish Flow** — publish.tsx is manga-only ("Publish your manga"), no anime episode publish
4. **Post-Assembly Review Page** — video.tsx has review state but no dedicated quality review with per-slice approval
5. **Episode Player Page** — No public-facing anime episode player using Cloudflare Stream embed
6. **Batch Operations** — No batch assembly/delivery for multi-episode projects

## Recommended Next Milestone: SRT Subtitle Generation + Anime Publish Flow
This bridges the gap between assembly/stream delivery and public consumption:
1. Generate SRT from slice dialogue timecodes
2. Optionally burn subtitles into assembled video
3. Serve SRT as a separate track via Cloudflare Stream
4. Create anime episode publish flow (extend existing manga publish)
5. Create public anime episode player page with Cloudflare Stream embed
