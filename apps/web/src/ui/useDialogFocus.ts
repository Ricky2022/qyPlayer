import {useEffect, useRef, type RefObject} from "react";

const FOCUSABLE = "button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex=\"-1\"])";

/**
 * 对话框的焦点管理（WCAG）：打开时焦点进入对话框并限制在其中，Esc 触发 onEscape，关闭后焦点回到原来的元素。
 * initialFocus 缺省时聚焦对话框里第一个可聚焦元素。
 */
// eslint-disable-next-line @stylistic/max-len
export const useDialogFocus = function useDialogFocus(dialog: RefObject<HTMLElement | null>, onEscape: () => void, initialFocus?: RefObject<HTMLElement | null>): void {
    const escapeRef = useRef(onEscape);
    escapeRef.current = onEscape;

    useEffect(() => {
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const root = dialog.current;
        (initialFocus?.current ?? root?.querySelector<HTMLElement>(FOCUSABLE) ?? root)?.focus();

        const onKey = (event: KeyboardEvent): void => {
            if (event.key === "Escape") {
                event.stopPropagation();
                escapeRef.current();
                return;
            }
            if (event.key !== "Tab" || !root) {
                return;
            }
            const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
            if (items.length === 0) {
                event.preventDefault();
                return;
            }
            const first = items[0]!;
            const last = items[items.length - 1]!;
            if (!root.contains(document.activeElement)) {
                event.preventDefault();
                first.focus();
            } else if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener("keydown", onKey, true);
        return () => {
            document.removeEventListener("keydown", onKey, true);
            previous?.focus();
        };
    // 只在打开和关闭时运行：dialog 和 initialFocus 是 ref，onEscape 的最新值走 escapeRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
};
