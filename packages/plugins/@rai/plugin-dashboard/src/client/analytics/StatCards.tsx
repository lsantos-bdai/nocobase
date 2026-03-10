import React from 'react';
import { Card, Col, Row, Statistic, Skeleton } from 'antd';
import {
  DatabaseOutlined,
  TeamOutlined,
  RobotOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import { AnalyticsFilters } from './types';
import { useAnalyticsAction } from './useAnalytics';

interface Stats {
  total_sessions: number;
  total_gb: number;
  unique_collectors: number;
  unique_robots: number;
}

const DEFAULT: Stats = { total_sessions: 0, total_gb: 0, unique_collectors: 0, unique_robots: 0 };

interface Props {
  filters: AnalyticsFilters;
}

export function StatCards({ filters }: Props) {
  const { data, loading } = useAnalyticsAction<Stats>(
    'stats',
    filters,
    raw => raw as Stats,
    DEFAULT,
  );

  const cards = [
    { title: 'Sessions', value: data.total_sessions, icon: <BarChartOutlined />, suffix: '' },
    { title: 'Data Collected', value: data.total_gb, icon: <DatabaseOutlined />, suffix: ' GB' },
    { title: 'Collectors', value: data.unique_collectors, icon: <TeamOutlined />, suffix: '' },
    { title: 'Robots', value: data.unique_robots, icon: <RobotOutlined />, suffix: '' },
  ];

  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
      {cards.map(card => (
        <Col key={card.title} xs={24} sm={12} xl={6}>
          <Card size="small">
            {loading ? (
              <Skeleton active paragraph={false} />
            ) : (
              <Statistic
                title={card.title}
                value={card.value}
                suffix={card.suffix}
                prefix={card.icon}
                precision={card.title === 'Data Collected' ? 2 : 0}
              />
            )}
          </Card>
        </Col>
      ))}
    </Row>
  );
}
