"use strict";

const DEFAULT_DEPARTAMENTOS = [
  ["producto", ["architect", "pm", "analyst"]],
  ["desarrollo", ["dev"]],
  ["qa", ["reviewer"]],
  ["diseno", ["ux"]],
];

// Genera el personas.env que consume skill/scripts/orquestar.sh a partir del
// config.personas (fuente: ~/.hermad/config.json) — mismo formato que el
// personas.env de referencia en skill/scripts/.
function render({ projectDir, label, personas, departamentos = DEFAULT_DEPARTAMENTOS }) {
  const order = ["orquestador", ...Object.keys(personas).filter((k) => k !== "orquestador")];
  const lines = [
    "# personas.env — generado por `hermad`. Editable a mano; `hermad settings agents` lo regenera.",
    "",
    `PROJECT_DIR="${projectDir}"`,
    `LABEL="${label}"`,
    "",
    '# PERSONAS: "nombre|kind|vendor_args|rol"',
    "PERSONAS=(",
  ];
  for (const name of order) {
    const p = personas[name];
    if (!p) continue;
    lines.push(`  "${name}|${p.kind}|${p.modelFlag}|${p.rol}"`);
  }
  lines.push(")", "");
  lines.push("# DEPARTAMENTOS: \"tab_label|persona1,persona2,...\"");
  lines.push("DEPARTAMENTOS=(");
  for (const [tab, members] of departamentos) {
    lines.push(`  "${tab}|${members.join(",")}"`);
  }
  lines.push(")", "");
  return lines.join("\n");
}

module.exports = { render, DEFAULT_DEPARTAMENTOS };
