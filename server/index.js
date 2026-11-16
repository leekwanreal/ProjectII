const config = require('./config');
const db = require('./db/connection');
const { seedIfEmpty } = require('./db/seed');
const { createApp } = require('./app');

db.open();
seedIfEmpty();

const { server } = createApp();
server.listen(config.PORT, () => {
  console.log('==============================================================');
  console.log(' HỆ THỐNG QUẢN LÝ TRUNG TÂM LUYỆN THI NGOẠI NGỮ – PROJECT II');
  console.log(` Cổng học viên : http://localhost:${config.PORT}`);
  console.log(` Quản trị      : http://localhost:${config.PORT}/admin`);
  console.log(` CSDL SQLite   : ${config.DB_PATH}`);
  console.log('==============================================================');
});
