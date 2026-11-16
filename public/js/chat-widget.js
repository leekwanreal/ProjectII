// CN4 – Widget chat tư vấn phía học viên (Socket.IO)
(function () {
  const { esc, time, toast } = window.UI;
  const $ = (s) => document.querySelector(s);
  const KEY = 'chat.sessionId';
  const socket = io({ transports: ['websocket', 'polling'] });
  let session = null;
  let typingTimer;

  const panel = $('#chat-panel');
  const show = (open) => { panel.classList.toggle('hidden', !open); if (open) { $('#chat-dot').classList.add('hidden'); setTimeout(() => (session ? $('#chat-text') : $('#chat-start [name=name]')).focus(), 50); } };
  document.addEventListener('click', (e) => { if (e.target.closest('[data-action="chat"]')) { e.preventDefault(); show(panel.classList.contains('hidden')); } });
  $('#chat-min').onclick = () => show(false);

  function setStatus() {
    const s = $('#chat-status');
    if (!session) s.textContent = 'Thường phản hồi trong 1 phút';
    else if (session.status === 'WAITING') s.textContent = 'Đang chờ tư vấn viên tiếp nhận…';
    else if (session.status === 'ACTIVE') s.textContent = `Đang trò chuyện với ${session.consultant_name || 'tư vấn viên'}`;
    else s.textContent = 'Phiên tư vấn đã kết thúc';
    const closed = session && session.status === 'CLOSED';
    $('#chat-form').classList.toggle('hidden', !!closed);
    $('#chat-end').textContent = closed ? 'Bắt đầu cuộc trò chuyện mới' : 'Kết thúc trò chuyện';
  }

  function render(m) {
    const box = $('#chat-msgs');
    const cls = m.sender_type === 'SYSTEM' ? 'sys' : m.sender_type === 'STUDENT' ? 'me' : 'them';
    const el = document.createElement('div');
    el.className = `msg ${cls}`;
    el.innerHTML = cls === 'sys' ? esc(m.body) : `${cls === 'them' ? `<b class="small">${esc(m.sender_name)}</b><br>` : ''}${esc(m.body)}<small>${time(m.sent_at)}</small>`;
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
  }

  function enterChat(s, messages = []) {
    session = s;
    localStorage.setItem(KEY, s.session_id);
    $('#chat-start').classList.add('hidden');
    $('#chat-body').classList.remove('hidden');
    $('#chat-msgs').innerHTML = '';
    messages.forEach(render);
    setStatus();
  }

  $('#chat-start').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    socket.emit('chat:start', { name: f.name.value, contact: f.contact.value, topic: f.topic.value }, (r) => {
      if (!r.ok) return toast('Không mở được phiên chat', esc(r.error), 'bad');
      enterChat(r.session);
    });
  });

  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#chat-text');
    const body = input.value.trim();
    if (!body || !session) return;
    socket.emit('chat:message', { sessionId: session.session_id, body }, (r) => { if (!r.ok) toast('Không gửi được', esc(r.error), 'bad'); });
    input.value = '';
    socket.emit('chat:typing', { sessionId: session.session_id, typing: false });
  });
  $('#chat-text').addEventListener('input', () => {
    if (!session) return;
    socket.emit('chat:typing', { sessionId: session.session_id, typing: true });
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => socket.emit('chat:typing', { sessionId: session.session_id, typing: false }), 1500);
  });

  $('#chat-end').onclick = () => {
    if (!session) return;
    if (session.status === 'CLOSED') {
      localStorage.removeItem(KEY); session = null;
      $('#chat-body').classList.add('hidden'); $('#chat-start').classList.remove('hidden'); setStatus();
      return;
    }
    if (confirm('Kết thúc cuộc trò chuyện với tư vấn viên?')) socket.emit('chat:close', { sessionId: session.session_id }, () => {});
  };

  socket.on('chat:message', (m) => {
    if (!session || m.session_id !== session.session_id) return;
    render(m);
    if (panel.classList.contains('hidden') && m.sender_type !== 'STUDENT') $('#chat-dot').classList.remove('hidden');
  });
  socket.on('chat:claimed', (s) => { if (session && s.session_id === session.session_id) { session = s; setStatus(); } });
  socket.on('chat:closed', (s) => { if (session && s.session_id === session.session_id) { session = s; setStatus(); $('#chat-typing').classList.add('hidden'); } });
  socket.on('chat:typing', ({ from, typing }) => { if (from === 'CONSULTANT') $('#chat-typing').classList.toggle('hidden', !typing); });

  // Khôi phục phiên sau khi tải lại trang / mất kết nối
  socket.on('connect', () => {
    const id = localStorage.getItem(KEY);
    if (!id) return;
    socket.emit('chat:resume', { sessionId: id }, (r) => {
      if (r.ok) enterChat(r.session, r.messages);
      else localStorage.removeItem(KEY);
    });
  });
})();
