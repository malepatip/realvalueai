# Requirements Document — RealValue AI Financial Agent

## Introduction

RealValue is a team of AI agents that live inside your messaging apps — WhatsApp, Telegram, and SMS. There is no app to download. You message your crew like you'd message a friend, and they DO things for you: cancel subscriptions, negotiate bills, find government benefits, predict overdrafts, and fight for every dollar you're leaving on the table.

Built for students drowning in fees, single parents juggling three jobs, and paycheck-to-paycheck families who could never afford a financial advisor — RealValue replaces the $5,000/year advisor with a $4.99/month AI crew that never sleeps, never judges, and never stops looking for ways to save you money.

The system is a multi-agent architecture where five specialized agents (Conductor, Watcher, Fixer, Hunter, Voice) collaborate behind a single conversational personality. Users interact through chat-first messaging platforms, with a minimal web portal only for bank linking, credential management, and settings. Trust is earned progressively through a four-phase Trust Ladder, and every action the system takes is transparent, reversible, and auditable.

The MVP (V1) is the Subscription Assassin: connect your bank, the Watcher finds unused subscriptions, you say "cancel it" in chat, and the Fixer cancels it — then you get a shareable card showing how much you saved.

## Glossary

- **Conductor**: The orchestrating agent that manages priorities across all other agents, resolves inter-agent conflicts, detects life changes (job loss, divorce, financial crisis), and shifts crew priorities accordingly. If the Conductor fails, agents operate independently on last known priorities.
- **Watcher**: The monitoring agent that observes every transaction, balance, and rate change. Predicts overdrafts 3-5 days out with a 20% safety buffer. Detects bill increases, unused subscriptions, anomalies, lifestyle inflation, cost creep, forgotten trial conversions, and behavioral spending patterns. If the Watcher fails, other agents continue working but without new detections.
- **Fixer**: The browser automation agent that takes real-world action. Uses Playwright + Stagehand to navigate actual websites — cancels subscriptions, negotiates bills via provider live chat, fills government benefits applications, and moves money via bank APIs. Screenshots every action as proof. Fallback chain: browser automation → API → guided walkthrough → human delegation.
- **Hunter**: The opportunity-finding agent that searches for money left on the table — better savings rates, government benefits (SNAP, WIC, TANF, LIHEAP), refunds owed, cheaper alternatives. Searches public databases. Affiliate recommendations are always clearly disclosed with full math shown.
- **Voice**: The communication agent responsible for ALL user-facing messages. Supports personality modes: Savage (roasts your spending), Hype (celebrates wins), Zen (anxiety-friendly, numbers-optional), and Mentor (educational). Handles cultural adaptation, sentiment detection for grief/crisis, and template fallback if LLM fails.
- **Trust_Ladder**: The four-phase progressive autonomy system. Phase 0 (Chat Only) → Phase 1 (Read-Only) → Phase 2 (Small Actions with copilot approval) → Phase 3 (Autopilot with tiered execution). Each phase has specific unlock criteria.
- **Phase_0**: Chat-only mode. No bank access. Crew introduces itself, builds relationship, provides generic financial tips based on conversation.
- **Phase_1**: Read-only mode. User connects bank via Plaid or SimpleFIN. System observes transactions and generates ghost actions ("If you'd let me, I would have saved you $X").
- **Phase_2**: Small actions mode. Per-action limit $25, daily limit $100. Every action requires explicit user approval (copilot mode). STOP command always visible.
- **Phase_3**: Autopilot mode. Tier 1 actions auto-execute, Tier 2 actions execute with notification and 24-hour undo window, Tier 3 actions require approval. Kill switch available at all times.
- **Ghost_Action**: A simulated action shown to the user during Phase 1 that demonstrates what the system WOULD have done if given permission, along with the dollar amount saved. Creates a running total of missed savings to motivate trust progression.
- **Credential_Vault**: AES-256 encrypted storage for service login credentials (Netflix, Hulu, etc.), encrypted with a key derived from the user's 6-digit PIN. Managed exclusively through the web portal. Credentials are decrypted only in ephemeral sandboxed containers and discarded after use.
- **Compatibility_Database**: A community-maintained, open-source database tracking browser automation success rates per service provider. Updated when providers change their interfaces or block automation.
- **Shareable_Card**: A generated image (via @vercel/og) showing a user's savings achievement, formatted for sharing in WhatsApp/Telegram groups. Includes invite link. The output IS the marketing.
- **Safe_Mode**: A domestic violence protection feature activated by a user-defined code word. Financial messages are disguised as innocuous content. Web portal includes quick-exit button.
- **Survival_Mode**: Automatically activated during detected financial stress (job loss, sudden income drop). Shifts all agent priorities to essential spending, pauses non-critical notifications, and focuses on emergency resources.
- **Stealth_Mode**: Privacy feature where financial messages are vague enough that someone reading the chat wouldn't learn specific dollar amounts or account details.
- **Kill_Switch**: The STOP command that immediately revokes all bank tokens, locks the Credential Vault, halts all agent operations, and puts the system in a safe state.
- **Guided_Walkthrough**: Step-by-step instructions provided to free-tier users (or when browser automation fails) to manually complete an action, with the system guiding each step via chat messages.
- **Deterministic_Layer**: The computational layer that handles all dollar amounts, calculations, and financial math using exact numeric types (decimal/numeric, never IEEE 754 floating point). The LLM generates natural language AROUND these numbers but never computes them.
- **SimpleFIN**: Free-tier bank data provider for read-only transaction and balance access.
- **Plaid**: Premium-tier bank data provider with broader institution coverage and additional capabilities.
- **Stagehand**: AI-powered browser automation framework built on Playwright that can interpret and interact with web pages using natural language understanding, including CAPTCHA solving via Browserbase.
- **BullMQ**: Redis-based job queue system for managing background agent tasks, scheduling, and state management.
- **KYC_Verification**: Know Your Customer identity verification required before Phase 3 autopilot access.
- **Savage_Mode**: Voice personality that roasts the user's spending habits with humor and tough love.
- **Hype_Mode**: Voice personality that celebrates financial wins with enthusiasm and encouragement.
- **Zen_Mode**: Voice personality designed for financial anxiety — uses calming language, optionally hides specific numbers, focuses on progress over perfection.
- **Mentor_Mode**: Voice personality that explains financial concepts in simple educational terms.
- **Crew_For_Two**: Couples mode where two users share a linked financial view with separate trust levels, where rejection by either partner wins conflicts on shared decisions.


