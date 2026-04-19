# Awakli Operations Runbook

## Deployment

### Standard Deploy
1. Save a checkpoint via `webdev_save_checkpoint`
2. Click **Publish** in the Management UI header
3. Verify the health endpoint: `GET /api/health` returns `{ status: "ok" }`

### Rollback
1. Open **Management UI → More (⋯) → Version history**
2. Select the target checkpoint and click **Rollback**
3. Or use `webdev_rollback_checkpoint` with the version ID

## KEK (Key Encryption Key) Rotation

The KEK is derived from `JWT_SECRET` via SHA-256. To rotate:

1. **Schedule a maintenance window** — all active sessions will be invalidated
2. Update `JWT_SECRET` in **Management UI → Settings → Secrets**
3. The server will derive a new 32-byte KEK automatically on restart
4. **Re-encrypt all provider API keys:**
   - The boot-time canary self-test will fail if old encrypted keys can't be decrypted
   - You must re-save all provider credentials via the admin panel
5. Verify: check server logs for `[Boot] KEK canary self-test passed`

### Emergency KEK Rotation (Suspected Compromise)
1. Immediately update `JWT_SECRET` — this invalidates all sessions
2. Re-save all provider API keys
3. Review audit logs for unauthorized API calls during the exposure window
4. Notify affected users if provider keys were potentially exposed

## Session Invalidation

### Invalidate All Sessions
Change `JWT_SECRET` in Settings → Secrets. All existing session cookies become invalid immediately on server restart.

### Invalidate Single User
Currently requires a database update:
```sql
UPDATE users SET updated_at = NOW() WHERE id = <user_id>;
```
The session middleware checks `updated_at` against the JWT `iat` claim.

## Database Operations

### Connection Issues
The server uses automatic connection retry with `withRetry()`. If connections are persistently failing:

1. Check `GET /api/health` — the `database` field shows connectivity status
2. Verify `DATABASE_URL` is correct in Settings → Secrets
3. Check TiDB cluster status in the database provider dashboard
4. The connection pool resets automatically after 3 consecutive failures

### Schema Migrations
1. Edit `drizzle/schema.ts`
2. Run `pnpm drizzle-kit generate`
3. Review the generated SQL in `drizzle/*.sql`
4. Apply via `webdev_execute_sql` or database client
5. **Never run destructive migrations (DROP TABLE, DROP COLUMN) without a backup**

## Provider Health Monitoring

### Enable Canary Probes
Set `ENABLE_CANARIES=true` in environment. Probes run every 60 seconds against all configured providers.

### Check Provider Status
- API: `GET /api/health` includes provider status when canaries are enabled
- Logs: Search for `[Canary]` in server logs
- The canary scheduler also runs idempotency cleanup on each cycle

### Provider Failover
If a provider is consistently failing:
1. Check the A/B testing dashboard for latency/error spikes
2. Update the routing table in `server/image-router/registry.ts`
3. Set the provider's weight to 0 or remove it from the active list
4. The budget circuit breaker will auto-pause a provider at the daily ceiling

## Stripe Operations

### Test Payments
Use card `4242 4242 4242 4242` with any future expiry and any CVC.

### Webhook Debugging
1. Check **Stripe Dashboard → Developers → Webhooks** for delivery status
2. Search server logs for `"module":"stripe"` entries
3. Events are deduplicated via `stripe_events_log` table — check for existing entries
4. Test events (ID starts with `evt_test_`) return `{ verified: true }` without processing

### Handling Disputes
When `charge.dispute.created` fires:
1. The webhook automatically freezes the user's account and revokes credits
2. Review the dispute in Stripe Dashboard
3. If resolved in your favor, manually restore credits via the admin panel
4. If lost, no action needed — credits are already revoked

### Refund Processing
- Refunds are processed automatically via `charge.refunded` webhook
- Credits are revoked proportionally (e.g., 50% refund = 50% of granted credits revoked)
- The system caps revocation at the user's current balance (no negative balances)

## Rate Limiting

Current limits (per IP for auth, per user for others):
| Endpoint | Limit | Window |
|---|---|---|
| Auth routes | 20 requests | 5 minutes |
| Image generation | 30 requests | 1 hour |
| Character extraction | 10 requests | 1 hour |
| Default (all other) | 300 requests | 1 minute |

Rate limit state is in-memory (LRU cache). It resets on server restart.

## Logging

### Log Format
All server logs are structured JSON:
```json
{"timestamp":"2026-04-19T15:00:00.000Z","level":"info","msg":"Received event","module":"stripe","type":"checkout.session.completed","eventId":"evt_xxx"}
```

### Log Levels
Set `LOG_LEVEL` env var: `debug`, `info` (default), `warn`, `error`

### Finding Specific Logs
```bash
# All stripe errors
grep '"module":"stripe"' .manus-logs/devserver.log | grep '"level":"error"'

# All auth warnings
grep '"module":"auth"' .manus-logs/devserver.log | grep '"level":"warn"'

# Request timing over 5 seconds
grep '"module":"http"' .manus-logs/devserver.log | jq 'select(.durationMs > 5000)'
```
