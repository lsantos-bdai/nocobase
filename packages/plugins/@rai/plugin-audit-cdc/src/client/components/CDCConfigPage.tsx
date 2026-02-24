import React, { useEffect, useState } from 'react';
import { Card, Table, Switch, Spin, message, Typography, Space, Statistic, Row, Col, Button, Badge } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { useAPIClient } from '@nocobase/client';
import { EditableCell } from './EditableCell';
import { SnapshotDrawer } from './SnapshotDrawer';

const { Title, Text } = Typography;

interface CollectionConfig {
  collectionName: string;
  collectionTitle: string;
  enabled: boolean;
  retentionDays: number | null;
  maxVersions: number | null;
  snapshotCount?: number;
}

interface CDCStats {
  totalSnapshots: number;
  totalCollections: number;
  enabledCollections: number;
}

export const CDCConfigPage: React.FC = () => {
  const api = useAPIClient();
  const [configs, setConfigs] = useState<CollectionConfig[]>([]);
  const [stats, setStats] = useState<CDCStats>({ totalSnapshots: 0, totalCollections: 0, enabledCollections: 0 });
  const [updating, setUpdating] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawerCollection, setDrawerCollection] = useState<{ name: string; title: string } | null>(null);

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const response = await api.request({
        url: 'cdc:listConfig',
        method: 'GET',
      });

      const responseData = response?.data;
      if (responseData?.configs) {
        setConfigs(responseData.configs);
        setStats(responseData.stats || { totalSnapshots: 0, totalCollections: 0, enabledCollections: 0 });
      }
    } catch (err) {
      console.error('[CDC CLIENT] Error fetching configs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  const handleToggle = async (collectionName: string, enabled: boolean) => {
    setUpdating(collectionName);
    try {
      await api.request({
        url: 'cdc:configure',
        method: 'POST',
        data: {
          collectionName,
          enabled,
        },
      });
      message.success(`${enabled ? 'Enabled' : 'Disabled'} CDC for ${collectionName}`);
      setConfigs((prev) =>
        prev.map((c) => (c.collectionName === collectionName ? { ...c, enabled } : c)),
      );
      setStats((prev) => ({
        ...prev,
        enabledCollections: enabled ? prev.enabledCollections + 1 : prev.enabledCollections - 1,
      }));
    } catch (err: any) {
      message.error(`Failed to update: ${err.message || 'Unknown error'}`);
    } finally {
      setUpdating(null);
    }
  };

  const handleRetentionChange = async (collectionName: string, retentionDays: number | null) => {
    try {
      await api.request({
        url: 'cdc:configure',
        method: 'POST',
        data: {
          collectionName,
          retentionDays,
        },
      });
      message.success(`Updated retention for ${collectionName}`);
      setConfigs((prev) =>
        prev.map((c) => (c.collectionName === collectionName ? { ...c, retentionDays } : c)),
      );
    } catch (err: any) {
      message.error(`Failed to update: ${err.message || 'Unknown error'}`);
      throw err;
    }
  };

  const handleMaxVersionsChange = async (collectionName: string, maxVersions: number | null) => {
    try {
      await api.request({
        url: 'cdc:configure',
        method: 'POST',
        data: {
          collectionName,
          maxVersions,
        },
      });
      message.success(`Updated max versions for ${collectionName}`);
      setConfigs((prev) =>
        prev.map((c) => (c.collectionName === collectionName ? { ...c, maxVersions } : c)),
      );
    } catch (err: any) {
      message.error(`Failed to update: ${err.message || 'Unknown error'}`);
      throw err;
    }
  };

  const columns = [
    {
      title: 'Collection',
      dataIndex: 'collectionTitle',
      key: 'collectionTitle',
      sorter: (a: CollectionConfig, b: CollectionConfig) =>
        a.collectionTitle.localeCompare(b.collectionTitle),
    },
    {
      title: 'Audit Enabled',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 120,
      render: (enabled: boolean, record: CollectionConfig) => (
        <Switch
          checked={enabled}
          loading={updating === record.collectionName}
          onChange={(checked) => handleToggle(record.collectionName, checked)}
        />
      ),
      filters: [
        { text: 'Enabled', value: true },
        { text: 'Disabled', value: false },
      ],
      onFilter: (value: boolean | React.Key, record: CollectionConfig) => record.enabled === value,
    },
    {
      title: 'Retention (days)',
      dataIndex: 'retentionDays',
      key: 'retentionDays',
      width: 150,
      render: (days: number | null, record: CollectionConfig) => (
        <EditableCell
          value={days}
          nullLabel="Forever"
          onChange={(value) => handleRetentionChange(record.collectionName, value)}
          min={1}
          max={3650}
        />
      ),
    },
    {
      title: 'Max Versions',
      dataIndex: 'maxVersions',
      key: 'maxVersions',
      width: 150,
      render: (versions: number | null, record: CollectionConfig) => (
        <EditableCell
          value={versions}
          nullLabel="Unlimited"
          onChange={(value) => handleMaxVersionsChange(record.collectionName, value)}
          min={1}
          max={9999}
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_: unknown, record: CollectionConfig) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() =>
            setDrawerCollection({
              name: record.collectionName,
              title: record.collectionTitle,
            })
          }
        >
          View
        </Button>
      ),
    },
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <Title level={4}>Audit CDC Configuration</Title>
      <Text type="secondary">
        Configure Change Data Capture (CDC) settings for your collections. When enabled, all changes
        to records will be tracked and stored as snapshots.
      </Text>

      <Row gutter={16} style={{ marginTop: '24px', marginBottom: '24px' }}>
        <Col span={8}>
          <Card>
            <Statistic title="Total Snapshots" value={stats.totalSnapshots} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="Tracked Collections" value={stats.enabledCollections} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Total Collections"
              value={stats.totalCollections}
              suffix={`(${Math.round((stats.enabledCollections / stats.totalCollections) * 100) || 0}% tracked)`}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Collection Settings">
        <Table
          dataSource={configs}
          columns={columns}
          rowKey="collectionName"
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} collections`,
          }}
        />
      </Card>

      <SnapshotDrawer
        visible={drawerCollection !== null}
        collectionName={drawerCollection?.name || ''}
        collectionTitle={drawerCollection?.title || ''}
        onClose={() => setDrawerCollection(null)}
      />
    </div>
  );
};

export default CDCConfigPage;
