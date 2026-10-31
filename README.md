# ScriptBench

Write Playwright scripts in the browser, run them in a real Chromium on the server, and watch every step: a live view of the page you can click and type into, the console, network requests and cookies. Files your script writes (screenshots, PDFs, spreadsheets, JSON, session videos) are collected and kept per project.

```
apps/
  api/   NestJS API, PostgreSQL via Drizzle, Playwright run workers
  web/   Vite + React app, shadcn/ui, Tailwind CSS, lucide icons
```

## Local development

Requirements: Node.js 22 or newer. Docker is optional.

```bash
npm install
npx playwright install chromium   # once, if you do not have Playwright's Chromium yet
npm run dev
```

Open http://localhost:5173 and create an account. Nothing has to be configured first:

- **Database.** `npm run dev` starts PostgreSQL from `docker-compose.dev.yml` and connects to it. Without Docker it falls back to an embedded Postgres (PGlite) stored in `.data/pglite`. Set `DATABASE_URL` in `.env` to use your own server, or `SB_DB=pglite` to skip Docker.
- **Secrets.** Session and encryption keys are generated on first start and kept in `.data/dev-secrets.json`.
- **Migrations** run automatically when the API starts.

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run dev:api` / `npm run dev:web` | Start one side only |
| `npm run build` | Build web and API |
| `npm run typecheck` | Type-check both apps |
| `npm test` | Unit tests (Vitest) for both apps |
| `npm run test:e2e` | End-to-end tests (Playwright) against the production build; run `npm run build` first |

GitHub Actions (`.github/workflows/ci.yml`) runs the type checks, unit tests, end-to-end tests against PostgreSQL and a Docker build on every push and pull request.
| `npm run db:up` / `npm run db:down` | Start or stop the dev database |
| `npm run db:generate` | Create a migration after editing `apps/api/src/database/schema.ts` |

## Production with Docker

```bash
cp .env.example .env
# fill in POSTGRES_PASSWORD, AUTH_SECRET and ENCRYPTION_KEY (openssl rand -hex 32 for each)
docker compose up -d --build
```

The app listens on port 3000 (`PORT` changes the host port). It serves the web app and the API from one container, built on the official Playwright image so Chromium and its system libraries are already there. The container runs as an unprivileged user, has a health check on `/api/system/health`, and keeps everything it writes in the `app-data` volume. PostgreSQL data lives in `postgres-data`.

Put a TLS-terminating reverse proxy in front of it for public deployments and set `APP_URL` to the public `https://` address; cookies are then marked `Secure`. The proxy must pass WebSocket upgrades on `/ws` (live collaboration) and must not buffer `text/event-stream` responses (live run output).

Back up both volumes, and keep `ENCRYPTION_KEY` safe: scripts, variables, API keys and run outputs are encrypted with it, and they cannot be read without it.

### Settings

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | production | PostgreSQL connection string (compose builds it from `POSTGRES_PASSWORD`) |
| `AUTH_SECRET` | production | Signs session cookies |
| `ENCRYPTION_KEY` | production | AES-256-GCM key for data at rest |
| `APP_URL` | no | Public URL, used for Google sign-in and secure cookies |
| `ALLOW_REGISTRATION` | no | `false` closes sign-up; the first account can always be created |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | no | Creates that account on start if it does not exist |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | no | Enables "Continue with Google"; redirect URI is `<APP_URL>/api/auth/google/callback` |
| `GEMINI_API_KEY` | no | Server-wide key for script generation and CAPTCHA reading; people can add their own |
| `SMTP_URL`, `SMTP_FROM` | no | Enables email notifications, e.g. `smtps://user:pass@smtp.example.com` |
| `MAX_CONCURRENT_RUNS` | no | Runs allowed at once (default 3); more are queued and start when a slot is free |
| `MAX_RUN_SECONDS` | no | Upper bound for a run's time limit (default 600) |
| `STORAGE_QUOTA_MB` | no | Storage per person for outputs and uploads (default 0, no limit) |
| `RETENTION_DAYS` | no | Run history and outputs older than this are deleted (default 30; 0 keeps them) |
| `DATA_DIR` | no | Where outputs, uploads and installed packages go (`/data` in the image) |

## Accounts and teams

- The first account, and the one in `ADMIN_EMAIL`, is an admin. Admins manage people in **Settings → Users**: change roles, disable accounts, and hand out temporary passwords.
- Anyone can change their password in **Settings → Account**. With `SMTP_URL` set, the sign-in page also offers a reset link by email.
- Changing or resetting a password, or disabling an account, signs that account out everywhere.
- A project owner can add people from **Share** as *Can edit* (save, schedule, upload) or *Can view and run*.
- Sign-in is limited to 10 failed attempts per 15 minutes for each address and email.

## How a run works

1. The web app posts the project's files and run settings to `POST /api/runs`.
2. The API writes them to a fresh folder under `DATA_DIR/runs/<id>`, copies the project's input files into `uploads/`, and forks a worker process with that folder as its working directory. The worker gets only the user's variables as its environment, not the server's secrets.
3. The worker launches Chromium and runs the entry file as the body of an async function with `page`, `context`, `browser`, `pause()`, `solveCaptcha()` and `chooseElements()` in scope. It reports logs, preview frames, network events and cookies over IPC.

   Scripts written for a local Playwright run unchanged: `import` and `export` work across the project's files, an async IIFE at the top level is awaited, packages a file imports are installed on first use, and `chromium.launch()` (or Firefox/WebKit) returns the run's browser so the page shows in the live view. Launch options such as `headless: false` are ignored.
4. The API streams those to the browser with server-sent events (`GET /api/runs/<id>/events`) and moves new files from the run folder into encrypted storage as they appear.
5. When the run ends, its log is saved to the run history and the folder is deleted.

Schedules and the [HTTP API](docs/API.md) use the same path with the project's last saved version.

## Documentation

- [docs/PRD.md](docs/PRD.md): product requirements and the status of each planned feature
- [docs/API.md](docs/API.md): API tokens, endpoints for CI and other systems, webhook payloads

**Scripts are code execution.** Anyone who can sign in can run arbitrary Node.js on the server, inside the app container. Treat accounts as trusted, keep `ALLOW_REGISTRATION=false` on shared servers, and run the container on a host where that is acceptable.

## Upgrading from the earlier single-file version

The previous version stored data in JSON files under `server-data/` and kept outputs in folders next to the code. This version starts with an empty PostgreSQL database; existing scripts can be brought over by pasting them into new projects. Uploads and outputs from the old folders are not imported.
