const pool   = require('../config/db');
const AppError = require('../utils/AppError');
const getBoss  = require('../config/pgBoss');

const getDLQ = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT
         id,
         name,
         data,
         retrycount,
         retrylimit,
         createdon,
         startedon,
         completedon
       FROM pgboss.job
       WHERE state = 'failed'
         AND name  = 'webhook-delivery'
       ORDER BY completedon DESC
       LIMIT 50`
    );

    res.json({
      total:    result.rows.length,
      message:  result.rows.length === 0
                  ? 'No failed jobs — all webhooks delivered successfully'
                  : `${result.rows.length} failed job(s) waiting for replay`,
      failed_jobs: result.rows.map(job => ({
        job_id:       job.id,
        payment_id:   job.data?.payment_id,
        webhook_url:  job.data?.url,
        attempts:     job.retrycount,
        max_attempts: job.retrylimit,
        created_at:   job.createdon,
        failed_at:    job.completedon,  // ← was failedon
        payload:      job.data?.payload,
      }))
    });

  } catch (err) {
    next(err);
  }
};

const replayDLQ = async (req, res, next) => {
  try {
    const { id } = req.params;

    const jobResult = await pool.query(
      `SELECT id, name, data, state, retrycount
       FROM pgboss.job
       WHERE id = $1 AND name = 'webhook-delivery'`,
      [id]
    );

    if (jobResult.rows.length === 0) {
      return next(new AppError('Job not found in DLQ', 404));
    }

    const job = jobResult.rows[0];

    if (job.state !== 'failed') {
      return next(new AppError(
        `Job is in state '${job.state}' — only failed jobs can be replayed`,
        400
      ));
    }

    // ← ADD THIS: fetch current webhook_url from payments table
    const paymentResult = await pool.query(
      `SELECT webhook_url FROM payments WHERE id = $1`,
      [job.data.payment_id]
    );

    const currentWebhookUrl = paymentResult.rows[0]?.webhook_url;

    if (!currentWebhookUrl) {
      return next(new AppError('Payment not found for this job', 404));
    }

    const boss = await getBoss();

    // ← CHANGE THIS: spread job.data but override url with fresh one
    await boss.send('webhook-delivery', {
      ...job.data,
      url: currentWebhookUrl,
    });

    await pool.query(
      `DELETE FROM pgboss.job WHERE id = $1`,
      [id]
    );

    res.json({
      message:         'Job re-enqueued successfully',
      original_job_id: id,
      payment_id:      job.data?.payment_id,
      webhook_url:     currentWebhookUrl,  // ← show the new URL
      note:            'Worker will attempt delivery shortly. Check webhook logs for result.'
    });

  } catch (err) {
    next(err);
  }
};
const listUsers = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, api_key, webhook_secret,
              rate_limit_tier, created_at
       FROM users
       ORDER BY created_at DESC`
    );

    res.json({
      total: result.rows.length,
      users: result.rows,
    });

  } catch (err) {
    next(err);
  }
};
const getFraudRules = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT * FROM fraud_rules ORDER BY created_at ASC`
    );
    res.json({ total: result.rows.length, rules: result.rows });
  } catch (err) {
    next(err);
  }
};
const toggleFraudRule = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE fraud_rules
       SET is_active = NOT is_active
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      return next(new AppError('Rule not found', 404));
    }
    res.json({
      message: `Rule ${result.rows[0].is_active ? 'enabled' : 'disabled'}`,
      rule:    result.rows[0],
    });
  } catch (err) {
    next(err);
  }
};
const getMetrics = async (req, res, next) => {
  try {
    const [
      paymentStats,
      webhookStats,
      dlqDepth,
      recentFraud,
      auditStats,
    ] = await Promise.all([

      pool.query(`
        SELECT
          COUNT(*)                                          AS total,
          COUNT(*) FILTER (WHERE status = 'pending')        AS pending,
          COUNT(*) FILTER (WHERE status = 'success')        AS success,
          COUNT(*) FILTER (WHERE status = 'failed')         AS failed,
          COUNT(*) FILTER (WHERE status = 'flagged')        AS flagged,
          COUNT(*) FILTER (WHERE status = 'refunded')       AS refunded,
          COUNT(*) FILTER (WHERE status = 'partially_refunded') AS partially_refunded,
          ROUND(AVG(amount)::numeric, 2)                    AS avg_amount,
          ROUND(SUM(amount)::numeric, 2)                    AS total_volume,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS last_24h
        FROM payments
      `),
      pool.query(`
        SELECT
          COUNT(*)                                          AS total_attempts,
          COUNT(*) FILTER (WHERE status = 'success')        AS successful,
          COUNT(*) FILTER (WHERE status = 'failed')         AS failed,
          ROUND(
            COUNT(*) FILTER (WHERE status = 'success') * 100.0
            / NULLIF(COUNT(*), 0),
          2)                                                AS delivery_rate_pct,
          ROUND(AVG(retries)::numeric, 2)                   AS avg_retries
        FROM webhook_logs
      `),
      pool.query(`
        SELECT COUNT(*) AS depth
        FROM pgboss.job
        WHERE name  = 'webhook-delivery'
          AND state = 'failed'
      `),
      pool.query(`
        SELECT
          COUNT(*)                                          AS total_flagged,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS flagged_24h
        FROM payments
        WHERE status = 'flagged'
      `),
      pool.query(`
        SELECT
          COUNT(*)                                          AS total_transitions,
          COUNT(DISTINCT payment_id)                        AS payments_with_history,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS transitions_24h
        FROM audit_log
      `),

    ]);

    const p = paymentStats.rows[0];
    const w = webhookStats.rows[0];
    const d = dlqDepth.rows[0];
    const f = recentFraud.rows[0];
    const a = auditStats.rows[0];

    res.json({
      generated_at: new Date().toISOString(),

      payments: {
        total:               parseInt(p.total),
        by_status: {
          pending:            parseInt(p.pending),
          success:            parseInt(p.success),
          failed:             parseInt(p.failed),
          flagged:            parseInt(p.flagged),
          refunded:           parseInt(p.refunded),
          partially_refunded: parseInt(p.partially_refunded),
        },
        last_24_hours:       parseInt(p.last_24h),
        average_amount:      parseFloat(p.avg_amount) || 0,
        total_volume:        parseFloat(p.total_volume) || 0,
        success_rate_pct:    p.total > 0
          ? parseFloat(
              ((p.success / p.total) * 100).toFixed(2)
            )
          : 0,
      },

      webhooks: {
        total_attempts:     parseInt(w.total_attempts),
        successful:         parseInt(w.successful),
        failed:             parseInt(w.failed),
        delivery_rate_pct:  parseFloat(w.delivery_rate_pct) || 0,
        average_retries:    parseFloat(w.avg_retries) || 0,
        dlq_depth:          parseInt(d.depth),
      },

      fraud: {
        total_flagged:      parseInt(f.total_flagged),
        flagged_last_24h:   parseInt(f.flagged_24h),
        flag_rate_pct:      p.total > 0
          ? parseFloat(
              ((f.total_flagged / p.total) * 100).toFixed(2)
            )
          : 0,
      },

      audit: {
        total_transitions:     parseInt(a.total_transitions),
        payments_with_history: parseInt(a.payments_with_history),
        transitions_last_24h:  parseInt(a.transitions_24h),
      },

      system: {
        job_queue:   'pg-boss',
        database:    'postgresql',
        environment: process.env.NODE_ENV || 'development',
      },
    });

  } catch (err) {
    next(err);
  }
};

module.exports = { getDLQ, replayDLQ, listUsers, getFraudRules, toggleFraudRule, getMetrics };
