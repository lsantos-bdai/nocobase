import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Empty } from 'antd';
import { Widget } from '../../types';

interface Props {
  data: Record<string, any>[];
  widget: Widget;
}

export function TimeseriesWidget({ data, widget }: Props) {
  if (!data.length) return <Empty description="No data for this period" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  const cols = Object.keys(data[0]);
  const xField = widget.xColumn ?? cols[0];
  const yField = widget.yColumn ?? cols[1];
  const strokeColor = (widget as any).color ?? '#1677ff';

  // Normalize BigQuery date/timestamp objects
  const normalised = data.map(row => ({
    ...row,
    [xField]: row[xField]?.value ?? row[xField],
    [yField]: Number(row[yField]?.value ?? row[yField]),
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={normalised} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey={xField} tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Line type="monotone" dataKey={yField} stroke={strokeColor} dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}
