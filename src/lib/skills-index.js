"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const skills = require("./skills");
const prompts = require("./prompts");

// Índice cacheado de skills + matcher local (BM25-lite). Sin red ni embeddings.
const CACHE_PATH = path.join(os.homedir(), ".hermad", "cache", "skills-index.json");
const TTL_MS = 24 * 60 * 60 * 1000;

// Stopwords es/en mínimas: el matcher es heurístico y el top-N lo filtra el LLM.
const STOPWORDS = new Set([
  "de", "la", "el", "los", "las", "un", "una", "unos", "unas", "y", "o", "u", "que", "para", "con", "en", "a", "al",
  "por", "del", "se", "su", "sus", "lo", "es", "son", "como", "más", "mas", "the", "and", "or", "of", "for", "to",
  "in", "on", "with", "is", "are", "be", "this", "that", "it", "as", "at", "by", "from", "an",
]);

function fingerprint(roots) {
  const h = crypto.createHash("sha1");
  for (const { dir, plugin } of roots) {
    let mtime = 0;
    let count = 0;
    try {
      mtime = fs.statSync(dir).mtimeMs;
      count = fs.readdirSync(dir).length;
    } catch {
      /* root ausente → cuenta como vacío */
    }
    h.update(`${dir}|${plugin || ""}|${mtime}|${count}\n`);
  }
  return h.digest("hex");
}

function readCache(cachePath) {
  try {
    return JSON.parse(fs.readFileSync(cachePath, "utf8"));
  } catch {
    return null;
  }
}

function writeCache(cachePath, data) {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(data, null, 2) + "\n");
}

// build: índice de skills globales con cache en ~/.hermad/cache/skills-index.json.
// Se reindexa si cambió el fingerprint de los roots, si pasaron 24 h, o con
// `refresh`. Las roots del proyecto se escanean siempre en vivo y se mergean
// encima (gana el proyecto ante un mismo id).
function build({ refresh = false, projectDir, globalRoots, projectRoots, cachePath = CACHE_PATH, now = Date.now() } = {}) {
  const groots = globalRoots || skills.globalRoots();
  const proots = projectRoots !== undefined ? projectRoots : skills.projectRoots(projectDir);
  const fp = fingerprint(groots);
  const cached = readCache(cachePath);
  const fresh = !refresh && cached && cached.fingerprint === fp && cached.builtAt && now - Date.parse(cached.builtAt) < TTL_MS;

  let globals;
  if (fresh) {
    globals = cached.skills || [];
  } else {
    globals = skills.scanRoots(groots);
    writeCache(cachePath, { version: 1, builtAt: new Date(now).toISOString(), fingerprint: fp, skills: globals });
  }

  const merged = new Map();
  for (const s of globals) merged.set(s.id, s);
  for (const s of skills.scanRoots(proots)) merged.set(s.id, s);
  return [...merged.values()];
}

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function tokenize(s) {
  return normalize(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOPWORDS.has(t));
}

// Stemmer inglés mínimo (sin deps): saca plural/gerundio/participio y la
// consonante doble que deja el sufijo (debugging → debug), así `debug` matchea
// `systematic-debugging`. Heurístico a propósito: BM25-lite y el LLM filtra.
const SUFFIXES = ["ingly", "edly", "ing", "ies", "ied", "ed", "ly", "es", "s"];
function stem(w) {
  let s = w;
  for (const suf of SUFFIXES) {
    if (s.length - suf.length >= 3 && s.endsWith(suf)) {
      s = s.slice(0, -suf.length);
      break;
    }
  }
  if (s.length >= 4 && s[s.length - 1] === s[s.length - 2]) s = s.slice(0, -1);
  return s;
}

// match: ranking BM25-lite. Peso name ×3, description ×1. Boost +2 si la skill
// está en el frontmatter de la persona. Excluye las globales efectivas (ya van).
function match(task, { persona, top = 15, projectDir, list, globals, personaSkills } = {}) {
  const docs = list || build({ projectDir });
  const excluded = new Set();
  for (const g of globals || []) {
    excluded.add(g);
    excluded.add(String(g).split(":").pop());
  }
  const boost = personaSkills || (persona ? (prompts.loadPersona(persona) || {}).skills : []) || [];

  const qTokens = [...new Set(tokenize(task).map(stem))];
  const fields = docs.map((d) => ({ d, name: tokenize(d.name).map(stem), desc: tokenize(d.description || "").map(stem) }));
  const N = fields.length || 1;
  const avgdl = fields.reduce((a, f) => a + f.name.length * 3 + f.desc.length, 0) / N || 1;
  const k1 = 1.2;
  const b = 0.75;

  const df = {};
  for (const t of qTokens) df[t] = fields.filter((f) => f.name.includes(t) || f.desc.includes(t)).length;

  const scored = [];
  for (const f of fields) {
    if (excluded.has(f.d.id) || excluded.has(f.d.name)) continue;
    const dl = f.name.length * 3 + f.desc.length;
    let score = 0;
    for (const t of qTokens) {
      const tfName = f.name.filter((x) => x === t).length;
      const tfDesc = f.desc.filter((x) => x === t).length;
      const tf = tfName * 3 + tfDesc;
      if (!tf) continue;
      const idf = Math.log(1 + (N - df[t] + 0.5) / (df[t] + 0.5));
      score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * dl) / avgdl)));
    }
    if (score <= 0) continue;
    if (boost.includes(f.d.id) || boost.includes(f.d.name)) score += 2;
    scored.push({ ...f.d, score: Number(score.toFixed(4)) });
  }
  scored.sort((x, y) => y.score - x.score || x.name.localeCompare(y.name));
  return scored.slice(0, top);
}

module.exports = { CACHE_PATH, TTL_MS, fingerprint, build, match, tokenize };
