# Hermad — Orquestación multi-agente multi-vendor (Herdr × BMad)

Sistema para orquestar agentes de coding en paralelo: **Herdr** (terminales multi-vendor/modelo, con estado `blocked`) + **BMad** (metodología spec-driven: 5 personas + skills de SDLC).

## Componentes

| Path | Qué es |
|---|---|
| `bin/hermad.js` | Entrypoint del CLI `hermad` |
| `src/cli.js` | Dispatcher de subcomandos |
| `src/commands/` | `setup`, `create-project`, `settings-agents`, `update` |
| `src/lib/` | Detección de vendors/modelos, config (`~/.hermad/config.json`), generador de `personas.env` |
| `skill/` | Skill `herdr-bmad` — protocolo completo + pitfalls (instalada en Hermes + Claude Code + OpenCode vía symlink, lo hace `hermad setup`) |
| `skill/scripts/orquestar.sh` | Bootstrap: workspace + departamentos (tabs) + agentes en grid |
| `skill/scripts/personas.env` | Ejemplo de referencia (git-tracked, no lo toca el CLI) |
| `~/.hermad/personas.env` | Config **activa** (la que `orquestar.sh` lee de verdad): mapeo persona→vendor/modelo + departamentos — fuera del repo a propósito, la regenera `hermad create-project` / `hermad settings project` |
| `command/hermad.md` | Entrypoint `/hermad` (Claude Code + OpenCode) |
| `templates/AGENTS-template.md` | Plantilla de memoria compartida (solo el orquestador la escribe) |
| `docs/` | Guía completa |
| `research/` | Investigación: comandos herdr 0.9.0, flujo BMad desatendido, patrones de integración |

## CLI: `hermad`

```bash
# instalar (clonar el repo de GitHub una vez publicado)
git clone <repo> ~/hermad && cd ~/hermad
npm link                       # deja `hermad` en el PATH (sin dependencias externas)

hermad setup                  # symlinks de skill+comando /hermad + elegí CLI/modelo por agente
                                #   detecta CLIs instaladas (claude, opencode, codex, gemini, hermes)
                                #   y lista modelos reales según cada una (dinámico para opencode
                                #   vía `opencode models`; catálogo estático para el resto)

hermad create-project "nombre"    # scaffolding agentico completo: git init, AGENTS.md,
                                    # personas.env (proyecto + activo), instrucciones de BMad
hermad create-project "nombre" --run-bmad-install   # además corre el installer de BMad (TTY)

hermad settings agents            # edita la PLANTILLA global (~/.hermad/config.json); no toca proyectos
hermad settings agents dev        # re-define solo una persona en la plantilla global

hermad settings project           # reajusta CLI/modelo del PROYECTO actual (.hermad/project.json),
                                    #   partiendo de lo que el proyecto ya tiene
hermad settings project dev       # solo una persona del proyecto
hermad settings project --from-global   # copia la plantilla global al proyecto (sin prompt)
hermad settings project --project ~/proyectos/nombre   # apunta a un proyecto explícito

hermad start-team              # abre workspace+tabs por departamento+todos los agentes conectados,
                                # SIN mandarle prompt inicial al orquestador (queda idle)
hermad open-orchestrator       # abre SOLO el orquestador (workers bajo demanda)
hermad orchestrate "intent"    # igual que start-team, pero le manda el briefing+intent al
                                # orquestador para que arranque a rutar la ruta épica

hermad daemon                  # pane del daemon: buzón + rutas HERMAD: + compact watchdog
hermad send <peer> "msg"       # encola un mensaje en el buzón del peer (lo entrega el daemon en idle)
hermad note "texto" [--story S1] [--for reviewer]   # entrada al journal de memoria
hermad memory slice <persona> [--story S1]           # bloque atómico de memoria (AGENTS.md + journal)
hermad plan-devs [--max N]     # N worktrees+branches desde stories.yaml (evita solape de files)
hermad skills suggest <persona>   # propone skills para el frontmatter (no aplica solo)

hermad update                 # git pull del repo instalado — así se reciben updates de GitHub
```

`start-team` / `orchestrate` / `open-orchestrator` **resuelven el proyecto subiendo desde el cwd** (buscan `.hermad/project.json`); si no lo encuentran, caen al activo global avisando. Así `cd proyecto-B && hermad start-team` abre B sin más. Arman el workspace/tabs/paneles/roster **nativamente** (`src/lib/orchestrator.js`). Si un agente ya está vivo en otro pane, no se pisa.

Al arrancar, `render.js` genera por proyecto el prompt de cada persona y sus artefactos por vendor (`docs/vendors.md`): claude por `--append-system-prompt-file` + plugin por persona, opencode por `--agent`, hermes por `--skills`; los generados van a `.gitignore` (`.hermad/generated/`, `.opencode/agents/hermad-*`, `.hermad/worktrees/`). La memoria es de dos capas: `AGENTS.md` curado + `.hermad/memory/journal.md` append-only (`hermad note`), inyectada por persona/story.

`skill/scripts/orquestar.sh` sigue existiendo como fallback para correr el bootstrap a mano sin el CLI instalado (editando `personas.env` ahí mismo) — pero `hermad` ya no lo invoca.

Luego, arrancar el workspace y usar el entrypoint:

```bash
bash skill/scripts/orquestar.sh "lo que quieras construir"
/hermad "hacé X"     # desde el pane del orquestador
```

## Arquitectura

- **Orquestador** (tab default): rutea la ruta épica, aprueba planes, y es el **único** que actualiza `AGENTS.md`.
- **Departamentos** (tabs): producto (architect/pm/analyst), desarrollo (dev), qa (reviewer), diseño (ux). Grid hasta 4 col × 2 filas por tab.
- **Peer-to-peer**: los agentes se hablan directo (`herdr agent prompt <peer>`); el orquestador coordina el top.
- **Memoria**: `AGENTS.md` en la raíz del repo — solo el orquestador la escribe, con info relevante tras recibir reportes.

## Política de aprobación

Auto-aprueba salvo auth/dinero/DB/seguridad → escala a Diego.

## Deploy (una sola fuente de verdad)

Los paths de los agentes apuntan a este repo por symlink:

- `~/.hermes/skills/autonomous-ai-agents/herdr-bmad` → `skill/`
- `~/.claude/skills/herdr-bmad` → `skill/`
- `~/.config/opencode/skills/herdr-bmad` → `skill/`
- `~/.claude/commands/hermad.md` → `command/hermad.md`
- `~/.config/opencode/commands/hermad.md` → `command/hermad.md`
