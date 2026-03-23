const PgBoss = require('pg-boss').default ?? require('pg-boss');

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
    console.error('pg-boss error:', err.message);
  });

  await boss.start();
  console.log('pg-boss started');

  return boss;
};

module.exports = getBoss;