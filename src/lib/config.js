"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const CONFIG_DIR = path.join(os.homedir(), ".hermad");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

// PERSONAS es la fuente de verdad del roster BMad. kind/modelFlag por defecto
// son placeholders razonables — `hermad setup` los sobreescribe con lo real.
const DEFAULT_PERSONAS = {
  orquestador: { kind: "claude", modelFlag: "--model opus", rol: "Orquestador top — rutea + aprueba" },
  analyst: { kind: "opencode", modelFlag: "", rol: "Mary — análisis/brainstorm" },
  architect: { kind: "claude", modelFlag: "--model sonnet", rol: "Winston — arquitectura/spine" },
  pm: { kind: "claude", modelFlag: "--model sonnet", rol: "John — producto/PRD/epics" },
  dev: { kind: "opencode", modelFlag: "", rol: "Amelia — build" },
  reviewer: { kind: "opencode", modelFlag: "", rol: "Revisor — code review/QA" },
  ux: { kind: "opencode", modelFlag: "", rol: "Sally — UX" },
  reader: { kind: "opencode", modelFlag: "", rol: "Reader — mapa read-only del código (descartable)" },
};

function defaultConfig() {
  return { personas: JSON.parse(JSON.stringify(DEFAULT_PERSONAS)) };
}

function load() {
  if (!fs.existsSync(CONFIG_PATH)) return defaultConfig();
  try {
    const onDisk = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    return { personas: { ...defaultConfig().personas, ...(onDisk.personas || {}) } };
  } catch (err) {
    console.error(`aviso: ${CONFIG_PATH} corrupto (${err.message}), usando defaults`);
    return defaultConfig();
  }
}

function save(config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

module.exports = { CONFIG_DIR, CONFIG_PATH, DEFAULT_PERSONAS, load, save };
