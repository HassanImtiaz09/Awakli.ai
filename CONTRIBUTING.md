# Contributing to Awakli

## Branch Naming

```
feat/<short-description>    # new features
fix/<short-description>     # bug fixes
chore/<short-description>   # maintenance, deps, CI
docs/<short-description>    # documentation only
```

## Commit Messages

Use conventional commits:

```
feat: add character bible review UI
fix: resolve stale DB connection in guest user flow
chore: migrate console.log to structured logger
docs: add RUNBOOK.md with KEK rotation steps
```

## Pull Request Template

```markdown
## What
Brief description of the change.

## Why
Link to issue or audit finding (e.g., "Fixes H-9: OAuth CSRF").

## How
Key implementation details.

## Testing
- [ ] `pnpm test` passes
- [ ] `npx tsc --noEmit` reports 0 errors
- [ ] Manual browser test of affected flow

## Screenshots
(if UI changes)
```

## Development Workflow

1. Create a feature branch from `main`
2. Make changes, write/update vitest tests
3. Run `pnpm test` and `npx tsc --noEmit` before pushing
4. Open a PR with the template above
5. Address review feedback
6. Squash-merge into `main`

## Code Style

- TypeScript strict mode
- Tailwind 4 utility classes (no custom CSS unless necessary)
- shadcn/ui components for UI consistency
- tRPC procedures for all backend calls (no raw fetch/axios)
- Structured logging via `createLogger()` (no bare `console.log` in server code)
- Drizzle ORM for all database operations

## Adding a New Feature

1. Update `drizzle/schema.ts` if new tables are needed
2. Add DB helpers in `server/db.ts`
3. Add tRPC procedures in `server/routers.ts` or a dedicated `server/routers-*.ts`
4. Build UI in `client/src/pages/` using tRPC hooks
5. Write vitest tests in `server/*.test.ts`
6. Update `todo.md` with the feature items
