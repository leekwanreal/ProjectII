// API văn phòng trung tâm (yêu cầu đăng nhập)
const express = require('express');
const db = require('../db/connection');
const { requireStaff } = require('../middleware/auth');
const stats = require('../services/stats');
const registration = require('../services/registration');
const enrollment = require('../services/enrollment');
const catalog = require('../services/catalog');
const chat = require('../services/chat');

const r = express.Router();
const ANY = requireStaff();
const OFFICE = requireStaff('ACADEMIC', 'DIRECTOR');
const DIRECTOR = requireStaff('DIRECTOR');

r.get('/me', ANY, (req, res) => res.json(req.user));
r.get('/dashboard', ANY, (req, res) => res.json(stats.dashboard()));

// Hồ sơ đăng ký & xếp lớp
r.get('/registrations', ANY, (req, res) => res.json(registration.list(req.query)));
r.get('/registrations/:id', ANY, (req, res) => res.json(registration.getById(Number(req.params.id))));
r.get('/registrations/:id/suggestions', OFFICE, (req, res) => res.json(enrollment.suggestions(Number(req.params.id))));
r.post('/registrations/:id/enroll', OFFICE, (req, res) => {
  res.json(enrollment.enroll(Number(req.params.id), Number(req.body.class_id), req.body.reason, req.user.uid));
});
r.post('/registrations/:id/cash-payment', OFFICE, (req, res) => {
  const reg = registration.getById(Number(req.params.id));
  res.json(registration.pay(reg, 'CASH', req.user.uid));
});
r.post('/registrations/:id/cancel', OFFICE, (req, res) => res.json(registration.cancel(Number(req.params.id))));

// Lớp học, lịch học, phòng học
r.get('/classes', ANY, (req, res) => res.json(catalog.searchClasses({ ...req.query, status: req.query.status || 'ALL' })));
r.get('/classes/:id', ANY, (req, res) => res.json(enrollment.classDetail(Number(req.params.id))));
r.post('/classes', OFFICE, (req, res) => res.status(201).json(enrollment.createClass(req.body)));
r.put('/classes/:id/arrangement', OFFICE, (req, res) => res.json(enrollment.updateArrangement(Number(req.params.id), req.body)));
r.post('/classes/:id/open', OFFICE, (req, res) => res.json(enrollment.openClass(Number(req.params.id))));
r.post('/classes/:id/cancel', OFFICE, (req, res) => res.json(enrollment.cancelClass(Number(req.params.id), req.body.note)));
r.post('/classes/:id/complete', OFFICE, (req, res) => res.json(enrollment.completeClass(Number(req.params.id))));
r.get('/rooms', ANY, (req, res) => res.json(db.get().prepare('SELECT * FROM rooms ORDER BY campus, name').all()));
r.get('/teachers', ANY, (req, res) => res.json(db.get().prepare('SELECT * FROM teachers ORDER BY full_name').all()));
r.get('/courses', ANY, (req, res) => res.json(db.get().prepare('SELECT course_id, code, name, certificate FROM courses ORDER BY certificate, code').all()));

// Tờ trình vượt sĩ số
r.get('/approvals', ANY, (req, res) => res.json(enrollment.listApprovals(req.query.status)));
r.post('/approvals/:id/decide', DIRECTOR, (req, res) => {
  res.json(enrollment.decide(Number(req.params.id), req.body.decision, req.body.note, req.user.uid));
});

// Lịch sử chat
r.get('/chat/sessions', ANY, (req, res) => res.json(chat.listSessions(req.query.status)));
r.get('/chat/sessions/:id/messages', ANY, (req, res) => res.json({ session: chat.getSession(req.params.id), messages: chat.messages(req.params.id) }));

module.exports = r;
