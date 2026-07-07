#!/usr/bin/env bash
set -euo pipefail

# Sincroniza los workflows del repo hacia la instancia de n8n en Railway.
# Para cada archivo: si el JSON trae "id" intenta PUT directo; si no (o si el
# id ya no existe), busca por nombre en la instancia; si tampoco existe, lo
# crea con POST. Así el script es idempotente y sirve para workflows nuevos.
#
# NOTA: whatsapp-agent-produccion.json NO se sincroniza automáticamente:
# sus credenciales de WhatsApp se seleccionan a mano en la UI y un PUT las
# borraría en cada push. Se importa manualmente cuando llegue la Fase 2.

N8N_BASE_URL="https://n8n-production-e595.up.railway.app"
FILES=(
  "workflows/whatsapp-agent.json"
  "workflows/sync-propiedades-nuby.json"
)

if [[ -z "${N8N_API_KEY:-}" ]]; then
  echo "Error: falta la variable de entorno N8N_API_KEY." >&2
  exit 1
fi

api() { # método, ruta, [body]
  local method="$1" route="$2" body="${3:-}"
  local args=(-sS -X "$method" -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
    -H "Content-Type: application/json" -w $'\n%{http_code}')
  [[ -n "$body" ]] && args+=(-d "$body")
  curl "${args[@]}" "${N8N_BASE_URL}/api/v1${route}"
}

fallo=0
for file in "${FILES[@]}"; do
  name=$(jq -r '.name' "$file")
  # La API de n8n solo acepta name/nodes/connections/settings en el body;
  # cualquier otro campo (id, active, tags, meta...) da 400.
  payload=$(jq '{name, nodes, connections, settings}' "$file")
  echo "── ${file} (\"${name}\")"

  # 1. id embebido en el archivo
  target_id=$(jq -r '.id // empty' "$file")

  # 2. si no hay id o el PUT con ese id falla con 404, buscar por nombre
  if [[ -z "$target_id" ]]; then
    lista=$(api GET "/workflows?limit=250")
    code="${lista##*$'\n'}"
    if [[ "$code" == "200" ]]; then
      target_id=$(printf '%s' "${lista%$'\n'*}" | jq -r --arg n "$name" \
        '.data[] | select(.name == $n) | .id' | head -1)
    fi
  fi

  if [[ -n "$target_id" ]]; then
    resp=$(api PUT "/workflows/${target_id}" "$payload")
    code="${resp##*$'\n'}"
    if [[ "$code" == "404" ]]; then
      echo "   id ${target_id} no existe en la instancia; se creará uno nuevo"
      target_id=""
    fi
  fi

  if [[ -z "$target_id" ]]; then
    resp=$(api POST "/workflows" "$payload")
    code="${resp##*$'\n'}"
  fi

  if [[ "$code" -ge 200 && "$code" -lt 300 ]]; then
    echo "   ✓ sincronizado (HTTP ${code})"
  else
    echo "   ✗ HTTP ${code}: $(printf '%s' "${resp%$'\n'*}" | head -c 400)" >&2
    fallo=1
  fi
done

exit $fallo
