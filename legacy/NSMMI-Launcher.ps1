# ============================================================================
#  NSMMI Launcher v1.0.0 - 逆水寒 Model Importer
#  架构参考 XXMI-Launcher (SpectrumQT)，加载器基于 3DMigoto 1.4.9 (bo3b, GPL)
#  功能: 游戏自动检测 / 一键安装 / 启动 / 卸载 / Mods 目录管理
#  用法: 双击 NSMMI-Launcher.bat 打开图形界面
#        命令行: powershell -File NSMMI-Launcher.ps1 -Detect
#                powershell -File NSMMI-Launcher.ps1 -GamePath "C:\...\game" -Install
#                powershell -File NSMMI-Launcher.ps1 -GamePath "C:\...\game" -Launch
#                powershell -File NSMMI-Launcher.ps1 -GamePath "C:\...\game" -Uninstall
# ============================================================================

param(
    [string]$GamePath = "",
    [switch]$Install,
    [switch]$Uninstall,
    [switch]$Launch,
    [switch]$Detect,
    [switch]$Silent
)

$ErrorActionPreference = 'Stop'
$NSMMI_VERSION = '1.0.0'
$SCRIPT_ROOT = $PSScriptRoot
if (-not $SCRIPT_ROOT) { $SCRIPT_ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $SCRIPT_ROOT) {
    # ps2exe 编译环境: 从 EXE 自身路径推断根目录
    try {
        $exePath = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
        if ($exePath -and [System.IO.Path]::GetExtension($exePath) -eq '.exe' -and
            (Split-Path -Leaf $exePath) -notmatch '^(powershell|pwsh)\.exe$') {
            $SCRIPT_ROOT = Split-Path -Parent $exePath
        }
    } catch { }
}
if (-not $SCRIPT_ROOT) { $SCRIPT_ROOT = (Get-Location).Path }
$LOADER_DIR = Join-Path $SCRIPT_ROOT 'Resources\Loader'
$SHADERFIXES_SRC = Join-Path $SCRIPT_ROOT 'Resources\ShaderFixes'
$MODS_SRC = Join-Path $SCRIPT_ROOT 'Mods'
$CONFIG_DIR = Join-Path $env:APPDATA 'NSMMI'
$CONFIG_FILE = Join-Path $CONFIG_DIR 'config.json'
$GAME_EXE = 'nshm.exe'
# 安装到游戏目录的加载器文件（卸载时精确还原/删除）
$LOADER_FILES = @('d3d11.dll', 'd3dcompiler_46.dll', 'd3dcompiler_47.dll', 'd3dx.ini')

# ---------------------------------------------------------------- 公共函数

function Write-Log([string]$msg) {
    if ($script:LogBox) { $script:LogBox.AppendText("[{0}] {1}`r`n" -f (Get-Date -Format 'HH:mm:ss'), $msg); $script:LogBox.ScrollToEnd() }
    else { Write-Host $msg }
}

function Get-StoredGamePath {
    if (Test-Path $CONFIG_FILE) {
        try { return (Get-Content $CONFIG_FILE -Raw | ConvertFrom-Json).game_path } catch { return "" }
    }
    return ""
}

function Save-StoredGamePath([string]$path) {
    if (-not (Test-Path $CONFIG_DIR)) { New-Item -ItemType Directory -Force -Path $CONFIG_DIR | Out-Null }
    @{ game_path = $path; version = $NSMMI_VERSION; updated = (Get-Date -Format 'o') } |
        ConvertTo-Json | Set-Content $CONFIG_FILE -Encoding UTF8
}

function Test-GameRoot([string]$root) {
    (Test-Path (Join-Path $root $GAME_EXE))
}

function Find-GameRoot {
    # 1) 上次记录的路径
    $stored = Get-StoredGamePath
    if ($stored -and (Test-GameRoot $stored)) { return $stored }
    # 2) 收集候选路径：注册表卸载项（网易启动器）+ 各盘符常见目录模式
    $candidates = @()
    $regRoots = @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
                  'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
                  'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*')
    foreach ($rk in $regRoots) {
        $props = Get-ItemProperty $rk -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -like '*逆水寒*' -and $_.InstallLocation }
        foreach ($item in $props) {
            $candidates += (Join-Path $item.InstallLocation 'game')
            $candidates += $item.InstallLocation
        }
    }
    $patterns = @('Netease\逆水寒手游\game', '逆水寒手游\game', 'Netease\NSH Mobile\game')
    foreach ($drive in (Get-PSDrive -PSProvider FileSystem)) {
        foreach ($p in $patterns) {
            $candidates += (Join-Path $drive.Root $p)
        }
    }
    # 3) 逐个验证
    foreach ($cand in $candidates) {
        if ($cand -and (Test-GameRoot $cand)) { return $cand }
    }
    return ""
}

