"use strict";
const fs = require("fs");
const path = require("path");
const config = require("../lib/config");
const { resolveProject } = require("../lib/project");
const { detectInstalledVendors, modelsFor } = require("../lib/vendors");
const { select, ask } = require("../lib/prompt");

// Texto de riesgo aprobado (ux §6.2, D2/D3): menciona inyección de instrucciones y
// el costo del modo con permisos (agentes blocked hasta atender el panel).
const PERMISSION_RISK = [
  "Permisos de los agentes — decisión importante",
  "",
  "A) Modo con permisos (recomendado): cada vez que un agente quiera ejecutar un",
  '   comando o editar un archivo se detiene y te pregunta. Costo: un agente en espera',
  '   queda "blocked" hasta que lo atiendas en su panel.',
  "",
  "B) Modo sin permisos (bypass): los agentes ejecutan comandos y modifican archivos",
  "   SIN preguntarte. Un agente que se equivoque, o que siga instrucciones maliciosas",
  "   escondidas en un archivo o página que lea, puede borrar o cambiar archivos o",
  "   ejecutar comandos en tu máquina. En este modo hermad no te protege.",
].join("\n");

const CONFIRM_OPTIONS = ["No, prefiero el modo con permisos", "Sí, lo acepto"];

function permissionsModeOf(perms) {
  return typeof perms === "string" ? perms : perms && perms.mode;
}

async function pickPersona(name, current, installedVendors) {
  console.log(`\n— ${name} (${current.rol}) — actual: ${current.kind} ${current.modelFlag}`);
  const vendorOptions = installedVendors.length ? installedVendors : ["claude", "opencode", "codex", "gemini", "hermes"];
  const vendor = await select("CLI/vendor:", vendorOptions, {
    defaultIndex: Math.max(vendorOptions.indexOf(current.kind), 0),
  });
  const models = modelsFor(vendor);
  if (!models.length) {
    const manual = await ask(`No hay catálogo para "${vendor}" — flag de modelo a mano (enter para vacío): `);
    return { kind: vendor, modelFlag: manual, rol: current.rol };
  }
  const picked = await select(`Modelo para ${vendor}:`, models.map((m) => m.label));
  const model = models[models.map((m) => m.label).indexOf(picked)];
  return { kind: vendor, modelFlag: model.flag, rol: current.rol };
}

// Única escritura de `settings agents`: la plantilla global. Guarda el cfg
// completo (no solo {personas}) para no borrar globalSkills ni claves
// desconocidas. NO toca proyectos (project.json / personas.env / activo) — eso
// es `settings project`.
function applyGlobal(cfg) {
  config.save(cfg);
}

// `hermad settings permissions [bypass|prompt] [--accept-bypass] [--project [dir]]`
// prompt no pregunta (baja el riesgo). bypass repite la explicación y exige
// aceptación explícita; sin TTY solo --accept-bypass lo activa (--yes jamás se
// interpreta como bypass). Lanza en vez de process.exit para ser testeable.
async function runPermissions(args) {
  const projectIdx = args.indexOf("--project");
  const accept = args.includes("--accept-bypass");
  const modeArg = args.find((a) => a === "bypass" || a === "prompt");

  let project = null;
  if (projectIdx >= 0) {
    const dirArg = args[projectIdx + 1];
    const explicit = dirArg && !dirArg.startsWith("--") ? path.resolve(dirArg) : null;
    project = explicit ? resolveProject(explicit, { strict: true }) : resolveProject();
    if (!project) throw new Error(`no hay .hermad/project.json ${explicit ? `en ${explicit}` : "desde acá"} — no toqué nada`);
  }

  if (!modeArg) {
    const current = (project && permissionsModeOf(project.permissions)) || config.load().permissions.mode;
    console.log(`Permisos actuales: ${current === "bypass" ? "sin permisos (bypass)" : "con permisos"}`);
    console.log("Uso: hermad settings permissions [bypass|prompt] [--accept-bypass] [--project [dir]]");
    return;
  }

  let mode = modeArg;
  let acceptedAt = null;
  if (mode === "bypass") {
    if (!accept) {
      if (!process.stdin.isTTY) {
        throw new Error("el modo bypass exige aceptar el riesgo: repetí con --accept-bypass, o usá 'prompt'");
      }
      console.log(PERMISSION_RISK);
      const picked = await select("¿Aceptas ese riesgo?", CONFIRM_OPTIONS, { defaultIndex: 0 });
      if (picked !== CONFIRM_OPTIONS[1]) mode = "prompt";
    }
    if (mode === "bypass") acceptedAt = new Date().toISOString();
  }

  const permissions = { mode, acceptedAt };
  if (project) {
    saveProjectPermissions(project.projectDir, permissions);
    console.log(`[+] permisos = ${mode} solo en ${project.projectDir}/.hermad/project.json`);
  } else {
    config.save({ permissions });
    console.log(`[+] permisos = ${mode} en ${config.CONFIG_PATH}`);
  }
  console.log("    Los agentes ya abiertos conservan el modo anterior: cerrá y reabrí el equipo (start-team).");
}

// Override por proyecto: escribe SOLO project.json (no toca la config global).
function saveProjectPermissions(dir, permissions) {
  const file = path.join(dir, ".hermad", "project.json");
  const onDisk = JSON.parse(fs.readFileSync(file, "utf8"));
  onDisk.permissions = permissions;
  fs.writeFileSync(file, JSON.stringify(onDisk, null, 2) + "\n");
}

async function run(args) {
  const sub = args[0];
  // `project` = reajustar los vendors del proyecto (source of truth = project.json),
  // sin tocar la config global. Ver commands/settings-project.js.
  if (sub === "project") return require("./settings-project").run(args.slice(1));
  if (sub === "permissions") return runPermissions(args.slice(1));
  if (sub !== "agents") {
    console.error("Uso: hermad settings agents [<persona>]                  (plantilla global)");
    console.error("     hermad settings project [<persona>] [--from-global] (solo el proyecto)");
    console.error("     hermad settings permissions [bypass|prompt] [--accept-bypass] [--project]");
    process.exit(1);
  }

  const projectFlagIdx = args.indexOf("--project");
  if (projectFlagIdx >= 0) {
    const dirArg = args[projectFlagIdx + 1];
    if (!dirArg || dirArg.startsWith("--")) {
      console.error("Uso: hermad settings agents [<persona>]");
      process.exit(1);
    }
    console.error("`hermad settings agents` es la plantilla global y no toca proyectos. Usá `hermad settings project`.");
    process.exit(1);
  }

  const only = args[1] && !args[1].startsWith("--") ? args[1] : null;
  const cfg = config.load();
  const installed = detectInstalledVendors();
  const names = only ? [only] : Object.keys(cfg.personas);

  for (const name of names) {
    if (!cfg.personas[name]) {
      console.error(`persona desconocida: ${name} (opciones: ${Object.keys(cfg.personas).join(", ")})`);
      process.exit(1);
    }
    cfg.personas[name] = await pickPersona(name, cfg.personas[name], installed);
  }
  applyGlobal(cfg);
  console.log(`\n[+] plantilla global actualizada en ${config.CONFIG_PATH}`);
  console.log("    Para llevar estos vendors a un proyecto: `hermad settings project --from-global`.");
}

module.exports = { run, pickPersona, applyGlobal, runPermissions, saveProjectPermissions };
