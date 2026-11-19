//! 青云播放器的 Tauri 壳。
//!
//! 桌面和手机共用这一份逻辑；桌面专用的部分（命令行参数、窗口标题）用条件编译隔开。
//! 手机端的入口由 Tauri 的 `mobile_entry_point` 调用 `run()`，桌面端由 `main.rs` 调用。

use std::path::{Path, PathBuf};

use tauri::ipc::Response;
use tauri::State;

/// 系统交给播放器的第一个文件：桌面是双击 `.qyp` 时命令行里带的路径，手机是别的应用发来的 intent
struct InitialFile(Option<PathBuf>);

#[tauri::command]
fn initial_file(state: State<'_, InitialFile>) -> Option<String> {
    state.0.as_ref().map(|path| path.to_string_lossy().into_owned())
}

/// 读取启动时传入的那个文件。其他路径一律拒绝，网页不能借此读任意文件。
#[tauri::command]
fn read_file(path: String, state: State<'_, InitialFile>) -> Result<Response, String> {
    if state.0.as_deref() != Some(Path::new(&path)) {
        return Err("不允许读取该文件".into());
    }
    std::fs::read(&path)
        .map(Response::new)
        .map_err(|e| format!("读取文件失败：{e}"))
}

/// 桌面：双击 `.qyp` 时由系统把文件路径作为第一个命令行参数传入。
#[cfg(desktop)]
fn initial_file_from_args() -> Option<PathBuf> {
    std::env::args_os().skip(1).map(PathBuf::from).find(|path| path.is_file())
}

/// 手机：文件由系统通过 intent 交给应用，命令行参数里没有（0.5.0 的 A4 步骤接上）。
#[cfg(mobile)]
fn initial_file_from_args() -> Option<PathBuf> {
    None
}

/// 启动播放器。桌面由 `main.rs` 调用，手机由 Tauri 生成的入口调用。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let initial = initial_file_from_args();

    qy_desktop_common::with_opener(tauri::Builder::default())
        .manage(InitialFile(initial))
        .invoke_handler(tauri::generate_handler![
            initial_file,
            read_file,
            qy_desktop_common::commands::set_title,
            qy_desktop_common::commands::open_url
        ])
        .run(tauri::generate_context!())
        .expect("启动青云播放器失败");
}
