import { useCallback, useState } from "react";
import { Button, ConfigProvider, Menu, Modal, theme } from "antd";
import {
  BugOutlined,
  HomeOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import zhCN from "antd/locale/zh_CN";

import { DebugView } from "./components/DebugView";
import { CharactersView } from "./components/CharactersView";
import { GameCard } from "./components/GameCard";
import { HomeView } from "./components/HomeView";
import { SettingsView } from "./components/SettingsView";
import { TitleBar } from "./components/TitleBar";
import { DEFAULT_GAME_EXE } from "./constants";
import { useLauncher } from "./hooks/useLauncher";
import { isTauri } from "./lib/tauri-env";
import type { View } from "./types";

/** Ant Design 统一主题：标准大厂蓝，圆角 8 */
const ANT_THEME = {
  algorithm: theme.defaultAlgorithm,
  token: {
    borderRadius: 8,
    fontSize: 14,
  },
};

const MENU_ITEMS = [
  { key: "home", icon: <HomeOutlined />, label: "首页" },
  { key: "characters", icon: <TeamOutlined />, label: "角色管理" },
  { key: "debug", icon: <BugOutlined />, label: "调试模式" },
  { key: "settings", icon: <SettingOutlined />, label: "设置" },
] as const;

/** 浏览器预览时可用 ?view=characters/debug/settings 直达对应页面 */
function initialView(): View {
  const v = new URLSearchParams(window.location.search).get("view");
  return MENU_ITEMS.some((item) => item.key === v) ? (v as View) : "home";
}

export default function App() {
  const launcher = useLauncher();
  const [view, setView] = useState<View>(initialView);
  const [collapsed, setCollapsed] = useState(false);
  const [confirmUninstall, setConfirmUninstall] = useState(false);

  // 稳定引用，配合子组件 memo 避免无谓重渲染
  const requestUninstall = useCallback(() => setConfirmUninstall(true), []);
  const cancelUninstall = useCallback(() => setConfirmUninstall(false), []);
  const confirmUninstallAction = useCallback(() => {
    setConfirmUninstall(false);
    void launcher.uninstall();
  }, [launcher.uninstall]);
  const toggleCollapsed = useCallback(() => setCollapsed((c) => !c), []);

  // 标题栏透明悬浮仅当首页且铺了壁纸；默认白底时用普通浅色标题栏
  const overlay = view === "home" && launcher.wallpaper !== null;

  return (
    <ConfigProvider locale={zhCN} theme={ANT_THEME}>
      <div className="app-shell">
        <TitleBar overlay={overlay} onOpenExternal={launcher.openExternal} />

        {!isTauri && (
          <p className="preview-banner">
            浏览器预览模式：未检测到 Tauri 运行时，安装、启动等桌面功能不可用。
          </p>
        )}

        <div className="app-body">
          <aside className={`sider${collapsed ? " collapsed" : ""}`}>
            <Menu
              className="sider-menu"
              mode="inline"
              inlineCollapsed={collapsed}
              selectedKeys={[view]}
              items={MENU_ITEMS.map((item) => ({
                key: item.key,
                icon: item.icon,
                label: item.label,
              }))}
              onClick={({ key }) => setView(key as View)}
            />
            <Button
              type="text"
              className="sider-trigger"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={toggleCollapsed}
              aria-label={collapsed ? "展开菜单" : "收起菜单"}
            />
          </aside>

          <div className="app-content">
            {view === "home" && (
              <HomeView
                wallpaper={launcher.wallpaper}
                status={launcher.status}
                busy={launcher.busy}
                version={launcher.info?.version ?? null}
                onLaunch={launcher.launchGame}
                onInstall={launcher.install}
                onPickWallpaper={launcher.chooseWallpaper}
                onClearWallpaper={launcher.clearWallpaper}
              />
            )}

            {view === "characters" && (
              <CharactersView
                mods={launcher.mods}
                busy={launcher.busy}
                onToggle={launcher.toggleMod}
                onRefresh={launcher.refreshMods}
                onOpenFolder={launcher.openModsDir}
              />
            )}

            {view === "debug" && (
              <DebugView
                logs={launcher.logs}
                onClearLogs={launcher.clearLogs}
                onOpenMods={launcher.openModsDir}
                onOpenShaderFixes={launcher.openShaderFixesDir}
                onOpenGameDir={launcher.openGameDir}
              />
            )}

            {view === "settings" && (
              <SettingsView
                wallpaper={launcher.wallpaper}
                busy={launcher.busy}
                version={launcher.info?.version ?? null}
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
                  onDetect={launcher.detect}
                  onBrowse={launcher.browse}
                  onInstall={launcher.install}
                  onLaunch={launcher.launchGame}
                  onUninstall={requestUninstall}
                  onOpenMods={launcher.openModsDir}
                  onOpenShaderFixes={launcher.openShaderFixesDir}
                  onOpenGameDir={launcher.openGameDir}
                />
              </SettingsView>
            )}
          </div>
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
          将按安装清单精确还原或删除加载器文件。ShaderFixes 与 Mods
          中的用户文件会保留，原版备份保留在 _NSMMI\backup\。
        </Modal>
      </div>
    </ConfigProvider>
  );
}
