//! 青云播放器的 Tauri 壳。
//!
//! 桌面和手机共用这一份逻辑；桌面专用的部分（命令行参数、窗口标题）用条件编译隔开。
//! 手机端的入口由 Tauri 的 `mobile_entry_point` 调用 `run()`，桌面端由 `main.rs` 调用。

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::ipc::Response;
use tauri::State;

/// 系统交给播放器的那一个文件：桌面是双击 `.qyp` 时命令行里带的路径，手机是别的应用发来的文件拷到的缓存。
///
/// 网页只能问“文件名、多大”和“按偏移读一段”，拿不到路径，所以不能借这些命令读任意文件。
struct SourceFile {
    name: String,
    path: PathBuf,
    size: u64,
}

impl SourceFile {
    /// 路径不存在或不是普通文件时当作没有文件
    fn open(path: PathBuf) -> Option<Self> {
        let metadata = std::fs::metadata(&path).ok()?;
        if !metadata.is_file() {
            return None;
        }
        let name = path.file_name()?.to_string_lossy().into_owned();
        Some(Self { name, path, size: metadata.len() })
    }
}

/// 当前文件（最多一个）。手机端收到新文件时替换它。
struct CurrentFile(Mutex<Option<SourceFile>>);

/// 文件名和字节数；没有文件时返回 null。
#[tauri::command]
fn initial_file(state: State<'_, CurrentFile>) -> Option<(String, u64)> {
    let file = state.0.lock().ok()?;
    file.as_ref().map(|file| (file.name.clone(), file.size))
}

/// 读当前文件的一段。越界、文件被换小导致读不满都报错，不返回残缺数据。
#[tauri::command]
fn read_range(offset: u64, length: u64, state: State<'_, CurrentFile>) -> Result<Response, String> {
    // 先取出路径和大小再放开锁：读大文件时不挡着 initial_file 之类的命令
    let (path, size) = {
        let file = state.0.lock().map_err(|_| "内部状态损坏".to_string())?;
        let Some(file) = file.as_ref() else {
            return Err("没有打开的文件".into());
        };
        (file.path.clone(), file.size)
    };

    let end = offset
        .checked_add(length)
        .ok_or_else(|| format!("读取范围溢出：偏移 {offset}、长度 {length}"))?;
    if end > size {
        return Err(format!("读取范围超出文件末尾：偏移 {offset}、长度 {length}、文件 {size} 字节"));
    }

    qy_desktop_common::read_range(&path, offset, length)
        .map(Response::new)
        .map_err(|e| format!("读取文件失败：{e}"))
}

/// 桌面：双击 `.qyp` 时由系统把文件路径作为第一个命令行参数传入。
#[cfg(desktop)]
fn initial_file_from_args() -> Option<PathBuf> {
    std::env::args_os().skip(1).map(PathBuf::from).find(|path| path.is_file())
}

/// 手机：文件由系统通过 intent 交给应用（0.5.0 的 A4 步骤把它拷到缓存再接上），命令行参数里没有。
#[cfg(mobile)]
fn initial_file_from_args() -> Option<PathBuf> {
    None
}

/// 启动播放器。桌面由 `main.rs` 调用，手机由 Tauri 生成的入口调用。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let current = initial_file_from_args().and_then(SourceFile::open);

    qy_desktop_common::with_opener(tauri::Builder::default())
        .manage(CurrentFile(Mutex::new(current)))
        .invoke_handler(tauri::generate_handler![
            initial_file,
            read_range,
            qy_desktop_common::commands::set_title,
            qy_desktop_common::commands::open_url
        ])
        .run(tauri::generate_context!())
        .expect("启动青云播放器失败");
}
