#!/bin/bash
# RealValue AI — Parallel Wave Task Runner
# Usage: ./scripts/run-wave.sh <wave_number>
# Example: ./scripts/run-wave.sh 1
#
# Launches parallel Claude Code CLI agents for all tasks in a wave.
# Prerequisites: claude CLI installed (npm install -g @anthropic-ai/claude-code)

WAVE=$1
SPEC_DIR=".kiro/specs/ai-financial-agent"

if [ -z "$WAVE" ]; then
  echo "Usage: ./scripts/run-wave.sh <wave_number>"
  echo "  Wave 1: Foundation (7 tasks, zero dependencies)"
  echo "  Wave 2: Core Services (7 tasks)"
  echo "  Wave 3: Agent Logic (10 tasks)"
  echo "  Wave 4: Advanced Features (6 tasks)"
  echo "  Wave 5: Integration & Polish (9 tasks)"
  exit 1
fi

PROMPT_PREFIX="You are working on the RealValue project. Read CLAUDE.md first. Then read $SPEC_DIR/tasks.md and $SPEC_DIR/design.md for full context. Execute ONLY the following task:"

case $WAVE in
  1)
    echo "Launching Wave 1 - Foundation (7 parallel agents)"
    TASKS=(
      "1.1:Project scaffolding - Next.js, Supabase client, Redis connection, environment config"
      "1.2:Database schema and migrations - ALL tables from design doc"
      "1.3:Core type definitions and interfaces - all agent types, trust types, channel types"
      "1.4:Agent communication protocol - Redis pub/sub + BullMQ queues"
      "1.5:Channel adapter interfaces - Telegram/WhatsApp/SMS abstraction"
      "1.6:Deterministic financial math library - Decimal.js Money class wrapper"
      "1.7:Credential vault encryption module - AES-256-GCM + PBKDF2"
    )
    ;;
  2)
    echo "Launching Wave 2 - Core Services (7 parallel agents)"
    TASKS=(
      "2.1:Telegram webhook handler"
      "2.2:Plaid and SimpleFIN bank linking integration"
      "2.3:Watcher agent - transaction categorization engine"
      "2.4:Trust Ladder state machine"
      "2.5:Voice agent - template fallback system and personality modes"
      "2.6:Credential vault API routes"
      "2.7:Web portal - magic link authentication"
    )
    ;;
  3)
    echo "Launching Wave 3 - Agent Logic (10 parallel agents)"
    TASKS=(
      "3.1:Watcher - unused subscription detector"
      "3.2:Watcher - bill increase detector"
      "3.3:Watcher - trial expiration detector"
      "3.4:Watcher - lifestyle inflation and cost creep detectors"
      "3.5:Watcher - anomalous transaction and behavioral pattern detectors"
      "3.6:Conductor agent - intent classification and routing"
      "3.7:Fixer agent - browser automation worker setup"
      "3.8:Voice agent - LLM personality modes"
      "3.9:Shareable card generation"
      "3.10:Web portal - bank linking UI"
    )
    ;;
  4)
    echo "Launching Wave 4 - Advanced Features (6 parallel agents)"
    TASKS=(
      "4.1:Fixer - subscription cancellation flow (MVP)"
      "4.2:Conductor - conflict resolution and life change detection"
      "4.3:Watcher - overdraft prediction engine"
      "4.4:Morning briefing assembly and notification batching"
      "4.5:Ghost action generation"
      "4.6:Web portal - settings and preferences UI"
    )
    ;;
  5)
    echo "Launching Wave 5 - Integration and Polish (9 parallel agents)"
    TASKS=(
      "5.1:End-to-end MVP flow"
      "5.2:Trust Ladder phase transitions - full lifecycle"
      "5.3:Kill switch implementation"
      "5.4:Safe mode, Stealth mode, and Survival mode"
      "5.5:Couples mode"
      "5.6:Hardship pricing and subscription tier management"
      "5.7:Hunter agent - government benefits and opportunity search"
      "5.8:Onboarding flow and first value moment"
      "5.9:Data export and health monitoring"
    )
    ;;
  *)
    echo "Invalid wave number: $WAVE (must be 1-5)"
    exit 1
    ;;
esac

echo ""
for task in "${TASKS[@]}"; do
  IFS=':' read -r id desc <<< "$task"
  echo "  [$id] $desc"
done

echo ""
read -p "Launch all ${#TASKS[@]} agents? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  for task in "${TASKS[@]}"; do
    IFS=':' read -r id desc <<< "$task"
    echo "Launching agent for task $id..."
    claude --print "$PROMPT_PREFIX Task $id - $desc" &
    sleep 2
  done
  echo ""
  echo "All ${#TASKS[@]} agents launched. Monitor tasks.md for completions."
  wait
  echo "All Wave $WAVE agents finished."
else
  echo "Cancelled."
fi
