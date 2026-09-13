# BMad — flujo desatendido y puntos de aprobación

> Síntesis de la investigación (task-1: deepsearch NotebookLM 44 fuentes + docs oficiales + source del repo, as of 2026-09-13). El subagente falló el output_schema, así que no hay summary verbatim; esto es la sustancia verificada.

## Puntos clave

1. **NO existe auto-approve en `bmad-build`.** Es human-in-the-loop por diseño: presenta un plan y exige aprobación humana (paso 4), y al final pide revisar el resultado y decidir si se pushea. La aprobación del plan no es un toggle TOML.

2. **`bmad-build-auto`** = worker desatendido para UNA unidad de sesión. Una invocación ejecuta plan → implementar → review → presentar sin interacción humana. Tiene 13 condiciones de bloqueo (HALT) en las que se detiene.

3. **`bmad-loop`** = orquestador continuo oficial (módulo aparte, NO incluido en `bmm`). `bmad-loop init` instala skills `bmad-loop-*` + hook relay + `.bmad-loop/policy.toml`. La política configura autonomía:
   - `gates.mode` (none/…), `[review] trigger` (recommended|always), `[limits]` (max_dev_attempts, max_review_cycles), `[verify] commands`, `[sweep] auto`, `[scm] isolation`.
   - Checkpoints humanos: `spec_checkpoint`/`done_checkpoint` en `stories.yaml`.

4. **Artefactos por fase** (nombres exactos): `brainstorm.html`, `forge-report.html`, `research.md`, `brief.md` + `addendum.md`, `prfaq-*.md`, `prd.md` + `addendum.md` + `.memlog.md`, `DESIGN.md`, `EXPERIENCE.md`, `SPEC.md`, `stories.yaml`, `stories/<id>-<slug>.md`, `sprint-status.yaml`, `ARCHITECTURE-SPINE.md`, `RETROSPECTIVE.md`, `deferred-work.md`.

5. **Puntos de interacción** (qué responde el orquestador): clarificación (texto libre), aprobación de plan (sí/no), aprobación final/push (sí/no), permisos de herramienta (allow/deny), gates CRITICAL (escalar), checkpoints (continuar/parar).

## Implicación para Hermad

- Usá `bmad-build-auto` para stories de bajo riesgo (sin handshake).
- Usá `bmad-build` para stories con checkpoint; el orquestador responde el `blocked` vía `send-keys`.
- `bmad-loop` + `policy.toml` es el upgrade si querés épicas completas sin atender el tablero.
