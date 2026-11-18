// 发布版不弹出控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::{Path, PathBuf};

use tauri::ipc::Response;
use tauri::State;

/// 启动时命令行里带的第一个文件（双击 .qyp 时由系统传入）
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

fn main() {
    let initial = std::env::args_os()
        .skip(1)
        .map(PathBuf::from)
        .find(|path| path.is_file());

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
