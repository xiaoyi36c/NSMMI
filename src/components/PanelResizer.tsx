import { useCallback, useRef, useState } from "react";

interface PanelResizerProps {
  /** 当前面板宽度 */
  width: number;
  minWidth?: number;
  maxWidth?: number;
  onWidthChange: (width: number) => void;
}

/** 中间栏与内容栏之间的拖拽分界线：按住左右拖动调整面板宽度 */
export function PanelResizer({
  width,
  minWidth = 200,
  maxWidth = 400,
  onWidthChange,
}: PanelResizerProps) {
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ startX: 0, startW: 0 });

  const onMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      drag.current = { startX: event.clientX, startW: width };
      setDragging(true);
      document.body.classList.add("panel-resizing");

      const onMove = (ev: MouseEvent) => {
        const next = Math.min(
          maxWidth,
          Math.max(minWidth, drag.current.startW + ev.clientX - drag.current.startX),
        );
        onWidthChange(next);
      };
      const onUp = () => {
        setDragging(false);
        document.body.classList.remove("panel-resizing");
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [width, minWidth, maxWidth, onWidthChange],
  );

  return (
    <div
      className={`panel-resizer${dragging ? " active" : ""}`}
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="拖动调整面板宽度"
      title="拖动调整面板宽度"
    />
  );
}
