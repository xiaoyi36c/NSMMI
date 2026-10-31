import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactElement, ReactNode } from "react";

export type SafeTooltipPlacement = "top" | "bottom" | "left" | "right";

interface SafeTooltipProps {
  title: ReactNode;
  placement?: SafeTooltipPlacement;
  /** 悬停延迟毫秒，默认 120（与 antd 的 mouseEnterDelay 同名兼容） */
  mouseEnterDelay?: number;
  /** children 必须是能接收 ref 与鼠标事件的单个元素 */
  children: ReactElement;
}

const GAP = 6;

/**
 * 轻量悬停提示气泡。
 * antd v6 的弹层定位（@rc-component/trigger）在新版 Chromium/WebView2 下
 * 会停在 -1000vw/-1000vh 的隐藏位，这里用 fixed 定位 + 触发元素坐标自绘，不依赖 rc-trigger。
 */
export function SafeTooltip({
  title,
  placement = "top",
  mouseEnterDelay: delay = 120,
  children,
}: SafeTooltipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const timer = useRef(0);
  const childRef = useRef<HTMLElement | null>(null);

  const update = useCallback(() => {
    const el = childRef.current;
    if (!el) {
      return;
    }
    const r = el.getBoundingClientRect();
    let left: number;
    let top: number;
    if (placement === "right") {
      left = r.right + GAP;
      top = r.top + r.height / 2;
    } else if (placement === "left") {
      left = r.left - GAP;
      top = r.top + r.height / 2;
    } else if (placement === "bottom") {
      left = r.left + r.width / 2;
      top = r.bottom + GAP;
    } else {
      left = r.left + r.width / 2;
      top = r.top - GAP;
    }
    // 视口内收口，避免出屏
    left = Math.min(Math.max(left, 8), window.innerWidth - 8);
    top = Math.min(Math.max(top, 8), window.innerHeight - 8);
    setPos({ left, top });
  }, [placement]);

  const show = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      update();
      setOpen(true);
    }, delay);
  }, [delay, update]);

  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setOpen(false);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (!isValidElement(children)) {
    return children;
  }

  const child = children as ReactElement<Record<string, unknown>>;
  const props = child.props as {
    onMouseEnter?: (e: React.MouseEvent) => void;
    onMouseLeave?: (e: React.MouseEvent) => void;
    onFocus?: (e: React.FocusEvent) => void;
    onBlur?: (e: React.FocusEvent) => void;
  };

  const bubbleStyle: React.CSSProperties = {
    left: pos.left,
    top: pos.top,
    transform:
      placement === "right"
        ? "translateY(-50%)"
        : placement === "left"
          ? "translate(-100%, -50%)"
          : placement === "bottom"
            ? "translate(-50%, 0)"
            : "translate(-50%, -100%)",
  };

  const cloned = cloneElement(child, {
    ref: (node: HTMLElement | null) => {
      childRef.current = node;
    },
    onMouseEnter: (e: React.MouseEvent) => {
      props.onMouseEnter?.(e);
      show();
    },
    onMouseLeave: (e: React.MouseEvent) => {
      props.onMouseLeave?.(e);
      hide();
    },
    onFocus: (e: React.FocusEvent) => {
      props.onFocus?.(e);
      show();
    },
    onBlur: (e: React.FocusEvent) => {
      props.onBlur?.(e);
      hide();
    },
  } as Partial<typeof child.props>);

  return (
    <>
      {cloned}
      {open && (
        <span
          className={`safe-tooltip safe-tooltip-${placement}`}
          style={bubbleStyle}
          role="tooltip"
        >
          {title}
        </span>
      )}
    </>
  );
}

/** 使用侧沿用 antd 的名字 */
export const Tooltip = SafeTooltip;
