require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');
const pool = require('./db');

const app = express();
app.use(express.json());
app.use(
  cookieSession({
    name: 'tullave',
    secret: process.env.SESSION_SECRET || 'dev-secret',
    maxAge: 12 * 60 * 60 * 1000, // 12 horas
    sameSite: 'lax',
    httpOnly: true,
  })
);

const STAGES = ['nuevo', 'calificado', 'visita', 'negociacion', 'cerrado', 'perdido'];

// ---- Autenticación (contraseña compartida del equipo) ----

app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (!process.env.ADVISOR_PASSWORD) {
    return res.status(500).json({ error: 'ADVISOR_PASSWORD no configurada en el servidor.' });
  }
  if (password === process.env.ADVISOR_PASSWORD) {
    req.session.auth = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: 'Contraseña incorrecta.' });
});

app.post('/api/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

function requireAuth(req, res, next) {
  if (req.session && req.session.auth) return next();
  return res.status(401).json({ error: 'No autenticado.' });
}

app.get('/api/me', requireAuth, (req, res) => res.json({ ok: true }));

// ---- Indicadores ----

app.get('/api/stats', requireAuth, async (req, res, next) => {
  try {
    const [totals, byStage, byType, byZone, perDay, recentEvents] = await Promise.all([
      pool.query(`
        SELECT
          (SELECT count(*) FROM crm.clients)::int                                             AS total_clients,
          (SELECT count(*) FROM crm.clients WHERE created_at > now() - interval '7 days')::int AS new_7d,
          (SELECT count(*) FROM crm.clients
             WHERE is_hot AND stage NOT IN ('cerrado','perdido'))::int                          AS hot_leads,
          (SELECT count(*) FROM crm.clients WHERE stage = 'visita')::int                        AS visits,
          (SELECT count(*) FROM crm.clients WHERE stage = 'cerrado')::int                       AS closed,
          (SELECT count(*) FROM crm.messages WHERE created_at::date = current_date)::int        AS msgs_today,
          (SELECT count(*) FROM crm.messages WHERE created_at > now() - interval '7 days')::int AS msgs_7d
      `),
      pool.query(`SELECT stage, count(*)::int AS n FROM crm.clients GROUP BY stage`),
      pool.query(`SELECT COALESCE(property_type,'sin definir') AS label, count(*)::int AS n
                  FROM crm.clients GROUP BY 1 ORDER BY n DESC`),
      pool.query(`SELECT COALESCE(zone,'sin definir') AS label, count(*)::int AS n
                  FROM crm.clients GROUP BY 1 ORDER BY n DESC LIMIT 8`),
      pool.query(`
        SELECT d::date AS day, COALESCE(m.n,0)::int AS n
        FROM generate_series(current_date - interval '13 days', current_date, '1 day') d
        LEFT JOIN (
          SELECT created_at::date AS day, count(*) AS n
          FROM crm.messages GROUP BY 1
        ) m ON m.day = d::date
        ORDER BY day
      `),
      pool.query(`
        SELECT e.id, e.type, e.detail, e.created_at, c.name, c.phone
        FROM crm.events e LEFT JOIN crm.clients c ON c.id = e.client_id
        ORDER BY e.created_at DESC LIMIT 15
      `),
    ]);

    const stageCounts = Object.fromEntries(byStage.rows.map((r) => [r.stage, r.n]));
    res.json({
      totals: totals.rows[0],
      byStage: STAGES.map((s) => ({ label: s, n: stageCounts[s] || 0 })),
      byType: byType.rows,
      byZone: byZone.rows,
      messagesPerDay: perDay.rows,
      recentEvents: recentEvents.rows,
    });
  } catch (err) {
    next(err);
  }
});

// ---- Clientes ----

app.get('/api/clients', requireAuth, async (req, res, next) => {
  try {
    const { q, stage } = req.query;
    const params = [];
    const where = [];
    if (stage && STAGES.includes(stage)) {
      params.push(stage);
      where.push(`c.stage = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      where.push(`(c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length})`);
    }
    const sql = `
      SELECT c.id, c.phone, c.name, c.stage, c.operation, c.property_type, c.zone,
             c.budget_min, c.budget_max, c.is_hot, c.bot_paused, c.last_message_at,
             (SELECT content FROM crm.messages m
               WHERE m.client_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message
      FROM crm.clients c
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
      LIMIT 200`;
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

app.get('/api/clients/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [client, messages, events] = await Promise.all([
      pool.query('SELECT * FROM crm.clients WHERE id = $1', [id]),
      pool.query(
        'SELECT id, role, content, created_at FROM crm.messages WHERE client_id = $1 ORDER BY created_at',
        [id]
      ),
      pool.query(
        'SELECT id, type, detail, created_at FROM crm.events WHERE client_id = $1 ORDER BY created_at DESC LIMIT 30',
        [id]
      ),
    ]);
    if (!client.rows.length) return res.status(404).json({ error: 'Cliente no encontrado.' });
    res.json({ ...client.rows[0], messages: messages.rows, events: events.rows });
  } catch (err) {
    next(err);
  }
});

const EDITABLE_FIELDS = [
  'name', 'stage', 'operation', 'property_type', 'zone', 'budget_min', 'budget_max',
  'payment_method', 'credit_preapproved', 'urgency', 'purpose', 'household',
  'current_situation', 'source', 'contact_pref', 'interested_property_ids',
  'is_hot', 'bot_paused', 'notes',
];

app.patch('/api/clients/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const prev = await pool.query('SELECT stage, bot_paused FROM crm.clients WHERE id = $1', [id]);
    if (!prev.rows.length) return res.status(404).json({ error: 'Cliente no encontrado.' });

    const sets = [];
    const params = [];
    for (const field of EDITABLE_FIELDS) {
      if (field in req.body) {
        if (field === 'stage' && !STAGES.includes(req.body.stage)) {
          return res.status(400).json({ error: `Etapa inválida: ${req.body.stage}` });
        }
        params.push(req.body[field] === '' ? null : req.body[field]);
        sets.push(`${field} = $${params.length}`);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar.' });
    params.push(id);
    const { rows } = await pool.query(
      `UPDATE crm.clients SET ${sets.join(', ')}, updated_at = now()
       WHERE id = $${params.length} RETURNING *`,
      params
    );

    // Bitácora de cambios relevantes
    const changes = [];
    if ('stage' in req.body && req.body.stage !== prev.rows[0].stage) {
      changes.push(['cambio_etapa', `${prev.rows[0].stage} → ${req.body.stage}`]);
    }
    if ('bot_paused' in req.body && req.body.bot_paused !== prev.rows[0].bot_paused) {
      changes.push([req.body.bot_paused ? 'bot_pausado' : 'bot_reanudado', null]);
    }
    for (const [type, detail] of changes) {
      await pool.query(
        'INSERT INTO crm.events (client_id, type, detail) VALUES ($1,$2,$3)',
        [id, type, detail]
      );
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ---- Estáticos y arranque ----

app.use(express.static(path.join(__dirname, 'public')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Dashboard Tu Llave escuchando en http://localhost:${port}`);
});
