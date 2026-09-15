"use strict";
const herdr = require("./herdr");
const prompts = require("./prompts");

// Native port of skill/scripts/orquestar.sh: workspace + orchestrator (root pane) +
// departments in tabs with a grid of up to 4 columns x 2 rows + agents, and optionally
// the briefing+intent to the orchestrator. Unlike the original bash, an agent name
// collision (agent_name_taken — already alive in another workspace/project) does not
// abort the whole bootstrap: it is logged and skipped, and the rest of the team is set up.
function bootstrap({ projectDir, label, personas, departamentos, intent }) {
  herdr.ensureInstalled();

  const { workspaceId, rootPaneId } = herdr.workspaceCreate(projectDir, label);

  const orquestador = personas.orquestador;
  if (!orquestador) throw new Error('missing "orquestador" persona in config');
  const orquestadorPrompt = prompts.loadPersonaPrompt("orquestador");
  console.log(`[+] orquestador (${orquestador.kind}) on ${rootPaneId} — ${orquestador.rol}`);
  startAgentSafe("orquestador", orquestador, rootPaneId, orquestadorPrompt);

  const workers = [];
  for (const [tabLabel, names] of departamentos) {
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
      const promptText = prompts.loadPersonaPrompt(name);
      console.log(`[+] ${name} (${persona.kind}) on ${panes[i]} [${tabLabel}] — ${persona.rol}`);
      startAgentSafe(name, persona, panes[i], promptText);
      workers.push(name);
    });
  }

  if (intent) {
    const briefing = [
      `You are Hermad, the orchestrator of this Herdr workspace. Project: ${projectDir} (BMad installed).`,
      `Agents: orquestador ${workers.join(" ")} (in per-department tabs). Use 'herdr agent list' for the live roster.`,
      "Route the BMad epic path through the personas and answer approvals per policy:",
      "auto-approve unless it touches auth/money/DB/security — then leave it blocked and notify Diego.",
      "Agents can talk to each other directly (peer-to-peer); you coordinate the top level.",
      `Intent: ${intent}`,
      "Report DONE when the epic is complete.",
    ].join("\n");
    herdr.agentPrompt("orquestador", briefing);
    console.log(`[+] Workspace: ${workspaceId} | Orchestrator started with intent. View the board with: herdr`);
  } else {
    console.log(`[+] Workspace: ${workspaceId} | Agents connected, no initial prompt. View the board with: herdr`);
  }

  return { workspaceId };
}

function startAgentSafe(name, persona, paneId, promptText) {
  try {
    const vendorArgs = buildVendorArgs(persona.modelFlag);
    herdr.agentStart(name, persona.kind, paneId, vendorArgs);

    // `herdr agent start` types the whole command line into the target shell —
    // a raw newline mid-command would submit early, so herdr refuses any
    // multi-line argument outright (invalid_agent_argument). Persona prompts are
    // multi-line markdown, so no vendor (Claude included) can receive them via a
    // start flag like --append-system-prompt. `herdr agent prompt` instead sends
    // text to the already-running TUI's input box, which handles multi-line
    // content fine — so every kind gets its persona prompt injected as the first
    // message after reaching idle, not at start.
    if (promptText) {
      try {
        herdr.agentWait(name, ["idle"], 60000);
      } catch (err) {
        console.log(`[!] ${name}: timed out waiting for idle, skipping initial prompt injection (${err.message || err.code})`);
        return;
      }
      try {
        herdr.agentPrompt(name, promptText);
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

function buildVendorArgs(modelFlag) {
  return Array.isArray(modelFlag) ? [...modelFlag] : (modelFlag || "").split(" ").filter(Boolean);
}

module.exports = { bootstrap };
