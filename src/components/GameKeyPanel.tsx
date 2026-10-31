import { useCallback, useEffect, useMemo, useState } from "react";

import { GAME_KEYS } from "../constants";
import { api } from "../lib/api";
import { toErrorMessage } from "../lib/format";
import type { GameKey } from "../types";

interface GameKeyPanelProps {
  /** 置灰（游戏未运行等） */
  disabled?: boolean;
  /** 紧凑模式（悬浮窗内使用） */
  compact?: boolean;
  /** 标题 */
  title?: string;
  /** 副标题说明 */
  hint?: string;
}

type Message = { text: string; kind: "ok" | "error" } | null;
/** 动作 id → 覆盖的按键名（仅存自定义项，未出现的用默认键） */
type Bindings = Record<string, string>;

const STORAGE_KEY = "nsmmi.gamekey-bindings";

function loadBindings(): Bindings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Bindings) : {};
  } catch {
    return {};
  }
}

function saveBindings(bindings: Bindings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
}

/** 键名 → 键帽显示文本（自定义键也保持中文小键盘风格） */
function keyCap(key: string): string {
  const np = /^Numpad([0-9])$/i.exec(key);
  if (np) {
    return `小键盘${np[1]}`;
  }
  const ops: Record<string, string> = {
    Divide: "小键盘÷",
    Multiply: "小键盘×",
    Subtract: "小键盘−",
    Add: "小键盘＋",
    Decimal: "小键盘.",
  };
  return ops[key] ?? key;
}

/** KeyboardEvent.code → 发送用键名（null = 忽略该键，如修饰键） */
function codeToKeyName(code: string): string | null {
  if (/^F([1-9]|1[0-2])$/.test(code)) {
    return code;
  }
  const np = /^Numpad([0-9])$/.exec(code);
  if (np) {
    return `Numpad${np[1]}`;
  }
  const ops: Record<string, string> = {
    NumpadDivide: "Divide",
    NumpadMultiply: "Multiply",
    NumpadSubtract: "Subtract",
    NumpadAdd: "Add",
    NumpadDecimal: "Decimal",
  };
  if (ops[code]) {
    return ops[code];
  }
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) {
    return digit[1];
  }
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) {
    return letter[1];
  }
  if (code === "Space") {
    return "Space";
  }
  return null;
}

/**
 * 游戏内按键：把 3DMigoto 的游戏内热键做成可点击的键帽。
 * 没有小键盘的笔记本可以直接点键帽代替手动按键。
 * 支持自定义：点「自定义」后点击任意键帽，再按下新按键即可重绑（存本地，两窗同步）。
 */
export function GameKeyPanel({
  disabled = false,
  compact = false,
  title = "游戏内按键",
  hint = "点击键帽向游戏发送按键（无小键盘也能用）",
}: GameKeyPanelProps) {
  const [sending, setSending] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [bindings, setBindings] = useState<Bindings>(() => loadBindings());
  const [editing, setEditing] = useState(false);
  const [capturing, setCapturing] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, GameKey[]>();
    for (const item of GAME_KEYS) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return [...map.entries()].map(([name, items]) => ({ name, items }));
  }, []);

  // 其他窗口改了绑定（主窗口 / 悬浮窗共用 localStorage）时同步
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setBindings(loadBindings());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // 捕获新按键
  useEffect(() => {
    if (!capturing) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setCapturing(null);
        return;
      }
      const name = codeToKeyName(event.code);
      if (!name) {
        return;
      }
      const next = { ...bindings, [capturing]: name };
      setBindings(next);
      saveBindings(next);
      setCapturing(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [capturing, bindings]);

  const keyOf = useCallback(
    (item: GameKey) => bindings[item.id] ?? item.key,
    [bindings],
  );
  const capOf = useCallback(
    (item: GameKey) =>
      item.id in bindings ? keyCap(bindings[item.id]) : item.cap,
    [bindings],
  );

  const resetAll = () => {
    setBindings({});
    saveBindings({});
    setCapturing(null);
  };

  const send = async (item: GameKey, key: string) => {
    if (disabled || sending) {
      return;
    }
    setSending(item.id);
    setMessage(null);
    try {
      const text = await api.sendGameKey(key);
      setMessage({ text: `${item.label}：${text}`, kind: "ok" });
    } catch (error) {
      setMessage({ text: toErrorMessage(error), kind: "error" });
    } finally {
      setSending(null);
    }
  };

  return (
    <div className={compact ? "gamekey-panel gamekey-panel--compact" : "gamekey-panel"}>
      <div className="gamekey-head">
        <span className="gamekey-title">{title}</span>
        {editing ? (
          <span className="gamekey-head-actions">
            <button type="button" className="gamekey-edit-btn" onClick={resetAll}>
              恢复默认
            </button>
            <button
              type="button"
              className="gamekey-edit-btn"
              onClick={() => {
                setEditing(false);
                setCapturing(null);
              }}
            >
              完成
            </button>
          </span>
        ) : (
          <span className="gamekey-head-actions">
            <button
              type="button"
              className="gamekey-edit-btn"
              disabled={disabled}
              onClick={() => setEditing(true)}
            >
              自定义
            </button>
          </span>
        )}
      </div>
      <span className="gamekey-hint">
        {editing
          ? capturing
            ? "按下新按键…（Esc 取消）"
            : "点击要改的键帽，然后按下新按键"
          : hint}
      </span>

      {groups.map((group) => (
        <div className="gamekey-group" key={group.name}>
          <span className="gamekey-group-name">{group.name}</span>
          <div className="gamekey-grid">
            {group.items.map((item) => {
              const isCapturing = capturing === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={
                    "gamekey" + (isCapturing ? " capturing" : "") + (editing ? " editing" : "")
                  }
                  disabled={disabled || (!editing && sending !== null)}
                  title={
                    editing
                      ? "点击后按下新按键（Esc 取消）"
                      : `${item.desc}（当前绑定 ${keyOf(item)}）`
                  }
                  onClick={() => {
                    if (editing) {
                      setCapturing(item.id);
                    } else {
                      void send(item, keyOf(item));
                    }
                  }}
                >
                  <span className="gamekey-cap">
                    {isCapturing ? "…" : editing ? capOf(item) : capOf(item)}
                  </span>
                  <span className="gamekey-text">
                    <span className="gamekey-label">{item.label}</span>
                    {!compact && <span className="gamekey-desc">{item.desc}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {message && (
        <p className={message.kind === "ok" ? "gamekey-msg ok" : "gamekey-msg error"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
