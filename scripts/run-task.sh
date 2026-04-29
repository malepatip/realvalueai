#!/bin/bash
# RealValue AI — Single Task Runner
# Usage: ./scripts/run-task.sh <task_id>
# Example: ./scripts/run-task.sh 1.1

TASK_ID=$1
SPEC_DIR=".kiro/specs/ai-financial-agent"

if [ -z "$TASK_ID" ]; then
  echo "Usage: ./scripts/run-task.sh <task_id>"
  echo "Example: ./scripts/run-task.sh 1.1"
  echo ""
  echo "Check $SPEC_DIR/tasks.md for available task IDs"
  exit 1
fi

echo "Launching agent for task $TASK_ID..."
claude "You are working on the RealValue project. Read CLAUDE.md first. Then read $SPEC_DIR/tasks.md and $SPEC_DIR/design.md for full context. Execute ONLY task $TASK_ID. When done, mark it [x] in tasks.md and report what you built."
