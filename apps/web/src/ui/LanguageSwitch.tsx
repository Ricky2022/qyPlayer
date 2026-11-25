import {createUseStyles} from "react-jss";
import {LANG_NAMES, otherLang, useI18n} from "../i18n";
import {GlobeIcon} from "./icons";
import {theme} from "./theme";

const useStyles = createUseStyles({
    button: {
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        border: `1px solid ${theme.border}`,
        borderRadius: 999,
        background: "transparent",
        color: theme.text,
        font: "inherit",
        fontSize: 14,
        cursor: "pointer",
        "&:hover": {background: theme.surfaceHover},
        "&:focus-visible": {outline: `2px solid ${theme.accent}`},
    },
});

/** 语言切换：按钮上写的是“点了会变成”的那种语言的名字 */
export const LanguageSwitch = function LanguageSwitch() {
    const classes = useStyles();
    const {lang, t, setLang} = useI18n();
    const target = otherLang(lang);
    return (
        <button className={classes.button} aria-label={t("switchLanguage")} title={t("switchLanguage")} onClick={() => setLang(target)}>
            <GlobeIcon size={18} />
            {LANG_NAMES[target]}
        </button>
    );
};
