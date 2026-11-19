//! 播放器和制作器共用的 Tauri 命令：改窗口标题、用系统浏览器打开白名单里的链接。

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

/// Tauri 命令必须放在子模块里：写在 lib.rs 根部时，命令宏生成的同名宏会重复定义而编译失败。
pub mod commands {
    use tauri_plugin_opener::OpenerExt;

    use super::is_allowed;

    /// 随界面语言更新窗口标题。
    ///
    /// 改标题是桌面专用的接口（Android 的 Activity 没有可改的标题栏），手机端直接成功返回，
    /// 免得这层壳编译到手机目标时报找不到方法。
    #[tauri::command]
    pub fn set_title(window: tauri::WebviewWindow, title: String) -> Result<(), String> {
        #[cfg(not(target_os = "android"))]
        {
            window.set_title(&title).map_err(|e| e.to_string())
        }
        #[cfg(target_os = "android")]
        {
            let _ = (window, title);
            Ok(())
        }
    }

    /// 用系统默认浏览器打开链接。
    #[tauri::command]
    pub fn open_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
        if !is_allowed(&url) {
            return Err("不允许打开该链接".into());
        }
        app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
    }
}

/// 把内容写到目标文件：先写到同目录的临时文件，写完再改名为目标文件名。
/// 写入失败（磁盘满、权限不够）时删掉临时文件，目标位置不会留下写了一半的文件；已有的同名文件也不会被写坏。
pub fn write_atomically(target: &std::path::Path, data: &[u8]) -> std::io::Result<()> {
    let name = target
        .file_name()
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "目标路径没有文件名"))?;
    let mut temp_name = std::ffi::OsString::from(".");
    temp_name.push(name);
    temp_name.push(".part");
    let temp = target.with_file_name(temp_name);
    let result = std::fs::write(&temp, data).and_then(|()| std::fs::rename(&temp, target));
    if result.is_err() {
        let _ = std::fs::remove_file(&temp);
    }
    result
}

/// 给应用注册 open_url 依赖的 opener 插件（插件配置类型不对外公开，所以包一层 Builder）。
pub fn with_opener<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder.plugin(tauri_plugin_opener::init())
}

#[cfg(test)]
mod tests {
    use super::{is_allowed, write_atomically};

    /// 每个测试一个独立的临时目录，测完删除
    fn scratch_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("qy-desktop-common-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn writes_new_file_and_replaces_existing_without_leftovers() {
        let dir = scratch_dir("replace");
        let target = dir.join("film.qyp");
        write_atomically(&target, b"one").unwrap();
        write_atomically(&target, b"two").unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), b"two");
        let names: Vec<_> = std::fs::read_dir(&dir).unwrap().map(|e| e.unwrap().file_name()).collect();
        assert_eq!(names, vec![std::ffi::OsString::from("film.qyp")]);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn failure_leaves_no_partial_file() {
        let dir = scratch_dir("fail");
        // 目标是一个已存在的目录：改名会失败，临时文件必须被清理，目录原样保留
        let target = dir.join("taken");
        std::fs::create_dir(&target).unwrap();
        assert!(write_atomically(&target, b"data").is_err());
        assert!(target.is_dir());
        let names: Vec<_> = std::fs::read_dir(&dir).unwrap().map(|e| e.unwrap().file_name()).collect();
        assert_eq!(names, vec![std::ffi::OsString::from("taken")]);
        // 目标所在的目录不存在：同样报错且不留任何东西
        assert!(write_atomically(&dir.join("missing").join("a.qyp"), b"data").is_err());
        std::fs::remove_dir_all(&dir).unwrap();
    }

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
