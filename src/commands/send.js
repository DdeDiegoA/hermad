"use strict";
const path = require("path");
const { resolveProject } = require("../lib/project");
const daemon = require("../lib/daemon");
const agents = require("../lib/agents");
const skills = require("../lib/skills");
const render = require("../lib/render");

// El buzón se keyea por nombre LÓGICO. Si alguien pasa el vivo (`hermad-architect`),
// se normaliza antes de escribir (el agente no tiene por qué saber el alias).
function normalizeTarget(projectDir, to, io) {
  return agents.logicalOf(projectDir, to, io);
}

// `send --skills a,b` para un agente VIVO: la skill no se recarga en caliente, así
// que se adjunta el bloque de rutas SKILL.md y el agente las lee con su herramienta.
// Una skill inexistente solo genera warning (se omite, no aborta el mensaje).
function taskSkillsBlockFor(names, projectDir) {
  const paths = [];
  const missing = [];
  for (const name of names || []) {
    const dir = skills.resolve(name, projectDir);
    if (dir) paths.push(path.join(dir, "SKILL.md"));
    else missing.push(name);
  }
  return { block: render.taskSkillsBlock(paths), missing };
}

function run(args) {
  const fromIdx = args.indexOf("--from");
  const from = fromIdx >= 0 ? args[fromIdx + 1] : process.env.HERMAD_AGENT || process.env.HERDR_AGENT_NAME || "agente";
  const skillsIdx = args.indexOf("--skills");
  const skillsArg = skillsIdx >= 0 ? args[skillsIdx + 1] : null;
  const skip = new Set();
  if (fromIdx >= 0) { skip.add(fromIdx); skip.add(fromIdx + 1); }
  if (skillsIdx >= 0) { skip.add(skillsIdx); skip.add(skillsIdx + 1); }
  const rest = args.filter((_, i) => !skip.has(i));
  const rawTo = rest[0];
  const text = rest.slice(1).join(" ").trim();

  if (!rawTo || !text) {
    console.error('Uso: hermad send <peer> "<mensaje>" [--from <agente>] [--skills a,b]');
    process.exit(1);
  }
  const project = resolveProject();
  if (!project) {
    console.error("No hay proyecto (ni .hermad/project.json ni activo).");
    process.exit(1);
  }
  const extraSkills = skillsArg ? skillsArg.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const { block, missing } = taskSkillsBlockFor(extraSkills, project.projectDir);
  if (missing.length) console.log(`[!] skill(s) inexistente(s): ${missing.join(", ")} — se omiten`);
  const fullText = block ? `${text}\n\n${block}` : text;

  const to = normalizeTarget(project.projectDir, rawTo);
  const file = daemon.send(project.projectDir, { from, to, text: fullText });
  console.log(`[+] ${from} → ${to}: encolado en ${file}`);
}

module.exports = { run, normalizeTarget, taskSkillsBlockFor };
