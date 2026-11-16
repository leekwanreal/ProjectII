// Chụp ảnh màn hình các trang chính (dùng cho báo cáo) bằng Chrome/Edge headless cục bộ.
// Yêu cầu: máy chủ đang chạy (npm start). Dùng: npm run screenshots [-- http://localhost:3000]
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const BASE = process.argv[2] || 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'report', 'images', 'screens');
const exe = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => fs.existsSync(p));
const only = process.argv[3] || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Lấy mã hồ sơ demo trực tiếp từ CSDL (chỉ đọc)
const Database = require('better-sqlite3');
const demoReg = (phone) => {
  const d = new Database(require('../server/config').DB_PATH, { readonly: true });
  const r = d.prepare('SELECT r.reg_code FROM registrations r JOIN students s USING(student_id) WHERE s.phone = ?').get(phone);
  d.close();
  return r && r.reg_code;
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--force-color-profile=srgb', '--lang=vi-VN'] });
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
  const shot = async (name, opts = {}) => {
    if (only && !name.includes(only)) return;
    await page.bringToFront();
    await sleep(opts.wait ?? 600);
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: !!opts.full, clip: opts.clip });
    console.log('✔', name);
  };
  const go = async (url) => { await page.goto(BASE + url, { waitUntil: 'networkidle0' }); };
  const scrollTo = async (sel) => { await page.evaluate((s) => { const el = document.querySelector(s); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 66); }, sel); await sleep(400); };

  // ---------------- Cổng học viên
  await go('/');
  await page.evaluate(() => localStorage.clear());
  await go('/');
  await shot('01_trang_chu');
  await scrollTo('#khoa-hoc');
  await shot('02_khoa_hoc');
  await page.click('[data-action="course-detail"]');
  await shot('03_chi_tiet_khoa_hoc');
  await page.keyboard.press('Escape');
  await scrollTo('#tra-cuu');
  await page.click('#f-form button[data-v="OFFLINE"]');
  await page.select('#f-shift', 'EVENING');
  await sleep(700);
  await shot('04_tra_cuu_lop');
  await scrollTo('#dang-ky');
  await page.select('#r-course', '2');
  await sleep(500);
  await page.click('#reg-submit');
  await shot('05_dang_ky_validate');

  // Chat widget
  await page.click('#chat-fab');
  await page.type('#chat-start [name=name]', 'Nguyễn Minh Khôi');
  await page.type('#chat-start [name=contact]', '0911 222 333');
  await page.click('#chat-start button');
  await sleep(500);
  await page.type('#chat-text', 'Chào trung tâm, lớp IELTS tối 3-5-7 còn chỗ không ạ?');
  await page.keyboard.press('Enter');
  await shot('06_chat_hoc_vien');
  await page.click('#chat-min');

  // Tra cứu hồ sơ (chờ nộp phí) → thanh toán
  const lookup = async (phone) => {
    await page.evaluate((code, ph) => window.Portal.openLookup(code, ph), demoReg(phone), phone);
    await sleep(900);
  };
  await lookup('0912345678');
  await shot('18_tra_cuu_ho_so_thanh_toan');
  await page.keyboard.press('Escape');
  // Hồ sơ đã nộp phí → bài kiểm tra đầu vào
  await lookup('0987654321');
  await shot('19_tra_cuu_ho_so_cho_thi');
  if (!only || '20_bai_kiem_tra'.includes(only)) {
    await page.click('#do-test');
    await sleep(1200);
    await page.evaluate(() => { document.querySelectorAll('.q').forEach((q, i) => { if (i < 6) q.querySelectorAll('input')[i % 4].click(); }); });
    await shot('20_bai_kiem_tra');
    await page.keyboard.press('Escape');
  }
  // Hồ sơ đã thi → chờ xếp lớp
  await lookup('0905123456');
  await shot('21_tra_cuu_ho_so_da_thi');
  await page.keyboard.press('Escape');

  // ---------------- Văn phòng
  const p2 = await browser.newPage();
  await p2.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
  await p2.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await p2.goto(BASE + '/admin', { waitUntil: 'networkidle0' });
  await p2.evaluate(() => localStorage.clear());
  await p2.goto(BASE + '/admin', { waitUntil: 'networkidle0' });
  if (!only || '07_dang_nhap'.includes(only)) { await sleep(400); await p2.screenshot({ path: path.join(OUT, '07_dang_nhap.png') }); console.log('✔ 07_dang_nhap'); }
  const login = async (u) => {
    await p2.evaluate(async (user) => {
      localStorage.clear();
      const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: '123456' }) });
      const j = await r.json();
      localStorage.setItem('staff.token', j.token); localStorage.setItem('staff.user', JSON.stringify(j.user));
    }, u);
  };
  const view = async (hash) => { await p2.goto(BASE + '/admin' + hash); await p2.reload({ waitUntil: 'networkidle0' }); await sleep(500); };
  const s2 = async (name, opts = {}) => { if (only && !name.includes(only)) return; await p2.bringToFront(); await sleep(opts.wait ?? 900); await p2.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: !!opts.full }); console.log('✔', name); };

  await login('giaovu');
  await view('#dashboard');
  await s2('08_dashboard', { wait: 1500 });
  await p2.evaluate(() => window.scrollTo(0, 820));
  await s2('09_dashboard_2');
  await view('#registrations');
  await s2('10_ho_so');
  await p2.click('[data-enroll]');
  await s2('11_xep_lop', { wait: 1200 });
  await p2.keyboard.press('Escape');
  await view('#classes');
  await s2('12_lop_hoc');
  await p2.evaluate(() => { const tr = [...document.querySelectorAll('#cl-body tr')].find((x) => x.textContent.includes('VSTEP-B2-B2-OFF')); tr && tr.click(); });
  await s2('13_chi_tiet_lop', { wait: 1200 });
  await p2.keyboard.press('Escape');

  await login('lanhdao');
  await view('#approvals');
  await s2('14_phe_duyet', { wait: 1300 });

  await login('tuvan1');
  await view('#chat');
  await sleep(1000);
  await p2.evaluate(() => { const it = [...document.querySelectorAll('.q-item')].find((x) => x.textContent.includes('Nguyễn Minh Khôi')); it && it.click(); });
  await sleep(800);
  const claim = await p2.$('#cv-claim');
  if (claim) { await claim.click(); await sleep(900); }
  if (await p2.$('#cv-text')) {
    await p2.type('#cv-text', 'Chào Khôi! Lớp IELTS-I tối 3-5-7 đã đủ 30 học viên, bạn có thể chọn lớp online tối 3-5 hoặc đăng ký chờ mở lớp mới nhé.');
    await p2.keyboard.press('Enter');
  }
  await s2('15_console_tu_van', { wait: 1000 });
  await shot('16_chat_hoc_vien_nhan_tin', { wait: 500 });

  // ---------------- Mobile
  const mob = await browser.newPage();
  await mob.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await mob.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
  await mob.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await mob.evaluate(() => document.getElementById('tra-cuu').scrollIntoView());
  if (!only || '17_mobile_dark'.includes(only)) { await mob.bringToFront(); await sleep(800); await mob.screenshot({ path: path.join(OUT, '17_mobile_dark.png') }); console.log('✔ 17_mobile_dark'); }

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
