// Kết nối SQLite (better-sqlite3: đồng bộ, hỗ trợ transaction an toàn).
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');

let db = null;

function open(dbPath = config.DB_PATH) {
  if (db) return db;
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  return db;
}

function get() {
  return db || open();
}

function close() {
  if (db) db.close();
  db = null;
}

/** Chạy fn trong 1 transaction: lỗi ở bất kỳ bước nào sẽ rollback toàn bộ. */
function tx(fn) {
  return get().transaction(fn)();
}

module.exports = { open, get, close, tx };
