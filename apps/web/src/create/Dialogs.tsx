import { useRef, type ReactNode } from "react";
import { createUseStyles } from "react-jss";
import { useI18n } from "../i18n";
import { theme } from "../ui/theme";
import { useDialogFocus } from "../ui/useDialogFocus";

const useStyles = createUseStyles({
  backdrop: {
    position: "fixed", inset: 0, zIndex: 20, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    background: "rgba(0, 0, 0, 0.62)", backdropFilter: "blur(4px)",
  },
  dialog: {
    width: "min(440px, 100%)", boxSizing: "border-box", padding: "22px 24px 18px", border: `1px solid ${theme.border}`, borderRadius: 12,
    background: theme.surface, color: theme.text, fontFamily: theme.font, boxShadow: "0 20px 60px rgba(0, 0, 0, 0.55)",
  },
  title: { margin: "0 0 10px", fontSize: 17 },
  body: { margin: 0, lineHeight: 1.6, whiteSpace: "pre-line", overflowWrap: "anywhere" },
  actions: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 },
  button: {
    minHeight: 36, padding: "6px 18px", border: `1px solid ${theme.border}`, borderRadius: 999, background: theme.surface, color: theme.text, font: "inherit", cursor: "pointer",
    "&:hover": { background: theme.surfaceHover },
    "&:focus-visible": { outline: `2px solid ${theme.accent}`, outlineOffset: 2 },
  },
  primary: { background: theme.accent, borderColor: theme.accent, color: theme.onAccent, fontWeight: 600, "&:hover": { background: "#67d0fb" } },
});

interface ShellProps {
  title?: string;
  /** 打开时先聚焦的按钮；缺省聚焦第一个 */
  initialFocus: "cancel" | "confirm";
  onCancel(): void;
  children: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  onConfirm(): void;
  /** 只显示确认按钮（错误框） */
  confirmOnly?: boolean;
}

function DialogShell({ title, initialFocus, onCancel, children, cancelLabel, confirmLabel, onConfirm, confirmOnly }: ShellProps) {
  const classes = useStyles();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useDialogFocus(dialogRef, onCancel, initialFocus === "cancel" ? cancelRef : confirmRef);
  return (
    <div className={classes.backdrop} onClick={onCancel}>
      <div ref={dialogRef} className={classes.dialog} role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        {title && <h2 className={classes.title}>{title}</h2>}
        <p className={classes.body}>{children}</p>
        <div className={classes.actions}>
          {!confirmOnly && (
            <button ref={cancelRef} className={classes.button} onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
          <button ref={confirmRef} className={`${classes.button} ${classes.primary}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  message: string;
  confirmLabel: string;
  onConfirm(): void;
  onCancel(): void;
}

/** 确认框：默认焦点在“取消”，Esc 等同取消（3A.12） */
export function ConfirmDialog({ message, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const { t } = useI18n();
  return (
    <DialogShell initialFocus="cancel" cancelLabel={t("cancel")} confirmLabel={confirmLabel} onCancel={onCancel} onConfirm={onConfirm}>
      {message}
    </DialogShell>
  );
}

interface MessageDialogProps {
  message: string;
  onClose(): void;
}

/** 错误框：只有一个“确定”按钮 */
export function MessageDialog({ message, onClose }: MessageDialogProps) {
  const { t } = useI18n();
  return (
    <DialogShell title={t("dialogErrorTitle")} initialFocus="confirm" cancelLabel="" confirmLabel={t("ok")} onCancel={onClose} onConfirm={onClose} confirmOnly>
      {message}
    </DialogShell>
  );
}
