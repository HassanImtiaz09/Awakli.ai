# Delta Audit v1.3 — Key Findings

## VERDICT: NOT CLEARED FOR DOMAIN LINK

## CRIT-1 (BLOCKING): sdk.ts decodeState incompatible with nonce payload
- oauth-nonce.ts encodes state as: Buffer.from(JSON.stringify({ nonce, redirectUri })).toString("base64url")
- sdk.ts still has old: atob(state) → returns the full JSON string as redirectUri
- Token exchange sends JSON string as redirect_uri → provider rejects → sign-in broken
- FIX: Update sdk.ts decodeState to parse JSON payload and return only redirectUri field
- REQUIRED TEST: encodeState → sdk.exchangeCodeForToken → assert redirectUri is plain URL not JSON

## MED-1: Idempotency cleanup gated behind ENABLE_CANARIES
- cleanupExpiredIdempotency runs inside canary scheduler which is gated by ENABLE_CANARIES
- In production ENABLE_CANARIES will be unset → image_idempotency never pruned
- FIX: Extract separate startIdempotencyCleanupScheduler() running every 15min unconditionally

## LOW-1: Structured logger migration incomplete
- Only stripe/webhook.ts migrated, 378 console.* calls remain
- Top offenders: pipelineOrchestrator.ts (74), video-assembly.ts (22), lipSyncNode.ts (20)
- Don't mark L-5/L-6 as closed yet

## LOW-2: delta-audit.test.ts uses hardcoded absolute paths
- /home/ubuntu/awakli/... paths will fail in CI outside Manus sandbox
- FIX: Use path.resolve(__dirname, '../client/...') or require.resolve

## P2: Extract TIER_HIERARCHY into shared module (two copies exist in trpc.ts and pipelineOrchestrator.ts)

## Action Priority:
- P0: Fix CRIT-1 sdk.ts decodeState (≤30min) — BLOCKER
- P0: Add integration test for state round-trip (≤30min) — BLOCKER
- P1: MED-1 separate idempotency cleanup scheduler (≤1hr)
- P1: LOW-2 fix hardcoded paths in tests (≤30min)
- P2: LOW-1 continue structured logger migration (1 day)
- P2: Extract TIER_HIERARCHY to shared module (≤30min)
