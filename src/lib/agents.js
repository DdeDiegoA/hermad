"use strict";
const path = require("path");

// D0 §1: traducción entre nombre LÓGICO (lo que habla todo hermad: buzón, rutas,
// state.stories[].dev, prompts, --from) y nombre VIVO (lo que ve herdr). El único
// motivo de que difieran es que el lógico ya esté tomado en otro workspace: ahí se
// arranca con `<slug(proyecto)>-<lógico>`. Nada arma nombres a mano: todos resuelven
// con liveName()/logicalOf() y arrancan por start().

// slug estable para el alias. name ausente → basename del projectDir.
function slug(name, projectDir) {
  const base = name || (projectDir && path.basename(projectDir)) || "proyecto";
  return (
    String(base)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "proyecto"
  );
}

// En principio todos los que comparten projectDir comparten workspace; si el state
// aún no tiene workspaceId (state viejo) no podemos saber si un agente homónimo es
// nuestro → lo tratamos como ajeno (alias), nunca reusamos uno de otro proyecto.
function isOurs(agent, workspaceId) {
  return Boolean(workspaceId) && agent.workspace_id === workspaceId;
}

function liveName(projectDir, logical, io = defaultIo()) {
  const st = io.loadState(projectDir);
  return (st.agents && st.agents[logical] && st.agents[logical].live) || logical;
}

function logicalOf(projectDir, live, io = defaultIo()) {
  const st = io.loadState(projectDir);
  for (const [logical, entry] of Object.entries(st.agents || {})) {
    if (entry && entry.live === live) return logical;
  }
  return live; // agente legacy sin registro: el vivo ES el lógico
}

function aliasError(logical, alias) {
  const err = new Error(
    `no hay nombre libre: el lógico '${logical}' y el alias '${alias}' ya están tomados (no agrego sufijos numéricos)`
  );
  err.code = "agent_name_taken";
  return err;
}

// Único camino de arranque de agentes. Reemplaza al `agentStart` a mano y a
// orchestrator.startAgentSafe. io inyectable para test:
//   { agentList, agentStart, agentWait, agentPrompt, loadState, updateState, log }
function start({ project, logical, persona, kind, paneId, args, promptText, skills, workspaceId }, io = defaultIo()) {
  const projectDir = project.projectDir;
  const st0 = io.loadState(projectDir);
  const wsId = workspaceId || st0.workspaceId || null;

  const list = io.agentList();
  const existing = list.find((a) => a.name === logical);
  const alias = `${slug(project.name, projectDir)}-${logical}`;
  const startLive = (name) => io.agentStart(name, kind, paneId, args || []);

  let live;
  let started = false;
  if (existing && isOurs(existing, wsId)) {
    // 1. ya vivo en NUESTRO workspace → reusar sin re-arrancar.
    live = logical;
    io.log(`[=] ${logical} ya está vivo`);
  } else if (existing) {
    // 2. tomado en otro workspace → alias directo, sin intentar el lógico.
    if (list.some((a) => a.name === alias)) throw aliasError(logical, alias);
    try {
      startLive(alias);
    } catch (err) {
      if (err.code === "agent_name_taken") throw aliasError(logical, alias);
      throw err;
    }
    live = alias;
    started = true;
  } else {
    // 3. intentar el lógico; si pierde la carrera (agent_name_taken) → alias, UNA vez.
    try {
      startLive(logical);
      live = logical;
      started = true;
    } catch (err) {
      if (err.code !== "agent_name_taken") throw err;
      if (list.some((a) => a.name === alias)) throw aliasError(logical, alias);
      try {
        startLive(alias);
      } catch (err2) {
        if (err2.code === "agent_name_taken") throw aliasError(logical, alias);
        throw err2;
      }
      live = alias;
      started = true;
    }
  }

  // Fallback de vendors sin prompt-por-archivo: inyectar el prompt tras idle.
  // Best-effort (un timeout no aborta el arranque ya hecho).
  if (started && promptText) {
    try {
      io.agentWait(live, ["idle"], 60000);
      io.agentPrompt(live, promptText);
    } catch (err) {
      io.log(`[!] ${live}: no pude inyectar el prompt inicial (${err.message || err.code})`);
    }
  }

  // El mapa lógico→vivo es la única fuente de la traducción; lo escriben los
  // arranques (bootstrap/spawn/plan-devs). updateState (S1) = lock + lectura fresca.
  io.updateState(projectDir, (st) => {
    // El alta limpia la baja: si el daemon había cerrado este lógico, relanzarlo
    // no debe quedar marcado como cerrado (si no, no le entrega el buzón y repite
    // el aviso de respawn). Mismo updateState del alta (FR-8.2).
    if (st.closed) delete st.closed[logical];
    st.agents = st.agents || {};
    st.agents[logical] = {
      live,
      persona: persona || null,
      kind: kind || null,
      paneId: paneId || null,
      workspaceId: wsId,
      skills: skills || [],
      startedAt: Date.now(),
    };
  });
  return live;
}

// io real: requires lazy para no crear un ciclo con daemon.js (S3b lo hará
// requerir a agents.js).
function defaultIo() {
  const herdr = require("./herdr");
  const daemon = require("./daemon");
  return {
    agentList: () => herdr.agentList(),
    agentStart: (name, kind, paneId, args) => herdr.agentStart(name, kind, paneId, args),
    agentWait: (name, until, timeoutMs) => herdr.agentWait(name, until, timeoutMs),
    agentPrompt: (name, text) => herdr.agentPrompt(name, text),
    loadState: (dir) => daemon.loadState(dir),
    updateState: (dir, fn) => daemon.updateState(dir, fn),
    log: (msg) => console.log(msg),
  };
}

module.exports = { start, liveName, logicalOf, slug, defaultIo };
