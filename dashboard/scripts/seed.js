// Datos de demostración para desarrollo local: permite ver el dashboard
// funcionando sin necesidad de que n8n haya registrado conversaciones reales.
// NO ejecutar contra la base de producción una vez haya datos reales.
const pool = require('../db');

const clients = [
  {
    phone: '573001112233', name: 'Carolina Méndez', stage: 'visita',
    operation: 'venta', property_type: 'apartamento', zone: 'Cabecera, Bucaramanga',
    budget_min: 280000000, budget_max: 350000000, payment_method: 'credito',
    credit_preapproved: true, urgency: '1_3_meses', purpose: 'vivienda',
    household: 'Pareja con una hija, sin mascotas', current_situation: 'arrienda',
    source: 'Instagram', is_hot: true, interested_property_ids: '5,9',
    msgs: [
      ['cliente', 'Hola, vi un apartamento en Cabecera en su página'],
      ['bot', '¡Hola! 🏠 Claro, tenemos opciones en Cabecera. ¿Lo buscas para vivir tú o como inversión?'],
      ['cliente', 'Para vivir con mi familia, somos 3'],
      ['bot', 'Perfecto. Tenemos el apartamento ID 5 en Cabecera: 3 habitaciones, 2 baños. ¿En qué rango de precio te acomoda buscar?'],
      ['cliente', 'Hasta unos 350 millones, ya tengo crédito preaprobado con Bancolombia'],
      ['bot', '¡Excelente, eso agiliza todo! El ID 5 está en $320.000.000, encaja justo. ¿Te gustaría agendar una visita?'],
      ['cliente', 'Sí, me interesa visitarlo este fin de semana'],
      ['bot', '¡Genial, Carolina! Un asesor te contactará muy pronto para coordinar la visita. ¿En qué horario prefieres que te llame?'],
    ],
  },
  {
    phone: '573014445566', name: 'Andrés Rueda', stage: 'calificado',
    operation: 'arriendo', property_type: 'apartaestudio', zone: 'Piedecuesta',
    budget_min: 800000, budget_max: 1200000, payment_method: 'recursos_propios',
    urgency: 'inmediata', purpose: 'vivienda', household: 'Solo, estudiante',
    source: 'Google', is_hot: false,
    msgs: [
      ['cliente', 'Buenas, busco apartaestudio en arriendo en Piedecuesta'],
      ['bot', '¡Hola! Con gusto te ayudo 🔑 ¿Para cuándo lo necesitas?'],
      ['cliente', 'Lo antes posible, empiezo universidad en febrero'],
      ['bot', 'Tenemos el apartaestudio ID 11 en Piedecuesta por $950.000/mes. ¿Ese rango te funciona?'],
      ['cliente', 'Sí, me sirve. ¿Qué incluye?'],
    ],
  },
  {
    phone: '573029998877', name: null, stage: 'nuevo',
    operation: 'venta', property_type: 'lote', zone: 'Curití',
    is_hot: false,
    msgs: [
      ['cliente', '¿Tienen lotes en Curití?'],
      ['bot', '¡Hola! Sí, tenemos lotes en Curití 🏞️ ¿Lo buscas para construir vivienda o como inversión?'],
    ],
  },
  {
    phone: '573156667788', name: 'Marcela Ortiz', stage: 'negociacion',
    operation: 'arriendo', property_type: 'oficina', zone: 'Centro, Bucaramanga',
    budget_min: 1500000, budget_max: 2500000, payment_method: 'recursos_propios',
    urgency: '1_3_meses', purpose: 'inversion', source: 'Referido',
    is_hot: true, bot_paused: true, interested_property_ids: '12',
    notes: 'Negociando canon de la oficina ID 12. Atiende Juan directamente.',
    msgs: [
      ['cliente', 'Necesito una oficina para mi empresa en el centro'],
      ['bot', '¡Hola! Tenemos la oficina ID 12 en el centro de Bucaramanga. ¿Qué área necesitas aproximadamente?'],
      ['cliente', 'Unos 60m2, ¿cuál es el canon?'],
      ['bot', 'El canon publicado es $2.100.000/mes. ¿Te gustaría que un asesor te muestre el espacio?'],
      ['cliente', 'Sí, y quisiera negociar el precio'],
      ['asesor', 'Hola Marcela, soy Juan de Tu Llave. Con gusto coordinamos la visita y hablamos del canon.'],
    ],
  },
  {
    phone: '573187774411', name: 'Felipe Castro', stage: 'perdido',
    operation: 'venta', property_type: 'casa', zone: 'Floridablanca',
    budget_min: 200000000, budget_max: 250000000, urgency: 'explorando',
    source: 'Facebook', is_hot: false,
    notes: 'Buscaba en Floridablanca, no tenemos inventario en esa zona.',
    msgs: [
      ['cliente', '¿Tienen casas en Floridablanca?'],
      ['bot', 'Por ahora nuestro inventario está en Bucaramanga, Piedecuesta y Curití. ¿Te interesaría alguna de esas zonas?'],
      ['cliente', 'No, necesito Floridablanca por el trabajo. Gracias'],
    ],
  },
];

async function main() {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM crm.clients');
  if (rows[0].n > 0) {
    console.log(`La base ya tiene ${rows[0].n} clientes; no se insertan datos demo.`);
    await pool.end();
    return;
  }

  for (const c of clients) {
    const res = await pool.query(
      `INSERT INTO crm.clients
        (phone, name, stage, operation, property_type, zone, budget_min, budget_max,
         payment_method, credit_preapproved, urgency, purpose, household,
         current_situation, source, interested_property_ids, is_hot, bot_paused, notes,
         created_at, last_message_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
               now() - interval '6 days', now() - random() * interval '3 days')
       RETURNING id`,
      [c.phone, c.name, c.stage, c.operation, c.property_type, c.zone,
       c.budget_min ?? null, c.budget_max ?? null, c.payment_method ?? null,
       c.credit_preapproved ?? null, c.urgency ?? null, c.purpose ?? null,
       c.household ?? null, c.current_situation ?? null, c.source ?? null,
       c.interested_property_ids ?? null, c.is_hot ?? false, c.bot_paused ?? false,
       c.notes ?? null]
    );
    const clientId = res.rows[0].id;
    let minutes = c.msgs.length * 7;
    for (const [role, content] of c.msgs) {
      await pool.query(
        `INSERT INTO crm.messages (client_id, role, content, created_at)
         VALUES ($1,$2,$3, now() - $4 * interval '1 minute' - interval '1 day')`,
        [clientId, role, content, minutes]
      );
      minutes -= 7;
    }
    if (c.is_hot) {
      await pool.query(
        `INSERT INTO crm.events (client_id, type, detail)
         VALUES ($1, 'lead_caliente', 'El cliente mostró intención real (visita/negociación)')`,
        [clientId]
      );
    }
  }
  console.log(`Insertados ${clients.length} clientes de demostración con sus conversaciones.`);
  await pool.end();
}

main().catch((err) => {
  console.error('Error insertando datos demo:', err.message);
  process.exit(1);
});
