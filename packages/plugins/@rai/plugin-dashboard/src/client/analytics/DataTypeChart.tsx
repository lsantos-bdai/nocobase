import React from 'react';
import { Card, Skeleton, Empty } from 'antd';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { AnalyticsFilters } from './types';
import { useAnalyticsAction } from './useAnalytics';

interface Point {
  type: string;
  count: number;
}

const COLORS = [
  '#1677ff', '#52c41a', '#faad14', '#f5222d', '#722ed1',
  '#13c2c2', '#eb2f96', '#fa8c16', '#a0d911', '#2f54eb',
];

interface Props {
  filters: AnalyticsFilters;
}

export function DataTypeChart({ filters }: Props) {
  const { data, loading } = useAnalyticsAction<Point[]>(
    'byDataType',
    filters,
    raw => raw as Point[],
    [],
  );

  const pieData = data.map(d => ({ name: d.type, value: d.count }));

  return (
    <Card title="Sessions by Data Type" size="small" style={{ height: '100%' }}>
      {loading ? (
        <Skeleton active />
      ) : pieData.length === 0 ? (
        <Empty />
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="45%"
              outerRadius={80}
              dataKey="value"
              label={({ name, percent }) =>
                `${name} ${(percent * 100).toFixed(0)}%`
              }
              labelLine={false}
            >
              {pieData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: any) => [`${v} sessions`]} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
