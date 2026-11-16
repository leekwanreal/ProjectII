// Bài kiểm tra trình độ đầu vào (BR-01)
const db = require('../db/connection');
const rules = require('../domain/rules');
const { PLACEMENT } = require('../config');
const { forbidden, conflict, AppError, badRequest } = require('./errors');

function publicQuestions(ids) {
  const rows = db.get().prepare(`SELECT question_id, skill, content, options FROM placement_questions WHERE question_id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  const byId = Object.fromEntries(rows.map((r) => [r.question_id, { ...r, options: JSON.parse(r.options) }]));
  return ids.map((id) => byId[id]); // giữ nguyên thứ tự đã phát, KHÔNG gửi đáp án
}

/** Chọn đề cân bằng độ khó: lấy ngẫu nhiên theo từng mức 1..5. */
function drawQuestionIds(n) {
  const d = db.get();
  const perLevel = Math.floor(n / 5);
  const ids = [];
  for (let lv = 1; lv <= 5; lv++) {
    ids.push(...d.prepare('SELECT question_id FROM placement_questions WHERE difficulty = ? ORDER BY random() LIMIT ?').all(lv, perLevel).map((r) => r.question_id));
  }
  if (ids.length < n) {
    const more = d.prepare(`SELECT question_id FROM placement_questions WHERE question_id NOT IN (${ids.map(() => '?').join(',') || 'NULL'}) ORDER BY random() LIMIT ?`).all(...ids, n - ids.length);
    ids.push(...more.map((r) => r.question_id));
  }
  return ids.sort((a, b) => a - b);
}

function deadlineOf(attempt) {
  return new Date(attempt.started_at.replace(' ', 'T')).getTime() + PLACEMENT.MINUTES * 60 * 1000;
}

/** Bắt đầu (hoặc tiếp tục) lượt thi của 1 hồ sơ. */
function start(reg) {
  const existing = db.get().prepare('SELECT * FROM placement_attempts WHERE registration_id = ?').get(reg.registration_id);
  if (existing && existing.submitted_at) throw conflict('ALREADY_TESTED', 'Hồ sơ đã hoàn thành bài kiểm tra đầu vào.');
  if (!existing) {
    const check = rules.canTakePlacement(reg.status);
    if (!check.ok) throw forbidden(check.code, check.message);
  }
  let attempt = existing;
  if (!attempt) {
    const ids = drawQuestionIds(PLACEMENT.QUESTIONS);
    db.get().prepare('INSERT INTO placement_attempts (registration_id, question_ids, total) VALUES (?, ?, ?)')
      .run(reg.registration_id, JSON.stringify(ids), ids.length);
    attempt = db.get().prepare('SELECT * FROM placement_attempts WHERE registration_id = ?').get(reg.registration_id);
  }
  const ids = JSON.parse(attempt.question_ids);
  return { minutes: PLACEMENT.MINUTES, deadline: deadlineOf(attempt), questions: publicQuestions(ids) };
}

/** Nộp bài: chấm điểm, quy đổi CEFR, chuyển hồ sơ sang TESTED. */
function submit(reg, answers) {
  if (!answers || typeof answers !== 'object') throw badRequest('Thiếu bài làm.');
  return db.tx(() => {
    const attempt = db.get().prepare('SELECT * FROM placement_attempts WHERE registration_id = ?').get(reg.registration_id);
    if (!attempt) throw forbidden('NOT_STARTED', 'Bạn chưa bắt đầu bài kiểm tra.');
    if (attempt.submitted_at) throw conflict('ALREADY_TESTED', 'Bài kiểm tra đã được nộp.');
    // Cho phép trễ 60 giây do độ trễ mạng
    if (Date.now() > deadlineOf(attempt) + 60 * 1000) {
      throw new AppError(410, 'TIME_UP', 'Đã hết thời gian làm bài. Vui lòng liên hệ văn phòng để được hỗ trợ thi lại.');
    }
    const ids = JSON.parse(attempt.question_ids);
    const keys = db.get().prepare(`SELECT question_id, answer_index FROM placement_questions WHERE question_id IN (${ids.map(() => '?').join(',')})`).all(...ids);
    let score = 0;
    const cleaned = {};
    for (const k of keys) {
      const a = answers[k.question_id];
      if (a !== undefined && a !== null && a !== '') {
        cleaned[k.question_id] = Number(a);
        if (Number(a) === k.answer_index) score++;
      }
    }
    const level = rules.scoreToLevel(score, ids.length);
    db.get().prepare("UPDATE placement_attempts SET answers = ?, score = ?, level = ?, submitted_at = datetime('now','localtime') WHERE attempt_id = ?")
      .run(JSON.stringify(cleaned), score, level, attempt.attempt_id);
    db.get().prepare("UPDATE registrations SET status = 'TESTED', updated_at = datetime('now','localtime') WHERE registration_id = ?").run(reg.registration_id);
    return { score, total: ids.length, level };
  });
}

module.exports = { start, submit, drawQuestionIds };
