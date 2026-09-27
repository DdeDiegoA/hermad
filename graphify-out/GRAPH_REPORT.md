# Graph Report - hermad  (2026-09-27)

## Corpus Check
- 62 files · ~29,316 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 463 nodes · 602 edges · 41 communities (40 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5dd328cc`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]

## God Nodes (most connected - your core abstractions)
1. `resolveProject()` - 26 edges
2. `Herdr × BMad — Orquestación multi-agente multi-vendor` - 15 edges
3. `call()` - 10 edges
4. `Fases` - 10 edges
5. `loadActiveProject()` - 9 edges
6. `Herdr × BMad — Orquestación multi-agente multi-vendor` - 9 edges
7. `Design: per-persona system prompts (English)` - 9 edges
8. `saveActiveProject()` - 8 edges
9. `runOnce()` - 8 edges
10. `ask()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `run()` --calls--> `resolveProject()`  [EXTRACTED]
  src/commands/daemon.js → src/lib/project.js
- `run()` --calls--> `resolveProject()`  [EXTRACTED]
  src/commands/memory.js → src/lib/project.js
- `run()` --calls--> `resolveProject()`  [EXTRACTED]
  src/commands/note.js → src/lib/project.js
- `run()` --calls--> `resolveProject()`  [EXTRACTED]
  src/commands/open-orchestrator.js → src/lib/project.js
- `run()` --calls--> `resolveProject()`  [EXTRACTED]
  src/commands/plan-devs.js → src/lib/project.js

## Import Cycles
- None detected.

## Communities (41 total, 1 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (35): ACTIVE_PERSONAS_ENV, config, { detectInstalledVendors, modelsFor }, fs, { loadActiveProject, saveActiveProject }, os, path, personasEnv (+27 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (27): ACTIVE_PERSONAS_ENV, AGENTS_TEMPLATE, config, { execSync }, fs, os, path, personasEnv (+19 more)

### Community 2 - "Community 2"
Cohesion: 0.12
Nodes (15): Comunicación peer-to-peer, Entrada `/hermad`, Flujo BMad (personas y fases), Handshake de aprobación (el corazón), Herdr × BMad — Orquestación multi-agente multi-vendor, Layout por departamentos (tabs), Memoria compartida (AGENTS.md), Pitfalls (+7 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (32): daemon, { resolveProject }, run(), memory, { resolveProject }, run(), memory, { resolveProject } (+24 more)

### Community 4 - "Community 4"
Cohesion: 0.15
Nodes (12): bin, hermad, description, engines, node, license, name, scripts (+4 more)

### Community 5 - "Community 5"
Cohesion: 0.26
Nodes (12): agentList(), agentPrompt(), agentRead(), agentStart(), agentWait(), call(), { execFileSync }, paneRun() (+4 more)

### Community 6 - "Community 6"
Cohesion: 0.17
Nodes (18): fs, loadPersona(), loadPersonaPrompt(), parseFrontmatter(), path, PROMPTS_DIR, fs, globalRoots() (+10 more)

### Community 7 - "Community 7"
Cohesion: 0.20
Nodes (9): Decisiones de Diego (2026-09-13), Dónde vive lo operativo, Estado de instalación (as of 2026-09-13), Handshake de aprobación (el corazón), Herdr × BMad — Orquestación multi-agente multi-vendor, Pitfalls clave, Qué es cada capa, Referencias (+1 more)

### Community 8 - "Community 8"
Cohesion: 0.20
Nodes (9): Acceptance criteria, Blocking constraint found in `herdr.js`, Design: per-persona system prompts (English), File layout, New module: `src/lib/prompts.js`, `orchestrator.js` touch points, Per-persona prompt content (spec for each `templates/prompts/<name>.md`), Problem (+1 more)

### Community 9 - "Community 9"
Cohesion: 0.22
Nodes (8): CONFIG_DIR, CONFIG_PATH, DEFAULT_PERSONAS, defaultConfig(), fs, load(), os, path

### Community 10 - "Community 10"
Cohesion: 0.29
Nodes (6): AGENTS.md — contexto compartido del proyecto, Fase actual, Personas activas (roster), Qué es este proyecto, Reglas del equipo, Stack

### Community 11 - "Community 11"
Cohesion: 0.29
Nodes (6): Arquitectura, CLI: `hermad`, Componentes, Deploy (una sola fuente de verdad), Hermad — Orquestación multi-agente multi-vendor (Herdr × BMad), Política de aprobación

### Community 12 - "Community 12"
Cohesion: 0.29
Nodes (6): AGENTS.md — contexto compartido del proyecto, Fase actual, Personas activas (roster), Qué es este proyecto, Reglas del equipo, Stack

### Community 13 - "Community 13"
Cohesion: 0.33
Nodes (4): { execSync }, fs, path, REPO_ROOT

### Community 14 - "Community 14"
Cohesion: 0.40
Nodes (4): Approval policy, Before anything else, How and when to use skills & commands, Peer-to-peer Herdr commands

### Community 15 - "Community 15"
Cohesion: 0.40
Nodes (4): Approval policy, Before anything else, How and when to use skills & commands, Peer-to-peer Herdr commands

### Community 16 - "Community 16"
Cohesion: 0.40
Nodes (4): Approval policy, Before anything else, How and when to use skills & commands, Peer-to-peer Herdr commands

### Community 17 - "Community 17"
Cohesion: 0.40
Nodes (4): Approval policy, Before anything else, How and when to use skills & commands, Peer-to-peer Herdr commands

### Community 18 - "Community 18"
Cohesion: 0.40
Nodes (4): Approval policy, Before anything else, How and when to use skills & commands, Peer-to-peer Herdr commands

### Community 19 - "Community 19"
Cohesion: 0.40
Nodes (4): Approval policy, Before anything else, How and when to use skills & commands, Peer-to-peer Herdr commands

### Community 20 - "Community 20"
Cohesion: 0.40
Nodes (4): Approval policy, Before anything else, How and when to use skills & commands, Peer-to-peer Herdr commands

### Community 21 - "Community 21"
Cohesion: 0.50
Nodes (3): Approval policy, Protocol (in order), Reference

### Community 22 - "Community 22"
Cohesion: 0.50
Nodes (3): BMad — flujo desatendido y puntos de aprobación, Implicación para Hermad, Puntos clave

### Community 28 - "Community 28"
Cohesion: 0.13
Nodes (26): applyRoute(), crypto, DEFAULT_ROUTES, defaultIo(), emptyState(), fs, herdr, inboxRoot() (+18 more)

### Community 29 - "Community 29"
Cohesion: 0.09
Nodes (22): agentNameFromEnv(), append(), fs, JOURNAL_REL, journalPath(), MEMORY_REL, path, relevant() (+14 more)

### Community 30 - "Community 30"
Cohesion: 0.13
Nodes (16): allocateDevs(), daemon, ensureWorktree(), { execFileSync }, existsBranch(), fs, herdr, path (+8 more)

### Community 31 - "Community 31"
Cohesion: 0.12
Nodes (16): Decisiones tomadas, Fase 0 — Spikes (investigación, sin código de producto), Fase 1 — CLI: proyecto por cwd + `open-orchestrator`, Fase 2 — System prompt real por vendor (depende de 0), Fase 3 — Memoria de dos capas (depende de 2), Fase 4 — Skills por persona (depende de 0, 2), Fase 5 — `hermad daemon`: buzón + rutas (depende de 3), Fase 6 — Auto-compact al 50% (depende de 5) (+8 more)

### Community 32 - "Community 32"
Cohesion: 0.16
Nodes (15): ensureClaudeMemory(), ensureCommands(), fs, GEN_DIR, linkSkill(), memory, modelIdFrom(), path (+7 more)

### Community 33 - "Community 33"
Cohesion: 0.15
Nodes (14): daemon, herdr, render, { resolveProject }, run(), { startAgentSafe }, vendors, bootstrap() (+6 more)

### Community 34 - "Community 34"
Cohesion: 0.22
Nodes (11): buildSuggestPrompt(), callVendor(), { execFileSync }, parseSuggestions(), prompts, { resolveProject }, run(), skills (+3 more)

### Community 35 - "Community 35"
Cohesion: 0.21
Nodes (9): findStoriesFile(), fs, load(), parseInlineList(), parseStories(), path, assert, stories (+1 more)

### Community 36 - "Community 36"
Cohesion: 0.22
Nodes (7): assert, BIN, { execFileSync }, fs, os, path, { test }

### Community 37 - "Community 37"
Cohesion: 0.22
Nodes (6): assert, daemon, fs, os, path, { test }

### Community 38 - "Community 38"
Cohesion: 0.33
Nodes (5): Evidencia (comandos clave), Impacto en el plan, Matriz, Spikes, Vendors — matriz de capacidades (Fase 0)

### Community 39 - "Community 39"
Cohesion: 0.50
Nodes (3): Protocol, Reference, stories.yaml schema

### Community 40 - "Community 40"
Cohesion: 0.50
Nodes (3): Before anything else, Rules, What you produce

## Knowledge Gaps
- **278 isolated node(s):** `name`, `version`, `description`, `hermad`, `type` (+273 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `resolveProject()` connect `Community 3` to `Community 33`, `Community 34`, `Community 30`, `Community 1`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Why does `saveActiveProject()` connect `Community 1` to `Community 0`, `Community 3`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Why does `loadActiveProject()` connect `Community 3` to `Community 0`, `Community 1`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _278 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07804878048780488 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07056451612903226 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._