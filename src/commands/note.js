"use strict";
const { resolveProject } = require("../lib/project");
const memory = require("../lib/memory");

function run(args) {
  const storyIdx = args.indexOf("--story");
  const forIdx = args.indexOf("--for");
  const story = storyIdx >= 0 ? args[storyIdx + 1] : null;
  const forPersona = forIdx >= 0 ? args[forIdx + 1] : null;
  const skip = new Set();
  if (storyIdx >= 0) { skip.add(storyIdx); skip.add(storyIdx + 1); }
  if (forIdx >= 0) { skip.add(forIdx); skip.add(forIdx + 1); }
  const text = args.filter((_, i) => !skip.has(i)).join(" ").trim();

  if (!text) {
    console.error('Uso: hermad note "<texto>" [--story X] [--for persona]');
    process.exit(1);
  }
  const project = resolveProject();
  if (!project) {
    console.error("No hay proyecto (ni .hermad/project.json ni activo).");
    process.exit(1);
  }
  const r = memory.append(project.projectDir, { text, story, forPersona, agent: process.env.HERMAD_AGENT });
  console.log(`[+] nota → ${r.file} (${r.scope})`);
}

module.exports = { run };
