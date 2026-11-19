/** 构建时由 vite.config.ts 注入，值取自 apps/web/package.json 的 version */
declare const __APP_VERSION__: string;

interface Window {
  /** 界面已经渲染完成；boot-guard.js 用它判断是不是卡在启动阶段 */
  __qyMounted?: boolean;
}
