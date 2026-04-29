# RealValue AI — Agent Instructions

You are an AI developer working on the RealValue project. Read this file FIRST before doing anything.

## Project Overview

RealValue is a chat-first multi-agent financial assistant (Telegram/WhatsApp/SMS). No app. Five specialized agents (Conductor, Watcher, Fixer, Hunter, Voice) collaborate behind a single conversational personality to cancel subscriptions, predict overdrafts, find government benefits, and negotiate bills for low-income users.

## Before You Start Any Task

1. Read `.kiro/specs/ai-financial-agent/tasks.md` — find your assigned task
2. Check the **Dependency Index** at the top — verify all your dependencies are marked `[x]` (complete)
3. Read `.kiro/specs/ai-financial-agent/design.md` — understand the architecture and interfaces relevant to your task
4. Read `.kiro/specs/ai-financial-agent/requirements.md` — understand the acceptance criteria

## Task Assignment Protocol

You will be given a task ID (e.g., "1.1", "2.3", "3.7"). Do ONLY that task. Do not work on other tasks.

When you complete your task:
1. Run the tests you wrote
2. Update `tasks.md` — change your task's checkbox from `[ ]` to `[x]`
3. Report what you built and any issues

## Critical Rules

### Financial Math
- ALL monetary values use `Decimal.js` via the `Money` class in `src/lib/math/decimal.ts`
- NEVER use JavaScript `number` type for money — no IEEE 754 floats
- PostgreSQL stores money as `NUMERIC(19,4)`
- Round-trip guarantee: `Money.toNumericString(Money.fromString(x)) === x`

### Security
- Never log credentials, tokens, or PINs
- Credential vault uses AES-256-GCM with PBKDF2 key derivation (100K iterations)
- All user data tables have Row Level Security (RLS)
- `action_logs` table is append-only — no UPDATE or DELETE
- Never send full account numbers — last 4 digits only

### Code Style
- TypeScript strict mode
- Zod for all external input validation
- Immutable data — return new objects, never mutate
- Small files (<400 lines), organized by feature/domain
- All exports explicitly typed

### Testing
- Write tests FIRST (TDD)
- Use Vitest
- Test file next to source: `foo.ts` → `foo.test.ts`
- Mock external services (Plaid, NIM API, Telegram, etc.)
- Financial math tests must verify exact decimal precision

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | Next.js 14+ (App Router) |
| Database | Supabase (PostgreSQL) |
| Cache/Queue | Redis + BullMQ |
| Browser Automation | Playwright + Stagehand (Railway/Fly.io) |
| Messaging | Telegram Bot API, WhatsApp Business API, Twilio SMS |
| LLM | NVIDIA NIM API (Llama 3.3 70B) |
| Financial Math | Decimal.js (wrapped in Money class) |
| Validation | Zod |
| Testing | Vitest |
| OG Images | @vercel/og |
| Encryption | Node.js crypto (AES-256-GCM, PBKDF2) |

## Project Structure

```
realvalueai/
├── .kiro/specs/ai-financial-agent/   # Spec files
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── api/                      # API routes (webhooks, cron, vault, auth, etc.)
│   │   ├── (portal)/                # Authenticated web portal pages
│   │   └── r/                       # Short URL redirects
│   ├── agents/                       # Agent implementations
│   │   ├── conductor/               # Intent classification, routing, conflict resolution
│   │   ├── watcher/                 # Transaction monitoring, detectors, overdraft
│   │   │   └── detectors/           # Individual detector modules
│   │   ├── fixer/                   # Browser automation, cancellation, walkthrough
│   │   ├── hunter/                  # Benefits, rates, refunds, alternatives
│   │   └── voice/                   # Personality, sentiment, formatting, templates
│   ├── lib/                          # Shared libraries
│   │   ├── supabase/                # Supabase client
│   │   ├── redis/                   # Redis + BullMQ setup
│   │   ├── agents/                  # Agent communication protocol
│   │   ├── channels/                # Messaging channel adapters
│   │   ├── math/                    # Decimal.js Money class
│   │   ├── vault/                   # Encryption + vault operations
│   │   ├── trust/                   # Trust ladder + guardrails
│   │   ├── banking/                 # Plaid + SimpleFIN adapters
│   │   └── ...                      # Other shared modules
│   └── types/                        # TypeScript type definitions
├── supabase/migrations/              # SQL migration files
├── CLAUDE.md                         # This file
└── .env.example
```
