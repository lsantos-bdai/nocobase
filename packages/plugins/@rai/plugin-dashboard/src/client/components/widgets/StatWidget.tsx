import React from 'react';
import { Empty, Statistic, Typography } from 'antd';
import { Widget } from '../../types';

interface Props {
  data: Record<string, any>[];
  widget: Widget;
}

export function StatWidget({ data, widget }: Props) {
  if (!data.length) return <Empty description="No data for this period" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  const row = data[0];
  const col = widget.valueColumn ?? Object.keys(row)[0];
  const raw = row[col];
  // BigQuery may return BigInt-like objects with a .value property
  const value = raw?.value ?? raw;
  return (
    <div style={{ padding: '8px 0' }}>
      <Statistic value={value} />
      {widget.description && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {widget.description}
        </Typography.Text>
      )}
    </div>
  );
}
