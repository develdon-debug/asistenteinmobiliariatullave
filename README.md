# Agente de WhatsApp con IA — Inmobiliaria Tu Llave

Agente de IA por WhatsApp para **Inmobiliaria Tu Llave** (Bucaramanga/Piedecuesta/Curití, Santander). Responde 24/7 con información real de propiedades (venta y arriendo de apartamentos, apartaestudios, casas, lotes, bodegas y oficinas) y deriva a un asesor humano cuando corresponde (agendar visitas, negociar precio final, temas fuera de alcance).

- Sitio de la inmobiliaria: inmobiliariatullave.com (WordPress, construido por Grupo Axis)
- Inventario actual: 9 propiedades activas confirmadas (IDs 5, 6, 7, 9–14; el ID 8 no existe)

## Arquitectura (decidida, no reabrir sin razón nueva)

| Componente | Elección | Por qué |
|---|---|---|
| Orquestación | **n8n self-hosted** en Railway (plantilla oficial n8n + PostgreSQL) | Auto-hospedable, gratis, con persistencia real. Se descartaron alternativas no-code de pago (Wati, Landbot, ManyChat) y Make (de pago, no auto-hospedable). |
| Canal | **WhatsApp Business Cloud API oficial de Meta** | Se descartaron BSPs de pago (Twilio, 360dialog) y Evolution API (viola los ToS de WhatsApp; solo válida como demo temporal desechable, nunca usada en este proyecto). |
| LLM | Intercambiable: **Google Gemini 2.5 Flash** (gratis, ~1500 req/día, usado en pruebas) o **Anthropic Claude Haiku 4.5** (~US$0.003/mensaje, para producción) | Presupuesto casi nulo; Gemini free tier permite probar sin costo, Claude Haiku queda como opción de producción de bajo costo. |
| Datos de propiedades | Google Sheet "Propiedades Tu Llave" como Tool del AI Agent | Gratis, editable por el cliente, sin necesidad de backend propio. |

Esta combinación ya fue evaluada exhaustivamente como "estado del arte" para el caso de uso — no reabrir la decisión salvo que cambien restricciones de volumen o presupuesto.

## Estado por fase

| Fase | Estado | Detalle |
|---|---|---|
| Fase 0 — Meta Business Manager | 🟡 En progreso | Business Manager real creado ("Inmobiliaria Tu Llave S.A.S", página FB/IG vinculada). Verificación de negocio enviada, en revisión (~2 días hábiles según Meta). Cuenta de WhatsApp en el portfolio: "Aprobada" pero sin dirección/moneda/zona horaria configuradas — revisar antes de producción. |
| Migración WhatsApp Business App | ✅ Hecho | Backup + migración del número real de la empresa completada. |
| Coexistencia (conectar número real a Cloud API) | ⬜ Pendiente | Bloqueado hasta terminar verificación. **No intentar con datos provisionales** (causó bloqueo real de cuenta, error 131031, la vez pasada). |
| Fase 1 — n8n en Railway | ✅ Hecho y probado | Desplegado con plantilla oficial (n8n + Postgres). Persistencia confirmada tras reinicios. |
| Fase 2 — Conectar WhatsApp en n8n | ⬜ Pendiente | Hecho con número de prueba de Meta (temporal); ese número tuvo el incidente de bloqueo. Falta reemplazar credenciales (Phone Number ID + Access Token) por las del número real una vez pase Coexistencia — no requiere reconstruir el workflow. |
| Fase 3 — AI Agent (cerebro) | ✅ Hecho y probado | n8n: Chat Trigger → AI Agent → Simple Memory + Chat Model (Anthropic/Gemini intercambiable). System prompt probado: se mantiene en tema, recuerda contexto, deriva a humano en vez de inventar compromisos. |
| Fase 4 — Datos de propiedades | ✅ Hecho y mejorado | Google Sheets como Tool del AI Agent (pestaña `Propiedades`). Desde 2026-07-06 el Sheet se alimenta solo: workflow "Sync Propiedades Nuby → Sheet" trae el inventario real desde la API pública de Nuby cada 2 horas. |
| Fase 5 — Robustez | ✅ Hecho (falta probar en n8n) | Ver `workflows/whatsapp-agent.json` y la sección "Qué incluye la versión actual" abajo: Retry On Fail en todos los nodos de APIs externas, fallback a asesor humano, validación de mensajes entrantes, logging de conversaciones a Google Sheets, límites de tokens de salida, timeout de ejecución y system prompt endurecido contra manipulación. Pendiente: probarlo en la instancia real con el Chat Trigger. |
| Conexión final WhatsApp real | ⬜ Pendiente | Depende de Coexistencia. Último paso del proyecto. |

