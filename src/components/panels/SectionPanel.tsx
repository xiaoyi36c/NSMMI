import { memo } from "react";
import { InboxOutlined } from "@ant-design/icons";

export interface PanelSection {
  /** 目标卡片的 DOM id（scrollIntoView 定位用） */
  id: string;
  label: string;
}

interface SectionPanelProps {
  sections: PanelSection[];
  query: string;
  activeId: string | null;
  onJump: (id: string) => void;
}

/**
 * 分区导航型中间栏（调试模式 / 设置页共用）：
 * 列出右侧页面的分区卡片，点击滚动定位。
 */
export const SectionPanel = memo(function SectionPanel({
  sections,
  query,
  activeId,
  onJump,
}: SectionPanelProps) {
  const keyword = query.trim().toLowerCase();
  const visible = keyword
    ? sections.filter((section) => section.label.toLowerCase().includes(keyword))
    : sections;

  if (visible.length === 0) {
    return (
      <div className="panel-empty">
        <InboxOutlined className="panel-empty-icon" aria-hidden="true" />
        <p className="panel-empty-title">没有匹配的分区</p>
        <p className="panel-empty-hint">换个关键词试试</p>
      </div>
    );
  }

  return (
    <>
      {visible.map((section) => {
        const active = activeId === section.id;
        return (
          <button
            key={section.id}
            type="button"
            className={`panel-item${active ? " active" : ""}`}
            aria-current={active ? "page" : undefined}
            onClick={() => {
              onJump(section.id);
              document
                .getElementById(section.id)
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            <span className="panel-section-dot" aria-hidden="true" />
            <span className="panel-item-label">{section.label}</span>
          </button>
        );
      })}
    </>
  );
});
