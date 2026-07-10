# CRM + Dashboard de gestión — Diseño

Sistema de gestión de clientes y conversaciones para el agente de WhatsApp de Tu Llave.
Tres piezas que comparten la misma base de datos (el Postgres que ya existe en Railway junto a n8n):

```
WhatsApp/Chat ──► n8n (agente IA) ──► Postgres (esquema crm) ◄── Dashboard web (asesores)
```

## 1. Qué captura el agente de cada cliente

Basado en la práctica estándar de calificación de leads inmobiliarios (urgencia, presupuesto
y claridad de búsqueda como variables críticas) adaptada a Colombia:

| Campo | Cómo se pregunta "disimuladamente" |
|---|---|
| Operación (venta/arriendo) y tipo de inmueble | Surge solo al inicio de la conversación. |
| Zona (Bucaramanga/Piedecuesta/Curití, barrio) | "¿Por qué zona te gustaría?" |
| Presupuesto | "¿En qué rango de precio te acomoda buscar? Así te muestro solo lo que aplica." |
| Forma de pago | "¿Lo tienes pensado con crédito hipotecario, leasing o recursos propios?" |
| Crédito preaprobado | "¿Ya tienes el crédito preaprobado con algún banco? Eso agiliza todo." |
| Urgencia / plazo | "¿Para cuándo lo necesitas? ¿Es algo ya o estás explorando?" |
| Motivo (vivir vs. invertir) | "¿La buscas para vivir tú o como inversión? Así te oriento mejor." |
| Composición del hogar | "¿Cuántas personas la habitarían? ¿Mascotas?" — permite recomendar por habitaciones. |
| Situación actual | "¿Hoy estás en arriendo o tienes casa propia?" (¿debe vender primero?) |
| Fuente | "¿Cómo nos conociste?" — mide qué canal trae leads. |
| Nombre y preferencia de contacto | Se pide al derivar a asesor: nombre + horario preferido. |

Específicos de Colombia que el asesor humano completa después (no el bot, son sensibles):
capacidad de endeudamiento (cuota ≤30% de ingresos en VIS), subsidios (Mi Casa Ya, cajas de
compensación), y para arriendo: codeudor/fiador o aseguradora.

## 2. Embudo de ventas (etapas)

`nuevo → calificado → visita → negociacion → cerrado | perdido`

- **nuevo**: escribió, aún sin datos suficientes.
- **calificado**: sabemos qué busca + presupuesto o plazo.
- **visita**: pidió visita / el asesor la agendó.
- **negociacion**: hubo visita o está negociando condiciones.
- **cerrado / perdido**: resultado final.

El bot mueve automáticamente de `nuevo` a nada más — las etapas las mueve el **asesor** en el
dashboard (kanban). Lo que sí hace el bot es marcar `is_hot = true` cuando detecta intención
real (quiere visita, negociar, hablar con alguien), lo que dispara la alerta.

## 3. Base de datos (esquema `crm` en el Postgres de Railway)

- `crm.clients` — ficha del cliente: teléfono (clave), nombre, etapa, todos los campos de
  calificación, `is_hot`, `bot_paused`, notas del asesor, timestamps.
- `crm.messages` — cada mensaje (rol: cliente / bot / asesor) vinculado al cliente.
- `crm.events` — bitácora: lead caliente detectado, cambio de etapa, bot pausado/reanudado.

Se usa un **esquema separado** (`crm`) para no mezclarse con las tablas internas de n8n que
viven en la misma base. Migración: `dashboard/migrations/001_crm_schema.sql`.

## 4. Dashboard (carpeta `dashboard/`)

Node.js + Express + frontend estático (sin framework ni paso de build — todo legible y
mantenible con conocimientos de Node/JS básico). Corre local para desarrollo; a Railway
cuando esté listo (mismo repo, `npm start`).

Vistas:
1. **Indicadores** — fila de KPIs (leads totales, nuevos 7 días, calientes, visitas),
   mensajes por día (línea, 14 días), clientes por etapa, por tipo de inmueble y por zona.
2. **Chats** — lista de conversaciones + historial completo estilo chat; desde ahí se pausa
   el bot por cliente y se cambia la etapa.
3. **Embudo** — kanban con arrastrar y soltar entre etapas.
4. **Ficha de cliente** — todos los campos editables + notas + bitácora de eventos.

Autenticación v1: contraseña única compartida (`ADVISOR_PASSWORD` en `.env`), sesión por
cookie. Suficiente para un equipo pequeño; si crece, se pasa a usuarios individuales.

## 5. Workflow n8n con CRM (`workflows/whatsapp-agent-crm.json`)

Se importa como **workflow NUEVO** en n8n (no reemplaza al actual hasta probarlo). Nota: este
flujo trae un prompt de ventas propio, escrito antes del cerebro "Clara" que hoy vive en
`whatsapp-agent.json`; al adoptar el dashboard hay que fusionar ambos (Clara + registro en
Postgres) para tener un solo cerebro:

```
Chat Trigger
  → Registrar cliente (upsert por teléfono, lee bot_paused)
  → Guardar mensaje del cliente
  → ¿Bot pausado? ──sí──► no responder (el asesor está atendiendo)
        │no
  → AI Agent (prompt de ventas) ──► Responder al chat
  → Guardar respuesta del bot
  → Extraer datos del lead (LLM, estructurado)
  → Actualizar ficha del cliente (solo campos aprendidos, nunca borra)
  → ¿Lead caliente? ──sí──► registrar evento + [alerta WhatsApp al asesor — desactivada
                             hasta que pase Coexistencia; queda el nodo listo]
```

Requiere crear UNA credencial nueva en n8n: **Postgres** apuntando a la base del mismo
proyecto Railway (host interno `postgres.railway.internal`, credenciales en las variables
del servicio Postgres en Railway).

## 6. Costos

- Dashboard local: $0. En Railway: se cobra por uso de recursos; un servicio Node pequeño
  suele ser ~US$1–3/mes dentro del plan que ya pagas para n8n. Se avisará antes de desplegar.
- Extracción de datos del lead: una llamada extra a Gemini por mensaje (sigue dentro del
  free tier de ~1500 req/día mientras el volumen sea bajo).

## Fuentes de la investigación de calificación

- [Cómo calificar los leads en sector inmobiliario — Zannagui](https://zannagui17.com/como-calificar-los-leads-en-sector-inmobiliario/)
- [Calificación de leads inmobiliarios — MTM](https://mtm.cl/blog/calificacion-de-leads-inmobiliarios-convertir-interes-en-ventas)
- [El arte de calificar clientes — Proppit](https://blog.proppit.com/el-arte-de-calificar-clientes-como-saber-si-un-lead-vale-tu-tiempo/)
- [Créditos hipotecarios en Colombia — Oikos](https://www.oikos.com.co/constructora/noticias-constructora/lo-que-necesitas-saber-de-los-creditos-hipotecarios)
- [El ABC de la compra de vivienda 2026 — Amarilo](https://amarilo.com.co/blog/tendencias/el-abc-de-la-compra-de-vivienda-lo-que-debes-saber-en-2026)
