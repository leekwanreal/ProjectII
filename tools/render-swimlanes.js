// Vẽ biểu đồ hoạt động có làn (swimlane) từ đặc tả JSON (docs/diagrams/src/act_*.json) -> PNG.
// Mermaid không bố trí được làn thẳng hàng nên các biểu đồ hoạt động dùng công cụ nhỏ này:
// mỗi nút khai báo làn + hàng, đường nối đi vuông góc theo các kiểu định tuyến đơn giản.
// Dùng: node tools/render-swimlanes.js [bộ lọc tên]
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'docs', 'diagrams', 'src');
const OUT = path.join(ROOT, 'docs', 'diagrams', 'png');
const RH = 112, HEAD = 46, PAD = 26, LINE = 21;
const STYLE = {
  act: ['#EAF1FB', '#1F4E8C'], good: ['#E6F4EA', '#2E7D32'], bad: ['#FDECEC', '#B3261E'], dec: ['#FFF4D6', '#C9A227'],
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function build(spec) {
  // ---- hình học làn và nút
  let x = 0;
  const lanes = spec.lanes.map((l) => { const o = { ...l, x, cx: x + l.w / 2 }; x += l.w; return o; });
  const W = x;
  const rows = Math.max(...spec.nodes.map((n) => n.r)) + 1;
  const H = HEAD + PAD + rows * RH + 6;
  const N = {};
  for (const n of spec.nodes) {
    const lines = (n.label || '').split('\n');
    const t = n.t || 'act';
    const circle = t === 'start' || t === 'end';
    const w = circle ? 26 : (n.w || (t === 'dec' ? 200 : 206));
    const h = circle ? 26 : (t === 'dec' ? Math.max(86, lines.length * LINE + 50) : lines.length * LINE + 24);
    const cx = lanes[n.lane].cx + (n.dx || 0);
    const cy = HEAD + PAD + n.r * RH + RH / 2 - 14;
    N[n.id] = { ...n, t, lines, w, h, cx, cy, top: cy - h / 2, bottom: cy + h / 2, left: cx - w / 2, right: cx + w / 2 };
  }

  // ---- định tuyến đường nối
  const paths = [];
  for (const e of spec.edges) {
    const a = N[e.f], b = N[e.t];
    if (!a || !b) throw new Error(`Không thấy nút ${e.f} -> ${e.t}`);
    let m = e.m;
    if (!m) m = a.r === b.r ? 'h' : (b.r > a.r ? (Math.abs(a.cx - b.cx) < 1 ? 'v' : 'z') : 'side');
    const sx = e.sx || 0, tx = e.tx || 0;
    // điểm xuất phát lệch tâm trên cạnh dưới của hình thoi phải nằm trên cạnh xiên
    const ab = a.t === 'dec' ? a.bottom - (Math.abs(sx) / (a.w / 2)) * (a.h / 2) : a.bottom;
    let p;
    if (m === 'h') p = b.cx > a.cx ? [[a.right, a.cy], [b.left, b.cy]] : [[a.left, a.cy], [b.right, b.cy]];
    else if (m === 'v') p = [[a.cx + sx, ab], [a.cx + sx, b.top]];
    else if (m === 'z') { const gy = b.top - 20 - (e.gy || 0); p = [[a.cx + sx, ab], [a.cx + sx, gy], [b.cx + tx, gy], [b.cx + tx, b.top]]; }
    else if (m === 'vh') p = [[a.cx + sx, ab], [a.cx + sx, b.cy], [b.cx > a.cx ? b.left : b.right, b.cy]];
    else if (m === 'hv') p = [[b.cx > a.cx ? a.right : a.left, a.cy], [b.cx + tx, a.cy], [b.cx + tx, b.r > a.r ? b.top : b.bottom]];
    else if (m === 'n') { const gy = a.top - 20; p = [[a.cx, a.top], [a.cx, gy], [b.cx + tx, gy], [b.cx + tx, b.top]]; }
    else if (m === 'side') {
      const right = e.side === 'r';
      const cx = e.cx != null ? e.cx : (right ? lanes[a.lane].x + lanes[a.lane].w - 16 : lanes[Math.min(a.lane, b.lane)].x + 16);
      p = [[right ? a.right : a.left, a.cy], [cx, a.cy], [cx, b.cy + (e.ty || 0)], [right ? b.right : b.left, b.cy + (e.ty || 0)]];
    } else throw new Error('Kiểu định tuyến lạ: ' + m);
    // nhãn đặt cạnh đoạn đầu tiên
    let label = '';
    if (e.l) {
      const [x0, y0] = p[0], [x1, y1] = p[1];
      const horiz = Math.abs(y1 - y0) < 1;
      const lx = horiz ? x0 + Math.sign(x1 - x0) * 12 : x0 + 8;
      const ly = (horiz ? y0 - 7 : y0 + Math.sign(y1 - y0) * 17 + 4) + (e.ldy || 0);
      const anchor = horiz ? (x1 > x0 ? 'start' : 'end') : 'start';
      label = `<text x="${lx}" y="${ly}" text-anchor="${anchor}" class="el">${esc(e.l)}</text>`;
    }
    paths.push(`<polyline points="${p.map((q) => q.join(',')).join(' ')}" class="edge" marker-end="url(#arr)"/>${label}`);
  }

  // ---- vẽ
  const laneSvg = lanes.map((l, i) => `
    <rect x="${l.x}" y="0" width="${l.w}" height="${H}" fill="${i % 2 ? '#FBFCFE' : '#F4F7FB'}" stroke="#9AA8BF"/>
    <rect x="${l.x}" y="0" width="${l.w}" height="${HEAD}" fill="#14213D" stroke="#14213D"/>
    <text x="${l.cx}" y="${HEAD / 2 + 6}" text-anchor="middle" class="lh">${esc(l.title)}</text>`).join('');
  const nodeSvg = Object.values(N).map((n) => {
    if (n.t === 'start') return `<circle cx="${n.cx}" cy="${n.cy}" r="12" fill="#14213D"/>`;
    if (n.t === 'end') return `<circle cx="${n.cx}" cy="${n.cy}" r="12" fill="#fff" stroke="#14213D" stroke-width="2.5"/><circle cx="${n.cx}" cy="${n.cy}" r="7" fill="#14213D"/>`;
    const [fill, stroke] = STYLE[n.t] || STYLE.act;
    const shape = n.t === 'dec'
      ? `<polygon points="${n.cx},${n.top} ${n.right},${n.cy} ${n.cx},${n.bottom} ${n.left},${n.cy}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`
      : `<rect x="${n.left}" y="${n.top}" width="${n.w}" height="${n.h}" rx="14" fill="${fill}" stroke="${stroke}" stroke-width="1.8"/>`;
    const y0 = n.cy - ((n.lines.length - 1) * LINE) / 2 + 5.5;
    const text = n.lines.map((s, i) => `<tspan x="${n.cx}" y="${y0 + i * LINE}">${esc(s)}</tspan>`).join('');
    return `${shape}<text text-anchor="middle" class="nt">${text}</text>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W + 2}" height="${H + 2}" viewBox="-1 -1 ${W + 2} ${H + 2}">
  <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#33415C"/></marker></defs>
  <style>
    text { font-family: Arial, Helvetica, sans-serif; fill: #14213D; }
    .lh { font-size: 17px; font-weight: bold; fill: #fff; }
    .nt { font-size: 15.5px; }
    .el { font-size: 14.5px; font-weight: bold; fill: #B3261E; paint-order: stroke; stroke: #fff; stroke-width: 4px; }
    .edge { fill: none; stroke: #33415C; stroke-width: 1.7; stroke-linejoin: round; }
  </style>
  ${laneSvg}${paths.join('')}${nodeSvg}</svg>`;
}

(async () => {
  const filter = process.argv[2] || '';
  const files = fs.readdirSync(SRC).filter((f) => /^act_.*\.json$/.test(f) && f.includes(filter)).sort();
  const exe = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => fs.existsSync(p));
  const browser = await puppeteer.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2.5 });
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of files) {
    const svg = build(JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8')));
    await page.setContent(`<body style="margin:0;background:#fff">${svg}</body>`);
    const el = await page.$('svg');
    await el.screenshot({ path: path.join(OUT, f.replace(/\.json$/, '.png')) });
    console.log('✔', f);
  }
  await browser.close();
  console.log(`Đã vẽ ${files.length} biểu đồ hoạt động (swimlane).`);
})().catch((e) => { console.error(e); process.exit(1); });
