//! 通过 Chrome DevTools Protocol 点击官方启动器里的「开始游戏」按钮
//!
//! 游戏客户端只接受由官方启动器拉起，NSMMI 无法直接拉起游戏。
//! 这里退一步：由 NSMMI 启动官方启动器（Electron 版 NGP）并带上
//! `--remote-debugging-port`，再通过 CDP 在启动器页面里找到「开始游戏」
//! 按钮并点击，等价于用户手动点一下。
//!
//! 说明：UI 自动化（UIAutomation）在 Electron/Chromium 下拿不到内部元素，
//! 因此这里走 CDP；脚本用 PowerShell 的 ClientWebSocket 实现，不引入新依赖。

use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream, ToSocketAddrs};
use std::time::Duration;

/// CDP 调试端口的候选区间（避开常见的 9222 / 9334）
const CDP_PORT_RANGE: std::ops::RangeInclusive<u16> = 19700..=19850;

/// 选一个空闲的本地端口给启动器用
pub fn pick_debug_port() -> Option<u16> {
    for port in CDP_PORT_RANGE {
        let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
        if TcpListener::bind(addr).is_ok() {
            return Some(port);
        }
    }
    None
}

/// 端口上的 CDP 是否已经就绪
pub fn is_cdp_ready(port: u16) -> bool {
    let addr = ("127.0.0.1", port)
        .to_socket_addrs()
        .ok()
        .and_then(|mut it| it.next());
    match addr {
        Some(addr) => TcpStream::connect_timeout(&addr, Duration::from_millis(150)).is_ok(),
        None => false,
    }
}

/// 通过 CDP 点击启动器里的「开始游戏」按钮（成功返回 true）
pub fn try_click_start_button(port: u16) -> bool {
    let script = include_str!("start_game_cdp.ps1");
    let Some(encoded) = encode_powershell(script) else {
        return false;
    };

    let output = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-EncodedCommand",
            &encoded,
        ])
        .env("NSMMI_CDP_PORT", port.to_string())
        .output();

    match output {
        Ok(result) => {
            let text = String::from_utf8_lossy(&result.stdout);
            if text.contains("CLICKED") {
                return true;
            }
            let err = String::from_utf8_lossy(&result.stderr);
            if !err.trim().is_empty() {
                eprintln!("[nsmmi] cdp click stderr: {}", err.trim());
            }
            false
        }
        Err(_) => false,
    }
}

/// 把脚本编码成 PowerShell `-EncodedCommand` 需要的 Base64(UTF-16LE)
fn encode_powershell(script: &str) -> Option<String> {
    let mut bytes: Vec<u8> = Vec::with_capacity(script.len() * 2);
    for unit in script.encode_utf16() {
        bytes.extend_from_slice(&unit.to_le_bytes());
    }
    Some(base64_encode(&bytes))
}

/// 极简 Base64 编码（避免额外依赖）
fn base64_encode(data: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let triple = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((triple >> 18) & 0x3F) as usize] as char);
        out.push(TABLE[((triple >> 12) & 0x3F) as usize] as char);
        out.push(if chunk.len() > 1 {
            TABLE[((triple >> 6) & 0x3F) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[(triple & 0x3F) as usize] as char
        } else {
            '='
        });
    }
    out
}
