const axios   = require('axios');
const getBoss = require('../config/pgBoss');
const pool    = require('../config/db');
const { v4: uuidv4 } = require('uuid');

const startWebhookWorker = async () => {
  const boss = await getBoss();

  await boss.work('webhook-delivery', {
    teamSize:        5,
    teamConcurrency: 5,
  }, async (job) => {
    const { url, payload, payment_id, user_id } = job.data;
    const currentAttempt = (job.retrycount ?? 0) + 1;
    const isLastAttempt  = currentAttempt >= (job.retrylimit ?? 3);

    console.log(`Processing webhook job ${job.id} for payment ${payment_id} — attempt ${currentAttempt}`);

    try {
      await axios.post(url, payload, {
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' }
      });

      await pool.query(
        `INSERT INTO webhook_logs
         (id, payment_id, user_id, payload, status, retries)
         VALUES ($1, $2, $3, $4, 'success', $5)`,
        [uuidv4(), payment_id, user_id, JSON.stringify(payload), currentAttempt]
      );

      console.log(`Webhook delivered for payment ${payment_id} — attempt ${currentAttempt}`);

    } catch (err) {
      console.error(`Webhook attempt ${currentAttempt} failed for payment ${payment_id}: ${err.message}`);

      if (isLastAttempt) {
        await pool.query(
          `INSERT INTO webhook_logs
           (id, payment_id, user_id, payload, status, retries)
           VALUES ($1, $2, $3, $4, 'failed', $5)`,
          [uuidv4(), payment_id, user_id, JSON.stringify(payload), currentAttempt]
        );

        console.error(`All retries exhausted for payment ${payment_id} — moved to DLQ`);
      }

      throw err;
    }
  });

  console.log('Webhook worker registered and listening');
};

module.exports = startWebhookWorker;