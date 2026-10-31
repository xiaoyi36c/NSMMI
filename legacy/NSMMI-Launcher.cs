// ============================================================================
//  NSMMI Launcher - 逆水寒 Model Importer (WPF, .NET Framework 4.x)
//  架构参考 XXMI-Launcher (SpectrumQT)，加载器基于 3DMigoto 1.4.9 (GPL)
//  by bo3b/DarkStarSword/Chiri
// ============================================================================
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Web.Script.Serialization;
using Microsoft.Win32;
using WinForms = System.Windows.Forms;
using System.Reflection;

[assembly: AssemblyTitle("NSMMI Launcher")]
[assembly: AssemblyDescription("NSMMI Launcher - 逆水寒 Model Importer")]
[assembly: AssemblyProduct("NSMMI")]
[assembly: AssemblyCompany("NSMMI Project")]
[assembly: AssemblyCopyright("Loader based on 3DMigoto (GPL) by bo3b/DarkStarSword/Chiri")]
[assembly: AssemblyVersion("1.1.0.0")]
[assembly: AssemblyFileVersion("1.1.0.0")]

namespace NSMMI
{
    public static class Program
    {
        [STAThread]
        public static void Main(string[] args)
        {
            try
            {
                var app = new Application();
                app.Run(new MainWindow());
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.ToString(), "NSMMI Launcher", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
    }

    public class MainWindow : Window
    {
        private const string Version = "1.1.0";
        private const string GameExeName = "nshm.exe";
        private static readonly string[] LoaderFiles =
            { "d3d11.dll", "d3dcompiler_46.dll", "d3dcompiler_47.dll", "d3dx.ini" };

        private static readonly string ExeDir        = AppDomain.CurrentDomain.BaseDirectory;
        private static readonly string LoaderDir     = Path.Combine(ExeDir, "Resources", "Loader");
        private static readonly string ShaderFixesSrc= Path.Combine(ExeDir, "Resources", "ShaderFixes");
        private static readonly string ModsSrc       = Path.Combine(ExeDir, "Mods");
        private static readonly string ConfigDir     = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "NSMMI");
        private static readonly string ConfigFile    = Path.Combine(ConfigDir, "config.json");

        private readonly JavaScriptSerializer _json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
        private TextBox _pathBox;
        private TextBox _logBox;

        public MainWindow()
        {
            Title = "NSMMI Launcher v" + Version + " - 逆水寒 Model Importer";
            Width = 720;
            Height = 560;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            ResizeMode = ResizeMode.CanMinimize;
            BuildUi();
            Loaded += (s, e) =>
            {
                var stored = GetStoredGamePath();
                if (!string.IsNullOrEmpty(stored))
                {
                    _pathBox.Text = stored;
                }
                else
                {
                    Log("正在自动检测游戏目录...");
                    var found = FindGameRoot();
                    if (!string.IsNullOrEmpty(found))
                    {
                        _pathBox.Text = found;
                        Log("已自动填入: " + found);
                    }
                }
                Log("NSMMI Launcher v" + Version + " 已启动。点击[自动检测]定位游戏，然后[安装 / 更新]。");
            };
        }

        // ---------------------------------------------------------------- UI

        private void BuildUi()
        {
            var grid = new Grid { Margin = new Thickness(16) };
            for (int i = 0; i < 6; i++)
                grid.RowDefinitions.Add(new RowDefinition
                {
                    Height = i == 4 ? new GridLength(1, GridUnitType.Star) : GridLength.Auto
                });

            // Row 0: 标题
            var title = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 4) };
            title.Children.Add(new TextBlock { Text = "NSMMI", FontSize = 28, FontWeight = FontWeights.Bold, Foreground = Brush("#2B6CB0") });
            title.Children.Add(new TextBlock { Text = "  逆水寒 Model Importer", FontSize = 16, Margin = new Thickness(10, 8, 0, 0), Foreground = Brush("#4A5568") });
            title.Children.Add(new TextBlock { Text = "  基于 3DMigoto 1.4.9", FontSize = 12, Margin = new Thickness(10, 10, 0, 0), Foreground = Brush("#A0AEC0") });
            Grid.SetRow(title, 0);
            grid.Children.Add(title);

            // Row 1: 路径标签
            var label = new TextBlock { Text = "游戏目录 (nshm.exe 所在):", Margin = new Thickness(0, 8, 0, 4) };
            Grid.SetRow(label, 1);
            grid.Children.Add(label);

