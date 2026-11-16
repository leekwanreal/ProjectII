// API công khai cho Cổng học viên
const express = require('express');
const config = require('../config');
const catalog = require('../services/catalog');
const registration = require('../services/registration');
const placement = require('../services/placement');
const auth = require('../services/auth');

const r = express.Router();

r.get('/meta', (req, res) => {
  res.json({
    capacity: config.CAPACITY,
    levels: config.LEVELS,
    shifts: config.SHIFTS,
    weekdays: config.WEEKDAYS,
    paymentMethods: config.PAYMENT_METHODS,
    placement: config.PLACEMENT,
    stats: catalog.publicStats(),
  });
});

// Chức năng 1 – Quảng bá
r.get('/courses', (req, res) => res.json(catalog.listCourses()));
r.get('/courses/:id', (req, res) => res.json(catalog.getCourse(Number(req.params.id))));

// Chức năng 3 – Tra cứu lớp
r.get('/classes', (req, res) => {
  const { q, certificate, course_id, form, shift, level, from, to, available } = req.query;
  res.json(catalog.searchClasses({ q, certificate, course_id, form, shift, level, from, to, available }));
});
r.get('/classes/:id', (req, res) => res.json(catalog.getClass(Number(req.params.id))));

// Chức năng 2 – Đăng ký
r.post('/registrations', (req, res) => res.status(201).json(registration.create(req.body || {})));
r.post('/registrations/lookup', (req, res) => {
  const reg = registration.findByCodeAndPhone(req.body.code, req.body.phone);
  res.json(reg);
});
r.post('/registrations/:code/pay', (req, res) => {
  const reg = registration.findByCodeAndPhone(req.params.code, req.body.phone);
  res.json(registration.pay(reg, req.body.method));
});

// Kiểm tra đầu vào
r.post('/placement/:code/start', (req, res) => {
  const reg = registration.findByCodeAndPhone(req.params.code, req.body.phone);
  res.json(placement.start(reg));
});
r.post('/placement/:code/submit', (req, res) => {
  const reg = registration.findByCodeAndPhone(req.params.code, req.body.phone);
  res.json(placement.submit(reg, req.body.answers));
});

// Đăng nhập nhân viên
r.post('/auth/login', (req, res) => res.json(auth.login(req.body.username, req.body.password)));

module.exports = r;