function Get-InstalledManifest([string]$gameRoot) {
    $mf = Join-Path $gameRoot '_NSMMI\manifest.json'
    if (Test-Path $mf) { try { return Get-Content $mf -Raw | ConvertFrom-Json } catch { return $null } }
    return $null
}

function Test-GameRunning {
    return [bool](Get-Process -Name 'nshm' -ErrorAction SilentlyContinue)
}

# ---------------------------------------------------------------- 安装

function Install-NSMMI([string]$gameRoot) {
    if (-not (Test-GameRoot $gameRoot)) { throw "未在指定目录找到 ${GAME_EXE}: $gameRoot" }
    if (Test-GameRunning) { throw "游戏正在运行，请先退出游戏再安装" }

    $nsmmiDir = Join-Path $gameRoot '_NSMMI'
    $backupDir = Join-Path $nsmmiDir 'backup'
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

    $installed = @()

    # 1) 加载器文件（先备份后部署）
    foreach ($f in $LOADER_FILES) {
        $src = Join-Path $LOADER_DIR $f
        if (-not (Test-Path $src)) { throw "安装包缺少文件: $src" }
        $dst = Join-Path $gameRoot $f
        $entry = @{ file = $f; had_backup = $false; original_md5 = $null }
        if (Test-Path $dst) {
            $entry.original_md5 = (Get-FileHash $dst -Algorithm MD5).Hash
            Copy-Item $dst (Join-Path $backupDir "$f.bak") -Force
            $entry.had_backup = $true
        }
        Copy-Item $src $dst -Force
        $installed += $entry
        Write-Log "  部署 $f"
    }

    # 2) ShaderFixes（只增不覆盖，保护用户 mod）
    $sfDst = Join-Path $gameRoot 'ShaderFixes'
    New-Item -ItemType Directory -Force -Path $sfDst | Out-Null
    Get-ChildItem $SHADERFIXES_SRC -File | ForEach-Object {
        $dst = Join-Path $sfDst $_.Name
        if (-not (Test-Path $dst)) { Copy-Item $_.FullName $dst; Write-Log "  部署 ShaderFixes\$($_.Name)" }
    }

    # 3) Mods 目录（只创建不覆盖）
    $modsDst = Join-Path $gameRoot 'Mods'
    if (-not (Test-Path $modsDst)) {
        New-Item -ItemType Directory -Force -Path $modsDst | Out-Null
        if (Test-Path (Join-Path $MODS_SRC 'README.txt')) {
            Copy-Item (Join-Path $MODS_SRC 'README.txt') $modsDst
        }
        Write-Log "  创建 Mods\ 目录（mod 的 .ini 放这里即自动加载）"
    }

    # 4) 写清单（卸载依据）
    $manifest = @{
        nsmmi_version = $NSMMI_VERSION
        installed_at  = (Get-Date -Format 'o')
        game_root     = $gameRoot
        files         = $installed
    }
    $manifest | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $nsmmiDir 'manifest.json') -Encoding UTF8
    Save-StoredGamePath $gameRoot
    Write-Log "安装完成: $gameRoot"
}

# ---------------------------------------------------------------- 卸载

function Uninstall-NSMMI([string]$gameRoot) {
    $manifest = Get-InstalledManifest $gameRoot
    if (-not $manifest) { throw "未在 $gameRoot 找到 NSMMI 安装记录" }
    if (Test-GameRunning) { throw "游戏正在运行，请先退出游戏再卸载" }

    $backupDir = Join-Path $gameRoot '_NSMMI\backup'
    foreach ($entry in $manifest.files) {
        $dst = Join-Path $gameRoot $entry.file
        $bak = Join-Path $backupDir "$($entry.file).bak"
        if ($entry.had_backup -and (Test-Path $bak)) {
            Copy-Item $bak $dst -Force
            Write-Log "  还原 $($entry.file)（原版备份）"
        } elseif (Test-Path $dst) {
            Remove-Item $dst -Force
            Write-Log "  删除 $($entry.file)"
        }
    }
    # 用户内容保留：ShaderFixes\ 与 Mods\ 不动（内含用户 mod）
    Write-Log "卸载完成。ShaderFixes\ 与 Mods\ 中的用户文件已保留，如需清理请手动删除。"
    Write-Log "原版备份保留于 _NSMMI\backup\，确认游戏正常后可手动删除整个 _NSMMI 目录。"
}

