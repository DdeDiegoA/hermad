"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { resolveProject, PROJECT_REL } = require("../lib/project");
const skills = require("../lib/skills");
const skillsIndex = require("../lib/skills-index");
const discovery = require("../lib/discovery");
const config = require("../lib/config");
const prompts = require("../lib/prompts");
const pack = require("../lib/pack");
const prompt = require("../lib/prompt");

// Skills: índice cacheado (`list`), matcher local (`match`) y globalSkills
// (`global add|rm`, `suggest --global`). El match solo propone; nunca aplica.
// `suggest <persona>` (Fase 8) queda con el mismo contrato.

function currentProject() {
  try {
    return resolveProject();
  } catch {
    return null;
  }
}

function flagValue(args, name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
}

function usage() {
  console.error(
    [
      "Uso:",
      "  hermad skills list [--refresh] [--source S] [--json]",
      '  hermad skills match "<tarea>" [--persona P] [--top N] [--json]',
      "  hermad skills suggest <persona>",
      "  hermad skills suggest --global",
      "  hermad skills global [list]",
      "  hermad skills global add|rm <skill...> [--project] [--force]",
    ].join("\n")
  );
  process.exit(1);
}

function list(args) {
  const refresh = args.includes("--refresh");
  const json = args.includes("--json");
  const source = flagValue(args, "--source");
  const project = currentProject();
  let rows = skillsIndex.build({ refresh, projectDir: project && project.projectDir });
  if (source) rows = rows.filter((s) => s.source === source);
  if (json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (!rows.length) {
    console.log("sin skills indexadas");
    return;
  }
  for (const s of rows) console.log(`${s.id}\t${s.source}\t${s.dir}`);
  console.log(`\n${rows.length} skills (cache: ${skillsIndex.CACHE_PATH})`);
}

function doMatch(args) {
  const task = args[0];
  if (!task || task.startsWith("--")) usage();
  const json = args.includes("--json");
  const persona = flagValue(args, "--persona");
  const topArg = flagValue(args, "--top");
  const top = topArg ? parseInt(topArg, 10) : 15;
  const project = currentProject();
  const globals = skills.effectiveGlobals(project);
  const rows = skillsIndex.match(task, { persona, top, projectDir: project && project.projectDir, globals });
  if (json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (!rows.length) {
    console.log("sin candidatas");
    return;
  }
  for (const s of rows) console.log(`${s.score}\t${s.id}\t${s.source}\t${s.description}`);
}

// --- globalSkills -----------------------------------------------------------

// Pura: add deduplica, rm filtra. Devuelve una config nueva.
function applyGlobal(cfg, action, names) {
  const current = Array.isArray(cfg.globalSkills) ? cfg.globalSkills : [];
  const next = action === "rm" ? current.filter((s) => !names.includes(s)) : [...new Set([...current, ...names])];
  return { ...cfg, globalSkills: next };
}

// Pura: override por proyecto en project.json `skills: {add, remove}`.
function applyProject(project, action, names) {
  const skillsField = project.skills && typeof project.skills === "object" ? project.skills : {};
  const add = action === "add" ? [...new Set([...(skillsField.add || []), ...names])] : skillsField.add || [];
  const remove = action === "rm" ? [...new Set([...(skillsField.remove || []), ...names])] : skillsField.remove || [];
  return { ...project, skills: { add, remove } };
}

// Rechaza nombres inexistentes salvo --force. Devuelve {ok, missing}.
function validateNames(names, projectDir, force) {
  const missing = force ? [] : names.filter((n) => !skills.resolve(n, projectDir));
  return { ok: missing.length === 0, missing };
}

function globalList() {
  const cfg = config.load();
  const project = currentProject();
  const override = (project && (project.skills || project.globalSkills)) || {};
  const add = Array.isArray(override) ? override : override.add || [];
  const remove = Array.isArray(override) ? [] : override.remove || [];
  const globals = Array.isArray(cfg.globalSkills) ? cfg.globalSkills : [];
  const effective = skills.effectiveGlobals(project, { config: cfg });
  for (const s of effective) {
    const origin = add.includes(s) && !globals.includes(s) ? "proyecto" : "global";
    console.log(`${s}\t${origin}`);
  }
  for (const s of remove) if (globals.includes(s)) console.log(`${s}\t(removida por proyecto)`);
  console.log(`\n${effective.length} globalSkills efectivas (${config.CONFIG_PATH})`);
}

function globalMutate(action, args) {
  const names = args.filter((a) => !a.startsWith("--"));
  if (!names.length) usage();
  const project = currentProject();
  const toProject = args.includes("--project");
  const force = args.includes("--force");
  const projectDir = project && project.projectDir;
  const { ok, missing } = validateNames(names, projectDir, force);
  if (!ok) {
    console.error(`skill inexistente: ${missing.join(", ")} (usá --force para forzar)`);
    process.exit(1);
  }

  if (toProject) {
    if (!project) usage();
    const file = path.join(project.projectDir, PROJECT_REL);
    const next = applyProject(project, action, names);
    fs.writeFileSync(file, JSON.stringify(next, null, 2) + "\n");
    console.log(`${action} en proyecto: ${names.join(", ")} -> ${file}`);
    return;
  }

  const cfg = applyGlobal(config.load(), action, names);
  config.save(cfg);
  console.log(`${action}: ${names.join(", ")} -> ${cfg.globalSkills.join(", ")}`);
}

function global(args) {
  const action = args[0];
  if (!action || action === "list") return globalList();
  if (action === "add" || action === "rm") return globalMutate(action, args.slice(1));
  usage();
}

// --- suggest ----------------------------------------------------------------

// Skills proponibles: fuera del pack base (herdr-bmad) y fuera de las globales
// ya efectivas — no tiene sentido volver a sugerir lo que ya está activo.
function proposable(list, globals, home = os.homedir()) {
  const g = new Set(globals || []);
  return list.filter((s) => !pack.isPackSkill(s.dir, home) && !g.has(s.id) && !g.has(s.name));
}

// Al LLM solo le va el nombre + el rol en una línea de la persona: el cuerpo del
// prompt nunca sale de la máquina (misma regla que discovery.buildLLMPrompt).
function buildSuggestPrompt({ personaName, role, current, installed }) {
  const list = installed.map((s) => `- ${s.display}: ${s.description}`).join("\n");
  return [
    "Eres un selector de skills para un agente de coding.",
    `Persona: ${personaName}.`,
    "Rol (una línea):",
    role || "(sin descripción)",
    "",
    "Skills INSTALADAS (solo podés elegir de esta lista, no inventes):",
    list,
    "",
    `Skills actuales de la persona: ${current.length ? current.join(", ") : "(ninguna)"}`,
    "",
    'Devolvé SOLO un JSON: {"skills": ["<display>", ...], "reason": "<una línea>"} con 2 a 6 skills relevantes al rol.',
  ].join("\n");
}

function buildGlobalPrompt({ installed, current }) {
  const list = installed.map((s) => `- ${s.display}: ${s.description}`).join("\n");
  return [
    "Elegís skills de uso GENERAL para un equipo de agentes de coding (no de dominio).",
    "Deben servir a cualquier proyecto: protocolo, estilo, verificación, no frameworks ni negocios.",
    "",
    "Skills INSTALADAS (solo podés elegir de esta lista, no inventes):",
    list,
    "",
    `GlobalSkills actuales: ${current.length ? current.join(", ") : "(ninguna)"}`,
    "",
    'Devolvé SOLO un JSON: {"skills": ["<display>", ...], "reason": "<una línea>"} con 2 a 6 skills.',
  ].join("\n");
}

function parseSuggestions(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    return Array.isArray(j.skills) ? j.skills : null;
  } catch {
    return null;
  }
}

function callVendor(kind, model, promptText) {
  const run = (bin, argv) => execFileSync(bin, argv, { encoding: "utf8", timeout: 180000, stdio: ["ignore", "pipe", "pipe"] });
  const modelArgs = model ? ["--model", model] : [];
  if (kind === "opencode") return run("opencode", ["run", promptText, ...(model ? ["-m", model] : [])]);
  if (kind === "hermes") return run("hermes", [...modelArgs, "-z", promptText]);
  return run("claude", ["-p", promptText, ...modelArgs]);
}

// Consulta al vendor SIN cortar el CLI: si falla, el caller cae al matcher local
// (FR-2.3). El exit queda solo en el borde (uso inválido / errores de uso).
function tryVendor(project, promptText) {
  const orq = ((project || {}).personas || {}).orquestador || {};
  const model = /-m|--model/.test(orq.modelFlag || "") ? (orq.modelFlag || "").split(" ").pop() : null;
  const kind = orq.kind || "claude";
  try {
    return { ok: true, output: callVendor(kind, model, promptText) };
  } catch (err) {
    return { ok: false, error: `${kind}: ${err.message}` };
  }
}

// Tarea de fallback para el matcher local: los cuerpos/roles de las personas.
function personaTask(project) {
  return Object.keys((project || {}).personas || {})
    .map((p) => (prompts.loadPersona(p) || {}).body || (project.personas[p] || {}).rol || "")
    .join("\n");
}

// Escribe globalSkills solo tras confirmación interactiva. `ask`/`save`
// inyectables para test.
async function confirmGlobal(suggested, { ask = prompt.ask, save = config.save, load = config.load, file = config.CONFIG_PATH } = {}) {
  const answer = await ask(`¿Escribo ${suggested.length} globalSkills en ${file}? [y/N] `);
  if (!/^y(es)?$/i.test(answer || "")) {
    console.log("no cambié nada");
    return false;
  }
  const cfg = load();
  const globalSkills = [...new Set([...(cfg.globalSkills || []), ...suggested])];
  save({ ...cfg, globalSkills });
  console.log(`globalSkills actualizadas: ${globalSkills.join(", ")}`);
  return true;
}

async function suggestGlobal() {
  const project = currentProject();
  const current = config.load().globalSkills || [];
  const installed = proposable(skills.listInstalled(project && project.projectDir), current);
  if (!installed.length) {
    console.error("No encontré skills proponibles (fuera del pack y de las globales actuales).");
    process.exit(1);
  }
  const res = tryVendor(project, buildGlobalPrompt({ installed, current }));
  let suggested = res.ok ? parseSuggestions(res.output) : null;
  if (!suggested) {
    console.error(res.ok ? "El vendor no devolvió JSON parseable. Uso el buscador local." : `No pude consultar el vendor (${res.error}). Uso el buscador local.`);
    const task = personaTask(project) || "team coding protocol verification review style";
    suggested = discovery.rankLocal(task, { list: installed, globals: current, top: 10 }).map((s) => s.name);
  }
  console.log(`\nPropuesta de globalSkills: [${suggested.join(", ")}]`);
  await confirmGlobal(suggested);
}

function suggestPersona(personaName) {
  const project = currentProject();
  if (!project) {
    console.error("No hay proyecto (ni .hermad/project.json ni activo).");
    process.exit(1);
  }

  const globals = skills.effectiveGlobals(project);
  const installed = proposable(skills.listInstalled(project.projectDir), globals);
  if (!installed.length) {
    console.error("No encontré skills proponibles (fuera del pack y de las globales actuales).");
    process.exit(1);
  }

  const p = prompts.loadPersona(personaName);
  const current = (p && p.skills) || [];
  // body = solo para el matcher local; role = lo único que se manda al vendor.
  const body = (p && p.body) || (project.personas[personaName] || {}).rol || "";
  const role = (project.personas[personaName] || {}).rol || personaName;
  const res = tryVendor(project, buildSuggestPrompt({ personaName, role, current, installed }));
  let suggested = res.ok ? parseSuggestions(res.output) : null;
  if (!suggested) {
    console.error(res.ok ? "El vendor no devolvió JSON parseable. Uso el buscador local." : `No pude consultar el vendor (${res.error}). Uso el buscador local.`);
    suggested = discovery.rankLocal(body, { list: installed, globals: config.load().globalSkills || [], top: 8 }).map((s) => s.name);
  }

  const add = suggested.filter((s) => !current.includes(s));
  const remove = current.filter((s) => !suggested.includes(s));
  console.log(`\nPropuesta para '${personaName}' (solo propuesta — la aplicás a mano en templates/prompts/${personaName}.md):`);
  console.log(`  skills: [${suggested.join(", ")}]`);
  if (add.length) console.log(`  + agregar: ${add.join(", ")}`);
  if (remove.length) console.log(`  - quitar:  ${remove.join(", ")}`);
  console.log(`\nFrontmatter sugerido:\n  skills: [${suggested.join(", ")}]`);
}

async function route(args) {
  const sub = args[0];
  if (sub === "list") return list(args.slice(1));
  if (sub === "match") return doMatch(args.slice(1));
  if (sub === "global") return global(args.slice(1));
  if (sub === "suggest") {
    if (args[1] === "--global") return suggestGlobal();
    if (!args[1]) usage();
    return suggestPersona(args[1]);
  }
  usage();
}

// La CLI llama run() sin await (contrato viejo): se routea async y se atrapan
// los rechazos acá para no tirar una unhandled rejection.
function run(args) {
  Promise.resolve(route(args)).catch((err) => {
    console.error(`hermad: ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  run,
  buildSuggestPrompt,
  buildGlobalPrompt,
  parseSuggestions,
  applyGlobal,
  applyProject,
  validateNames,
  confirmGlobal,
  proposable,
};
