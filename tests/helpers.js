// Dựng máy chủ thử nghiệm trên CSDL tạm (mỗi file test một CSDL riêng).
const os = require('os');
const path = require('path');
const fs = require('fs');

function startTestServer(tag) {
  const dbPath = path.join(os.tmpdir(), `project2-test-${tag}-${process.pid}.sqlite`);
  for (const s of ['', '-wal', '-shm']) fs.rmSync(dbPath + s, { force: true });
  process.env.DB_PATH = dbPath;
  const db = require('../server/db/connection');
  db.open(dbPath);
  require('../server/db/seed').seed();
  const { createApp } = require('../server/app');
  const { server, io } = createApp();
  return new Promise((resolve) => {
    server.listen(0, () => {
      const base = `http://localhost:${server.address().port}`;
      const api = async (method, url, body, token) => {
        const res = await fetch(base + url, {
          method,
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
        return { status: res.status, body: await res.json() };
      };
      const stop = () => new Promise((r) => { io.close(); server.close(() => { db.close(); r(); }); });
      resolve({ base, api, db, stop });
    });
  });
}

module.exports = { startTestServer };
