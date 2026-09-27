"use strict";
const { execFileSync } = require("child_process");

// kind → binario que `herdr agent start --kind <kind> -- <vendor_args>` espera en PATH.
const VENDOR_BINARIES = {
  claude: "claude",
  opencode: "opencode",
  codex: "codex",
  gemini: "gemini",
  hermes: "hermes",
};

// ponytail: no todos los vendors exponen "listar modelos" por CLI sin auth de red.
// Catálogo estático de respaldo — puede quedar desactualizado, por eso `hermad setup`
// intenta primero una consulta dinámica (hoy solo `opencode models` la soporta) y
// cae a esto si el vendor no tiene comando equivalente. Actualizar a mano si cambia.
const STATIC_MODEL_CATALOG = {
  claude: [
    { id: "opus", label: "Opus (alias — el más capaz disponible en tu plan)" },
    { id: "sonnet", label: "Sonnet (alias — balance capacidad/costo)" },
    { id: "haiku", label: "Haiku (alias — rápido/barato)" },
    { id: "claude-opus-5", label: "claude-opus-5 (id explícito)" },
    { id: "claude-sonnet-5", label: "claude-sonnet-5 (id explícito)" },
    { id: "claude-haiku-4-5-20251001", label: "claude-haiku-4-5-20251001 (id explícito)" },
  ],
  codex: [
    { id: "gpt-5.1-codex", label: "gpt-5.1-codex" },
    { id: "o4-mini", label: "o4-mini" },
  ],
  gemini: [
    { id: "gemini-2.5-pro", label: "gemini-2.5-pro" },
    { id: "gemini-2.5-flash", label: "gemini-2.5-flash" },
  ],
  hermes: [],
};

function which(bin) {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [bin], { stdio: ["ignore", "pipe", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

function detectInstalledVendors() {
  return Object.keys(VENDOR_BINARIES).filter((kind) => which(VENDOR_BINARIES[kind]));
}

// Modelos dinámicos: hoy solo opencode expone `opencode models [provider]` sin requerir
// una llamada de red extra (lee su propio catálogo de providers ya autenticados).
function dynamicModels(kind) {
  if (kind !== "opencode") return null;
  try {
    const out = execFileSync("opencode", ["models"], { encoding: "utf8", timeout: 15000 });
    const ids = out.split("\n").map((l) => l.trim()).filter(Boolean);
    return ids.map((id) => ({ id, label: id, flag: `-m ${id}` }));
  } catch {
    return null;
  }
}

// Cada vendor CLI espera su propio flag de modelo — no asumir "-m" para todos.
const MODEL_FLAG_PREFIX = {
  claude: "--model ",
  opencode: "-m ",
  codex: "--model ",
  gemini: "--model ",
  hermes: "--model ",
};

function modelsFor(kind) {
  const dynamic = dynamicModels(kind);
  if (dynamic && dynamic.length) return dynamic;
  const flagPrefix = MODEL_FLAG_PREFIX[kind] || "--model ";
  return (STATIC_MODEL_CATALOG[kind] || []).map((m) => ({ ...m, flag: `${flagPrefix}${m.id}` }));
}

// Cómo entregar el persona prompt a cada vendor al arrancar.
// Devuelve { args, promptText }:
//   - args        → argv extra tras `--` en `herdr agent start`
//   - promptText  → si no es null, se inyecta como primer mensaje en idle
//                   (fallback de vendors sin prompt-por-archivo).
// Todo agente que lanza hermad corre sin prompts de permisos (no debe quedar
// esperando un "¿permitir?"). Los deny explícitos (reader readonly, allowlist de
// skills) siguen aplicando. Los gates de negocio (auth/dinero/DB/seguridad) son
// del flujo, no de permisos de herramienta — no los toca esto.
const BYPASS_ARGS = {
  claude: ["--permission-mode", "bypassPermissions"],
  opencode: ["--auto"], // auto-aprueba lo no denegado explícitamente
  hermes: ["--yolo"],
  codex: ["--dangerously-bypass-approvals-and-sandbox"],
  gemini: ["--yolo"],
};

function startPlan(kind, personaName, persona, artifacts) {
  const modelFlags = [
    ...(Array.isArray(persona.modelFlag) ? persona.modelFlag : (persona.modelFlag || "").split(" ").filter(Boolean)),
    ...(BYPASS_ARGS[kind] || []),
  ];
  const skillNames = artifacts.skillsFound || [];

  switch (kind) {
    case "claude":
      // Allowlist + aislamiento de skills de usuario (--setting-sources project,local)
      // + prompt real por archivo (sin mensaje inicial visible).
      return {
        args: [
          ...modelFlags,
          "--setting-sources", "project,local",
          "--plugin-dir", artifacts.claude.pluginDir,
          "--append-system-prompt-file", artifacts.promptFile,
          "--settings", artifacts.claude.settingsFile,
        ],
        promptText: null,
      };

    case "opencode": {
      // El agente md (generado por render) trae prompt + permission.skill + model.
      return { args: [...modelFlags, "--agent", artifacts.opencode.agentName], promptText: null };
    }

    case "hermes":
      // hermes no expone selección de profile por flag/env fiable → skills por flag,
      // persona por inyección de prompt (ver docs/vendors.md).
      return {
        args: [...modelFlags, ...(skillNames.length ? ["--skills", skillNames.join(",")] : [])],
        promptText: artifacts.promptBody,
      };

    default:
      // codex/gemini/otros: fallback documentado (agent wait idle + agent prompt).
      return { args: modelFlags, promptText: artifacts.promptBody };
  }
}

module.exports = { VENDOR_BINARIES, BYPASS_ARGS, detectInstalledVendors, modelsFor, which, startPlan };
