# Beta Audit Delta v1.2 — Key Findings

## Blocking Items (must fix before domain link)

1. **Deployment gap** — preview URL still serving pre-remediation build (just needs republish)
2. **H-9 OAuth state CSRF** — server/_core/sdk.ts still uses atob(state) to recover redirect_uri. State is base64-encoded redirect URI, not a random nonce bound to session cookie. Must replace with session-bound nonce.
3. **L-7 Documentation** — No README.md, CONTRIBUTING.md, or RUNBOOK.md at repo root.

## Must Fix Before Launch

4. **M-3 Kling version drift** — Home.tsx line 726 still says "Kling 2.1", should be "Kling V3" or similar
5. **L-2 Social handles** — Footer still hard-codes unclaimed social URLs
6. **H-8 requireTier middleware** — No requireTier export exists. pipelineOrchestrator.ts line 220 still has "TODO: wire to actual tier check"

## Regressions / Cleanup

7. **AnimatedCounter dead code** — Home.tsx defines but never calls AnimatedCounter. Delete it.
8. **env.ts ownerOpenId retained** — Still in ENV object as optional. Remove entirely.
9. **Idempotency table growth** — cleanupExpiredIdempotency exported but never invoked. Need cleanup scheduler.
10. **Canary scheduler runs in every process** — Add ENABLE_CANARIES env guard before scaling.
11. **L-4 console.log artefacts** — Some callsites not migrated to structured logger.
12. **L-5 pino** — Custom logger, not real pino package. Trivial swap.
13. **L-6 OpenTelemetry** — Zero OTel imports. In-memory metrics only.

## Decisions Needed (can defer)

- H-5: LLM-as-judge vs real ArcFace (acceptable for MVP)
- M-12: /create reachable by anonymous users (deliberate design choice — keep as-is)
- L-6: OTel instrumentation (defer to post-beta)
- M-10: C2PA provenance (defer to launch-ready phase)
