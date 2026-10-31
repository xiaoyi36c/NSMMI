import { useCallback, useEffect, useState } from "react";
import { ConfigProvider, Modal, theme } from "antd";
import zhCN from "antd/locale/zh_CN";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { CharactersView } from "./components/CharactersView";
import { DebugView } from "./components/DebugView";
import { DumpsView } from "./components/DumpsView";
import { GameCard } from "./components/GameCard";
import { HomeView } from "./components/HomeView";
import { LogsView } from "./components/LogsView";
import { OverlayWindow } from "./components/OverlayWindow";
import { Rail } from "./components/Rail";
import { SettingsView } from "./components/SettingsView";
import { SidePanel } from "./components/SidePanel";
import { TitleBar } from "./components/TitleBar";
import { NAV_ENTRIES } from "./components/nav";
import { PanelResizer } from "./components/PanelResizer";
import { DEFAULT_GAME_EXE, REPO_URL } from "./constants";
import { useLauncher } from "./hooks/useLauncher";
import { wallpaperSrc } from "./lib/api";
import { wallpaperTint } from "./lib/wallpaperTint";
import { isTauri } from "./lib/tauri-env";
import type { DumpFilter, LogFilter, View } from "./types";

/** 浏览器预览时可用 ?view=characters/debug/settings 直达对应页面 */
function initialView(): View {
  const v = new URLSearchParams(window.location.search).get("view");
  return NAV_ENTRIES.some((item) => item.key === v) || v === "settings"
    ? (v as View)
    : "home";
}

export default function App() {
  // 浏览器预览：?view=overlay 直接渲染调试悬浮窗（无 Tauri 运行时，接口会提示不可用）
  if (!isTauri && new URLSearchParams(window.location.search).get("view") === "overlay") {
    return <OverlayWindow />;
  }

  // 悬浮窗窗口渲染精简调试界面（与主窗口共用前端，按 label 区分）
  if (isTauri && getCurrentWindow().label === "overlay") {
    return <OverlayWindow />;
  }

  return <MainWindow />;
}

