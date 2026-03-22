const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const pool = require("../config/db");

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

const sendWebhookWithRetry = async (url, payload, paymentId, userId) => {
  let attempts = 0;

  while (attempts < 3) {
    try {
      attempts++;
      await axios.post(url, payload, { timeout: 5000 });
      console.log(`Webhook delivered on attempt ${attempts}`);

      await pool.query(
        `INSERT INTO webhook_logs (id, payment_id, user_id, payload, status, retries)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [uuidv4(), paymentId, userId, JSON.stringify(payload), "success", attempts]
      );

      return { success: true };
    } catch (error) {
      console.log(`Webhook attempt ${attempts} failed: ${err.message}`);

      if (attempts === 3) {
        await pool.query(
          `INSERT INTO webhook_logs (id, payment_id, user_id, payload, status, retries)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [uuidv4(), paymentId, userId, payload, "failed", attempts]
        );

        return { success: false };
      }

      const waitMs = 1000 * Math.pow(2, attempts);
      console.log(`Retrying in ${waitMs}ms...`);
      await delay(waitMs);
    }
  }
};

module.exports = sendWebhookWithRetry;