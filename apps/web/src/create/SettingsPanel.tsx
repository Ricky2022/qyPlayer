import {createUseStyles} from "react-jss";
import {LENGTH_MIN_MEDIA, TEMPLATES, targetCount, type AspectRatio, type LengthChoice} from "@qyplayer/core";
import {useI18n} from "../i18n";
import {theme} from "../ui/theme";
import type {MusicEntry} from "./buildPackage";
import {BUILTIN_TRACKS} from "./builtinMusicInfo";
import type {AspectChoice, EditorDoc, LookSetting, MusicChoice, TransitionSetting} from "./editor/state";
import type {TranscodeNote} from "./environment";
import {formatDuration} from "./files";
import {useTrackPreview} from "./useTrackPreview";

const useStyles = createUseStyles({
    panel: {height: "100%", overflowY: "auto", boxSizing: "border-box", padding: "4px 14px 20px"},
    disabled: {opacity: 0.45, pointerEvents: "none"},
    // 转码是用户偏好，不是影片内容：没有素材时也要能在添加前改
    alwaysOn: {opacity: 1, pointerEvents: "auto"},
    section: {margin: "14px 0 0", padding: 0, border: "none", minWidth: 0},
    legend: {padding: 0, marginBottom: 6, fontSize: 13, fontWeight: 600, color: theme.muted},
    label: {display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600, color: theme.muted},
    input: {
        width: "100%",
        minHeight: 36,
        padding: "6px 8px",
        borderRadius: 6,
        border: `1px solid ${theme.border}`,
        background: theme.surface,
        color: theme.text,
        font: "inherit",
        boxSizing: "border-box",
        "&:focus-visible": {outline: `2px solid ${theme.accent}`},
    },
    choices: {display: "flex", flexDirection: "column", gap: 4},
    choice: {display: "flex", alignItems: "flex-start", gap: 8, minHeight: 28, padding: "4px 0", fontSize: 14, cursor: "pointer"},
    card: {
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "8px 10px",
        border: `1px solid ${theme.border}`,
        borderRadius: 8,
        background: theme.surface,
        cursor: "pointer",
        "&:hover": {background: theme.surfaceHover},
    },
    cardOn: {borderColor: theme.accent},
    track: {display: "flex", alignItems: "center", gap: 8},
    trackLabel: {display: "flex", alignItems: "flex-start", gap: 8, flex: 1, minWidth: 0, minHeight: 28, padding: "4px 0", fontSize: 14, cursor: "pointer"},
    small: {
        flex: "none",
        minHeight: 30,
        minWidth: 54,
        padding: "2px 12px",
        border: `1px solid ${theme.border}`,
        borderRadius: 999,
        background: theme.surface,
        color: theme.text,
        cursor: "pointer",
        font: "inherit",
        fontSize: 13,
        "&:hover": {background: theme.surfaceHover},
        "&:focus-visible": {outline: `2px solid ${theme.accent}`},
    },
    cardText: {display: "flex", flexDirection: "column", gap: 2, minWidth: 0},
    cardName: {fontSize: 14, fontWeight: 600},
    hint: {fontSize: 12, color: theme.muted},
    sliderRow: {display: "flex", alignItems: "center", gap: 8, minHeight: 28, fontSize: 14},
    slider: {flex: 1, minWidth: 0, accentColor: theme.accent},
    percent: {flex: "none", minWidth: 40, textAlign: "right", fontVariantNumeric: "tabular-nums"},
    button: {
        minHeight: 36,
        padding: "6px 14px",
        border: `1px solid ${theme.border}`,
        borderRadius: 999,
        background: theme.surface,
        color: theme.text,
        cursor: "pointer",
        font: "inherit",
        "&:hover": {background: theme.surfaceHover},
        "&:focus-visible": {outline: `2px solid ${theme.accent}`},
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
    /** 转码开关（5.2）：checked 是当前生效的值；canChange 为假时不可点击 */
    transcode: {
        checked: boolean;
        canChange: boolean;
        note: TranscodeNote;
    };
    onTranscode: (on: boolean) => void;
    onTitle: (title: string) => void;
    onSubtitle: (subtitle: string) => void;
    onShowTitle: (show: boolean) => void;
    onAspect: (aspect: AspectChoice) => void;
    onTemplate: (templateId: string) => void;
    onTransition: (transition: TransitionSetting) => void;
    onLook: (look: LookSetting) => void;
    onLength: (length: LengthChoice) => void;
    onMusic: (music: MusicChoice) => void;
    onMusicVolume: (volume: number, at: number) => void;
    onVideoVolume: (volume: number, at: number) => void;
    onDuckMusic: (duck: boolean) => void;
    onPickMusic: () => void;
    onReroll: () => void;
}

/** 设置面板（3A.9）：标题、比例、模板、转场、配乐、换一版 */
// eslint-disable-next-line @stylistic/max-len
export const SettingsPanel = function SettingsPanel({doc, resolvedAspect, disabled, hasVideoSound, customMusic, placeholderTitle, transcode, onTranscode, onTitle, onSubtitle, onShowTitle, onAspect, onTemplate, onTransition, onLook, onLength, onMusic, onMusicVolume, onVideoVolume, onDuckMusic, onPickMusic, onReroll}: SettingsPanelProps) {
    const classes = useStyles();
    const {lang, t} = useI18n();
    const ratioName = resolvedAspect === "16:9" ? t("makerLandscape") : t("makerPortrait");
    const aspects: {
        value: AspectChoice;
        label: string;
    }[] = [
        {value: "auto", label: t("makerAspectAuto", {ratio: ratioName})},
        {value: "16:9", label: t("makerLandscape")},
        {value: "9:16", label: t("makerPortrait")},
    ];
    const transitions: {
        value: TransitionSetting;
        label: string;
    }[] = [
        {value: "auto", label: t("makerTransitionAuto")},
        {value: "fade", label: t("makerTransitionFade")},
        {value: "slide", label: t("makerTransitionSlide")},
        {value: "zoom", label: t("makerTransitionZoom")},
        {value: "rotate", label: t("makerTransitionRotate")},
    ];
    const looks: {
        value: LookSetting;
        label: string;
    }[] = [
        {value: "original", label: t("makerLookOriginal")},
        {value: "mono", label: t("makerLookMono")},
        {value: "warm", label: t("makerLookWarm")},
        {value: "cool", label: t("makerLookCool")},
        {value: "vintage", label: t("makerLookVintage")},
    ];
    const lengths: {
        value: LengthChoice;
        label: string;
    }[] = [
        {value: "long", label: t("makerLengthLong")},
        {value: "medium", label: t("makerLengthMedium", {count: targetCount(doc.media.length, "medium")})},
        {value: "short", label: t("makerLengthShort", {count: targetCount(doc.media.length, "short")})},
    ];
    const lengthLocked = doc.media.length < LENGTH_MIN_MEDIA;
    const preview = useTrackPreview();
    const pickedCustom = doc.music.kind === "custom" ? doc.music.entry : customMusic;

    return (
        <div className={`${classes.panel} ${disabled ? classes.disabled : ""}`} aria-disabled={disabled}>
            <div className={classes.section}>
                <label className={classes.label} htmlFor="qy-title">
                    {t("makerTitle")}
                </label>
                <input id="qy-title" className={classes.input} value={doc.title} maxLength={100} disabled={disabled} placeholder={placeholderTitle} onChange={(event) => onTitle(event.target.value)} />
                <label className={classes.label} htmlFor="qy-subtitle" style={{marginTop: 10}}>
                    {t("makerSubtitle")}
                </label>
                <input id="qy-subtitle" className={classes.input} value={doc.subtitle} maxLength={100} disabled={disabled} placeholder={t("makerSubtitlePlaceholder")} onChange={(event) => onSubtitle(event.target.value)} />
                <label className={classes.choice}>
                    <input type="checkbox" checked={doc.showTitle} disabled={disabled} onChange={(event) => onShowTitle(event.target.checked)} />
                    {" "}
                    {t("makerShowTitle")}
                </label>
            </div>

            <fieldset className={classes.section}>
                <legend className={classes.legend}>{t("makerAspect")}</legend>
                <div className={classes.choices}>
                    {aspects.map((option) => (
                        <label key={option.value} className={classes.choice}>
                            <input type="radio" name="qy-aspect" checked={doc.aspect === option.value} disabled={disabled} onChange={() => onAspect(option.value)} />
                            {" "}
                            {option.label}
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
                <legend className={classes.legend}>{t("makerLength")}</legend>
                <div className={classes.choices}>
                    {lengths.map((option) => (
                        <label key={option.value} className={classes.choice}>
                            <input type="radio" name="qy-length" checked={doc.length === option.value} disabled={disabled || lengthLocked} onChange={() => onLength(option.value)} />
                            {" "}
                            {option.label}
                        </label>
                    ))}
                </div>
                {lengthLocked && <p className={classes.hint}>{t("makerLengthFew", {min: LENGTH_MIN_MEDIA})}</p>}
            </fieldset>

            <fieldset className={classes.section}>
                <legend className={classes.legend}>{t("makerTransition")}</legend>
                <div className={classes.choices}>
                    {transitions.map((option) => (
                        <label key={option.value} className={classes.choice}>
                            <input type="radio" name="qy-transition" checked={doc.transition === option.value} disabled={disabled} onChange={() => onTransition(option.value)} />
                            {" "}
                            {option.label}
                        </label>
                    ))}
                </div>
            </fieldset>

            <fieldset className={classes.section}>
                <legend className={classes.legend}>{t("makerLook")}</legend>
                <div className={classes.choices}>
                    {looks.map((option) => (
                        <label key={option.value} className={classes.choice}>
                            <input type="radio" name="qy-look" checked={doc.look === option.value} disabled={disabled} onChange={() => onLook(option.value)} />
                            {" "}
                            {option.label}
                        </label>
                    ))}
                </div>
            </fieldset>

            <fieldset className={classes.section}>
                <legend className={classes.legend}>{t("makerMusic")}</legend>
                <div className={classes.choices}>
                    <label className={classes.choice}>
                        <input type="radio" name="qy-music" checked={doc.music.kind === "none"} disabled={disabled} onChange={() => onMusic({kind: "none"})} />
                        {" "}
                        {t("makerMusicNone")}
                    </label>
                    {BUILTIN_TRACKS.map((track) => {
                        const name = lang === "zh" ? track.title : track.titleEn;
                        const isPlaying = preview.playing === track.id;
                        return (
                            <div key={track.id} className={classes.track}>
                                <label className={classes.trackLabel}>
                                    <input
                                        type="radio"
                                        name="qy-music"
                                        checked={doc.music.kind === "builtin" && doc.music.trackId === track.id}
                                        disabled={disabled}
                                        onChange={() => onMusic({kind: "builtin", trackId: track.id})}
                                    />
                                    <span>
                                        {t("makerMusicBuiltin", {
                                            title: name,
                                            mood: lang === "zh" ? track.mood : track.moodEn,
                                            duration: formatDuration(track.duration),
                                        })}
                                    </span>
                                </label>
                                <button
                                    className={classes.small}
                                    disabled={disabled}
                                    aria-label={t(isPlaying ? "musicPreviewStopAria" : "musicPreviewAria", {title: name})}
                                    onClick={() => preview.toggle(track)}
                                >
                                    {t(isPlaying ? "musicPreviewStop" : "musicPreview")}
                                </button>
                            </div>
                        );
                    })}
                    <div className={classes.hint}>{t("makerMusicBuiltinNote")}</div>
                    <label className={classes.choice}>
                        <input
                            type="radio"
                            name="qy-music"
                            checked={doc.music.kind === "custom"}
                            disabled={disabled || !pickedCustom}
                            onChange={() => pickedCustom && onMusic({kind: "custom", entry: pickedCustom})}
                        />
                        {" "}
                        <span>
                            {t("makerMusicCustom")}
                            {pickedCustom ? t("makerMusicCustomPicked", {title: pickedCustom.title ?? "", duration: formatDuration(pickedCustom.duration)}) : ""}
                        </span>
                    </label>
                    <div>
                        <button className={classes.button} disabled={disabled} onClick={onPickMusic}>
                            {t("makerPickMusic")}
                        </button>
                    </div>
                    {doc.music.kind !== "none" && (
                        <label className={classes.sliderRow} htmlFor="qy-music-volume">
                            {t("makerMusicVolume")}
                            <input
                                id="qy-music-volume"
                                className={classes.slider}
                                type="range"
                                min={0}
                                max={1}
                                step={0.05}
                                value={doc.musicVolume}
                                disabled={disabled}
                                onChange={(event) => onMusicVolume(Number(event.target.value), Date.now())}
                            />
                            <span className={classes.percent}>{`${Math.round(doc.musicVolume * 100)}%`}</span>
                        </label>
                    )}
                    {hasVideoSound && (
                        <label className={classes.sliderRow} htmlFor="qy-video-volume">
                            {t("makerVideoVolume")}
                            <input
                                id="qy-video-volume"
                                className={classes.slider}
                                type="range"
                                min={0}
                                max={1}
                                step={0.05}
                                value={doc.videoVolume}
                                disabled={disabled}
                                onChange={(event) => onVideoVolume(Number(event.target.value), Date.now())}
                            />
                            <span className={classes.percent}>{`${Math.round(doc.videoVolume * 100)}%`}</span>
                        </label>
                    )}
                    {doc.music.kind !== "none" && hasVideoSound && (
                        <label className={classes.choice}>
                            <input type="checkbox" checked={doc.duckMusic} disabled={disabled || doc.videoVolume === 0} onChange={(event) => onDuckMusic(event.target.checked)} />
                            {" "}
                            {t("makerDuck")}
                        </label>
                    )}
                </div>
            </fieldset>

            <fieldset className={`${classes.section} ${classes.alwaysOn}`}>
                <legend className={classes.legend}>{t("makerTranscode")}</legend>
                <label className={classes.choice}>
                    <input type="checkbox" checked={transcode.checked} disabled={!transcode.canChange} onChange={(event) => onTranscode(event.target.checked)} />
                    {" "}
                    {t("makerTranscodeLabel")}
                </label>
                {transcode.note !== "none"
                    && <div className={classes.hint}>{t(transcode.note === "mobile" ? "makerTranscodeNoteMobile" : "makerTranscodeNoteUnsupported")}</div>}
            </fieldset>

            <div className={classes.section}>
                <button className={classes.button} disabled={disabled} onClick={onReroll}>
                    {t("makerAnother")}
                </button>
            </div>
        </div>
    );
};
