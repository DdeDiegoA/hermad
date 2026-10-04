"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const herdr = require("./herdr");
const memory = require("./memory");

// Vendors con umbral de compact nativo (no necesitan watchdog).
const NATIVE_COMPACT = new Set(["claude", "hermes"]);

const DEFAULT_ROUTES = [
  { on: "DONE", from: "dev", to: "reviewer" },
  // El DONE del reviewer es el cierre real de la story (dispara el merge y
  // libera los depends_on de las que la esperaban).
  { on: "DONE", from: "reviewer", to: "orquestador" },
  { on: "BUG", from: "reviewer", to: "dev" },
  { on: "STORIES_READY", from: "pm", to: "orquestador" },
];

const MAX_REBOUNDS = 3;
// No re-mandar /compact al mismo agente antes de este cooldown (la pantalla
// puede seguir mostrando el % viejo un rato después de compactar).
const COMPACT_COOLDOWN_MS = 120000;

// Lock de escritura sobre state.json. El CLI y el daemon son procesos distintos:
// sin lock, el load→save del daemon pisa lo que el CLI escriba en el medio.
const LOCK_RETRY_MS = 50;
const LOCK_TIMEOUT_MS = 2000;
const LOCK_STALE_MS = 10000;

function inboxRoot(projectDir) {
  return path.join(projectDir, ".hermad", "inbox");
}
function statePath(projectDir) {
  return path.join(projectDir, ".hermad", "state.json");
}
function lockPath(projectDir) {
  return path.join(projectDir, ".hermad", "state.lock");
}

function emptyState() {
  return { rebounds: {}, screens: {}, markers: {}, compact: {}, stories: {}, agents: {}, closed: {} };
}
function loadState(projectDir) {
  const file = statePath(projectDir);
  if (!fs.existsSync(file)) return emptyState();
  try {
    const s = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const [k, v] of Object.entries(emptyState())) s[k] = s[k] || v;
    return s;
  } catch {
    return emptyState();
  }
}
// tmp + rename en el mismo dir: el rename es atómico, el JSON nunca queda a medias.
function saveState(projectDir, state) {
  const file = statePath(projectDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n");
    fs.renameSync(tmp, file);
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* tmp ya no está */
    }
    throw err;
  }
}

// Dormir sincrónico: el lock se toma en el hilo principal, un timer no serviría.
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Lockfile con O_EXCL. Reintenta cada retryMs hasta timeoutMs; un lock con mtime
// más viejo que staleMs se considera abandonado (proceso muerto) y se reclama.
function withStateLock(projectDir, fn, opts = {}) {
  const retryMs = opts.retryMs || LOCK_RETRY_MS;
  const timeoutMs = opts.timeoutMs || LOCK_TIMEOUT_MS;
  const staleMs = opts.staleMs || LOCK_STALE_MS;
  const file = lockPath(projectDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const deadline = Date.now() + timeoutMs;
  let fd;
  for (;;) {
    try {
      fd = fs.openSync(file, "wx");
      break;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      let mtime = 0;
      try {
        mtime = fs.statSync(file).mtimeMs;
      } catch {
        mtime = 0; // desapareció entre el open y el stat → reintentar ya
      }
      if (Date.now() - mtime > staleMs) {
        // ponytail: robo optimista del lock stale (sin verificar dueño); alcanza
        // porque los críticos duran ms, no segundos.
        try {
          fs.unlinkSync(file);
        } catch {
          /* otro lo liberó */
        }
        continue;
      }
      if (Date.now() >= deadline) throw new Error(`state lock ocupado: ${file}`);
      sleepSync(retryMs);
    }
  }
  try {
    return fn();
  } finally {
    try {
      fs.closeSync(fd);
    } catch {
      /* ya cerrado */
    }
    try {
      fs.unlinkSync(file);
    } catch {
      /* ya liberado */
    }
  }
}

// Única API de escritura para los nuevos writers: lock → load fresco → mutator →
// save atómico → unlock. El mutator muta el estado in-place.
function updateState(projectDir, mutator) {
  return withStateLock(projectDir, () => {
    const state = loadState(projectDir);
    const result = mutator(state);
    saveState(projectDir, state);
    return result;
  });
}

// Escribe un mensaje al buzón del peer + copia al journal.
function send(projectDir, { from, to, text }) {
  const dir = path.join(inboxRoot(projectDir), to);
  fs.mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  // sufijo aleatorio: dos mensajes en el mismo ms no deben pisarse (se perdería uno).
  const rand = crypto.randomBytes(3).toString("hex");
  const file = path.join(dir, `${ts}-${from}-${rand}.md`);
  fs.writeFileSync(file, `from: ${from}\nto: ${to}\nat: ${new Date().toISOString()}\n\n${text}\n`);
  try {
    memory.append(projectDir, { agent: from, text: `→ ${to}: ${text}`, story: null, forPersona: to });
  } catch {
    /* journal best-effort */
  }
  return file;
}

function pendingFiles(projectDir, peer) {
  const dir = path.join(inboxRoot(projectDir), peer);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".md"))
    .map((d) => path.join(dir, d.name))
    .sort();
}

