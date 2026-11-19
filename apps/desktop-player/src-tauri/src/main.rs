// 发布版不弹出控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// 逻辑都在 lib 里：手机端由 Tauri 的入口调用同一个 run()，桌面端由这里调用
fn main() {
    qyplayer_lib::run()
}
