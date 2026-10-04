"use strict";
const { execFileSync } = require("child_process");
const { resolveProject } = require("../lib/project");
const render = require("../lib/render");
const vendors = require("../lib/vendors");
const herdr = require("../lib/herdr");
const daemon = require("../lib/daemon");
const placement = require("../lib/placement");
const agents = require("../lib/agents");

// Branch del cwd donde corre `spawn` (o null si no es un repo git). Se guarda en
// la story para que el aviso al orquestador pueda ubicar el trabajo (FR-8.4).
function currentBranch(dir = process.cwd()) {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

// Registro de ownership de `spawn --story` (FR-8.1): mismo formato que plan-devs
// + source. Si la story ya es de otro dev, tira: el ownership no se pisa.
function assignStory(state, { storyId, dev, branch }) {
  state.stories = state.stories || {};
  const prev = state.stories[storyId];
  if (prev && prev.dev && prev.dev !== dev) {
    const err = new Error(`story ${storyId} ya asignada a ${prev.dev} — no piso el ownership`);
    err.code = "story_owned";
    throw err;
  }
  state.stories[storyId] = { dev, branch: branch || null, status: "assigned", source: "spawn" };
  return state.stories[storyId];
}

// Único camino para que un agente (o un humano) dropee otro agente: pasa por
// render + vendors.startPlan, así hereda persona, skills, memoria y bypass de
// permisos igual que los que lanza start-team. No usar `herdr agent start` a mano.
function run(args) {
  const opt = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : null;
  };
  const persona = args.find((a, i) => !a.startsWith("--") && !["--name", "--pane", "--kind", "--model", "--skills", "--story"].includes(args[i - 1]));
  if (!persona) {
    console.error("Uso: hermad spawn <persona> [--name <agente>] [--pane <pane_id>] [--kind <vendor>] [--model <id>] [--skills a,b] [--story <id>]");
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
  const skillsArg = opt("--skills");
  const extraSkills = skillsArg ? skillsArg.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const p = { ...base, kind, modelFlag: model ? vendors.modelFlagFor(kind, model) : base.modelFlag };
  const name = opt("--name") || (opt("--kind") || opt("--model") ? `${persona}-${kind}` : persona);
  const storyId = opt("--story");
  const state = daemon.loadState(project.projectDir);

  // FR-8.1: el ownership se chequea ANTES de arrancar — no se dropea el agente
  // para después descubrir que la story era de otro.
  if (storyId) {
    const prev = state.stories && state.stories[storyId];
    if (prev && prev.dev && prev.dev !== name) {
      console.error(`story ${storyId} ya asignada a ${prev.dev} — no piso el ownership (usá --name ${prev.dev} o cerrá esa pata)`);
      process.exit(1);
    }
  }

  // Sin --pane: `placement.paneForAgent` lo ubica SOLO en el tab de su
  // departamento (lo crea si no existe). Nunca cae en el tab default junto al
  // orquestador/daemon.
  let paneId = opt("--pane");
  if (!paneId) {
    paneId = placement.paneForAgent(project, persona, {
      workspaceId: state.workspaceId,
      daemonPaneId: state.daemonPaneId,
      cwd: project.projectDir,
      state,
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

  const artifacts = render.renderPersona({ projectDir: project.projectDir, agentName: name, name: persona, persona: p, compactPct: project.compactPct || 50, extraSkills, project });
  const plan = vendors.startPlan(p.kind, persona, p, artifacts);
  // Único camino de arranque: agents.start resuelve el alias si `name` está tomado
  // en otro workspace y registra state.agents[name] (nombre lógico → vivo).
  const live = agents.start({ project, logical: name, persona, kind: p.kind, paneId, args: plan.args, promptText: plan.promptText, skills: artifacts.skillsAllow });
  // Registro tras el alta (design §8): la guarda de story de maybeClose ya mira
  // state.stories[].dev, así que el auto-close no cierra antes del DONE del reviewer.
  if (storyId) {
    const branch = currentBranch(process.cwd());
    daemon.updateState(project.projectDir, (st) => assignStory(st, { storyId, dev: name, branch }));
  }
  console.log(`[+] ${name} (${persona}, ${p.kind}) en ${paneId}${live !== name ? ` — vivo ${live}` : ""}${storyId ? ` · story ${storyId}` : ""}`);
}

module.exports = { run, assignStory, currentBranch };
