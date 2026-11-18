//! 播放器和制作器共用的 Tauri 命令：改窗口标题、用系统浏览器打开白名单里的链接。

use tauri_plugin_opener::OpenerExt;

/// 允许从程序里打开的链接前缀：作者主页和项目仓库。
/// 网页不能借此让系统打开任意地址。
const ALLOWED_URLS: [&str; 2] = [
    "https://github.com/Ricky2022/qyPlayer",
    "https://github.com/Ricky2022",
];

/// 链接必须是白名单项本身，或其下的子路径 / 查询 / 锚点，避免 `…/qyPlayerEvil` 之类蒙混。
fn is_allowed(url: &str) -> bool {
    ALLOWED_URLS.iter().any(|allowed| {
        url.strip_prefix(allowed)
            .is_some_and(|rest| rest.is_empty() || rest.starts_with(['/', '?', '#']))
    })
}

/// 随界面语言更新窗口标题。
#[tauri::command]
pub fn set_title(window: tauri::WebviewWindow, title: String) -> Result<(), String> {
    window.set_title(&title).map_err(|e| e.to_string())
}

/// 用系统默认浏览器打开链接。
#[tauri::command]
pub fn open_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    if !is_allowed(&url) {
        return Err("不允许打开该链接".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

/// 供两个程序注册的插件（open_url 依赖它）。
pub fn opener_plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_opener::init()
}

#[cfg(test)]
mod tests {
    use super::is_allowed;

    #[test]
    fn allows_repo_and_author_links() {
        assert!(is_allowed("https://github.com/Ricky2022"));
        assert!(is_allowed("https://github.com/Ricky2022/qyPlayer"));
        assert!(is_allowed("https://github.com/Ricky2022/qyPlayer/releases/latest"));
        assert!(is_allowed("https://github.com/Ricky2022/qyPlayer#readme"));
    }

    #[test]
    fn rejects_lookalikes_and_other_hosts() {
        assert!(!is_allowed("https://github.com/Ricky2022evil/x"));
        assert!(!is_allowed("https://github.com/Ricky2022.evil.com"));
        assert!(!is_allowed("http://github.com/Ricky2022"));
        assert!(!is_allowed("file:///C:/Windows/System32/calc.exe"));
        assert!(!is_allowed("https://example.com/https://github.com/Ricky2022"));
    }
}
