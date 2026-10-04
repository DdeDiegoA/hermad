"use strict";

// Completion de fish. `completions/hermad.fish` se autoload desde el dir
// estandar, por eso no hay que tocar config.fish (FR-6.5). Texto puro desde
// COMMANDS (FR-6.1/6.3).
function head(commands) {
  const names = commands.map((c) => c.name).join(" ");
  const flags = [...new Set(commands.flatMap((c) => c.flags))].join(" ");
  const subs = [...new Set(commands.flatMap((c) => c.sub))].join(", ");
  return [
    `# fish completion for hermad`,
    `# Comandos: ${names}`,
    `# Flags: ${flags}`,
    `# Subs: ${subs}`,
    "",
  ].join("\n");
}

function quote(s) {
  return String(s).replace(/'/g, "\\'");
}

function generate(commands) {
  const lines = [head(commands), `complete -c hermad -f`];

  for (const c of commands) {
    lines.push(`complete -c hermad -n '__fish_use_subcommand' -a '${c.name}' -d '${quote(c.summary)}'`);
  }
  for (const c of commands) {
    const subs = [...new Set(c.sub.flatMap((s) => s.split(" ")))];
    if (subs.length) {
      lines.push(`complete -c hermad -n '__fish_seen_subcommand_from ${c.name}' -a '${subs.join(" ")}'`);
    }
    for (const f of c.flags) {
      lines.push(`complete -c hermad -n '__fish_seen_subcommand_from ${c.name}' -l ${f.replace(/^--/, "")} -d '${f}'`);
    }
  }
  return lines.join("\n") + "\n";
}

module.exports = { generate };
