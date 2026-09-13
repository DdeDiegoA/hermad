# Hermad — Orquestación multi-agente multi-vendor (Herdr × BMad)

Sistema para orquestar agentes de coding en paralelo: **Herdr** (terminales multi-vendor/modelo, con estado `blocked`) + **BMad** (metodología spec-driven: 5 personas + skills de SDLC).

## Componentes

| Path | Qué es |
|---|---|
| `skill/` | Skill `herdr-bmad` — protocolo completo + pitfalls (instalada en Hermes + Claude Code + OpenCode vía symlink) |
| `skill/scripts/orquestar.sh` | Bootstrap: workspace + departamentos (tabs) + agentes en grid |
| `skill/scripts/personas.env` | Config: mapeo persona→vendor/modelo + departamentos |
| `command/hermad.md` | Entrypoint `/hermad` (Claude Code + OpenCode) |
| `templates/AGENTS.md` | Plantilla de memoria compartida (solo el orquestador la escribe) |
| `docs/` | Guía completa |
| `research/` | Investigación: comandos herdr 0.9.0, flujo BMad desatendido, patrones de integración |

## Quickstart

```bash
# 1. prerrequisitos (una vez)
brew install herdr
herdr integration install claude && herdr integration install opencode && herdr integration install hermes

# 2. instalar BMad en el proyecto (requiere TTY; ver skill para el detalle)
cd <proyecto> && script -q /tmp/b.log sh -c 'stty cols 160 rows 50 2>/dev/null || true; exec npx -y bmad-method@latest install --yes --directory . --modules bmm --tools claude-code,opencode --communication-language Spanish --document-output-language Spanish'

# 3. arrancar el workspace (orquestador + departamentos)
#    editá skill/scripts/personas.env primero: PROJECT_DIR + personas + DEPARTAMENTOS
bash skill/scripts/orquestar.sh "lo que quieras construir"

# 4. usar el entrypoint desde el pane del orquestador (Claude Code)
/hermad "hacé X"
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
