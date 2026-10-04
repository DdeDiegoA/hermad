"use strict";
const personasEnv = require("./personas-env");

// `gerencia` es el tab del orquestador (ver orchestrator.bootstrap), no un tab de
// workers: una entrada con esa etiqueta en `departamentos` se ignora.
const MANAGEMENT_TAB = "gerencia";
const RESERVED_TABS = new Set([MANAGEMENT_TAB]);

// El departamento habla de la persona BASE, no del agente: dev-3 → dev,
// reviewer-opencode → reviewer.
function normalizePersona(persona) {
  return String(persona || "").split("-")[0];
}

// Tab de departamento al que pertenece una persona. `project.departamentos` =
// [[label, [personas]], ...], mismo formato que usa orchestrator.js. Orden de
// resolución: proyecto → DEFAULT_DEPARTAMENTOS (personas-env) → defaultDepartment
// → primer departamento no reservado. Nunca null si hay departamentos; el único
// caso null es "no hay de dónde sacar un tab". io: { log }.
function departmentFor(project, persona, io = {}) {
  const { log = () => {} } = io;
  const p = normalizePersona(persona);
  const deps = project.departamentos || [];

  if (deps.some(([label]) => RESERVED_TABS.has(label))) {
    log(`[!] '${MANAGEMENT_TAB}' es el tab del orquestador, no de workers — ignoro esa entrada de departamentos`);
  }

  for (const [label, names] of deps) {
    if (RESERVED_TABS.has(label)) continue;
    if (Array.isArray(names) && names.map(normalizePersona).includes(p)) return label;
  }
  for (const [label, names] of personasEnv.DEFAULT_DEPARTAMENTOS) {
    if (Array.isArray(names) && names.includes(p)) return label;
  }
  if (project.defaultDepartment) return project.defaultDepartment;
  const fallback = deps.find(([label]) => !RESERVED_TABS.has(label));
  return fallback ? fallback[0] : null;
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
// Devuelve el paneId final, o `null` si el move no pudo completarse: el caller
// (paneForAgent) cierra el pane temporal. "O aterriza en su tab, o no arranca."
// io inyectable para test: { workspaceId, tabList, paneList, paneMove, log }.
function moveToDepartment(project, persona, paneId, io = {}) {
  const { workspaceId, tabList, paneList, paneMove, log = () => {} } = io;
  if (!workspaceId || !tabList || !paneMove) return paneId;
  const label = departmentFor(project, persona, { log });
  if (!label) return null;

  let tab;
  try {
    tab = tabList(workspaceId).find((t) => t.label === label);
  } catch (err) {
    log(`[!] no pude listar tabs (${err.code || err.message})`);
    return null;
  }
  if (!tab) {
    log(`[!] no encontré el tab '${label}'`);
    return null;
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
    log(`[!] no pude mover ${persona} a '${label}' (${err.code || err.message})`);
    return null;
  }
}

// Pane donde debe ARRANCAR un agente recién lanzado, garantizando el tab de su
// departamento. Camino normal (tab ya existe, p.ej. start-team): divide desde el
// pane del daemon y mueve el pane nuevo al tab respetando la grilla. Si el tab
// todavía no existe (workspace on-demand, `hermad open-orchestrator`): lo crea y
// devuelve su root pane — el agente arranca ahí, sin dejar un shell vacío.
// Garantía fuerte: si los dos intentos de move fallan, cierra el pane temporal y
// devuelve null (el caller aborta con mensaje claro). Sin workspace → null.
// io inyectable: { workspaceId, cwd, daemonPaneId, tabList, tabCreate, paneList,
// paneSplit, paneMove, paneClose, log }.
function paneForAgent(project, persona, io = {}) {
  const { workspaceId, cwd, daemonPaneId, tabList, tabCreate, paneList, paneSplit, paneMove, log = () => {} } = io;
  if (!workspaceId || !tabList) return null;

  const label = departmentFor(project, persona, { log });
  if (!label) {
    log(`[!] ${persona} no está en ningún departamento y no hay departamentos — agregalos para ubicarlo en un tab`);
    return null;
  }

  let tab;
  try {
    tab = tabList(workspaceId).find((t) => t.label === label);
  } catch (err) {
    log(`[!] no pude listar tabs (${err.code || err.message}) — ${persona} sin ubicar`);
    return null;
  }

  if (!tab) {
    if (!tabCreate) return null;
    try {
      const { rootPaneId } = tabCreate(workspaceId, cwd, label);
      log(`[+] creé el tab '${label}' para ${persona}`);
      return rootPaneId;
    } catch (err) {
      log(`[!] no pude crear el tab '${label}' (${err.code || err.message}) — dropeá ${persona} a mano`);
      return null;
    }
  }

  if (!daemonPaneId || !paneSplit) return null;
  const paneId = paneSplit(daemonPaneId, "down", { cwd }).paneId;
  const moved = moveToDepartment(project, persona, paneId, { workspaceId, tabList, paneList, paneMove, log });
  if (moved) return moved;

  // El move falló: cerramos el temporal para no dejarlo contaminando el tab
  // default junto al orquestador/daemon. paneClose se inyecta en test; en
  // producción sale de herdr (require lazy, sin ciclo).
  const paneClose = io.paneClose || require("./herdr").paneClose;
  try {
    paneClose(paneId);
  } catch {
    /* best-effort */
  }
  log(`[!] no pude mover ${persona} a '${label}' — cerré el pane temporal; abortá y reintentá`);
  return null;
}

module.exports = { departmentFor, normalizePersona, gridPlacement, moveToDepartment, paneForAgent, MANAGEMENT_TAB };
