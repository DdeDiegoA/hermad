"use strict";

// Tab de departamento al que pertenece una persona (project.departamentos =
// [[label, [personas]], ...], mismo formato que usa orchestrator.js).
function departmentFor(project, persona) {
  for (const [label, names] of project.departamentos || []) {
    if (Array.isArray(names) && names.includes(persona)) return label;
  }
  return null;
}

// Posición que le tocaría al próximo pane para mantener la grilla 4×2 que arma
// orchestrator.js: columnas 1-4 a la derecha de la anterior, fila 2 hacia abajo.
function gridPlacement(tabPanes) {
  const k = tabPanes.length;
  if (k === 0) return {};
  if (k < 4) return { targetPane: tabPanes[k - 1].pane_id, split: "right" };
  return { targetPane: tabPanes[k - 4].pane_id, split: "down" };
}

// Mueve un pane ya creado (con shell) al tab del departamento de la persona.
// Best-effort: cualquier fallo de herdr deja el pane junto al daemon en vez de
// abortar (el agente igual arranca). io inyectable para test:
//   { workspaceId, tabList, paneList, paneMove, log }
function moveToDepartment(project, persona, paneId, io = {}) {
  const { workspaceId, tabList, paneList, paneMove, log = () => {} } = io;
  if (!workspaceId || !tabList || !paneMove) return paneId;
  const label = departmentFor(project, persona);
  if (!label) return paneId;

  let tab;
  try {
    tab = tabList(workspaceId).find((t) => t.label === label);
  } catch (err) {
    log(`[!] no pude listar tabs (${err.code || err.message}) — ${persona} queda junto al daemon`);
    return paneId;
  }
  if (!tab) {
    log(`[!] no encontré el tab '${label}' — ${persona} queda junto al daemon`);
    return paneId;
  }

  // intento 1: respetar la grilla (split contra el pane que corresponde).
  if (paneList) {
    try {
      const panes = paneList(workspaceId).filter((p) => p.tab_id === tab.tab_id);
      const { targetPane, split } = gridPlacement(panes);
      const moved = paneMove(paneId, { tab: tab.tab_id, targetPane, split });
      if (moved && moved.paneId) return moved.paneId;
    } catch {
      /* cae al move sin target */
    }
  }
  // intento 2: mover al tab sin posición explícita (herdr decide).
  try {
    return paneMove(paneId, { tab: tab.tab_id }).paneId || paneId;
  } catch (err) {
    log(`[!] no pude mover ${persona} a '${label}' (${err.code || err.message}) — queda junto al daemon`);
    return paneId;
  }
}

module.exports = { departmentFor, gridPlacement, moveToDepartment };
