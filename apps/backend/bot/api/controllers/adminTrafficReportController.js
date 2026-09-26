const { query } = require('../../../config/postgres');
const logger = require('../../../utils/logger');

/**
 * GET /api/webapp/admin/traffic-report
 * 14-day traffic analysis: hourly, by tier, by country, functionality,
 * trial alert, PRIME composition, funnels, weekly heatmap.
 */
const getTrafficReport = async (req, res) => {
  try {
    const toInt = (v) => { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; };
    const toFloat = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

    const [
      hourlyRows,
      tierHourlyRows,
      countryHourlyRows,
      functionalityRows,
      trialAlertRows,
      primeCompositionRows,
      dailyRegRows,
      dailyRevenueRows,
      checkoutFunnelRows,
      heatmapRows,
    ] = await Promise.all([
      // Hourly aggregate
      query(`
        SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Bogota')::int AS h,
               COUNT(*) AS cnt
        FROM user_access_logs
        WHERE created_at >= NOW() - INTERVAL '14 days'
        GROUP BY h ORDER BY h
      `),

      // By tier + hour
      query(`
        SELECT u.tier,
               EXTRACT(HOUR FROM l.created_at AT TIME ZONE 'America/Bogota')::int AS h,
               COUNT(*) AS cnt
        FROM user_access_logs l
        JOIN users u ON u.id::text = l.user_id
        WHERE l.created_at >= NOW() - INTERVAL '14 days'
          AND u.tier IN ('PRIME', 'member', 'free')
        GROUP BY u.tier, h ORDER BY u.tier, h
      `),

      // By country + hour (top 8 countries by total accesses)
      query(`
        SELECT u.country,
               EXTRACT(HOUR FROM l.created_at AT TIME ZONE 'America/Bogota')::int AS h,
               COUNT(*) AS cnt
        FROM user_access_logs l
        JOIN users u ON u.id::text = l.user_id
        WHERE l.created_at >= NOW() - INTERVAL '14 days'
          AND u.country IS NOT NULL AND u.country != ''
          AND u.country IN (
            SELECT country FROM (
              SELECT u2.country, COUNT(*) AS total
              FROM user_access_logs l2
              JOIN users u2 ON u2.id::text = l2.user_id
              WHERE l2.created_at >= NOW() - INTERVAL '14 days'
                AND u2.country IS NOT NULL AND u2.country != ''
              GROUP BY u2.country ORDER BY total DESC LIMIT 8
            ) top
          )
        GROUP BY u.country, h ORDER BY u.country, h
      `),

      // Functionality breakdown
      query(`
        SELECT
          CASE
            WHEN path LIKE '/api/main-stage/%' OR path = '/api/main-stage/state'
              OR path = '/api/main-stage/cammers' THEN 'Main Stage'
            WHEN path LIKE '/uploads/avatars/%' OR path LIKE '/uploads/%' THEN 'Avatares/Media'
            WHEN path LIKE '/api/webapp/dm/%' THEN 'DM / Mensajes'
            WHEN path LIKE '/api/webapp/hangouts/%' THEN 'Hangouts'
            WHEN path IN ('/api/auth-status','/api/telegram-auth')
              OR path LIKE '/api/webapp/auth/%' THEN 'Auth / Login'
            WHEN path LIKE '/api/webapp/analytics/%'
              OR path LIKE '/webapp/analytics/%' THEN 'Analytics internos'
            WHEN path LIKE '/api/webapp/notifications/%' THEN 'Notificaciones'
            WHEN path LIKE '/api/proxy/media/%' THEN 'Media / Radio'
            WHEN path LIKE '/api/featured-creator/%' THEN 'Featured Creator'
            WHEN path LIKE '/webapp/partner-groups/%'
              OR path LIKE '/api/webapp/partner%' THEN 'Partner Groups'
            WHEN path LIKE '/api/webapp/creator/spenders-online%' THEN 'Spenders Online'
            WHEN path LIKE '/api/webapp/ads/%' OR path LIKE '/api/ads/%' THEN 'Ads'
            WHEN path LIKE '/api/webapp/nearby/%' THEN 'Nearby'
            ELSE 'Otro'
          END AS func,
          COUNT(*) AS cnt
        FROM user_access_logs
        WHERE created_at >= NOW() - INTERVAL '14 days'
        GROUP BY func ORDER BY cnt DESC
      `),

      // Trial expiry alert
      query(`
        SELECT COUNT(*) AS expiring_7d,
               MIN(plan_expiry) AS earliest
        FROM users
        WHERE tier = 'PRIME'
          AND subscription_type = 'trial'
          AND plan_expiry >= NOW()
          AND plan_expiry <= NOW() + INTERVAL '7 days'
      `),

      // PRIME composition
      query(`
        SELECT COALESCE(subscription_type, 'unknown') AS sub_type, COUNT(*) AS cnt
        FROM users WHERE tier = 'PRIME'
        GROUP BY sub_type ORDER BY cnt DESC
      `),

      // Daily registrations (30d)
      query(`
        SELECT DATE_TRUNC('day', created_at AT TIME ZONE 'America/Bogota')::DATE AS day,
               COUNT(*) AS cnt
        FROM users
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY day ORDER BY day
      `),

      // Daily revenue (30d)
      query(`
        SELECT DATE_TRUNC('day', completed_at AT TIME ZONE 'America/Bogota')::DATE AS day,
               SUM(amount) AS total
        FROM payments
        WHERE status = 'completed'
          AND completed_at >= NOW() - INTERVAL '30 days'
        GROUP BY day ORDER BY day
      `),

      // Checkout funnel
      query(`
        SELECT COUNT(DISTINCT user_id) AS initiated,
               COUNT(DISTINCT CASE WHEN status = 'completed' THEN user_id END) AS completed
        FROM dash_subscription_orders
        WHERE created_at >= NOW() - INTERVAL '30 days'
          AND plan_id != 'token_purchase'
      `),

      // Weekly heatmap (DOW: 0=Sunday in PG)
      query(`
        SELECT
          EXTRACT(DOW FROM created_at AT TIME ZONE 'America/Bogota')::int AS dow,
          CASE
            WHEN EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Bogota') < 6  THEN 'madrugada'
            WHEN EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Bogota') < 12 THEN 'manana'
            WHEN EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Bogota') < 18 THEN 'tarde'
            ELSE 'noche'
          END AS franja,
          COUNT(*) AS cnt
        FROM user_access_logs
        WHERE created_at >= NOW() - INTERVAL '14 days'
        GROUP BY dow, franja ORDER BY dow, franja
      `),
    ]);

    const totalAccesses = hourlyRows.rows.reduce((s, r) => s + toInt(r.cnt), 0);
    const peakHour = hourlyRows.rows.reduce((best, r) =>
      toInt(r.cnt) > toInt(best.cnt) ? r : best, hourlyRows.rows[0] || { h: 0, cnt: 0 });

    // Group tier rows
    const tierMap = {};
    for (const r of tierHourlyRows.rows) {
      if (!tierMap[r.tier]) tierMap[r.tier] = [];
      tierMap[r.tier].push({ hour: toInt(r.h), cnt: toInt(r.cnt) });
    }

    // Group country rows + rank by total
    const countryTotals = {};
    const countryHours = {};
    for (const r of countryHourlyRows.rows) {
      if (!countryTotals[r.country]) { countryTotals[r.country] = 0; countryHours[r.country] = []; }
      countryTotals[r.country] += toInt(r.cnt);
      countryHours[r.country].push({ hour: toInt(r.h), cnt: toInt(r.cnt) });
    }
    const topCountries = Object.entries(countryTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([country]) => ({ country, total: countryTotals[country], hourly: countryHours[country] }));

    const alert = trialAlertRows.rows[0] || {};
    const funnel = checkoutFunnelRows.rows[0] || {};

    return res.json({
      success: true,
      report: {
        asOf: new Date().toISOString(),
        windowDays: 14,
        totalAccesses,
        peakHour: toInt(peakHour.h),
        hourly: hourlyRows.rows.map(r => ({ hour: toInt(r.h), cnt: toInt(r.cnt) })),
        byTier: Object.entries(tierMap).map(([tier, hourly]) => ({ tier, hourly })),
        byCountry: topCountries,
        functionality: functionalityRows.rows.map(r => ({ func: r.func, cnt: toInt(r.cnt) })),
        trialAlert: {
          count: toInt(alert.expiring_7d),
          earliest: alert.earliest ? String(alert.earliest) : null,
        },
        primeComposition: primeCompositionRows.rows.map(r => ({
          type: r.sub_type,
          cnt: toInt(r.cnt),
        })),
        dailyRegistrations: dailyRegRows.rows.map(r => ({
          day: String(r.day).slice(0, 10),
          cnt: toInt(r.cnt),
        })),
        dailyRevenue: dailyRevenueRows.rows.map(r => ({
          day: String(r.day).slice(0, 10),
          total: toFloat(r.total),
        })),
        checkoutFunnel: {
          initiated: toInt(funnel.initiated),
          completed: toInt(funnel.completed),
        },
        weeklyHeatmap: heatmapRows.rows.map(r => ({
          dow: toInt(r.dow),
          franja: r.franja,
          cnt: toInt(r.cnt),
        })),
      },
    });
  } catch (error) {
    logger.error('getTrafficReport error:', error);
    return res.status(500).json({ error: 'Failed to load traffic report' });
  }
};

module.exports = { getTrafficReport };