            // Row 2: 路径输入
            _pathBox = new TextBox { Height = 26, VerticalContentAlignment = VerticalAlignment.Center };
            var btnDetect = new Button { Content = "自动检测", Width = 80, Margin = new Thickness(8, 0, 0, 0) };
            var btnBrowse = new Button { Content = "浏览...", Width = 70, Margin = new Thickness(8, 0, 0, 0) };
            var dock = new DockPanel();
            DockPanel.SetDock(btnBrowse, Dock.Right);
            DockPanel.SetDock(btnDetect, Dock.Right);
            dock.Children.Add(btnBrowse);
            dock.Children.Add(btnDetect);
            dock.Children.Add(_pathBox);
            Grid.SetRow(dock, 2);
            grid.Children.Add(dock);

            // Row 3: 操作按钮
            var btnInstall = MakeButton("安装 / 更新", 130, Brush("#2B6CB0"), FontWeights.Bold);
            var btnLaunch  = MakeButton("启动游戏",   110, Brush("#2F855A"), FontWeights.Bold);
            var btnUninst  = MakeButton("卸载",        90, Brush("#C53030"), FontWeights.Bold);
            var btnMods    = MakeButton("打开 Mods 目录", 130, Brushes.Transparent, FontWeights.Normal);
            var btnShader  = MakeButton("打开 ShaderFixes", 130, Brushes.Transparent, FontWeights.Normal);
            var panel = new WrapPanel { Margin = new Thickness(0, 12, 0, 8) };
            panel.Children.Add(btnInstall);
            panel.Children.Add(btnLaunch);
            panel.Children.Add(btnUninst);
            panel.Children.Add(btnMods);
            panel.Children.Add(btnShader);
            Grid.SetRow(panel, 3);
            grid.Children.Add(panel);

            // Row 4: 日志
            _logBox = new TextBox
            {
                IsReadOnly = true,
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                Background = Brush("#1A202C"),
                Foreground = Brush("#A0F0A0"),
                FontFamily = new FontFamily("Consolas"),
                FontSize = 12,
                Padding = new Thickness(6)
            };
            Grid.SetRow(_logBox, 4);
            grid.Children.Add(_logBox);

            // Row 5: 风险提示
            var warn = new TextBlock
            {
                Text = "风险提示: 游戏含 NEAC 反作弊，使用本工具存在账号处罚风险，请自行评估并仅用于合规场景。卸载时保留 ShaderFixes 与 Mods 中的用户文件。",
                FontSize = 11,
                Foreground = Brush("#E53E3E"),
                Margin = new Thickness(0, 8, 0, 0),
                TextWrapping = TextWrapping.Wrap
            };
            Grid.SetRow(warn, 5);
            grid.Children.Add(warn);

            btnDetect.Click += (s, e) => Safe(() =>
            {
                Log("正在自动检测游戏目录...");
                var found = FindGameRoot();
                if (!string.IsNullOrEmpty(found)) { _pathBox.Text = found; Log("检测到: " + found); }
                else Log("未检测到游戏，请手动浏览选择 nshm.exe 所在目录");
            });
            btnBrowse.Click += (s, e) =>
            {
                using (var dlg = new WinForms.FolderBrowserDialog())
                {
                    dlg.Description = "选择 nshm.exe 所在目录 (通常为 ...\\逆水寒手游\\game)";
                    if (dlg.ShowDialog() == WinForms.DialogResult.OK) _pathBox.Text = dlg.SelectedPath;
                }
            };
            btnInstall.Click += (s, e) => Safe(() => InstallNsmmi(_pathBox.Text.Trim()));
            btnLaunch.Click  += (s, e) => Safe(() => StartGame(_pathBox.Text.Trim()));
            btnUninst.Click  += (s, e) =>
            {
                var r = MessageBox.Show("确定卸载 NSMMI 加载器？ShaderFixes 与 Mods 中的用户文件将保留。",
                    "确认卸载", MessageBoxButton.YesNo, MessageBoxImage.Warning);
                if (r == MessageBoxResult.Yes) Safe(() => UninstallNsmmi(_pathBox.Text.Trim()));
            };
            btnMods.Click += (s, e) => OpenDir(Path.Combine(_pathBox.Text.Trim(), "Mods"));
            btnShader.Click += (s, e) => OpenDir(Path.Combine(_pathBox.Text.Trim(), "ShaderFixes"));

            Content = grid;
        }

        private Button MakeButton(string text, double width, Brush bg, FontWeight weight)
        {
            var b = new Button { Content = text, Width = width, Height = 34, Margin = new Thickness(0, 0, 10, 0), FontWeight = weight };
            if (bg != Brushes.Transparent) { b.Background = bg; b.Foreground = Brushes.White; }
            return b;
        }

        private static Brush Brush(string hex)
        {
            return (SolidColorBrush)new BrushConverter().ConvertFromString(hex);
        }

