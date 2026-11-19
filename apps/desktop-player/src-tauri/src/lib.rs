//! 青云播放器的 Tauri 壳。
//!
//! 桌面和手机共用这一份逻辑；桌面专用的部分（命令行参数、窗口标题）用条件编译隔开。
//! 手机端的入口由 Tauri 的 `mobile_entry_point` 调用 `run()`，桌面端由 `main.rs` 调用。

use std::path::PathBuf;
use std::sync::Mutex;
#[cfg(target_os = "android")]
use std::time::Duration;

use tauri::ipc::Response;
#[cfg(target_os = "android")]
use tauri::Emitter;
use tauri::{Manager, State};

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

/// 当前文件，以及手机壳交来文件的方式。
///
/// 手机端由 `MainActivity` 把收到的文件拷进缓存目录，再把路径写进 `received/pending.txt`；
/// 这里盯着那个文件，读到新的路径就换掉当前文件。桌面的缓存目录里没有这个文件，等于没有新文件。
struct Current {
    file: Mutex<Option<SourceFile>>,
    /// `pending.txt` 的完整路径
    pending: PathBuf,
    /// 已经处理过的 `pending.txt` 内容，同一个文件不会打开两次
    handled: Mutex<String>,
}

impl Current {
    fn new(file: Option<SourceFile>, pending: PathBuf) -> Self {
        Self { file: Mutex::new(file), pending, handled: Mutex::new(String::new()) }
    }

    /// 当前文件的名字和字节数；没有文件时为 None
    fn info(&self) -> Option<(String, u64)> {
        let file = self.file.lock().ok()?;
        file.as_ref().map(|file| (file.name.clone(), file.size))
    }

    /// 检查壳有没有交来新文件：有就换掉当前文件，返回它的名字和字节数。
    /// 网页问 `initial_file` 时也顺手调一次，免得冷启动时轮询还没跑到、文件打不开。
    fn take_pending(&self) -> Option<(String, u64)> {
        let text = std::fs::read_to_string(&self.pending).ok()?;
        let path = text.trim().to_string();
        if path.is_empty() {
            return None;
        }
        {
            let mut handled = self.handled.lock().ok()?;
            if *handled == path {
                return None;
            }
            *handled = path.clone();
        }
        let file = SourceFile::open(PathBuf::from(&path))?;
        let info = (file.name.clone(), file.size);
        if let Ok(mut current) = self.file.lock() {
            *current = Some(file);
        }
        Some(info)
    }
}

/// 文件名和字节数；没有文件时返回 null。
#[tauri::command]
fn initial_file(state: State<'_, Current>) -> Option<(String, u64)> {
    // 手机冷启动时别的应用刚把文件交过来，这里先取一次再回答
    state.take_pending();
    state.info()
}

/// 读当前文件的一段。越界、文件被换小导致读不满都报错，不返回残缺数据。
#[tauri::command]
fn read_range(offset: u64, length: u64, state: State<'_, Current>) -> Result<Response, String> {
    // 先取出路径和大小再放开锁：读大文件时不挡着 initial_file 之类的命令
    let (path, size) = {
        let file = state.file.lock().map_err(|_| "内部状态损坏".to_string())?;
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

/// 手机：文件由系统通过 intent 交给应用，命令行参数里没有（见 `MainActivity` 和 `watch_received_files`）。
#[cfg(mobile)]
fn initial_file_from_args() -> Option<PathBuf> {
    None
}

/// 手机：别的应用发来的文件由壳拷进缓存目录，这里定时看一眼有没有新的，有就通知网页打开。
#[cfg(target_os = "android")]
fn watch_received_files(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(500));
        let Some(state) = app.try_state::<Current>() else { continue };
        if let Some(info) = state.take_pending() {
            let _ = app.emit("qyp-file-received", info);
        }
    });
}

/// 桌面：文件由命令行参数交过来，没有要盯的目录。
#[cfg(not(target_os = "android"))]
fn watch_received_files(_app: tauri::AppHandle) {}

/// 启动播放器。桌面由 `main.rs` 调用，手机由 Tauri 生成的入口调用。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    qy_desktop_common::with_opener(tauri::Builder::default())
        .setup(|app| {
            let pending = app
                .path()
                .app_cache_dir()
                .map(|dir| dir.join("received").join("pending.txt"))
                .unwrap_or_default();
            app.manage(Current::new(initial_file_from_args().and_then(SourceFile::open), pending));
            watch_received_files(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            initial_file,
            read_range,
            qy_desktop_common::commands::set_title,
            qy_desktop_common::commands::open_url
        ])
        .run(tauri::generate_context!())
        .expect("启动青云播放器失败");
}
