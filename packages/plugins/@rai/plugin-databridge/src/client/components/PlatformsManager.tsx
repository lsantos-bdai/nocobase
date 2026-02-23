import React from 'react';
import { SchemaComponent, useAPIClient } from '@nocobase/client';
import { Button, Table, Space, Modal, Form, Input, message, Checkbox, Spin, Tag, Alert } from 'antd';
import { CheckCircleOutlined, SyncOutlined } from '@ant-design/icons';

const schema = {
  type: 'void',
  name: 'databridge-platforms',
  'x-component': 'div',
  properties: {
    actions: {
      type: 'void',
      'x-component': 'Space',
      'x-component-props': {
        style: { marginBottom: 16 },
      },
      properties: {
        create: {
          type: 'void',
          'x-component': 'CreatePlatformButton',
        },
      },
    },
    table: {
      type: 'void',
      'x-component': 'PlatformsTable',
    },
  },
};

function CreatePlatformButton() {
  const [open, setOpen] = React.useState(false);
  const [form] = Form.useForm();
  const [loading, setLoading] = React.useState(false);
  const api = useAPIClient();

  const handleCreate = async () => {
    try {
      setLoading(true);
      const values = await form.validateFields();
      await api.resource('databridge_platforms').create({ values });
      message.success('Platform created successfully');
      setOpen(false);
      form.resetFields();
      window.dispatchEvent(new Event('databridge:refresh'));
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(err.response?.data?.errors?.[0]?.message || err.message || 'Failed to create platform');
    } finally {
      setLoading(false);
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    form.setFieldValue('slug', slug);
  };

  return (
    <>
      <Button type="primary" onClick={() => setOpen(true)}>
        Create Platform
      </Button>
      <Modal
        title="Create Platform"
        open={open}
        onOk={handleCreate}
        onCancel={() => setOpen(false)}
        confirmLoading={loading}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="e.g., Models" onChange={handleNameChange} />
          </Form.Item>
          <Form.Item
            name="slug"
            label="Slug"
            rules={[
              { required: true, message: 'Slug is required' },
              {
                pattern: /^[a-z][a-z0-9_]*$/,
                message: 'Must start with lowercase letter and contain only lowercase letters, numbers, and underscores',
              },
            ]}
          >
            <Input placeholder="e.g., models" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea placeholder="Optional description" rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

interface CollectionInfo {
  name: string;
  title: string;
  hasNameField: boolean;
  isSynced: boolean;
}

interface DuplicateError {
  withinNewCollections?: { name: string; collections: string[] }[];
  withExistingEntries?: { name: string; collection: string }[];
}

function ManageModal({
  open,
  platform,
  onClose,
  onSuccess,
}: {
  open: boolean;
  platform: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const api = useAPIClient();
  const [collections, setCollections] = React.useState<CollectionInfo[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [initialSynced, setInitialSynced] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [duplicateError, setDuplicateError] = React.useState<DuplicateError | null>(null);

  React.useEffect(() => {
    if (open && platform) {
      setDuplicateError(null);
      setLoading(true);
      api
        .request({
          url: `databridge:listCollections?platformId=${platform.id}`,
          method: 'get',
        })
        .then((res) => {
          const data: CollectionInfo[] = res?.data?.data || [];
          setCollections(data);
          // Pre-check synced collections
          const synced = new Set(data.filter((c) => c.isSynced).map((c) => c.name));
          setSelected(new Set(synced));
          setInitialSynced(new Set(synced));
        })
        .catch((err) => {
          console.error('Failed to fetch collections:', err);
          message.error('Failed to load collections');
        })
        .finally(() => setLoading(false));
    }
  }, [open, platform, api]);

  const handleSave = async () => {
    // Compute diff
    const toAdd = [...selected].filter((name) => !initialSynced.has(name));
    const toRemove = [...initialSynced].filter((name) => !selected.has(name));

    if (toAdd.length === 0 && toRemove.length === 0) {
      message.info('No changes to save');
      return;
    }

    setSaving(true);
    setDuplicateError(null);

    try {
      const res = await api.request({
        url: `databridge_platforms:sync?filterByTk=${platform.id}`,
        method: 'post',
        data: {
          collections: toAdd,
          collectionsToRemove: toRemove,
        },
      });

      const { synced, removed } = res?.data?.data || {};
      const parts: string[] = [];
      if (synced > 0) parts.push(`${synced} records added`);
      if (removed > 0) parts.push(`${removed} records removed`);
      message.success(parts.length > 0 ? parts.join(', ') : 'Collections updated successfully');
      onSuccess();
      onClose();
    } catch (err: any) {
      const errorData = err.response?.data;
      if (errorData?.data?.duplicates) {
        setDuplicateError(errorData.data.duplicates);
      } else {
        message.error(errorData?.errors?.[0]?.message || 'Failed to save changes');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = (collName: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(collName)) {
        next.delete(collName);
      } else {
        next.add(collName);
      }
      return next;
    });
    // Clear duplicate error when selection changes
    setDuplicateError(null);
  };

  return (
    <Modal
      title={`Manage Collections for "${platform?.name}"`}
      open={open}
      onCancel={onClose}
      onOk={handleSave}
      okText="Save Changes"
      confirmLoading={saving}
      width={600}
    >
      <p style={{ marginBottom: 16 }}>Check collections to add, uncheck to remove:</p>

      {duplicateError && (
        <Alert
          type="error"
          style={{ marginBottom: 16 }}
          message="Duplicate asset names found"
          description={
            <div>
              {duplicateError.withinNewCollections && duplicateError.withinNewCollections.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <strong>These names appear in multiple collections you selected:</strong>
                  <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
                    {duplicateError.withinNewCollections.map((d, i) => (
                      <li key={i}>
                        "{d.name}" in: {d.collections.join(', ')}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {duplicateError.withExistingEntries && duplicateError.withExistingEntries.length > 0 && (
                <div>
                  <strong>These names conflict with existing platform entries:</strong>
                  <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
                    {duplicateError.withExistingEntries.map((d, i) => (
                      <li key={i}>
                        "{d.name}" from collection "{d.collection}"
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          }
        />
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin />
        </div>
      ) : (
        <div
          style={{
            border: '1px solid #d9d9d9',
            borderRadius: 6,
            maxHeight: 400,
            overflowY: 'auto',
          }}
        >
          {collections.map((coll) => {
            const isSelected = selected.has(coll.name);
            const wasSynced = initialSynced.has(coll.name);
            const isChanged = isSelected !== wasSynced;

            return (
              <div
                key={coll.name}
                style={{
                  padding: '10px 12px',
                  borderBottom: '1px solid #f0f0f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  opacity: coll.hasNameField ? 1 : 0.5,
                  backgroundColor: isChanged ? '#fffbe6' : undefined,
                }}
              >
                <Checkbox
                  disabled={!coll.hasNameField}
                  checked={isSelected}
                  onChange={() => handleToggle(coll.name)}
                >
                  <span style={{ fontWeight: wasSynced ? 500 : 400 }}>
                    {coll.title}
                    {coll.name !== coll.title && (
                      <span style={{ color: '#999', marginLeft: 8 }}>({coll.name})</span>
                    )}
                  </span>
                </Checkbox>
                <Space>
                  {wasSynced && (
                    <Tag color="green" icon={<CheckCircleOutlined />}>
                      synced
                    </Tag>
                  )}
                  {!coll.hasNameField && <Tag color="default">no name field</Tag>}
                </Space>
              </div>
            );
          })}
          {collections.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>No collections found</div>
          )}
        </div>
      )}
    </Modal>
  );
}

interface LookupEntry {
  id: number;
  name: string;
  collection: string;
  collectionTitle: string;
  assetId: string;
}

function ViewModal({
  open,
  platform,
  onClose,
}: {
  open: boolean;
  platform: any;
  onClose: () => void;
}) {
  const api = useAPIClient();
  const [entries, setEntries] = React.useState<LookupEntry[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [pagination, setPagination] = React.useState({ page: 1, pageSize: 50, total: 0 });

  const fetchEntries = React.useCallback(
    async (page: number, pageSize: number) => {
      if (!platform) return;
      setLoading(true);
      try {
        const res = await api.request({
          url: `databridge_platforms:view?filterByTk=${platform.id}&page=${page}&pageSize=${pageSize}`,
          method: 'get',
        });
        const responseBody = res?.data?.data || {};
        const data = responseBody.data;
        const meta = responseBody.meta;
        setEntries(Array.isArray(data) ? data : []);
        setPagination({ page: meta?.page || 1, pageSize: meta?.pageSize || 50, total: meta?.total || 0 });
      } catch (err) {
        console.error('Failed to fetch entries:', err);
        message.error('Failed to load entries');
        setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [api, platform]
  );

  React.useEffect(() => {
    if (open && platform) {
      setEntries([]);
      setPagination({ page: 1, pageSize: 50, total: 0 });
      fetchEntries(1, 50);
    }
  }, [open, platform, fetchEntries]);

  const columns = [
    { title: 'Asset Name', dataIndex: 'name', key: 'name' },
    { title: 'Source Collection', dataIndex: 'collectionTitle', key: 'collectionTitle' },
    { title: 'Asset ID', dataIndex: 'assetId', key: 'assetId' },
  ];

  return (
    <Modal title={`View "${platform?.name}" Entries`} open={open} onCancel={onClose} footer={null} width={700}>
      <p style={{ marginBottom: 16, color: '#666' }}>
        Total entries: <strong>{pagination.total}</strong>
      </p>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={entries}
        columns={columns}
        size="small"
        pagination={{
          current: pagination.page,
          pageSize: pagination.pageSize,
          total: pagination.total,
          showSizeChanger: true,
          pageSizeOptions: ['20', '50', '100'],
          onChange: (page, pageSize) => fetchEntries(page, pageSize),
        }}
      />
    </Modal>
  );
}

function PlatformsTable() {
  const api = useAPIClient();
  const [platforms, setPlatforms] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [manageModalOpen, setManageModalOpen] = React.useState(false);
  const [viewModalOpen, setViewModalOpen] = React.useState(false);
  const [selectedPlatform, setSelectedPlatform] = React.useState<any>(null);
  const [syncingPlatformId, setSyncingPlatformId] = React.useState<number | null>(null);

  const fetchPlatforms = React.useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.request({
        url: 'databridge_platforms:list',
        method: 'get',
      });
      setPlatforms(response?.data?.data || []);
    } catch (err) {
      console.error('Failed to fetch platforms:', err);
      setPlatforms([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  React.useEffect(() => {
    fetchPlatforms();
  }, [fetchPlatforms]);

  React.useEffect(() => {
    const handler = () => fetchPlatforms();
    window.addEventListener('databridge:refresh', handler);
    return () => window.removeEventListener('databridge:refresh', handler);
  }, [fetchPlatforms]);

  const handleDelete = async (id: number) => {
    Modal.confirm({
      title: 'Delete Platform',
      content: 'This will delete the platform and its lookup collection. Are you sure?',
      okType: 'danger',
      onOk: async () => {
        try {
          await api.request({
            url: `databridge_platforms:destroy?filterByTk=${id}`,
            method: 'post',
          });
          message.success('Platform deleted');
          fetchPlatforms();
        } catch (err: any) {
          message.error(err.response?.data?.errors?.[0]?.message || 'Failed to delete platform');
        }
      },
    });
  };

  const handleManage = (platform: any) => {
    setSelectedPlatform(platform);
    setManageModalOpen(true);
  };

  const handleView = (platform: any) => {
    setSelectedPlatform(platform);
    setViewModalOpen(true);
  };

  const handleSyncAll = async (platform: any) => {
    setSyncingPlatformId(platform.id);
    try {
      const res = await api.request({
        url: `databridge_platforms:syncAll?filterByTk=${platform.id}`,
        method: 'post',
      });
      const { synced, collections, errors } = res?.data?.data || {};
      if (errors && errors.length > 0) {
        message.warning(`Synced ${synced} records from ${collections} collections with ${errors.length} warnings`);
      } else {
        message.success(`Synced ${synced} records from ${collections} collections`);
      }
    } catch (err: any) {
      message.error(err.response?.data?.errors?.[0]?.message || 'Failed to sync');
    } finally {
      setSyncingPlatformId(null);
    }
  };

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Slug', dataIndex: 'slug', key: 'slug' },
    { title: 'Collection', dataIndex: 'collectionName', key: 'collectionName' },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: 'Actions',
      key: 'actions',
      width: 280,
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" onClick={() => handleView(record)}>
            View
          </Button>
          <Button size="small" onClick={() => handleManage(record)}>
            Manage
          </Button>
          <Button
            size="small"
            icon={<SyncOutlined spin={syncingPlatformId === record.id} />}
            loading={syncingPlatformId === record.id}
            onClick={() => handleSyncAll(record)}
          >
            Sync
          </Button>
          <Button size="small" danger onClick={() => handleDelete(record.id)}>
            Delete
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Table rowKey="id" loading={loading} dataSource={platforms} columns={columns} pagination={false} />
      <ManageModal
        open={manageModalOpen}
        platform={selectedPlatform}
        onClose={() => setManageModalOpen(false)}
        onSuccess={fetchPlatforms}
      />
      <ViewModal open={viewModalOpen} platform={selectedPlatform} onClose={() => setViewModalOpen(false)} />
    </>
  );
}

export function PlatformsManager() {
  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginBottom: 24 }}>Databridge Platforms</h2>
      <SchemaComponent schema={schema} components={{ CreatePlatformButton, PlatformsTable }} />
    </div>
  );
}
