// 生成全部程序图标。用法：node assets/icons/build.mjs（需要先 pnpm install）。
//
// 1. 写出三个 SVG（要提交）：
//    qyplayer.svg  播放器，蓝色，播放三角角标
//    qymaker.svg   制作器，琥珀色，铅笔角标
//    qypfile.svg   .qyp 文件图标：一张纸，上面是蓝色的云和 Q
// 2. 用 `tauri icon` 把它们转成两个程序的 PNG/ICO，以及 .qyp 文件关联用的 qyp-file.ico（也要提交）。
// 3. Android 的启动图标写进 gen/android 的资源目录（那个目录提交进仓库以后才会做这一步）。
import {execFileSync} from "node:child_process";
import {cpSync, existsSync, mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");

const PLAYER = {from: "#38bdf8", to: "#0b5fa5", cloud: "#bfe6fb"};
const MAKER = {from: "#fbbf24", to: "#b45309", cloud: "#fde6b0"};

// 播放三角
const PLAY_GLYPH = "<path d=\"M-20 -32L38 0L-20 32Z\" fill=\"#fff\" stroke=\"#fff\" stroke-width=\"14\" stroke-linejoin=\"round\"/>";
// 铅笔（笔尖朝左下）
const PENCIL_GLYPH = "<g transform=\"rotate(45) scale(1.15)\" fill=\"#fff\"><rect x=\"-15\" y=\"-56\" width=\"30\" height=\"76\" rx=\"7\"/><path d=\"M-15 24H15L0 56Z\"/></g>";

// 云：三个圆加一块圆角矩形拼成的剪影，中心大约在 (535, 490)
const CLOUD = "<circle cx=\"372\" cy=\"568\" r=\"140\"/><circle cx=\"528\" cy=\"462\" r=\"196\"/><circle cx=\"706\" cy=\"548\" r=\"152\"/><rect x=\"300\" y=\"560\" width=\"560\" height=\"148\" rx=\"74\"/>";

// Q：正圆加一道从底部向右上扬起的短尾巴；坐标以 (400, 500) 附近为中心
const Q = "<circle cx=\"344\" cy=\"470\" r=\"186\"/><path d=\"M404 634C446 682 514 692 566 652\"/>";

const appIcon = function appIcon({from, to, cloud}, glyph) {
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
};

// 文件图标：纸张（右上角折起）加蓝色的云和白色的 Q。竖版，系统会把它显示成文档图标
const fileIcon = function fileIcon({from, to}) {
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
};

writeFileSync(join(here, "qyplayer.svg"), appIcon(PLAYER, PLAY_GLYPH));
writeFileSync(join(here, "qymaker.svg"), appIcon(MAKER, PENCIL_GLYPH));
writeFileSync(join(here, "qypfile.svg"), fileIcon(PLAYER));

/**
 * Android 的自适应图标：前景层只放图形，背景透明。
 *
 * Android 的自适应图标把前景和背景都按 108dp 画，但只显示中央 66%（四周会被各种形状的遮罩裁掉），
 * 所以图形要收在中央、四周留出裁切余量；直接把整张圆角图标当背景层用会被放大裁切。
 */
const androidForeground = function androidForeground({to, cloud}, glyph) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="cloud" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="${cloud}"/></linearGradient>
  </defs>
  <g transform="translate(512 512) scale(0.82) translate(-567 -570)">
    <g transform="translate(470 468) scale(1.06) translate(-535 -490)" fill="url(#cloud)">${CLOUD}</g>
    <g transform="translate(470 478) scale(0.8) translate(-400 -500)" fill="none" stroke="${to}" stroke-width="96" stroke-linecap="round" stroke-linejoin="round">${Q}</g>
    <circle cx="768" cy="762" r="136" fill="${to}" stroke="#fff" stroke-width="22"/>
    <g transform="translate(768 762)">${glyph}</g>
  </g>
</svg>
`;
};

/** 自适应图标的背景层：和应用图标同一个渐变，写成 Android 的 drawable */
const ANDROID_BACKGROUND = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
  <gradient android:type="linear" android:angle="315" android:startColor="${PLAYER.from}" android:endColor="${PLAYER.to}" />
</shape>
`;

/** 自适应图标本身的定义：前景用 mipmap 里的图形，背景用上面的渐变 */
const ANDROID_ADAPTIVE_ICON = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
  <background android:drawable="@drawable/ic_launcher_background"/>
</adaptive-icon>
`;

writeFileSync(join(here, "qyplayer.svg"), appIcon(PLAYER, PLAY_GLYPH));
writeFileSync(join(here, "qymaker.svg"), appIcon(MAKER, PENCIL_GLYPH));
writeFileSync(join(here, "qypfile.svg"), fileIcon(PLAYER));
writeFileSync(join(here, "qyplayer-android-fg.svg"), androidForeground(PLAYER, PLAY_GLYPH));

/** 跑一次 tauri icon，返回生成目录（调用方负责删除） */
const renderIcons = function renderIcons(svgName) {
    const tmp = mkdtempSync(join(tmpdir(), "qyp-icon-"));
    execFileSync("pnpm", ["--filter", "@qyplayer/desktop-player", "exec", "--", "tauri", "icon", join(here, svgName), "-o", tmp], {stdio: "ignore", shell: true});
    return tmp;
};

/** 用 tauri icon 把 SVG 转成多尺寸图标，再按“生成的文件名 → 目标路径”复制需要的几个 */
const convert = function convert(svgName, copies) {
    const tmp = renderIcons(svgName);
    try {
        for (const [generated, target] of Object.entries(copies)) {
            cpSync(join(tmp, generated), join(repo, target));
        }
    } finally {
        rmSync(tmp, {recursive: true, force: true});
    }
};

/**
 * Android 的启动图标。
 * 1. 先用整张应用图标生成一套：各密度的旧版 ic_launcher.png 留给 API 26 以下回退。
 * 2. 前景层换成只有图形的透明版，否则自适应图标会把整张圆角图标放大裁掉。
 * 3. 背景层和自适应图标的定义由我们写，保证背景是应用的渐变而不是默认的白色。
 */
const convertAndroid = function convertAndroid() {
    const full = renderIcons("qyplayer.svg");
    try {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        cpSync(join(full, "android"), androidRes, {recursive: true});
    } finally {
        rmSync(full, {recursive: true, force: true});
    }

    const foreground = renderIcons("qyplayer-android-fg.svg");
    try {
        for (const density of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
            const dir = join(foreground, "android", `mipmap-${density}`);
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            cpSync(join(dir, "ic_launcher_foreground.png"), join(androidRes, `mipmap-${density}`, "ic_launcher_foreground.png"));
        }
    } finally {
        rmSync(foreground, {recursive: true, force: true});
    }

    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    writeFileSync(join(androidRes, "drawable", "ic_launcher_background.xml"), ANDROID_BACKGROUND);
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    writeFileSync(join(androidRes, "mipmap-anydpi-v26", "ic_launcher.xml"), ANDROID_ADAPTIVE_ICON);
};

/** gen/android 由 CI 上的 tauri android init 生成后提交进仓库；还没生成时跳过 Android 图标 */
const androidRes = join(repo, "apps/desktop-player/src-tauri/gen/android/app/src/main/res");

const appFiles = ["32x32.png", "128x128.png", "128x128@2x.png", "icon.ico", "icon.png"];
const appCopies = (app) => Object.fromEntries(appFiles.map((file) => [file, `apps/${app}/src-tauri/icons/${file}`]));

convert("qyplayer.svg", appCopies("desktop-player"));
convert("qymaker.svg", appCopies("desktop-maker"));
convert("qypfile.svg", {"icon.ico": "apps/desktop-player/src-tauri/icons/qyp-file.ico"});

if (existsSync(androidRes)) {
    convertAndroid();
} else {
    console.log("跳过 Android 图标：apps/desktop-player/src-tauri/gen/android 还不存在（由 CI 上的 tauri android init 生成）");
}
