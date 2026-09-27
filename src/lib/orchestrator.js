"use strict";
const herdr = require("./herdr");
const prompts = require("./prompts");
const vendors = require("./vendors");
const render = require("./render");
const daemon = require("./daemon");

// Native port of skill/scripts/orquestar.sh: workspace + orchestrator (root pane) +
// departments in tabs with a grid of up to 4 columns x 2 rows + agents, and optionally
// the briefing+intent to the orchestrator. Unlike the original bash, an agent name
// collision (agent_name_taken — already alive in another workspace/project) does not
// abort the whole bootstrap: it is logged and skipped, and the rest of the team is set up.
function bootstrap({ projectDir, label, personas, departamentos, intent, onlyOrchestrator = false, withDaemon = true, compactPct = 50 }) {
  herdr.ensureInstalled();

  // Artefactos por proyecto (una sola vez): memoria claude + comandos + gitignore.
  render.ensureClaudeMemory(projectDir);
  render.ensureCommands(projectDir);
  render.ensureGitignore(projectDir);

  const { workspaceId, rootPaneId } = herdr.workspaceCreate(projectDir, label);

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
  console.log(`[+] orquestador (${orquestador.kind}) on ${rootPaneId} — ${orquestador.rol}`);
  startAgentSafe("orquestador", orquestador, rootPaneId, vendors.startPlan(orquestador.kind, "orquestador", orquestador, orqArtifacts));

  const workers = [];
  for (const [tabLabel, names] of onlyOrchestrator ? [] : departamentos) {
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
      console.log(`[+] ${name} (${persona.kind}) on ${panes[i]} [${tabLabel}] — ${persona.rol}`);
      startAgentSafe(name, persona, panes[i], vendors.startPlan(persona.kind, name, persona, artifacts));
      workers.push(name);
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
    const briefing = [
      `You are Hermad, the orchestrator of this Herdr workspace. Project: ${projectDir} (BMad installed).`,
      `Agents: orquestador ${workers.join(" ")} (in per-department tabs). Use 'herdr agent list' for the live roster.`,
      "Route the BMad epic path through the personas and answer approvals per policy:",
      "auto-approve unless it touches auth/money/DB/security — then leave it blocked and notify Diego.",
      "Agents can talk to each other directly (peer-to-peer) via `hermad send <peer> \"...\"`; you coordinate the top level.",
      `Intent: ${intent}`,
      "Report DONE when the epic is complete.",
    ].join("\n");
    herdr.agentPrompt("orquestador", briefing);
    console.log(`[+] Workspace: ${workspaceId} | Orchestrator started with intent. View the board with: herdr`);
  } else {
    console.log(`[+] Workspace: ${workspaceId} | ${onlyOrchestrator ? "Orchestrator ready (workers on demand)" : "Agents connected, no initial prompt"}. View the board with: herdr`);
  }

  return { workspaceId };
}

function startAgentSafe(name, persona, paneId, plan) {
  try {
    herdr.agentStart(name, persona.kind, paneId, plan.args);

    // Fallback (vendors sin prompt-por-archivo): inyectar el prompt como primer
    // mensaje tras llegar a idle. Claude/opencode lo reciben por archivo, sin
    // mensaje inicial visible en el TUI.
    if (plan.promptText) {
      try {
        herdr.agentWait(name, ["idle"], 60000);
      } catch (err) {
        console.log(`[!] ${name}: timed out waiting for idle, skipping initial prompt injection (${err.message || err.code})`);
        return;
      }
      try {
        herdr.agentPrompt(name, plan.promptText);
      } catch (err) {
        console.log(`[!] ${name}: initial prompt injection failed (${err.message || err.code})`);
      }
    }
  } catch (err) {
    if (err.code === "agent_name_taken") {
      console.log(`[=] ${name} is already alive in another pane — leaving it untouched. (${err.message})`);
      return;
    }
    throw err;
  }
}

module.exports = { bootstrap, startAgentSafe };
