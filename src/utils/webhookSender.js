const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const pool = require("../config/db");

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

const sendWebhookWithRetry = async (url, payload, paymentId, userId) => {
  let attempts = 0;
  let success = false;

  while (attempts < 3 && !success) {
    try {
      attempts++;

      const response = await axios.post(url, payload);

      console.log(`Webhook success on attempt ${attempts}`);
      await pool.query(
        `INSERT INTO webhook_logs (id, payment_id, user_id, payload, status, retries)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [uuidv4(), paymentId, userId, payload, "success", attempts]
      );

      success = true;

      return { success: true };
    } catch (error) {
      console.log(`Attempt ${attempts} failed`);

      if (attempts === 3) {
        await pool.query(
          `INSERT INTO webhook_logs (id, payment_id, user_id, payload, status, retries)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [uuidv4(), paymentId, userId, payload, "failed", attempts]
        );

        return { success: false };
      }

      await delay(1000 * Math.pow(2, attempts)); 
    }
  }
};

module.exports = sendWebhookWithRetry;