"use strict";
const { resolveProject } = require("../lib/project");
const daemon = require("../lib/daemon");

function run(args) {
  const fromIdx = args.indexOf("--from");
  const from = fromIdx >= 0 ? args[fromIdx + 1] : process.env.HERMAD_AGENT || process.env.HERDR_AGENT_NAME || "agente";
  const skip = new Set();
  if (fromIdx >= 0) { skip.add(fromIdx); skip.add(fromIdx + 1); }
  const rest = args.filter((_, i) => !skip.has(i));
  const to = rest[0];
  const text = rest.slice(1).join(" ").trim();

  if (!to || !text) {
    console.error('Uso: hermad send <peer> "<mensaje>" [--from <agente>]');
    process.exit(1);
  }
  const project = resolveProject();
  if (!project) {
    console.error("No hay proyecto (ni .hermad/project.json ni activo).");
    process.exit(1);
  }
  const file = daemon.send(project.projectDir, { from, to, text });
  console.log(`[+] ${from} → ${to}: encolado en ${file}`);
}

module.exports = { run };
