// Renders icons/app-icon.svg to PNG at 180, 192, 512 and 1024.
//
// No Playwright on this box, so this drives the headless Chromium that the
// browser tool uses, and crops with ffmpeg. Headless Chromium's window
// includes ~87 px of UI chrome (window 256x256 gives a 256x169 viewport),
// so each screenshot is taken at N x (N+87) and cropped to the top N x N.
//
// Run: node tools/make-icons.js
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CHROME = '/home/hermes/.hermes/tools/chromium-1208/chrome-linux64/chrome';
const FFMPEG = '/home/hermes/.hermes/tools/ffmpeg-9.0.1-linux-x64/bin/ffmpeg';
const CHROME_PX = 87; // measured chrome height (256 window -> 169 viewport)

const root = path.resolve(__dirname, '..');
const svg = path.join(root, 'icons', 'app-icon.svg');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'make-icons-'));

const sizes = [
  { n: 180, out: 'apple-touch-icon.png' },
  { n: 192, out: 'icon-192.png' },
  { n: 512, out: 'icon-512.png' },
  { n: 1024, out: 'icon-1024.png' },
];

try {
  for (const { n, out } of sizes) {
    const html = path.join(tmp, `icon-${n}.html`);
    const full = path.join(tmp, `icon-${n}.full.png`);
    const final = path.join(root, 'icons', out);
    const raw = path.join(tmp, `icon-${n}.raw`);
    fs.writeFileSync(
      html,
      `<!doctype html>
<html><head><style>html,body{margin:0;overflow:hidden}</style></head>
<body><img src="file://${svg}" width="${n}" height="${n}" style="display:block"></body></html>`
    );
    execFileSync(
      CHROME,
      [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        `--screenshot=${full}`,
        `--window-size=${n},${n + CHROME_PX}`,
        '--default-background-color=00000000',
        html,
      ],
      { stdio: 'ignore' }
    );
    execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', full, '-vf', `crop=${n}:${n}:0:0`, final]);
    // Verify: exact dimensions and not a single flat colour.
    execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', final, '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw]);
    const buf = fs.readFileSync(raw);
    const px = buf.length / 3;
    if (px !== n * n) throw new Error(`${out}: expected ${n * n} px, got ${px}`);
    const colors = new Set();
    for (let i = 0; i < buf.length; i += 3) colors.add(`${buf[i]},${buf[i + 1]},${buf[i + 2]}`);
    if (colors.size < 2) throw new Error(`${out}: looks empty (single colour)`);
    console.log(`${out}: ${n}x${n}, ${colors.size} distinct colours`);
  }
  console.log('done');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
