const logger = require('../config/logger');

const createLogger = (context = {}) => {
  return logger.child(context);
};

module.exports = createLogger;