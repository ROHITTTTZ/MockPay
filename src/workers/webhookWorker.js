const axios   = require('axios');
const getBoss = require('../config/pgBoss');
const pool    = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { signPayload } = require('../utils/hmac'); 
const createLogger = require('../utils/createLogger');

const startWebhookWorker = async () => {
  const boss = await getBoss();

  await boss.work('webhook-delivery', {
  teamSize:        5,
  teamConcurrency: 5,
}, async (job) => {
  const { url, payload, payment_id, user_id } = job.data;
  const log = createLogger({ worker: 'webhook' });
  const MAX_RETRIES = 3;

  // Query retrycount directly from DB — v9 doesn't pass it on job object
  const jobRow = await pool.query(
    `SELECT retrycount, retrylimit, retrydelay, retrybackoff, state
     FROM pgboss.job WHERE id = $1`,
    [job.id]
  );

  const dbJob          = jobRow.rows[0];
  const retrycount     = dbJob?.retrycount ?? 0;
  const currentAttempt = retrycount + 1;
  const isLastAttempt  = currentAttempt >= MAX_RETRIES;

   log.info({
    event:    'webhook_processing',
    job_id:   job.id,
    attempt:  currentAttempt,
    url,
  }, 'Processing webhook job');

  try {
    const userResult = await pool.query(
      'SELECT webhook_secret FROM users WHERE id = $1',
      [user_id]
    );
    const webhookSecret = userResult.rows[0]?.webhook_secret;

    if (!webhookSecret) {
      throw new Error(`No webhook_secret found for user ${user_id}`);
    }

    const payloadString = JSON.stringify(payload);
    const signature     = signPayload(payloadString, webhookSecret);

    await axios.post(url, payloadString, {
      timeout: 5000,
      headers: {
        'Content-Type':        'application/json',
        'X-MockPay-Signature': `sha256=${signature}`,
      }
    });

    // Success — log and let pg-boss mark complete naturally
    await pool.query(
      `INSERT INTO webhook_logs
       (id, payment_id, user_id, payload, status, retries)
       VALUES ($1, $2, $3, $4, 'success', $5)`,
      [uuidv4(), payment_id, user_id, payloadString, currentAttempt]
    );

     log.info({
      event:   'webhook_delivered',
      attempt: currentAttempt,
    }, 'Webhook delivered successfully');

  } catch (err) {
    log.error({
      event:   'webhook_failed',
      attempt: currentAttempt,
      error:   err.message,
      url,
    }, `Webhook attempt ${currentAttempt} failed`);

    if (isLastAttempt) {
      // Final attempt — log failure, mark job failed, do NOT throw
      await pool.query(
        `INSERT INTO webhook_logs
         (id, payment_id, user_id, payload, status, retries)
         VALUES ($1, $2, $3, $4, 'failed', $5)`,
        [uuidv4(), payment_id, user_id, JSON.stringify(payload), currentAttempt]
      );

      // Manually mark job as failed in pgboss — using correct v9 column names
      await pool.query(
        `UPDATE pgboss.job
         SET state      = 'failed',
             completedon = now(),
             retrycount  = $2
         WHERE id = $1`,
        [job.id, currentAttempt]
      );

      log.error({
        event: 'webhook_exhausted',
      }, 'All retries exhausted — moved to DLQ');


      // Do NOT throw — we handled it, job is marked failed
      return;
    }

    // Not last attempt — increment retrycount manually and requeue
    await pool.query(
      `UPDATE pgboss.job
       SET retrycount = retrycount + 1,
           startafter = now() + interval '2 seconds'
       WHERE id = $1`,
      [job.id]
    );

    // Throw so pg-boss requeues the job for next attempt
    throw err;
  }
});
};

module.exports = startWebhookWorker;