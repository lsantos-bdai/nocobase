import React, { useEffect, useState } from 'react';
import { Card, Spin, Alert, Button, Space, Tooltip, Typography } from 'antd';
import { EditOutlined, DeleteOutlined, ReloadOutlined, HolderOutlined } from '@ant-design/icons';
import { Widget } from '../types';
import { useBigQuery } from '../hooks/useBigQuery';
import { StatWidget } from './widgets/StatWidget';
import { TimeseriesWidget } from './widgets/TimeseriesWidget';
import { BreakdownWidget } from './widgets/BreakdownWidget';
import { TableWidget } from './widgets/TableWidget';
import { PieWidget } from './widgets/PieWidget';
import { MarkdownWidget } from './widgets/MarkdownWidget';

interface Props {
  widget: Widget;
  editMode: boolean;
  onEdit: () => void;
  onDelete: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
  isDragging?: boolean;
}

export function WidgetCard({ widget, editMode, onEdit, onDelete, dragHandleProps, isDragging }: Props) {
  const isMarkdown = widget.type === 'markdown';
  const { data, loading, error, run } = useBigQuery(isMarkdown ? '' : widget.sql);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  useEffect(() => {
    // Intentional mount-only fetch — widget data is loaded once on render.
    // Manual refresh is available via the refresh button in the card header.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    if (!isMarkdown) run().then(() => setLastRefreshed(new Date()));
  }, []);

  const handleRefresh = () => {
    if (!isMarkdown) run().then(() => setLastRefreshed(new Date()));
  };

  const actions = (
    <Space size={4}>
      {!isMarkdown && lastRefreshed && (
        <Tooltip title={`Refreshed at ${lastRefreshed.toLocaleTimeString()}`}>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Typography.Text>
        </Tooltip>
      )}
      {!isMarkdown && (
        <Tooltip title="Refresh">
          <Button icon={<ReloadOutlined />} size="small" onClick={handleRefresh} />
        </Tooltip>
      )}
      {editMode && (
        <>
          <Tooltip title="Edit">
            <Button icon={<EditOutlined />} size="small" onClick={onEdit} />
          </Tooltip>
          <Tooltip title="Remove">
            <Button icon={<DeleteOutlined />} size="small" danger onClick={onDelete} />
          </Tooltip>
          <Tooltip title="Drag to reorder">
            <span
              style={{ cursor: 'grab', padding: '0 4px', display: 'inline-flex', alignItems: 'center' }}
              {...(dragHandleProps ?? {})}
            >
              <HolderOutlined />
            </span>
          </Tooltip>
        </>
      )}
    </Space>
  );

  // Title with optional description tooltip
  const cardTitle = widget.description ? (
    <Tooltip title={widget.description}>
      <span style={{ borderBottom: '1px dotted #aaa', cursor: 'help' }}>{widget.title}</span>
    </Tooltip>
  ) : widget.title;

  let content: React.ReactNode;
  if (isMarkdown) {
    content = <MarkdownWidget widget={widget} />;
  } else if (loading) {
    content = (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
        <Spin />
      </div>
    );
  } else if (error) {
    content = <Alert message={error} type="error" showIcon />;
  } else {
    switch (widget.type) {
      case 'stat':
        content = <StatWidget data={data} widget={widget} />;
        break;
      case 'timeseries':
        content = <TimeseriesWidget data={data} widget={widget} />;
        break;
      case 'breakdown':
        content = <BreakdownWidget data={data} widget={widget} />;
        break;
      case 'pie':
        content = <PieWidget data={data} widget={widget} />;
        break;
      case 'table':
      default:
        content = <TableWidget data={data} widget={widget} />;
    }
  }

  return (
    <Card
      title={cardTitle}
      extra={actions}
      size="small"
      style={{ height: '100%', opacity: isDragging ? 0.5 : 1, transition: 'opacity 0.15s' }}
    >
      {content}
    </Card>
  );
}
