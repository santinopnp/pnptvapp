const { query } = require('../../../config/postgres');
const logger = require('../../../utils/logger');

/**
 * GET /api/webapp/admin/customer-research
 * Population KPIs, customer profiles, revenue by plan, feature usage, top payers.
 */
const getCustomerResearch = async (req, res) => {
  try {
    const toInt = (v) => { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; };
    const toFloat = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

    const [
      populationRows,
      revenueByPlanRows,
      topPayersRows,
      featureRows,
    ] = await Promise.all([
      // Population KPIs
      query(`
        SELECT
          COUNT(*)                                                                      AS total_users,
          COUNT(CASE WHEN last_active >= NOW() - INTERVAL '7 days'  THEN 1 END)       AS active_users,
          COUNT(CASE WHEN last_active >= NOW() - INTERVAL '30 days' THEN 1 END)       AS active_30d,
          COUNT(CASE WHEN creator_status = 'active'                 THEN 1 END)       AS creators_active,
          (SELECT COUNT(DISTINCT user_id) FROM payments WHERE status = 'completed')   AS ever_paid_users
        FROM users
      `),

      // Revenue by plan (completed payments only, group by plan_name, NULL → "Sin plan")
      query(`
        SELECT
          COALESCE(NULLIF(TRIM(plan_name), ''), 'Sin plan') AS plan,
          COUNT(*)::int                                      AS pagos,
          SUM(amount)                                        AS ingresos,
          ROUND(AVG(amount), 2)                              AS ticket_promedio
        FROM payments
        WHERE status = 'completed'
        GROUP BY plan
        ORDER BY ingresos DESC
        LIMIT 20
      `),

      // Top payers
      query(`
        SELECT
          p.user_id,
          u.username,
          COUNT(*)::int   AS pagos,
          SUM(p.amount)   AS total_gastado
        FROM payments p
        LEFT JOIN users u ON u.id::text = p.user_id
        WHERE p.status = 'completed'
        GROUP BY p.user_id, u.username
        ORDER BY total_gastado DESC
        LIMIT 10
      `),

      // Feature usage (absolute counts)
      query(`
        SELECT
          (SELECT COUNT(*) FROM payments       WHERE status = 'completed') AS completed_payments,
          (SELECT COUNT(*) FROM token_purchases)                            AS token_purchases,
          (SELECT COUNT(*) FROM social_posts)                               AS posts,
          (SELECT COUNT(*) FROM direct_messages)                            AS dms,
          (SELECT COUNT(*) FROM user_follows)                               AS follows,
          (SELECT COUNT(*) FROM hangout_groups)                             AS hangouts,
          (SELECT COUNT(*) FROM live_streams)                               AS streams,
          (SELECT COUNT(*) FROM push_subscriptions)                         AS push_subs,
          (SELECT COUNT(*) FROM social_post_likes)                          AS post_likes
      `),
    ]);

    const pop = populationRows.rows[0] || {};
    const feat = featureRows.rows[0] || {};

    const totalUsers = toInt(pop.total_users) || 1;

    // Customer profiles — segmented snapshots
    const profiles = [
      { label: 'Total registrados',   count: toInt(pop.total_users),      signal: 'base' },
      { label: 'Activos (7 d)',        count: toInt(pop.active_users),      signal: `${Math.round(toInt(pop.active_users) / totalUsers * 100)}%` },
      { label: 'Activos (30 d)',       count: toInt(pop.active_30d),        signal: `${Math.round(toInt(pop.active_30d) / totalUsers * 100)}%` },
      { label: 'Creadores activos',    count: toInt(pop.creators_active),   signal: `${Math.round(toInt(pop.creators_active) / totalUsers * 100)}%` },
      { label: 'Han pagado (alguna vez)', count: toInt(pop.ever_paid_users), signal: `${Math.round(toInt(pop.ever_paid_users) / totalUsers * 100)}%` },
    ];

    const featureUsage = [
      { label: 'Pagos completados',   count: toInt(feat.completed_payments) },
      { label: 'Compras de Ru$h',     count: toInt(feat.token_purchases) },
      { label: 'Posts publicados',    count: toInt(feat.posts) },
      { label: 'Likes en posts',      count: toInt(feat.post_likes) },
      { label: 'DMs enviados',        count: toInt(feat.dms) },
      { label: 'Follows',             count: toInt(feat.follows) },
      { label: 'Hangouts creados',    count: toInt(feat.hangouts) },
      { label: 'Streams en vivo',     count: toInt(feat.streams) },
      { label: 'Push opt-ins',        count: toInt(feat.push_subs) },
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
          plan:          r.plan,
          pagos:         toInt(r.pagos),
          ingresos:      toFloat(r.ingresos),
          ticketPromedio: toFloat(r.ticket_promedio),
        })),
        featureUsage,
        topPayers: topPayersRows.rows.map(r => ({
          userId:       r.user_id,
          username:     r.username || null,
          pagos:        toInt(r.pagos),
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
