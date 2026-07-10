/* Dashboard Tu Llave — lógica de la interfaz (sin frameworks) */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const STAGES = ['nuevo', 'calificado', 'visita', 'negociacion', 'cerrado', 'perdido'];
const STAGE_LABELS = {
  nuevo: 'Nuevo', calificado: 'Calificado', visita: 'Visita agendada',
  negociacion: 'Negociación', cerrado: 'Cerrado', perdido: 'Perdido',
};
const EVENT_LABELS = {
  lead_caliente: '🔥 Lead caliente',
  cambio_etapa: 'Cambio de etapa',
  bot_pausado: '⏸️ Bot pausado',
  bot_reanudado: '▶️ Bot reanudado',
  nota: 'Nota',
};

let currentClientId = null;
let clientsCache = [];

// ---------- API ----------

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 401) {
    showLogin();
    throw new Error('No autenticado');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error de servidor');
  return data;
}

// ---------- Login ----------

function showLogin() {
  $('#login-view').classList.remove('hidden');
  $('#app-view').classList.add('hidden');
}
function showApp() {
  $('#login-view').classList.add('hidden');
  $('#app-view').classList.remove('hidden');
  loadStats();
  loadClients();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#login-error');
  err.classList.add('hidden');
  try {
    await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ password: $('#login-password').value }),
    });
    $('#login-password').value = '';
    showApp();
  } catch (ex) {
    err.textContent = ex.message;
    err.classList.remove('hidden');
  }
});

$('#logout-btn').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  showLogin();
});

// ---------- Navegación ----------

$$('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    $$('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    $$('.view').forEach((v) => v.classList.add('hidden'));
    $(`#view-${tab.dataset.view}`).classList.remove('hidden');
    if (tab.dataset.view === 'indicadores') loadStats();
    if (tab.dataset.view === 'chats') loadClients();
    if (tab.dataset.view === 'embudo') loadKanban();
  });
});

// ---------- Utilidades ----------

function fmtMoney(n) {
  if (n == null) return null;
  return '$' + Number(n).toLocaleString('es-CO');
}
function fmtWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) +
    ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}
function esc(s) {
  const div = document.createElement('div');
  div.textContent = s == null ? '' : String(s);
  return div.innerHTML;
}

