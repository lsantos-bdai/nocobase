import React from 'react';
import { Card, Table, Skeleton, Tag } from 'antd';
import { AnalyticsFilters } from './types';
import { useAnalyticsAction } from './useAnalytics';

interface Session {
  session_id: string;
  collector: string;
  robot_id: string;
  data_type: string;
  size_gb: number;
  upload_time: string;
}

const TYPE_COLORS: Record<string, string> = {
  video: 'blue',
  audio: 'green',
  force: 'orange',
  image: 'purple',
  imu: 'cyan',
  lidar: 'geekblue',
};

interface Props {
  filters: AnalyticsFilters;
}

export function RecentTable({ filters }: Props) {
  const { data, loading } = useAnalyticsAction<Session[]>(
    'recent',
    filters,
    raw => raw as Session[],
    [],
  );

  const columns = [
    {
      title: 'Time',
      dataIndex: 'upload_time',
      key: 'upload_time',
      width: 170,
      render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
      sorter: (a: Session, b: Session) =>
        new Date(a.upload_time).getTime() - new Date(b.upload_time).getTime(),
      defaultSortOrder: 'descend' as const,
    },
    {
      title: 'Collector',
      dataIndex: 'collector',
      key: 'collector',
      ellipsis: true,
    },
    {
      title: 'Robot',
      dataIndex: 'robot_id',
      key: 'robot_id',
      ellipsis: true,
      render: (v: string) => v || '-',
    },
    {
      title: 'Data Type',
      dataIndex: 'data_type',
      key: 'data_type',
      render: (v: string) =>
        v ? (
          <Tag color={TYPE_COLORS[v.toLowerCase()] ?? 'default'}>{v}</Tag>
        ) : (
          '-'
        ),
    },
    {
      title: 'Size (GB)',
      dataIndex: 'size_gb',
      key: 'size_gb',
      width: 90,
      align: 'right' as const,
      render: (v: number) => v?.toFixed(3),
      sorter: (a: Session, b: Session) => a.size_gb - b.size_gb,
    },
    {
      title: 'Session ID',
      dataIndex: 'session_id',
      key: 'session_id',
      ellipsis: true,
      render: (v: string) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span>
      ),
    },
  ];

  return (
    <Card title="Recent Sessions" size="small">
      {loading ? (
        <Skeleton active />
      ) : (
        <Table
          size="small"
          columns={columns}
          dataSource={data.map((r, i) => ({ ...r, _key: i }))}
          rowKey="_key"
          pagination={{ pageSize: 10, size: 'small', showSizeChanger: false }}
          scroll={{ x: 700 }}
        />
      )}
    </Card>
  );
}
