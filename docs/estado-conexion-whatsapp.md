# Estado de la conexión WhatsApp Cloud API (Coexistencia)

Última actualización: 2026-07-10 (noche). Documento de trabajo — refleja el estado real
de la conexión del número al cierre de esa sesión de configuración.

## Identificadores reales (no confundir con los de prueba)

| Recurso | Valor |
|---|---|
| App de Meta activa | **"Agente TuLlave"** — App ID `915887718209044` (creada automáticamente por el flujo de registro del número; la app anterior "Tu Llave Agente" `1379364720766853` quedó obsoleta y solo tiene el número de prueba) |
| WABA (cuenta de WhatsApp Business) real | `962216713353351` ("Inmobiliaria Tu Llave") |
| Número real | +57 317 4848480 — Phone Number ID `1242024732320760`, estado **Conectado**, en Coexistencia (la app física del celular sigue funcionando) |
| Usuario del sistema (genera el token permanente) | "Tullaveagente" `61591465396917`, acceso Admin |
| Webhook (nivel app) | `https://n8n-production-e595.up.railway.app/webhook/8f1e2d3c-4b5a-4697-8899-aabbccddee01/webhook` — verify token: el acordado en la sesión de configuración (no se publica aquí; el repo es público) — verificado ✅ |
| Campos suscritos | `messages`, `smb_app_state_sync`, `smb_message_echoes`, `account_*`, `calls`, `message_template_*`, `phone_number_*`, `security` |
| App publicada | ✅ (requirió política de privacidad: `https://develdon-debug.github.io/asistenteinmobiliariatullave/privacidad.html`, servida por GitHub Pages desde `docs/` de este repo) |
| WABA suscrita a la app | ✅ `POST /962216713353351/subscribed_apps` → `{"success": true}` (esto fue necesario a mano: la UI nueva de Meta no lo hace sola) |

## Credenciales en n8n (workflow "WhatsApp Agent - Tu Llave (PRODUCCIÓN)")

- **WhatsApp OAuth account** (nodo Trigger): Client ID = App ID `915887718209044` + App Secret de esa app. "Connection tested successfully".
- **WhatsApp account / WhatsApp API** (nodos de envío y audio): Access Token permanente del usuario del sistema + Business Account ID `962216713353351`.
- Workflow **Activo** y funcionando: el botón "Probar" del campo `messages` en Meta dispara una ejecución completa (Trigger → AI Agent → log → envío). El envío falla solo con el payload sintético porque trae el phone_number_id falso `123456123` — esperado.

## Problema abierto → CAUSA RAÍZ IDENTIFICADA (2026-07-11)

**Los mensajes reales llegan a la app física del celular pero NO generan evento de webhook**
(ninguna ejecución en n8n), mientras que el botón "Probar" de Meta sí llega.

**Diagnóstico ejecutado** (workflow `meta-diag.yml`, GET al Graph API con el token del
usuario del sistema). Resultado:

```
GET /1242024732320760?fields=status,platform_type,webhook_configuration
{
  "status": "CONNECTED",
  "platform_type": "ON_PREMISE",           ← DATO ANÓMALO
  "webhook_configuration": {
    "application": "https://n8n-production-e595.up.railway.app/webhook/8f1e2d3c-.../webhook"
  }
}

GET /962216713353351/subscribed_apps
{ "data": [ { "name": "Agente TuLlave", "id": "915887718209044" } ] }   ← correcto
```

**Conclusión:**
- La configuración de webhook está limpia y correcta (solo `application` → n8n; NO hay
  anulación a nivel de número ni WABA). **Descarta** la hipótesis del "ladrón de webhooks".
- La app SÍ está suscrita a la WABA. Correcto.
- **El número está en `platform_type: ON_PREMISE`, no `CLOUD_API`.** Este es el problema:
  un número Cloud API (que entrega mensajes al webhook) reporta `CLOUD_API`. Estando en
  `ON_PREMISE`, WhatsApp enruta los mensajes reales hacia la infraestructura On-Premises
  (API vieja, autoalojada, que no existe/no corre aquí) en lugar de la Cloud API. Por eso
  el test a nivel de app funciona pero los mensajes reales nunca llegan a n8n.

### Diagnóstico ampliado (pendiente de leer): confirmar el fix

`meta-diag.yml` ampliado consulta además `code_verification_status`, `account_mode`,
`name_status` del número y el estado de la WABA. Objetivo: confirmar si el número necesita
re-registro en Cloud API (`POST /{phone_id}/register` con el PIN de verificación en dos
pasos) o si el `platform_type` debe corregirse por otra vía (soporte de Meta / re-hacer el
flujo de Coexistencia). **No ejecutar ninguna escritura sobre Meta hasta confirmar** — ya
hubo un bloqueo de cuenta antes por actuar con datos inconsistentes.

## Seguridad — rotar cuando el sistema quede estable

Durante la configuración quedaron expuestos en chats/soportes estos secretos. Ninguno es
público, pero conviene rotarlos al estabilizar:

- App Secret de la app `915887718209044` (botón "Restablecer" en Configuración → Básica).
- Token permanente del usuario del sistema ("Revocar tokens" en Usuarios del sistema y generar uno nuevo → actualizar credencial de n8n).
- Contraseña del Postgres de Railway (rotar en Railway → actualizar secret `DATABASE_URL` de GitHub, `.env` local del dashboard y credencial de n8n si aplica).
- API key de n8n (Settings → n8n API → regenerar → actualizar secret `N8N_API_KEY` de GitHub).

## Pendientes menores detectados en el camino

- Checklist de Meta "Registra tu número de teléfono": quedó sin marcar aunque el número ya
  está conectado (esa sección sirve para agregar números adicionales).
- "Agrega la información de pago": necesaria solo para mensajes iniciados por la empresa
  (plantillas/seguimientos); no bloquea recibir ni responder dentro de la ventana de 24 h.
- Dirección del negocio en la cuenta de WhatsApp: sigue "Sin dirección" (Business Suite →
  Cuentas de WhatsApp → Resumen → Edit).
