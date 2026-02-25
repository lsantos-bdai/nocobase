import React, { useState, useEffect } from 'react';
import { Table, Tag, Space, Button, DatePicker, Select, Typography, Spin, Empty, message } from 'antd';
import { ExpandOutlined, CompressOutlined, FilterOutlined, ReloadOutlined, ApiOutlined } from '@ant-design/icons';
import { useAPIClient } from '@nocobase/client';
import { DiffViewer } from './DiffViewer';
import { SnapshotDrawer } from './SnapshotDrawer';

const { Text } = Typography;
const { RangePicker } = DatePicker;

interface Snapshot {
  id: number;
  recordId: string;
  recordName: string;
  collectionName: string;
  collectionTitle: string;
  operation: string;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  changedFields: string[];
  userId: number | null;
  isApiKey: boolean;
  userName: string | null;
  createdAt: string;
  version: number;
}

interface EnabledCollection {
  collectionName: string;
  collectionTitle: string;
  capturedRecords: Array<{ id: string; name: string }>;
  capturedFields: string[];
}

interface AllActivityPanelProps {
  enabledCollections: EnabledCollection[];
}

export const AllActivityPanel: React.FC<AllActivityPanelProps> = ({ enabledCollections }) => {
  const api = useAPIClient();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [collectionFilter, setCollectionFilter] = useState<string | null>(null);
  const [operationFilter, setOperationFilter] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);
  const [expandedRows, setExpandedRows] = useState<React.Key[]>([]);
  const [fieldLabels, setFieldLabels] = useState<Record<string, Record<string, string>>>({});
  const [relatedValues, setRelatedValues] = useState<Record<string, Record<string, Record<string, string>>>>({});
  const [drawerCollection, setDrawerCollection] = useState<{
    name: string;
    title: string;
  } | null>(null);

  useEffect(() => {
    fetchSnapshots();
  }, [pagination.current, pagination.pageSize, collectionFilter, operationFilter, dateRange]);

  const fetchSnapshots = async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        page: pagination.current,
        pageSize: pagination.pageSize,
      };

      if (collectionFilter) {
        params.collection = collectionFilter;
      }

      if (operationFilter) {
        params.operation = operationFilter;
      }

      if (dateRange) {
        params.startDate = dateRange[0];
        params.endDate = dateRange[1];
      }

      const response = await api.request({
        url: 'cdc:listSnapshots',
        method: 'GET',
        params,
      });

      if (response?.data?.data) {
        setSnapshots(response.data.data);
        setPagination((prev) => ({
          ...prev,
          total: response.data.meta?.total || 0,
        }));
        // Store field labels and related values (nested by collection when no filter)
        if (response.data.fieldLabels) {
          if (collectionFilter) {
            // Single collection - wrap in collection name for consistent access
            setFieldLabels({ [collectionFilter]: response.data.fieldLabels });
          } else {
            setFieldLabels(response.data.fieldLabels);
          }
        }
        if (response.data.relatedValues) {
          if (collectionFilter) {
            setRelatedValues({ [collectionFilter]: response.data.relatedValues });
          } else {
            setRelatedValues(response.data.relatedValues);
          }
        }
      }
    } catch (err: any) {
      message.error(`Failed to fetch snapshots: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTableChange = (pag: any) => {
    setPagination({
      ...pagination,
      current: pag.current,
      pageSize: pag.pageSize,
    });
  };

  const handleDateRangeChange = (dates: any) => {
    if (dates) {
      setDateRange([dates[0].toISOString(), dates[1].toISOString()]);
    } else {
      setDateRange(null);
    }
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const handleCollectionChange = (value: string | null) => {
    setCollectionFilter(value);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const handleOperationChange = (value: string | null) => {
    setOperationFilter(value);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const getOperationTag = (operation: string) => {
    const config: Record<string, { color: string; label: string }> = {
      create: { color: 'green', label: 'Created' },
      update: { color: 'blue', label: 'Updated' },
      destroy: { color: 'red', label: 'Deleted' },
    };
    const { color, label } = config[operation] || { color: 'default', label: operation };
    return <Tag color={color}>{label}</Tag>;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const columns = [
    {
      title: 'Collection',
      dataIndex: 'collectionTitle',
      key: 'collectionTitle',
      width: 150,
      render: (title: string, record: Snapshot) => {
        return (
          <Button
            type="link"
            style={{ padding: 0 }}
            onClick={() =>
              setDrawerCollection({
                name: record.collectionName,
                title: record.collectionTitle,
              })
            }
          >
            {title}
          </Button>
        );
      },
    },
    {
      title: 'Record',
      dataIndex: 'recordName',
      key: 'recordName',
      render: (name: string, record: Snapshot) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            ID: {record.recordId}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Operation',
      dataIndex: 'operation',
      key: 'operation',
      width: 100,
      render: (op: string) => getOperationTag(op),
    },
    {
      title: 'Changed Fields',
      dataIndex: 'changedFields',
      key: 'changedFields',
      render: (fields: string[], record: Snapshot) => {
        const labels = fieldLabels[record.collectionName] || {};
        return fields && fields.length > 0 ? (
          <Space wrap size={4}>
            {fields.slice(0, 3).map((f) => (
              <Tag key={f} style={{ margin: 0 }} title={labels[f] ? f : undefined}>
                {labels[f] || f}
              </Tag>
            ))}
            {fields.length > 3 && <Tag>+{fields.length - 3} more</Tag>}
          </Space>
        ) : (
          <Text type="secondary">-</Text>
        );
      },
    },
    {
      title: 'User',
      dataIndex: 'userName',
      key: 'userName',
      width: 150,
      render: (name: string | null, record: Snapshot) => {
        if (record.isApiKey) {
          return (
            <Space size={4}>
              <ApiOutlined style={{ color: '#722ed1' }} />
              <Text>{name || 'Unknown'}</Text>
            </Space>
          );
        }
        return name || <Text type="secondary">Unknown</Text>;
      },
    },
    {
      title: 'Timestamp',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (date: string) => formatDate(date),
    },
  ];

  const expandedRowRender = (record: Snapshot) => {
    const labels = fieldLabels[record.collectionName] || {};
    const values = relatedValues[record.collectionName] || {};
    return (
      <div style={{ padding: '12px 0' }}>
        <DiffViewer
          beforeData={record.beforeData}
          afterData={record.afterData}
          changedFields={record.changedFields}
          mode="unified"
          fieldLabels={labels}
          relatedValues={values}
        />
      </div>
    );
  };

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Space wrap>
          <FilterOutlined style={{ color: '#999' }} />
          <Select
            placeholder="Collection"
            allowClear
            showSearch
            style={{ width: 200 }}
            value={collectionFilter}
            onChange={handleCollectionChange}
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
            options={enabledCollections.map((c) => ({
              label: c.collectionTitle,
              value: c.collectionName,
            }))}
          />
          <Select
            placeholder="Operation"
            allowClear
            style={{ width: 120 }}
            value={operationFilter}
            onChange={handleOperationChange}
            options={[
              { label: 'Created', value: 'create' },
              { label: 'Updated', value: 'update' },
              { label: 'Deleted', value: 'destroy' },
            ]}
          />
          <RangePicker showTime onChange={handleDateRangeChange} />
          <Button icon={<ReloadOutlined />} onClick={() => fetchSnapshots()} loading={loading}>
            Refresh
          </Button>
          {expandedRows.length > 0 ? (
            <Button size="small" icon={<CompressOutlined />} onClick={() => setExpandedRows([])}>
              Collapse All
            </Button>
          ) : (
            <Button
              size="small"
              icon={<ExpandOutlined />}
              onClick={() => setExpandedRows(snapshots.map((s) => s.id))}
            >
              Expand All
            </Button>
          )}
        </Space>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      ) : snapshots.length === 0 ? (
        <Empty description="No activity found" />
      ) : (
        <Table
          dataSource={snapshots}
          columns={columns}
          rowKey="id"
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} changes`,
          }}
          onChange={handleTableChange}
          expandable={{
            expandedRowRender,
            expandedRowKeys: expandedRows,
            onExpandedRowsChange: (keys) => setExpandedRows(keys as React.Key[]),
          }}
          size="small"
        />
      )}

      <SnapshotDrawer
        visible={drawerCollection !== null}
        collectionName={drawerCollection?.name || ''}
        collectionTitle={drawerCollection?.title || ''}
        onClose={() => setDrawerCollection(null)}
      />
    </>
  );
};

export default AllActivityPanel;
