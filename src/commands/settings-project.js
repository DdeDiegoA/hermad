"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { resolveProject } = require("../lib/project");
const { detectInstalledVendors } = require("../lib/vendors");
const { saveActiveProject } = require("../lib/active-project");
const personasEnv = require("../lib/personas-env");
const config = require("../lib/config");
const { pickPersona } = require("./settings-agents");

// Copia bash de referencia, por si alguien corre skill/scripts/orquestar.sh a mano.
const ACTIVE_PERSONAS_ENV = path.join(os.homedir(), ".hermad", "personas.env");

// Escribe las personas SOLO en el proyecto (project.json + personas.env + activo).
// No toca ~/.hermad/config.json: la config global es la plantilla de proyectos
// NUEVOS, no la de uno ya creado.
function saveProjectPersonas(project, personas) {
  const projectJson = path.join(project.projectDir, ".hermad", "project.json");
  const onDisk = fs.existsSync(projectJson) ? JSON.parse(fs.readFileSync(projectJson, "utf8")) : {};
  const label = onDisk.label || project.label || path.basename(project.projectDir);
  const departamentos = onDisk.departamentos || project.departamentos || personasEnv.DEFAULT_DEPARTAMENTOS;
  const full = {
    ...onDisk,
    name: onDisk.name || project.name || label,
    label,
    projectDir: project.projectDir,
    personas,
    departamentos,
    createdAt: onDisk.createdAt || new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(projectJson), { recursive: true });
  fs.writeFileSync(projectJson, JSON.stringify(full, null, 2) + "\n");
  // full (no el objeto reducido): el activo queda autocontenido como el project.json.
  saveActiveProject(full);

  const rendered = personasEnv.render({ projectDir: project.projectDir, label, personas, departamentos });
  fs.writeFileSync(path.join(project.projectDir, ".hermad", "personas.env"), rendered);
  fs.mkdirSync(path.dirname(ACTIVE_PERSONAS_ENV), { recursive: true });
  fs.writeFileSync(ACTIVE_PERSONAS_ENV, rendered);
  return full;
}

// `hermad settings project [<persona>] [--project <dir>] [--from-global]`
// Reajusta vendor/modelo de las personas del proyecto resuelto (cwd o activo),
// partiendo de lo que el proyecto YA tiene definido. Con --from-global copia la
// plantilla global sin preguntar.
async function run(args) {
  const projectFlagIdx = args.indexOf("--project");
  const dirArg = projectFlagIdx >= 0 ? args[projectFlagIdx + 1] : null;
  if (projectFlagIdx >= 0 && (!dirArg || dirArg.startsWith("--"))) {
    console.error("Uso: hermad settings project [<persona>] [--project <dir>] [--from-global]");
    process.exit(1);
  }
  const explicitDir = projectFlagIdx >= 0 ? path.resolve(dirArg) : null;
  const fromGlobal = args.includes("--from-global");
  const only = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--project") || null;

  // Ruta explícita → estricto: no cae al activo (evita tocar otro proyecto).
  const project = explicitDir ? resolveProject(explicitDir, { strict: true }) : resolveProject();
  if (!project) {
    console.error(explicitDir ? `No hay .hermad/project.json en ${explicitDir} (ni en sus carpetas padre).` : "No hay proyecto: corré desde uno con .hermad/project.json (o pasá --project <dir>).");
    process.exit(1);
  }

  const current = project.personas || {};
  if (only && !current[only]) {
    console.error(`persona desconocida: ${only} (opciones: ${Object.keys(current).join(", ")})`);
    process.exit(1);
  }
  const names = only ? [only] : Object.keys(current);
  const personas = { ...current };

  if (fromGlobal) {
    const global = config.load().personas;
    for (const name of names) {
      if (!global[name]) {
        console.error(`aviso: '${name}' no está en la plantilla global — la dejo como está`);
        continue;
      }
      personas[name] = global[name];
    }
    console.log(`\nCopiando la plantilla global a ${project.projectDir} (${names.length} persona(s))`);
  } else {
    const installed = detectInstalledVendors();
    console.log(`\nReajustando ${names.length} persona(s) de ${project.projectDir}`);
    console.log("(la config global ~/.hermad/config.json no se toca)\n");
    for (const name of names) personas[name] = await pickPersona(name, current[name], installed);
  }

  saveProjectPersonas(project, personas);
  console.log(`\n[+] ${project.projectDir}: personas actualizadas en .hermad/project.json`);
  console.log("    Próximo `hermad start-team` / `hermad spawn` ya usa estos vendors.");
}

module.exports = { run, saveProjectPersonas };
