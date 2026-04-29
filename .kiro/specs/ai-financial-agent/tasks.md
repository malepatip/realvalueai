# Implementation Plan: RealValue AI Financial Agent

## Overview

This plan is structured in **5 waves** for maximum parallel execution. Multiple AI agents can work on all tasks within the same wave simultaneously. Each task declares its dependencies explicitly so any agent can pick up a task, check that its dependencies are complete, and start working.

**Architecture**: Next.js (Vercel) + Supabase PostgreSQL + Redis/BullMQ + Playwright/Stagehand (Railway/Fly.io) + Telegram/WhatsApp/SMS + NVIDIA NIM API

**Language**: TypeScript throughout

---

## Dependency Index

| Task | Depends On | Wave |
|------|-----------|------|
| 1.1 | — | 1 |
| 1.2 | — | 1 |
| 1.3 | — | 1 |
| 1.4 | — | 1 |
| 1.5 | — | 1 |
| 1.6 | — | 1 |
| 1.7 | — | 1 |
| 2.1 | 1.1, 1.3, 1.5 | 2 |
| 2.2 | 1.1, 1.2, 1.3 | 2 |
| 2.3 | 1.1, 1.2, 1.3, 1.6 | 2 |
| 2.4 | 1.1, 1.2, 1.3 | 2 |
| 2.5 | 1.1, 1.3, 1.5 | 2 |
| 2.6 | 1.1, 1.2, 1.7 | 2 |
| 2.7 | 1.1, 1.2 | 2 |
| 3.1 | 2.3 | 3 |
| 3.2 | 2.3 | 3 |
| 3.3 | 2.3 | 3 |
| 3.4 | 2.3 | 3 |
| 3.5 | 2.3 | 3 |
| 3.6 | 2.2, 2.4 | 3 |
| 3.7 | 1.1, 1.4, 2.4 | 3 |
| 3.8 | 2.5, 1.3 | 3 |
| 3.9 | 2.1, 1.2 | 3 |
| 3.10 | 2.7, 1.2 | 3 |
| 4.1 | 3.1, 3.6, 3.7 | 4 |
| 4.2 | 3.6 | 4 |
| 4.3 | 3.1, 2.3 | 4 |
| 4.4 | 3.8, 3.6 | 4 |
| 4.5 | 2.4, 3.1 | 4 |
| 4.6 | 3.9, 3.10 | 4 |
| 5.1 | 4.1, 4.4, 3.9 | 5 |
| 5.2 | 2.4, 3.6 | 5 |
| 5.3 | 2.4 | 5 |
| 5.4 | 2.5, 3.8 | 5 |
| 5.5 | 2.4, 2.7 | 5 |
| 5.6 | 2.7 | 5 |
| 5.7 | 1.3, 2.4, 1.2 | 5 |
| 5.8 | 3.6, 3.8, 2.1 | 5 |
| 5.9 | 1.1, 1.2, 1.4 | 5 |

---

## Tasks

### Wave 1 — Foundation (Zero Dependencies — All Parallel)

