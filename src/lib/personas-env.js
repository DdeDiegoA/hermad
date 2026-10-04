"use strict";

// Fuente única de los departamentos cuando el proyecto no trae los suyos.
// `reader` cae en producto (antes no estaba en ninguno → sin tab).
const DEFAULT_DEPARTAMENTOS = [
  ["producto", ["reader", "architect", "pm", "analyst"]],
  ["desarrollo", ["dev"]],
  ["qa", ["reviewer"]],
  ["diseno", ["ux"]],
];

// Genera el personas.env que consume skill/scripts/orquestar.sh a partir del
// config.personas (fuente: ~/.hermad/config.json) — mismo formato que consumía el
// personas.env de ejemplo de skill/scripts/ (ya no se distribuye; FR-1.6).
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
