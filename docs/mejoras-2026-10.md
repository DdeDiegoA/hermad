# Mejoras hermad — octubre 2026 (brief del orquestador)

Track: **standard** (reader → architect → pm → plan-devs → devs → reviewer).

## Pedidos (Diego) + decisiones tomadas

1. **Nombres de agente que chocan entre proyectos.** `open-orchestrator`/`start-team`/`spawn` fallan con
   `agent_name_taken` cuando otro proyecto ya usa ese nombre (hoy en la práctica: `orquestador`).
   - Decisión: aplica a **todos** los agentes. Si el nombre está tomado → `<proyecto>-<persona>`
     (`<proyecto>` = `name` de `.hermad/project.json`).
   - El alias real tiene que quedar registrado (p. ej. en `state.json`) para que `hermad send`, las rutas del daemon,
     el briefing y `plan-devs` resuelvan persona → nombre vivo sin que nadie lo tenga que saber.
2. **Cerrar agentes que terminaron.** Decisión: el daemon cierra el pane cuando el agente **emitió `HERMAD:DONE`
   y está `idle`**. Nunca cierra al orquestador ni a un agente con mensajes pendientes en su buzón
   (`.hermad/inbox/<peer>/`). Tiene que ser idempotente (state.json) y tolerar fallos de herdr.
3. **Todo agente nuevo va a su tab de departamento.** Hoy hay caminos (`plan-devs` dev-N, `reader`, `--kind` alternativo,
   personas fuera de `departamentos`) que pueden caer en el tab default. Garantizarlo en un único choke point
   (`placement.paneForAgent`). Personas sin departamento → asignar uno por defecto (p. ej. `reader` → `producto`,
   `dev-N` → `desarrollo`) en lugar de quedar sin ubicar.
4. **El tab del orquestador se llama `gerencia`**, no `1` (renombrar el tab default al crear el workspace;
   también en `open-orchestrator`).
5. **Skills inteligentes** (Diego tiene ~300 skills instaladas):
   - 5a — **skills por tarea, modelo híbrido**: el orquestador elige las skills que sirven para la tarea que manda al
     architect/dev/etc. Agente nuevo → `hermad spawn <persona> --skills a,b` las hornea según el vendor
     (claude plugin / opencode `permission.skill` / hermes `--skills`). Agente vivo → `hermad send ... --skills a,b`
     adjunta las rutas a los `SKILL.md` en el mensaje para que el agente las lea. Con el auto-close (punto 2) casi
     siempre será agente nuevo.
   - Hace falta un matcher barato para 300 skills: índice compacto (nombre + descripción) cacheado, prefiltro local
     (keywords) → top-N → el orquestador (que ya es un LLM) decide. Ej: `hermad skills match "<tarea>" [--persona p]`.
   - 5b — **skills globales siempre cargadas** (caveman, ponytail, hermad, herdr, bmad…): `hermad skills suggest --global`
     propone las de uso general, Diego confirma, quedan en `globalSkills` (global en `~/.hermad` + override por
     proyecto en `project.json`). Se suman a la allowlist de cada persona en todo spawn, según el vendor.
   - Mejorar la UX de `hermad skills` (list / match / suggest / global add|rm).

## Restricciones

- Política de aprobación: nada de esto toca auth/dinero/DB/seguridad.
- Tests con `node --test` (hoy 14+ verdes); io inyectable como en `placement.js`/`daemon.js`.
- Ver `docs/vendors.md` para las limitaciones por vendor (claude no recarga skills en caliente).