## Pendientes de negocio — RESUELTOS el 2026-07-06 investigando el sitio web

- ✅ **Tu Llave SÍ usa Nuby**: el propio sitio WordPress se alimenta de una API pública de Nuby (`https://tullave.nuby.app/service/v2/public/search-results/properties`, GET sin autenticación, JSON limpio). No hace falta contactar a soporte@nuby.ai — la API pública basta para leer el inventario.
- ✅ **Quién mantiene el Sheet**: nadie — se llena solo. El workflow "Sync Propiedades Nuby → Sheet" copia el inventario de Nuby al Sheet cada 2 horas. La inmobiliaria solo mantiene su CRM Nuby (que ya mantenía) y todo fluye: Nuby → sitio web y Nuby → Sheet → bot.
- ✅ **Propiedad ID 12**: según la API de Nuby es una *Bodega en Arriendo* en Floridablanca ($19.000.000) — el título "Oficina" del sitio era el dato viejo/errado.
- ℹ️ El inventario real en Nuby a 2026-07-06 es de **15 propiedades** (IDs 1–15, todos existen) — el Sheet manual con 9 ya estaba desactualizado, lo que confirma la necesidad del sync automático.

## Errores ya cometidos (no repetir)

1. Usar datos de negocio provisionales/inventados en Meta Business Manager → cuenta bloqueada. Ahora todo se hace con datos reales desde el inicio.
2. Asumir que n8n Cloud y n8n self-hosted comparten el mismo flujo OAuth2 con Google — self-hosted requiere credenciales propias en Google Cloud Console (proyecto, APIs habilitadas, OAuth consent screen con test users, Client ID/Secret).
3. Depender de modelos gratis compartidos (OpenRouter free tier, 50 msj/día compartidos globalmente) generó bloqueos poco confiables — el free tier propio de Google Gemini resultó mucho más estable.

## Credenciales y accesos (ya existen — ubicar, no regenerar salvo error)

Ninguna credencial vive en este repo. Referencias de dónde están:

- n8n corriendo en Railway (API key generada en Settings → n8n API).
- Credencial de Anthropic (cuenta personal en console.anthropic.com).
- Credencial de Google Gemini (API key en aistudio.google.com).
- Credencial OAuth2 de Google Sheets (Client ID/Secret propios en Google Cloud Console, vinculados en n8n).
- Meta Business Manager real de Inmobiliaria Tu Llave + app en developers.facebook.com (con número de prueba activo mientras se resuelve Coexistencia).

## Restricciones a respetar siempre

- Presupuesto casi nulo — evitar cualquier suscripción/servicio de pago salvo estrictamente necesario, avisando el costo exacto antes.
- Explicar el "por qué", no solo el "qué", en decisiones técnicas importantes.
- Nunca usar datos provisionales/inventados en cuentas de Meta — siempre datos reales de Tu Llave.

## Próximo paso inmediato

