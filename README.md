# HoodLink

A responsive HoodLink community app: **Next.js 16 / React 19**, modular **NestJS 11**, **Drizzle ORM**, **PostgreSQL 17**, and **Docker Compose**. Supports Telegram Mini Apps and a local browser demo.

## Docker

Requires Docker Desktop with its engine running.

```bash
docker compose up --build -d --wait
```

Open http://localhost:3000. Set `WEB_PORT=3001` in a root `.env` file when port 3000 is occupied. The current machine's container preview is running at **http://localhost:3001**.

Compose starts PostgreSQL, runs versioned migrations and demo seeding, then starts the API and web app after their dependencies become healthy. The API is internal; the development database port binds to `localhost:55432` only. PostgreSQL data persists in a named volume.

Use `docker compose ps` and `docker compose logs api web migrate` to inspect the stack. `docker compose down` stops it without deleting data. Do not use `down -v` unless you deliberately intend to delete the database.

## Local Development

Requires **Node.js 24+**, npm, and Docker PostgreSQL. Configure `apps/api/.env` from its template before migrating; a local development file is already present on this machine.

```bash
npm run setup
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

- Web: http://localhost:3000
- API health: http://127.0.0.1:4000/v1/health
- Browser preview signs into a shared local demo account. Open in Telegram to use a verified Telegram account.
- PostgreSQL connection: `DATABASE_URL`. Each API pool is controlled by `DATABASE_POOL_SIZE`.
- Templates: root `.env.example` for Docker, `apps/api/.env.example` for NestJS, and `apps/web/.env.example` for Next.js. Never commit secrets. Percent-encode reserved characters in credentials inside connection URLs.

## Architecture

Role workspaces, catalog management, safe Super Admin provisioning, development previews, and account appearance are documented in [docs/administration.md](docs/administration.md).

Telegram groups, bot delivery, native polls, storage, routed details, and Elite Stars checkout are documented in [docs/telegram.md](docs/telegram.md). Live bot actions and payment collection are disabled by default and require deployment credentials, HTTPS, permissions, terms, and support configuration.

See [docs/architecture.md](docs/architecture.md) for boundaries, the relational model, concurrency guarantees, and deployment decisions.

- `apps/web`: responsive interface and allowlisted same-origin API gateway; standalone Docker output.
- `apps/api/src/auth`: Telegram identity, signed sessions, authentication controller, and guards.
- `apps/api/src/community`: validation, domain service, transactional Drizzle repository, and community controller.
- `apps/api/src/database`: schema, connection pool, migration runner, repeatable seeds, and legacy import.
- `apps/api/drizzle`: checked-in SQL migrations and snapshots.
- `packages/contracts`: shared transport types, independent of backend implementation.
- `.github/workflows/ci.yaml`: application checks, database integration tests, Docker builds, and browser tests.

## Database Changes

Edit the Drizzle schema, run `npm run db:generate`, review the generated SQL, and run `npm run db:migrate`. The API does not automatically synchronize schema. Docker uses a separate migration job protected by a PostgreSQL advisory lock.

To transfer the earlier SQLite prototype, migrate and seed PostgreSQL, then run `npm --prefix apps/api run db:import:sqlite`. The import reads the original SQLite file in read-only mode and copies users, posts, messages, and actions in one transaction. Existing PostgreSQL profiles are not overwritten; reruns skip duplicates. SQLite is used only by this optional import tool, not the running application.

## Implemented

- Dashboard, community search, school hub, hood discovery, challenges, local business directory, events, rewards, profile, and settings.
- Join/leave communities and challenges; save businesses; claim offer codes; RSVP/cancel events; like posts; create text posts; edit profiles and privacy settings.
- Persistent community chat with membership checks and 8-second polling while the page is visible.
- Telegram initData HMAC validation, one-hour initData freshness check, 12-hour signed sessions, SDK ready/expand, back button, safe-area handling, haptics, deep links, and sharing.
- NestJS request throttling, Zod validation, guarded controllers, bounded JSON bodies, parameterized Drizzle queries, and a restricted Next.js API proxy.
- Normalized catalog and action tables, foreign keys, unique membership/claim constraints, indexes, transactional writes, and consistent read snapshots.
- Responsive mobile navigation, desktop sidebar, focus-trapped dialogs, keyboard focus states, reduced-motion styling, loading/empty/error states, and image fallbacks.

## Telegram deployment

1. Create your bot with **@BotFather**. Configure a **Main Mini App** or menu button and set its HTTPS URL to your deployed Next.js app. Set the bot description and icon as appropriate.
2. Configure `BOT_TOKEN`, `SESSION_SECRET` (at least 32 random characters), a strong `POSTGRES_PASSWORD`, `WEB_ORIGIN` (your HTTPS frontend origin), and your PostgreSQL connection. Never expose server secrets to the frontend.
3. Set frontend server-side `API_URL` to the private NestJS service address. Set build-time `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` to your bot username without `@` for Telegram invite links. Only this username is public.
4. Run `docker compose -f compose.yaml -f compose.production.yaml up --build -d --wait`. The production override requires secrets, forces production authentication, and disables demo login. Use `SEED_DEMO_DATA=false` and provision an approved catalog before real onboarding.
5. Place the loopback-bound web service behind an HTTPS reverse proxy or hosting platform. Back up PostgreSQL. Use a least-privilege production database role; the local bootstrap role is a development convenience.
6. Keep NestJS private behind the Next.js proxy. Set `HOST=0.0.0.0` only when required by your API host. In production, allow traffic from your frontend service only and configure TLS at the edge.
7. Open `https://t.me/YOUR_BOT?startapp=home` and verify authentication and navigation on Telegram for Android and iOS. Other deep links include `challenges`, `events`, `businesses`, and `school`.

