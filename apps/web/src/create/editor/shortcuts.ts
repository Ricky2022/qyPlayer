// 键盘快捷键（docs/dev-0.3.0.md 3A.3）：由按键得到菜单命令，以及菜单里显示的快捷键文字。
import type { MenuCommand } from "./menu";

export interface KeyInfo {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export interface ShortcutContext {
  /** Mac 上用 Command 代替 Ctrl */
  isMac: boolean;
  /** 焦点在文本输入框里：撤销和重做留给输入框自己 */
  inTextField: boolean;
}

/** 返回按键对应的命令；没有对应命令时返回 null（此时不要阻止浏览器的默认行为） */
export function commandForShortcut(event: KeyInfo, context: ShortcutContext): MenuCommand | null {
  const primary = context.isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (!primary || event.altKey) return null;
  switch (event.key.toLowerCase()) {
    case "o":
      return event.shiftKey ? null : "open";
    case "s":
      return event.shiftKey ? null : "save";
    case "e":
      return event.shiftKey ? null : "exportMp4";
    case "i":
      return event.shiftKey ? null : "addMedia";
    case "z":
      if (context.inTextField) return null;
      return event.shiftKey ? "redo" : "undo";
    case "y":
      return context.inTextField || event.shiftKey ? null : "redo";
    default:
      return null;
  }
}

/** 菜单里显示的快捷键文字；没有快捷键的命令返回 undefined */
export function shortcutLabel(command: MenuCommand, isMac: boolean): string | undefined {
  const primary = isMac ? "⌘" : "Ctrl+";
  switch (command) {
    case "open":
      return `${primary}O`;
    case "save":
      return `${primary}S`;
    case "exportMp4":
      return `${primary}E`;
    case "undo":
      return `${primary}Z`;
    case "redo":
      return isMac ? "⇧⌘Z" : "Ctrl+Y";
    case "addMedia":
      return `${primary}I`;
    default:
      return undefined;
  }
}
