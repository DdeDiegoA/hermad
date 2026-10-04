"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const CONFIG_DIR = path.join(os.homedir(), ".hermad");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

const SCHEMA_VERSION = 2;

// Roster BMad. `kind`/`modelFlag` van VACÍOS a propósito (FR-4.5): el vendor real
// sale de la detección + elección del usuario en `hermad setup`, nunca del fuente.
// Una persona sin `kind` aborta al arrancar con "corré hermad setup".
const DEFAULT_PERSONAS = {
  orquestador: { kind: "", modelFlag: "", rol: "Orquestador top — rutea + aprueba" },
  analyst: { kind: "", modelFlag: "", rol: "Mary — análisis/brainstorm" },
  architect: { kind: "", modelFlag: "", rol: "Winston — arquitectura/spine" },
  pm: { kind: "", modelFlag: "", rol: "John — producto/PRD/epics" },
  dev: { kind: "", modelFlag: "", rol: "Amelia — build" },
  reviewer: { kind: "", modelFlag: "", rol: "Revisor — code review/QA" },
  ux: { kind: "", modelFlag: "", rol: "Sally — UX" },
  reader: { kind: "", modelFlag: "", rol: "Reader — mapa read-only del código (descartable)" },
};

const LEGACY_BYPASS_WARNING =
  "Aviso: tus agentes arrancan SIN permisos (bypass) porque tu configuración es anterior a esta opción. " +
  "Para confirmarlo o cambiarlo: hermad settings permissions";

function defaultConfig() {
  return {
    schemaVersion: SCHEMA_VERSION,
    language: "en",
    userName: "",
    permissions: { mode: "prompt", acceptedAt: null },
    personas: JSON.parse(JSON.stringify(DEFAULT_PERSONAS)),
    globalSkills: [],
    personaSkills: {},
    bmad: { autoInstall: false },
  };
}

function modeOf(perms) {
  return typeof perms === "string" ? perms : perms && perms.mode;
}

// Config nueva (sin archivo) → prompt. Config legacy (sin schemaVersion) → bypass
// (status quo actual, sin regresión) hasta que `settings permissions` lo fije.
// Preserva personas y claves desconocidas; el save siguiente escribe schemaVersion 2.
function load(file = CONFIG_PATH) {
  if (!fs.existsSync(file)) return defaultConfig();
  let onDisk;
  try {
    onDisk = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    console.error(`aviso: ${file} corrupto (${err.message}), usando defaults`);
    return defaultConfig();
  }
  const d = defaultConfig();
  const legacy = onDisk.schemaVersion === undefined;
  const perms = onDisk.permissions;
  return {
    ...d,
    ...onDisk,
    personas: { ...d.personas, ...(onDisk.personas || {}) },
    globalSkills: Array.isArray(onDisk.globalSkills) ? onDisk.globalSkills : [],
    personaSkills: onDisk.personaSkills && typeof onDisk.personaSkills === "object" ? onDisk.personaSkills : {},
    bmad: { ...d.bmad, ...(onDisk.bmad && typeof onDisk.bmad === "object" ? onDisk.bmad : {}) },
    permissions:
      perms && typeof perms === "object"
        ? { mode: perms.mode === "bypass" ? "bypass" : "prompt", acceptedAt: perms.acceptedAt || null }
        : { mode: legacy ? "bypass" : "prompt", acceptedAt: null },
    schemaVersion: SCHEMA_VERSION,
  };
}

// ¿La config en disco es anterior a `permissions`? (sin schemaVersion). Se usa para
// el aviso de una línea al arrancar el equipo (D4). Corrupta/ausente → false.
function isLegacy(file = CONFIG_PATH) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")).schemaVersion === undefined;
  } catch {
    return false;
  }
}

// Mergea con lo que ya está en disco: un caller que guarda un objeto angosto
// (p.ej. settings-agents guardaba {personas}) no debe borrar globalSkills,
// permissions ni claves desconocidas (AC4 de S6 / NFR-8).
function save(config, file = CONFIG_PATH) {
  const merged = { ...load(file), ...config };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(merged, null, 2) + "\n");
}

module.exports = {
  CONFIG_DIR,
  CONFIG_PATH,
  SCHEMA_VERSION,
  DEFAULT_PERSONAS,
  LEGACY_BYPASS_WARNING,
  defaultConfig,
  modeOf,
  load,
  isLegacy,
  save,
};
