// 发布版不弹出控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::ipc::{InvokeBody, Request};
use tauri_plugin_dialog::DialogExt;

/// 弹出系统「另存为」对话框，把请求体（原始字节）写到用户选的位置。
/// 文件名在请求头 x-file-name 里，经过百分号编码。用户取消时直接返回成功。
#[tauri::command]
async fn save_file(app: tauri::AppHandle, request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(data) = request.body() else {
        return Err("缺少文件内容".into());
    };
    let name = request
        .headers()
        .get("x-file-name")
        .and_then(|value| value.to_str().ok())
        .map(|encoded| percent_encoding::percent_decode_str(encoded).decode_utf8_lossy().into_owned())
        .unwrap_or_else(|| "film.qyp".into());

    let picked = app
        .dialog()
        .file()
        .set_file_name(name)
        .add_filter("qyp 影片", &["qyp"])
        .blocking_save_file();
    let Some(target) = picked else {
        return Ok(());
    };
    let path = target.into_path().map_err(|e| e.to_string())?;
    std::fs::write(path, data).map_err(|e| format!("保存失败：{e}"))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(qy_desktop_common::opener_plugin())
        .invoke_handler(tauri::generate_handler![
            save_file,
            qy_desktop_common::commands::set_title,
            qy_desktop_common::commands::open_url
        ])
        .run(tauri::generate_context!())
        .expect("启动青云制作器失败");
}
