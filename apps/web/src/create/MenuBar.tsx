import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createUseStyles } from "react-jss";
import { MenuIcon } from "../ui/icons";
import { theme } from "../ui/theme";
import type { CommandStatus, MenuCommand } from "./editor/menu";

/** 菜单里的命令；“language”只出现在手机的菜单里 */
export type BarCommand = MenuCommand | "language";

export interface MenuEntry {
  command: BarCommand;
  label: string;
  shortcut?: string | undefined;
  status: CommandStatus;
}

export interface MenuGroup {
  id: string;
  label: string;
  entries: readonly MenuEntry[];
}

const useStyles = createUseStyles({
  bar: { display: "flex", alignItems: "center", gap: 2 },
  wrap: { position: "relative" },
  top: {
    minHeight: 34, padding: "4px 12px", border: "none", borderRadius: 6, background: "transparent", color: theme.text, font: "inherit", fontSize: 14, cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 6,
    "&:hover, &[aria-expanded=true]": { background: theme.surfaceHover },
    "&:focus-visible": { outline: `2px solid ${theme.accent}`, outlineOffset: -2 },
  },
  menu: {
    position: "absolute", top: "100%", left: 0, zIndex: 15, minWidth: 230, margin: "2px 0 0", padding: 4, boxSizing: "border-box",
    border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.surface, boxShadow: "0 12px 32px rgba(0, 0, 0, 0.5)",
  },
  item: {
    display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", gap: 24, minHeight: 36, padding: "6px 12px", border: "none", borderRadius: 6,
    background: "transparent", color: theme.text, font: "inherit", fontSize: 14, textAlign: "left", cursor: "pointer",
    "&:hover, &:focus-visible": { background: theme.surfaceHover, outline: "none" },
    "&[aria-disabled=true]": { color: theme.muted, cursor: "default", opacity: 0.6 },
    "&:focus-visible": { boxShadow: `inset 0 0 0 2px ${theme.accent}` },
  },
  shortcut: { color: theme.muted, fontSize: 12, whiteSpace: "nowrap" },
  separator: { height: 1, margin: "4px 8px", background: theme.border },
});

interface MenuBarProps {
  groups: readonly MenuGroup[];
  label: string;
  onCommand(command: BarCommand): void;
  /** 手机布局：所有命令合并成一个“菜单”按钮下的竖向列表 */
  compact?: { label: string };
}

const visible = (group: MenuGroup): MenuEntry[] => group.entries.filter((entry) => entry.status !== "hidden");