## Requirements

### Requirement 1: Multi-Agent Orchestration

**User Story:** As a single parent working two jobs, I want a team of AI specialists watching my finances around the clock, so that I don't have to spend my rare free time worrying about money.

#### Acceptance Criteria

1. THE Conductor SHALL route each incoming user message or system event to the appropriate specialized agent (Watcher, Fixer, Hunter, or Voice) based on message intent and current system state.
2. WHEN two or more agents produce conflicting recommendations for the same financial decision, THE Conductor SHALL resolve the conflict using the user's current life-stage priorities and present a single unified recommendation through the Voice.
3. WHEN the Conductor detects a life change event (job loss, divorce, sudden income drop, new baby), THE Conductor SHALL shift all agent priorities to match the new life stage within 60 seconds of detection.
4. IF the Conductor becomes unavailable, THEN THE Watcher, Fixer, Hunter, and Voice SHALL continue operating independently using their last known priority configuration.
5. IF any individual agent (Watcher, Fixer, Hunter) becomes unavailable, THEN THE Conductor SHALL redistribute that agent's critical tasks to remaining available agents and notify the user via the Voice that a specialist is temporarily offline.
6. THE Conductor SHALL maintain an immutable event log recording every inter-agent message, priority change, and conflict resolution with timestamps.
7. WHILE the system is in Survival_Mode, THE Conductor SHALL prioritize Watcher overdraft predictions and Hunter emergency-resource searches above all other agent tasks.

### Requirement 2: Chat-First Messaging Interface

**User Story:** As a college student who lives on my phone, I want to manage my money through the same apps I already use every day, so that I don't need to download yet another finance app I'll forget about.

#### Acceptance Criteria

1. THE Voice SHALL deliver all user-facing communication through Telegram Bot API as the primary free-tier channel.
2. WHERE the user has a Premium subscription, THE Voice SHALL deliver communication through WhatsApp Business API as the primary channel.
3. IF the primary messaging channel (Telegram or WhatsApp) becomes unavailable, THEN THE Voice SHALL fall back to Twilio SMS delivery within 30 seconds.
4. THE Voice SHALL batch non-urgent notifications into a maximum of 3-5 messages per day, delivered as a morning briefing plus action requests.
5. WHEN the Voice delivers an action request via WhatsApp, THE Voice SHALL include interactive message buttons (approve / reject / snooze) for one-tap response.
6. WHEN the Voice delivers an action request via Telegram, THE Voice SHALL include inline keyboard buttons (approve / reject / snooze) for one-tap response.
7. THE Voice SHALL present all agent communications through a single unified personality, regardless of which backend agent generated the content.
8. THE Voice SHALL maintain conversation context across messaging sessions using the user's phone number as the persistent identity, with conversation state stored in Supabase.
9. IF the user sends a message on a different messaging platform than their primary channel, THEN THE Voice SHALL recognize the user by phone number and continue the conversation seamlessly.

### Requirement 3: Web Portal (Minimal Scope)

**User Story:** As someone who doesn't trust giving my bank login to a chat bot, I want a secure web page where I can connect my bank and manage sensitive settings, so that I feel safe knowing my credentials aren't floating around in a chat.

#### Acceptance Criteria

1. THE Web_Portal SHALL provide a Plaid Link or SimpleFIN connection flow for users to link bank accounts with read-only access.
2. THE Web_Portal SHALL provide a Credential_Vault management interface where users can add, update, and delete service login credentials.
3. THE Web_Portal SHALL provide a settings interface for personality mode selection, notification preferences, trusted contact designation, and channel preferences.
4. THE Web_Portal SHALL NOT replicate any financial monitoring, insight, or action functionality available through the chat interface.
5. WHEN a user in Safe_Mode accesses the Web_Portal, THE Web_Portal SHALL display a quick-exit button that immediately navigates to a neutral website.
6. THE Web_Portal SHALL require authentication via a magic link sent to the user's registered phone number.
7. THE Web_Portal SHALL allow users to re-link their phone number if it changes, transferring all conversation state and account data to the new number.