// El mensaje más viejo pendiente, SIN moverlo: solo se mueve a done/ cuando el
// prompt salió bien (si no, nada se pierde) y de a uno por tick (si no, el 2º
// cae sobre un agente ya working).
function nextPending(projectDir, peer) {
  const files = pendingFiles(projectDir, peer);
  if (!files.length) return null;
  const file = files[0];
  return { file, text: fs.readFileSync(file, "utf8") };
}

function markDone(projectDir, peer, file) {
  const done = path.join(inboxRoot(projectDir), peer, "done");
  fs.mkdirSync(done, { recursive: true });
  const dest = path.join(done, path.basename(file));
  fs.renameSync(file, dest);
  return dest;
}

function parseMarkers(text) {
  const out = [];
  const re = /HERMAD:([A-Z_]+)\s+story=(\S+)((?:\s+[A-Za-z_][\w-]*=\S+)*)/g;
  let m;
  while ((m = re.exec(text))) {
    const extra = {};
    if (m[3]) {
      for (const kv of m[3].trim().split(/\s+/)) {
        const [k, v] = kv.split("=");
        if (k) extra[k] = v;
      }
    }
    out.push({ event: m[1], story: m[2], extra, raw: m[0] });
  }
  return out;
}

function routesFor(project) {
  return project.routes && project.routes.length ? project.routes : DEFAULT_ROUTES;
}

// Con devs paralelos la ruta apunta a `dev`, pero el dueño de la story es dev-N.
function resolveTarget(to, story, state) {
  const entry = story && state.stories && state.stories[story];
  if (to === "dev" && entry && entry.dev) return entry.dev;
  return to;
}

// Aplica una ruta. Solo actúa si hay una ruta configurada que matchea evento +
// emisor (un evento sin ruta se ignora). BUG reiterado (al 3.º) escala al
// orquestador en vez de rebotar al dev. Los reenvíos no llevan token `HERMAD:`,
// así que no se re-parsean como marcadores nuevos.
function applyRoute(project, { fromPersona, fromAgent, event, story, extra }, state, io) {
  const matching = routesFor(project).filter((r) => r.on === event && (!r.from || r.from === fromPersona));
  if (!matching.length) return false;

  if (event === "BUG") {
    state.rebounds[story] = (state.rebounds[story] || 0) + 1;
    if (state.rebounds[story] >= MAX_REBOUNDS) {
      // sin `HERMAD:` a propósito: el mensaje no debe re-parsearse como marcador.
      io.send({ from: "daemon", to: "orquestador", text: `escalo: story=${story} alcanzó ${state.rebounds[story]} rebotes — no reboto más al dev` });
      return true;
    }
  }
  // El cierre real (el que libera depends_on) es el DONE que va al orquestador
  // (reviewer), no el handoff del dev al reviewer.
  if (event === "DONE" && state.stories[story] && matching.some((r) => r.to === "orquestador")) {
    state.stories[story].status = "done";
  }
  for (const r of matching) {
    const extraStr = Object.entries(extra || {}).map(([k, v]) => ` ${k}=${v}`).join("");
    // Sin el prefijo `HERMAD:`: el reenvío aparece en la pantalla destino y no
    // debe contar como un marcador nuevo (eco → rebote falso).
    io.send({ from: fromPersona, to: resolveTarget(r.to, story, state), text: `evento ${event}: story=${story}${extraStr} (de ${fromPersona})` });
  }
  return true;
}

