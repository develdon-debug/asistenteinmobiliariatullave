# Estado de la conexión WhatsApp Cloud API (Coexistencia)

Última actualización: 2026-07-14. Documento de trabajo — refleja el estado real
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

### Diagnóstico ampliado: el token/app quedó BLOQUEADO (2026-07-11, ~20:34 UTC)

Al re-ejecutar `meta-diag.yml` unas 4 horas después del primero, **todas** las consultas al
Graph API (incluidas las que funcionaron en el primer diagnóstico) devuelven:

```
{ "error": { "message": "API access blocked.", "type": "OAuthException", "code": 200 } }
```

Es decir: entre el primer diagnóstico (16:36 UTC, datos OK) y el segundo (20:34 UTC), Meta
**bloqueó el acceso a la API** de la app `915887718209044` o del token del usuario del
sistema. Ya no se puede leer ni escribir sobre la WABA/número por API.

**Esto es ahora el bloqueo principal** (por encima del `platform_type: ON_PREMISE`). Causas
probables del `code 200 "API access blocked"`:
- Restricción automática de Meta a la app (frecuente en apps nuevas con actividad inusual:
  hoy se publicó la app, se suscribió la WABA a mano por Graph API, se hicieron varias
  consultas de diagnóstico, se generaron/rotaron tokens).
- Token del usuario del sistema invalidado.
- Acción requerida / revisión de la cuenta o la app activada.

**Pasos para diagnosticar en el panel (no por API, que está bloqueada):**
1. developers.facebook.com → app "Agente TuLlave" → panel principal: buscar banner rojo de
   restricción o "Acciones requeridas".
2. developers.facebook.com → app → Configuración → Básica: ver si el "Modo de la app" cambió
   o si hay aviso de restricción.
3. business.facebook.com → Configuración → Seguridad / Calidad de la cuenta / Acciones
   requeridas: revisar si la WABA o el negocio tienen una marca.
4. Si hay una restricción con opción de "Solicitar revisión" / "Apelar", iniciarla.

**No hacer más llamadas de escritura ni generar más tokens hasta entender la restricción** —
insistir puede empeorar el bloqueo (patrón del incidente 131031 previo del proyecto).

## Diagnóstico re-ejecutado (2026-07-14) — el bloqueo de API ya no está, pero el número quedó DESCONECTADO

El usuario desbloqueó el acceso desde el panel de Meta. Se volvió a correr `meta-diag.yml`
(run `29362432993`) y las 5 consultas respondieron sin error `OAuthException` — **el bloqueo
del API quedó resuelto**. Pero salió un dato nuevo, más grave que el `platform_type`:

```
GET /1242024732320760?fields=status,platform_type,webhook_configuration
{
  "status": "DISCONNECTED",              ← antes era "CONNECTED"
  "platform_type": "ON_PREMISE",         ← sigue igual
  "webhook_configuration": { "application": ".../webhook/8f1e2d3c-.../webhook" }
}

GET /1242024732320760?fields=verified_name,code_verification_status,name_status,account_mode,is_official_business_account,throughput,messaging_limit_tier
{
  "verified_name": "Inmobiliaria Tu Llave",
  "code_verification_status": "NOT_VERIFIED",   ← nunca se completó el código de verificación de Cloud API
  "name_status": "AVAILABLE_WITHOUT_REVIEW",
  "account_mode": "LIVE",
  "is_official_business_account": false,
  "throughput": { "level": "NOT_APPLICABLE" }
}

GET /962216713353351?fields=name,account_review_status,business_verification_status,on_behalf_of_business_info,ownership_type,timezone_id
{
  "name": "Inmobiliaria Tu Llave",
  "account_review_status": "APPROVED",
  "business_verification_status": "verified",
  "on_behalf_of_business_info": { "name": "Inmobiliaria Tu Llave", "status": "APPROVED", "type": "SELF" },
  "ownership_type": "SELF",
  "timezone_id": "43"
}
```

**Lectura:**
- El negocio y la WABA están perfectamente sanos: negocio verificado, cuenta aprobada,
  `ownership_type: SELF`. Esto **no** es un problema de la cuenta de negocio.
- El problema está aislado 100% en el número `1242024732320760`:
  - `status: DISCONNECTED` — el número ya no está enlazado operativamente a Cloud API.
  - `platform_type: ON_PREMISE` — sigue sin migrar a Cloud API (causa raíz original).
  - `code_verification_status: NOT_VERIFIED` — el número nunca terminó el paso de
    verificación de registro de Cloud API (el código de 6 dígitos por SMS/llamada que
    activa un número dentro de Cloud API). Esto probablemente es la causa raíz real:
    sin ese registro, el número queda a medias — recibe en la app física (On-Premise/app
    normal) pero Cloud API nunca toma control, así que el webhook nunca ve tráfico real.
