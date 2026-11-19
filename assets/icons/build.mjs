// 生成全部程序图标。用法：node assets/icons/build.mjs（需要先 pnpm install）。
//
// 1. 写出三个 SVG（要提交）：
//    qyplayer.svg  播放器，蓝色，播放三角角标
//    qymaker.svg   制作器，琥珀色，铅笔角标
//    qypfile.svg   .qyp 文件图标：一张纸，上面是蓝色的云和 Q
// 2. 用 `tauri icon` 把它们转成两个程序的 PNG/ICO，以及 .qyp 文件关联用的 qyp-file.ico（也要提交）。
// 3. Android 的启动图标写进 gen/android 的资源目录（那个目录提交进仓库以后才会做这一步）。
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");

const PLAYER = { from: "#38bdf8", to: "#0b5fa5", cloud: "#bfe6fb" };
const MAKER = { from: "#fbbf24", to: "#b45309", cloud: "#fde6b0" };

// 播放三角
const PLAY_GLYPH = `<path d="M-20 -32L38 0L-20 32Z" fill="#fff" stroke="#fff" stroke-width="14" stroke-linejoin="round"/>`;
// 铅笔（笔尖朝左下）
const PENCIL_GLYPH = `<g transform="rotate(45) scale(1.15)" fill="#fff"><rect x="-15" y="-56" width="30" height="76" rx="7"/><path d="M-15 24H15L0 56Z"/></g>`;

// 云：三个圆加一块圆角矩形拼成的剪影，中心大约在 (535, 490)
const CLOUD = `<circle cx="372" cy="568" r="140"/><circle cx="528" cy="462" r="196"/><circle cx="706" cy="548" r="152"/><rect x="300" y="560" width="560" height="148" rx="74"/>`;

// Q：正圆加一道从底部向右上扬起的短尾巴；坐标以 (400, 500) 附近为中心
const Q = `<circle cx="344" cy="470" r="186"/><path d="M404 634C446 682 514 692 566 652"/>`;

function appIcon({ from, to, cloud }, glyph) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="cloud" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="${cloud}"/></linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="232" fill="url(#bg)"/>
  <rect width="1024" height="1024" rx="232" fill="url(#shine)"/>
  <g transform="translate(470 468) scale(1.06) translate(-535 -490)" fill="url(#cloud)">${CLOUD}</g>
  <g transform="translate(470 478) scale(0.8) translate(-400 -500)" fill="none" stroke="${to}" stroke-width="96" stroke-linecap="round" stroke-linejoin="round">${Q}</g>
  <circle cx="768" cy="762" r="136" fill="${to}" stroke="#fff" stroke-width="22"/>
  <g transform="translate(768 762)">${glyph}</g>
</svg>
`;
}

// 文件图标：纸张（右上角折起）加蓝色的云和白色的 Q。竖版，系统会把它显示成文档图标
function fileIcon({ from, to }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e3eef9"/></linearGradient>
    <linearGradient id="cloud" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>
  </defs>
  <path d="M200 76H624L824 276V948H200Z" fill="url(#paper)" stroke="#c9dbed" stroke-width="12" stroke-linejoin="round"/>
  <path d="M624 76V276H824Z" fill="#bcd4ea" stroke="#c9dbed" stroke-width="12" stroke-linejoin="round"/>
  <g transform="translate(512 612) scale(0.76) translate(-535 -490)" fill="url(#cloud)">${CLOUD}</g>
  <g transform="translate(512 622) scale(0.608) translate(-400 -500)" fill="none" stroke="#fff" stroke-width="96" stroke-linecap="round" stroke-linejoin="round">${Q}</g>
</svg>
`;
}

writeFileSync(join(here, "qyplayer.svg"), appIcon(PLAYER, PLAY_GLYPH));
writeFileSync(join(here, "qymaker.svg"), appIcon(MAKER, PENCIL_GLYPH));
writeFileSync(join(here, "qypfile.svg"), fileIcon(PLAYER));

/** 用 tauri icon 把 SVG 转成多尺寸图标，再按“生成的文件名 → 目标路径”复制需要的几个 */
function convert(svgName, copies) {
  const tmp = mkdtempSync(join(tmpdir(), "qyp-icon-"));
  try {
    execFileSync("pnpm", ["--filter", "@qyplayer/desktop-player", "exec", "--", "tauri", "icon", join(here, svgName), "-o", tmp], { stdio: "ignore", shell: true });
    for (const [generated, target] of Object.entries(copies)) cpSync(join(tmp, generated), join(repo, target));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** Android 的启动图标：tauri icon 会生成整个 android/ 目录（各密度的 mipmap 和前景图），原样覆盖进资源目录 */
function convertAndroid(svgName) {
  const tmp = mkdtempSync(join(tmpdir(), "qyp-icon-"));
  try {
    execFileSync("pnpm", ["--filter", "@qyplayer/desktop-player", "exec", "--", "tauri", "icon", join(here, svgName), "-o", tmp], { stdio: "ignore", shell: true });
    cpSync(join(tmp, "android"), androidRes, { recursive: true });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** gen/android 由 CI 上的 tauri android init 生成后提交进仓库；还没生成时跳过 Android 图标 */
const androidRes = join(repo, "apps/desktop-player/src-tauri/gen/android/app/src/main/res");

const appFiles = ["32x32.png", "128x128.png", "128x128@2x.png", "icon.ico", "icon.png"];
const appCopies = (app) => Object.fromEntries(appFiles.map((file) => [file, `apps/${app}/src-tauri/icons/${file}`]));

convert("qyplayer.svg", appCopies("desktop-player"));
convert("qymaker.svg", appCopies("desktop-maker"));
convert("qypfile.svg", { "icon.ico": "apps/desktop-player/src-tauri/icons/qyp-file.ico" });

if (existsSync(androidRes)) {
  convertAndroid("qyplayer.svg");
} else {
  console.log("跳过 Android 图标：apps/desktop-player/src-tauri/gen/android 还不存在（由 CI 上的 tauri android init 生成）");
}
