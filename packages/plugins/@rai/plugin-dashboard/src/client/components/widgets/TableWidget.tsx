import React from 'react';
import { Empty, Table } from 'antd';
import { Widget } from '../../types';

interface Props {
  data: Record<string, any>[];
  widget: Widget;
}

export function TableWidget({ data, widget: _ }: Props) {
  if (!data.length) return <Empty description="No data for this period" image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  const columns = Object.keys(data[0]).map(key => ({
    title: key,
    dataIndex: key,
    key,
    ellipsis: true,
    render: (v: any) => {
      const val = v?.value ?? v;
      return val === null || val === undefined ? '-' : String(val);
    },
  }));

  return (
    <Table
      size="small"
      columns={columns}
      dataSource={data.map((row, i) => ({ ...row, _rowKey: i }))}
      rowKey="_rowKey"
      pagination={{ pageSize: 10, size: 'small', showSizeChanger: false }}
      scroll={{ x: true }}
    />
  );
}