function MainWindow() {
  const launcher = useLauncher();
  const [view, setView] = useState<View>(initialView);
  const [query, setQuery] = useState("");
  const [dumpFilter, setDumpFilter] = useState<DumpFilter>({ kind: "all", file: null });
  const [logFilter, setLogFilter] = useState<LogFilter>("all");
  const [sectionId, setSectionId] = useState<string | null>(null);
  // 中间栏宽度：拖拽分界线调整，本地记忆
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = Number(window.localStorage.getItem("nsmmi.panelWidth"));
    return saved >= 200 && saved <= 400 ? saved : 246;
  });
  const changePanelWidth = useCallback((width: number) => {
    setPanelWidth(width);
    window.localStorage.setItem("nsmmi.panelWidth", String(width));
  }, []);
  const [confirmUninstall, setConfirmUninstall] = useState(false);

  // 稳定引用，配合子组件 memo 避免无谓重渲染
  const requestUninstall = useCallback(() => setConfirmUninstall(true), []);
  const cancelUninstall = useCallback(() => setConfirmUninstall(false), []);
  const confirmUninstallAction = useCallback(() => {
    setConfirmUninstall(false);
    void launcher.uninstall();
  }, [launcher.uninstall]);

  const selectView = useCallback((next: View) => {
    setView(next);
    // 切页回到干净状态：搜索清空，筛选复位，避免"进来就是筛过的"
    setQuery("");
    setDumpFilter({ kind: "all", file: null });
    setLogFilter("all");
    setSectionId(null);
  }, []);

  // 预览模式支持 ?theme=dark 快速检查深色主题（桌面端仍读设置）
  const previewTheme = !isTauri
    ? new URLSearchParams(window.location.search).get("theme")
    : null;
  const uiTheme = previewTheme === "dark" ? "dark" : launcher.uiTheme;

  // 自定义主题且设置了壁纸时才铺背景；深色主题整体切深色算法
  const bg = wallpaperSrc(launcher.wallpaper);
  const custom = uiTheme === "custom";
  const dark = uiTheme === "dark";
  const wallpaperOn = custom && bg !== null;

  // 壁纸主色调：中间栏 / 内容区用它派生"模糊色系"底色
  const [wallTint, setWallTint] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (wallpaperOn && bg) {
      void wallpaperTint(bg).then((tint) => {
        if (!cancelled) {
          setWallTint(tint);
        }
      });
    } else {
      setWallTint(null);
    }
    return () => {
      cancelled = true;
    };
  }, [wallpaperOn, bg]);

  return (
    <ConfigProvider
      locale={zhCN}
      // antd v6 弹层默认挂进 body 末尾一个 0 高占位 DIV，坐标计算会飞出屏幕外；
      // 显式指定挂到 body，保证 Tooltip / Dropdown 等定位正常
      getPopupContainer={() => document.body}
      theme={{
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: { borderRadius: 8, fontSize: launcher.fontSize },
      }}
    >
      <div
        className={`app-shell${wallpaperOn ? " has-wallpaper" : ""}${
          dark ? " theme-dark" : ""
        }`}
        style={
          wallpaperOn
            ? ({
                backgroundImage: `url(${bg})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                "--wall-tint": wallTint ?? undefined,
              } as React.CSSProperties)
            : undefined
        }
      >
        <TitleBar
          overlay={wallpaperOn}
          adaptiveDark={wallpaperOn && launcher.titlebarLight}
        />

        {!isTauri && (
          <p className="preview-banner">
            浏览器预览模式：未检测到 Tauri 运行时，安装、启动等桌面功能不可用。
          </p>
        )}

        <div className="shell-main">
          {/* 图标栏（固定宽）+ 中间栏（可拖宽），与内容栏连成一体 */}
          <div
            className="sidebar"
            style={{ "--panel-w": `${panelWidth}px` } as React.CSSProperties}
          >
            <Rail
              view={view}
              gameRunning={launcher.status.gameRunning}
              onSelect={selectView}
              onOpenRepo={() => launcher.openExternal(REPO_URL)}
            />

            {/* 首页不显示中间面板（侧栏收窄为图标栏，框架不变） */}
            {view !== "home" && (
              <SidePanel
                view={view}
                query={query}
                mods={launcher.mods}
                dumps={launcher.dumps}
                logs={launcher.logs}
                dumpFilter={dumpFilter}
                logFilter={logFilter}
                sectionId={sectionId}
                onQueryChange={setQuery}
                onDumpFilterChange={setDumpFilter}
                onLogFilterChange={setLogFilter}
                onJumpSection={setSectionId}
                onSelect={selectView}
              />
            )}

            {view !== "home" && (
              <PanelResizer width={panelWidth} onWidthChange={changePanelWidth} />
            )}
          </div>

          {/* key=view：切页时重挂内容卡，让入场动画每次都能播 */}
          <main key={view} className={`stage${view === "home" ? " stage-home" : ""}`}>
            <div className="stage-body">
              {view === "home" && (
                <HomeView
                  onDark={wallpaperOn || dark}
                  status={launcher.status}
                  busy={launcher.busy}
                  version={launcher.info?.version ?? null}
                  loaderUpdate={launcher.loaderUpdate}
                  onLaunch={launcher.launchGame}
                  onInstall={launcher.install}
                  onCheckUpdate={launcher.checkLoaderUpdate}
                  onRestore={launcher.restoreLoader}
                  onAddShortcut={launcher.createDesktopShortcut}
                  onOpenMod={launcher.openModsDir}
                  onOpenShaderFixes={launcher.openShaderFixesDir}
                  onOpenGameDir={launcher.openGameDir}
                />
              )}

              {view === "characters" && (
                <CharactersView
                  mods={launcher.mods}
                  busy={launcher.busy}
                  query={query}
                  onToggle={launcher.toggleMod}
                  onRefresh={launcher.refreshMods}
                  onOpenFolder={launcher.openModsDir}
                />
              )}

              {view === "debug" && (
                <DebugView
                  debug={launcher.debug}
                  busy={launcher.busy !== null}
                  gameRunning={launcher.status.gameRunning}
                  overlayVisible={launcher.overlayVisible}
                  onToggleDebug={launcher.toggleDebug}
                  onToggleOverlay={launcher.toggleOverlay}
                  onOpenMod={launcher.openModsDir}
                  onOpenShaderFixes={launcher.openShaderFixesDir}
                  onOpenGameDir={launcher.openGameDir}
                />
              )}

              {view === "dumps" && (
                <DumpsView
                  dumps={launcher.dumps}
                  filter={dumpFilter}
                  query={query}
                  busy={launcher.busy === "note"}
                  onRefresh={launcher.refreshDumps}
                  onSaveNote={launcher.saveModelNote}
                  onOpenShaderFixes={launcher.openShaderFixesDir}
                />
              )}

              {view === "logs" && (
                <LogsView
                  logs={launcher.logs}
                  level={logFilter}
                  query={query}
                  onClearLogs={launcher.clearLogs}
                  onOpenMod={launcher.openModsDir}
                  onOpenShaderFixes={launcher.openShaderFixesDir}
                  onOpenGameDir={launcher.openGameDir}
                />
              )}

              {view === "settings" && (
                <SettingsView
                  theme={launcher.uiTheme}
                  fontSize={launcher.fontSize}
                  autoUpdate={launcher.autoUpdate}
                  launchMode={launcher.launchMode}
                  launchTimeout={launcher.launchTimeout}
                  injectMode={launcher.injectMode}
                  loaderUpdate={launcher.loaderUpdate}
                  wallpaper={launcher.wallpaper}
                  busy={launcher.busy}
                  version={launcher.info?.version ?? null}
                  onThemeChange={launcher.setUiTheme}
                  onFontSizeChange={launcher.setFontSize}
                  onAutoUpdateChange={launcher.setAutoUpdate}
                  onLaunchSettingsChange={launcher.updateLaunchSettings}
                  onInjectModeChange={launcher.updateInjectMode}
                  onCheckUpdate={launcher.checkLoaderUpdate}
                  onUpdateLoader={launcher.performLoaderUpdate}
                  onPickWallpaper={launcher.chooseWallpaper}
                  onClearWallpaper={launcher.clearWallpaper}
                >
                  <GameCard
                    path={launcher.path}
                    pathValid={launcher.pathValid}
                    onPathChange={launcher.setPath}
                    status={launcher.status}
                    gameExe={launcher.info?.gameExe ?? DEFAULT_GAME_EXE}
                    busy={launcher.busy}
                    loaderUpdate={launcher.loaderUpdate}
                    onDetect={launcher.detect}
                    onBrowse={launcher.browse}
                    onInstall={launcher.install}
                    onLaunch={launcher.launchGame}
                    onRestore={launcher.restoreLoader}
                    onUninstall={requestUninstall}
                    onOpenMod={launcher.openModsDir}
                    onOpenShaderFixes={launcher.openShaderFixesDir}
                    onOpenGameDir={launcher.openGameDir}
                  />
                </SettingsView>
              )}
            </div>
          </main>
        </div>

        <Modal
          open={confirmUninstall}
          title="确认卸载 NSMMI"
          okText="确认卸载"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          onOk={confirmUninstallAction}
          onCancel={cancelUninstall}
          cancelButtonProps={{ disabled: launcher.busy === "uninstall" }}
        >
          将移除准备记录与旧版残留在游戏目录里的加载器文件；NSMMI 工作目录里的 Mod\
          与 ShaderFixes\ 完整保留。
        </Modal>
      </div>
    </ConfigProvider>
  );
}