        private void OpenDir(string path)
        {
            if (Directory.Exists(path)) Process.Start("explorer.exe", path);
            else Log("目录不存在，请先安装: " + path);
        }

        private void Log(string msg)
        {
            _logBox.AppendText("[" + DateTime.Now.ToString("HH:mm:ss") + "] " + msg + Environment.NewLine);
            _logBox.ScrollToEnd();
        }

        private void Safe(Action action)
        {
            try { action(); }
            catch (Exception ex)
            {
                Log("错误: " + ex.Message);
                Log(ex.ToString());
            }
        }

        // ---------------------------------------------------------------- 配置

        private string GetStoredGamePath()
        {
            try
            {
                if (!File.Exists(ConfigFile)) return "";
                var d = _json.Deserialize<Dictionary<string, object>>(File.ReadAllText(ConfigFile, Encoding.UTF8));
                return d != null && d.ContainsKey("game_path") ? Convert.ToString(d["game_path"]) : "";
            }
            catch { return ""; }
        }

        private void SaveStoredGamePath(string path)
        {
            Directory.CreateDirectory(ConfigDir);
            var d = new Dictionary<string, object>
            {
                { "game_path", path }, { "version", Version }, { "updated", DateTime.Now.ToString("o") }
            };
            File.WriteAllText(ConfigFile, _json.Serialize(d), Encoding.UTF8);
        }

        // ---------------------------------------------------------------- 检测

        private static bool IsGameRoot(string root)
        {
            return !string.IsNullOrWhiteSpace(root) && File.Exists(Path.Combine(root, GameExeName));
        }

        private static bool IsGameRunning()
        {
            return Process.GetProcessesByName("nshm").Length > 0;
        }

