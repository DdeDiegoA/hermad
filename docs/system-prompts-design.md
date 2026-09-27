# Design: per-persona system prompts (English)

> **SUPERADO (2026-09-27).** Implementado y extendido en las Fases 2–4 de `docs/plan-mejoras.md`: el prompt deja de inyectarse como primer mensaje y pasa a archivo por vendor (`--append-system-prompt-file` en claude, `--agent` en opencode, `SOUL.md` en hermes), con memoria de dos capas y skills por persona. Autoridad actual: `docs/vendors.md` + `src/lib/render.js`. Este doc queda como spec histórica.

Design only. No code touched yet — this doc is the spec for the dev to implement.

## Problem

All 7 hermad personas (`orquestador`, `analyst`, `architect`, `pm`, `dev`, `reviewer`, `ux`) start with whatever system prompt their vendor CLI ships by default. None of them know on boot that they're a BMad persona in a Herdr workspace, what tab/role they own, or how to use `herdr-bmad` / `/hermad`, peer-to-peer herdr commands, or the approval policy. The orchestrator's own intent briefing (`orchestrator.js:42-50`) is also written in Spanish and should be English.

## Vendor capability check (verified via `--help`, 2026-09-13)

| kind | flag found | verdict |
|---|---|---|
| `claude` | `--append-system-prompt <prompt>` | native support |
| `opencode` | none (`--prompt` is the initial user message, `--agent` selects a config-defined agent, not a CLI string) | fallback |
| `hermes` | none (`-z/--oneshot` is a one-shot user prompt, not a system prompt) | fallback |
| `codex` | not installed here, no known system-prompt flag in its CLI surface | fallback |
| `gemini` | not installed here, no known system-prompt flag in its CLI surface | fallback |

**Decision:** `claude` uses `--append-system-prompt`. Every other kind uses the fallback: `herdr.agentPrompt(name, personaPrompt)` sent immediately after `agentStart`, before any real task, so the persona content becomes the first thing the agent reads in its own conversation.

## Blocking constraint found in `herdr.js`

`agentStart(name, kind, paneId, vendorArgs)` treats `vendorArgs` as a plain string split on `" "` (`herdr.js:74`), with no quoting. A multi-line English system prompt cannot survive that split as a single `--append-system-prompt` argument — it would get chopped into dozens of bogus argv entries.

**Required code change (for dev, not done here):** extend `agentStart`'s vendor-args handling to accept an array of argv tokens in addition to the current space-split string, e.g.:

```js
function agentStart(name, kind, paneId, vendorArgs, opts) {
  const extra = Array.isArray(vendorArgs) ? vendorArgs : (vendorArgs || "").split(" ").filter(Boolean);
  ...
}
```

This lets the orchestrator pass `["--model", "opus", "--append-system-prompt", fullPromptString]` as one array, keeping the prompt intact as a single token.

## File layout

```
templates/prompts/orquestador.md
templates/prompts/analyst.md
templates/prompts/architect.md
templates/prompts/pm.md
templates/prompts/dev.md
templates/prompts/reviewer.md
templates/prompts/ux.md
```

One file per persona, plain markdown/text (no frontmatter needed — content is the literal prompt). Mirrors the existing `templates/AGENTS-template.md` convention. No existing file in the repo serves this purpose (checked: only `templates/AGENTS-template.md` and `templates/herdr-bmad-orquestacion.md` exist, both different — shared project memory template and orchestration notes, not per-agent system prompts).

## New module: `src/lib/prompts.js`

Called from `src/lib/orchestrator.js`'s `bootstrap()` / `startAgentSafe()` (see touch points below) to load a persona's prompt text before starting it.

```js
"use strict";
const fs = require("fs");
const path = require("path");

const PROMPTS_DIR = path.join(__dirname, "..", "..", "templates", "prompts");

function loadPersonaPrompt(name) {
  const file = path.join(PROMPTS_DIR, `${name}.md`);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, "utf8").trim();
}

module.exports = { loadPersonaPrompt };
```

## `orchestrator.js` touch points

1. `startAgentSafe` needs the persona's own prompt to decide delivery:
   - `kind === "claude"` → append `["--append-system-prompt", promptText]` to the argv passed to `herdr.agentStart` (requires the `herdr.js` array-support change above).
   - anything else → call `herdr.agentPrompt(name, promptText)` right after a successful `agentStart` (skip on `agent_name_taken`, since the agent already has whatever prompt it got on its own start).
