const express = require("express");
const paymentRoutes = require("./routes/paymentRoutes");

require("dotenv").config();

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Server is working");
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/test-db", async (req, res) => {
  const pool = require("./config/db");

  try {
    const result = await pool.query("SELECT NOW()");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use("/api", paymentRoutes);

app.use((req, res, next) => {
  next(new AppError(`Route ${req.method} ${req.path} not found`, 404));
});

app.use((err, req, res, next) => {
  console.error({
    message: err.message,
    statusCode: err.statusCode,
    path: req.path,
    method: req.method,
    stack: err.isOperational ? undefined : err.stack,
  });

  if (err.isOperational) {
    return res.status(err.statusCode).json({
      error: err.message,
    });
  }
  res.status(500).json({
    error: "Something went wrong. Please try again.",
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});