"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { resolveProject } = require("../lib/project");
const stories = require("../lib/stories");
const render = require("../lib/render");
const vendors = require("../lib/vendors");
const herdr = require("../lib/herdr");
const daemon = require("../lib/daemon");
const placement = require("../lib/placement");

// dev-1..N libres: salta los nombres que ya tienen una story no terminada (si no,
// una 2.ª corrida le pisaría el nombre a un dev vivo y los BUG irían al dev erróneo).
function allocateDevs(liveNames, count) {
  const used = new Set(liveNames);
  const out = [];
  let n = 1;
  while (out.length < count) {
    const name = `dev-${n++}`;
    if (used.has(name)) continue;
    used.add(name);
    out.push(name);
  }
  return out;
}

function existsBranch(projectDir, branch) {
  try {
    return execFileSync("git", ["branch", "--list", branch], { cwd: projectDir, encoding: "utf8" }).trim().length > 0;
  } catch {
    return false;
  }
}

function ensureWorktree(projectDir, storyId) {
  const branch = `hermad/${storyId}`;
  const wtDir = path.join(projectDir, ".hermad", "worktrees", storyId);
  if (fs.existsSync(path.join(wtDir, ".git"))) return { branch, wtDir, created: false };
  fs.mkdirSync(path.dirname(wtDir), { recursive: true });
  const args = existsBranch(projectDir, branch)
    ? ["worktree", "add", wtDir, branch]
    : ["worktree", "add", "-b", branch, wtDir, "HEAD"];
  execFileSync("git", args, { cwd: projectDir, stdio: "pipe" });
  return { branch, wtDir, created: true };
}

function run(args) {
  const maxIdx = args.indexOf("--max");
  let maxDevs = 3;
  if (maxIdx >= 0) {
    maxDevs = parseInt(args[maxIdx + 1], 10);
    if (!Number.isInteger(maxDevs) || maxDevs < 0) {
      console.error("Uso: hermad plan-devs [--max <entero >= 0>]");
      process.exit(1);
    }
  }
  const project = resolveProject();
  if (!project) {
    console.error("No hay proyecto (ni .hermad/project.json ni activo).");
    process.exit(1);
  }

  const loaded = stories.load(project.projectDir);
  if (!loaded) {
    console.error("No encontré stories.yaml (raíz del proyecto o .hermad/stories.yaml). El pm lo genera tras el plan.");
    process.exit(1);
  }
  const state = daemon.loadState(project.projectDir);
  state.stories = state.stories || {};
  const done = Object.entries(state.stories).filter(([, v]) => v.status === "done").map(([id]) => id);
  // "asignada" = dev vivo; "queued" (sin files) no ocupa dev pero tampoco está hecha.
  const active = Object.entries(state.stories).filter(([, v]) => v.status === "assigned").map(([id]) => id);
  const liveDevs = Object.entries(state.stories).filter(([, v]) => v.status === "assigned" && v.dev).map(([, v]) => v.dev);

  // max_devs es el tope GLOBAL de devs en paralelo: los que ya están trabajando
  // (devs vivos) descuentan slots, si no una 2.ª corrida los duplicaría.
  const slots = Math.max(0, maxDevs - liveDevs.length);
  const { selected, deferred } = stories.selectParallel(loaded.stories, slots, { done, active });
  console.log(`[plan-devs] ${loaded.file}: ${loaded.stories.length} stories · ${selected.length} nuevos (slots ${slots}/${maxDevs}, ${liveDevs.length} devs activos)`);

  // Las stories sin files van a cola secuencial: no se dropean, pero las registramos
  // para poder cerrarlas con su DONE (y liberar a las que dependan de ellas).
  for (const d of deferred) {
    if (/secuencial/.test(d.reason) && !state.stories[d.id]) state.stories[d.id] = { files: d.files || [], status: "queued" };
  }

  const personas = project.personas || {};
  const devPersona = personas.dev;
  const drops = [];
  const devNames = allocateDevs(liveDevs, selected.length);

  selected.forEach((story, i) => {
    const dev = devNames[i];
    const { branch, wtDir } = ensureWorktree(project.projectDir, story.id);
    console.log(`[+] ${dev}: story ${story.id} → ${branch} @ ${wtDir}`);
    // Ruta story → dev dueño: el daemon la usa para mandar los BUG al dev correcto
    // cuando hay devs paralelos, y para no re-seleccionar stories ya asignadas.
    state.stories[story.id] = { dev, branch, status: "assigned" };

    if (!devPersona) {
      console.log(`[!] no hay persona 'dev' en el proyecto — worktree creado, agente no dropeado`);
      return;
    }
    // Salida en el worktree (opencode busca su agente desde el cwd), memoria/skills
    // desde el repo principal (no la copia stale del journal en el worktree).
    const artifacts = render.renderPersona({ projectDir: wtDir, sourceDir: project.projectDir, agentName: dev, name: "dev", persona: devPersona, compactPct: project.compactPct || 50 });
    const plan = vendors.startPlan(devPersona.kind, "dev", devPersona, artifacts);
    drops.push({ dev, story: story.id, branch });

    if (!state.daemonPaneId) {
      console.log(`[!] sin pane del daemon registrado — dropeá el dev a mano:`);
      console.log(`    herdr pane split --current --direction right --cwd ${wtDir}`);
      console.log(`    herdr agent start ${dev} --kind ${devPersona.kind} --pane <id> -- ${plan.args.join(" ")}`);
      return;
    }
    try {
      let { paneId } = herdr.paneSplit(state.daemonPaneId, "down", { cwd: wtDir });
      // mismo destino que `hermad spawn`: el tab del departamento `dev` (desarrollo).
      paneId = placement.moveToDepartment(project, "dev", paneId, {
        workspaceId: state.workspaceId,
        tabList: herdr.tabList,
        paneList: herdr.paneList,
        paneMove: herdr.paneMove,
        log: console.log,
      });
      herdr.agentStart(dev, devPersona.kind, paneId, plan.args);
      if (plan.promptText) {
        herdr.agentWait(dev, ["idle"], 60000);
        herdr.agentPrompt(dev, plan.promptText);
      }
      console.log(`[+] ${dev} dropeado en ${paneId} (cwd ${wtDir})`);
    } catch (err) {
      console.log(`[!] no pude dropear ${dev} (${err.code || err.message}) — worktree ${branch} listo igual`);
    }
  });

  daemon.saveState(project.projectDir, state); // registra story→dev para las rutas BUG
  for (const d of deferred) console.log(`[=] ${d.id}: diferida (${d.reason})`);
  console.log(`\nMerge: al DONE del reviewer por story, el orquestador mergea ${drops.map((d) => d.branch).join(", ") || "(nada)"} (conflicto → gate humano).`);
}

module.exports = { run, ensureWorktree, allocateDevs };
