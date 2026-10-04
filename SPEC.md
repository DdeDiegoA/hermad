# SPEC — Mejoras hermad 2026-10

Fuente: `docs/mejoras-2026-10.md` (pedidos de Diego + decisiones cerradas). Diseño: `docs/mejoras-2026-10-design.md` (architect). Mapa de código: `docs/mejoras-2026-10-map.md` (reader). Este spec no reabre decisiones: solo fija problema, usuarios, alcance y criterio de éxito.

## Usuarios

- **Diego** — mantenedor de hermad. Corre equipos de agentes en varios proyectos a la vez y opera el CLI a mano.
- **El orquestador y los workers** — agentes (claude/opencode/hermes) que consumen el CLI y el buzón para handoffs peer-to-peer. Son usuarios del contrato: nombres, buzón y rutas tienen que resolver solos.
- **Equipo técnico** — lee `--help`, `templates/prompts/*` y `docs/vendors.md` para operar el sistema.

## Dolor (lo que hoy duele)

1. **Colisión de nombres entre proyectos.** `orquestador` ya está tomado → `agent_name_taken` y el proyecto queda sin ese agente (`startAgentSafe` solo loguea; `plan-devs` sigue sin dropear).
2. **Agentes terminados que quedan vivos.** Nadie cierra el pane; el workspace se llena de agentes idle.
3. **Agentes que caen en el tab equivocado.** `reader` no está en `DEFAULT_DEPARTAMENTOS` y `paneForAgent` devuelve `null` → `spawn` aborta; el move best-effort deja el pane junto al daemon.
4. **El tab del orquestador se llama `1`.** No dice qué es.
5. **Skills rígidas.** Con ~300 skills instaladas, la allowlist sale del frontmatter de la persona y no de la tarea; no hay skills globales ni forma barata de elegir las correctas.

## Éxito (observable, sin métricas inventadas)

- Los 5 pedidos se pueden ejercitar a mano con los comandos nuevos: `hermad agents`, `spawn --skills`, `send --skills`, `skills list|match|global`, tab `gerencia`, auto-close y ubicación por departamento.
- `npm run test` verde: los 14 tests actuales más los tests nuevos de cada story (stories.yaml, campo `ac`). Los tests usan io inyectable/`execFileSync` stub — no requieren herdr ni red.
- Ninguna decisión del diseño queda sin implementar o sin test: si no se puede testear con stub, queda dicho en la story.

## Alcance

Cinco pedidos, agrupados en 7 stories (S1–S7) siguiendo los tracks A–D del diseño:

| Track | Contenido | Stories |
|---|---|---|
| A0 | Lock + escritura atómica de `state.json` (D0c) — **va primero**, hoy hay carrera real | S1 |
| — | Wrappers herdr (`paneClose`, `tabRename`) + superficie CLI | S2 |
| A | Nombre lógico vs vivo (`lib/agents.js`) y sus consumidores | S3 |
| A | Auto-close de agentes terminados | S4 |
| B | Departamentos garantizados + tab `gerencia` | S5 |
| C | Índice de skills + matcher + `globalSkills` | S6 |
| D | Entrega de skills por tarea (spawn/send/render) | S7 |

**Fuera de alcance:** compact 50% y el watchdog del daemon (ya en F6), embeddings para el matcher, soporte nativo de codex/gemini, subagentes internos de claude, `herdr agent rename` (descartado por el diseño).

## Restricciones

- Cero dependencias nuevas; io inyectable como `placement.js`/`daemon.js`; tests con `node --test`.
- **No toca auth, dinero, DB ni seguridad** → no requiere aprobación de Diego más allá del gate de build del orquestador.
- Un solo writer al repo: cada story corre en su worktree/branch (`hermad plan-devs`, máx 3 devs). Los `files` de stories paralelas no se solapan.
- Sin herdr disponible en tests: todo lo que toca herdr se testea con stubs.

## Riesgos que el plan tiene que respetar

1. Carrera en `state.json` — mitigación: S1 primero (lock + rename atómico).
2. Cerrar a destiempo un agente que recibió trabajo fuera del buzón — mitigación: DONE posterior a la última entrega + idle dos ticks; la regla del orquestador pasa a ser "siempre `hermad send`, nunca `agent prompt` a un worker".
3. Daemon sin `workspaceId` (state viejo) cerrando agentes de otro proyecto — mitigación: `maybeClose` exige entrada en `state.agents` **y** coincidencia de `workspace_id`.
4. Índice de skills stale (`description` editada en el lugar) — mitigación: TTL 24 h + `--refresh`.
5. Alias que rompe consumidores (`personaOf`, buzón, rutas, briefing) — mitigación: un único módulo (`lib/agents.js`) y el buzón sigue siendo lógico.
6. **Bug encontrado al verificar el handoff (2026-10-04, verificado en vivo):** `herdr.agentRead` hace `JSON.parse` sobre `herdr agent read`, que imprime texto plano → tira "respuesta no-JSON", el daemon lo traga y `state.screens` queda vacío → **`processMarkers` nunca corre**: rutas `HERMAD:DONE|BUG|STORIES_READY` y watchdog de compact muertos en vivo (los tests pasan porque el io del daemon está stubbeado). Va como AC de S2 (dueño de `lib/herdr.js`). Mientras no aterrice, el orquestador no puede confiar en los marcadores: tiene que leer `stories.yaml` y el buzón.

## Handoff

- `stories.yaml` en la raíz — schema `id / depends_on / files / ac`, listo para `hermad plan-devs` (máx 3 devs, sin solape de `files`).
- Después de S7: `hermad plan-devs` → devs → `bmad-code-review` → merge del orquestador.