Telegram credentials and a public HTTPS deployment are not supplied with this repository. Local browser testing does not replace a real Telegram device test.

## Verification

```bash
npm test
npm run test:integration
npm run lint
npm run build
npm --prefix apps/web audit --omit=dev
npm --prefix apps/api audit --omit=dev
```

Set `TEST_DATABASE_URL=postgresql://hoodlink:hoodlink_local@localhost:55432/hoodlink` before integration tests. They create and remove only their own temporary database; the configured test role needs CREATE DATABASE permission. They do not clear the development database.

Tests cover Telegram authentication, production policy, migration/seed repeatability, persistence, concurrent writes, unique claims, cross-account privacy, and database constraints.

With the app running locally or in Docker, run the repeatable browser suite:

```bash
npx playwright install chromium
npm run test:e2e
```

If Microsoft Edge is installed, no browser download is necessary. In Git Bash, use `PLAYWRIGHT_CHANNEL=msedge npm run test:e2e`. In PowerShell, set `$env:PLAYWRIGHT_CHANNEL="msedge"` before running `npm run test:e2e`.

For the current Docker preview, set `TEST_BASE_URL=http://localhost:3001` as well. CI runs the browser suite against Docker containers.

The desktop and mobile suites verify challenge persistence, business saves, offer claims, RSVP toggles, message persistence, navigation, horizontal overflow, and browser errors. They use the local demo account, so test messages are retained in the development database.

## Demo data and production boundaries

The supplied schools, people, courses, businesses, contact details, offers, October 2026 events, leaderboard, and initial reward points are **illustrative seed content**, not integrations with real schools or merchants. Photography is illustrative Unsplash content, not verified images of Addis Ababa. Replace the seed catalog before release.

Courses currently show demo resources and connect to study groups; this is not an LMS. Challenge participation persists, but completion verification and point awards require an organizer/admin workflow. Rewards and leaderboard content remain illustrative. Offers expose demo codes; there is no merchant redemption verification. The inbox is real and Telegram delivery is opt-in when configured. Linked groups/channels open the native Telegram client; unlinked communities retain local app chat. Posts support text, not image uploads. Elite private notes and native poll allowances are enforced server-side; live checkout is disabled until configured and tested.

Before a public launch add moderation/reporting, organizer and merchant administration, reward verification, real catalog management, consent/legal policies, backups, monitoring, and account deletion. A complete launch also requires validating the deployed app inside Telegram.

Runtime audits are separate from development tooling. Upstream development-only advisories exist in Next's ESLint dependencies and Drizzle Kit's esbuild loader. Incompatible force downgrades are not applied automatically.# hoodlink
