const PgBoss = require('pg-boss').default ?? require('pg-boss');
const logger = require('./logger');

let boss = null;

const getBoss = async () => {
  if (boss) return boss;

  boss = new PgBoss({
    host:     process.env.DB_HOST,
    port:     process.env.DB_PORT,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,

    retryLimit:   3,        
    retryDelay:   2,        
    retryBackoff: true,      
    expireInHours: 24,        
  });

  boss.on('error', err => {
    logger.error({ event: 'pgboss_error', error: err.message }, 'pg-boss error');
  });

  await boss.start();
  logger.info({ event: 'pgboss_started' }, 'pg-boss started');

  return boss;
};

module.exports = getBoss;