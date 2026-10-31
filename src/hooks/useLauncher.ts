import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../lib/api";
import { toErrorMessage } from "../lib/format";
import { isTauri, PREVIEW_NOTICE } from "../lib/tauri-env";
import type {
  AppInfo,
  BusyAction,
  LogEntry,
  LogLevel,
  ModItem,
  Status,
} from "../types";

const EMPTY_STATUS: Status = {
  gamePath: null,
  installed: false,
  gameRunning: false,
  installedAt: null,
  nsmmiVersion: null,
};

const MAX_LOGS = 400;
const STATUS_INTERVAL = 3000;
const VALIDATE_DEBOUNCE = 350;

let logSeq = 0;

function nowLabel(): string {
  return new Date().toTimeString().slice(0, 8);
}

function makeEntries(lines: string[], level: LogLevel): LogEntry[] {
  return lines.map((text) => ({
    id: ++logSeq,
    time: nowLabel(),
    level,
    text,
  }));
}

/** 轮询结果未变化时复用旧对象，避免整棵树无谓重渲染 */
function sameStatus(a: Status, b: Status): boolean {
  return (
    a.gamePath === b.gamePath &&
    a.installed === b.installed &&
    a.gameRunning === b.gameRunning &&
    a.installedAt === b.installedAt &&
    a.nsmmiVersion === b.nsmmiVersion
  );
}

function appendLogs(prev: LogEntry[], entries: LogEntry[]): LogEntry[] {
  const next = [...prev, ...entries];
  return next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next;
}

