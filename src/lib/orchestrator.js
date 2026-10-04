"use strict";
const herdr = require("./herdr");
const prompts = require("./prompts");
const vendors = require("./vendors");
const render = require("./render");
const daemon = require("./daemon");
const placement = require("./placement");
const agents = require("./agents");

// Native port of skill/scripts/orquestar.sh: workspace + orchestrator (root pane) +
// departments in tabs with a grid of up to 4 columns x 2 rows + agents, and optionally
// the briefing+intent to the orchestrator. Unlike the original bash, an agent name
// collision (agent_name_taken — already alive in another workspace/project) does not
// abort the whole bootstrap: it is logged and skipped, and the rest of the team is set up.
function bootstrap({ projectDir, name, label, personas, departamentos, intent, onlyOrchestrator = false, withDaemon = true, compactPct = 50 }) {
  herdr.ensureInstalled();

  // Artefactos por proyecto (una sola vez): memoria claude + comandos + gitignore.
  render.ensureClaudeMemory(projectDir);
  render.ensureCommands(projectDir);
  render.ensureGitignore(projectDir);

  const { workspaceId, rootPaneId } = herdr.workspaceCreate(projectDir, label);

  // El tab default pasa a llamarse `gerencia` (ahí vive el orquestador). Es lo
  // único que existe tras workspaceCreate, así que tabList[0] es ese tab.
  // Best-effort: un fallo de herdr solo se loguea.
  try {
    const [defaultTab] = herdr.tabList(workspaceId);
    if (defaultTab) {
      const r = herdr.tabRename(defaultTab.tab_id, placement.MANAGEMENT_TAB);
      if (!r.ok) console.log(`[!] no pude renombrar el tab default a '${placement.MANAGEMENT_TAB}' (${r.code || "error"})`);
    }
  } catch (err) {
    console.log(`[!] no pude renombrar el tab default (${err.message || err.code})`);
  }

  // Contexto mínimo para `agents.start` (alias + registro en state.agents).
  const project = { projectDir, name: name || label };

  // Pane del daemon en el tab default — se divide ANTES de arrancar cualquier
  // agente full-screen en el root (si no, el pane nuevo queda sin shell).
  let daemonPaneId = null;
  if (withDaemon) {
    daemonPaneId = herdr.paneSplit(rootPaneId, "right").paneId;
  }
  // Guardar dónde vive el daemon (pane sin agente → fuente segura para splits
  // de `plan-devs`, sin caer en el pitfall de dividir un pane con agente).
  try {
    const st = daemon.loadState(projectDir);
    st.workspaceId = workspaceId;
    st.daemonPaneId = daemonPaneId;
    daemon.saveState(projectDir, st);
  } catch {
    /* best-effort */
  }

  const orquestador = personas.orquestador;
  if (!orquestador) throw new Error('missing "orquestador" persona in config');
  const orqArtifacts = render.renderPersona({ projectDir, name: "orquestador", persona: orquestador, compactPct });
  const orqLive = startAgentSafe(project, "orquestador", orquestador, rootPaneId, vendors.startPlan(orquestador.kind, "orquestador", orquestador, orqArtifacts)) || "orquestador";
  console.log(`[+] orquestador (${orquestador.kind}) on ${rootPaneId} — ${orquestador.rol}${orqLive !== "orquestador" ? ` (vivo ${orqLive})` : ""}`);

  const workers = [];
  for (const [tabLabel, names] of onlyOrchestrator ? [] : departamentos) {
    if (tabLabel === placement.MANAGEMENT_TAB) {
      console.log(`[!] '${tabLabel}' es el tab del orquestador, no de workers — ignoro esa entrada de departamentos`);
      continue;
    }
    const { rootPaneId: tabRoot } = herdr.tabCreate(workspaceId, projectDir, tabLabel);

    // Pitfall from the skill: do not split a pane that has a full-screen agent running
    // (the new pane ends up without a shell → agent_pane_busy). That's why the whole tab
    // grid is built first, and only then agents are started.
    const panes = [tabRoot];
    for (let i = 1; i < names.length; i++) {
      const paneId = i < 4 ? herdr.paneSplit(panes[i - 1], "right").paneId : herdr.paneSplit(panes[i - 4], "down").paneId;
      panes.push(paneId);
    }

    names.forEach((name, i) => {
      const persona = personas[name];
      if (!persona) throw new Error(`persona '${name}' not defined in personas`);
      const artifacts = render.renderPersona({ projectDir, name, persona, compactPct });
      const live = startAgentSafe(project, name, persona, panes[i], vendors.startPlan(persona.kind, name, persona, artifacts));
      console.log(`[+] ${name} (${persona.kind}) on ${panes[i]} [${tabLabel}] — ${persona.rol}${live && live !== name ? ` (vivo ${live})` : ""}`);
      workers.push(live && live !== name ? `${name}→${live}` : name);
    });
  }

  // El daemon arranca al final: los agentes ya existen y su poll los encuentra.
  if (daemonPaneId) {
    try {
      herdr.paneRun(daemonPaneId, "hermad daemon");
      console.log(`[+] daemon on ${daemonPaneId} (buzón + rutas HERMAD:)`);
    } catch (err) {
      console.log(`[!] no pude arrancar el daemon (${err.message || err.code}) — corré 'hermad daemon' a mano`);
    }
  }

  if (intent) {
    // Roster lógico, con `lógico→vivo` cuando el nombre chocó y arrancó con alias.
    const roster = [`orquestador${orqLive !== "orquestador" ? `→${orqLive}` : ""}`, ...workers].join(" ");
    const briefing = [
      `You are Hermad, the orchestrator of this Herdr workspace. Project: ${projectDir} (BMad installed).`,
      `Agents: ${roster} (in per-department tabs). Use 'herdr agent list' for the live roster.`,
      "Route the BMad epic path through the personas and answer approvals per policy:",
      "auto-approve unless it touches auth/money/DB/security — then leave it blocked and notify Diego.",
      "Agents can talk to each other directly (peer-to-peer) via `hermad send <peer> \"...\"`; you coordinate the top level.",
      "Inviolable rule: you ONLY delegate — never edit code/docs/tests/configs, never fix/hotfix bugs, never run tests; the only exceptions are hermad/herdr control, merging reviewer-approved branches, and AGENTS.md/journal.",
      `Intent: ${intent}`,
      "Report DONE when the epic is complete.",
    ].join("\n");
    herdr.agentPrompt(orqLive, briefing);
    console.log(`[+] Workspace: ${workspaceId} | Orchestrator started with intent. View the board with: herdr`);
  } else {
    console.log(`[+] Workspace: ${workspaceId} | ${onlyOrchestrator ? "Orchestrator ready (workers on demand)" : "Agents connected, no initial prompt"}. View the board with: herdr`);
  }

  return { workspaceId };
}

// Deprecado: `agents.start` es el único camino de arranque (resuelve el alias si
// el nombre está tomado y registra state.agents). Wrapper conservado por compat
// de la superficie pública; devuelve el nombre vivo, o null si quedó sin arrancar.
function startAgentSafe(project, name, persona, paneId, plan) {
  try {
    return agents.start({
      project,
      logical: name,
      persona: name,
      kind: persona.kind,
      paneId,
      args: plan.args,
      promptText: plan.promptText,
    });
  } catch (err) {
    if (err.code === "agent_name_taken") {
      console.log(`[=] ${name}: ${err.message} — lo dejo sin arrancar`);
      return null;
    }
    throw err;
  }
}

module.exports = { bootstrap, startAgentSafe };
