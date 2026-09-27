"use strict";
const fs = require("fs");
const path = require("path");

// Parser YAML mínimo para el schema de stories.yaml (id/depends_on/files/ac).
// ponytail: subconjunto a propósito — listas inline con comas respetando comillas,
// comentarios `#`. Si el YAML crece (bloques anidados), meter una lib de YAML.

function parseInlineList(s) {
  const inner = String(s || "").trim().replace(/^\[/, "").replace(/\]$/, "").trim();
  if (!inner) return [];
  const out = [];
  let cur = "";
  let quote = null;
  for (const ch of inner) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

function parseStories(text) {
  const stories = [];
  let cur = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").replace(/\s+$/, "");
    if (!line.trim()) continue;
    const start = line.match(/^\s*-\s+id:\s*(.+)$/);
    if (start) {
      if (cur) stories.push(cur);
      cur = { id: start[1].trim().replace(/^["']|["']$/g, ""), depends_on: [], files: [], ac: [] };
      continue;
    }
    const kv = line.match(/^\s+([A-Za-z_]+):\s*(.*)$/);
    if (kv && cur) {
      const [, key, val] = kv;
      if (key === "depends_on") cur.depends_on = parseInlineList(val);
      else if (key === "files") cur.files = parseInlineList(val);
      else if (key === "ac") cur.ac = parseInlineList(val);
      else cur[key] = val.trim();
    }
  }
  if (cur) stories.push(cur);
  return stories;
}

function findStoriesFile(projectDir) {
  for (const rel of ["stories.yaml", path.join(".hermad", "stories.yaml")]) {
    const file = path.join(projectDir, rel);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function load(projectDir) {
  const file = findStoriesFile(projectDir);
  if (!file) return null;
  return { file, stories: parseStories(fs.readFileSync(file, "utf8")) };
}

// N = min(stories listas (depends_on cumplidas, sin solape de files), maxDevs).
// `done` = ids ya completados; `active` = ids ya asignados a un dev (en curso).
// Sin files → cola secuencial (van a deferred).
function selectParallel(stories, maxDevs = 3, { done = [], active = [] } = {}) {
  const doneSet = new Set(done);
  const activeSet = new Set(active);
  const used = new Set();
  // Los files de las stories en curso ya están "tomados": una nueva no debe tocarlos.
  for (const s of stories) if (activeSet.has(s.id)) (s.files || []).forEach((f) => used.add(f));
  const selected = [];
  const deferred = [];
  for (const s of stories) {
    if (doneSet.has(s.id)) {
      deferred.push({ ...s, reason: "ya hecha" });
      continue;
    }
    if (activeSet.has(s.id)) {
      deferred.push({ ...s, reason: "ya asignada (en curso)" });
      continue;
    }
    const pending = (s.depends_on || []).filter((d) => !doneSet.has(d));
    if (pending.length) {
      deferred.push({ ...s, reason: `depende de ${pending.join(", ")} (pendiente)` });
      continue;
    }
    const files = s.files || [];
    if (!files.length) {
      deferred.push({ ...s, reason: "sin files → cola secuencial" });
      continue;
    }
    if (selected.length >= maxDevs) {
      deferred.push({ ...s, reason: "max_devs" });
      continue;
    }
    if (files.some((f) => used.has(f))) {
      deferred.push({ ...s, reason: "solape de files" });
      continue;
    }
    files.forEach((f) => used.add(f));
    selected.push(s);
  }
  return { selected, deferred };
}

module.exports = { parseStories, parseInlineList, findStoriesFile, load, selectParallel };
