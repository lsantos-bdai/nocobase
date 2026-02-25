import React, { useState, useEffect } from 'react';
import { Drawer, Table, Tag, Space, Button, DatePicker, Select, Typography, Spin, Empty, message } from 'antd';
import { RollbackOutlined, ExpandOutlined, CompressOutlined, FilterOutlined } from '@ant-design/icons';
import { useAPIClient } from '@nocobase/client';
import { DiffViewer } from './DiffViewer';
import { RollbackModal } from './RollbackModal';

const { Text } = Typography;
const { RangePicker } = DatePicker;

interface Snapshot {
  id: number;
  recordId: string;
  recordName: string;
  operation: string;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  changedFields: string[];
  userId: number | null;
  userName: string | null;
  createdAt: string;
  version: number;
}

interface CapturedRecord {
  id: string;
  name: string;
}

interface SnapshotDrawerProps {
  visible: boolean;
  collectionName: string;
  collectionTitle: string;
  onClose: () => void;
}

export const SnapshotDrawer: React.FC<SnapshotDrawerProps> = ({
  visible,
  collectionName,
  collectionTitle,
  onClose,
}) => {
  const api = useAPIClient();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [capturedRecords, setCapturedRecords] = useState<CapturedRecord[]>([]);
  const [capturedFields, setCapturedFields] = useState<string[]>([]);
  const [recordFilter, setRecordFilter] = useState<string | null>(null);
  const [changedFieldFilter, setChangedFieldFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [operationFilter, setOperationFilter] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);
  const [expandedRows, setExpandedRows] = useState<React.Key[]>([]);
  const [rollbackSnapshot, setRollbackSnapshot] = useState<Snapshot | null>(null);
  const [fieldLabels, setFieldLabels] = useState<Record<string, string>>({});
  const [relatedValues, setRelatedValues] = useState<Record<string, Record<string, string>>>({});

  const fetchFilterOptions = async () => {
    try {
      const response = await api.request({
        url: 'cdc:getFilterOptions',
        method: 'GET',
        params: { collection: collectionName },
      });
      if (response?.data?.data) {
        setCapturedRecords(response.data.data.capturedRecords || []);
        setCapturedFields(response.data.data.capturedFields || []);
      }
    } catch (err) {
      // Silently fail - filter options are not critical
      console.warn('Failed to fetch filter options:', err);
    }
  };

  useEffect(() => {
    if (visible && collectionName) {
      fetchFilterOptions();
      fetchSnapshots();
    }
  }, [visible, collectionName]);

  useEffect(() => {
    if (visible && collectionName) {
      fetchSnapshots();
    }
  }, [pagination.current, pagination.pageSize, operationFilter, dateRange, recordFilter, changedFieldFilter]);

  const fetchSnapshots = async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        collection: collectionName,
        page: pagination.current,
        pageSize: pagination.pageSize,
      };

      if (operationFilter) {
        params.operation = operationFilter;
      }

      if (dateRange) {
        params.startDate = dateRange[0];
        params.endDate = dateRange[1];
      }

      if (recordFilter) {
        params.recordId = recordFilter;
      }

      if (changedFieldFilter) {
        params.changedField = changedFieldFilter;
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
        // Store field labels and related values for display
        if (response.data.fieldLabels) {
          setFieldLabels(response.data.fieldLabels);
        }
        if (response.data.relatedValues) {
          setRelatedValues(response.data.relatedValues);
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

  const handleOperationChange = (value: string | null) => {
    setOperationFilter(value);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const handleRecordFilterChange = (value: string | null) => {
    setRecordFilter(value);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const handleChangedFieldFilterChange = (value: string | null) => {
    setChangedFieldFilter(value);
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
      render: (fields: string[]) =>
        fields && fields.length > 0 ? (
          <Space wrap size={4}>
            {fields.slice(0, 3).map((f) => (
              <Tag key={f} style={{ margin: 0 }} title={fieldLabels[f] ? f : undefined}>
                {fieldLabels[f] || f}
              </Tag>
            ))}
            {fields.length > 3 && <Tag>+{fields.length - 3} more</Tag>}
          </Space>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: 'User',
      dataIndex: 'userName',
      key: 'userName',
      width: 120,
      render: (name: string | null) => name || <Text type="secondary">Unknown</Text>,
    },
    {
      title: 'Version',
      dataIndex: 'version',
      key: 'version',
      width: 80,
      render: (v: number) => <Tag>v{v}</Tag>,
    },
    {
      title: 'Timestamp',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (date: string) => formatDate(date),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_: unknown, record: Snapshot) => (
        <Button
          type="link"
          size="small"
          icon={<RollbackOutlined />}
          onClick={() => setRollbackSnapshot(record)}
        >
          Rollback
        </Button>
      ),
    },
  ];

  const expandedRowRender = (record: Snapshot) => (
    <div style={{ padding: '12px 0' }}>
      <DiffViewer
        beforeData={record.beforeData}
        afterData={record.afterData}
        changedFields={record.changedFields}
        mode="unified"
        fieldLabels={fieldLabels}
        relatedValues={relatedValues}
      />
    </div>
  );

  const handleRollbackSuccess = () => {
    fetchSnapshots();
  };

  return (
    <>
      <Drawer
        title={`Snapshots for "${collectionTitle}"`}
        placement="right"
        width={1000}
        open={visible}
        onClose={onClose}
      >
        <div style={{ marginBottom: 16 }}>
          <Space wrap>
            <FilterOutlined style={{ color: '#999' }} />
            <Select
              placeholder="Asset"
              allowClear
              showSearch
              style={{ width: 240 }}
              value={recordFilter}
              onChange={handleRecordFilterChange}
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={capturedRecords.map((r) => ({
                label: `${r.name} (id:${r.id})`,
                value: r.id,
              }))}
            />
            <Select
              placeholder="Changed Field"
              allowClear
              showSearch
              style={{ width: 160 }}
              value={changedFieldFilter}
              onChange={handleChangedFieldFilterChange}
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={capturedFields.map((f) => ({
                label: fieldLabels[f] || f,
                value: f,
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
            {expandedRows.length > 0 ? (
              <Button
                size="small"
                icon={<CompressOutlined />}
                onClick={() => setExpandedRows([])}
              >
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
          <Empty description="No snapshots found" />
        ) : (
          <Table
            dataSource={snapshots}
            columns={columns}
            rowKey="id"
            pagination={{
              ...pagination,
              showSizeChanger: true,
              showTotal: (total) => `Total ${total} snapshots`,
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
      </Drawer>

      <RollbackModal
        visible={rollbackSnapshot !== null}
        snapshot={rollbackSnapshot}
        collectionName={collectionName}
        onClose={() => setRollbackSnapshot(null)}
        onSuccess={handleRollbackSuccess}
      />
    </>
  );
};

export default SnapshotDrawer;
