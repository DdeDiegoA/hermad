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

## Reglas del equipo

- Política de aprobación: auto, salvo auth/dinero/DB/seguridad → escala a Diego.
- Un solo writer al repo; stories paralelas → `git worktree`/branch.
- Peer-to-peer permitido (reviewer→dev, pm→devs); el orquestador coordina el top.
- Solo el orquestador escribe este archivo.
