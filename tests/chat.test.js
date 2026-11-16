// Kiểm thử chat room realtime 2 chiều (Socket.IO) + lưu trữ CSDL.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const { startTestServer } = require('./helpers');

let t; let guest; let staff; let staff2;
const emit = (sock, ev, payload) => new Promise((res) => sock.emit(ev, payload, res));
const once = (sock, ev) => new Promise((res) => sock.once(ev, res));

before(async () => {
  t = await startTestServer('chat');
  const login = async (u) => (await t.api('POST', '/api/auth/login', { username: u, password: '123456' })).body.token;
  staff = connect(t.base, { auth: { token: await login('tuvan1') }, transports: ['websocket'] });
  staff2 = connect(t.base, { auth: { token: await login('tuvan2') }, transports: ['websocket'] });
  guest = connect(t.base, { transports: ['websocket'] });
  await Promise.all([once(staff, 'connect'), once(staff2, 'connect'), once(guest, 'connect')]);
});
after(async () => { guest.close(); staff.close(); staff2.close(); await t.stop(); });

let sessionId;

test('Khách mở phiên → WAITING, tư vấn viên nhận thông báo hàng đợi', async () => {
  const queued = once(staff, 'queue:update');
  const r = await emit(guest, 'chat:start', { name: 'Khách Kiểm Thử', contact: '0912000111', topic: 'IELTS' });
  assert.equal(r.ok, true);
  assert.equal(r.session.status, 'WAITING');
  sessionId = r.session.session_id;
  const q = await queued;
  assert.ok(q.some((s) => s.session_id === sessionId && s.status === 'WAITING'));
});

test('Tư vấn viên chưa nhận phiên thì không trả lời được', async () => {
  const r = await emit(staff, 'chat:message', { sessionId, body: 'Xin chào' });
  assert.equal(r.ok, false);
});

test('Tư vấn viên 1 nhận phiên → ACTIVE; tư vấn viên 2 nhận lại bị từ chối', async () => {
  const sys = once(guest, 'chat:claimed');
  const r = await emit(staff, 'chat:claim', { sessionId });
  assert.equal(r.ok, true);
  assert.equal(r.session.status, 'ACTIVE');
  await sys;
  const r2 = await emit(staff2, 'chat:claim', { sessionId });
  assert.equal(r2.ok, false);
});

test('Trao đổi 2 chiều realtime', async () => {
  const toStaff = once(staff, 'chat:message');
  await emit(guest, 'chat:message', { sessionId, body: 'Lớp IELTS tối còn chỗ không ạ?' });
  assert.equal((await toStaff).body, 'Lớp IELTS tối còn chỗ không ạ?');
  const toGuest = once(guest, 'chat:message');
  await emit(staff, 'chat:message', { sessionId, body: 'Còn 6 chỗ bạn nhé.' });
  const m = await toGuest;
  assert.equal(m.sender_type, 'CONSULTANT');
  assert.equal(m.body, 'Còn 6 chỗ bạn nhé.');
});

test('Socket lạ không gửi tin vào phiên của người khác được', async () => {
  const intruder = connect(t.base, { transports: ['websocket'] });
  await once(intruder, 'connect');
  const r = await emit(intruder, 'chat:message', { sessionId, body: 'spam' });
  intruder.close();
  assert.equal(r.ok, false);
});

test('Khôi phục phiên sau khi tải lại trang → nhận đủ lịch sử', async () => {
  const again = connect(t.base, { transports: ['websocket'] });
  await once(again, 'connect');
  const r = await emit(again, 'chat:resume', { sessionId });
  again.close();
  assert.equal(r.ok, true);
  assert.ok(r.messages.filter((m) => m.sender_type !== 'SYSTEM').length >= 2);
});

test('Kết thúc phiên → CLOSED, tin nhắn đã lưu CSDL, không gửi thêm được', async () => {
  const closed = once(guest, 'chat:closed');
  await emit(staff, 'chat:close', { sessionId });
  assert.equal((await closed).status, 'CLOSED');
  const n = t.db.get().prepare('SELECT COUNT(*) n FROM chat_messages WHERE session_id = ?').get(sessionId).n;
  assert.ok(n >= 5);
  const r = await emit(guest, 'chat:message', { sessionId, body: 'còn ai không?' });
  assert.equal(r.ok, false);
});