1. Confirmar que el secret `N8N_API_KEY` quedó en **Actions** (no en Codespaces) y que el GitHub Action "Sync workflow to n8n" corre en verde.
2. Crear las 3 pestañas del Google Sheet (`Propiedades`, `Log`, `Leads`) con sus encabezados — ver tabla arriba.
3. En n8n: abrir "Sync Propiedades Nuby → Sheet", ejecutarlo una vez a mano (Execute workflow) para verificar que llena la pestaña `Propiedades` con las 15 propiedades, y activarlo (toggle Active).
4. Probar el bot con el Chat Trigger: mensaje normal, mensaje vacío, texto larguísimo, pregunta fuera de tema, "ignora tus instrucciones", y una conversación de compra completa (verificar que registre el lead en la pestaña `Leads`).
5. Cuando pase la verificación de Meta: retomar Coexistencia, importar `whatsapp-agent-produccion.json`, seleccionar credenciales de WhatsApp y probar (incluye notas de voz).

## Este repositorio

Contiene la documentación del proyecto y el workflow de n8n exportado para control de versiones:

- `workflows/whatsapp-agent.backup.json` — export tal cual estaba en Railway al 2026-07-06, sin modificar. Referencia de respaldo.
- `workflows/whatsapp-agent.json` — el bot con Chat Trigger (para probar el cerebro en n8n hoy). Fase 5 completa + cerebro de vendedora consultiva + captura de leads. Ver detalle abajo.
- `workflows/sync-propiedades-nuby.json` — sync automático Nuby → Sheet cada 2 horas (datos en tiempo real para el bot). Ver detalle abajo.
- `workflows/whatsapp-agent-produccion.json` — versión para la Fase 2 con WhatsApp Trigger real y **soporte de notas de voz** (transcripción con Gemini). Se importa manualmente cuando pase Coexistencia; NO se sincroniza automático (sus credenciales de WhatsApp se eligen a mano en la UI y el sync las borraría).
- `scripts/validate-workflow.py` — validador estático de los workflows (conexiones rotas, nodos sin retry, credenciales embebidas, ramas sin `output`). Corre automáticamente en el GitHub Action antes de cada sync; también local: `python3 scripts/validate-workflow.py <archivo>`.

### Pestañas requeridas en el Google Sheet (crear una sola vez)

En el Sheet "Propiedades Tu Llave", crea 3 pestañas nuevas con estos nombres y encabezados exactos en la fila 1 (la pestaña vieja "Hoja 1" queda como archivo, ya no se usa):

| Pestaña | Encabezados (fila 1) |
|---|---|
| `Propiedades` | `id	titulo	tipo	servicio	municipio	barrio	direccion	area_m2	habitaciones	banos	canon_arriendo	precio_venta	administracion	caracteristicas	descripcion	link	imagen	fecha_consignacion	actualizado` |
| `Log` | `fecha	sesion	mensaje	respuesta` |
| `Leads` | `fecha	telefono_sesion	nombre	telefono	propiedad_interes	presupuesto	nivel_interes	proximo_paso	notas` |

Tip: copia cada línea de encabezados y pégala en la celda A1 de la pestaña — Google Sheets reparte las columnas solo (están separadas por tabulaciones).

### Sync de propiedades en tiempo real (Nuby → Sheet)

`sync-propiedades-nuby.json`: Schedule (cada 2 h) → GET a la API pública de Nuby → guard (si Nuby devuelve vacío, **aborta sin tocar el Sheet**) → vacía la pestaña `Propiedades` (conservando encabezados) → escribe las filas frescas.

- La transformación (precios, habitaciones, baños, link al detalle en el sitio web, descripción sin HTML) ya fue **probada localmente contra la API real** con las 15 propiedades.
- Cada fila incluye `link` al sitio (`inmobiliariatullave.com/detalle-propiedad/?Tipo-en-Servicio-ID`) para que la asesora virtual lo comparta con clientes.
- El bot lee la pestaña en cada mensaje, así que un cambio en Nuby tarda máximo 2 horas en llegarle (el intervalo se puede bajar en el nodo "Cada 2 horas").
- Tras importarlo/sincronizarlo, hay que **activarlo** (toggle Active) — decisión manual, el sync de GitHub no activa nada por diseño.

