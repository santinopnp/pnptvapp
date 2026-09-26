const { query } = require('../../../config/postgres');
const logger = require('../../../utils/logger');

/**
 * GET /api/webapp/admin/customer-research
 * 5 named customer profiles, revenue by plan, feature usage, top payers.
 */
const getCustomerResearch = async (req, res) => {
  try {
    const toInt = (v) => { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; };
    const toFloat = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

    const [
      populationRows,
      superSpendersRow,
      revenueByPlanRows,
      topPayersRows,
      featureRows,
    ] = await Promise.all([
      query(`
        SELECT
          COUNT(*)                                                                    AS total_users,
          COUNT(CASE WHEN last_active >= NOW() - INTERVAL '7 days'  THEN 1 END)     AS active_users,
          COUNT(CASE WHEN last_active >= NOW() - INTERVAL '30 days' THEN 1 END)     AS active_30d,
          COUNT(CASE WHEN last_active <  NOW() - INTERVAL '30 days' THEN 1 END)     AS inactive_30d,
          COUNT(CASE WHEN creator_status = 'active'                 THEN 1 END)     AS creators_active,
          (SELECT COUNT(DISTINCT user_id) FROM payments WHERE status = 'completed') AS ever_paid_users
        FROM users
      `),

      query(`
        SELECT COUNT(*) AS cnt FROM (
          SELECT user_id FROM payments WHERE status = 'completed'
          GROUP BY user_id HAVING COUNT(*) >= 2 AND SUM(amount) >= 200
        ) t
      `),

      query(`
        SELECT
          COALESCE(NULLIF(TRIM(plan_name), ''), 'Sin plan') AS plan,
          COUNT(*)::int                                      AS pagos,
          SUM(amount)                                        AS ingresos,
          ROUND(AVG(amount), 2)                             AS ticket_promedio
        FROM payments
        WHERE status = 'completed'
        GROUP BY plan
        ORDER BY ingresos DESC
        LIMIT 20
      `),

      query(`
        SELECT
          p.user_id,
          u.username,
          COUNT(*)::int  AS pagos,
          SUM(p.amount)  AS total_gastado
        FROM payments p
        LEFT JOIN users u ON u.id::text = p.user_id
        WHERE p.status = 'completed'
        GROUP BY p.user_id, u.username
        ORDER BY total_gastado DESC
        LIMIT 10
      `),

      query(`
        SELECT
          (SELECT COUNT(*) FROM hangout_group_members)              AS hangout_members,
          (SELECT COUNT(*) FROM main_stage_consents)                AS mainstage_consents,
          (SELECT COUNT(*) FROM hangout_call_participants)          AS call_participants,
          (SELECT COUNT(*) FROM pnp_tips)                          AS tips,
          (SELECT COUNT(*) FROM creator_subscriptions
            WHERE status = 'active')                               AS creator_subs_active,
          (SELECT COUNT(*) FROM channel_subscribers)               AS channel_subs,
          (SELECT COUNT(*) FROM live_streams)                      AS live_streams,
          (SELECT COUNT(*) FROM token_purchases)                   AS token_purchases
      `),
    ]);

    const pop = populationRows.rows[0] || {};
    const feat = featureRows.rows[0] || {};
    const totalUsers = toInt(pop.total_users) || 1;
    const neverPaid = toInt(pop.total_users) - toInt(pop.ever_paid_users);

    const profiles = [
      {
        key: 'explorador',
        label: 'Explorador free',
        desc: 'Se registró pero nunca pagó. Consumió Main Stage / Hangouts, no convirtió a pago.',
        count: neverPaid,
        signal: `${Math.round(neverPaid / totalUsers * 100)}%`,
      },
      {
        key: 'prime',
        label: 'Suscriptor PRIME',
        desc: 'Paga una membresía recurrente. Principal fuente de ingresos hoy.',
        count: toInt(pop.ever_paid_users),
        signal: null,
      },
      {
        key: 'whale',
        label: 'Super-spender',
        desc: 'Gasto acumulado alto, pagos repetidos ($200–$500+ acumulado, varios pagos).',
        count: toInt(superSpendersRow.rows[0]?.cnt || 0),
        signal: null,
      },
      {
        key: 'creator',
        label: 'Creador / Performer',
        desc: 'Ofrece contenido o sesiones. Depende de Live y Channels para monetizar.',
        count: toInt(pop.creators_active),
        signal: null,
      },
      {
        key: 'inactive',
        label: 'Usuario inactivo',
        desc: 'No activo en 30+ días. Candidato a encuesta de "¿por qué no volviste?".',
        count: toInt(pop.inactive_30d),
        signal: `${Math.round(toInt(pop.inactive_30d) / totalUsers * 100)}%`,
      },
    ];

    const featureUsage = [
      { label: 'Hangouts — miembros de grupos',           count: toInt(feat.hangout_members) },
      { label: 'Main Stage — consentimientos',            count: toInt(feat.mainstage_consents) },
      { label: 'Hangouts — participantes en llamadas',    count: toInt(feat.call_participants) },
      { label: 'Compras de Ru$h 💎',                      count: toInt(feat.token_purchases) },
      { label: 'Streams en vivo',                         count: toInt(feat.live_streams) },
      { label: 'PNP Live — tips enviados',                count: toInt(feat.tips) },
      { label: 'Creador — suscripciones activas',         count: toInt(feat.creator_subs_active) },
      { label: 'PNP Live — tickets de show',              count: 0 },
      { label: 'PNP Channels — suscriptores',             count: toInt(feat.channel_subs) },
    ];

    return res.json({
      success: true,
      research: {
        asOf: new Date().toISOString(),
        population: {
          totalUsers:     toInt(pop.total_users),
          activeUsers:    toInt(pop.active_users),
          active30d:      toInt(pop.active_30d),
          creatorsActive: toInt(pop.creators_active),
          everPaidUsers:  toInt(pop.ever_paid_users),
        },
        profiles,
        revenueByPlan: revenueByPlanRows.rows.map(r => ({
          plan:           r.plan,
          pagos:          toInt(r.pagos),
          ingresos:       toFloat(r.ingresos),
          ticketPromedio: toFloat(r.ticket_promedio),
        })),
        featureUsage,
        topPayers: topPayersRows.rows.map(r => ({
          userId:      r.user_id,
          username:    r.username || null,
          pagos:       toInt(r.pagos),
          totalGastado: toFloat(r.total_gastado),
        })),
      },
    });
  } catch (error) {
    logger.error('getCustomerResearch error:', error);
    return res.status(500).json({ error: 'Failed to load customer research' });
  }
};

module.exports = { getCustomerResearch };
