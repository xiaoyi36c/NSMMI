import { useMemo, useState } from "react";
import { Button, Card, Empty, Input, List, Modal, Space, Tag, Typography } from "antd";
import {
  CameraOutlined,
  FolderOpenOutlined,
  ReloadOutlined,
} from "@ant-design/icons";

import { filterDumps } from "../lib/dumps";
import { formatSize, formatTime } from "../lib/format";
import type { DumpFile, DumpFilter } from "../types";

interface DumpsViewProps {
  dumps: DumpFile[];
  /** 中间栏筛选：全部 / 类型 / 单个文件 */
  filter: DumpFilter;
  /** 侧栏搜索关键字（文件名 / 备注） */
  query: string;
  busy: boolean;
  onRefresh: () => void;
  onSaveNote: (file: string, note: string) => void;
  onOpenShaderFixes: () => void;
}

/** 资源抓取页：ShaderFixes 下 3DMigoto dump（模型 shader / 贴图）列表与备注归档 */
export function DumpsView({
  dumps,
  filter,
  query,
  busy,
  onRefresh,
  onSaveNote,
  onOpenShaderFixes,
}: DumpsViewProps) {
  const [editing, setEditing] = useState<DumpFile | null>(null);
  const [note, setNote] = useState("");

  // 与中间栏共用同一套筛选，两边结果永远一致
  const visible = useMemo(() => filterDumps(dumps, filter, query), [dumps, filter, query]);
  const narrowed =
    filter.kind !== "all" || filter.file !== null || query.trim().length > 0;

  const openEdit = (dump: DumpFile) => {
    setEditing(dump);
    setNote(dump.note ?? "");
  };

  const confirmNote = () => {
    if (editing && note.trim()) {
      onSaveNote(editing.name, note.trim());
      setEditing(null);
    }
  };

  return (
    <div className="page-wrap page-scroll">
      <Card
        className="page-fill"
        title={`资源抓取（${narrowed ? `${visible.length}/${dumps.length}` : dumps.length}）`}
        extra={
          <Space size={8}>
            <Button
              size="small"
              icon={<ReloadOutlined aria-hidden="true" />}
              onClick={onRefresh}
            >
              刷新
            </Button>
            <Button
              size="small"
              icon={<FolderOpenOutlined aria-hidden="true" />}
              onClick={onOpenShaderFixes}
            >
              打开 ShaderFixes
            </Button>
          </Space>
        }
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 12 }}>
          游戏内开启狩猎模式后，按 dump 快捷键抓取的模型 shader（.txt）与贴图（.dds）会落在
          ShaderFixes\；为它们添加备注会自动创建同名归档文件夹。
        </Typography.Paragraph>

        {visible.length === 0 ? (
          <div className="fill-empty">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={null} />
            <p className="fill-empty-title">
              {dumps.length === 0 ? "暂无抓取记录" : "没有匹配的文件"}
            </p>
            <p className="fill-empty-hint">
              {dumps.length === 0
                ? "游戏内开启狩猎模式与详细日志，dump 后点右上角刷新"
                : "在侧栏换个筛选或关键词试试"}
            </p>
          </div>
        ) : (
          <List
            size="small"
            dataSource={visible}
            renderItem={(dump) => (
              <List.Item
                className="mod-item"
                actions={[
                  <Button
                    key="note"
                    size="small"
                    onClick={() => openEdit(dump)}
                    disabled={busy}
                  >
                    {dump.note ? "改备注" : "备注"}
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space size={6}>
                      <CameraOutlined
                        aria-hidden="true"
                        style={{ color: dump.name.toLowerCase().endsWith(".dds") ? "#722ed1" : "#1668dc" }}
                      />
                      <Typography.Text code style={{ fontSize: 12, userSelect: "text" }}>
                        {dump.name}
                      </Typography.Text>
                      {dump.note && <Tag color="success">{dump.note}</Tag>}
                    </Space>
                  }
                  description={
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                      {formatSize(dump.size)}
                      {dump.modified ? ` · ${formatTime(dump.modified)}` : ""}
                    </Typography.Text>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Card>

      <Modal
        open={editing !== null}
        title={`备注：${editing?.name ?? ""}`}
        okText="保存并创建文件夹"
        cancelText="取消"
        onOk={confirmNote}
        onCancel={() => setEditing(null)}
        okButtonProps={{ disabled: !note.trim() }}
      >
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          <Input
            placeholder="模型备注，如：绫华_头发"
            value={note}
            maxLength={50}
            onChange={(event) => setNote(event.target.value)}
            onPressEnter={confirmNote}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            将在 ShaderFixes\ 下创建「{note.trim() || "…"}」文件夹，并记录该文件备注。
          </Typography.Text>
        </Space>
      </Modal>
    </div>
  );
}
