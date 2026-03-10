import React from 'react';
import { Card, Skeleton, Empty } from 'antd';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { AnalyticsFilters } from './types';
import { useAnalyticsAction } from './useAnalytics';

interface Point {
  date: string;
  count: number;
}

interface Props {
  filters: AnalyticsFilters;
}

export function TimelineChart({ filters }: Props) {
  const { data, loading } = useAnalyticsAction<Point[]>(
    'timeline',
    filters,
    raw => raw as Point[],
    [],
  );

  return (
    <Card title="Sessions Over Time" size="small" style={{ height: '100%' }}>
      {loading ? (
        <Skeleton active />
      ) : data.length === 0 ? (
        <Empty />
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickFormatter={d => d.slice(5)}
            />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip labelFormatter={l => `Date: ${l}`} />
            <Line
              type="monotone"
              dataKey="count"
              name="Sessions"
              stroke="#1677ff"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
