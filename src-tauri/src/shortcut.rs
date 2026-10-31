//! 桌面快捷方式：生成指向 NSMMI 并带 `--launch` 参数的 .lnk
//!
//! 双击快捷方式 = 打开 NSMMI 并自动执行「启动游戏」（准备加载器 + 注入）。
//! 用 PowerShell 的 WScript.Shell COM 生成 .lnk，避免引入额外的 COM 依赖。

/// 快捷方式文件名（重复创建时直接覆盖）
const LINK_NAME: &str = "NSMMI 快速启动.lnk";

/// 命令行参数：主窗口检测到后自动执行「启动游戏」
pub const LAUNCH_ARG: &str = "--launch";

#[cfg(windows)]
pub fn create_desktop_shortcut() -> Result<String, String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    let exe = std::env::current_exe().map_err(|e| format!("定位 NSMMI 程序失败: {}", e))?;
    let exe_str = exe.to_string_lossy().replace('\'', "''");
    let work_dir = exe
        .parent()
        .unwrap_or(exe.as_path())
        .to_string_lossy()
        .replace('\'', "''");

    // 桌面路径由系统取（OneDrive 重定向等场景也能拿对），生成后回显路径
    let script = format!(
        "$ws = New-Object -ComObject WScript.Shell; \
         $desktop = [Environment]::GetFolderPath('Desktop'); \
         $lnk = Join-Path $desktop '{name}'; \
         $s = $ws.CreateShortcut($lnk); \
         $s.TargetPath = '{exe}'; \
         $s.Arguments = '{arg}'; \
         $s.WorkingDirectory = '{dir}'; \
         $s.IconLocation = '{exe},0'; \
         $s.Description = 'NSMMI 快速启动（自动注入）'; \
         $s.Save(); \
         Write-Output $lnk",
        name = LINK_NAME.replace('\'', "''"),
        exe = exe_str,
        arg = LAUNCH_ARG,
        dir = work_dir,
    );

    // CREATE_NO_WINDOW：不闪黑框
    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .creation_flags(0x0800_0000)
        .output()
        .map_err(|e| format!("运行 PowerShell 失败: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!(
            "创建快捷方式失败: {}",
            if stderr.is_empty() {
                format!("PowerShell 退出码 {:?}", output.status.code())
            } else {
                stderr
            }
        ));
    }
    if stdout.is_empty() {
        return Err("创建快捷方式失败：PowerShell 没有返回路径".to_string());
    }
    Ok(stdout)
}

#[cfg(not(windows))]
pub fn create_desktop_shortcut() -> Result<String, String> {
    let _ = LINK_NAME;
    Err("桌面快捷方式仅支持 Windows".to_string())
}
