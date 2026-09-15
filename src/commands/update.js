"use strict";
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

// ponytail: sin repo publicado todavía no hay tag/release que seguir — la vía
// lazy-correcta es `git pull` en el clone. Cuando exista GitHub Releases,
// upgradeable a "chequear tag más nuevo vía API" sin tocar el resto del CLI.
function run() {
  if (!fs.existsSync(path.join(REPO_ROOT, ".git"))) {
    console.error(`${REPO_ROOT} no es un clone git — instalá hermad clonando el repo de GitHub para poder actualizar.`);
    process.exit(1);
  }
  console.log(`Actualizando ${REPO_ROOT}...`);
  try {
    execSync("git pull --ff-only", { cwd: REPO_ROOT, stdio: "inherit" });
  } catch (err) {
    console.error("git pull falló (¿cambios locales sin commitear? ¿sin remote?).");
    process.exit(1);
  }
  console.log("Listo. Corré `hermad setup` de nuevo si cambiaron los symlinks o el catálogo de modelos.");
}

module.exports = { run };
