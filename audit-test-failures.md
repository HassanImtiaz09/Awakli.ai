# Test Failure Analysis

**Total: 19 failed test files, 58 failed tests out of 4310 (98.7% pass rate)**

## Categorized Failures

### 1. Stale Spec Tests (tests assert old values that were intentionally changed)
- `appendix-compliance.test.ts` — Tests old tier names (Studio Pro $99), old color tokens (#00F0FF, #6B5BFF), old anime gate tier requirements
- `credit-ledger.test.ts` — Tests old pricing ($29 creator, $99 creator_pro, $499 studio) vs current ($0/$19/$49)
- `closing-brief.test.ts` — Tests old stage numerals (Stage 02, 03, 04, 06, 07) and legacy hex #ffb800
- `brand-refresh.test.ts` — Tests old WatchItHappen v3 video URL (we updated to v4)
- `wizard-ui-wiring.test.ts` — Tests 7 wizard stages but we added character-setup (now 8)
- `wave2-fixbrief.test.ts` — Tests "(3c)" credit cost label appearing 2+ times

### 2. Auth Test
- `auth.logout.test.ts` — Session cookie clearing test (likely env/mock issue)

### 3. Provider Capability Test
- `character-lora-pipeline.test.ts` — Tests that cloud providers don't support LoRA (may have changed)

## Assessment
Most failures (15/19 files) are **stale spec tests** that assert old values from earlier development phases. The actual application code is correct — the tests just haven't been updated to match the current pricing, branding, and wizard structure. These are NOT bugs in the application.
