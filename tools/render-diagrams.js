// Render toàn bộ biểu đồ Mermaid (docs/diagrams/src/*.mmd) thành PNG độ phân giải cao
// bằng mermaid-cli chạy cục bộ trên trình duyệt Chrome/Edge có sẵn (không gọi dịch vụ ngoài).
// Dùng: npm run diagrams            -> render tất cả
//       npm run diagrams -- uc_00    -> chỉ render file có tên chứa "uc_00"
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'docs', 'diagrams', 'src');
const OUT = path.join(ROOT, 'docs', 'diagrams', 'png');
const MMDC = path.join(ROOT, 'node_modules', '@mermaid-js', 'mermaid-cli', 'src', 'cli.js');

const browsers = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const exe = browsers.find((b) => fs.existsSync(b));
const puppeteerCfg = path.join(__dirname, 'puppeteer.json');
fs.writeFileSync(puppeteerCfg, JSON.stringify({ executablePath: exe, args: ['--no-sandbox'] }));

fs.mkdirSync(OUT, { recursive: true });
const filter = process.argv[2] || '';
const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.mmd') && f.includes(filter)).sort();

let ok = 0;
for (const f of files) {
  const out = path.join(OUT, f.replace(/\.mmd$/, '.png'));
  try {
    execFileSync(process.execPath, [MMDC,
      '-i', path.join(SRC, f), '-o', out,
      '-c', path.join(__dirname, 'mermaid.json'),
      '-p', puppeteerCfg, '-s', '3', '-b', 'white', '-q',
    ], { stdio: 'pipe' });
    ok++;
    console.log('✔', f);
  } catch (e) {
    console.error('✘', f, '\n', (e.stderr || e.message).toString().split('\n').slice(0, 8).join('\n'));
  }
}
console.log(`\nĐã render ${ok}/${files.length} biểu đồ -> ${path.relative(ROOT, OUT)}`);
if (ok !== files.length) process.exit(1);