# ---------------------------------------------------------------- 启动

function Start-Game([string]$gameRoot) {
    $manifest = Get-InstalledManifest $gameRoot
    if (-not $manifest) { throw "尚未安装 NSMMI，请先安装" }
    if (Test-GameRunning) { Write-Log "游戏已在运行"; return }
    $exe = Join-Path $gameRoot $GAME_EXE
    Start-Process -FilePath $exe -WorkingDirectory $gameRoot
    Write-Log "已启动游戏: ${exe}"
    Write-Log "提醒: 请自行评估反作弊风险，仅用于合规场景。"
}

# ---------------------------------------------------------------- GUI

function Show-Gui {
    Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase

    $xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="NSMMI Launcher v$($NSMMI_VERSION) - 逆水寒 Model Importer"
        Height="560" Width="720" WindowStartupLocation="CenterScreen" ResizeMode="CanMinimize">
  <Grid Margin="16">
    <Grid.RowDefinitions>
      <RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/>
      <RowDefinition Height="Auto"/><RowDefinition Height="*"/><RowDefinition Height="Auto"/>
    </Grid.RowDefinitions>
    <StackPanel Grid.Row="0" Orientation="Horizontal" Margin="0,0,0,4">
      <TextBlock Text="NSMMI" FontSize="28" FontWeight="Bold" Foreground="#2B6CB0"/>
      <TextBlock Text="  逆水寒 Model Importer" FontSize="16" Margin="10,8,0,0" Foreground="#4A5568"/>
      <TextBlock Text="  基于 3DMigoto 1.4.9" FontSize="12" Margin="10,10,0,0" Foreground="#A0AEC0"/>
    </StackPanel>
    <TextBlock Grid.Row="1" Text="游戏目录 (nshm.exe 所在):" Margin="0,8,0,4"/>
    <DockPanel Grid.Row="2">
      <Button Name="BtnBrowse" Content="浏览..." Width="70" DockPanel.Dock="Right" Margin="8,0,0,0"/>
      <Button Name="BtnDetect" Content="自动检测" Width="80" DockPanel.Dock="Right" Margin="8,0,0,0"/>
      <TextBox Name="TxtPath" Height="26" VerticalContentAlignment="Center"/>
    </DockPanel>
    <WrapPanel Grid.Row="3" Margin="0,12,0,8">
      <Button Name="BtnInstall"  Content="安装 / 更新" Width="130" Height="34" Margin="0,0,10,0" Background="#2B6CB0" Foreground="White" FontWeight="Bold"/>
      <Button Name="BtnLaunch"   Content="启动游戏"   Width="110" Height="34" Margin="0,0,10,0" Background="#2F855A" Foreground="White" FontWeight="Bold"/>
      <Button Name="BtnUninst"   Content="卸载"       Width="90"  Height="34" Margin="0,0,10,0" Background="#C53030" Foreground="White" FontWeight="Bold"/>
      <Button Name="BtnMods"     Content="打开 Mods 目录" Width="130" Height="34" Margin="0,0,10,0"/>
      <Button Name="BtnShader"   Content="打开 ShaderFixes" Width="130" Height="34"/>
    </WrapPanel>
    <TextBox Grid.Row="4" Name="LogBox" IsReadOnly="True" VerticalScrollBarVisibility="Auto"
             Background="#1A202C" Foreground="#A0F0A0" FontFamily="Consolas" FontSize="12" Padding="6"/>
    <TextBlock Grid.Row="5" Text="风险提示: 游戏含 NEAC 反作弊，使用本工具存在账号处罚风险，请自行评估并仅用于合规场景。卸载时保留 ShaderFixes 与 Mods 中的用户文件。"
               FontSize="11" Foreground="#E53E3E" Margin="0,8,0,0" TextWrapping="Wrap"/>
  </Grid>
</Window>
"@

    $window = [Windows.Markup.XamlReader]::Parse($xaml)
    $ctl = @{
        Path    = $window.FindName('TxtPath')
        LogBox  = $window.FindName('LogBox')
    }
    $script:LogBox = $ctl.LogBox

    $ctl.Path.Text = Get-StoredGamePath

    $window.FindName('BtnDetect').Add_Click({
        Write-Log "正在自动检测游戏目录..."
        $found = Find-GameRoot
        if ($found) { $ctl.Path.Text = $found; Write-Log "检测到: $found" }
        else { Write-Log "未检测到游戏，请手动浏览选择 nshm.exe 所在目录" }
    })
    $window.FindName('BtnBrowse').Add_Click({
        Add-Type -AssemblyName System.Windows.Forms | Out-Null
        $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
        $dlg.Description = '选择 nshm.exe 所在目录 (通常为 ...\逆水寒手游\game)'
        if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $ctl.Path.Text = $dlg.SelectedPath }
    })
    $window.FindName('BtnInstall').Add_Click({
        try { Install-NSMMI $ctl.Path.Text } catch { Write-Log "错误: $($_.Exception.Message)" }
    })
    $window.FindName('BtnLaunch').Add_Click({
        try { Start-Game $ctl.Path.Text } catch { Write-Log "错误: $($_.Exception.Message)" }
    })
    $window.FindName('BtnUninst').Add_Click({
        try {
            $r = [System.Windows.MessageBox]::Show('确定卸载 NSMMI 加载器？ShaderFixes 与 Mods 中的用户文件将保留。','确认卸载','YesNo','Warning')
            if ($r -eq 'Yes') { Uninstall-NSMMI $ctl.Path.Text }
        } catch { Write-Log "错误: $($_.Exception.Message)" }
    })
    $window.FindName('BtnMods').Add_Click({
        $p = Join-Path $ctl.Path.Text 'Mods'
        if (Test-Path $p) { Start-Process explorer.exe $p } else { Write-Log "Mods 目录不存在，请先安装" }
    })
    $window.FindName('BtnShader').Add_Click({
        $p = Join-Path $ctl.Path.Text 'ShaderFixes'
        if (Test-Path $p) { Start-Process explorer.exe $p } else { Write-Log "ShaderFixes 目录不存在，请先安装" }
    })

    Write-Log "NSMMI Launcher v$NSMMI_VERSION 已启动。点击[自动检测]定位游戏，然后[安装 / 更新]。"
    if (-not $Silent) { $found = Find-GameRoot; if ($found -and -not $ctl.Path.Text) { $ctl.Path.Text = $found; Write-Log "已自动填入: $found" } }
    $window.ShowDialog() | Out-Null
}

