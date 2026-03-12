import React from 'react';
import { PieChart, Pie, Tooltip, Legend, Cell, ResponsiveContainer } from 'recharts';
import { Empty } from 'antd';
import { Widget } from '../../types';

const COLORS = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16'];

interface Props {
  data: Record<string, any>[];
  widget: Widget;
}

export function PieWidget({ data, widget }: Props) {
  if (!data || data.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  const keys = Object.keys(data[0]);
  const labelKey = widget.categoryColumn ?? keys[0];
  const valueKey = widget.valueColumn ?? keys[1] ?? keys[0];

  const chartData = data.map(r => ({
    name: String(r[labelKey]?.value ?? r[labelKey] ?? ''),
    value: Number(r[valueKey]?.value ?? r[valueKey] ?? 0),
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={0}
          outerRadius={90}
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
        >
          {chartData.map((_, idx) => (
            <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
