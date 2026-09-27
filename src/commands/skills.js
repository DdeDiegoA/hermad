"use strict";
const { execFileSync } = require("child_process");
const { resolveProject } = require("../lib/project");
const skills = require("../lib/skills");
const prompts = require("../lib/prompts");

// Fase 8: match semántico rol ↔ skills INSTALADAS. Solo propone; nunca aplica.
// Una llamada LLM vía el CLI del vendor del orquestador.

function buildSuggestPrompt({ personaName, body, current, installed }) {
  const list = installed.map((s) => `- ${s.display}: ${s.description}`).join("\n");
  return [
    "Eres un selector de skills para un agente de coding.",
    `Persona: ${personaName}.`,
    "Descripción del rol:",
    body || "(sin descripción)",
    "",
    "Skills INSTALADAS (solo podés elegir de esta lista, no inventes):",
    list,
    "",
    `Skills actuales de la persona: ${current.length ? current.join(", ") : "(ninguna)"}`,
    "",
    'Devolvé SOLO un JSON: {"skills": ["<display>", ...], "reason": "<una línea>"} con 2 a 6 skills relevantes al rol.',
  ].join("\n");
}

function parseSuggestions(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    return Array.isArray(j.skills) ? j.skills : null;
  } catch {
    return null;
  }
}

function callVendor(kind, model, prompt) {
  const run = (bin, argv) => execFileSync(bin, argv, { encoding: "utf8", timeout: 180000, stdio: ["ignore", "pipe", "pipe"] });
  const modelArgs = model ? ["--model", model] : [];
  if (kind === "opencode") return run("opencode", ["run", prompt, ...(model ? ["-m", model] : [])]);
  if (kind === "hermes") return run("hermes", [...modelArgs, "-z", prompt]);
  return run("claude", ["-p", prompt, ...modelArgs]);
}

function run(args) {
  if (args[0] !== "suggest" || !args[1]) {
    console.error("Uso: hermad skills suggest <persona>");
    process.exit(1);
  }
  const personaName = args[1];
  const project = resolveProject();
  if (!project) {
    console.error("No hay proyecto (ni .hermad/project.json ni activo).");
    process.exit(1);
  }

  const installed = skills.listInstalled(project.projectDir);
  if (!installed.length) {
    console.error("No encontré skills instaladas en los roots conocidos.");
    process.exit(1);
  }

  const p = prompts.loadPersona(personaName);
  const current = (p && p.skills) || [];
  const body = (p && p.body) || (project.personas[personaName] || {}).rol || "";
  const prompt = buildSuggestPrompt({ personaName, body, current, installed });

  const orq = (project.personas || {}).orquestador || {};
  const model = /-m|--model/.test(orq.modelFlag || "") ? (orq.modelFlag || "").split(" ").pop() : null;

  let output;
  try {
    output = callVendor(orq.kind || "claude", model, prompt);
  } catch (err) {
    console.error(`No pude consultar el vendor (${orq.kind}): ${err.message}`);
    process.exit(1);
  }

  const suggested = parseSuggestions(output);
  if (!suggested) {
    console.error("El vendor no devolvió JSON parseable. Salida:\n" + output.slice(0, 500));
    process.exit(1);
  }

  const add = suggested.filter((s) => !current.includes(s));
  const remove = current.filter((s) => !suggested.includes(s));
  console.log(`\nPropuesta para '${personaName}' (solo propuesta — la aplicás a mano en templates/prompts/${personaName}.md):`);
  console.log(`  skills: [${suggested.join(", ")}]`);
  if (add.length) console.log(`  + agregar: ${add.join(", ")}`);
  if (remove.length) console.log(`  - quitar:  ${remove.join(", ")}`);
  console.log(`\nFrontmatter sugerido:\n  skills: [${suggested.join(", ")}]`);
}

module.exports = { run, buildSuggestPrompt, parseSuggestions };
