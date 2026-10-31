import { useEffect, useMemo, useRef, useState } from "react";
import { Button, ConfigProvider, Input, Select, Switch, theme } from "antd";
import { Tooltip } from "./SafeTooltip";
import {
  ClearOutlined,
  CopyOutlined,
  DatabaseOutlined,
  FileImageOutlined,
  FolderOpenOutlined,
  MinusOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";

import { api } from "../lib/api";
import { toErrorMessage } from "../lib/format";
import { GameKeyPanel } from "./GameKeyPanel";
import type { DebugOption, DebugState, DumpFile } from "../types";

/** 日志保留行数 */
const LOG_LINES = 80;
/** 日志轮询间隔（毫秒） */
const LOG_INTERVAL = 2000;
/** 游戏目录 / 调试开关 / dump 列表轮询间隔（毫秒） */
const META_INTERVAL = 5000;

type Message = { text: string; kind: "ok" | "warn" | "error" } | null;

/** 日志着色：3DMigoto 输出里的 error / warning 关键字优先 */
function logKind(line: string): "info" | "warn" | "error" {
  const lower = line.toLowerCase();
  if (
    lower.includes("error") ||
    lower.includes("failed") ||
    line.includes("错误") ||
    line.includes("失败")
  ) {
    return "error";
  }
  if (lower.includes("warn") || line.includes("警告")) {
    return "warn";
  }
  return "info";
}

/** 调试悬浮窗（label == "overlay" 的独立窗口渲染） */
export function OverlayWindow() {
  const [gamePath, setGamePath] = useState<string | null>(null);
  const [gameRunning, setGameRunning] = useState(false);
  const [pathReady, setPathReady] = useState(false);
  const [debug, setDebug] = useState<DebugState | null>(null);
  const [debugReady, setDebugReady] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [logHint, setLogHint] = useState<string | null>(null);
  const [dumps, setDumps] = useState<DumpFile[]>([]);
  const [file, setFile] = useState<string | undefined>(undefined);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState<DebugOption | null>(null);
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  /** 启动游戏：注入 3DMigoto 后拉起（游戏退出后自动还原） */
  const startGame = async () => {
    if (!gamePath || launching) {
      return;
    }
    setLaunching(true);
    try {
      const outcome = await api.launchGame(gamePath);
      if (outcome.hint) {
        setMessage({ text: outcome.hint, kind: "warn" });
      } else {
        setMessage({ text: outcome.lines.join(" · "), kind: "ok" });
      }
    } catch (error) {
      setMessage({ text: `启动失败: ${toErrorMessage(error)}`, kind: "error" });
    } finally {
      setLaunching(false);
    }
  };

  useEffect(() => {
    document.body.classList.add("overlay-mode");
    return () => document.body.classList.remove("overlay-mode");
  }, []);

  // 游戏目录：跟随主窗口设置变化（主窗口改路径后悬浮窗同步）
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const status = await api.status();
        if (cancelled) {
          return;
        }
        setGamePath((prev) => (prev === status.gamePath ? prev : status.gamePath));
        setGameRunning(status.gameRunning);
      } catch {
        /* 忽略轮询错误 */
      } finally {
        if (!cancelled) {
          setPathReady(true);
        }
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), META_INTERVAL);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  // 调试开关与 dump 列表：低频刷新（d3dx.ini 读取很便宜）
  useEffect(() => {
    if (!gamePath) {
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const [state, list] = await Promise.all([
          api.getDebugState(gamePath),
          api.listDumps(gamePath).catch(() => [] as DumpFile[]),
        ]);
        if (cancelled) {
          return;
        }
        setDebug(state);
        setDumps(list);
      } catch {
        if (!cancelled) {
          setDebug(null);
        }
      } finally {
        if (!cancelled) {
          setDebugReady(true);
        }
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), META_INTERVAL);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [gamePath]);

  // 日志：高频轮询，保留读取失败原因（便于提示开启详细日志）
  useEffect(() => {
    if (!gamePath) {
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const lines = await api.readLoaderLog(gamePath, LOG_LINES);
        if (cancelled) {
          return;
        }
        setLogLines(lines);
        setLogHint(null);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setLogLines([]);
        setLogHint(toErrorMessage(error));
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), LOG_INTERVAL);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [gamePath]);

  // 新日志自动滚动到底部
  useEffect(() => {
    const el = logRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logLines]);

  const toggle = async (option: DebugOption) => {
    if (!gamePath || busy) {
      return;
    }
    const next = !(option === "hunting" ? debug?.hunting : debug?.logging);
    setBusy(option);
    try {
      const state = await api.setDebugOption(gamePath, option, next);
      setDebug(state);
      setMessage({
        kind: "ok",
        text:
          option === "hunting"
            ? `狩猎模式已${next ? "开启" : "关闭"}（重启游戏后生效）`
            : `详细日志已${next ? "开启" : "关闭"}（重启游戏后生效）`,
      });
    } catch (error) {
      setMessage({ kind: "error", text: toErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  };

  const saveNote = async () => {
    if (!gamePath || !file || !note.trim() || saving) {
      return;
    }
    setSaving(true);
    try {
      setDumps(await api.saveModelNote(gamePath, file, note.trim()));
      setMessage({ kind: "ok", text: `已保存备注「${note.trim()}」并创建文件夹` });
      setNote("");
      setFile(undefined);
    } catch (error) {
      setMessage({ kind: "error", text: toErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  const openDir = async (task: () => Promise<void>) => {
    try {
      await task();
    } catch (error) {
      setMessage({ kind: "error", text: toErrorMessage(error) });
    }
  };

  const copyLog = async () => {
    if (logLines.length === 0) {
      return;
    }
    try {
      await navigator.clipboard.writeText(logLines.join("\n"));
      setMessage({ kind: "ok", text: "日志已复制到剪贴板" });
    } catch {
      setMessage({ kind: "error", text: "复制失败，请手动选择日志文本" });
    }
  };

  const dumpOptions = useMemo(
    () =>
      dumps.map((dump) => ({
        value: dump.name,
        label: dump.note ? `${dump.name}（${dump.note}）` : dump.name,
      })),
    [dumps],
  );

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: { borderRadius: 6, fontSize: 12, controlHeight: 26 },
      }}
    >
      <div className="overlay-root">
        <div className="overlay-card">
          <div className="overlay-head">
            {/* 拖拽区与按钮区分离，避免按钮被拖拽手势吞掉 */}
            <div className="overlay-drag" data-tauri-drag-region>
              <span className="overlay-dot" aria-hidden="true" />
              <span className="overlay-title" data-tauri-drag-region>
                NSMMI 调试悬浮窗
              </span>
              <Tooltip title="Ctrl+Shift+H 显隐">
                <span className="overlay-shortcut" data-tauri-drag-region>
                  Ctrl+Shift+H
                </span>
              </Tooltip>
            </div>
            <div className="overlay-head-actions">
              <Tooltip title="注入 3Dm 并启动游戏（退出后自动还原）">
                <Button
                  type="text"
                  size="small"
                  aria-label="启动游戏"
                  icon={<PlayCircleOutlined aria-hidden="true" />}
                  loading={launching}
                  disabled={!gamePath || launching}
                  onClick={() => void startGame()}
                />
              </Tooltip>
              <Tooltip title="打开 Mod 目录">
                <Button
                  type="text"
                  size="small"
                  aria-label="打开 Mod 目录"
                  icon={<FolderOpenOutlined aria-hidden="true" />}
                  disabled={!gamePath}
                  onClick={() =>
                    void openDir(() => api.openModsDir(gamePath as string))
                  }
                />
              </Tooltip>
              <Tooltip title="打开 ShaderFixes 目录">
                <Button
                  type="text"
                  size="small"
                  aria-label="打开 ShaderFixes 目录"
                  icon={<FileImageOutlined aria-hidden="true" />}
                  disabled={!gamePath}
                  onClick={() =>
                    void openDir(() => api.openShaderFixesDir(gamePath as string))
                  }
                />
              </Tooltip>
              <Tooltip title="打开游戏目录">
                <Button
                  type="text"
                  size="small"
                  aria-label="打开游戏目录"
                  icon={<DatabaseOutlined aria-hidden="true" />}
                  disabled={!gamePath}
                  onClick={() =>
                    void openDir(() => api.openFolder(gamePath as string))
                  }
                />
              </Tooltip>
              <Tooltip title="隐藏悬浮窗（Ctrl+Shift+H 呼出）">
                <button
                  type="button"
                  className="overlay-hide"
                  aria-label="隐藏悬浮窗"
                  onClick={() => void api.toggleOverlay()}
                >
                  <MinusOutlined aria-hidden="true" />
                </button>
              </Tooltip>
            </div>
          </div>

          <div className="overlay-body">
            {!gamePath && pathReady && (
              <p className="overlay-warn">未检测到游戏目录，请先在主窗口设置</p>
            )}

            <div className="overlay-switches">
              <div className="overlay-switch-row">
                <div className="overlay-switch-main">
                  <span className="overlay-switch-title">狩猎模式</span>
                  <span className="overlay-switch-desc">
                    开启后游戏内按 F10 开启猎取 · F4 随时开关 · 无需重启
                  </span>
                </div>
                <Switch
                  size="small"
                  checked={debug?.hunting ?? false}
                  loading={busy === "hunting"}
                  disabled={!debug || busy !== null}
                  onChange={() => void toggle("hunting")}
                />
              </div>
              <div className="overlay-switch-row">
                <div className="overlay-switch-main">
                  <span className="overlay-switch-title">详细日志</span>
                  <span className="overlay-switch-desc">
                    输出警告与错误，便于排查 shader / mod
                  </span>
                </div>
                <Switch
                  size="small"
                  checked={debug?.logging ?? false}
                  loading={busy === "logging"}
                  disabled={!debug || busy !== null}
                  onChange={() => void toggle("logging")}
                />
              </div>
              {debugReady && debug === null && gamePath && (
                <p className="overlay-hint">
                  未检测到 d3dx.ini（加载器未安装），开关不可用
                </p>
              )}
            </div>

            <GameKeyPanel
              compact
              disabled={!gameRunning}
              hint={
                gameRunning
                  ? "点击键帽向游戏发送按键（无小键盘也能用）"
                  : "游戏未运行，键帽暂不可用"
              }
            />

            <div className="overlay-log-wrap">
              <div className="overlay-log-head">
                <span className="overlay-log-title">
                  3DMigoto 日志
                  {logLines.length > 0 && (
                    <span className="overlay-log-count">{logLines.length} 行</span>
                  )}
                </span>
                <div className="overlay-log-actions">
                  <Tooltip title="复制日志">
                    <Button
                      type="text"
                      size="small"
                      aria-label="复制日志"
                      icon={<CopyOutlined aria-hidden="true" />}
                      disabled={logLines.length === 0}
                      onClick={() => void copyLog()}
                    />
                  </Tooltip>
                  <Tooltip title="清空当前显示">
                    <Button
                      type="text"
                      size="small"
                      aria-label="清空当前显示"
                      icon={<ClearOutlined aria-hidden="true" />}
                      disabled={logLines.length === 0}
                      onClick={() => setLogLines([])}
                    />
                  </Tooltip>
                </div>
              </div>
              <div className="overlay-log scroll-dark" ref={logRef}>
                {logLines.length === 0 ? (
                  <p className="overlay-empty">
                    {logHint ?? "暂无日志输出 · 开启「详细日志」后重启游戏"}
                  </p>
                ) : (
                  logLines.map((line, index) => (
                    <p
                      key={`${index}-${line.slice(0, 12)}`}
                      className={`overlay-line ${logKind(line)}`}
                    >
                      {line}
                    </p>
                  ))
                )}
              </div>
            </div>

            <div className="overlay-note">
              <Select
                className="overlay-select"
                size="small"
                value={file}
                placeholder={`选择 dump 文件（${dumps.length}）`}
                showSearch
                allowClear
                optionFilterProp="label"
                listHeight={160}
                options={dumpOptions}
                notFoundContent="暂无 dump 文件"
                onChange={(value) => setFile(value ?? undefined)}
              />
              <Input
                size="small"
                placeholder="模型备注 / 文件夹名"
                value={note}
                maxLength={50}
                disabled={!file}
                onChange={(event) => setNote(event.target.value)}
                onPressEnter={() => void saveNote()}
              />
              <Button
                size="small"
                type="primary"
                loading={saving}
                disabled={!file || !note.trim()}
                onClick={() => void saveNote()}
              >
                保存
              </Button>
            </div>

            {message && (
              <p className={`overlay-msg ${message.kind}`}>{message.text}</p>
            )}
          </div>
        </div>
      </div>
    </ConfigProvider>
  );
}
