const pool = require("../config/db");

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: "API key missing" });
    }

    const apiKey = authHeader.split(" ")[1];

    const result = await pool.query(
      "SELECT * FROM users WHERE api_key = $1",
      [apiKey]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    req.user = result.rows[0];

    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = authMiddleware;