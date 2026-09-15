# AGENTS.md — contexto compartido del proyecto

> Memoria interna. TODOS los agentes leen esto al arrancar. **Solo el orquestador lo escribe** (los workers solo lo leen). El orquestador lo actualiza tras recibir reportes de los workers.
>
> Nota: este archivo es la *plantilla*. Copiala a `AGENTS.md` en la raíz de cada proyecto.

## Qué es este proyecto
[1-3 líneas]

## Stack

| Capa | Tech |
|---|---|

## Personas activas (roster)

- `orquestador` — rutea fases + aprueba planes
- `analyst` / `architect` / `pm` — tab **producto**
- `dev` — tab **desarrollo**
- `reviewer` — tab **qa**
- `ux` — tab **diseño**

## Fase actual
[qué está construido vs planeado]

- 2026-09-13 — Épica "system prompts por persona" DONE (architect → dev → reviewer):
  - `templates/prompts/<persona>.md` (7, en inglés): personalidad BMad, checklist de arranque, cuándo/cómo usar `herdr-bmad` y `/hermad`, comandos peer-to-peer, política de aprobación.
  - Entrega: `claude` → `--append-system-prompt`; resto de kinds → `agent wait idle` + `agent prompt` (fallo = log y sigue). Loader: `src/lib/prompts.js`.
  - `herdr.agentStart` acepta argv array; nuevo `herdr.agentWait`. Briefing del orquestador + `command/hermad.md` en inglés. Diseño: `docs/system-prompts-design.md`.
  - Pendiente: probar `hermad start-team` en vivo; `skill/scripts/orquestar.sh` no entrega prompts (copia de referencia).

## Reglas del equipo

- Política de aprobación: auto, salvo auth/dinero/DB/seguridad → escala a Diego.
- Un solo writer al repo; stories paralelas → `git worktree`/branch.
- Peer-to-peer permitido (reviewer→dev, pm→devs); el orquestador coordina el top.
- Solo el orquestador escribe este archivo.
