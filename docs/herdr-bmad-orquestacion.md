# Herdr × BMad — Orquestación multi-agente multi-vendor

> **Estado:** Integración diseñada y validada el 2026-09-13.
> **Propósito:** Herdr maneja la capa de terminales (N agentes CLI con vendors/modelos distintos, en paralelo, con estado working/idle/blocked). BMad aporta la metodología spec-driven (5 personas + skills de SDLC) que cada agente ejecuta. Un orquestador top rutea la ruta épica y responde las aprobaciones.

## Qué es cada capa

- **Herdr** (herdr.dev, v0.9.0 as of 2026-09-13): multiplexer de terminales agent-aware. Un servidor es dueño de los procesos; detecta agentes por pane y reporta estado (`working`/`idle`/`blocked`/`done`). Control vía CLI/socket API.
- **BMad** (docs.bmad-method.org, npm `bmad-method` v6.12.0 as of 2026-09-13): metodología spec-driven open-source (MIT). Se instala por proyecto como skills dentro del coding tool. 5 personas + 24 workflows. Delivery loop: Clarify → Plan → Build → Review.

## Topología

```
workspace (herdr) — todos apuntan al MISMO proyecto (mismo _bmad/, SPEC.md, stories.yaml)
├── orquestador        → rutea fases + aprueba planes
├── analyst  (Mary)    → brainstorm / forge-idea / deep-recon
├── architect (Winston)→ architecture/spine
├── pm       (John)    → product-brief / prd / epics+stories
├── dev      (Amelia)  → bmad-build / bmad-build-auto
└── ux       (Sally)   → bmad-ux
```

Un solo writer a la vez; stories paralelas vía `git worktree`/branch.

## Decisiones de Diego (2026-09-13)

1. **Política de aprobación**: auto-aprueba el plan del worker, salvo que toque auth/dinero/DB/seguridad → escala a Diego (deja bloqueado + notifica).
2. **Mapeo persona→vendor/modelo**: 100% configurable en `personas.env` (Diego lo define a mano).
3. **Entrega**: skill reutilizable instalada en Hermes + Claude Code + OpenCode, más script orquestador + comando `/hermad` + esta guía.
4. **Memoria**: solo el orquestador escribe `AGENTS.md` (los workers solo leen), actualizándolo con info relevante tras recibir reportes.

## Dónde vive lo operativo

| Qué | Dónde |
|---|---|
| Skill (protocolo + pitfalls) | `skill/` (symlink a `~/.hermes/skills/autonomous-ai-agents/herdr-bmad/`, `~/.claude/skills/herdr-bmad/`, `~/.config/opencode/skills/herdr-bmad/`) |
| Comando `/hermad` (entrypoint orquestador) | `command/hermad.md` (symlink a `~/.claude/commands/hermad.md`, `~/.config/opencode/commands/hermad.md`) |
| Script bootstrap (departamentos + grid) | `skill/scripts/orquestar.sh` |
| Config personas + departamentos | `skill/scripts/personas.env` |
| Memoria compartida | `AGENTS.md` (raíz del repo) + `_bmad/config.toml` |
| Proyecto demo | `~/Programacion/proyectos/bmad-herdr-demo/` (BMad instalado, 29 skills) |

## Handshake de aprobación (el corazón)

`bmad-build` es human-in-the-loop: presenta plan y espera aprobación. Herdr lo ve como `blocked`. El orquestador: `agent wait <w> --until blocked --until idle --until done` → `agent read <w> --source recent-unwrapped` → decidir → `agent send-keys <w> enter` (aprueba) / `esc` (rechaza). `bmad-build-auto` es la variante desatendida (sin aprobación).

## Pitfalls clave

- `agent prompt` sobre agente ya `blocked` → `agent_blocked` (responder con `send-keys`, no `prompt`).
- Agentes full-screen: `read --source recent-unwrapped` solo en `idle`; en `working/blocked` usar `visible`.
- Timeout ≠ no enviado: `agent read` antes de reintentar (evitar doble prompt).
- La detección de `blocked` laggea segundos; esperá multi-estado.
- El orquestador replica al humano en la aprobación — no auto-aprobar todo (anula el "you make the calls" de BMad).

## Estado de instalación (as of 2026-09-13)

- herdr 0.9.0 instalado (brew) + integraciones claude/opencode/hermes.
- BMad 6.12.0 instalado en el proyecto demo (claude-code + opencode).
- Skill herdr-bmad + comando /hermad en las 3 CLIs.

## Referencias

- https://herdr.dev/docs/agent-automation/ · https://herdr.dev/llms.txt
- https://docs.bmad-method.org/ · https://docs.bmad-method.org/build/autonomous-development-loops/
