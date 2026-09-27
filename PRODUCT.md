# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML/CSS, single file per page, no build step (confirmed 2026-09-27). Pages live in `docs/`.

## Users

Diego and a technical team who already know Herdr (terminal multiplexer for agents) and BMad (spec-driven method). They read hermad docs to understand what changed, how to operate the CLI, and which commands to run.

## Product Purpose

hermad is a Node CLI that orchestrates a multi-vendor team of coding agents (claude, opencode, hermes) inside a Herdr workspace, one agent per BMad persona, plus a top-level orchestrator. Success: an intent goes from request to merged, reviewed code with a single human gate.

## Positioning

Glue between Herdr (process/pane control) and BMad (personas + SDLC workflows): per-persona system prompts, skills and memory rendered per project, a daemon that routes handoffs between agents without the orchestrator in the path, and deterministic parallel-dev planning over git worktrees.

## Operating Context

Runs from a terminal inside a Herdr workspace on macOS. Commands: `hermad setup`, `create-project`, `start-team`, `open-orchestrator`, `orchestrate`, `spawn`, `send`, `note`, `memory slice`, `plan-devs`, `daemon`, `skills suggest`, `settings agents`. Slash commands `/hermad` and `/hermad:orchestrate` inside agents.

## Capabilities and Constraints

- First-class vendors: claude, opencode, hermes. codex/gemini documented only.
- Agents run with permission prompts bypassed; business gates (auth/money/DB/security) are prompt-level, not enforced.
- Live end-to-end acceptance with herdr is still pending (unit tests only).

## Evidence on Hand

- `docs/plan-mejoras.md` (approved plan, decisions D1–D11), `docs/vendors.md` (verified vendor matrix), `AGENTS.md` (phase log), `test/` (node --test suite).
- No users, metrics, or benchmarks exist; do not fabricate any.

## Product Principles

- Deterministic code for arithmetic and routing; the model only judges.
- Atomic context: each agent loads only what its task needs.
- Nothing lost silently: failures log and fall back instead of aborting.
- One human gate, placed after planning and before build.