- [x] 1. Wave 1: Project Foundation

  - [x] 1.1 Project scaffolding — Next.js, Supabase client, Redis connection, environment config
    - **Depends on:** Nothing (Wave 1)
    - Initialize Next.js 14+ project with App Router in `realvalueai/`
    - Install dependencies: `@supabase/supabase-js`, `ioredis`, `bullmq`, `decimal.js`, `zod`, `uuid`
    - Create `src/lib/supabase/client.ts` — Supabase client factory (server + browser)
    - Create `src/lib/redis/client.ts` — Redis connection singleton with reconnect logic
    - Create `src/lib/redis/bullmq.ts` — BullMQ queue factory with all queue names from design (`INBOUND`, `CONDUCTOR`, `WATCHER`, `FIXER`, `HUNTER`, `VOICE`, `FIXER_BROWSER`, `DEAD_LETTER`)
    - Create `.env.example` with all required env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `REDIS_URL`, `TELEGRAM_BOT_TOKEN`, `PLAID_CLIENT_ID`, `PLAID_SECRET`, `SIMPLEFIN_ACCESS_URL`, `NVIDIA_NIM_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `ENCRYPTION_KEY`
    - Create `src/lib/env.ts` — Zod-validated environment config that fails fast on missing vars
    - Create `next.config.ts` and `vercel.json` with cron job definitions for `/api/cron/*` routes
    - **Test:** Verify Supabase client connects, Redis client connects, BullMQ queues initialize, env validation rejects missing vars
    - _Requirements: 18.1, 19.3, 19.8_

  - [x] 1.2 Database schema and migrations
    - **Depends on:** Nothing (Wave 1)
    - Create `supabase/migrations/001_initial_schema.sql` with ALL tables from the design document:
      - `users` (phone_number canonical identity, trust_phase, subscription_tier, personality_mode, safe_mode fields, survival_mode fields, all indexes)
      - `bank_connections` (provider enum plaid/simplefin, encrypted access token, status)
      - `accounts` (balance as NUMERIC(19,4), currency)
      - `transactions` (amount NUMERIC(19,4), merchant categorization fields, recurring flag, all indexes)
      - `recurring_charges` (amount/previous_amount NUMERIC(19,4), frequency, usage tracking, trial fields)
      - `agent_actions` (status workflow, estimated/actual savings NUMERIC(19,4), tier, undo_window, ghost flag, screenshots JSONB)
      - `action_logs` (APPEND-ONLY — no UPDATE/DELETE grants, screenshot_refs JSONB)
      - `ghost_actions` (estimated_savings NUMERIC(19,4))
      - `overdraft_predictions` (all NUMERIC(19,4) fields, guarantee tracking)
      - `credential_vault_entries` (encrypted_blob BYTEA, salt, iv, auth_tag, is_locked)
      - `notification_queue` (urgency check, batched_for date, delivered flag)
      - `shareable_cards` (card_type enum, short_code unique, referral_code, click_count)
      - `referrals` (status workflow clicked→signed_up→active)
      - `subscription_tiers` (tier enum, price NUMERIC(19,4), trial tracking)
      - `couples_links` (user_a/user_b, invite_code, status)
      - `user_preferences` (blocked_merchants JSONB, life_stage_priorities JSONB)
      - `compatibility_scores` (success_rate NUMERIC(5,4), unique index on provider+method)
      - `agent_event_logs` (append-only, correlation_id)
    - Create `supabase/migrations/002_rls_policies.sql`:
      - Enable RLS on ALL user-data tables
      - `user_isolation` policy with Crew For Two partner access via `couples_links`
      - `action_logs` append-only policy (SELECT + INSERT only)
    - Create `supabase/migrations/003_functions.sql`:
      - `soft_delete(table_name, record_id)` function
      - `updated_at` trigger function for all tables with `updated_at` column
    - **Test:** Run migrations against local Supabase, verify all tables created, RLS policies active, NUMERIC precision correct, append-only constraint on action_logs
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7, 9.4, 9.5, 9.12_

  - [x] 1.3 Core type definitions and interfaces
    - **Depends on:** Nothing (Wave 1)
    - Create `src/types/agents.ts` — `AgentType`, `AgentMessage` envelope, queue name constants
    - Create `src/types/trust.ts` — `TrustPhase`, `PhaseGuardrails`, `PHASE_GUARDRAILS` constant, `KillSwitchResult`, `PhaseTransitionResult`
    - Create `src/types/channels.ts` — `ChannelAdapter`, `ActionButton`, `MessageResult` interfaces
    - Create `src/types/watcher.ts` — `Insight`, `OverdraftPrediction`, `CategorizedTransaction`, `RecurringCharge`, `GhostAction`, `Detector` interfaces
    - Create `src/types/fixer.ts` — `BrowserJob`, `BrowserJobStatus`, `ApprovedAction`, `ActionResult`, `GuardrailResult`, `CompatibilityScore` interfaces
    - Create `src/types/hunter.ts` — `BenefitOpportunity`, `RateOpportunity`, `RefundOpportunity`, `AlternativeOpportunity`, `ImmigrationStatus`, `ReligiousPreferences` interfaces
    - Create `src/types/voice.ts` — `PersonalityMode`, `SentimentResult`, `FormattedMessage`, `MorningBriefing` interfaces
    - Create `src/types/conductor.ts` — `IntentClassification`, `LifeChangeEvent`, `AgentRecommendation`, `AgentHealthReport` interfaces
    - Create `src/types/cards.ts` — `ShareableCard`, `SavingsMilestone` interfaces
    - Create `src/types/database.ts` — Row types matching all Supabase tables (User, BankConnection, Account, Transaction, etc.)
    - Use Zod schemas for runtime validation of all external inputs
    - **Test:** TypeScript compilation passes, Zod schemas validate correct inputs and reject malformed data
    - _Requirements: 1.1, 1.2, 2.1, 4.1, 5.1, 6.1, 7.1, 8.1, 18.2_

  - [x] 1.4 Agent communication protocol — Redis pub/sub + BullMQ queues
    - **Depends on:** Nothing (Wave 1)
    - Create `src/lib/agents/protocol.ts`:
      - `createAgentMessage(source, target, type, payload, userId)` — factory with UUID, ISO timestamp, correlation ID
      - `validateAgentMessage(msg)` — Zod validation of AgentMessage envelope
    - Create `src/lib/agents/queues.ts`:
      - Queue constants: `INBOUND`, `CONDUCTOR`, `WATCHER`, `FIXER`, `HUNTER`, `VOICE`, `FIXER_BROWSER`, `DEAD_LETTER`
      - `enqueueTask(targetAgent, message)` — adds job to agent's BullMQ queue with priority mapping
      - `createWorker(agentType, processor)` — BullMQ worker factory with retry logic (3 retries, exponential backoff), dead-letter on final failure
    - Create `src/lib/agents/pubsub.ts`:
      - `publishEvent(channel, event)` — Redis pub/sub for real-time events (kill switch, priority changes, health pings)
      - `subscribeToEvents(channel, handler)` — event listener
      - Channel names: `agent:health`, `agent:kill-switch`, `agent:priority-change`
    - Create `src/lib/agents/health.ts`:
      - `sendHealthPing(agentType)` — 10-second interval health pings
      - `checkAgentHealth()` — returns `AgentHealthReport` with last ping times
      - Conductor failover detection: 3 missed pings → autonomous mode
    - **Test:** Messages enqueue/dequeue correctly, pub/sub events fire, health ping detection works, dead-letter queue catches failed jobs, message validation rejects malformed envelopes
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 19.3, 19.7_

  - [x] 1.5 Channel adapter interfaces — Telegram/WhatsApp/SMS abstraction
    - **Depends on:** Nothing (Wave 1)
    - Create `src/lib/channels/adapter.ts` — abstract `ChannelAdapter` interface with `sendText`, `sendImage`, `sendActionButtons`, `sendProgressUpdate`
    - Create `src/lib/channels/telegram.ts` — `TelegramAdapter` implementing `ChannelAdapter` using Telegram Bot API (inline keyboard buttons for approve/reject/snooze)
    - Create `src/lib/channels/whatsapp.ts` — `WhatsAppAdapter` implementing `ChannelAdapter` using WhatsApp Business API (interactive message buttons)
    - Create `src/lib/channels/sms.ts` — `SmsAdapter` implementing `ChannelAdapter` using Twilio SMS (text-based approve/reject via reply codes)
    - Create `src/lib/channels/router.ts` — `ChannelRouter`:
      - Selects primary channel based on subscription tier (Free → Telegram, Premium → WhatsApp) + user preference override
      - Fallback logic: if primary fails, retry on SMS within 30 seconds
      - Cross-platform user recognition by phone number
    - **Test:** Each adapter formats messages correctly for its platform, router selects correct channel by tier, fallback triggers on primary failure, phone-number-based user lookup works across channels
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 2.9, 20.1_

  - [x] 1.6 Deterministic financial math library — Decimal.js wrapper
    - **Depends on:** Nothing (Wave 1)
    - Create `src/lib/math/decimal.ts`:
      - `Money` class wrapping `Decimal.js` — NEVER uses IEEE 754 floats
      - `Money.fromString(value)`, `Money.add()`, `Money.subtract()`, `Money.multiply()`, `Money.compare()`, `Money.isGreaterThan()`
      - `Money.format(amount, locale)` — locale-aware currency formatting
      - `Money.toNumericString(amount)` — for database storage (round-trip safe)
      - `Money.applyBuffer(amount, bufferPercent)` — for overdraft 20% buffer
      - All operations return new Money instances (immutability)
      - Round-trip guarantee: `Money.toNumericString(Money.fromString(x)) === x`
    - **Test:** Arithmetic precision (no floating point drift), round-trip consistency, buffer calculation, comparison operators, locale formatting, rejection of NaN/Infinity/non-numeric inputs
    - _Requirements: 4.10, 15.2, 18.2, 18.7, 21.7_

  - [x] 1.7 Credential vault encryption module
    - **Depends on:** Nothing (Wave 1)
    - Create `src/lib/vault/crypto.ts`:
      - `deriveKey(pin, salt)` — PBKDF2 with 100,000 iterations, SHA-256
      - `encrypt(plaintext, pin)` — AES-256-GCM, returns `{ encryptedBlob, salt, iv, authTag }`
      - `decrypt(encryptedBlob, salt, iv, authTag, pin)` — AES-256-GCM decrypt
      - `zeroMemory(buffer)` — securely wipe buffer contents
    - Create `src/lib/vault/vault.ts`:
      - `storeCredential(userId, serviceName, serviceUrl, credential, pin)` — encrypt + store in `credential_vault_entries`
      - `retrieveCredential(entryId, pin)` — fetch + decrypt (for ephemeral container use only)
      - `listCredentials(userId)` — list without decryption (service names only)
      - `deleteCredential(entryId)` — soft delete
      - `lockVault(userId)` — set `is_locked = true` on all entries (kill switch)
    - **Test:** Encrypt/decrypt round-trip, wrong PIN fails with auth error, zeroMemory clears buffer, lockVault locks all entries, PBKDF2 produces different keys for different salts
    - _Requirements: 9.3, 9.10, 5.9, 8.11_

- [ ] 2. Checkpoint — Ensure Wave 1 foundation compiles and all unit tests pass
  - Ensure all tests pass, ask the user if questions arise.

### Wave 2 — Core Services (Depends on Wave 1)

- [x] 3. Wave 2: Core Services

  - [x] 2.1 Telegram webhook handler
    - **Depends on:** 1.1, 1.3, 1.5 (Wave 2)
    - Create `src/app/api/webhooks/telegram/route.ts`:
      - `POST` handler that receives Telegram webhook updates
      - Validate webhook signature using bot token
      - Parse incoming message, extract text, user ID, callback query data
      - Look up user by `telegram_user_id` in `users` table; if not found, create new user at Phase 0
      - Store raw message in Supabase
      - Enqueue message to `INBOUND` BullMQ queue with user context
      - Return 200 immediately (async processing)
    - Create `src/lib/channels/telegram-webhook.ts`:
      - `parseTelegramUpdate(body)` — extract message text, callback data, user info
      - `verifyTelegramSignature(body, secret)` — webhook authenticity check
      - Handle callback queries (button presses for approve/reject/snooze)
    - **Test:** Valid webhook parses correctly, invalid signature rejected, new user created at Phase 0, message enqueued to INBOUND, callback queries map to correct actions
    - _Requirements: 2.1, 2.6, 2.8, 11.1_

  - [x] 2.2 Plaid and SimpleFIN bank linking integration
    - **Depends on:** 1.1, 1.2, 1.3 (Wave 2)
    - Create `src/lib/banking/plaid.ts`:
      - `createLinkToken(userId)` — generate Plaid Link token for frontend
      - `exchangePublicToken(publicToken)` — exchange for access token
      - `syncTransactions(accessToken, cursor?)` — fetch new transactions since last sync
      - `getAccounts(accessToken)` — fetch account balances
      - `revokeAccessToken(accessToken)` — for kill switch
    - Create `src/lib/banking/simplefin.ts`:
      - `createConnection(accessUrl)` — establish SimpleFIN connection
      - `fetchTransactions(connectionId, startDate, endDate)` — fetch transactions
      - `fetchAccounts(connectionId)` — fetch account balances
    - Create `src/lib/banking/adapter.ts`:
      - `BankDataAdapter` interface abstracting Plaid/SimpleFIN differences
      - `PlaidAdapter` and `SimpleFinAdapter` implementations
      - `syncBankData(userId)` — unified sync that works with either provider
      - Store access tokens encrypted in `bank_connections` table
    - Create `src/app/api/webhooks/plaid/route.ts` — handle Plaid webhooks (transaction updates, errors)
    - Create `src/app/api/webhooks/simplefin/route.ts` — handle SimpleFIN webhooks
    - **Test:** Link token generation, token exchange, transaction sync returns normalized data, account balance fetch, access token revocation, adapter abstraction works for both providers
    - _Requirements: 3.1, 9.2, 14.1, 14.2, 20.3, 21.1_

  - [x] 2.3 Watcher agent — transaction categorization engine
    - **Depends on:** 1.1, 1.2, 1.3, 1.6 (Wave 2)
    - Create `src/agents/watcher/categorizer.ts`:
      - **Pass 1 — Rule-based**: `RuleBasedCategorizer` with 500+ merchant/category rules
        - Create `src/agents/watcher/merchant-rules.ts` — merchant name to category mapping
        - Fuzzy matching for merchant name variations
        - Returns `{ category, confidence, ruleMatched }`
      - **Pass 2 — LLM-assisted**: `LlmCategorizer` for unmatched transactions
        - Batch unmatched transactions, send to NVIDIA NIM API
        - Parse LLM response into category assignments
        - Target: 95% overall categorization accuracy
    - Create `src/agents/watcher/categorizer-pipeline.ts`:
      - `categorizeBatch(transactions)` — runs Pass 1, collects unmatched, runs Pass 2
      - Stores results in `transactions` table (`merchant_category`, `category_rule_matched`, `category_confidence`)
    - Create `src/agents/watcher/recurring-detector.ts`:
      - `detectRecurringCharges(userId, transactions)` — identify recurring patterns by merchant + amount + frequency
      - Update `recurring_charges` table with detected patterns
      - Track `last_usage_date` and `days_since_usage` for unused subscription detection
    - All monetary calculations use `Money` class from 1.6
    - **Test:** Rule-based categorizer matches known merchants, fuzzy matching handles variations, LLM fallback called for unmatched, recurring charge detection identifies weekly/monthly/annual patterns, all amounts use Decimal.js
    - _Requirements: 4.1, 4.10, 21.1, 21.2_

  - [x] 2.4 Trust Ladder state machine
    - **Depends on:** 1.1, 1.2, 1.3 (Wave 2)
    - Create `src/lib/trust/state-machine.ts`:
      - `getCurrentPhase(userId)` — read from `users.trust_phase`, cache in Redis
      - `advancePhase(userId, trigger)` — validate transition rules:
        - Phase 0 to 1: bank account connected
        - Phase 1 to 2: user explicitly enables actions
        - Phase 2 to 3: 20+ approvals AND >70% approval rate AND KYC verified
      - `downgradePhase(userId, targetPhase)` — voluntary downgrade to any lower phase
      - `executeKillSwitch(userId)` — within 5 seconds: revoke bank tokens, lock vault, halt operations, confirm via Voice
    - Create `src/lib/trust/guardrails.ts`:
      - `enforceGuardrails(userId, action)` — check action against current phase limits
      - Phase 2: per-action $25 limit, daily aggregate $100 limit, require approval
      - Phase 3: Tier 1 auto-execute (<$10, reversible), Tier 2 notify + 24h undo, Tier 3 require approval
      - `classifyActionTier(action)` — assign tier based on amount, reversibility, provider history
    - Create `src/lib/trust/phase3-eligibility.ts`:
      - `checkPhase3Eligibility(userId)` — query approval count, rate, KYC status
    - Publish kill switch event via Redis pub/sub to all agents
    - **Test:** Phase transitions follow rules, invalid transitions rejected, kill switch completes <5s, guardrails enforce limits correctly, tier classification correct, Phase 3 eligibility checks all criteria
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 10.1, 10.2, 10.5, 10.6_

  - [x] 2.5 Voice agent — template fallback system and personality modes
    - **Depends on:** 1.1, 1.3, 1.5 (Wave 2)
    - Create `src/agents/voice/templates.ts`:
      - Pre-written template messages for ALL critical communications:
        - Overdraft alerts, action confirmations, error notifications, kill switch confirmation
        - Onboarding flow messages (crew intro, personality selection, goal question)
        - Morning briefing template
      - `getTemplate(key, vars)` — variable interpolation into templates
    - Create `src/agents/voice/personality.ts`:
      - `applyPersonalityMode(content, mode, locale)`:
        - `savage` — humorous roasts of spending habits
        - `hype` — enthusiastic celebration of wins
        - `zen` — calming language, optional number hiding (replace amounts with qualitative descriptions)
        - `mentor` — educational explanations
      - Template-based personality for Free tier, LLM-powered for Premium
    - Create `src/agents/voice/formatter.ts`:
      - `formatMessage(agentContent, userId)` — apply personality, mask account numbers (last 4 digits only), apply stealth mode if active
      - `applySafeMode(message, coverTopic)` — disguise financial messages as weather/recipes/etc.
      - `applyStealthMode(message)` — remove specific amounts and account details
      - `applySimplifiedMode(message)` — max 2 sentences, max 2 options, 6th-grade vocabulary
    - Create `src/agents/voice/agent-attribution.ts`:
      - `addAttribution(message, sourceAgent)` — prepend "Your Watcher spotted this" / "Your Hunter found this"
    - **Test:** Each personality mode transforms content correctly, zen mode hides numbers, safe mode disguises content, stealth mode removes specifics, simplified mode enforces limits, templates render with variables, account masking shows only last 4 digits
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6, 7.7, 7.8, 7.9, 13.1, 13.8, 19.6_

  - [x] 2.6 Credential vault API routes
    - **Depends on:** 1.1, 1.2, 1.7 (Wave 2)
    - Create `src/app/api/vault/store/route.ts` — `POST /api/vault/store`
      - Accept `{ serviceName, serviceUrl, credential, pin }`
      - Call `vault.storeCredential()` from 1.7
      - Return success (no credential data in response)
    - Create `src/app/api/vault/list/route.ts` — `GET /api/vault/list`
      - Return service names and IDs only (never decrypted data)
    - Create `src/app/api/vault/update/[id]/route.ts` — `PUT /api/vault/update/:id`
      - Re-encrypt with new credential + PIN
    - Create `src/app/api/vault/delete/[id]/route.ts` — `DELETE /api/vault/delete/:id`
      - Soft delete the entry
    - All routes require authenticated user (magic link session)
    - Input validation with Zod on all endpoints
    - **Test:** Store/list/update/delete CRUD flow, unauthenticated requests rejected, PIN never stored or returned, soft delete works
    - _Requirements: 3.2, 9.3, 5.9_

  - [x] 2.7 Web portal — magic link authentication
    - **Depends on:** 1.1, 1.2 (Wave 2)
    - Create `src/app/api/auth/magic-link/route.ts` — `POST /api/auth/magic-link`
      - Accept `{ phoneNumber }`
      - Generate a time-limited magic link token (15 min expiry)
      - Send magic link via SMS (Twilio) to the phone number
      - Store token hash in Supabase
    - Create `src/app/api/auth/verify/route.ts` — `POST /api/auth/verify`
      - Validate magic link token
      - Create Supabase auth session
      - Return session token
    - Create `src/app/(portal)/layout.tsx` — authenticated portal layout with session check
    - Create `src/app/(portal)/login/page.tsx` — magic link request form (phone number input)
    - Create `src/middleware.ts` — Next.js middleware to protect `/portal/*` routes, redirect unauthenticated to login
    - **Test:** Magic link generation, token verification, expired token rejection, session creation, middleware redirects unauthenticated users
    - _Requirements: 3.6, 3.7, 9.8_

- [x] 4. Checkpoint — Ensure Wave 2 services pass all tests and integrate with Wave 1
  - Ensure all tests pass, ask the user if questions arise.

### Wave 3 — Agent Logic and Features (Depends on Wave 1+2)

- [ ] 5. Wave 3: Agent Logic and Features

  - [ ] 3.1 Watcher — unused subscription detector
    - **Depends on:** 2.3 (Wave 3)
    - Create `src/agents/watcher/detectors/unused-subscription.ts`:
      - Implements `Detector` interface
      - Query `recurring_charges` where `days_since_usage >= 45` and `status = 'active'`
      - Cross-reference with `transactions` to confirm no recent usage
      - Generate `Insight` with type `unused_subscription`, merchant name, monthly cost, days since last use
      - Use `Money` class for all cost calculations
    - **Test:** Detects subscriptions unused for 45+ days, ignores recently used ones, correctly calculates monthly cost, handles edge case of subscription with no usage data
    - _Requirements: 4.5, 21.2, 21.6_

  - [ ] 3.2 Watcher — bill increase detector
    - **Depends on:** 2.3 (Wave 3)
    - Create `src/agents/watcher/detectors/bill-increase.ts`:
      - Implements `Detector` interface
      - Compare `recurring_charges.amount` vs `recurring_charges.previous_amount`
      - Flag when increase > 10%
      - Generate `Insight` with old amount, new amount, percentage change (all via `Money` class)
    - **Test:** Detects >10% increases, ignores <=10% changes, handles first-time charges (no previous amount), percentage calculation is exact
    - _Requirements: 4.4_

  - [ ] 3.3 Watcher — trial expiration detector
    - **Depends on:** 2.3 (Wave 3)
    - Create `src/agents/watcher/detectors/trial-expiration.ts`:
      - Implements `Detector` interface
      - Query `recurring_charges` where `is_trial = true` and `trial_end_date` within 3 days
      - Generate `Insight` with trial name, upcoming charge amount, days remaining
      - Include one-tap cancel action button data
    - **Test:** Detects trials ending within 3 days, ignores trials ending later, includes correct charge amount, handles already-expired trials
    - _Requirements: 4.6_

  - [ ] 3.4 Watcher — lifestyle inflation and cost creep detectors
    - **Depends on:** 2.3 (Wave 3)
    - Create `src/agents/watcher/detectors/lifestyle-inflation.ts`:
      - Implements `Detector` interface
      - Compare current month category totals vs 3-month rolling average
      - Flag categories with >15% increase
      - Generate `Insight` with category, current spend, average, percentage over
    - Create `src/agents/watcher/detectors/cost-creep.ts`:
      - Implements `Detector` interface
      - Track small incremental increases across multiple services
      - Aggregate monthly impact of all small increases
      - Generate `Insight` with total creep amount and list of contributing services
    - All calculations via `Money` class
    - **Test:** Lifestyle inflation detected at >15%, cost creep aggregates correctly, rolling average calculation is accurate, handles categories with sparse data
    - _Requirements: 4.7, 4.9_

  - [ ] 3.5 Watcher — anomalous transaction and behavioral pattern detectors
    - **Depends on:** 2.3 (Wave 3)
    - Create `src/agents/watcher/detectors/anomalous-transaction.ts`:
      - Implements `Detector` interface
      - Compare transaction amount vs user's average for that merchant/category
      - Flag when amount > 3x average
      - Generate urgent `Insight` (bypasses batching)
    - Create `src/agents/watcher/detectors/behavioral-pattern.ts`:
      - Implements `Detector` interface
      - Detect spending patterns (weekend splurges, payday spending spikes, emotional spending)
      - Generate `Insight` with pattern description and suggested awareness
    - Create `src/agents/watcher/detectors/forgotten-trial.ts`:
      - Implements `Detector` interface
      - Detect trial-to-paid conversions the user may not have noticed
    - **Test:** Anomalous detection triggers at 3x threshold, behavioral patterns identified from transaction history, forgotten trials caught after conversion
    - _Requirements: 4.8, 4.5, 4.6_

  - [ ] 3.6 Conductor agent — intent classification and routing
    - **Depends on:** 2.2, 2.4 (Wave 3)
    - Create `src/agents/conductor/classifier.ts`:
      - `classifyIntent(message)` — determine user intent from message text:
        - `cancel_subscription`, `check_balance`, `find_benefits`, `ask_question`, `approve_action`, `reject_action`, `snooze_action`, `stop_command`, `pause_command`, `change_mode`, `general_chat`
      - Extract entities (merchant name, amount, duration for pause)
      - Return `IntentClassification` with confidence score and target agent
    - Create `src/agents/conductor/router.ts`:
      - `routeToAgent(intent, userId)` — enqueue task to appropriate agent queue
      - Check trust phase guardrails before routing action intents
      - Handle STOP command — immediate kill switch (bypass queue)
    - Create `src/agents/conductor/worker.ts`:
      - BullMQ worker consuming from `CONDUCTOR` queue
      - Process inbound messages: classify, route, log event
      - Store every routing decision in `agent_event_logs` (append-only)
    - **Test:** Intent classification maps messages to correct intents, STOP command triggers kill switch immediately, routing respects trust phase, all events logged
    - _Requirements: 1.1, 1.6, 8.11, 10.6_

  - [ ] 3.7 Fixer agent — browser automation worker setup
    - **Depends on:** 1.1, 1.4, 2.4 (Wave 3)
    - Create `src/agents/fixer/browser-worker.ts`:
      - BullMQ worker consuming from `FIXER_BROWSER` queue
      - Spin up headless Playwright with Stagehand
      - Configure rotating residential proxy
      - Anti-bot stealth techniques (user agent rotation, viewport randomization, human-like delays)
      - Screenshot at every significant step, upload to Supabase Storage
      - Report progress updates via Redis pub/sub
    - Create `src/agents/fixer/concurrency.ts`:
      - Redis semaphore: `provider:{name}:sessions` counter with TTL
      - Max 10 concurrent sessions per provider
      - `acquireSession(provider)` / `releaseSession(provider)`
    - Create `src/agents/fixer/compatibility.ts`:
      - `checkCompatibility(provider)` — query `compatibility_scores` table
      - Skip browser automation if success rate < 50%
      - `updateCompatibility(provider, method, success)` — update stats after each attempt
    - Create `src/agents/fixer/screenshot.ts`:
      - `captureScreenshot(page, step)` — capture and upload to Supabase Storage
      - Return screenshot URL for inclusion in action logs
    - **Test:** Worker processes browser jobs, concurrency limiter enforces max 10, compatibility check skips low-success providers, screenshots captured and uploaded, progress updates sent
    - _Requirements: 5.1, 5.2, 5.6, 5.10, 5.11, 5.12_

  - [ ] 3.8 Voice agent — LLM personality modes (NVIDIA NIM)
    - **Depends on:** 2.5, 1.3 (Wave 3)
    - Create `src/agents/voice/llm.ts`:
      - `generatePersonalityResponse(content, mode, locale, userId)` — call NVIDIA NIM API (Llama 3.3 70B)
      - System prompts per personality mode (savage, hype, zen, mentor)
      - Cultural adaptation based on locale
      - Strict rule: LLM generates language AROUND numbers, never computes them
    - Create `src/agents/voice/sentiment.ts`:
      - `detectSentiment(message)` — analyze user message for emotional state
      - Return `SentimentResult` with sentiment, confidence, trigger keywords
      - `shouldAutoShiftToZen(sentiment)` — true for anxious/distressed/grief/crisis
    - Create `src/agents/voice/worker.ts`:
      - BullMQ worker consuming from `VOICE` queue
      - Load user preferences (personality mode, locale, safe/stealth/simplified mode flags)
      - Format message through personality pipeline, send via ChannelRouter
      - Fallback to templates if NIM API unavailable
    - **Test:** LLM called with correct system prompt per mode, sentiment detection identifies distress keywords, auto-shift to zen triggers correctly, template fallback works when LLM fails, numbers never computed by LLM
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 14.4, 14.5_

  - [ ] 3.9 Shareable card generation (OG images)
    - **Depends on:** 2.1, 1.2 (Wave 3)
    - Create `src/app/api/og/card/[cardId]/route.tsx`:
      - `GET /api/og/card/[cardId]` — render OG image via `@vercel/og` (ImageResponse)
      - Fetch card data from `shareable_cards` table by `cardId`
      - Render 1200x630 image with: action taken, dollar amount saved, invite link
      - No user financial data in URL (only cardId)
    - Create `src/lib/cards/generator.ts`:
      - `generateActionCard(action)` — create card for completed action
      - `generateWeeklySummary(userId)` — total saved this week, actions taken, cumulative total
      - `generateMonthlySummary(userId)` — "Money Story" Spotify Wrapped style
      - `generateMilestoneCard(userId, milestone)` — $100/$500/$1000/$5000 milestones
      - Each generates a `shareable_cards` row with unique `short_code` and `referral_code`
    - Create `src/app/r/[code]/route.ts`:
      - `GET /r/[code]` — redirect to signup, track referral in `referrals` table, increment `click_count`
    - **Test:** OG image renders at correct dimensions, card data fetched correctly, short URL redirects and tracks referral, milestone thresholds trigger correctly, no financial data leaked in URLs
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

  - [ ] 3.10 Web portal — bank linking UI
    - **Depends on:** 2.7, 1.2 (Wave 3)
    - Create `src/app/(portal)/accounts/page.tsx`:
      - Display linked bank accounts with institution name, account mask, status
      - "Link Bank Account" button leading to Plaid Link or SimpleFIN flow based on tier
    - Create `src/app/(portal)/accounts/link/page.tsx`:
      - Plaid Link integration (Premium) — embed Plaid Link component
      - SimpleFIN connection flow (Free) — access URL input
      - On success: store connection, trigger initial transaction sync, advance trust to Phase 1
    - Create `src/app/api/portal/link-bank/route.ts` — `POST /api/portal/link-bank`
      - Exchange Plaid public token or store SimpleFIN access URL
      - Create `bank_connections` row, trigger trust phase advance (Phase 0 to Phase 1)
    - Create `src/app/api/portal/accounts/route.ts` — `GET /api/portal/accounts`
    - Create `src/app/api/portal/unlink-bank/[id]/route.ts` — `DELETE /api/portal/unlink-bank/:id`
      - Revoke access token, soft-delete connection, downgrade trust if no remaining connections
    - **Test:** Plaid Link flow completes, SimpleFIN connection stores, accounts display with masked numbers, unlinking revokes tokens and downgrades trust, Phase 0 to 1 transition on first link
    - _Requirements: 3.1, 3.4, 8.2, 9.2, 21.1_

- [ ] 6. Checkpoint — Ensure Wave 3 agent logic passes all tests
  - Ensure all tests pass, ask the user if questions arise.

### Wave 4 — Advanced Features (Depends on Wave 1+2+3)

- [ ] 7. Wave 4: Advanced Features

  - [ ] 4.1 Fixer — subscription cancellation flow (the MVP)
    - **Depends on:** 3.1, 3.6, 3.7 (Wave 4)
    - Create `src/agents/fixer/cancellation.ts`:
      - `executeCancellation(action: ApprovedAction)` — orchestrate the 4-step fallback chain:
        1. Check compatibility database — skip to next if success rate < 50%
        2. `attemptBrowserAutomation(action)` — dispatch browser job, poll status, collect screenshots
        3. `attemptApiIntegration(action)` — try direct API cancellation if available
        4. `generateGuidedWalkthrough(action)` — step-by-step instructions for manual cancellation
        5. `generateHumanDelegation(action)` — pre-drafted email/chat script
      - Enforce destructive delay: 60-second wait with cancel option before execution
      - Cross-reference action against original user request
      - Verify pre-action state (optimistic locking — subscription still active?)
      - Block two destructive actions on same account within 5 minutes
    - Create `src/agents/fixer/worker.ts`:
      - BullMQ worker consuming from `FIXER` queue
      - Check trust phase guardrails (Phase 2: $25 limit, approval required; Phase 3: tier-based)
      - Free tier: guided walkthrough only (max 3/month)
      - Premium tier: unlimited browser automation
      - Log every action to `action_logs` (append-only) with screenshots
      - On success: trigger shareable card generation
    - Create `src/agents/fixer/guided-walkthrough.ts`:
      - `generateWalkthrough(provider, actionType)` — step-by-step instructions with exact URLs
      - Send steps one at a time via Voice agent
    - **Test:** Fallback chain executes in order, compatibility check skips low-success providers, destructive delay enforced, 5-minute cooldown between destructive actions, free tier limited to walkthrough, premium gets automation, shareable card generated on success, all actions logged
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.10, 5.12, 5.13, 5.14, 10.4, 10.7, 10.8, 21.3, 21.4_

  - [ ] 4.2 Conductor — conflict resolution and life change detection
    - **Depends on:** 3.6 (Wave 4)
    - Create `src/agents/conductor/conflict-resolver.ts`:
      - `collectRecommendations(userId, windowMs)` — gather agent recommendations within 5-second window
      - `resolveConflict(recs, priorities)` — score against user's life-stage priorities, emit single unified recommendation
      - Store conflict resolution decisions in `agent_event_logs`
    - Create `src/agents/conductor/life-change.ts`:
      - `detectLifeChange(userId, transactions)` — scan for indicators:
        - Job loss keywords, sudden income cessation, divorce-related transactions, new childcare charges, relocation patterns
      - `shiftPriorities(userId, event)` — update `user_preferences.life_stage_priorities`
      - Priority shift completes within 60 seconds of detection
    - Create `src/agents/conductor/redistribution.ts`:
      - `redistributeTasks(failedAgent)` — redistribute critical tasks to remaining agents when one goes down
      - Notify user via Voice that a specialist is temporarily offline
    - **Test:** Conflict resolution picks highest-priority recommendation, life change detection triggers on income cessation, priority shift completes <60s, task redistribution works when agent fails
    - _Requirements: 1.2, 1.3, 1.5, 16.1_

  - [ ] 4.3 Watcher — overdraft prediction engine
    - **Depends on:** 3.1, 2.3 (Wave 4)
    - Create `src/agents/watcher/overdraft.ts`:
      - `predictOverdraft(userId)` — project balance forward 3-5 days:
        - Current balance, pending transactions, recurring charges due, average daily discretionary spending
        - Apply 20% safety buffer (inflate projected expenses)
      - All calculations via `Money` class (NEVER IEEE 754)
      - Return `OverdraftPrediction` with predicted date, shortfall, suggested actions
      - Store prediction in `overdraft_predictions` table
    - Create `src/agents/watcher/overdraft-guarantee.ts`:
      - `checkGuaranteeClaim(userId, overdraftEvent)`:
        - If Watcher failed to predict within 3-5 day window AND user had 30+ days of data
        - Credit up to $35, limited to 1 per user per quarter
      - Log guarantee claims in `overdraft_predictions` table
    - Create `src/agents/watcher/overdraft-accuracy.ts`:
      - Track prediction accuracy: target 85% true positive, <10% false positive
    - **Test:** Prediction uses exact arithmetic, 20% buffer applied correctly, suggested actions generated, guarantee triggers on missed prediction with sufficient history, accuracy tracking records outcomes
    - _Requirements: 4.2, 4.3, 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

  - [ ] 4.4 Morning briefing assembly and notification batching
    - **Depends on:** 3.8, 3.6 (Wave 4)
    - Create `src/agents/voice/briefing.ts`:
      - `assembleMorningBriefing(userId)`:
        - Overnight insights, pending actions, daily snapshot (balance, spending, upcoming bills, overdraft risk)
        - Ghost action total for Phase 1 users
      - Deliver at user's preferred time (default 8:00 AM local)
    - Create `src/lib/notifications/batcher.ts`:
      - `enqueueNotification(userId, type, content, urgency)` — immediate vs batched
      - `isUrgent(insight)` — check against `URGENT_TYPES` (overdraft, anomalous tx, security alert, kill switch, action failure)
      - Max 3-5 messages per day enforcement
    - Create `src/app/api/cron/morning-briefing/route.ts`:
      - Vercel cron job — query users by `morning_briefing_time` and timezone, trigger briefing assembly
    - **Test:** Briefing includes all overnight insights, urgent notifications bypass batching, daily message limit enforced, cron triggers at correct user-local times
    - _Requirements: 2.4, 19.4, 19.5, 8.3_

  - [ ] 4.5 Ghost action generation (Phase 1)
    - **Depends on:** 2.4, 3.1 (Wave 4)
    - Create `src/agents/watcher/ghost-actions.ts`:
      - `generateGhostAction(userId, insight)` — simulated action with dollar amount saved (via `Money` class)
      - `getRunningTotal(userId)` — sum all ghost action savings
      - `formatGhostActionMessage(ghostAction)` — "If you'd let me, I would have saved you $X"
    - Only active for Phase 1 users
    - Include running total in morning briefing
    - **Test:** Ghost actions created only for Phase 1 users, savings calculated correctly, running total accumulates, message formatted with correct amounts
    - _Requirements: 8.3, 14.1_

  - [ ] 4.6 Web portal — settings and preferences UI
    - **Depends on:** 3.9, 3.10 (Wave 4)
    - Create `src/app/(portal)/settings/page.tsx`:
      - Personality mode selector, notification preferences, trusted contact, channel preference
      - Safe mode toggle + code word + cover topic, stealth mode, simplified mode
      - Blocked merchants list, affiliates toggle, phone number re-linking
    - Create settings API routes: `GET/PUT /api/settings`, `PUT /api/settings/personality`, `PUT /api/settings/safe-mode`, `PUT /api/settings/blocked-merchants`, `PUT /api/settings/phone-number`
    - Create quick-exit button in portal layout for Safe Mode users
    - All routes require authentication, input validation with Zod
    - **Test:** All settings save and load correctly, safe mode quick-exit works, blocked merchants persist, phone re-linking transfers data
    - _Requirements: 3.3, 3.5, 3.7, 7.1, 10.3, 13.2, 20.4_

- [ ] 8. Checkpoint — Ensure Wave 4 features pass all tests
  - Ensure all tests pass, ask the user if questions arise.

### Wave 5 — Integration, Safety, and Polish (Depends on All Previous Waves)

- [ ] 9. Wave 5: Integration and Polish

  - [ ] 5.1 End-to-end MVP flow — connect bank, find subs, cancel, shareable card
    - **Depends on:** 4.1, 4.4, 3.9 (Wave 5)
    - Create `src/flows/subscription-assassin.ts`:
      - Wire the complete MVP flow end-to-end:
        1. User sends first message — Voice responds with crew intro (< 5 seconds)
        2. Onboarding conversation (personality, goal, cultural prefs) within 5 exchanges
        3. User connects bank via portal — Phase 0 to Phase 1 transition
        4. Watcher scans 90 days of transactions — identifies recurring charges — flags unused subs (45+ days)
        5. Voice presents unused subs with monthly cost — "Holy Shit Moment" (first insight within 60 seconds of bank connect)
        6. User says "cancel it" — Conductor classifies intent — routes to Fixer
        7. Fixer checks guardrails — executes cancellation (automation or walkthrough based on tier)
        8. On success — generate shareable card — deliver via Voice
        9. If multiple cancellations — generate summary card with total savings
      - Generate SMS onboarding code ("text MONEY to [number]") for sharing
    - Create `src/app/api/cron/bank-sync/route.ts`:
      - Vercel cron — trigger bank sync every 6 hours for active users
      - On sync complete: trigger Watcher analysis pipeline
    - **Test:** Full flow from first message to shareable card, onboarding completes in <=5 exchanges, first insight within 60s of bank connect, cancellation flow works for both free and premium tiers, shareable card generated with correct savings amount
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.6, 19.1, 19.2, 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7_

  - [ ] 5.2 Trust Ladder phase transitions — full lifecycle
    - **Depends on:** 2.4, 3.6 (Wave 5)
    - Create `src/lib/trust/transitions.ts`:
      - Wire phase transitions into the full system:
        - Phase 0 to 1: triggered by `link-bank` API route
        - Phase 1 to 2: triggered by user chat command "enable actions" or portal toggle
        - Phase 2 to 3: triggered when eligibility check passes (20+ approvals, >70% rate, KYC)
        - Voluntary downgrade: chat command or portal setting
        - Kill switch: STOP command from any phase
        - Re-engagement: killed to Phase 0 when user re-engages
      - Each transition logged in `agent_event_logs`
      - Phase 3 offer presented via Voice when eligible
    - Create trust API routes: `GET /api/trust/status`, `POST /api/trust/advance`, `POST /api/trust/downgrade`, `POST /api/trust/kill-switch`
    - **Test:** All phase transitions work correctly, invalid transitions rejected, kill switch completes <5s from any phase, re-engagement from killed state works, all transitions logged
    - _Requirements: 8.1, 8.2, 8.4, 8.7, 8.8, 8.9, 8.10, 8.11, 9.6_

  - [ ] 5.3 Kill switch implementation
    - **Depends on:** 2.4 (Wave 5)
    - Create `src/lib/trust/kill-switch.ts`:
      - `executeKillSwitch(userId)` — must complete within 5 seconds:
        1. Revoke all bank access tokens (Plaid + SimpleFIN)
        2. Lock credential vault
        3. Halt all in-progress agent operations (publish kill event via Redis pub/sub)
        4. Cancel all pending BullMQ jobs for this user
        5. Set `trust_phase = 'killed'`
        6. Send confirmation to user via Voice (on all channels)
      - Return `KillSwitchResult` with timing and status of each step
    - Wire STOP command detection in Conductor (bypass queue — immediate execution)
    - Wire STOP button in every Voice action message
    - Wire kill switch button on every portal page
    - **Test:** Kill switch completes <5s, all tokens revoked, vault locked, operations halted, confirmation sent, STOP command works from chat, button works from portal
    - _Requirements: 8.11, 9.6, 10.6_

  - [ ] 5.4 Safe mode, Stealth mode, and Survival mode
    - **Depends on:** 2.5, 3.8 (Wave 5)
    - Create `src/lib/modes/safe-mode.ts`:
      - `activateSafeMode(userId, codeWord)` — set flag, store code word and cover topic
      - `detectCodeWord(message, userId)` — check if message contains user's code word
      - When active: all financial messages disguised as cover topic
      - Portal quick-exit button clears back-navigation
    - Create `src/lib/modes/stealth-mode.ts`:
      - When active: Voice removes specific amounts and account details from all messages
    - Create `src/lib/modes/survival-mode.ts`:
      - `activateSurvivalMode(userId)` — triggered by Conductor life change detection
      - Watcher: increase overdraft check frequency to daily, lower safety buffer threshold
      - Hunter: prioritize emergency resources (unemployment, SNAP, LIHEAP, food banks, rent assistance)
      - Voice: suppress non-essential notifications
      - Send compassionate activation message
      - `deactivateSurvivalMode(userId)` — when income resumes and balance stabilizes for 2 weeks
    - Create `src/app/api/cron/survival-mode-check/route.ts` — cron to check deactivation conditions
    - **Test:** Safe mode disguises messages, code word activates safe mode, stealth mode hides amounts, survival mode shifts priorities, auto-deactivates on recovery
    - _Requirements: 13.1, 13.2, 13.7, 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7_

  - [ ] 5.5 Couples mode (Crew For Two)
    - **Depends on:** 2.4, 2.7 (Wave 5)
    - Create couples API routes: `POST /api/couples/link`, `POST /api/couples/accept`, `DELETE /api/couples/unlink`
    - Create `src/lib/couples/shared-view.ts`:
      - Aggregate transactions and insights from both users
      - Maintain separate trust levels per partner
      - Shared action approval: require both partners for joint account actions
      - Rejection wins all conflicts on shared decisions
    - Voice delivers communications individually per partner with their own personality mode
    - **Test:** Link/accept/unlink flow, shared view aggregates correctly, separate trust levels, both-partner approval for shared actions, rejection wins, unlinking separates cleanly
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_

  - [ ] 5.6 Hardship pricing and subscription tier management
    - **Depends on:** 2.7 (Wave 5)
    - Create `src/lib/subscriptions/tier-manager.ts`:
      - `getCurrentTier(userId)`, `upgradeToPremium(userId)`, `applyHardshipPricing(userId)`, `startFreeTrial(userId)`
      - Feature gating: check tier before allowing browser automation, WhatsApp, autopilot, LLM Voice
      - Hardship pricing ($1.99/month) when Watcher detects sustained stress
    - Create `src/agents/voice/upsell.ts`:
      - When free user attempts premium action: explain limitation, offer 7-day trial
      - Never gate overdraft predictions behind premium
    - **Test:** Tier checks gate features correctly, hardship pricing triggers on stress indicators, free trial activates and expires, overdraft alerts available on all tiers
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8_

  - [ ] 5.7 Hunter agent — government benefits and opportunity search
    - **Depends on:** 1.3, 2.4, 1.2 (Wave 5)
    - Create `src/agents/hunter/benefits.ts`:
      - `searchGovernmentBenefits(profile)` — SNAP, WIC, TANF, LIHEAP, other programs
      - `filterByImmigrationStatus(opps, status)` — exclude restricted programs unless user confirmed eligible
      - `filterByReligiousPreferences(opps, prefs)` — halal/Shariah-compliant/kosher options
    - Create `src/agents/hunter/rates.ts` — find higher-yield savings (>$10/year difference)
    - Create `src/agents/hunter/refunds.ts` — class action settlements, overcharges, rebates
    - Create `src/agents/hunter/alternatives.ts` — cheaper alternatives with side-by-side comparison
    - Create `src/agents/hunter/affiliates.ts`:
      - Respect user's affiliate preference, disclose relationship, show full math, rank by user savings not commission
    - Create `src/agents/hunter/worker.ts` — BullMQ worker, survival mode prioritizes emergency resources
    - **Test:** Benefits search returns relevant programs, immigration filter works, religious filter works, rate threshold enforced, affiliate disclosure included, ranking by user savings
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 13.4, 13.5_

  - [ ] 5.8 Onboarding flow and first value moment
    - **Depends on:** 3.6, 3.8, 2.1 (Wave 5)
    - Create `src/agents/conductor/onboarding.ts`:
      - `handleFirstMessage(userId, message)` — respond within 5 seconds with crew intro
      - `handleOnboardingStep(userId, step, message)` — 5 steps within 5 exchanges
      - `triggerHolyShitMoment(userId)` — first insight within 60 seconds of bank connect
    - Create `src/lib/onboarding/sms-code.ts` — generate shareable SMS onboarding code
    - **Test:** First response within 5 seconds, onboarding in 5 exchanges, first insight within 60s, preferences stored, SMS code generated
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 13.5_

  - [ ] 5.9 Data export and health monitoring
    - **Depends on:** 1.1, 1.2, 1.4 (Wave 5)
    - Create `src/app/api/export/data/route.ts` — `GET /api/export/data` (JSON/CSV, authenticated, rate-limited)
    - Create `src/app/api/health/route.ts` — `GET /api/health` (Supabase, Redis, queue depths)
    - Create `src/app/api/health/agents/route.ts` — `GET /api/health/agents` (per-agent metrics)
    - Create `src/app/api/cron/agent-health/route.ts` — cron to check agent health, trigger failover
    - Create `src/lib/trust/trusted-contact.ts` — grant read-only export after 90 days inactivity
    - **Test:** Data export includes all user data, health endpoints return correct status, agent health tracks metrics, trusted contact access after 90 days
    - _Requirements: 19.7, 20.5, 20.6, 2.8_

- [ ] 10. Final checkpoint — Ensure all tests pass across all waves
  - Ensure all tests pass, ask the user if questions arise.
  - Verify end-to-end MVP flow: first message to bank connect to find unused subs to cancel to shareable card
  - Verify all 21 requirements have coverage in implementation

## Notes

- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation between waves
- The **Dependency Index** at the top is the source of truth for parallel execution — all tasks within the same wave with satisfied dependencies can run simultaneously
- All monetary calculations MUST use the `Money` class (Decimal.js wrapper) — never IEEE 754 floats
- All user data tables MUST have RLS policies enabled
- The `action_logs` table is append-only — no UPDATE or DELETE
- Every agent action must be logged with screenshots where applicable
