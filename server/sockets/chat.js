// Socket.IO – phòng chat tư vấn thời gian thực (Chức năng 4)
const chat = require('../services/chat');
const { verifyToken } = require('../services/auth');

const STAFF_ROOM = 'consultants';
const room = (id) => `session:${id}`;

function initChat(io) {
  const broadcastQueue = () => io.to(STAFF_ROOM).emit('queue:update', chat.listSessions());

  io.on('connection', (socket) => {
    const staff = verifyToken(socket.handshake.auth && socket.handshake.auth.token);
    if (staff) socket.join(STAFF_ROOM);

    // Bọc handler: lỗi nghiệp vụ trả về qua ack thay vì làm sập kết nối
    const on = (event, fn) => socket.on(event, (payload = {}, ack) => {
      try {
        const out = fn(payload || {});
        if (typeof ack === 'function') ack({ ok: true, ...(out || {}) });
      } catch (e) {
        if (typeof ack === 'function') ack({ ok: false, error: e.message, code: e.code });
      }
    });

    // ---------- Phía khách / học viên
    on('chat:start', ({ name, contact, topic }) => {
      const session = chat.createSession({ name, contact, topic });
      socket.data.sessionId = session.session_id;
      socket.join(room(session.session_id));
      const welcome = chat.addMessage(session.session_id, 'SYSTEM', 'Hệ thống', `Xin chào ${session.guest_name}! Yêu cầu tư vấn của bạn đã được gửi, tư vấn viên sẽ phản hồi trong giây lát.`);
      io.to(room(session.session_id)).emit('chat:message', welcome);
      broadcastQueue();
      return { session };
    });

    on('chat:resume', ({ sessionId }) => {
      const session = chat.getSession(sessionId);
      if (!staff) socket.data.sessionId = session.session_id;
      socket.join(room(session.session_id));
      return { session, messages: chat.messages(session.session_id) };
    });

    on('chat:message', ({ sessionId, body }) => {
      let msg;
      if (staff) {
        const s = chat.getSession(sessionId);
        if (s.consultant_id !== staff.uid) throw new Error('Bạn cần nhận phiên trước khi trả lời.');
        msg = chat.addMessage(sessionId, 'CONSULTANT', staff.name, body);
      } else {
        if (socket.data.sessionId !== sessionId) throw new Error('Phiên chat không hợp lệ.');
        const s = chat.getSession(sessionId);
        msg = chat.addMessage(sessionId, 'STUDENT', s.guest_name, body);
      }
      io.to(room(sessionId)).emit('chat:message', msg);
      broadcastQueue();
      return { message: msg };
    });

    on('chat:typing', ({ sessionId, typing }) => {
      if (!staff && socket.data.sessionId !== sessionId) return;
      socket.to(room(sessionId)).emit('chat:typing', { from: staff ? 'CONSULTANT' : 'STUDENT', typing: !!typing });
    });

    on('chat:close', ({ sessionId }) => {
      if (!staff && socket.data.sessionId !== sessionId) throw new Error('Phiên chat không hợp lệ.');
      const s0 = chat.getSession(sessionId);
      if (s0.status !== 'CLOSED') {
        const msg = chat.addMessage(sessionId, 'SYSTEM', 'Hệ thống', staff ? `Tư vấn viên ${staff.name} đã kết thúc phiên tư vấn. Cảm ơn bạn!` : 'Khách đã kết thúc phiên tư vấn.');
        io.to(room(sessionId)).emit('chat:message', msg);
      }
      const session = chat.close(sessionId);
      io.to(room(sessionId)).emit('chat:closed', session);
      broadcastQueue();
      return { session };
    });

    // ---------- Phía tư vấn viên
    on('chat:claim', ({ sessionId }) => {
      if (!staff || !['CONSULTANT', 'DIRECTOR'].includes(staff.role)) throw new Error('Chỉ tư vấn viên mới nhận được phiên tư vấn.');
      const before = chat.getSession(sessionId);
      const session = chat.claim(sessionId, staff.uid);
      socket.join(room(sessionId));
      if (before.status === 'WAITING') {
        const msg = chat.addMessage(sessionId, 'SYSTEM', 'Hệ thống', `Tư vấn viên ${staff.name} đã tham gia cuộc trò chuyện.`);
        io.to(room(sessionId)).emit('chat:message', msg);
        io.to(room(sessionId)).emit('chat:claimed', session);
      }
      broadcastQueue();
      return { session, messages: chat.messages(sessionId) };
    });

    on('queue:get', () => {
      if (!staff) throw new Error('Không có quyền.');
      return { sessions: chat.listSessions() };
    });
  });
}

module.exports = { initChat };