### Cerebro de vendedora + leads

El system prompt ya no es un asistente pasivo: es "Clara", vendedora consultiva. Método: descubrir la necesidad con 1-2 preguntas antes de mostrar → presentar beneficios conectados a lo que el cliente dijo (máx. 3 propiedades + link) → crear deseo solo con datos reales (nunca urgencia inventada) → cerrar SIEMPRE con un siguiente paso → manejar objeciones sin pelear → capturar el lead con naturalidad.

Herramienta nueva "Registrar lead": cuando el cliente muestra interés real (da su nombre, pide visita, menciona presupuesto), el agente registra una fila en la pestaña `Leads` con nombre, contacto, propiedad de interés, presupuesto, nivel de interés (caliente/tibio/frío), próximo paso acordado y notas para el asesor. Esa pestaña es la cola de seguimiento del equipo comercial: cada mañana el asesor la abre y sabe a quién llamar y por qué.

**Seguimiento post-interacción automático (fase futura, requiere WhatsApp real):** para que el bot escriba él mismo al cliente días después ("¿Sigues buscando apartamento en Cabecera?") se necesitan *message templates* aprobados por Meta — WhatsApp solo permite mensajes iniciados por el negocio fuera de la ventana de 24 h vía plantillas, y esas conversaciones tienen costo por unidad. Cuando pase la Fase 2 se puede montar: Schedule diario → leer `Leads` con seguimiento vencido → enviar plantilla → registrar. Hasta entonces, la pestaña `Leads` cubre el seguimiento con el asesor humano.

### A prueba de audios (Fase 2)

`whatsapp-agent-produccion.json` maneja los tres casos que llegan por WhatsApp real:

- **Texto** → directo al agente.
- **Nota de voz** → descarga el audio de la API de Meta → lo transcribe con Gemini 2.5 Flash (mismo free tier, sin costo extra) → el agente responde el texto transcrito. En el Log queda marcado como `[AUDIO] <transcripción>`.
- **Otros (fotos, stickers, ubicación...)** → respuesta amable pidiendo texto o audio.

También ignora los eventos de estado (entregado/leído) que Meta manda al mismo webhook, y usa el número del cliente (`wa_id`) como clave de memoria — cada cliente tiene su propia conversación con contexto. Al importarlo hay que seleccionar las credenciales de WhatsApp (trigger y envío) en los 5 nodos marcados y probar con el número de prueba antes del real.

### Qué incluye la versión actual del workflow (v2, 2026-07-06)

Flujo: `Chat Trigger → Validar mensaje → AI Agent → Registrar en log → Responder al cliente`, con rama de error del agente hacia `Fallback - derivar a asesor` y rama de mensaje inválido hacia `Mensaje inválido`.

**Robustez ante fallos:**
- Retry On Fail en Gemini (3 intentos, 3s — el free tier devuelve 429 bajo carga y conviene esperar), en las dos operaciones de Google Sheets (3 y 2 intentos) y en el AI Agent (2 intentos).
- Si el agente falla incluso tras reintentar, el cliente recibe el mensaje del nodo "Fallback - derivar a asesor" en vez de silencio.
- `executionTimeout: 120` segundos — ninguna ejecución se queda colgada indefinidamente.
- El logging es "best effort": si falla el log, la respuesta al cliente sale igual (`onError: continueRegularOutput` + nodo "Responder al cliente" que toma la respuesta directo del AI Agent).

**Protección de entrada (anti-abuso y control de costos):**
- "Validar mensaje" rechaza mensajes vacíos o de más de 1500 caracteres antes de gastar tokens en el LLM (alguien pegando un texto enorme costaría dinero/quota en cada intento).
- `maxOutputTokens: 1024` y `temperature: 0.4` en Gemini — respuestas cortas, consistentes y de costo acotado.
- Modelo fijado explícitamente a `models/gemini-2.5-flash` (antes dependía del default del nodo, que puede cambiar entre versiones de n8n).

