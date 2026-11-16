// Chức năng 4: Chat room tư vấn (lưu trữ phiên + tin nhắn)
const crypto = require('crypto');
const db = require('../db/connection');
const { badRequest, notFound, conflict } = require('./errors');

const clean = (s, max) => String(s || '').trim().slice(0, max);

function createSession({ name, contact, topic }) {
  const guest = clean(name, 60);
  if (guest.length < 2) throw badRequest('Vui lòng nhập tên của bạn.');
  const id = crypto.randomUUID();
  db.get().prepare('INSERT INTO chat_sessions (session_id, guest_name, guest_contact, topic) VALUES (?, ?, ?, ?)')
    .run(id, guest, clean(contact, 80) || null, clean(topic, 80) || null);
  return getSession(id);
}

function getSession(id) {
  const s = db.get().prepare(`SELECT cs.*, u.full_name AS consultant_name FROM chat_sessions cs
    LEFT JOIN staff_users u ON u.user_id = cs.consultant_id WHERE cs.session_id = ?`).get(id);
  if (!s) throw notFound('Phiên chat không tồn tại.');
  return s;
}

function messages(id) {
  return db.get().prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY message_id').all(id);
}

function addMessage(sessionId, senderType, senderName, body) {
  const text = clean(body, 2000);
  if (!text) throw badRequest('Tin nhắn trống.');
  const s = getSession(sessionId);
  if (s.status === 'CLOSED') throw conflict('CLOSED', 'Phiên tư vấn đã kết thúc.');
  const info = db.get().prepare('INSERT INTO chat_messages (session_id, sender_type, sender_name, body) VALUES (?, ?, ?, ?)')
    .run(sessionId, senderType, senderName, text);
  return db.get().prepare('SELECT * FROM chat_messages WHERE message_id = ?').get(info.lastInsertRowid);
}

/** Tư vấn viên nhận phiên đang chờ (chỉ 1 người nhận được – cập nhật có điều kiện). */
function claim(sessionId, consultantId) {
  const info = db.get().prepare("UPDATE chat_sessions SET status = 'ACTIVE', consultant_id = ?, accepted_at = datetime('now','localtime') WHERE session_id = ? AND status = 'WAITING'")
    .run(consultantId, sessionId);
  if (info.changes !== 1) {
    const s = getSession(sessionId);
    if (s.consultant_id === consultantId && s.status === 'ACTIVE') return s;
    throw conflict('ALREADY_CLAIMED', 'Phiên đã được tư vấn viên khác nhận hoặc đã kết thúc.');
  }
  return getSession(sessionId);
}

function close(sessionId) {
  db.get().prepare("UPDATE chat_sessions SET status = 'CLOSED', closed_at = datetime('now','localtime') WHERE session_id = ? AND status <> 'CLOSED'").run(sessionId);
  return getSession(sessionId);
}

function listSessions(status) {
  return db.get().prepare(`
    SELECT cs.*, u.full_name AS consultant_name,
      (SELECT body FROM chat_messages m WHERE m.session_id = cs.session_id ORDER BY message_id DESC LIMIT 1) AS last_message,
      (SELECT sent_at FROM chat_messages m WHERE m.session_id = cs.session_id ORDER BY message_id DESC LIMIT 1) AS last_at,
      (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = cs.session_id) AS message_count
    FROM chat_sessions cs LEFT JOIN staff_users u ON u.user_id = cs.consultant_id
    ${status ? 'WHERE cs.status = ?' : ''}
    ORDER BY CASE cs.status WHEN 'WAITING' THEN 0 WHEN 'ACTIVE' THEN 1 ELSE 2 END, COALESCE(last_at, cs.started_at) DESC
    LIMIT 100`).all(...(status ? [status] : []));
}

module.exports = { createSession, getSession, messages, addMessage, claim, close, listSessions };