- Hipótesis de por qué ahora aparece `DISCONNECTED`: es plausible que la restricción de
  API que Meta aplicó (y que el usuario destrabó) haya incluido desconectar el número de
  Cloud API como parte de la restricción; al "desbloquear" el acceso al API no se restauró
  automáticamente la conexión del número.

**Siguiente paso recomendado (acción en el panel de Meta, no por API, para no arriesgar
otro bloqueo):**
1. Ir a business.facebook.com → WhatsApp Manager → Números de teléfono (o
   developers.facebook.com/apps/915887718209044 → WhatsApp → Configuración de la API →
   pestaña de números).
2. Buscar el número +57 317 4848480 y ver qué botón/aviso muestra: lo esperable es algo
   como "Reconectar", "Completar registro" o un aviso de verificación pendiente.
3. Si pide un código de verificación (SMS o llamada), completarlo — eso es exactamente el
   paso de `code_verification_status` que quedó en `NOT_VERIFIED`.
4. Después de reconectar, volver a correr `meta-diag.yml` para confirmar
   `status: CONNECTED` y, ojalá, `platform_type: CLOUD_API`.

## Confirmación de la causa raíz y primer intento de arreglo (2026-07-14, tarde)

Se amplió `meta-diag.yml` para pedir `certificate` y `new_certificate` sobre el número.
**Ninguno de los dos campos existe en la respuesta** (ni siquiera vacíos). En Cloud API
ese certificado solo se genera cuando un número completa el registro real (`/register`).
Su ausencia confirma, sin ambigüedad, que **este número nunca terminó el registro de
Cloud API** — de ahí que quede pegado en `platform_type: ON_PREMISE` con
`code_verification_status: NOT_VERIFIED`, más allá de que la WABA y el negocio estén
100% aprobados.

También se observó que `status` alterna entre `CONNECTED` y `DISCONNECTED` en minutos sin
ninguna acción del usuario ni del teléfono — es ruido/inestabilidad del lado de Meta,
no la causa raíz real.

**Arreglo:** completar el registro oficial de Cloud API con la secuencia
`request_code` → `verify_code` → `register` sobre `1242024732320760`. Se creó
`.github/workflows/meta-register.yml` (workflow de ESCRITURA, separado del diagnóstico
read-only, un paso a la vez con confirmación humana explícita entre cada uno).

- Intento 1 de `request_code` (`code_method=SMS`, run `29365142704`): falló con
  `error_subcode 2388091` — *"Nuestros servidores no están disponibles temporalmente.
  Espera 1 hour antes de volver a intentarlo."* No se envió ningún SMS. No es un bloqueo
  de cuenta, es un cooldown temporal de Meta. Reintentar después de ~1 hora, con
  confirmación explícita del usuario otra vez antes de disparar la escritura.

### Dos reintentos más (2026-07-14, ~1h40 después) — mismo error, se descarta el cooldown

- Intento 2 (`code_method=SMS`, run `29371312469`, 21:56 UTC): mismo error exacto,
  `code 136024` / `error_subcode 2388091`, mismo mensaje de "espera 1 hour".
- Intento 3 (`code_method=VOICE`, run `29371360730`, 21:57 UTC): **mismo error otra vez**,
  idéntico código y subcódigo, cambiando el método de SMS a llamada de voz.

**Conclusión revisada:** con dos métodos distintos y casi 2 horas de espera entre el primer
y el tercer intento, el error se repite exactamente igual. Esto descarta que sea un simple
cooldown temporal de servidores — el mensaje "espera 1 hora" es genérico y no refleja la
causa real. La hipótesis más probable ahora: **la llamada cruda `request_code` del Graph
API no es el camino correcto para un número que ya está activo en la app de WhatsApp
Business (coexistencia)**. Meta reserva esa llamada directa para números nuevos o que se
están migrando fuera de la app; para coexistencia, el flujo soportado es a través de la
interfaz de **WhatsApp Manager** (opción "Agregar número que ya uso en la app de WhatsApp
Business"), que dispara una confirmación dentro de la propia app (notificación para
aceptar) en lugar de un código por SMS/llamada vía API.

**Siguiente paso:** dejar de insistir con `request_code` por API cruda. Revisar en
WhatsApp Manager (solo lectura por ahora) si existe esa opción específica de coexistencia
para este número, y documentar exactamente qué botón/flujo aparece antes de proponer
cualquier acción de escritura nueva.

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
