---
name: herdr-bmad
description: "Use when orchestrating Herdr + BMad multi-agent flows."
---

# Herdr × BMad — Orquestación multi-agente multi-vendor

Dos capas, un flujo:

- **Herdr** (herdr.dev): multiplexer de terminales *agent-aware*. Un servidor es dueño de los procesos; detecta agentes de coding por pane y reporta su estado (`working`/`idle`/`blocked`/`done`). Control vía CLI (`herdr ...`) o socket API.
- **BMad** (docs.bmad-method.org): metodología spec-driven. Se instala **por proyecto** como skills dentro del coding tool. 5 personas (agentes con rol) + workflows de SDLC.

La integración: **un agente Herdr por persona BMad** (cada uno con su vendor+modelo), más un **orquestador top** que rutea la ruta épica y responde las aprobaciones.

## Topología

```
workspace (herdr)
├── pane orquestador  (claude, opus)     — rutea fases + aprueba planes
├── pane analyst      (opencode, ...)    — Mary: brainstorm/forge-idea/deep-recon
├── pane architect    (claude, sonnet)   — Winston: architecture/spine
├── pane pm           (claude, sonnet)   — John: product-brief/prd/epics
├── pane dev          (opencode, ...)    — Amelia: bmad-build / bmad-build-auto
└── pane ux           (opencode, ...)    — Sally: bmad-ux
```

Todos apuntan al **mismo directorio de proyecto** (mismo `_bmad/`, `SPEC.md`, `stories.yaml`, repo git). Un solo writer a la vez.

> **No paralelices el planeo, paralelizá el build.** BMad es secuencial en el planeo (Analyst→PM→Arch son handoffs lineales); el paralelismo real está solo en Build (stories independientes). 3-4 agentes bastan: orquestador + arquitecto (Claude) + constructor (OpenCode) + revisor independiente (otro vendor). PM/UX/Analyst se pliegan al orquestador si el costo de token importa.

## Setup

```bash
# 1. herdr (una vez)
brew install herdr
herdr integration install claude    # UNO por llamada (no acepta múltiples args)
herdr integration install opencode
herdr integration install hermes

# 2. bmad por proyecto
cd ~/mi-proyecto
script -q /tmp/b.log sh -c 'stty cols 160 rows 50 2>/dev/null || true; exec npx -y bmad-method@latest install --yes --directory . --modules bmm --tools claude-code,opencode --communication-language Spanish --document-output-language Spanish'
```

> ⚠️ **El instalador de BMad requiere TTY.** Sin TTY, clack aborta con `RangeError: Invalid count value`; y sin `--directory .` explícito, cuelga en el prompt "Installation directory" aun con `--yes`. El combo `script` + `stty cols` + `--directory .` es lo que funciona headless.

## Superficie de control Herdr (0.9.0)

La autoridad es el binario instalado: `herdr --help`, `herdr <grupo>` (agent/pane/workspace/tab), y `herdr --skill` (guía completa para agentes; requiere `HERDR_ENV=1`).

```bash
herdr workspace create --cwd <dir> --label <lbl> --no-focus   # → .result.root_pane.pane_id
herdr pane split [PANE_ID] --direction right|down --no-focus   # → .result.pane.pane_id
herdr agent start <nombre> --kind <kind> --pane <id> -- <args vendor>
herdr agent prompt <t> "<texto>" --wait --timeout <ms>          # enviar trabajo y esperar
herdr agent wait   <t> --until blocked --until done --timeout <ms>  # --until REPETIBLE
herdr agent read   <t> --source visible|recent-unwrapped --lines N
herdr agent send-keys <t> enter|esc                             # responder a agente bloqueado
```

Semántica 0.9.0 (corrige versiones viejas):
- `--until` es **repetible** (multi-estado). Sin `--until`, `agent wait` matchea `idle|done|blocked`.
- `agent prompt --wait` sobre un agente ya `blocked` → **`agent_blocked`** (no envía nada). Responder con `agent send-keys`, nunca con `agent prompt`.
- `agent prompt --wait` sin arranque de turno en 5000ms → `agent_prompt_stalled`.
- Agentes full-screen (Claude/OpenCode): `--source recent-unwrapped` solo funciona en `idle`; en `working/blocked` devuelve `agent_not_idle` → usar `--source visible`.
- Kinds: `claude`, `opencode`, `codex`, `gemini`, `hermes`, ... Todo después de `--` va al ejecutable del vendor (ahí va el flag de modelo).
- `--cwd` relativo (ej. `.`) se resuelve contra el cwd del SERVIDOR (que `brew services` lanza desde `/`), no contra tu shell. Usá siempre ruta absoluta (`--cwd ~/proyecto`).

