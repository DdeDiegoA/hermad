#!/usr/bin/env bash
set -euo pipefail

# herdr-bmad bootstrap v3: workspace + orquestador + departamentos (tabs) + agentes en grid.
# Uso: ./orquestar.sh ["intent del proyecto"]
#   con intent    → arranca todo y le manda el briefing+intent al orquestador (== `hermad orchestrate`)
#   sin intent    → arranca todo, agentes quedan conectados y en idle, sin prompt inicial (== `hermad start-team`)
#
# esta lógica ahora vive nativa en hermad (src/lib/orchestrator.js) — `hermad
# start-team`/`hermad orchestrate` NO llaman a este script, lo reimplementan en JS
# (con mejor manejo de colisión de nombre de agente). Este archivo queda para correr
# el bootstrap a mano sin el CLI instalado. Ya NO trae un personas.env de ejemplo:
# corré `hermad create-project` una vez y él escribe el activo en $HOME.

INTENT="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Activo real: lo escribe `hermad create-project` / `hermad settings agents` en
# $HOME (git-ignored, fuera del repo).
ACTIVE_PERSONAS_ENV="$HOME/.hermad/personas.env"
if [[ -f "$ACTIVE_PERSONAS_ENV" ]]; then
  source "$ACTIVE_PERSONAS_ENV"
else
  echo "[!] $ACTIVE_PERSONAS_ENV no existe — corré 'hermad create-project' primero." >&2
  exit 1
fi

command -v herdr >/dev/null || { echo "herdr no instalado: brew install herdr"; exit 1; }
command -v jq    >/dev/null || { echo "jq requerido"; exit 1; }

spec_of() { for s in "${PERSONAS[@]}"; do [[ "${s%%|*}" == "$1" ]] && { printf '%s\n' "$s"; return; }; done; }

# Un pane recién creado (workspace/tab/split) tarda en estar "at its interactive
# shell prompt" — confirmado en vivo: herdr rechaza con agent_pane_busy justo
# después de crearlo. Cuánto tarda varía mucho: desde una terminal ya abierta es
# rápido, pero desde "terminal en bruto" (sin ningún workspace herdr abierto)
# herdr levanta la ventana/proceso entero — con rc files pesados puede tardar
# bastante más de unos segundos. Budget generoso (~40s) en vez de reintentos cortos.
start_agent_retry() {
  local name="$1" kind="$2" pane="$3" vargs="$4"
  local attempt out
  for attempt in $(seq 1 40); do
    # shellcheck disable=SC2086
    if out=$(herdr agent start "$name" --kind "$kind" --pane "$pane" -- $vargs 2>&1); then
      printf '%s\n' "$out"
      return 0
    fi
    if printf '%s\n' "$out" | grep -q agent_pane_busy; then
      [[ $((attempt % 5)) -eq 0 ]] && echo "    ... $pane todavía no tiene shell lista, reintentando ($attempt/40)" >&2
      sleep 1
      continue
    fi
    printf '%s\n' "$out" >&2
    return 1
  done
  printf '%s\n' "$out" >&2
  return 1
}

# --- 1. workspace + orquestador (root pane, tab default) ---
created=$(herdr workspace create --cwd "$PROJECT_DIR" --label "$LABEL" --no-focus)
ws=$(printf '%s\n' "$created" | jq -r '.result.workspace.workspace_id')
orch_pane=$(printf '%s\n' "$created" | jq -r '.result.root_pane.pane_id')

IFS='|' read -r _n okind ovargs orole <<< "$(spec_of orquestador)"
echo "[+] orquestador ($okind) en $orch_pane — $orole"
start_agent_retry orquestador "$okind" "$orch_pane" "$ovargs"

# --- 2. departamentos: tab + grid (hasta 4 col × 2 filas) ---
WORKERS=""
for dept in "${DEPARTAMENTOS[@]}"; do
  IFS='|' read -r tab_label names_csv <<< "$dept"
  IFS=',' read -ra names <<< "$names_csv"

  tab=$(herdr tab create --workspace "$ws" --cwd "$PROJECT_DIR" --label "$tab_label" --no-focus)
  tab_root=$(printf '%s\n' "$tab" | jq -r '.result.root_pane.pane_id')

  # Pitfall: no splitees un pane con un agente full-screen corriendo (deja el pane
  # nuevo sin shell → agent_pane_busy). Por eso se arma TODA la grilla de panes
  # primero y recién después se arrancan los agentes, uno por uno.
  col_panes=("$tab_root")
  for ((i = 1; i < ${#names[@]}; i++)); do
    if [[ $i -lt 4 ]]; then
      sp=$(herdr pane split "${col_panes[$((i-1))]}" --direction right --no-focus)
    else
      sp=$(herdr pane split "${col_panes[$((i-4))]}" --direction down --no-focus)
    fi
    col_panes+=("$(printf '%s\n' "$sp" | jq -r '.result.pane.pane_id')")
  done

  for i in "${!names[@]}"; do
    name="${names[$i]}"
    pane="${col_panes[$i]}"

    IFS='|' read -r _n kind vargs role <<< "$(spec_of "$name")"
    [[ -z "$kind" ]] && { echo "[!] persona '$name' no definida en PERSONAS"; exit 1; }
    echo "[+] $name ($kind) en $pane [$tab_label] — $role"
    start_agent_retry "$name" "$kind" "$pane" "$vargs"
    WORKERS="$WORKERS $name"
  done
done

# --- 3. briefing del orquestador (solo si vino intent) ---
if [[ -n "$INTENT" ]]; then
  briefing=$(cat <<EOF
Sos Hermad, el orquestador de este workspace Herdr. Proyecto: $PROJECT_DIR (BMad instalado).
Agentes: orquestador $WORKERS (en tabs por departamento). Usá 'herdr agent list' para el roster vivo.
Rutá la ruta épica de BMad por las personas y respondé las aprobaciones según la política:
auto-aprueba salvo auth/dinero/DB/seguridad (ahí dejá bloqueado y notificá al usuario).
Los agentes pueden hablarse directo entre sí (peer-to-peer); vos coordinás el top.
Intent: $INTENT
Reportá DONE cuando la épica esté completa.
EOF
)
  herdr agent prompt orquestador "$briefing"
  echo "[+] Workspace: $ws | Orquestador arrancado con intent. Mirá el tablero con: herdr"
else
  echo "[+] Workspace: $ws | Agentes conectados, sin prompt inicial. Mirá el tablero con: herdr"
fi
