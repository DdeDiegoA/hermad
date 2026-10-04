"use strict";

// Genera el completion de zsh desde la tabla unica COMMANDS (FR-6.1/FR-6.3).
// Texto puro: nada del CLI corre en cada TAB. Se emite a stdout, sin tocar disco.
function head(commands) {
  const names = commands.map((c) => c.name).join(" ");
  const flags = [...new Set(commands.flatMap((c) => c.flags))].join(" ");
  return [`#compdef hermad`, `# Comandos: ${names}`, `# Flags: ${flags}`, ""].join("\n");
}

function cases(commands) {
  return commands
    .map((c) => {
      const words = [...c.sub.flatMap((s) => s.split(" ")), ...c.flags].join(" ");
      return `    ${c.name})\n      compadd -- ${words}\n      ;;`;
    })
    .join("\n");
}

function generate(commands) {
  const top = commands.map((c) => c.name).join(" ");
  return `${head(commands)}_hermad() {
  local cmd="\${words[2]}"
  if (( CURRENT <= 2 )); then
    compadd -- ${top}
    return
  fi
  case "$cmd" in
${cases(commands)}
    *)
      compadd -- --help
      ;;
  esac
}
compdef _hermad hermad
`;
}

module.exports = { generate };
