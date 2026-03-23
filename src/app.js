const express = require("express");
const paymentRoutes = require("./routes/paymentRoutes");
const getBoss = require('./config/pgBoss');
const AppError = require("./utils/AppError");
const startWebhookWorker = require('./workers/webhookWorker');
const authRoutes  = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');

require("dotenv").config();

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Server is working");
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
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

const startServer = async () => {
  try {
    await getBoss();       
    await startWebhookWorker(); 
    
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

startServer();