2. Load `promptText = prompts.loadPersonaPrompt(name)` once per persona in `bootstrap()`, alongside the existing `personas` lookup.
3. Rewrite the `intent` briefing block (`orchestrator.js:42-50`) to English:

```js
const briefing = [
  `You are Hermad, the orchestrator of this Herdr workspace. Project: ${projectDir} (BMad installed).`,
  `Agents: orquestador ${workers.join(" ")} (in per-department tabs). Use 'herdr agent list' for the live roster.`,
  "Route the BMad epic path through the personas and answer approvals per policy:",
  "auto-approve unless it touches auth/money/DB/security — then leave it blocked and notify Diego.",
  "Agents can talk to each other directly (peer-to-peer); you coordinate the top level.",
  `Intent: ${intent}`,
  "Report DONE when the epic is complete.",
].join("\n");
```

## Per-persona prompt content (spec for each `templates/prompts/<name>.md`)

Each file follows the same 4-part shape:

1. **Persona identity** — name, BMad character, one-line personality (matches `skill/SKILL.md`'s persona table and `config.js`'s `rol` strings).
2. **Startup checklist** — do this before anything else: read `AGENTS.md` (repo root, shared memory — read-only for you unless you're the orquestador), run `herdr agent list` to see the live roster and avoid dropping duplicate agents, know your tab (per the department layout in `herdr-bmad`).
3. **How/when to use skills & commands**:
   - `herdr-bmad` skill — the protocol reference (topology, herdr command surface, BMad workflow table, approval handshake, pitfalls). Read it when unsure how to run `herdr agent wait/read/send-keys`, or how the approval handshake works.
   - `/hermad <intent>` command — the entrypoint only the orquestador runs to route an intent to a persona. Workers don't invoke it; they get work via `herdr agent prompt` from the orquestador or a peer.
   - The persona's own BMad skill/workflow (e.g. `bmad-agent-architect` + `bmad-spec`/architecture workflow for Winston) — this is the actual work surface.
4. **Peer-to-peer + approval policy** — you can `herdr agent prompt <peer> "..." --wait` directly, no need to go through the orquestador for handoffs; but the orquestador is the sole owner of approvals and the sole writer of `AGENTS.md`. Approval policy: auto-approve, except auth/money/DB/security → leave blocked, notify Diego.

Persona-specific deltas:

| persona | character | BMad skill | notes |
|---|---|---|---|
| `orquestador` | Hermad | none (meta-role) | ONLY one that writes `AGENTS.md`; owns `/hermad` entrypoint and approval gate |
| `analyst` | Mary | `bmad-agent-analyst` | brainstorm/forge-idea/deep-recon; tab **producto** |
| `architect` | Winston | `bmad-agent-architect` | architecture/spine; tab **producto** |
| `pm` | John | `bmad-agent-pm` | product-brief/prd/epics; tab **producto** |
| `dev` | Amelia | `bmad-agent-dev` | bmad-build / bmad-build-auto; tab **desarrollo** |
| `reviewer` | (unnamed in BMad) | code-review/QA workflow | tab **qa**; reports bugs straight to `dev` peer-to-peer |
| `ux` | Sally | `bmad-agent-ux-designer` | bmad-ux; tab **diseño** |

## Acceptance criteria

- [ ] 7 files exist under `templates/prompts/`, one per persona in `config.js:DEFAULT_PERSONAS`, all in English.
- [ ] Each file's content: persona identity/personality, startup checklist (AGENTS.md, `herdr agent list`, own tab), explicit "when/how" for `herdr-bmad` skill and `/hermad` command, its own BMad skill, peer-to-peer herdr commands, and the approval policy.
- [ ] `src/lib/prompts.js` exists and `loadPersonaPrompt(name)` returns the file content or `null`.
- [ ] `herdr.js` `agentStart` accepts an argv array for vendor args without breaking the existing space-split string callers.
- [ ] `orchestrator.js` delivers the persona prompt: `--append-system-prompt` for `kind === "claude"`, `herdr.agentPrompt` fallback otherwise; skipped for agents that were already alive (`agent_name_taken`).
- [ ] `orchestrator.js`'s `intent` briefing block is English (see snippet above).
- [ ] No new dependencies added.
