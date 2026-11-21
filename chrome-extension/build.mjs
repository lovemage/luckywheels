// 組出可「載入未封裝項目」的擴充功能資料夾，並打包成會員下載用的 zip。
//
//   node chrome-extension/build.mjs                         # 正式版（https://luckyds.com）→ public/downloads/luckyds-assistant-chrome.zip
//   node chrome-extension/build.mjs --origin http://127.0.0.1:3001 --no-zip   # 本機測試，只產生 dist/
//
// game-bridge.js 直接取自 Android App（android/app/src/main/assets/），兩邊讀遊戲畫面的方式只維護一份。
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';

const VERSION = '1.0.0';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const { values } = parseArgs({
  options: {
    origin: { type: 'string', default: 'https://luckyds.com' },
    'no-zip': { type: 'boolean', default: false },
  },
});
const origin = new URL(values.origin).origin;
// match pattern 不含連接埠（Chrome 的 match pattern 會比對任何連接埠）
const originMatch = `${new URL(origin).protocol}//${new URL(origin).hostname}/*`;
const publicKey = readFileSync(join(here, 'keystore/pub.b64'), 'utf8').trim();
const extensionId = extensionIdFromKey(publicKey);

const src = join(here, 'src');
const out = join(here, 'dist', 'luckyds-assistant-chrome');
rmSync(join(here, 'dist'), { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const fill = (s) =>
  s
    .replaceAll('__VERSION__', VERSION)
    .replaceAll('__ORIGIN_MATCH__', originMatch)
    .replaceAll('__EXTENSION_ID__', extensionId);

for (const name of readdirSync(src)) {
  const from = join(src, name);
  if (name === 'icons') {
    mkdirSync(join(out, 'icons'));
    for (const f of readdirSync(from)) if (f.endsWith('.png')) cpSync(join(from, f), join(out, 'icons', f));
  } else if (/\.(js|json|html|css)$/.test(name)) {
    writeFileSync(join(out, name), fill(readFileSync(from, 'utf8')));
  }
}

const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
manifest.key = publicKey; // 固定擴充功能 ID（luckyds-shim.js 只接受這個 ID 的側邊欄）
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(join(out, 'config.js'), `self.LW_CONFIG = ${JSON.stringify({ origin, version: VERSION })};\n`);
cpSync(join(root, 'android/app/src/main/assets/game-bridge.js'), join(out, 'game-bridge.js'));

console.log(`built ${out}\n  origin ${origin}\n  id     ${extensionId}\n  ver    ${VERSION}`);

if (!values['no-zip']) {
  const zip = join(root, 'public/downloads/luckyds-assistant-chrome.zip');
  if (existsSync(zip)) rmSync(zip);
  // zip 內含一層資料夾，會員解壓縮後直接選這個資料夾
  execFileSync('zip', ['-qr', '-X', zip, 'luckyds-assistant-chrome'], { cwd: join(here, 'dist') });
  console.log(`zipped ${zip}`);
}

function extensionIdFromKey(b64) {
  const der = Buffer.from(b64, 'base64');
  const hex = createHash('sha256').update(der).digest('hex').slice(0, 32);
  return [...hex].map((c) => String.fromCharCode('a'.charCodeAt(0) + parseInt(c, 16))).join('');
}
