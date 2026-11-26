//! Windows 上启动前确认 WebView2。没有运行时就用中文说明，并下载微软的安装程序。
//! 发行版里那句英文 “Could not find the WebView2 Runtime” 是 Tauri 写死的，程序一旦走到那里就改不了文字。
//! 所以要在创建窗口之前处理完。

/// 注册表里的版本是否表示已经装好。`0.0.0.0` 是占位，不算装好。
pub fn runtime_version_present(value: &str) -> bool {
    let trimmed = value.trim_end_matches('\0').trim();
    !trimmed.is_empty() && trimmed != "0.0.0.0"
}

/// 当前用户能用 WebView2 就直接返回；否则询问并安装。用户拒绝或安装失败则退出。
pub fn ensure_webview2() {
    #[cfg(windows)]
    windows::ensure();
}

#[cfg(windows)]
mod windows {
    use std::ffi::c_void;
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    use windows_sys::Win32::System::Com::Urlmon::URLDownloadToFileW;
    use windows_sys::Win32::System::Registry::{
        RegGetValueW, HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        MessageBoxW, IDYES, MB_ICONINFORMATION, MB_OK, MB_YESNO,
    };

    const CLIENT: &str = "SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
    const CLIENT_WOW64: &str = "SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
    /// 微软的常青引导安装程序，装的是当前用户可用的运行时
    const BOOTSTRAPPER: &str = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";
    const DOWNLOAD_PAGE: &str = "https://developer.microsoft.com/zh-cn/microsoft-edge/webview2/";
    /// 不弹出命令行窗口
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    pub fn ensure() {
        if installed() {
            return;
        }
        let agreed = ask("这台电脑还没有安装 Microsoft Edge WebView2，程序需要它来显示界面。\n\n要现在下载并安装吗？安装程序来自微软，装好后会继续打开。");
        if !agreed {
            std::process::exit(0);
        }
        if install().is_err() || !installed() {
            tell(&format!("没能装上 WebView2。请用浏览器打开下面的地址，安装后再重新打开本程序：\n\n{DOWNLOAD_PAGE}"));
            std::process::exit(1);
        }
    }

    fn installed() -> bool {
        [(HKEY_LOCAL_MACHINE, CLIENT_WOW64), (HKEY_LOCAL_MACHINE, CLIENT), (HKEY_CURRENT_USER, CLIENT)]
            .into_iter()
            .any(|(root, key)| read_sz(root, key).is_some_and(|value| super::runtime_version_present(&value)))
    }

    fn install() -> Result<(), String> {
        let dest = std::env::temp_dir().join("MicrosoftEdgeWebview2Setup.exe");
        let dest_wide = wide(&dest.to_string_lossy());
        let url = wide(BOOTSTRAPPER);
        let status = unsafe {
            URLDownloadToFileW(std::ptr::null_mut(), url.as_ptr(), dest_wide.as_ptr(), 0, std::ptr::null_mut())
        };
        if status != 0 {
            return Err(format!("download {status}"));
        }
        let exit = Command::new(&dest).arg("/install").creation_flags(CREATE_NO_WINDOW).status().map_err(|error| error.to_string())?;
        if exit.success() {
            Ok(())
        } else {
            Err(format!("installer {exit}"))
        }
    }

    fn read_sz(root: HKEY, subkey: &str) -> Option<String> {
        let subkey = wide(subkey);
        let name = wide("pv");
        let mut bytes = [0u8; 128];
        let mut size = bytes.len() as u32;
        let status = unsafe {
            RegGetValueW(
                root,
                subkey.as_ptr(),
                name.as_ptr(),
                RRF_RT_REG_SZ,
                std::ptr::null_mut(),
                bytes.as_mut_ptr().cast::<c_void>(),
                &mut size,
            )
        };
        if status != 0 || size < 2 {
            return None;
        }
        let units = (size as usize / 2).saturating_sub(1);
        let words = bytes[..units * 2].chunks_exact(2).map(|pair| u16::from_le_bytes([pair[0], pair[1]])).collect::<Vec<_>>();
        Some(String::from_utf16_lossy(&words))
    }

    fn ask(text: &str) -> bool {
        let body = wide(text);
        let title = wide("需要安装 WebView2");
        unsafe { MessageBoxW(std::ptr::null_mut(), body.as_ptr(), title.as_ptr(), MB_YESNO | MB_ICONINFORMATION) == IDYES }
    }

    fn tell(text: &str) {
        let body = wide(text);
        let title = wide("需要安装 WebView2");
        unsafe {
            MessageBoxW(std::ptr::null_mut(), body.as_ptr(), title.as_ptr(), MB_OK | MB_ICONINFORMATION);
        }
    }

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0)).collect()
    }
}
