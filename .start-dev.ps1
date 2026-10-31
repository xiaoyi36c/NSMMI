# NSMMI 开发启动脚本（PowerShell + MSVC 工具链，可调试）
# 用法:
#   .\.start-dev.ps1              正常 dev 模式
#   .\.start-dev.ps1 -NoWatch     关闭热重启，适合挂调试器附加
#   .\.start-dev.ps1 -Attach      应用启动后自动用 cdb 附加（需装 Windows SDK Debuggers）
# 调试:
#   - 符号文件: src-tauri\target\debug\NSMMI.pdb
#   - VS / WinDbg: 附加到 NSMMI.exe（代码类型选"本机"）
#   - Rust panic: 脚本已设置 RUST_BACKTRACE=full，回溯直接打在控制台
param(
    [switch]$NoWatch,
    [switch]$Attach
)

$ErrorActionPreference = "Continue"
$env:RUSTUP_HOME = "F:\Rust\.rustup"
$env:CARGO_HOME  = "F:\Rust\.cargo"
$env:PATH = "$env:PATH;F:\Rust\.cargo\bin"
Set-Location -LiteralPath $PSScriptRoot

# ---- 确保 MSVC 工具链（VS 调试器 / PDB 符号兼容） ----
$toolchain = (rustup show active-toolchain 2>$null) -join ""
if ($toolchain -notmatch "msvc") {
    Write-Host "[start-dev] 当前工具链不是 MSVC，切换到 stable-x86_64-pc-windows-msvc ..." -ForegroundColor Yellow
    rustup default stable-x86_64-pc-windows-msvc
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[start-dev] 切换失败，请检查 rustup 安装。" -ForegroundColor Red
        exit 1
    }
    $toolchain = (rustup show active-toolchain 2>$null) -join ""
}
Write-Host "[start-dev] 工具链: $toolchain"

# ---- 调试构建设置: 完整 PDB 符号 + 帧指针 + panic 全回溯 ----
$env:RUSTFLAGS = "$env:RUSTFLAGS -C debuginfo=2 -C force-frame-pointers=yes"
$env:RUST_BACKTRACE = "full"

# ---- 启动 dev（参数直达 tauri CLI） ----
$npxArgs = @("tauri", "dev")
if ($NoWatch) { $npxArgs += "--no-watch" }
Write-Host "[start-dev] npx $($npxArgs -join ' ')"

$dev = Start-Process -FilePath "npx.cmd" -ArgumentList $npxArgs -NoNewWindow -PassThru
if (-not $dev) {
    Write-Host "[start-dev] 启动失败（找不到 npx？）" -ForegroundColor Red
    exit 1
}

# ---- 等 NSMMI.exe 起来，按需附加调试器 ----
$proc = $null
for ($i = 0; $i -lt 240; $i++) {
    Start-Sleep -Milliseconds 500
    if ($dev.HasExited) { break }
    $proc = Get-Process -Name "NSMMI" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($proc) { break }
}

if ($proc) {
    Write-Host "[start-dev] NSMMI.exe 已运行 (PID $($proc.Id))，符号: src-tauri\target\debug\NSMMI.pdb" -ForegroundColor Green
    if ($Attach) {
        $cdb = Get-Command cdb.exe -ErrorAction SilentlyContinue
        if ($cdb) {
            Start-Process -FilePath $cdb.Source -ArgumentList "-p", $proc.Id
            Write-Host "[start-dev] cdb 已附加到 PID $($proc.Id)"
        } else {
            Write-Host "[start-dev] 未找到 cdb.exe（Windows SDK Debuggers），请用 VS 附加到 NSMMI.exe" -ForegroundColor Yellow
        }
    }
} elseif (-not $dev.HasExited) {
    Write-Host "[start-dev] 120 秒内未检测到 NSMMI.exe（可能仍在编译），稍后可手动附加" -ForegroundColor Yellow
}

# 保持前台，dev 退出后脚本结束
Wait-Process -Id $dev.Id -ErrorAction SilentlyContinue
