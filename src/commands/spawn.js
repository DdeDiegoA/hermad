"use strict";
const { resolveProject } = require("../lib/project");
const render = require("../lib/render");
const vendors = require("../lib/vendors");
const herdr = require("../lib/herdr");
const daemon = require("../lib/daemon");
const placement = require("../lib/placement");
const agents = require("../lib/agents");

// Único camino para que un agente (o un humano) dropee otro agente: pasa por
// render + vendors.startPlan, así hereda persona, skills, memoria y bypass de
// permisos igual que los que lanza start-team. No usar `herdr agent start` a mano.
function run(args) {
  const opt = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : null;
  };
  const persona = args.find((a, i) => !a.startsWith("--") && !["--name", "--pane", "--kind", "--model"].includes(args[i - 1]));
  if (!persona) {
    console.error("Uso: hermad spawn <persona> [--name <agente>] [--pane <pane_id>] [--kind <vendor>] [--model <id>]");
    process.exit(1);
  }
  const project = resolveProject();
  if (!project) {
    console.error("No hay proyecto (ni .hermad/project.json ni activo).");
    process.exit(1);
  }
  const base = (project.personas || {})[persona];
  if (!base) {
    console.error(`persona '${persona}' no definida en ${project.projectDir}/.hermad/project.json`);
    process.exit(1);
  }
  // Override de vendor/modelo para abrir un worker más barato (p.ej. un claude
  // delega el bulk a `--kind opencode`). Por defecto usa la persona del proyecto.
  const kind = opt("--kind") || base.kind;
  if (!vendors.VENDOR_BINARIES[kind]) {
    console.error(`--kind desconocido: '${kind}' (válidos: ${Object.keys(vendors.VENDOR_BINARIES).join(", ")})`);
    process.exit(1);
  }
  const model = opt("--model");
  const p = { ...base, kind, modelFlag: model ? vendors.modelFlagFor(kind, model) : base.modelFlag };
  const name = opt("--name") || (opt("--kind") || opt("--model") ? `${persona}-${kind}` : persona);

  // Sin --pane: `placement.paneForAgent` lo ubica SOLO en el tab de su
  // departamento (lo crea si no existe). Nunca cae en el tab default junto al
  // orquestador/daemon.
  let paneId = opt("--pane");
  if (!paneId) {
    const { daemonPaneId, workspaceId } = daemon.loadState(project.projectDir);
    paneId = placement.paneForAgent(project, persona, {
      workspaceId,
      daemonPaneId,
      cwd: project.projectDir,
      tabList: herdr.tabList,
      tabCreate: herdr.tabCreate,
      paneList: herdr.paneList,
      paneSplit: herdr.paneSplit,
      paneMove: herdr.paneMove,
      log: console.log,
    });
    if (!paneId) {
      console.error(`no pude ubicar ${persona} en su tab de departamento: revisá que esté en 'departamentos' y que haya workspace+daemon (o pasá --pane <id>).`);
      process.exit(1);
    }
  }

  const artifacts = render.renderPersona({ projectDir: project.projectDir, agentName: name, name: persona, persona: p, compactPct: project.compactPct || 50 });
  const plan = vendors.startPlan(p.kind, persona, p, artifacts);
  // Único camino de arranque: agents.start resuelve el alias si `name` está tomado
  // en otro workspace y registra state.agents[name] (nombre lógico → vivo).
  const live = agents.start({ project, logical: name, persona, kind: p.kind, paneId, args: plan.args, promptText: plan.promptText });
  console.log(`[+] ${name} (${persona}, ${p.kind}) en ${paneId}${live !== name ? ` — vivo ${live}` : ""}`);
}

module.exports = { run };
