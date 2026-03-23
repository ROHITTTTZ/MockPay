const rateLimit        = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const AppError         = require('../utils/AppError');

const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      100,
  keyGenerator: (req) => {
    if (req.user?.id) return req.user.id;
    return ipKeyGenerator(req);  
  },

  handler: (req, res, next, options) => {
    next(new AppError(
      `Too many requests. You have exceeded ${options.max} requests per ${options.windowMs / 60000} minutes. Please slow down.`,
      429
    ));
  },

  standardHeaders: true,
  legacyHeaders:   false,
  skipSuccessfulRequests: false,
});

module.exports = rateLimiter;