## Flujo BMad (personas y fases)

| Persona | Skill | Fase |
|---|---|---|
| Mary — Analyst | `bmad-agent-analyst` | Clarify: brainstorm, forge-idea, deep-recon |
| John — PM | `bmad-agent-pm` | Plan: product-brief, prd, create-epics-and-stories |
| Winston — Architect | `bmad-agent-architect` | Plan: architecture (spine) |
| Amelia — Dev | `bmad-agent-dev` | Build: bmad-build / bmad-build-auto |
| Sally — UX | `bmad-agent-ux-designer` | Design: bmad-ux |

Ruta épica: **Intent → Spec → Stories → Build×stories → Integrate → Retro**. Workflows clave: `bmad-spec` (condensa a `SPEC.md`), `bmad-create-epics-and-stories` (`stories.yaml`), `bmad-build` (una story), `bmad-code-review`, `bmad-retrospective`. Artefactos: `SPEC.md`, `stories.yaml`, `ARCHITECTURE-SPINE.md`, `prd.md`, `brief.md`.

## Handshake de aprobación (el corazón)

`bmad-build` es **human-in-the-loop por diseño**: presenta un plan y espera aprobación. Herdr lo ve como `blocked`. El orquestador actúa de "humano":

```
1. herdr agent wait <worker> --until blocked --until idle --until done --timeout <ms>
2. herdr agent wait <worker> --until idle              # esperá idle para lectura profunda
3. herdr agent read <worker> --source recent-unwrapped --lines 120   # leé plan/pregunta
4. decidir (política abajo)
5. herdr agent send-keys <worker> enter                # aprobar (esc = rechazar)
```

`bmad-build-auto` es la variante **desatendida** (una invocación = una unidad; no pide aprobación). Usala para stories de bajo riesgo; reservá `bmad-build` para las que necesitan checkpoints.

> ⚠️ La detección de `blocked` en Claude/OpenCode es por screen-manifest (no hooks): es estricta, tiene **lag de segundos**, y un diálogo no reconocido cae primero a `idle`. Por eso el wait multi-estado. `send-keys` es ciego: presiona la tecla, no juzga el plan — el juicio lo ponés vos (o el orquestador).

**Gate más limpio en OpenCode:** si el worker es OpenCode, goberná sus permisos de herramienta con la config `permission` (`allow`/`ask`/`deny`) o `--auto`, para que SOLO el gate del plan de bmad-build quede `blocked` y el resto corra en auto (evita la inyección de teclas).

## Política de aprobación (escalación)

Auto-aprueba el plan del worker, **excepto** si toca: auth, dinero/pagos, base de datos, o seguridad → NO apruebes: deja el agente `blocked` y notificá a Diego (`herdr notification` o un archivo `ATTENTION`).

## Pitfalls

1. **Detección estricta de `blocked`**: prompts inusuales se ven como `idle`. Si un agente parece esperar input pero no está `blocked`, confirmá con `agent read --source visible`.
2. **Nunca `agent prompt` a un bloqueado** (→ `agent_blocked`): siempre `send-keys`.
3. **Timeout ≠ no enviado**: antes de reintentar un prompt, `agent read` para no duplicar.
4. **Config compartida**: `.claude/` y `_bmad/` son compartidos por diseño; aislá por pane con env (`OPENCODE_CONFIG`, `CLAUDE_CONFIG_DIR`) si dos agentes corren la misma persona.
5. **Un solo writer**: nunca dos panes escribiendo el mismo working tree. Stories paralelas → `git worktree`/branch por story, merge al final.
6. **El orquestador es el dueño de la aprobación** (replica al humano), no una cadena que auto-aprueba todo — eso anula el "you make the calls" de BMad.
7. **No splitees un pane con un agente full-screen corriendo** — el split deja el nuevo pane sin shell (`agent_pane_busy: not an available shell`). Pre-spliteá TODOS los panes antes de arrancar ningún agente (el script `orquestar.sh` ya lo hace).

