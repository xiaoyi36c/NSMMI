import { useMemo, useState } from "react";

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

/**
 * 游戏内按键：把 3DMigoto 的游戏内热键做成可点击的键帽。
 * 没有小键盘的笔记本可以直接点键帽代替手动按键。
 */
export function GameKeyPanel({
  disabled = false,
  compact = false,
  title = "游戏内按键",
  hint = "点击键帽向游戏发送按键（无小键盘也能用）",
}: GameKeyPanelProps) {
  const [sending, setSending] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);

  const groups = useMemo(() => {
    const map = new Map<string, GameKey[]>();
    for (const item of GAME_KEYS) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return [...map.entries()].map(([name, items]) => ({ name, items }));
  }, []);

  const send = async (item: GameKey) => {
    if (disabled || sending) {
      return;
    }
    setSending(item.id);
    setMessage(null);
    try {
      const text = await api.sendGameKey(item.key);
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
        <span className="gamekey-hint">{hint}</span>
      </div>

      {groups.map((group) => (
        <div className="gamekey-group" key={group.name}>
          <span className="gamekey-group-name">{group.name}</span>
          <div className="gamekey-grid">
            {group.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="gamekey"
                disabled={disabled || sending !== null}
                title={item.desc}
                onClick={() => void send(item)}
              >
                <span className="gamekey-cap">{item.cap}</span>
                <span className="gamekey-text">
                  <span className="gamekey-label">{item.label}</span>
                  {!compact && <span className="gamekey-desc">{item.desc}</span>}
                </span>
              </button>
            ))}
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
