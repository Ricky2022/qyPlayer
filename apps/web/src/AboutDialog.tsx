import { useRef, type MouseEvent } from "react";
import { createUseStyles } from "react-jss";
import { BUILTIN_TRACKS } from "./create/builtinMusicInfo";
import { openExternal } from "./desktop";
import { useI18n } from "./i18n";
import { LanguageSwitch } from "./ui/LanguageSwitch";
import { useDialogFocus } from "./ui/useDialogFocus";
import { Logo } from "./ui/Logo";
import { CloseIcon } from "./ui/icons";
import { theme } from "./ui/theme";

export const AUTHOR_NAME = "Ricky2022";
export const AUTHOR_URL = "https://github.com/Ricky2022";
export const REPO_URL = "https://github.com/Ricky2022/qyPlayer";
export const RELEASES_URL = `${REPO_URL}/releases/latest`;
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;
export const NOTICE_URL = `${REPO_URL}/blob/main/NOTICE`;

const useStyles = createUseStyles({
  backdrop: {
    position: "fixed", top: 0, right: 0, bottom: 0, left: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    background: "rgba(0, 0, 0, 0.62)", backdropFilter: "blur(4px)",
  },
  dialog: {
    position: "relative", width: "min(460px, 100%)", maxHeight: "100%", overflowY: "auto", boxSizing: "border-box", padding: "28px 28px 24px",
    border: `1px solid ${theme.border}`, borderRadius: 14, background: theme.surface, color: theme.text, fontFamily: theme.font,
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.55)",
  },
  close: {
    position: "absolute", top: 10, right: 10, display: "inline-flex", padding: 6, border: "none", borderRadius: "50%", background: "transparent", color: theme.muted, cursor: "pointer",
    "&:hover": { background: theme.surfaceHover, color: theme.text },
    "&:focus-visible": { outline: `2px solid ${theme.accent}` },
  },
  head: { display: "flex", alignItems: "center", marginBottom: 16, "& > * + *": { marginLeft: 16 } },
  name: { margin: 0, fontSize: 22 },
  version: { margin: "2px 0 0", color: theme.muted, fontSize: 14 },
  text: { margin: "0 0 10px", lineHeight: 1.6, color: "#c5cedc", fontSize: 14 },
  list: { display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", margin: "18px 0 0", fontSize: 14, "& dt": { color: theme.muted }, "& dd": { margin: 0, minWidth: 0, overflowWrap: "anywhere" } },
  link: { color: theme.accent, textDecoration: "none", "&:hover": { textDecoration: "underline" } },
});

interface ExternalLinkProps {
  href: string;
  children: string;
  className: string;
}

/** 外链：桌面程序里交给系统浏览器打开，网页里新开标签页 */
function ExternalLink({ href, children, className }: ExternalLinkProps) {
  const onClick = (event: MouseEvent): void => {
    event.preventDefault();
    void openExternal(href);
  };
  return (
    <a className={className} href={href} onClick={onClick}>
      {children}
    </a>
  );
}

interface AboutDialogProps {
  /** 播放器还是制作器，决定名称、简介和是否列出配乐出处 */
  kind: "player" | "maker";
  onClose(): void;
}

export function AboutDialog({ kind, onClose }: AboutDialogProps) {
  const classes = useStyles();
  const { lang, t } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useDialogFocus(dialogRef, onClose, closeRef);

  const name = kind === "player" ? t("appName") : t("makerName");
  return (
    <div className={classes.backdrop} onClick={onClose}>
      <div ref={dialogRef} className={classes.dialog} role="dialog" aria-modal="true" aria-label={`${t("about")} ${name}`} onClick={(event) => event.stopPropagation()}>
        <button ref={closeRef} className={classes.close} aria-label={t("close")} title={t("close")} onClick={onClose}>
          <CloseIcon size={20} />
        </button>
        <div className={classes.head}>
          <Logo size={64} kind={kind} />
          <div>
            <h2 className={classes.name}>{name}</h2>
            <p className={classes.version}>{t("aboutVersion", { version: __APP_VERSION__ })}</p>
          </div>
        </div>
        <p className={classes.text}>{kind === "player" ? t("aboutPlayerDesc") : t("aboutMakerDesc")}</p>
        <p className={classes.text}>{t("aboutPrivacy")}</p>
        <dl className={classes.list}>
          <dt>{t("aboutLicense")}</dt>
          <dd>
            <ExternalLink className={classes.link} href={LICENSE_URL}>
              Apache-2.0
            </ExternalLink>
          </dd>
          <dt>{t("aboutAuthor")}</dt>
          <dd>
            <ExternalLink className={classes.link} href={AUTHOR_URL}>
              {AUTHOR_NAME}
            </ExternalLink>
          </dd>
          <dt>{t("aboutSource")}</dt>
          <dd>
            <ExternalLink className={classes.link} href={REPO_URL}>
              github.com/Ricky2022/qyPlayer
            </ExternalLink>
          </dd>
          <dt>{t("aboutDownloads")}</dt>
          <dd>
            <ExternalLink className={classes.link} href={RELEASES_URL}>
              GitHub Releases
            </ExternalLink>
          </dd>
          {kind === "maker" && (
            <>
              <dt>{t("aboutMusic")}</dt>
              <dd>
                {BUILTIN_TRACKS.map((track) => (
                  <div key={track.id}>{lang === "zh" ? track.title : track.titleEn}</div>
                ))}
                <div>CC0 1.0</div>
              </dd>
              <dt>{t("aboutThirdParty")}</dt>
              <dd>
                <div>libheif-js (LGPL-3.0)</div>
                <div>mediabunny (MPL-2.0)</div>
                <ExternalLink className={classes.link} href={NOTICE_URL}>
                  NOTICE
                </ExternalLink>
              </dd>
            </>
          )}
          <dt>{t("aboutLanguage")}</dt>
          <dd>
            <LanguageSwitch />
          </dd>
        </dl>
      </div>
    </div>
  );
}