// El % de contexto solo cuenta si la línea lo contextualiza (evita confundir
// "100%" de un output cualquiera con el uso de ventana). Si no parsea → null.
function parseContextPct(text) {
  for (const line of String(text).split("\n")) {
    if (!/context|ctx|usage|compact|tokens|ventana/i.test(line)) continue;
    const m = line.match(/(\d{1,3})\s*%/);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

// Los devs paralelos se llaman dev-1, dev-2… (plan-devs); su persona sigue siendo `dev`.
function personaOf(agentName, personas) {
  if (!agentName) return null; // agente detectado sin nombre
  if (personas[agentName]) return agentName;
  const base = agentName.replace(/-\d+$/, "");
  return personas[base] ? base : null;
}

// Procesa los marcadores NUEVOS. Guardamos el MÁXIMO histórico por texto de
// marcador: si uno sale de la vista y la TUI lo vuelve a dibujar (scroll/resize),
// el conteo no baja, así que no se re-dispara. Los eventos legítimos repetidos no
// comparten texto porque los templates agregan `n=<seq>` por story.
const MARKERS_MAX = 1000;
function processMarkers(project, agentName, personaKey, text, state, io) {
  const counts = {};
  const byKey = new Map();
  for (const mk of parseMarkers(text)) {
    counts[mk.raw] = (counts[mk.raw] || 0) + 1;
    byKey.set(mk.raw, mk);
  }
  const next = { ...(state.markers[agentName] || {}) };
  let acted = 0;
  for (const [key, count] of Object.entries(counts)) {
    const seen = next[key] || 0;
    if (count <= seen) continue;
    const mk = byKey.get(key);
    for (let i = 0; i < count - seen; i++) {
      applyRoute(project, { fromPersona: personaKey, fromAgent: agentName, event: mk.event, story: mk.story, extra: mk.extra }, state, io);
      acted++;
    }
    next[key] = count;
  }
  const keys = Object.keys(next);
  if (keys.length > MARKERS_MAX) {
    const keep = {};
    for (const k of keys.slice(-MARKERS_MAX)) keep[k] = next[k];
    state.markers[agentName] = keep;
  } else {
    state.markers[agentName] = next;
  }
  return acted;
}

// Un ciclo de poll. io inyectable para test:
//   { agentList, agentRead, agentPrompt, send, log }
function runOnce(project, io) {
  const state = loadState(project.projectDir);
  const compactPct = project.compactPct || 50;
  let acted = 0;

  for (const agent of io.agentList()) {
    // `agent list` es global al server: ignorar agentes de otro workspace (p.ej.
    // un dev de otro proyecto). Solo filtra si ambos lados conocen el workspace.
    if (state.workspaceId && agent.workspace_id && agent.workspace_id !== state.workspaceId) continue;
    const personaKey = personaOf(agent.name, project.personas || {});
    if (!personaKey) continue;

    try {
      const status = agent.agent_status;

      // Buzón: de a uno por tick, nunca a blocked/working, y a done/ solo si el
      // prompt salió bien.
      if (status === "idle" || status === "done") {
        const msg = nextPending(project.projectDir, agent.name);
        if (msg) {
          try {
            io.agentPrompt(agent.name, msg.text);
            markDone(project.projectDir, agent.name, msg.file);
            acted++;
          } catch (err) {
            io.log(`[!] entrega a ${agent.name} falló (${err.code || err.message}); dejo el mensaje en el buzón`);
          }
        }
      }

      // Marcadores HERMAD: (solo cuando la pantalla visible cambió).
      let text = "";
      try {
        text = io.agentRead(agent.name, { source: "visible" });
      } catch {
        continue;
      }
      const hash = crypto.createHash("sha1").update(text).digest("hex");
      if (state.screens[agent.name] !== hash) {
        state.screens[agent.name] = hash;
        acted += processMarkers(project, agent.name, personaKey, text, state, io);
      }

      // Watchdog de compact (solo vendors sin umbral nativo), con cooldown.
      if (status === "idle" && !NATIVE_COMPACT.has((project.personas[personaKey] || {}).kind)) {
        const pct = parseContextPct(text);
        const last = state.compact[agent.name] || 0;
        if (pct != null && pct >= compactPct && Date.now() - last >= COMPACT_COOLDOWN_MS) {
          try {
            io.agentPrompt(agent.name, "/compact");
            state.compact[agent.name] = Date.now();
            io.log(`[=] compact watchdog: ${agent.name} al ${pct}% → /compact`);
            acted++;
          } catch (err) {
            io.log(`[!] compact watchdog ${agent.name}: ${err.code || err.message}`);
          }
        }
      }
    } catch (err) {
      // Un agente problemático no debe tumbar el tick para todos los demás.
      io.log(`[!] agente ${agent.name} falló en el tick (${err.message || err}); sigo con el resto`);
    }
  }

  // Las llamadas lentas a herdr ya pasaron: ahora, bajo lock, tomamos una
  // lectura fresca y aplicamos SOLO las claves que el daemon posee, para no
  // pisar lo que el CLI (workspaceId, agents, stories) escribió durante el tick.
  updateState(project.projectDir, (fresh) => {
    fresh.screens = state.screens;
    fresh.markers = state.markers;
    fresh.rebounds = state.rebounds;
    fresh.compact = state.compact;
    fresh.closed = state.closed;
    // stories es del CLI; el daemon solo propaga el `done` que ya marcó.
    for (const [id, s] of Object.entries(state.stories || {})) {
      if (s && s.status === "done" && fresh.stories && fresh.stories[id]) fresh.stories[id].status = "done";
    }
  });
  return acted;
}

function defaultIo() {
  return {
    agentList: () => herdr.agentList(),
    agentRead: (name, opts) => herdr.agentRead(name, opts),
    agentPrompt: (name, text) => herdr.agentPrompt(name, text),
    send: ({ from, to, text }) => send(process.cwd(), { from, to, text }),
    log: (msg) => console.log(msg),
  };
}

// loop: el daemon corre en su propio pane, con cwd = project dir.
function loop(project, { intervalMs = 5000 } = {}) {
  const io = defaultIo();
  // el send del io debe escribir en el proyecto resuelto, no en cwd mutable
  io.send = ({ from, to, text }) => send(project.projectDir, { from, to, text });
  console.log(`[daemon] proyecto ${project.projectDir} · poll cada ${intervalMs / 1000}s · Ctrl-C para salir`);
  // Un error repetido cada tick tapa todo lo demás: mostramos el stack la 1.ª vez
  // y después el mismo mensaje a lo sumo una vez por minuto.
  let lastErr = { msg: null, at: 0 };
  const tick = () => {
    try {
      runOnce(project, io);
    } catch (err) {
      const msg = err.message || String(err);
      const now = Date.now();
      if (lastErr.msg !== msg) {
        console.log(`[daemon] error en poll: ${msg}`);
        if (err.stack) console.log(err.stack);
        lastErr = { msg, at: now };
      } else if (now - lastErr.at >= 60000) {
        console.log(`[daemon] error en poll (repetido): ${msg}`);
        lastErr.at = now;
      }
    }
  };
  tick();
  setInterval(tick, intervalMs);
}

module.exports = { send, runOnce, loop, parseMarkers, applyRoute, loadState, saveState, updateState, withStateLock, NATIVE_COMPACT, DEFAULT_ROUTES, MAX_REBOUNDS };
