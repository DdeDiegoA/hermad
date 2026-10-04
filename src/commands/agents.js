"use strict";
const { resolveProject } = require("../lib/project");
const daemon = require("../lib/daemon");

// `hermad agents [--json]` — fuente de la traducción lógico↔vivo para los prompts
// (§1: "para usar `herdr agent read/wait` con un peer, resolvé su nombre acá").
function run(args) {
  const project = resolveProject();
  if (!project) {
    console.error("No hay proyecto (ni .hermad/project.json ni activo).");
    process.exit(1);
  }
  const state = daemon.loadState(project.projectDir);
  const rows = Object.entries(state.agents || {}).map(([logical, a]) => ({
    logical,
    live: (a && a.live) || logical,
    persona: (a && a.persona) || "",
    kind: (a && a.kind) || "",
    pane: (a && a.paneId) || "",
  }));

  if (args.includes("--json")) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (!rows.length) {
    console.log("sin agentes registrados en este proyecto");
    return;
  }

  const cols = [
    ["lógico", (r) => r.logical],
    ["vivo", (r) => r.live],
    ["persona", (r) => r.persona],
    ["kind", (r) => r.kind],
    ["pane", (r) => r.pane],
  ];
  const width = cols.map(([h, get]) => Math.max(h.length, ...rows.map((r) => String(get(r)).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(width[i])).join("  ").trimEnd();
  console.log(line(cols.map(([h]) => h)));
  console.log(line(width.map((w) => "-".repeat(w))));
  for (const r of rows) console.log(line(cols.map(([, get]) => get(r))));
}

module.exports = { run };
