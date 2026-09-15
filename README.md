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
| `~/.hermad/personas.env` | Config **activa** (la que `orquestar.sh` lee de verdad): mapeo persona→vendor/modelo + departamentos — fuera del repo a propósito, la regenera `hermad create-project` / `hermad settings agents` |
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

hermad settings agents            # re-define CLI/modelo de todas las personas
hermad settings agents dev        # re-define solo una persona
hermad settings agents --project ~/proyectos/nombre   # además sincroniza .hermad/ del proyecto

hermad start-team              # abre workspace+tabs por departamento+todos los agentes conectados,
                                # SIN mandarle prompt inicial al orquestador (queda idle)
hermad orchestrate "intent"    # igual que start-team, pero le manda el briefing+intent al
                                # orquestador para que arranque a rutar la ruta épica

hermad update                 # git pull del repo instalado — así se reciben updates de GitHub
```

`start-team` y `orchestrate` requieren un proyecto activo (`hermad create-project` ya corrido) — leen `~/.hermad/active-project.json` y arman el workspace/tabs/paneles/roster **nativamente** (`src/lib/orchestrator.js`, sin shellear a bash/jq); la única diferencia entre ambos es si al final le mandan el intent al orquestador o no. Si un agente ya está vivo en otro pane (mismo nombre, otro proyecto/workspace), no se pisa: se loguea y se sigue con el resto del equipo.

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
