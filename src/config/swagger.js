const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "MockPay API",
      version: "1.0.0",
      description: `
A production-grade payment simulation API inspired by Stripe and Razorpay.

Features:
- Idempotent payments using Postgres advisory locks
- Async webhook delivery with pg-boss
- Fraud detection engine
- Immutable audit logs (WORM pattern)
`,
      contact: {
        name: "Rohith Pradeep",
        email: "rohithpradeep001@gmail.com",
      },
    },
    servers: [
      {
        url: "https://mockpay-mj7g.onrender.com",
      },
    ],
    tags: [
      { name: "Auth", description: "Authentication APIs" },
      { name: "Payments", description: "Payment operations" },
      { name: "Admin", description: "Admin controls & monitoring" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "API Key",
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ["./src/routes/*.js"],
};

module.exports = swaggerJsdoc(options);