### Requirement 4: Watcher — Transaction Monitoring and Insight Detection

**User Story:** As a family living paycheck to paycheck, I want someone watching my account who will warn me BEFORE I overdraft — not after the bank charges me $35, so that I stop losing money to fees I can't afford.

#### Acceptance Criteria

1. WHEN a new transaction posts to a linked bank account, THE Watcher SHALL categorize the transaction using the two-pass categorization engine (500+ rules, targeting 95% accuracy).
2. THE Watcher SHALL predict potential overdraft events 3-5 days in advance using historical spending patterns, upcoming known bills, and current balance, applying a 20% safety buffer to all predictions.
3. WHEN the Watcher predicts an overdraft within 5 days, THE Watcher SHALL alert the user via the Voice with the predicted date, projected shortfall amount (from the Deterministic_Layer), and suggested actions to avoid the overdraft.
4. WHEN a recurring bill amount increases by more than 10% compared to the previous billing cycle, THE Watcher SHALL flag the increase and notify the user with the exact old amount, new amount, and percentage change.
5. WHEN a subscription service has not been used (no associated transaction or login activity) for 45 or more days, THE Watcher SHALL flag the subscription as potentially unused and recommend cancellation.
6. WHEN a free trial is detected and the trial end date is within 3 days, THE Watcher SHALL alert the user with the upcoming charge amount and a one-tap cancel option.
7. THE Watcher SHALL detect lifestyle inflation by comparing monthly spending category totals against the user's 3-month rolling average and flagging categories that increase by more than 15%.
8. WHEN the Watcher detects an anomalous transaction (amount exceeding 3x the user's average for that merchant or category), THE Watcher SHALL alert the user and ask for confirmation that the charge is expected.
9. THE Watcher SHALL track recurring cost creep — small incremental increases across multiple services that individually seem insignificant but collectively represent meaningful spending growth — and report the aggregate monthly impact.
10. ALL dollar amounts computed by the Watcher SHALL be calculated by the Deterministic_Layer using exact numeric types (decimal/numeric, never IEEE 754 floating point) to prevent rounding errors in financial calculations.

### Requirement 5: Fixer — Browser Automation and Action Execution

**User Story:** As someone who's been meaning to cancel three subscriptions for months but keeps putting it off because the cancellation flows are deliberately confusing, I want my AI crew to just DO it for me, so that I stop bleeding money on things I don't use.

#### Acceptance Criteria

1. WHEN a user approves a cancellation action, THE Fixer SHALL execute the cancellation using headless Playwright on a dedicated long-running container (Railway or Fly.io), not on Vercel serverless.
2. THE Fixer SHALL capture a screenshot at every significant step of a browser automation session and deliver the screenshots to the user via chat as proof of action.
3. IF browser automation fails for a given service provider, THEN THE Fixer SHALL attempt the action via direct API integration as a second fallback.
4. IF both browser automation and API integration fail, THEN THE Fixer SHALL generate a step-by-step Guided_Walkthrough for the user to complete the action manually.
5. IF the Guided_Walkthrough is not feasible, THEN THE Fixer SHALL offer to delegate the task to the user with pre-drafted communication (email template, chat script) for the user to send.
6. THE Fixer SHALL check the Compatibility_Database for the target service provider's current automation success rate before attempting browser automation, and skip directly to the next fallback if the success rate is below 50%.
7. THE Fixer SHALL verify the current state of the target account or subscription BEFORE executing any action, using optimistic locking to prevent acting on stale data.
8. WHEN the Fixer is about to execute a destructive action (cancellation, plan change, money movement), THE Fixer SHALL impose a 60-second delay with a visible cancel option before execution, and cross-reference the action against the original user request.
9. THE Fixer SHALL decrypt Credential_Vault entries only in ephemeral sandboxed containers, and discard all decrypted credentials from memory immediately after the automation session completes.
10. THE Fixer SHALL enforce a maximum of 10 concurrent browser automation sessions per service provider to avoid triggering rate limits or anti-bot detection.
11. THE Fixer SHALL use anti-bot stealth techniques and rotating residential proxies for browser automation sessions.
12. WHILE the Fixer is executing a browser automation session, THE Fixer SHALL send progress updates to the user via chat at each major step (navigating, logging in, confirming cancellation, complete).
13. WHERE the user has a Free subscription, THE Fixer SHALL provide Guided_Walkthrough only (maximum 3 per month) instead of browser automation.
14. WHERE the user has a Premium subscription, THE Fixer SHALL provide unlimited browser automation actions.

### Requirement 6: Hunter — Opportunity Discovery

**User Story:** As an immigrant family trying to build a life in a new country, I want someone who knows every government program, every better rate, and every refund I'm owed, so that I stop missing out on money that's meant for people like me.

#### Acceptance Criteria

1. THE Hunter SHALL search public databases for government benefits (SNAP, WIC, TANF, LIHEAP, and other federal and state programs) that the user may qualify for based on their financial profile and household information.
2. WHEN the Hunter identifies a government benefit the user may qualify for, THE Hunter SHALL present the benefit name, estimated monthly value, eligibility requirements, and a one-tap action to begin the application process.
3. THE Hunter SHALL search for higher-yield savings accounts and compare them against the user's current savings rate, presenting opportunities where the rate difference would yield more than $10 per year on the user's current balance.
4. WHEN the Hunter recommends a financial product that generates affiliate commission, THE Hunter SHALL clearly disclose the affiliate relationship, show the full savings math, display the commission amount, and rank recommendations by user savings — not by commission value.
5. THE Hunter SHALL allow users to disable affiliate recommendations entirely via a setting in the Web_Portal.
6. THE Hunter SHALL search for refunds owed to the user (class action settlements, overcharges, government rebates) by monitoring public settlement databases and matching against the user's transaction history.
7. WHEN the Hunter finds a cheaper alternative for a service the user currently pays for, THE Hunter SHALL present a side-by-side comparison showing the current cost, alternative cost, annual savings, and any trade-offs.
8. THE Hunter SHALL NOT recommend any government program that requires citizenship or legal residency status unless the user has explicitly confirmed their eligibility status during onboarding.

### Requirement 7: Voice — Personality and Communication System

**User Story:** As someone with crippling financial anxiety who can't even look at my bank balance without panicking, I want my AI crew to talk to me in a way that doesn't make me feel worse about my situation, so that I can actually engage with my finances instead of hiding from them.

#### Acceptance Criteria

1. THE Voice SHALL support four personality modes: Savage_Mode (humorous roasts of spending habits), Hype_Mode (enthusiastic celebration of financial wins), Zen_Mode (calming, anxiety-friendly language with optional number hiding), and Mentor_Mode (educational explanations of financial concepts).
2. WHEN the user selects Zen_Mode, THE Voice SHALL replace specific dollar amounts with qualitative descriptions (e.g., "a little more than usual" instead of "$47.23 over budget") unless the user explicitly requests numbers.
3. THE Voice SHALL detect user sentiment from message tone and content, and automatically shift to Zen_Mode when signs of financial distress, anxiety, or grief are detected.
4. WHEN the Voice detects keywords or sentiment patterns indicating grief or crisis (death of a family member, medical emergency, job loss), THE Voice SHALL auto-shift to Zen_Mode, pause non-critical notifications for 7 days, and offer the option to pause all communications.
5. THE Voice SHALL adapt cultural references, humor style, and financial terminology based on the user's locale and cultural preferences set during onboarding.
6. IF the LLM service (NVIDIA NIM API) becomes unavailable, THEN THE Voice SHALL fall back to pre-written template messages for all critical communications (overdraft alerts, action confirmations, error notifications) and never go silent.
7. THE Voice SHALL generate all natural language content around financial data, but SHALL NOT compute, calculate, or estimate any dollar amounts — all numeric values SHALL come exclusively from the Deterministic_Layer.
8. WHEN the Voice delivers a message containing financial data, THE Voice SHALL never include full account numbers, displaying only the last 4 digits of any account identifier.
9. WHILE Stealth_Mode is active, THE Voice SHALL make all financial messages vague enough that a third party reading the chat would not learn specific amounts, account details, or financial actions being taken.

### Requirement 8: Trust Ladder — Progressive Autonomy

**User Story:** As someone who's been burned by fintech apps before, I want to start slow and give my AI crew more control only after they've proven they know what they're doing, so that I never feel like I've lost control of my own money.

#### Acceptance Criteria

1. THE Trust_Ladder SHALL start every new user at Phase_0 (chat only, no bank access, relationship building and generic financial tips).
2. WHEN a user connects a bank account via the Web_Portal, THE Trust_Ladder SHALL advance the user to Phase_1 (read-only monitoring with Ghost_Actions).
3. WHILE a user is in Phase_1, THE Watcher SHALL generate Ghost_Actions showing what the system would have done and the dollar amount that would have been saved, maintaining a running total of missed savings.
4. WHEN a user explicitly enables actions via the Web_Portal or chat command, THE Trust_Ladder SHALL advance the user to Phase_2 (small actions with copilot approval).
5. WHILE a user is in Phase_2, THE Fixer SHALL enforce a per-action limit of $25 and a daily aggregate limit of $100, and require explicit user approval for every action.
6. WHILE a user is in Phase_2, THE Voice SHALL display a visible STOP command option with every action request message.
7. WHEN a user has approved 20 or more actions in Phase_2 AND maintains an approval rate above 70% AND the system has demonstrated real dollar impact, THE Trust_Ladder SHALL offer advancement to Phase_3 (autopilot).
8. THE Trust_Ladder SHALL require KYC_Verification before allowing advancement to Phase_3.
9. WHILE a user is in Phase_3, THE Fixer SHALL auto-execute Tier 1 actions (low-risk, under $10, reversible), execute Tier 2 actions with notification and a 24-hour undo window, and require explicit approval for Tier 3 actions (high-value, irreversible, or first-time provider).
10. THE Trust_Ladder SHALL allow a user to voluntarily downgrade to any lower phase at any time via chat command or Web_Portal setting.
11. WHEN a user sends the STOP command at any phase, THE Kill_Switch SHALL immediately revoke all bank tokens, lock the Credential_Vault, halt all in-progress agent operations, and confirm the safe state to the user within 5 seconds.


### Requirement 9: Security Architecture

**User Story:** As someone who's heard horror stories about apps stealing money, I want to know that this system is architecturally IMPOSSIBLE to use as a scam, so that I can trust it with my financial life.

#### Acceptance Criteria

1. THE system SHALL never hold, custody, or directly transfer user funds — all money movement SHALL occur through the user's own bank APIs with the bank sending its own confirmation for every transaction.
2. THE system SHALL access bank data exclusively through tokenized providers (Plaid or SimpleFIN) and SHALL never see, store, or transmit bank login credentials.
3. THE Credential_Vault SHALL encrypt all stored service credentials using AES-256 encryption with a key derived from the user's 6-digit PIN, such that the system cannot decrypt credentials without the user's active participation.
4. THE system SHALL store all chat history on the messaging platform (Telegram, WhatsApp) creating a tamper-proof audit trail that the user controls.
5. THE system SHALL maintain an immutable action log recording every agent action with timestamp, action type, target, approval status, screenshot references, and outcome.
6. WHEN a user sends the STOP command, THE Kill_Switch SHALL revoke all bank access tokens, lock the Credential_Vault, halt all agent operations, and confirm safe state to the user — all within 5 seconds.
7. THE system SHALL publish agent logic as open source on GitHub so that users and security researchers can audit the code that manages their finances.
8. THE Voice SHALL never transmit full account numbers in any message — only the last 4 digits of any account identifier SHALL be displayed.
9. THE system SHALL require KYC_Verification before granting Phase_3 autopilot access.
10. THE Fixer SHALL execute all browser automation sessions in ephemeral sandboxed containers that are destroyed after each session, ensuring no credential residue persists.
11. THE system SHALL enforce TLS 1.2 or higher for all data in transit between system components, messaging platforms, bank data providers, and the Web_Portal.
12. THE system SHALL store all sensitive data at rest (credentials, tokens, financial data) using AES-256 encryption in Supabase with row-level security policies enforcing user isolation.

### Requirement 10: Guardrails and Action Safety

**User Story:** As a mom who worries about everything, I want hard limits on what my AI crew can do with my money, so that even if something goes wrong, the damage is contained.

#### Acceptance Criteria

1. WHILE a user is in Phase_2, THE Fixer SHALL reject any single action with a financial impact exceeding $25.
2. WHILE a user is in Phase_2, THE Fixer SHALL reject any action that would cause the user's daily aggregate action total to exceed $100.
3. THE Fixer SHALL maintain a blocked-merchants list (user-configurable via Web_Portal) and refuse to execute any action targeting a blocked merchant.
4. WHEN the Fixer is about to execute a destructive action, THE Fixer SHALL impose a 60-second delay with a clearly visible cancel button, and cross-reference the pending action against the original user request before proceeding.
5. WHILE a user is in Phase_3, THE Fixer SHALL classify every action into Tier 1 (auto-execute: low-risk, under $10, reversible), Tier 2 (execute and notify: medium-risk, 24-hour undo window), or Tier 3 (require approval: high-value, irreversible, or first-time provider).
6. THE system SHALL provide a Kill_Switch (STOP command) accessible from every chat message and every Web_Portal page that halts all operations within 5 seconds.
7. WHEN the Fixer executes an action that results in an incorrect outcome (wrong subscription cancelled, wrong amount), THE system SHALL provide an immediate remediation path and log the incident for Compatibility_Database update.
8. THE Fixer SHALL never execute two destructive actions on the same account within a 5-minute window without explicit re-confirmation from the user.

### Requirement 11: Onboarding and First Value Moment

**User Story:** As a skeptical college student who's tried five budgeting apps and abandoned all of them, I want to see real value within 60 seconds of my first message, so that I actually stick around this time.

#### Acceptance Criteria

1. WHEN a new user sends their first message to the system on any supported messaging platform, THE Voice SHALL respond within 5 seconds with a crew introduction that explains the team concept and asks one simple question about the user's biggest financial stress.
2. THE Voice SHALL complete the Phase_0 onboarding conversation (crew introduction, personality preference, biggest financial goal, cultural and religious finance preferences) within 5 chat exchanges.
3. WHEN a user connects their bank account during onboarding, THE Watcher SHALL complete an initial transaction scan and identify at least one actionable insight (unused subscription, bill increase, savings opportunity) within 60 seconds.
4. WHEN the first actionable insight is identified, THE Voice SHALL present it as the "Holy Shit Moment" — a specific dollar amount the user is wasting or missing, with a one-tap action to fix it.
5. THE Voice SHALL ask about immigration status sensitivity, religious finance preferences (halal, Shariah-compliant options), and accessibility needs (simplified mode) during onboarding without requiring the user to volunteer this information unprompted.
6. WHEN onboarding is complete and the user has connected a bank account, THE system SHALL generate a "text MONEY to [number]" SMS onboarding code that the user can share with friends — no app download required.

### Requirement 12: Shareable Moments and Viral Growth

**User Story:** As someone who just saved $64/month by having my AI crew cancel four subscriptions, I want a beautiful card I can forward to my group chat, so that my friends can get the same help I did.

#### Acceptance Criteria

1. WHEN the Fixer successfully completes an action that saves the user money, THE system SHALL generate a Shareable_Card (via @vercel/og) showing the action taken, the dollar amount saved, and an invite link to RealValue.
2. THE Shareable_Card SHALL be formatted in OG image dimensions (1200x630) optimized for sharing in WhatsApp and Telegram group chats, with the invite link embedded.
3. THE system SHALL generate a weekly savings summary card showing total saved that week, number of actions taken, and a cumulative savings total, delivered via the Voice in the morning briefing.
4. THE system SHALL generate a monthly "Money Story" (Spotify Wrapped style) summarizing the month's financial highlights, biggest saves, spending patterns, and progress toward goals, formatted as a shareable multi-card sequence.
5. WHEN a user reaches a savings milestone ($100, $500, $1000, $5000 cumulative savings), THE Voice SHALL celebrate the milestone in the user's preferred personality mode and generate a milestone Shareable_Card.
6. THE Shareable_Card SHALL include a unique short URL that tracks referral attribution while not exposing any financial details of the referring user.
7. WHEN a referred user signs up via a Shareable_Card invite link, THE system SHALL notify the referring user with a celebration message.

### Requirement 13: Safety Features — Vulnerable Populations

**User Story:** As a domestic violence survivor hiding money from my abuser, I want my financial AI to protect me — not expose me, so that getting help with my finances doesn't put me in danger.

#### Acceptance Criteria

1. WHEN a user activates Safe_Mode via their designated code word in chat, THE Voice SHALL immediately disguise all subsequent financial messages as innocuous content (weather updates, recipe suggestions, or other user-selected cover topics).
2. WHILE Safe_Mode is active, THE Web_Portal SHALL display a quick-exit button on every page that immediately navigates to a neutral website and clears the browser's back-navigation history for the portal.
3. WHEN the Voice detects keywords or sentiment patterns associated with gambling or addiction, THE Voice SHALL respond without judgment, gently offer to track the spending pattern, and provide helpline links — never lecture or moralize.
4. THE Hunter SHALL NOT recommend any government program requiring citizenship or legal residency unless the user has explicitly confirmed their status, protecting undocumented immigrants from inadvertent exposure.
5. WHEN a user indicates religious finance preferences during onboarding (halal, Shariah-compliant, kosher), THE Hunter SHALL filter all recommendations to comply with the stated preferences and search specifically for compliant financial products.
6. WHILE a user account is flagged as belonging to a minor (under 18), THE system SHALL restrict the account to read-only access and educational content only, with a parent supervision link required for any action capabilities.
7. WHEN the Voice detects grief or crisis sentiment (bereavement, medical emergency, severe financial shock), THE Voice SHALL auto-shift to Zen_Mode, pause all non-critical notifications for 7 days, and send a single compassionate message offering to pause all communications.
8. WHERE a user enables simplified mode (for cognitive disabilities or language barriers), THE Voice SHALL use shorter messages (maximum 2 sentences per message), fewer choices (maximum 2 options per decision), and simpler vocabulary (6th-grade reading level).
9. THE system SHALL allow users to send a "pause for [duration]" command that halts all non-emergency notifications for the specified period (up to 30 days), with only overdraft predictions continuing during the pause.

### Requirement 14: Monetization and Subscription Tiers

**User Story:** As a student who literally cannot afford another subscription, I want the free version to actually be useful — not a crippled demo that guilt-trips me into paying, so that I get real help even when I'm broke.

#### Acceptance Criteria

1. THE system SHALL provide a Free tier ($0) that includes SimpleFIN bank monitoring, Ghost_Actions, up to 3 Guided_Walkthrough actions per month, and template-based Voice responses.
2. THE system SHALL provide a Premium tier ($4.99 per month) that includes Plaid integration, unlimited Fixer browser automation, full Phase_3 autopilot capability, LLM-powered Voice with all personality modes, WhatsApp channel access, and priority execution queue.
3. THE system SHALL provide an Affiliate tier (commission-based) where the Hunter presents clearly disclosed product recommendations when better rates or alternatives are found, with full savings math shown to the user.
4. WHERE the user has a Free subscription, THE Voice SHALL use template-based responses for all communications.
5. WHERE the user has a Premium subscription, THE Voice SHALL use LLM-powered responses (NVIDIA NIM API, Llama 3.3 70B) with full personality mode support.
6. THE system SHALL offer hardship pricing ($1.99 per month) when the Watcher detects sustained financial stress indicators (income drop exceeding 30%, overdraft frequency increase, or user-reported hardship).
7. THE system SHALL NOT gate overdraft prediction alerts behind the Premium tier — overdraft warnings SHALL be available to all users regardless of subscription level.
8. WHEN a Free user attempts an action that requires Premium (browser automation, WhatsApp channel, autopilot), THE Voice SHALL explain the limitation and offer a 7-day free trial of Premium.

### Requirement 15: Overdraft Prediction and Guarantee

**User Story:** As someone who's lost hundreds of dollars to overdraft fees because my bank charges me $35 every time I'm $2 short, I want my AI crew to see it coming and stop it — and if they get it wrong, I want them to pay for it, so that I know they have skin in the game.

#### Acceptance Criteria

1. THE Watcher SHALL predict overdraft events by projecting the user's balance forward 3-5 days using: current balance, pending transactions, historically recurring charges due within the window, and average daily discretionary spending — applying a 20% safety buffer that inflates projected expenses.
2. ALL overdraft prediction calculations SHALL use the Deterministic_Layer with exact numeric types (decimal or numeric, never IEEE 754 floating point) to ensure prediction accuracy.
3. WHEN the Watcher predicts an overdraft, THE Voice SHALL deliver the alert with: the predicted date, the projected shortfall amount, and at least one concrete suggested action (skip a discretionary purchase, transfer from savings, delay a non-essential bill).
4. IF the Watcher fails to predict an overdraft that occurs within the 3-5 day prediction window AND the user had sufficient transaction history for prediction (minimum 30 days of connected data), THEN THE system SHALL credit the user up to $35 to cover the overdraft fee, limited to one guarantee per user per quarter.
5. THE system SHALL log every overdraft prediction (predicted date, predicted shortfall, actual outcome) in an immutable audit table for accuracy tracking and model improvement.
6. THE Watcher SHALL track overdraft prediction accuracy as a system metric, targeting a minimum 85% true positive rate with less than 10% false positive rate.

### Requirement 16: Life Change Handling and Survival Mode

**User Story:** As someone who just got laid off and is terrified about how I'm going to pay rent, I want my AI crew to immediately shift gears and focus on keeping me afloat — not keep sending me tips about optimizing my investment portfolio, so that the system helps me survive before it helps me thrive.

#### Acceptance Criteria

1. WHEN the Conductor detects life change indicators (job loss keywords, sudden income cessation, divorce-related transactions, new recurring childcare charges, relocation patterns), THE Conductor SHALL activate Survival_Mode and shift all agent priorities to essential financial stability.
2. WHILE Survival_Mode is active, THE Watcher SHALL increase overdraft prediction frequency to daily checks and lower the safety buffer threshold to flag even marginal overdraft risks.
3. WHILE Survival_Mode is active, THE Hunter SHALL prioritize emergency resources: government benefits (unemployment, SNAP, emergency assistance), utility assistance programs (LIHEAP), food banks, and rent assistance programs.
4. WHILE Survival_Mode is active, THE Voice SHALL suppress all non-essential notifications (savings opportunities, lifestyle optimization, affiliate recommendations) and focus exclusively on urgent financial alerts and emergency resources.
5. WHEN a user sends a "pause for [duration]" command, THE Conductor SHALL halt all non-emergency agent operations for the specified duration (maximum 30 days), continuing only overdraft predictions and critical security alerts.
6. THE Conductor SHALL automatically deactivate Survival_Mode when financial stability indicators return (regular income resumes, balance stabilizes above 30-day average for 2 consecutive weeks) and notify the user of the transition.
7. WHEN Survival_Mode activates, THE Voice SHALL send a single compassionate message acknowledging the situation, explaining the priority shift, and reminding the user of the pause command — without requiring the user to explain or justify their circumstances.

### Requirement 17: Couples Mode

**User Story:** As a couple trying to get our finances together without fighting about money every week, I want my AI crew to help us both see the same picture and make decisions together, so that money stops being the thing we argue about.

#### Acceptance Criteria

1. WHEN two users link their accounts via the Crew_For_Two setup flow in the Web_Portal, THE system SHALL create a shared financial view that aggregates transactions and insights from both users' linked accounts.
2. THE Trust_Ladder SHALL maintain separate trust levels for each partner in a Crew_For_Two pair, and each partner SHALL only be able to approve actions on their own linked accounts.
3. WHEN the Fixer proposes an action that affects a shared financial decision (joint account, shared subscription), THE Fixer SHALL require approval from both partners before execution.
4. IF either partner rejects a shared action, THEN THE Fixer SHALL treat the rejection as final — rejection wins all conflicts on shared decisions.
5. THE Voice SHALL deliver Crew_For_Two communications to each partner individually on their own messaging channel, respecting each partner's personality mode preference.
6. WHEN one partner disconnects from Crew_For_Two mode, THE system SHALL immediately separate all shared views and revert both users to individual accounts, retaining each user's own transaction history and trust level.

### Requirement 18: Data Model and Financial Integrity

**User Story:** As someone whose last budgeting app lost my transaction history after an update, I want my financial data stored properly and permanently, so that I never lose track of where my money went.

#### Acceptance Criteria

1. THE system SHALL store all financial data in Supabase (PostgreSQL) with the following core tables: users, bank_connections, accounts, transactions, recurring_charges, agent_actions, action_logs, ghost_actions, overdraft_predictions, credential_vault_entries, notification_queue, shareable_cards, referrals, subscription_tiers, couples_links, user_preferences, compatibility_scores, and agent_event_logs.
2. THE system SHALL store all monetary values using PostgreSQL NUMERIC type (or equivalent exact decimal) — never IEEE 754 floating point — across all tables and all calculations.
3. THE system SHALL enforce row-level security (RLS) policies on all tables containing user data, ensuring that each user can only access their own records (with Crew_For_Two shared access as the sole exception, scoped to the linked partner).
4. THE system SHALL maintain referential integrity across all foreign key relationships with cascading deletes disabled — deletions SHALL use soft-delete (is_deleted flag with deleted_at timestamp) to preserve audit trails.
5. THE action_logs table SHALL be append-only (no UPDATE or DELETE operations permitted) to maintain an immutable audit trail of all agent actions.
6. THE system SHALL store the user's phone number as the canonical identity key, with messaging platform identifiers (Telegram user ID, WhatsApp number) linked as secondary identifiers.
7. FOR ALL monetary values stored in the database, reading then writing the same value SHALL produce a byte-identical result (round-trip integrity for numeric precision).

### Requirement 19: Background Operations and Agent Scheduling

**User Story:** As someone who doesn't want to be glued to my phone waiting for updates, I want my AI crew working in the background and only bothering me when something actually matters, so that I get the benefits without the noise.

#### Acceptance Criteria

1. THE system SHALL run a scheduled sync job (via Vercel cron or equivalent) that triggers bank data synchronization at least every 6 hours for active users.
2. WHEN a bank sync completes, THE Conductor SHALL trigger the Watcher to analyze new transactions, update overdraft predictions, and generate any new insights or Ghost_Actions.
3. THE system SHALL use Redis and BullMQ for job queue management, ensuring that agent tasks are processed reliably with retry logic (maximum 3 retries with exponential backoff) and dead-letter queues for failed jobs.
4. THE Voice SHALL batch all non-urgent notifications into a morning briefing (delivered at the user's preferred time, defaulting to 8:00 AM local time) containing: overnight insights, pending action requests, and a daily financial snapshot.
5. WHEN the system generates an urgent notification (overdraft prediction, anomalous transaction, security alert), THE Voice SHALL deliver it immediately regardless of batching schedule.
6. THE system SHALL provide agent transparency by including a brief explanation of which agent generated each insight or action recommendation (e.g., "Your Watcher spotted this" or "Your Hunter found this") so the user understands the crew is working.
7. THE system SHALL track and expose agent health metrics (last successful run, error rate, average processing time) for operational monitoring.
8. THE Fixer SHALL execute browser automation jobs on dedicated long-running containers (Railway or Fly.io) with job state managed in Redis, separate from the Vercel serverless deployment.

### Requirement 20: Platform Resilience and Account Portability

**User Story:** As someone who's had apps disappear overnight, I want to know that my financial data and my relationship with my AI crew survives even if a platform goes down, so that I'm never left stranded.

#### Acceptance Criteria

1. THE system SHALL support multi-channel messaging from day one (Telegram, WhatsApp, SMS) so that if any single platform bans or restricts the bot, users can continue on an alternative channel without data loss.
2. THE system SHALL store all conversation state and user data in Supabase (not on the messaging platform), ensuring that platform-level disruptions do not result in data loss.
3. THE system SHALL maintain SimpleFIN as a parallel bank data integration alongside Plaid, with an abstraction layer that allows switching between providers without user-facing disruption, protecting against Plaid pricing changes or service interruptions.
4. WHEN a user changes their phone number, THE Web_Portal SHALL provide a re-linking flow that transfers all account data, conversation state, trust level, and preferences to the new phone number after identity verification.
5. THE system SHALL allow users to designate a trusted contact via the Web_Portal who will receive read-only data export access after 90 days of account inactivity (for cases of user death or incapacitation).
6. THE system SHALL provide a full data export capability (all transactions, actions, insights, and settings) in a standard machine-readable format (JSON or CSV) accessible via the Web_Portal at any time.

### Requirement 21: MVP — The Subscription Assassin (V1)

**User Story:** As someone paying for Netflix, Hulu, Disney+, HBO Max, and three other streaming services I haven't opened in months, I want to text my AI crew "what am I wasting money on?" and have them cancel the ones I don't use — today, not someday, so that I stop paying for things I forgot I had.

#### Acceptance Criteria

1. WHEN a user connects their bank account (via SimpleFIN for free users, Plaid for premium users), THE Watcher SHALL scan all transactions from the past 90 days and identify recurring subscription charges.
2. THE Watcher SHALL flag subscriptions as "potentially unused" when no associated usage transaction or login activity has been detected for 45 or more days, and present the list to the user via chat with the monthly cost of each.
3. WHEN a user responds "cancel it" (or equivalent intent) for a flagged subscription, THE Fixer SHALL initiate the cancellation using the appropriate method based on the user's subscription tier (browser automation for Premium, Guided_Walkthrough for Free).
4. WHEN the Fixer successfully cancels a subscription, THE system SHALL generate a Shareable_Card showing: the subscription name, the monthly amount saved, and an invite link — formatted for forwarding in WhatsApp and Telegram group chats.
5. WHEN the Fixer cancels multiple subscriptions in a single session, THE system SHALL generate a summary Shareable_Card showing: the total number of subscriptions cancelled, the total monthly savings, the total annual savings projection, and an invite link.
6. THE Watcher SHALL continue monitoring for new unused subscriptions on an ongoing basis after the initial scan, alerting the user when a previously active subscription becomes unused.
7. ALL subscription cost calculations and savings projections SHALL use the Deterministic_Layer with exact numeric types to ensure accuracy.
