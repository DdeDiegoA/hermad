"use strict";
// Descubrimiento de skills del wizard (design §1.3). Devuelve DATOS, nunca
// escribe ni llama process.exit: el paso `skills` decide qué persistir tras la
// confirmación. Dos fuentes:
//   llm   → nombres + descripciones al vendor elegido, SOLO con consentimiento.
//   local → matcher BM25 de skills-index (sin red, privacidad por defecto).
// Cualquier fallo del LLM cae a local con un warning (FR-2.3, NFR-5).
const skillsIndex = require("./skills-index");

// Umbral de preselección del matcher local: un hit flojo no se marca (el usuario
// ve la lista completa igual). Constante del módulo por diseño (design §1.3).
const LOCAL_THRESHOLD = 0.2;
const LOCAL_TOP = 5;
// Con más de 40 skills instaladas la lista global se recorta a 15 (ux §5.3).
const MANY = 40;
const MAX_GLOBAL = 15;

// rankLocal: top-N BM25 para una tarea (cuerpo/rol de la persona). `globals` se
// excluye: lo que ya es global no se sugiere de nuevo.
function rankLocal(task, { list = [], top = LOCAL_TOP, globals = [], threshold = LOCAL_THRESHOLD } = {}) {
  if (!list.length) return [];
  return skillsIndex
    .match(task, { list, top, globals })
    .filter((r) => r.score >= threshold)
    .map((r) => ({ name: r.id, score: r.score, selected: true }));
}

// Candidatas globales: se excluyen las que YA son globales (no se proponen de
// nuevo; el caller decide si las conserva). `selected` = preselección del LLM.
function globalOptions(list, selected, globals = []) {
  const picked = new Set(selected || []);
  const g = new Set(globals);
  const candidates = list.filter((s) => !g.has(s.id) && !g.has(s.name));
  const slice = list.length > MANY ? candidates.slice(0, MAX_GLOBAL) : candidates;
  return slice.map((s) => ({ name: s.id, selected: picked.has(s.id) }));
}

function localSuggest({ list = [], personas = [], personaBodies = {}, globals = [], top = LOCAL_TOP, threshold = LOCAL_THRESHOLD } = {}) {
  const byPersona = {};
  for (const p of personas) byPersona[p] = rankLocal(personaBodies[p] || p, { list, top, globals, threshold });
  return { source: "local", global: globalOptions(list, null, globals), byPersona, warnings: [] };
}

// Catálogo que se manda al LLM: nombre + descripción de cada skill (FR-2.4). De
// las personas va SOLO el nombre y el rol en una línea: el cuerpo del prompt
// nunca sale de la máquina (decisión de seguridad — SEND LESS).
function buildLLMPrompt({ list = [], personas = [], personaRoles = {} }) {
  const catalog = list.map((s) => `- ${s.id}: ${s.description || ""}`).join("\n");
  const roles = personas.map((p) => `- ${p}: ${personaRoles[p] || ""}`).join("\n");
  return [
    "You are selecting skills for a team of coding agents.",
    "Only choose from the INSTALLED list; never invent names.",
    personsList(personas),
    "INSTALLED skills (name: description):",
    catalog,
    personas.length ? `Roles:\n${roles}` : "",
    'Return ONLY JSON: {"global": ["<id>", ...], "byPersona": {"<persona>": ["<id>", ...]}, "reason": "<one line>"}.',
    "global = useful to everyone; byPersona = role-specific. 2-6 entries each.",
  ]
    .filter(Boolean)
    .join("\n");
}

function personsList(personas) {
  return personas.length ? `Personas: ${personas.join(", ")}` : "";
}

function parseLLM(text) {
  const m = String(text || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    return j && typeof j === "object" ? j : null;
  } catch {
    return null;
  }
}

function llmSuggest({ list, personas, personaRoles, vendor, model, callVendor, globals = [] }) {
  const raw = callVendor(vendor, model, buildLLMPrompt({ list, personas, personaRoles }));
  const parsed = parseLLM(raw);
  if (!parsed) throw new Error("respuesta no parseable");
  const ids = new Set(list.map((s) => s.id));
  const keep = (arr) => (Array.isArray(arr) ? arr : []).filter((n) => ids.has(n));
  const byPersona = {};
  for (const p of personas) {
    const rec = ((parsed.byPersona || {})[p] || []).filter((n) => ids.has(n));
    byPersona[p] = rec.map((name) => ({ name, selected: true, reason: parsed.reason }));
  }
  return { source: "llm", global: globalOptions(list, keep(parsed.global), globals), byPersona, warnings: [] };
}

// suggest: llm si hay consentimiento + vendor; si no, local. Falla del LLM →
// local + warning (nunca corta el paso). Sin skills instaladas: local vacío, sin
// warnings (FR-2.5).
function suggest(opts = {}) {
  const { list = [], personas = [], personaBodies = {}, personaRoles = {}, vendor, model, consent = false, globals = [], top = LOCAL_TOP, threshold = LOCAL_THRESHOLD, callVendor } = opts;
  const base = { list, personas, personaBodies, globals, top, threshold };
  if (!list.length) return { source: "local", global: [], byPersona: {}, warnings: [] };
  if (consent && vendor && typeof callVendor === "function") {
    try {
      return llmSuggest({ ...base, personaRoles, vendor, model, callVendor });
    } catch (err) {
      return { ...localSuggest(base), warnings: [`${vendor}: ${err.message}`] };
    }
  }
  return localSuggest(base);
}

module.exports = { LOCAL_THRESHOLD, LOCAL_TOP, MAX_GLOBAL, MANY, rankLocal, localSuggest, buildLLMPrompt, parseLLM, suggest };
