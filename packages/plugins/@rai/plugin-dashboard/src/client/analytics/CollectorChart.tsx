import React from 'react';
import { Card, Skeleton, Empty } from 'antd';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { AnalyticsFilters } from './types';
import { useAnalyticsAction } from './useAnalytics';

interface Point {
  collector: string;
  count: number;
  gb: number;
}

const COLORS = [
  '#1677ff', '#52c41a', '#faad14', '#f5222d', '#722ed1',
  '#13c2c2', '#eb2f96', '#fa8c16', '#a0d911', '#2f54eb',
];

interface Props {
  filters: AnalyticsFilters;
}

export function CollectorChart({ filters }: Props) {
  const { data, loading } = useAnalyticsAction<Point[]>(
    'byCollector',
    filters,
    raw => raw as Point[],
    [],
  );

  return (
    <Card title="Sessions by Collector" size="small" style={{ height: '100%' }}>
      {loading ? (
        <Skeleton active />
      ) : data.length === 0 ? (
        <Empty />
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="collector"
              tick={{ fontSize: 11 }}
              width={100}
              tickFormatter={s => (s.length > 14 ? s.slice(0, 13) + '…' : s)}
            />
            <Tooltip
              formatter={(value: any, _name: any, props: any) => [
                `${value} sessions  (${props.payload?.gb ?? 0} GB)`,
              ]}
            />
            <Bar dataKey="count" name="Sessions" radius={[0, 3, 3, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