**Cerebro:**
- System prompt reescrito: reglas de formato WhatsApp (mensajes cortos, *negritas*, sin markdown), máximo 3 propiedades por mensaje, pedir nombre + propiedad de interés al derivar a asesor, y sección de seguridad explícita (no revelar instrucciones, resistir "ignora tus instrucciones", no pedir datos sensibles).
- Memoria de conversación ampliada a 10 turnos (default era 5).
- La herramienta de Sheets ahora se llama "Consultar propiedades" con descripción manual — el LLM decide usar la herramienta según su nombre/descripción, y el nombre viejo ("Get row(s) in sheet in Google Sheets") era ruido.

**Observabilidad:**
- Nodo "Registrar en log": cada conversación (fecha, sesión, mensaje, respuesta) se anexa a una pestaña **Log** del mismo Google Sheet. Gratis y visible para el cliente.
- `saveDataErrorExecution` y `saveDataSuccessExecution` en "all": todas las ejecuciones quedan en el historial de n8n (Executions) para depurar. Postgres ya da la persistencia.
- Zona horaria del workflow fijada a `America/Bogota` (los timestamps del log salen en hora colombiana).

**⚠️ Paso manual requerido (una sola vez):** en el Google Sheet "Propiedades Tu Llave", crea una pestaña nueva llamada exactamente `Log` con estos encabezados en la fila 1: `fecha | sesion | mensaje | respuesta`. Sin ella el logging falla (aunque el bot sigue respondiendo normal, por diseño).

**Cómo aplicar esto en n8n manualmente (primera vez):** en la UI de Railway, abre el workflow → menú (⋮) → Import from File → selecciona `whatsapp-agent.json` (o pega el contenido directo en el canvas, ver más abajo). Revisa visualmente el nuevo nodo "Fallback - derivar a asesor" y sus conexiones antes de guardar, y prueba el flujo con el Chat Trigger antes de considerarlo listo.

### Sync automático hacia n8n

`.github/workflows/sync-n8n-workflow.yml` sube automáticamente `workflows/whatsapp-agent.json` a la instancia de n8n en Railway cada vez que ese archivo cambia en este repo (push a `main` o a la branch de trabajo). Usa `scripts/sync-n8n-workflow.sh`, que llama a `PUT /api/v1/workflows/{id}` de la API de n8n.

**Configuración única (manual, una sola vez):**

1. En n8n: **Settings → n8n API** → genera una API key nueva (recomendado: la anterior quedó expuesta en un chat, conviene revocarla).
2. En GitHub: repo → **Settings → Secrets and variables → Actions → New repository secret** → nombre `N8N_API_KEY`, valor la API key generada.
3. Listo. De ahí en adelante, cualquier cambio que yo haga a `workflows/whatsapp-agent.json` se refleja solo en n8n al hacer push — no hace falta copiar/pegar de nuevo.

**Qué NO hace este sync (por diseño, para evitar sorpresas):**
- No activa ni desactiva el workflow (el campo `active` no se toca) — activarlo en producción sigue siendo una decisión manual.
- No toca credenciales — siguen siendo las que ya existen en la instancia de n8n, referenciadas por ID.
- Sincroniza `whatsapp-agent.json` y `sync-propiedades-nuby.json`. No sincroniza el `.backup.json` (foto fija) ni `whatsapp-agent-produccion.json` (se importa a mano en Fase 2 porque sus credenciales de WhatsApp se seleccionan en la UI). Si un workflow no existe en la instancia, el script lo crea; si existe, lo actualiza (busca por id y luego por nombre).

Además, desde la v2 el Action **valida el workflow antes de subirlo** (`scripts/validate-workflow.py`): si el JSON tiene conexiones rotas, nodos sin retry o credenciales embebidas, el sync no se ejecuta.