export function useLauncher() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [status, setStatus] = useState<Status>(EMPTY_STATUS);
  const [mods, setMods] = useState<ModItem[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [path, setPath] = useState("");
  const [pathValid, setPathValid] = useState<boolean | null>(null);
  const [wallpaper, setWallpaper] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);

  // 事件回调里读取最新路径；用 effect 同步而非渲染期写 ref（并发渲染安全）
  const pathRef = useRef(path);
  useEffect(() => {
    pathRef.current = path;
  }, [path]);

  const push = useCallback((text: string, level: LogLevel = "info") => {
    setLogs((prev) => appendLogs(prev, makeEntries([text], level)));
  }, []);

  const pushMany = useCallback((lines: string[], level: LogLevel = "info") => {
    if (lines.length === 0) {
      return;
    }
    setLogs((prev) => appendLogs(prev, makeEntries(lines, level)));
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  const refreshStatus = useCallback(async () => {
    try {
      const next = await api.status();
      setStatus((prev) => (sameStatus(prev, next) ? prev : next));
    } catch (error) {
      push(toErrorMessage(error), "error");
    }
  }, [push]);

  const loadMods = useCallback(async (gameRoot: string) => {
    if (!gameRoot) {
      setMods([]);
      return;
    }
    try {
      setMods(await api.listMods(gameRoot));
    } catch {
      setMods([]);
    }
  }, []);

  const refreshMods = useCallback(() => loadMods(pathRef.current), [loadMods]);

  const run = useCallback(async (label: BusyAction, task: () => Promise<void>) => {
    setBusy(label);
    try {
      await task();
    } finally {
      setBusy(null);
    }
  }, []);

  // 输入停止后校验目录
  useEffect(() => {
    const value = path.trim();
    if (!value) {
      setPathValid(null);
      return;
    }
    const timer = window.setTimeout(() => {
      api
        .validateGameRoot(value)
        .then(setPathValid)
        .catch(() => setPathValid(null));
    }, VALIDATE_DEBOUNCE);
    return () => window.clearTimeout(timer);
  }, [path]);

  // 启动初始化：StrictMode 下只跑一次，appInfo 与 status 并行拉取
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current) {
      return;
    }
    bootstrapped.current = true;

    void (async () => {
      // 浏览器预览（无 Tauri 运行时）只提示一次，不发起 IPC 调用
      if (!isTauri) {
        push(PREVIEW_NOTICE, "warn");
        return;
      }

      const [appInfo, current, wallpaperPath] = await Promise.all([
        api.appInfo().catch((error: unknown) => {
          push(toErrorMessage(error), "error");
          return null;
        }),
        api.status().catch((error: unknown) => {
          push(toErrorMessage(error), "error");
          return null;
        }),
        api.getWallpaper().catch(() => null),
      ]);

      setWallpaper(wallpaperPath);

      if (appInfo) {
        setInfo(appInfo);
        push(`NSMMI v${appInfo.version} 已启动`, "ok");
        if (!appInfo.resourcesOk) {
          push("未找到随包的 Resources\\Loader，安装功能不可用", "warn");
        }
      }

      if (current) {
        setStatus(current);
        if (current.gamePath) {
          setPath(current.gamePath);
          push(`已载入上次路径: ${current.gamePath}`);
          await loadMods(current.gamePath);
          return;
        }
      }

      // 无历史路径时自动检测一次
      try {
        const found = await api.detectGame();
        if (found) {
          setPath(found);
          push(`自动检测到游戏目录: ${found}`, "ok");
          await loadMods(found);
        } else {
          push("未自动检测到游戏，请点击 [自动检测] 或 [浏览…] 手动定位", "warn");
        }
      } catch (error) {
        push(toErrorMessage(error), "error");
      }
    })();
  }, [push, loadMods]);

  // 状态轮询：页面不可见时跳过，重新可见时立即补一次
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden && isTauri) {
        void refreshStatus();
      }
    }, STATUS_INTERVAL);

    const onVisibilityChange = () => {
      if (!document.hidden && isTauri) {
        void refreshStatus();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshStatus]);

  const detect = useCallback(() => {
    return run("detect", async () => {
      try {
        const found = await api.detectGame();
        if (!found) {
          push("未检测到游戏，请手动选择 nshm.exe 所在目录", "warn");
          return;
        }
        setPath(found);
        await api.saveGamePath(found).catch(() => undefined);
        push(`检测到游戏目录: ${found}`, "ok");
        await refreshStatus();
        await loadMods(found);
      } catch (error) {
        push(toErrorMessage(error), "error");
      }
    });
  }, [run, push, refreshStatus, loadMods]);

  const browse = useCallback(() => {
    return run("browse", async () => {
      try {
        const picked = await api.pickGameFolder(pathRef.current);
        if (!picked) {
          return;
        }
        setPath(picked);
        await api.saveGamePath(picked).catch(() => undefined);
        push(`已选择目录: ${picked}`);
        await refreshStatus();
        await loadMods(picked);
      } catch (error) {
        push(toErrorMessage(error), "error");
      }
    });
  }, [run, push, refreshStatus, loadMods]);

  const install = useCallback(() => {
    return run("install", async () => {
      const gameRoot = pathRef.current.trim();
      if (!gameRoot) {
        push("请先选择游戏目录", "warn");
        return;
      }
      try {
        const lines = await api.install(gameRoot);
        pushMany(lines, "ok");
        await refreshStatus();
        await loadMods(gameRoot);
      } catch (error) {
        push(`安装失败: ${toErrorMessage(error)}`, "error");
      }
    });
  }, [run, push, pushMany, refreshStatus, loadMods]);

  const uninstall = useCallback(() => {
    return run("uninstall", async () => {
      const gameRoot = pathRef.current.trim();
      if (!gameRoot) {
        push("请先选择游戏目录", "warn");
        return;
      }
      try {
        const lines = await api.uninstall(gameRoot);
        pushMany(lines, "ok");
        await refreshStatus();
        await loadMods(gameRoot);
      } catch (error) {
        push(`卸载失败: ${toErrorMessage(error)}`, "error");
      }
    });
  }, [run, push, pushMany, refreshStatus, loadMods]);

  const launchGame = useCallback(() => {
    return run("launch", async () => {
      const gameRoot = pathRef.current.trim();
      if (!gameRoot) {
        push("请先选择游戏目录", "warn");
        return;
      }
      try {
        const lines = await api.launchGame(gameRoot);
        pushMany(lines, "ok");
        await refreshStatus();
      } catch (error) {
        push(`启动失败: ${toErrorMessage(error)}`, "error");
      }
    });
  }, [run, push, pushMany, refreshStatus]);

  const toggleMod = useCallback(
    (name: string) => {
      return run("toggle", async () => {
        const gameRoot = pathRef.current.trim();
        if (!gameRoot) {
          return;
        }
        try {
          setMods(await api.toggleMod(gameRoot, name));
          push(`已切换: ${name}`, "ok");
        } catch (error) {
          push(`切换失败: ${toErrorMessage(error)}`, "error");
        }
      });
    },
    [run, push],
  );

  const openModsDir = useCallback(() => {
    const gameRoot = pathRef.current.trim();
    if (!gameRoot) {
      push("请先选择游戏目录", "warn");
      return Promise.resolve();
    }
    return api.openModsDir(gameRoot).catch((error) => {
      push(toErrorMessage(error), "warn");
    });
  }, [push]);

  const openShaderFixesDir = useCallback(() => {
    const gameRoot = pathRef.current.trim();
    if (!gameRoot) {
      push("请先选择游戏目录", "warn");
      return Promise.resolve();
    }
    return api.openShaderFixesDir(gameRoot).catch((error) => {
      push(toErrorMessage(error), "warn");
    });
  }, [push]);

  const openGameDir = useCallback(() => {
    const gameRoot = pathRef.current.trim();
    if (!gameRoot) {
      push("请先选择游戏目录", "warn");
      return Promise.resolve();
    }
    return api.openFolder(gameRoot).catch((error) => {
      push(toErrorMessage(error), "warn");
    });
  }, [push]);

  const openExternal = useCallback((url: string) => {
    return api.openExternal(url).catch(() => undefined);
  }, []);

  const chooseWallpaper = useCallback(() => {
    return run("wallpaper", async () => {
      try {
        const picked = await api.pickWallpaper();
        if (!picked) {
          return;
        }
        await api.setWallpaper(picked);
        setWallpaper(picked);
        push("已更新背景图", "ok");
      } catch (error) {
        push(toErrorMessage(error), "warn");
      }
    });
  }, [run, push]);

  const clearWallpaper = useCallback(() => {
    return run("wallpaper", async () => {
      try {
        await api.setWallpaper(null);
        setWallpaper(null);
        push("已恢复默认背景");
      } catch (error) {
        push(toErrorMessage(error), "warn");
      }
    });
  }, [run, push]);

  return {
    info,
    status,
    mods,
    logs,
    path,
    pathValid,
    busy,
    setPath,
    clearLogs,
    refreshMods,
    detect,
    browse,
    install,
    uninstall,
    launchGame,
    toggleMod,
    openModsDir,
    openShaderFixesDir,
    openGameDir,
    openExternal,
    wallpaper,
    chooseWallpaper,
    clearWallpaper,
  };
}
