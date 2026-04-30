# RealValue AI

Chat-first multi-agent financial assistant. **Telegram is the primary user interface.** SMS via Twilio is the alternative channel (currently `[TBD on use]` pending Twilio A2P 10DLC carrier approval). WhatsApp is post-MVP. **There is no authenticated web portal** — see `.kiro/specs/ai-financial-agent/requirements.md` Requirement 22 for the forcing function preventing reintroduction.

Five specialized agents (Conductor, Watcher, Fixer, Hunter, Voice) collaborate behind a single conversational personality to cancel subscriptions, predict overdrafts, find government benefits, and negotiate bills for low-income users.

## UX surfaces

- **Primary:** Telegram (`@RealValueAIBot`). All user features are chat commands and inline keyboards (`/link_bank`, `/personality`, `/vault`, `/upgrade`, etc.).
- **Alternative (post-A2P):** SMS via Twilio (`+1-989-812-0439`).
- **Future (post-MVP):** WhatsApp Business API.
- **Public web (no auth):** `/` marketing landing, `/privacy`, `/terms` (required for Twilio A2P review). No portal, no login, no settings page.

## Project map

```
realvalueai/
├── .kiro/specs/ai-financial-agent/   # Spec files (tasks.md, design.md, requirements.md)
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── api/                      # API routes (webhooks, cron, banking, vault, auth, health)
│   │   ├── privacy/                  # Public legal page (A2P review)
│   │   ├── terms/                    # Public legal page (A2P review)
│   │   └── r/                        # Short URL redirects
│   ├── agents/
│   │   ├── conductor/                # Intent classification, routing, conflict resolution
│   │   ├── watcher/                  # Transaction monitoring, overdraft
│   │   │   └── detectors/            # Individual detector modules
│   │   ├── fixer/                    # Browser automation, cancellation, walkthrough
│   │   ├── hunter/                   # Benefits, rates, refunds, alternatives
│   │   └── voice/                    # Personality, sentiment, formatting, templates
│   ├── lib/
│   │   ├── supabase/                 # Supabase client
│   │   ├── redis/                    # Redis + BullMQ setup
│   │   ├── agents/                   # Agent communication protocol
│   │   ├── channels/                 # Messaging channel adapters
│   │   ├── math/                     # Decimal.js Money class
│   │   ├── vault/                    # Encryption + vault operations
│   │   ├── trust/                    # Trust ladder + guardrails
│   │   └── banking/                  # Plaid + SimpleFIN adapters
│   └── types/
└── supabase/migrations/              # SQL migration files
```

## Tech stack

Next.js 14+ (App Router), Supabase (Postgres), Redis + BullMQ, Playwright + Stagehand, NVIDIA NIM API (Llama 3.3 70B), Decimal.js, Zod, Vitest.

## Deployment & live infrastructure

- Deployed on Vercel at **https://realvalueai.vercel.app** (auto-deploys on push to `main`).
- Supabase project + Upstash Redis are provisioned and wired to Vercel env vars (Wave 1).
- **Deployment hosts (locked in tasks.md "Architecture pivot" section):**
  - **Vercel serverless functions** host the app, webhooks, cron, and the fast agents (Conductor, Voice, Watcher, Hunter — all sub-10s per job).
  - **Railway / Fly.io worker dyno** hosts only the Fixer browser worker (Playwright sessions take minutes — required by Req 5.1). Doesn't need to exist until task 3.7 lands.
  - BullMQ is used as a **queue+retry primitive**, not a long-running-worker requirement. Vercel functions dequeue + process per invocation.
- Live health endpoints (use these to validate infra, not unit tests):
  - `GET /api/health` — Supabase + Redis connectivity ping
  - `GET /api/health/integration` — round-trip Supabase write/read + Redis set/get/del
  - `GET /api/health/banking` — Plaid sandbox + SimpleFIN demo round-trip
  - `GET /api/health/auth` — Twilio creds + From number (creds-only); `?phone=+1...` sends a real SMS
- Vercel cron schedules are downgraded to **daily** (free-tier limit) — see `vercel.json`.
- For real-service functional validation, prefer hitting the deployed URL over local dev unless the test needs unmerged code.

<important if="you need to run commands to build, test, lint, or type-check">

| Command | What it does |
|---|---|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Run production build |
| `npm run lint` | Lint with `next lint` |
| `npm run test` | Run Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |
| `npx tsc --noEmit` | Type-check (must pass before completing any task) |
</important>

<important if="you have been assigned a task ID (e.g., 1.1, 2.3) or are starting work on a spec task">

1. Read `.kiro/specs/ai-financial-agent/tasks.md` — find your assigned task.
2. Check the **Dependency Index** at the top — verify all dependencies are `[x]`.
3. Read `.kiro/specs/ai-financial-agent/design.md` for architecture/interfaces.
4. Read `.kiro/specs/ai-financial-agent/requirements.md` for acceptance criteria.

Do ONLY the assigned task. Do not work on other tasks.
</important>

<important if="you are about to mark a task complete or report a task as done">

Before marking complete:
1. Run `npx tsc --noEmit` — fix ALL type errors. Tests passing does NOT mean type-check passes.
2. Run the tests you wrote — all must pass.
3. Update `.kiro/specs/ai-financial-agent/tasks.md` — flip `[ ]` to `[x]`.
4. Report what you built and any issues.
</important>

<important if="you are writing or modifying code that handles monetary values, currency, balances, or amounts">

- All monetary values use the `Money` class in `src/lib/math/decimal.ts` (wraps Decimal.js).
- NEVER use JavaScript `number` for money — no IEEE 754 floats.
- Postgres stores money as `NUMERIC(19,4)`.
- Round-trip guarantee: `Money.toNumericString(Money.fromString(x)) === x`.
- Tests must verify exact decimal precision.
</important>

<important if="you are handling credentials, tokens, PINs, account numbers, or writing to user data tables">

- Never log credentials, tokens, or PINs.
- Credential vault uses AES-256-GCM with PBKDF2 (100K iterations) — see `src/lib/vault/`.
- All user data tables must have Row Level Security (RLS).
- `action_logs` is append-only — no UPDATE or DELETE.
- Never send full account numbers — last 4 digits only.
</important>

<important if="you are validating external input (HTTP requests, webhooks, third-party API responses)">

- Use Zod schemas for all external input validation.
- Return immutable data — never mutate inputs.
</important>

<important if="you are writing or modifying tests">

- TDD: write tests first.
- Vitest. Test file next to source: `foo.ts` → `foo.test.ts`.
- Mock external services (Plaid, NIM API, Telegram, Twilio).
- Financial math tests must verify exact decimal precision.
</important>
