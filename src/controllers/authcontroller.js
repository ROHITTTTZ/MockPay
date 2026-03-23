const pool   = require('../config/db');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const AppError = require('../utils/AppError');

const register = async (req, res, next) => {
  try {
    const { name, email } = req.body;

    if (!name || !email) {
      return next(new AppError('Name and email are required', 400));
    }

    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existing.rows.length > 0) {
      return next(new AppError('Email already registered', 409));
    }

    const apiKey        = crypto.randomBytes(32).toString('hex');
    const webhookSecret = crypto.randomBytes(32).toString('hex');
    const id            = uuidv4();

    const result = await pool.query(
      `INSERT INTO users (id, name, email, api_key, webhook_secret)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, api_key, webhook_secret, created_at`,
      [id, name, email, apiKey, webhookSecret]
    );

    const user = result.rows[0];

    res.status(201).json({
      message: 'Tenant registered successfully',
      tenant_id:      user.id,
      name:           user.name,
      email:          user.email,
      api_key:        user.api_key,
      webhook_secret: user.webhook_secret,
      created_at:     user.created_at,
      instructions: {
        api_key_usage:        'Add to every request as: Authorization: Bearer <api_key>',
        webhook_secret_usage: 'Use to verify incoming webhook signatures from MockPay',
      }
    });

  } catch (err) {
    next(err);
  }
};

const me = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, api_key, webhook_secret,
              rate_limit_tier, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    const user = result.rows[0];

    res.json({
      tenant_id:      user.id,
      name:           user.name,
      email:          user.email,
      api_key:        user.api_key,
      webhook_secret: user.webhook_secret,
      rate_limit_tier: user.rate_limit_tier,
      created_at:     user.created_at,
    });

  } catch (err) {
    next(err);
  }
};

module.exports = { register, me };