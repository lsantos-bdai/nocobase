import React, { useEffect, useState } from 'react';
import { Card, Table, Switch, Spin, message, Typography, Space, Statistic, Row, Col, Button, Tabs } from 'antd';
import { EyeOutlined, EditOutlined, SettingOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { useAPIClient } from '@nocobase/client';
import { SnapshotDrawer } from './SnapshotDrawer';
import { AllActivityPanel } from './AllActivityPanel';
import { EditConfigModal } from './EditConfigModal';

const { Title, Text } = Typography;

interface CollectionConfig {
  collectionName: string;
  collectionTitle: string;
  enabled: boolean;
  retentionDays: number | null;
  maxVersions: number | null;
  capturedRecords: Array<{ id: string; name: string }>;
  capturedFields: string[];
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
  const [drawerCollection, setDrawerCollection] = useState<{
    name: string;
    title: string;
  } | null>(null);
  const [editingCollection, setEditingCollection] = useState<CollectionConfig | null>(null);

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

  const handleConfigSave = async (retentionDays: number | null, maxVersions: number | null) => {
    if (!editingCollection) return;

    const collectionName = editingCollection.collectionName;
    try {
      await api.request({
        url: 'cdc:configure',
        method: 'POST',
        data: {
          collectionName,
          retentionDays,
          maxVersions,
        },
      });
      message.success(`Updated settings for ${editingCollection.collectionTitle}`);
      setConfigs((prev) =>
        prev.map((c) => (c.collectionName === collectionName ? { ...c, retentionDays, maxVersions } : c)),
      );
      setEditingCollection(null);
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
      width: 130,
      render: (days: number | null) => (
        <span>{days === null ? 'Forever' : days}</span>
      ),
    },
    {
      title: 'Max Versions',
      dataIndex: 'maxVersions',
      key: 'maxVersions',
      width: 130,
      render: (versions: number | null) => (
        <span>{versions === null ? 'Unlimited' : versions}</span>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      render: (_: unknown, record: CollectionConfig) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => setEditingCollection(record)}
          >
            Edit
          </Button>
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
        </Space>
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

  const enabledCollections = configs
    .filter((c) => c.enabled)
    .map((c) => ({
      collectionName: c.collectionName,
      collectionTitle: c.collectionTitle,
      capturedRecords: c.capturedRecords || [],
      capturedFields: c.capturedFields || [],
    }));

  const tabItems = [
    {
      key: 'settings',
      label: (
        <span>
          <SettingOutlined />
          Collection Settings
        </span>
      ),
      children: (
        <Card>
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
      ),
    },
    {
      key: 'activity',
      label: (
        <span>
          <UnorderedListOutlined />
          All Activity
        </span>
      ),
      children: (
        <Card>
          <AllActivityPanel enabledCollections={enabledCollections} />
        </Card>
      ),
    },
  ];

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

      <Tabs defaultActiveKey="settings" items={tabItems} />

      <SnapshotDrawer
        visible={drawerCollection !== null}
        collectionName={drawerCollection?.name || ''}
        collectionTitle={drawerCollection?.title || ''}
        onClose={() => setDrawerCollection(null)}
      />

      <EditConfigModal
        visible={editingCollection !== null}
        collectionName={editingCollection?.collectionName || ''}
        collectionTitle={editingCollection?.collectionTitle || ''}
        retentionDays={editingCollection?.retentionDays ?? null}
        maxVersions={editingCollection?.maxVersions ?? null}
        onSave={handleConfigSave}
        onCancel={() => setEditingCollection(null)}
      />
    </div>
  );
};

export default CDCConfigPage;
