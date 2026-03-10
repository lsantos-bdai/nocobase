import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
  ResponsiveContainer,
} from 'recharts';
import { Empty } from 'antd';
import { Widget } from '../../types';

interface Props {
  data: Record<string, any>[];
  widget: Widget;
}

export function BreakdownWidget({ data, widget }: Props) {
  if (!data.length) return <Empty description="No data for this period" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  const cols = Object.keys(data[0]);
  const xField = widget.categoryColumn ?? cols[0];
  const yField = widget.valueColumn ?? cols[1];

  const normalised = data.map(row => ({
    ...row,
    [yField]: Number(row[yField]?.value ?? row[yField]),
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={normalised} margin={{ top: 16, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey={xField} tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey={yField} fill="#1677ff" radius={[3, 3, 0, 0]}>
          <LabelList dataKey={yField} position="top" style={{ fontSize: 10, fill: '#555' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