# ---------------------------------------------------------------- 入口

try {
    if ($Detect) {
        $found = if ($GamePath) { $GamePath } else { Find-GameRoot }
        if ($found -and (Test-GameRoot $found)) { Write-Output "FOUND=$found"; exit 0 }
        else { Write-Output "NOT_FOUND"; exit 1 }
    }
    if ($Install)  { try { Install-NSMMI $GamePath; exit 0 } catch { Write-Error $_.Exception.Message; exit 1 } }
    if ($Uninstall){ try { Uninstall-NSMMI $GamePath; exit 0 } catch { Write-Error $_.Exception.Message; exit 1 } }
    if ($Launch)   { try { Start-Game $GamePath; exit 0 } catch { Write-Error $_.Exception.Message; exit 1 } }

    Show-Gui
} catch {
    # 崩溃诊断: 记录完整异常与调用栈, 便于定位编译环境问题
    try {
        $crashLog = Join-Path $env:TEMP 'NSMMI-crash.log'
        @(
            "==== $(Get-Date -Format 'o') ====",
            "PSScriptRoot : $PSScriptRoot",
            "CmdPath      : $($MyInvocation.MyCommand.Path)",
            "Exception    : $($_.Exception.GetType().FullName): $($_.Exception.Message)",
            "StackTrace   :",
            ($_.ScriptStackTrace -split "`n" | ForEach-Object { "  $_" }) -join "`n",
            ""
        ) | Out-File $crashLog -Append -Encoding UTF8
    } catch { }
    throw
}
