"use strict";

// Completion de bash compatible con 3.2 (macOS): sin `compopt`, sin arrays
// asociativos, sin `mapfile` (FR-6.5). Texto puro desde COMMANDS (FR-6.1/6.3).
function head(commands) {
  const names = commands.map((c) => c.name).join(" ");
  const flags = [...new Set(commands.flatMap((c) => c.flags))].join(" ");
  return [`# bash completion for hermad`, `# Comandos: ${names}`, `# Flags: ${flags}`, ""].join("\n");
}

function cases(commands) {
  return commands
    .map((c) => {
      const words = [...c.sub.flatMap((s) => s.split(" ")), ...c.flags].join(" ");
      return `    ${c.name}) COMPREPLY=( $(compgen -W "${words}" -- "$cur") ) ;;`;
    })
    .join("\n");
}

function generate(commands) {
  const top = commands.map((c) => c.name).join(" ");
  return `${head(commands)}_hermad() {
  local cur
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "${top}" -- "$cur") )
    return 0
  fi
  case "\${COMP_WORDS[1]}" in
${cases(commands)}
    *) COMPREPLY=() ;;
  esac
  return 0
}
complete -F _hermad hermad
`;
}

module.exports = { generate };
