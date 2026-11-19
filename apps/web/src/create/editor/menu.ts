// 菜单命令在当前状态下是否可用（docs/dev-0.3.0.md 3A.3）。

import { GENERATOR_LIMITS } from "@qyplayer/core";

export type MenuCommand = "new" | "open" | "save" | "exportMp4" | "undo" | "redo" | "addMedia" | "sortByTime" | "resetPages" | "about";

export type CommandStatus = "enabled" | "disabled" | "hidden";

export interface MenuContext {
  mediaCount: number;
  /** 正在保存、导出、打开包或检查素材 */
  busy: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** 当前环境能导出 MP4（电脑浏览器或桌面制作器，且支持所需接口） */
  canExport: boolean;
  /** 影片处于手动编排（做过单页修改） */
  manualPages: boolean;
}

const flag = (on: boolean): CommandStatus => (on ? "enabled" : "disabled");

export function menuStatus(ctx: MenuContext): Record<MenuCommand, CommandStatus> {
  const hasMedia = ctx.mediaCount >= 1;
  return {
    new: flag(!ctx.busy),
    open: flag(!ctx.busy),
    save: flag(hasMedia && !ctx.busy),
    exportMp4: ctx.canExport ? flag(hasMedia && !ctx.busy) : "hidden",
    undo: flag(ctx.canUndo && !ctx.busy),
    redo: flag(ctx.canRedo && !ctx.busy),
    addMedia: flag(ctx.mediaCount < GENERATOR_LIMITS.maxMedia && !ctx.busy),
    sortByTime: flag(ctx.mediaCount >= 2),
    resetPages: flag(ctx.manualPages && !ctx.busy),
    about: "enabled",
  };
}
