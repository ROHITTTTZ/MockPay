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
module.exports = { getDLQ, replayDLQ, listUsers, getFraudRules, toggleFraudRule };