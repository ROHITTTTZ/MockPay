const { ZodError } = require('zod');
const AppError = require('../utils/AppError');

const validate = (schema) => {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        // ZodError has both .errors and .issues depending on version
        // use whichever exists
        const issues = err.errors ?? err.issues ?? [];
        const messages = issues.map(e => {
          const path = e.path?.join('.') || 'field';
          return `${path}: ${e.message}`;
        });
        return next(new AppError(messages.join(', '), 400));
      }
      next(err);
    }
  };
};

module.exports = validate;