const tooltip = $('#tooltip');
function showTooltip(html, x, y) {
  tooltip.innerHTML = html;
  tooltip.classList.remove('hidden');
  const pad = 12;
  const rect = tooltip.getBoundingClientRect();
  let left = x + pad;
  if (left + rect.width > window.innerWidth - 8) left = x - rect.width - pad;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${Math.max(8, y - rect.height - pad)}px`;
}
function hideTooltip() { tooltip.classList.add('hidden'); }

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ---------- Indicadores ----------

async function loadStats() {
  let s;
  try { s = await api('/api/stats'); } catch { return; }

  const t = s.totals;
  $('#kpi-row').innerHTML = [
    tile('Leads totales', t.total_clients, t.new_7d ? `+${t.new_7d} esta semana` : null),
    tile('Leads calientes', t.hot_leads, null, t.hot_leads > 0),
    tile('Visitas agendadas', t.visits),
    tile('Negocios cerrados', t.closed),
    tile('Mensajes hoy', t.msgs_today, `${t.msgs_7d} en 7 días`),
  ].join('');

  lineChart($('#chart-messages'),
    s.messagesPerDay.map((r) => ({ x: r.day, y: r.n })),
    { yLabel: 'mensajes' });

  hBars($('#chart-stages'),
    s.byStage.map((r) => ({ label: STAGE_LABELS[r.label] || r.label, value: r.n })));

  hBars($('#chart-types'),
    s.byType.map((r) => ({ label: r.label, value: r.n })));

  $('#events-feed').innerHTML = s.recentEvents.length
    ? s.recentEvents.map((e) => `
        <li>
          <span class="when">${fmtWhen(e.created_at)}</span>
          <span><strong>${esc(EVENT_LABELS[e.type] || e.type)}</strong>
            — ${esc(e.name || e.phone || '')}
            ${e.detail ? `<span class="muted">· ${esc(e.detail)}</span>` : ''}</span>
        </li>`).join('')
    : '<li class="muted">Sin actividad todavía.</li>';
}

function tile(label, value, delta, hot) {
  return `<div class="stat-tile">
    <div class="label">${esc(label)} ${hot ? '🔥' : ''}</div>
    <div class="value">${value}</div>
    ${delta ? `<div class="delta up">${esc(delta)}</div>` : ''}
  </div>`;
}

/* Gráfico de línea (serie única) con crosshair + tooltip */
function lineChart(el, points, opts = {}) {
  el.innerHTML = '';
  if (!points.length) { el.innerHTML = '<p class="muted">Sin datos.</p>'; return; }

  const W = el.clientWidth || 480, H = 220;
  const m = { top: 12, right: 16, bottom: 26, left: 34 };
  const iw = W - m.left - m.right, ih = H - m.top - m.bottom;
  const maxY = Math.max(1, ...points.map((p) => p.y));
  const yMax = niceCeil(maxY);
  const xs = (i) => m.left + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const ys = (v) => m.top + ih - (v / yMax) * ih;

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('height', H);

  // Gridlines horizontales (hairline)
  const ticks = [0, yMax / 2, yMax];
  for (const tv of ticks) {
    const line = mk('line', { x1: m.left, x2: W - m.right, y1: ys(tv), y2: ys(tv), stroke: cssVar('--grid'), 'stroke-width': 1 });
    svg.appendChild(line);
    svg.appendChild(mk('text', { x: m.left - 6, y: ys(tv) + 4, 'text-anchor': 'end', 'font-size': 11, fill: cssVar('--muted') }, String(Math.round(tv))));
  }

  // Etiquetas X (primera, media, última; extremos anclados hacia adentro)
  [0, Math.floor(points.length / 2), points.length - 1].forEach((i) => {
    const d = new Date(points[i].x);
    const anchor = i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle';
    svg.appendChild(mk('text', {
      x: xs(i), y: H - 8, 'text-anchor': anchor, 'font-size': 11, fill: cssVar('--muted'),
    }, d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })));
  });

  // Área (10%) + línea 2px
  const color = cssVar('--series-1');
  const pathD = points.map((p, i) => `${i ? 'L' : 'M'}${xs(i)},${ys(p.y)}`).join('');
  svg.appendChild(mk('path', {
    d: `${pathD}L${xs(points.length - 1)},${ys(0)}L${xs(0)},${ys(0)}Z`,
    fill: color, opacity: 0.1,
  }));
  svg.appendChild(mk('path', {
    d: pathD, fill: 'none', stroke: color, 'stroke-width': 2,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }));

  // Marcador del último punto (≥8px con anillo de superficie)
  const last = points.length - 1;
  svg.appendChild(mk('circle', { cx: xs(last), cy: ys(points[last].y), r: 6, fill: cssVar('--surface-1') }));
  svg.appendChild(mk('circle', { cx: xs(last), cy: ys(points[last].y), r: 4, fill: color }));
  svg.appendChild(mk('text', {
    x: xs(last) - 8, y: ys(points[last].y) - 10, 'text-anchor': 'end',
    'font-size': 11, 'font-weight': 600, fill: cssVar('--text-primary'),
  }, String(points[last].y)));

  // Crosshair + tooltip
  const cross = mk('line', { y1: m.top, y2: m.top + ih, stroke: cssVar('--baseline'), 'stroke-width': 1, visibility: 'hidden' });
  const dot = mk('circle', { r: 4, fill: color, stroke: cssVar('--surface-1'), 'stroke-width': 2, visibility: 'hidden' });
  svg.appendChild(cross);
  svg.appendChild(dot);
  svg.addEventListener('mousemove', (ev) => {
    const rect = svg.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(points.length - 1,
      Math.round(((px - m.left) / iw) * (points.length - 1))));
    cross.setAttribute('x1', xs(i)); cross.setAttribute('x2', xs(i));
    cross.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', xs(i)); dot.setAttribute('cy', ys(points[i].y));
    dot.setAttribute('visibility', 'visible');
    const d = new Date(points[i].x);
    showTooltip(
      `<span class="t-label">${d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}</span><br><strong>${points[i].y}</strong> mensajes`,
      ev.clientX, ev.clientY);
  });
  svg.addEventListener('mouseleave', () => {
    cross.setAttribute('visibility', 'hidden');
    dot.setAttribute('visibility', 'hidden');
    hideTooltip();
  });

  el.appendChild(svg);
}

/* Barras horizontales (hue único, extremo redondeado 4px, valor en la punta) */
function hBars(el, items) {
  el.innerHTML = '';
  if (!items.length) { el.innerHTML = '<p class="muted">Sin datos.</p>'; return; }

  const W = el.clientWidth || 480;
  const barH = 20, gap = 10, labelW = 130, valueW = 34;
  const m = { top: 6, right: valueW, left: labelW };
  const H = m.top + items.length * (barH + gap);
  const iw = W - m.left - m.right;
  const maxV = Math.max(1, ...items.map((d) => d.value));

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('height', H);
  const color = cssVar('--series-1');

  // Eje base (hairline)
  svg.appendChild(mk('line', { x1: m.left, x2: m.left, y1: 0, y2: H, stroke: cssVar('--baseline'), 'stroke-width': 1 }));

  items.forEach((d, i) => {
    const y = m.top + i * (barH + gap);
    const w = Math.max(2, (d.value / maxV) * iw);
    const r = Math.min(4, w / 2);
    // Rectángulo con solo el extremo derecho redondeado (base cuadrada)
    const path = mk('path', {
      d: `M${m.left},${y} h${w - r} a${r},${r} 0 0 1 ${r},${r} v${barH - 2 * r} a${r},${r} 0 0 1 -${r},${r} h-${w - r} Z`,
      fill: color,
    });
    path.addEventListener('mousemove', (ev) =>
      showTooltip(`<span class="t-label">${esc(d.label)}</span><br><strong>${d.value}</strong>`, ev.clientX, ev.clientY));
    path.addEventListener('mouseleave', hideTooltip);
    svg.appendChild(path);

    svg.appendChild(mk('text', {
      x: m.left - 8, y: y + barH / 2 + 4, 'text-anchor': 'end',
      'font-size': 12, fill: cssVar('--text-secondary'),
    }, truncate(d.label, 18)));
    svg.appendChild(mk('text', {
      x: m.left + w + 6, y: y + barH / 2 + 4,
      'font-size': 12, 'font-weight': 600, fill: cssVar('--text-primary'),
    }, String(d.value)));
  });

  el.appendChild(svg);
}

function mk(tag, attrs, text) {
  const elx = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) elx.setAttribute(k, v);
  if (text != null) elx.textContent = text;
  return elx;
}
function niceCeil(v) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const mult of [1, 2, 5, 10]) if (v <= mult * p) return mult * p;
  return 10 * p;
}
function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

// ---------- Chats ----------

async function loadClients(q = '') {
  try {
    clientsCache = await api('/api/clients' + (q ? `?q=${encodeURIComponent(q)}` : ''));
  } catch { return; }
  const list = $('#chat-list');
  list.innerHTML = clientsCache.length ? '' : '<li class="muted" style="padding:14px">Sin conversaciones aún.</li>';
  for (const c of clientsCache) {
    const li = document.createElement('li');
    li.dataset.id = c.id;
    if (c.id === currentClientId) li.classList.add('active');
    li.innerHTML = `
      <div class="row1">
        <span class="who">${esc(c.name || c.phone)}</span>
        <span>
          ${c.is_hot ? '<span class="badge hot">🔥 caliente</span>' : ''}
          ${c.bot_paused ? '<span class="badge paused">⏸ bot pausado</span>' : ''}
          <span class="badge">${esc(STAGE_LABELS[c.stage] || c.stage)}</span>
        </span>
      </div>
      <div class="preview">${esc(c.last_message || '')}</div>`;
    li.addEventListener('click', () => openChat(c.id));
    list.appendChild(li);
  }
}

let searchTimer;
$('#chat-search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadClients(e.target.value.trim()), 250);
});

async function openChat(id) {
  currentClientId = id;
  $$('#chat-list li').forEach((li) => li.classList.toggle('active', Number(li.dataset.id) === id));
  let c;
  try { c = await api(`/api/clients/${id}`); } catch { return; }

  $('#chat-empty').classList.add('hidden');
  $('#chat-detail').classList.remove('hidden');
  $('#chat-client-name').textContent = c.name || 'Sin nombre';
  $('#chat-client-phone').textContent = c.phone;
  $('#bot-pause-toggle').checked = !c.bot_paused;
  $('.switch-label').textContent = c.bot_paused ? 'Bot pausado' : 'Bot activo';

  const sel = $('#chat-stage-select');
  sel.innerHTML = STAGES.map((s) =>
    `<option value="${s}" ${s === c.stage ? 'selected' : ''}>${STAGE_LABELS[s]}</option>`).join('');

  const box = $('#chat-messages');
  box.innerHTML = c.messages.map((mm) => `
    <div class="msg ${mm.role}">
      ${esc(mm.content)}
      <div class="meta">${mm.role === 'cliente' ? '' : mm.role + ' · '}${fmtWhen(mm.created_at)}</div>
    </div>`).join('') || '<p class="muted">Sin mensajes.</p>';
  box.scrollTop = box.scrollHeight;
}

$('#bot-pause-toggle').addEventListener('change', async (e) => {
  if (!currentClientId) return;
  const paused = !e.target.checked;
  await api(`/api/clients/${currentClientId}`, {
    method: 'PATCH', body: JSON.stringify({ bot_paused: paused }),
  });
  $('.switch-label').textContent = paused ? 'Bot pausado' : 'Bot activo';
  loadClients($('#chat-search').value.trim());
});

$('#chat-stage-select').addEventListener('change', async (e) => {
  if (!currentClientId) return;
  await api(`/api/clients/${currentClientId}`, {
    method: 'PATCH', body: JSON.stringify({ stage: e.target.value }),
  });
  loadClients($('#chat-search').value.trim());
});

$('#open-ficha-btn').addEventListener('click', () => {
  if (currentClientId) openFicha(currentClientId);
});

// ---------- Kanban ----------

async function loadKanban() {
  let clients;
  try { clients = await api('/api/clients'); } catch { return; }
  const board = $('#kanban');
  board.innerHTML = '';
  for (const stage of STAGES) {
    const col = document.createElement('div');
    col.className = 'kanban-col';
    col.dataset.stage = stage;
    const inStage = clients.filter((c) => c.stage === stage);
    col.innerHTML = `<h3>${STAGE_LABELS[stage]} <span>${inStage.length}</span></h3>`;
    for (const c of inStage) {
      const card = document.createElement('div');
      card.className = 'kanban-card';
      card.draggable = true;
      card.dataset.id = c.id;
      const budget = c.budget_max ? fmtMoney(c.budget_max) : null;
      card.innerHTML = `
        <div class="kc-name"><span>${esc(c.name || c.phone)}</span>${c.is_hot ? '🔥' : ''}</div>
        <div class="kc-info">${esc([c.operation, c.property_type, c.zone].filter(Boolean).join(' · ')) || '<span class="muted">sin calificar</span>'}</div>
        ${budget ? `<div class="kc-info">Hasta ${budget}</div>` : ''}`;
      card.addEventListener('dragstart', (ev) => ev.dataTransfer.setData('text/plain', c.id));
      card.addEventListener('click', () => openFicha(c.id));
      col.appendChild(card);
    }
    col.addEventListener('dragover', (ev) => { ev.preventDefault(); col.classList.add('drag-over'); });
    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
    col.addEventListener('drop', async (ev) => {
      ev.preventDefault();
      col.classList.remove('drag-over');
      const id = Number(ev.dataTransfer.getData('text/plain'));
      await api(`/api/clients/${id}`, {
        method: 'PATCH', body: JSON.stringify({ stage }),
      });
      loadKanban();
    });
    board.appendChild(col);
  }
}

// ---------- Ficha ----------

async function openFicha(id) {
  let c;
  try { c = await api(`/api/clients/${id}`); } catch { return; }
  const form = $('#ficha-form');
  form.dataset.id = id;

  const stageSel = form.elements.stage;
  stageSel.innerHTML = STAGES.map((s) =>
    `<option value="${s}">${STAGE_LABELS[s]}</option>`).join('');

  for (const field of form.elements) {
    if (!field.name) continue;
    if (field.type === 'checkbox') field.checked = Boolean(c[field.name]);
    else if (field.name === 'credit_preapproved') field.value = c[field.name] == null ? '' : String(c[field.name]);
    else field.value = c[field.name] ?? '';
  }

  $('#ficha-events-list').innerHTML = c.events.length
    ? c.events.map((e) => `
        <li><span class="when">${fmtWhen(e.created_at)}</span>
          <span>${esc(EVENT_LABELS[e.type] || e.type)}${e.detail ? ` — ${esc(e.detail)}` : ''}</span></li>`).join('')
    : '<li class="muted">Sin eventos.</li>';

  $('#ficha-status').textContent = '';
  $('#ficha-overlay').classList.remove('hidden');
}

$('#ficha-close').addEventListener('click', () => $('#ficha-overlay').classList.add('hidden'));
$('#ficha-overlay').addEventListener('click', (e) => {
  if (e.target === $('#ficha-overlay')) $('#ficha-overlay').classList.add('hidden');
});

$('#ficha-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const id = Number(form.dataset.id);
  const body = {};
  for (const field of form.elements) {
    if (!field.name || field.disabled || field.type === 'submit') continue;
    if (field.type === 'checkbox') body[field.name] = field.checked;
    else if (field.name === 'credit_preapproved') body[field.name] = field.value === '' ? null : field.value === 'true';
    else body[field.name] = field.value;
  }
  try {
    await api(`/api/clients/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    $('#ficha-status').textContent = 'Guardado ✓';
    loadClients($('#chat-search').value.trim());
    if (!$('#view-embudo').classList.contains('hidden')) loadKanban();
    if (currentClientId === id) openChat(id);
  } catch (ex) {
    $('#ficha-status').textContent = 'Error: ' + ex.message;
  }
});

// ---------- Arranque ----------

(async function init() {
  try {
    await api('/api/me');
    showApp();
  } catch {
    showLogin();
  }
})();