## Entrada `/hermad`

`/hermad <intent>` es el entrypoint del orquestador (comando en `.claude/commands/` y `.opencode/commands/`). Al invocarlo desde un pane de herdr, el agente actúa como **Hermad**: verifica `HERDR_ENV=1` → lee `AGENTS.md` → `herdr agent list` → mapea el intent a una persona BMad → dropea si falta → envía el trabajo → atiende el handshake.

## Reuso de agentes

Antes de dropear nada: `herdr agent list`. Los panes y agentes sobreviven al detach; reusá el agente vivo en vez de crear duplicados. Solo `agent start` si la persona no está en el roster.

## Comunicación peer-to-peer

Los agentes NO necesitan pasar por el orquestador para handoffs. Un agente en un pane (con `HERDR_ENV=1`) habla directo con un peer:

```bash
herdr agent prompt <peer> "hay un bug en X, arreglalo" --wait --timeout <ms>
herdr agent wait <peer> --until blocked --until idle --until done
herdr agent read <peer> --source recent-unwrapped --lines N
herdr agent send-keys <peer> enter    # si el peer quedó blocked
```

Patrones: reviewer → dev (devuelve bug); pm → N devs (asigna issues) → devs responden cuando pasan test → pm notifica al orquestador (`herdr agent prompt orquestador "..."`). El orquestador coordina el top y las aprobaciones; los handoffs de detalle van directo.

## Memoria compartida (AGENTS.md)

El contexto general vive en `AGENTS.md` en la raíz del repo — Claude Code y OpenCode lo leen automáticamente al arrancar. Ahí van: qué es el proyecto, stack, decisiones de arquitectura con rationale, roster de personas, fase actual, reglas del equipo. BMad aporta lo suyo en `_bmad/` (config compartida) + skill `bmad-project-context`. No hace falta una herramienta externa de memoria (memento, etc.) — un archivo que todos leen ya cubre el caso.

**Solo el orquestador escribe `AGENTS.md`** (los workers solo lo leen). Tras recibir reportes de los workers, el orquestador lo actualiza con la info relevante del proyecto (decisiones, fase, hallazgos). Nunca un worker escribe la memoria.

## Layout por departamentos (tabs)

No crees "panel hell". Organizá los agentes en **tabs por departamento**, cada tab con grid de hasta **4 columnas × 2 filas**:

```
workspace
├── tab default     → orquestador
├── tab producto    → architect, pm, analyst
├── tab desarrollo  → dev (×N)
├── tab qa          → reviewer
└── tab diseño      → ux
```

`herdr tab create --workspace <id> --label <dept> --cwd <repo> --no-focus` → `.result.root_pane.pane_id`. Dentro del tab: `pane split <pane> --direction right` (columnas) y `--direction down` (2ª fila). El script `orquestar.sh` arma esto desde `DEPARTAMENTOS` en `personas.env`.

## System prompts

Per-persona system prompts live in `templates/prompts/`:

```
templates/prompts/orquestador.md   # Hermad — orchestrator + /hermad entrypoint
templates/prompts/analyst.md       # Mary — treasure-hunter analyst
templates/prompts/architect.md     # Winston — pragmatic, boring-tech architect
templates/prompts/pm.md            # John — relentless WHY? PM
templates/prompts/dev.md           # Amelia — ultra-succinct, tests-first dev
templates/prompts/reviewer.md      # adversarial skeptical QA
templates/prompts/ux.md            # Sally — empathetic storyteller UX
```

The orchestrator (`src/lib/orchestrator.js`) loads the matching prompt for each persona and injects it on agent start: `--append-system-prompt` for Claude, or `herdr agent prompt` after idle for other vendors. Workers receive their persona, tab, peer-to-peer command reference, and approval policy on boot.

## Referencias

- `herdr --skill` — guía completa de control para agentes (autoridad).
- https://herdr.dev/docs/agent-automation/ · https://herdr.dev/llms.txt
- https://docs.bmad-method.org/ · https://docs.bmad-method.org/build/autonomous-development-loops/
