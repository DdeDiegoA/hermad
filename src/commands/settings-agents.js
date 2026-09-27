"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const config = require("../lib/config");
const { detectInstalledVendors, modelsFor } = require("../lib/vendors");
const { select, ask } = require("../lib/prompt");
const personasEnv = require("../lib/personas-env");
const { loadActiveProject, saveActiveProject } = require("../lib/active-project");

// Copia bash de referencia, por si alguien corre skill/scripts/orquestar.sh a mano.
const ACTIVE_PERSONAS_ENV = path.join(os.homedir(), ".hermad", "personas.env");

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

async function run(args) {
  const sub = args[0];
  if (sub !== "agents") {
    console.error("Uso: hermad settings agents [<persona>] [--project <dir>]");
    process.exit(1);
  }

  const projectFlagIdx = args.indexOf("--project");
  const projectDir = projectFlagIdx >= 0 ? path.resolve(args[projectFlagIdx + 1]) : null;
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
  config.save(cfg);
  console.log(`\nConfig guardada en ${config.CONFIG_PATH}`);

  // Sin --project no hay PROJECT_DIR real que escribir: no tocar el activo
  // (evita placeholders tipo "<pendiente:create-project>" pisando lo que ya
  // arrancó `create-project`). Si hay un activo previo, lo mantenemos vigente
  // regenerándolo con su propio PROJECT_DIR/LABEL/departamentos.
  const prevActive = loadActiveProject();
  const targetProjectDir = projectDir || (prevActive && prevActive.projectDir) || null;
  const targetLabel = projectDir ? path.basename(projectDir) : (prevActive && prevActive.label) || null;
  const departamentos = (prevActive && prevActive.departamentos) || personasEnv.DEFAULT_DEPARTAMENTOS;

  if (!targetProjectDir) {
    console.log("\nSin proyecto activo todavía — corré `hermad create-project` o pasá --project <dir> para activar estos cambios.");
    return;
  }

  saveActiveProject({ projectDir: targetProjectDir, label: targetLabel, personas: cfg.personas, departamentos });
  console.log(`[+] proyecto activo actualizado (${targetProjectDir})`);

  // Copia bash de referencia, por si alguien corre skill/scripts/orquestar.sh a mano.
  const rendered = personasEnv.render({ projectDir: targetProjectDir, label: targetLabel, personas: cfg.personas, departamentos });
  fs.mkdirSync(path.dirname(ACTIVE_PERSONAS_ENV), { recursive: true });
  fs.writeFileSync(ACTIVE_PERSONAS_ENV, rendered);

  if (projectDir && fs.existsSync(path.join(projectDir, ".hermad"))) {
    fs.writeFileSync(path.join(projectDir, ".hermad", "personas.env"), rendered);
    console.log(`[+] copia del proyecto actualizada en ${path.join(projectDir, ".hermad", "personas.env")}`);
  }

  // project.json es autocontenido: sin esto, `hermad start-team` seguiría usando
  // las personas viejas del proyecto aunque la config global cambie.
  const projectJson = path.join(targetProjectDir, ".hermad", "project.json");
  if (fs.existsSync(projectJson)) {
    try {
      const proj = JSON.parse(fs.readFileSync(projectJson, "utf8"));
      proj.personas = cfg.personas;
      fs.writeFileSync(projectJson, JSON.stringify(proj, null, 2) + "\n");
      console.log(`[+] personas actualizadas en ${projectJson}`);
    } catch (err) {
      console.error(`aviso: no pude actualizar ${projectJson} (${err.message})`);
    }
  }
}

module.exports = { run };
