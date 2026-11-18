import { createUseStyles } from "react-jss";
import { TEMPLATES, type AspectRatio } from "@qyplayer/core";
import { useI18n } from "../i18n";
import { theme } from "../ui/theme";
import type { MusicEntry } from "./buildPackage";
import { BUILTIN_TRACKS } from "./builtinMusicInfo";
import type { AspectChoice, EditorDoc, MusicChoice } from "./editor/state";
import { formatDuration } from "./files";

const useStyles = createUseStyles({
  panel: { height: "100%", overflowY: "auto", boxSizing: "border-box", padding: "4px 14px 20px" },
  disabled: { opacity: 0.45, pointerEvents: "none" },
  section: { margin: "14px 0 0", padding: 0, border: "none", minWidth: 0 },
  legend: { padding: 0, marginBottom: 6, fontSize: 13, fontWeight: 600, color: theme.muted },
  label: { display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600, color: theme.muted },
  input: {
    width: "100%", minHeight: 36, padding: "6px 8px", borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.surface, color: theme.text, font: "inherit", boxSizing: "border-box",
    "&:focus-visible": { outline: `2px solid ${theme.accent}` },
  },
  choices: { display: "flex", flexDirection: "column", gap: 4 },
  choice: { display: "flex", alignItems: "flex-start", gap: 8, minHeight: 28, padding: "4px 0", fontSize: 14, cursor: "pointer" },
  card: {
    display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px", border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.surface, cursor: "pointer",
    "&:hover": { background: theme.surfaceHover },
  },
  cardOn: { borderColor: theme.accent },
  cardText: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  cardName: { fontSize: 14, fontWeight: 600 },
  hint: { fontSize: 12, color: theme.muted },
  button: {
    minHeight: 36, padding: "6px 14px", border: `1px solid ${theme.border}`, borderRadius: 999, background: theme.surface, color: theme.text, cursor: "pointer", font: "inherit",
    "&:hover": { background: theme.surfaceHover },
    "&:focus-visible": { outline: `2px solid ${theme.accent}` },
  },
});

interface SettingsPanelProps {
  doc: EditorDoc;
  /** 画面比例选“自动”时当前的判定结果 */
  resolvedAspect: AspectRatio;
  /** 没有素材时整个面板灰显且不可操作 */
  disabled: boolean;
  hasVideoSound: boolean;
  /** 最近一次选择的导入音乐，用于在“不使用”和“导入音乐”之间来回切换 */
  customMusic: MusicEntry | null;
  placeholderTitle: string;
  onTitle(title: string): void;
  onAspect(aspect: AspectChoice): void;
  onTemplate(templateId: string): void;
  onMusic(music: MusicChoice): void;
  onPickMusic(): void;
  onReroll(): void;
}

/** 设置面板（3A.9）：标题、比例、模板、配乐、换一版 */
export function SettingsPanel({ doc, resolvedAspect, disabled, hasVideoSound, customMusic, placeholderTitle, onTitle, onAspect, onTemplate, onMusic, onPickMusic, onReroll }: SettingsPanelProps) {
  const classes = useStyles();
  const { lang, t } = useI18n();
  const ratioName = resolvedAspect === "16:9" ? t("makerLandscape") : t("makerPortrait");
  const aspects: { value: AspectChoice; label: string }[] = [
    { value: "auto", label: t("makerAspectAuto", { ratio: ratioName }) },
    { value: "16:9", label: t("makerLandscape") },
    { value: "9:16", label: t("makerPortrait") },
  ];
  const track = BUILTIN_TRACKS[0]!;
  const pickedCustom = doc.music.kind === "custom" ? doc.music.entry : customMusic;

  return (
    <div className={`${classes.panel} ${disabled ? classes.disabled : ""}`} aria-disabled={disabled}>
      <div className={classes.section}>
        <label className={classes.label} htmlFor="qy-title">
          {t("makerTitle")}
        </label>
        <input id="qy-title" className={classes.input} value={doc.title} maxLength={100} disabled={disabled} placeholder={placeholderTitle} onChange={(event) => onTitle(event.target.value)} />
      </div>

      <fieldset className={classes.section}>
        <legend className={classes.legend}>{t("makerAspect")}</legend>
        <div className={classes.choices}>
          {aspects.map((option) => (
            <label key={option.value} className={classes.choice}>
              <input type="radio" name="qy-aspect" checked={doc.aspect === option.value} disabled={disabled} onChange={() => onAspect(option.value)} /> {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={classes.section}>
        <legend className={classes.legend}>{t("makerTemplate")}</legend>
        <div className={classes.choices}>
          {TEMPLATES.map((template) => (
            <label key={template.id} className={`${classes.card} ${doc.templateId === template.id ? classes.cardOn : ""}`}>
              <input type="radio" name="qy-template" checked={doc.templateId === template.id} disabled={disabled} onChange={() => onTemplate(template.id)} />
              <span className={classes.cardText}>
                <span className={classes.cardName}>{template.name[lang]}</span>
                <span className={classes.hint}>{template.description[lang]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={classes.section}>
        <legend className={classes.legend}>{t("makerMusic")}</legend>
        <div className={classes.choices}>
          <label className={classes.choice}>
            <input type="radio" name="qy-music" checked={doc.music.kind === "none"} disabled={disabled} onChange={() => onMusic({ kind: "none" })} /> {t("makerMusicNone")}
          </label>
          <label className={classes.choice}>
            <input
              type="radio"
              name="qy-music"
              checked={doc.music.kind === "builtin"}
              disabled={disabled}
              onChange={() => onMusic({ kind: "builtin", trackId: track.id })}
            />{" "}
            {t("makerMusicBuiltin", { title: lang === "zh" ? track.title : track.titleEn })}
          </label>
          <label className={classes.choice}>
            <input
              type="radio"
              name="qy-music"
              checked={doc.music.kind === "custom"}
              disabled={disabled || !pickedCustom}
              onChange={() => pickedCustom && onMusic({ kind: "custom", entry: pickedCustom })}
            />{" "}
            <span>
              {t("makerMusicCustom")}
              {pickedCustom ? t("makerMusicCustomPicked", { title: pickedCustom.title ?? "", duration: formatDuration(pickedCustom.duration) }) : ""}
            </span>
          </label>
          <div>
            <button className={classes.button} disabled={disabled} onClick={onPickMusic}>
              {t("makerPickMusic")}
            </button>
          </div>
          {doc.music.kind !== "none" && hasVideoSound && <div className={classes.hint}>{t("makerMuteNote")}</div>}
        </div>
      </fieldset>

      <div className={classes.section}>
        <button className={classes.button} disabled={disabled} onClick={onReroll}>
          {t("makerAnother")}
        </button>
      </div>
    </div>
  );
}