/** 页内自绘的菜单栏（3A.3）：点击展开、悬停切换、Alt/F10 聚焦、方向键和 Esc 操作 */
export function MenuBar({ groups, label, onCommand, compact }: MenuBarProps) {
  const classes = useStyles();
  const rootRef = useRef<HTMLDivElement>(null);
  const topRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const [open, setOpen] = useState<number | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ group: number; item: number } | null>(null);

  // 手机布局只有一个按钮，把所有组合并成一组，组与组之间画分隔线
  const effective: MenuGroup[] = compact ? [{ id: "all", label: compact.label, entries: groups.flatMap((g) => g.entries) }] : [...groups];
  const separatorsBefore = new Set<number>();
  if (compact) {
    let index = 0;
    groups.forEach((group, groupIndex) => {
      if (groupIndex > 0) separatorsBefore.add(index);
      index += visible(group).length;
    });
  }

  useEffect(() => {
    if (!focusRequest) return;
    itemRefs.current.get(`${focusRequest.group}:${focusRequest.item}`)?.focus();
    setFocusRequest(null);
  }, [focusRequest, open]);

  useEffect(() => {
    if (open === null) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Alt 单独按下再松开，或按 F10：把焦点移到菜单栏
  useEffect(() => {
    let altAlone = false;
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "F10") {
        event.preventDefault();
        topRefs.current[0]?.focus();
        return;
      }
      altAlone = event.key === "Alt" && !event.repeat;
    };
    const onKeyUp = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Alt" && altAlone) {
        altAlone = false;
        topRefs.current[0]?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const count = effective.length;
  const openMenu = (group: number, item: number | null): void => {
    setOpen(group);
    if (item !== null) setFocusRequest({ group, item });
  };
  const closeTo = (group: number): void => {
    setOpen(null);
    topRefs.current[group]?.focus();
  };

  const onTopKey = (event: KeyboardEvent, group: number): void => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowLeft": {
        if (count < 2) return;
        const next = (group + (event.key === "ArrowRight" ? 1 : count - 1)) % count;
        topRefs.current[next]?.focus();
        if (open !== null) openMenu(next, null);
        break;
      }
      case "ArrowDown":
      case "Enter":
      case " ":
        openMenu(group, 0);
        break;
      case "ArrowUp":
        openMenu(group, visible(effective[group]!).length - 1);
        break;
      case "Escape":
        if (open === null) return;
        closeTo(group);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const onItemKey = (event: KeyboardEvent, group: number, item: number, size: number): void => {
    const move = (to: number): void => setFocusRequest({ group, item: (to + size) % size });
    switch (event.key) {
      case "ArrowDown":
        move(item + 1);
        break;
      case "ArrowUp":
        move(item - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(size - 1);
        break;
      case "ArrowRight":
      case "ArrowLeft":
        if (count < 2) return;
        openMenu((group + (event.key === "ArrowRight" ? 1 : count - 1)) % count, 0);
        break;
      case "Escape":
        closeTo(group);
        break;
      case "Tab":
        setOpen(null);
        return;
      default:
        return;
    }
    event.preventDefault();
  };

  const activate = (group: number, entry: MenuEntry): void => {
    if (entry.status !== "enabled") return;
    // 先让焦点回到菜单标题，随后弹出的对话框关闭时焦点才有地方回去
    closeTo(group);
    onCommand(entry.command);
  };

  return (
    <div
      ref={rootRef}
      className={classes.bar}
      role="menubar"
      aria-label={label}
      onBlur={(event) => {
        // 焦点移出菜单栏（例如点了别处或用 Tab 离开）就收起菜单
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(null);
      }}
    >
      {effective.map((group, groupIndex) => {
        const entries = visible(group);
        const isOpen = open === groupIndex;
        return (
          <div key={group.id} className={classes.wrap}>
            <button
              ref={(element) => {
                topRefs.current[groupIndex] = element;
              }}
              className={classes.top}
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={isOpen}
              tabIndex={groupIndex === 0 ? 0 : -1}
              onClick={() => (isOpen ? setOpen(null) : openMenu(groupIndex, null))}
              onMouseEnter={() => open !== null && open !== groupIndex && openMenu(groupIndex, null)}
              onKeyDown={(event) => onTopKey(event, groupIndex)}
            >
              {compact && <MenuIcon size={20} />}
              {group.label}
            </button>
            {isOpen && (
              <div className={classes.menu} role="menu" aria-label={group.label}>
                {entries.map((entry, index) => (
                  <div key={entry.command}>
                    {separatorsBefore.has(index) && <div className={classes.separator} role="separator" />}
                    <button
                      ref={(element) => {
                        if (element) itemRefs.current.set(`${groupIndex}:${index}`, element);
                        else itemRefs.current.delete(`${groupIndex}:${index}`);
                      }}
                      className={classes.item}
                      role="menuitem"
                      tabIndex={-1}
                      aria-disabled={entry.status !== "enabled"}
                      aria-keyshortcuts={entry.shortcut?.replace("⌘", "Meta+")}
                      onClick={() => activate(groupIndex, entry)}
                      onKeyDown={(event) => onItemKey(event, groupIndex, index, entries.length)}
                    >
                      <span>{entry.label}</span>
                      {entry.shortcut && <span className={classes.shortcut}>{entry.shortcut}</span>}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
