"use strict";

// Fuente unica de comandos. Alimenta el HELP, el dispatch de cli.js y (a partir
// de HPT-COMPLETION) los generadores de completion. Agregar un comando es tocar
// solo este archivo: test/cli-parity.test.js falla si la tabla y los `--flag`
// leidos por src/commands/* divergen (FR-6.3, FR-6.4).
//
// Forma: { name, summary, flags: [], sub: [], run: () => require(...) }.
// `run` es lazy (el require vive dentro de la funcion) para poder declarar
// comandos cuyo handler todavia no existe — completion, settings permissions —
// sin romper el resto del CLI.
const COMMANDS = [
  {
    name: "setup",
    summary: "instala skill/comando + elige CLI/modelo por agente (wizard)",
    flags: [
      "--yes",
      "--lang",
      "--user-name",
      "--model",
      "--skip-skills",
      "--llm-suggest",
      "--accept-bypass",
      "--completion",
      "--skip-agents",
      "--relink-only",
    ],
    sub: [],
    run: () => require("../commands/setup"),
  },
  {
    name: "create-project",
    summary: "scaffolding agentico completo para un proyecto nuevo",
    flags: ["--run-bmad-install"],
    sub: [],
    run: () => require("../commands/create-project"),
  },
  {
    name: "settings",
    summary: "reajusta vendors/modelos (global o por proyecto) y el modo de permisos",
    flags: ["--project", "--from-global", "--accept-bypass"],
    sub: ["agents", "project", "permissions"],
    run: () => require("../commands/settings-agents"),
  },
  {
    name: "start-team",
    summary: "abre workspace+tabs+agentes conectados, sin prompt inicial",
    flags: [],
    sub: [],
    run: () => require("../commands/start-team"),
  },
  {
    name: "open-orchestrator",
    summary: "abre el workspace solo con el orquestador (workers bajo demanda)",
    flags: [],
    sub: [],
    run: () => require("../commands/open-orchestrator"),
  },
  {
    name: "orchestrate",
    summary: "igual que start-team pero le manda el intent al orquestador",
    flags: [],
    sub: [],
    run: () => require("../commands/orchestrate"),
  },
  {
    name: "daemon",
    summary: "pane del daemon: buzon + rutas HERMAD: + compact watchdog",
    flags: [],
    sub: [],
    run: () => require("../commands/daemon"),
  },
  {
    name: "agents",
    summary: "tabla logico -> vivo, persona, kind y pane de cada agente",
    flags: ["--json"],
    sub: [],
    run: () => require("../commands/agents"),
  },
  {
    name: "send",
    summary: "encola un mensaje en el buzon de un peer (adjunta rutas de SKILL.md)",
    flags: ["--skills", "--from"],
    sub: [],
    run: () => require("../commands/send"),
  },
  {
    name: "note",
    summary: "agrega una entrada al journal",
    flags: ["--story", "--for"],
    sub: [],
    run: () => require("../commands/note"),
  },
  {
    name: "memory",
    summary: "imprime el bloque de memoria de esa persona",
    flags: ["--story"],
    sub: ["slice"],
    run: () => require("../commands/memory"),
  },
  {
    name: "spawn",
    summary: "dropea un agente en su tab",
    flags: ["--name", "--pane", "--kind", "--model", "--skills", "--story"],
    sub: [],
    run: () => require("../commands/spawn"),
  },
  {
    name: "plan-devs",
    summary: "crea worktrees+branches desde stories.yaml y dropea devs",
    flags: ["--max"],
    sub: [],
    run: () => require("../commands/plan-devs"),
  },
  {
    name: "skills",
    summary: "indice cacheado, matcher local y globalSkills",
    flags: ["--refresh", "--source", "--json", "--persona", "--top", "--project", "--force", "--global"],
    sub: ["list", "match", "suggest", "global", "global add", "global rm"],
    run: () => require("../commands/skills"),
  },
  {
    name: "completion",
    summary: "imprime o instala el completion de hermad para tu shell",
    flags: ["--shell"],
    sub: ["zsh", "bash", "fish", "powershell", "install", "uninstall"],
    run: () => require("../commands/completion"), // HPT-COMPLETION
  },
  {
    name: "update",
    summary: "actualiza hermad (npm global o clone git) y re-linkea el pack",
    flags: ["--yes"],
    sub: [],
    run: () => require("../commands/update"),
  },
];

function resolve(name) {
  return COMMANDS.find((c) => c.name === name);
}

function usageLine(c) {
  const sub = c.sub.length ? " " + c.sub.join("|") : "";
  const flags = c.flags.length ? " " + c.flags.join(" ") : "";
  return `hermad ${c.name}${sub}${flags}`;
}

// HELP generado desde la tabla: nombre + subcomandos + flags + summary.
function helpText() {
  const lines = ["hermad — instalador y gobernador de Hermad (Herdr x BMad)", "", "Uso:"];
  for (const c of COMMANDS) {
    lines.push(`  ${usageLine(c)}`);
    lines.push(`      ${c.summary}`);
  }
  lines.push("  hermad --version");
  lines.push("      version instalada");
  lines.push("  hermad --help");
  lines.push("      esta ayuda");
  return lines.join("\n") + "\n";
}

module.exports = { COMMANDS, resolve, helpText };
