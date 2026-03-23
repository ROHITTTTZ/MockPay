const express = require("express");
const paymentRoutes = require("./routes/paymentRoutes");
const getBoss = require('./config/pgBoss');
const AppError = require("./utils/AppError");
const startWebhookWorker = require('./workers/webhookWorker');
const authRoutes  = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const pinoHttp = require('pino-http');
const logger   = require('./config/logger');
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/swagger");
const cors = require("cors");


require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"]
}));
app.use(pinoHttp({
  logger,
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400)        return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) =>
    `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, res, err) =>
    `${req.method} ${req.url} ${res.statusCode} — ${err.message}`,
  customProps: (req, res) => ({
    user_id:    req.user?.id    || null,
    request_id: req.id          || null,
  }),
  autoLogging: {
    ignore: (req) => req.url === '/health',
  },
}));

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

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
  logger.error({
    event:      'request_error',
    message:    err.message,
    statusCode: err.statusCode,
    path:       req.path,
    method:     req.method,
    user_id:    req.user?.id || null,
    stack:      err.isOperational ? undefined : err.stack,
  }, err.message);

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