        private string FindGameRoot()
        {
            var stored = GetStoredGamePath();
            if (!string.IsNullOrEmpty(stored) && IsGameRoot(stored)) return stored;

            var candidates = new List<string>();

            // 1) 注册表卸载项（网易启动器）
            try
            {
                var roots = new[]
                {
                    Tuple.Create(Registry.LocalMachine,  @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
                    Tuple.Create(Registry.LocalMachine,  @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
                    Tuple.Create(Registry.CurrentUser,   @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall")
                };
                foreach (var r in roots)
                {
                    using (var key = r.Item1.OpenSubKey(r.Item2))
                    {
                        if (key == null) continue;
                        foreach (var sub in key.GetSubKeyNames())
                        {
                            using (var item = key.OpenSubKey(sub))
                            {
                                if (item == null) continue;
                                var name = Convert.ToString(item.GetValue("DisplayName") ?? "");
                                var loc = Convert.ToString(item.GetValue("InstallLocation") ?? "");
                                if (name.Contains("逆水寒") && !string.IsNullOrWhiteSpace(loc))
                                {
                                    candidates.Add(Path.Combine(loc, "game"));
                                    candidates.Add(loc);
                                }
                            }
                        }
                    }
                }
            }
            catch { }

            // 2) 各盘常见目录
            var patterns = new[] { @"Netease\逆水寒手游\game", @"逆水寒手游\game", @"Netease\NSH Mobile\game" };
            foreach (var d in DriveInfo.GetDrives().Where(x => x.IsReady))
                foreach (var p in patterns)
                    candidates.Add(Path.Combine(d.RootDirectory.FullName, p));

            return candidates.FirstOrDefault(IsGameRoot) ?? "";
        }

        private Dictionary<string, object> ReadManifest(string gameRoot)
        {
            try
            {
                var mf = Path.Combine(gameRoot, "_NSMMI", "manifest.json");
                if (!File.Exists(mf)) return null;
                return _json.Deserialize<Dictionary<string, object>>(File.ReadAllText(mf, Encoding.UTF8));
            }
            catch { return null; }
        }

        // ---------------------------------------------------------------- 安装

        private void InstallNsmmi(string gameRoot)
        {
            if (!IsGameRoot(gameRoot)) throw new Exception("未在指定目录找到 " + GameExeName + ": " + gameRoot);
            if (IsGameRunning()) throw new Exception("游戏正在运行，请先退出游戏再安装");

            var nsmmiDir = Path.Combine(gameRoot, "_NSMMI");
            var backupDir = Path.Combine(nsmmiDir, "backup");
            Directory.CreateDirectory(backupDir);

            var installed = new List<Dictionary<string, object>>();

            // 1) 加载器文件（先备份后部署）
            foreach (var f in LoaderFiles)
            {
                var src = Path.Combine(LoaderDir, f);
                if (!File.Exists(src)) throw new Exception("安装包缺少文件: " + src);
                var dst = Path.Combine(gameRoot, f);
                var entry = new Dictionary<string, object> { { "file", f }, { "had_backup", false }, { "original_md5", null } };
                if (File.Exists(dst))
                {
                    entry["original_md5"] = Md5(dst);
                    File.Copy(dst, Path.Combine(backupDir, f + ".bak"), true);
                    entry["had_backup"] = true;
                }
                File.Copy(src, dst, true);
                installed.Add(entry);
                Log("  部署 " + f);
            }

            // 2) ShaderFixes（只增不覆盖，保护用户 mod）
            var sfDst = Path.Combine(gameRoot, "ShaderFixes");
            Directory.CreateDirectory(sfDst);
            if (Directory.Exists(ShaderFixesSrc))
            {
                foreach (var f in Directory.GetFiles(ShaderFixesSrc))
                {
                    var dst = Path.Combine(sfDst, Path.GetFileName(f));
                    if (!File.Exists(dst))
                    {
                        File.Copy(f, dst);
                        Log("  部署 ShaderFixes\\" + Path.GetFileName(f));
                    }
                }
            }

            // 3) Mods 目录（只创建不覆盖）
            var modsDst = Path.Combine(gameRoot, "Mods");
            if (!Directory.Exists(modsDst))
            {
                Directory.CreateDirectory(modsDst);
                var readme = Path.Combine(ModsSrc, "README.txt");
                if (File.Exists(readme)) File.Copy(readme, Path.Combine(modsDst, "README.txt"));
                Log("  创建 Mods\\ 目录（mod 的 .ini 放这里即自动加载）");
            }

            // 4) 写清单（卸载依据）
            var manifest = new Dictionary<string, object>
            {
                { "nsmmi_version", Version },
                { "installed_at", DateTime.Now.ToString("o") },
                { "game_root", gameRoot },
                { "files", installed }
            };
            File.WriteAllText(Path.Combine(nsmmiDir, "manifest.json"), _json.Serialize(manifest), Encoding.UTF8);
            SaveStoredGamePath(gameRoot);
            Log("安装完成: " + gameRoot);
        }

        // ---------------------------------------------------------------- 卸载

        private void UninstallNsmmi(string gameRoot)
        {
            var manifest = ReadManifest(gameRoot);
            if (manifest == null) throw new Exception("未在 " + gameRoot + " 找到 NSMMI 安装记录");
            if (IsGameRunning()) throw new Exception("游戏正在运行，请先退出游戏再卸载");

            var backupDir = Path.Combine(gameRoot, "_NSMMI", "backup");
            object filesObj;
            if (manifest.TryGetValue("files", out filesObj) && filesObj is IEnumerable<object>)
            {
                foreach (var o in (IEnumerable<object>)filesObj)
                {
                    var e = o as Dictionary<string, object>;
                    if (e == null) continue;
                    var f = e.ContainsKey("file") ? Convert.ToString(e["file"]) : "";
                    if (string.IsNullOrEmpty(f)) continue;
                    var dst = Path.Combine(gameRoot, f);
                    var bak = Path.Combine(backupDir, f + ".bak");
                    var hadBackup = e.ContainsKey("had_backup") && Convert.ToBoolean(e["had_backup"]);
                    if (hadBackup && File.Exists(bak))
                    {
                        File.Copy(bak, dst, true);
                        Log("  还原 " + f + "（原版备份）");
                    }
                    else if (File.Exists(dst))
                    {
                        File.Delete(dst);
                        Log("  删除 " + f);
                    }
                }
            }
            Log("卸载完成。ShaderFixes\\ 与 Mods\\ 中的用户文件已保留，如需清理请手动删除。");
            Log("原版备份保留于 _NSMMI\\backup\\，确认游戏正常后可手动删除整个 _NSMMI 目录。");
        }

        // ---------------------------------------------------------------- 启动

        private void StartGame(string gameRoot)
        {
            if (ReadManifest(gameRoot) == null) throw new Exception("尚未安装 NSMMI，请先安装");
            if (IsGameRunning()) { Log("游戏已在运行"); return; }
            var exe = Path.Combine(gameRoot, GameExeName);
            Process.Start(new ProcessStartInfo { FileName = exe, WorkingDirectory = gameRoot });
            Log("已启动游戏: " + exe);
            Log("提醒: 请自行评估反作弊风险，仅用于合规场景。");
        }

        // ---------------------------------------------------------------- 工具

        private static string Md5(string file)
        {
            using (var md5 = MD5.Create())
            using (var stream = File.OpenRead(file))
                return BitConverter.ToString(md5.ComputeHash(stream)).Replace("-", "");
        }
    }
}
