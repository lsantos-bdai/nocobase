import React from 'react';
import { SchemaComponent, useAPIClient } from '@nocobase/client';
import { Button, Table, Space, Modal, Form, Input, message, Checkbox, Spin, Tag, Alert, Typography } from 'antd';
import { CheckCircleOutlined, SyncOutlined, WarningOutlined } from '@ant-design/icons';

const { Text } = Typography;

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
  withExistingEntries?: { name: string; newCollection: string; existingCollection: string }[];
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
      // Duplicates are at the top level of the response (via custom error handler)
      const duplicates = errorData?.duplicates;
      if (duplicates) {
        setDuplicateError(duplicates);
      } else {
        console.error('Sync error response:', errorData);
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
          message={`Duplicate asset names found (${(duplicateError.withinNewCollections?.length || 0) + (duplicateError.withExistingEntries?.length || 0)} conflicts)`}
          description={
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {duplicateError.withinNewCollections && duplicateError.withinNewCollections.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <Text strong>Names appearing in multiple selected collections:</Text>
                  <div style={{ marginTop: 8 }}>
                    {duplicateError.withinNewCollections.slice(0, 10).map((d, i) => (
                      <div key={i} style={{ marginBottom: 4, paddingLeft: 8 }}>
                        <Tag color="orange">{d.name}</Tag>
                        <Text type="secondary"> in: {d.collections.join(', ')}</Text>
                      </div>
                    ))}
                    {duplicateError.withinNewCollections.length > 10 && (
                      <Text type="secondary" style={{ paddingLeft: 8 }}>
                        ...and {duplicateError.withinNewCollections.length - 10} more
                      </Text>
                    )}
                  </div>
                </div>
              )}
              {duplicateError.withExistingEntries && duplicateError.withExistingEntries.length > 0 && (
                <div>
                  <Text strong>Names conflicting with existing platform entries:</Text>
                  <div style={{ marginTop: 8 }}>
                    {(() => {
                      // Group by existingCollection for cleaner display
                      const byExisting: Record<string, { name: string; newCollection: string }[]> = {};
                      for (const d of duplicateError.withExistingEntries!) {
                        if (!byExisting[d.existingCollection]) {
                          byExisting[d.existingCollection] = [];
                        }
                        byExisting[d.existingCollection].push({ name: d.name, newCollection: d.newCollection });
                      }
                      return Object.entries(byExisting).map(([existingColl, items]) => (
                        <div key={existingColl} style={{ marginBottom: 8, paddingLeft: 8 }}>
                          <Text type="secondary">Already in "{existingColl}":</Text>
                          <div style={{ paddingLeft: 8, marginTop: 4 }}>
                            {items.slice(0, 8).map((item, i) => (
                              <Tag key={i} style={{ margin: '2px 4px 2px 0' }}>{item.name}</Tag>
                            ))}
                            {items.length > 8 && (
                              <Text type="secondary">...and {items.length - 8} more</Text>
                            )}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
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

interface SyncResult {
  synced: number;
  collections: number;
  errors?: string[];
}

interface GroupedErrors {
  duplicates: { name: string; collection: string }[];
  missingCollections: string[];
  other: string[];
}

function groupSyncErrors(errors: string[]): GroupedErrors {
  const grouped: GroupedErrors = {
    duplicates: [],
    missingCollections: [],
    other: [],
  };

  for (const error of errors) {
    // Parse "Duplicate name 'SG-005' from collection 'robots'"
    const dupMatch = error.match(/Duplicate name '([^']+)' from collection '([^']+)'/);
    if (dupMatch) {
      grouped.duplicates.push({ name: dupMatch[1], collection: dupMatch[2] });
      continue;
    }
    // Parse "Collection 'foo' no longer exists"
    const missingMatch = error.match(/Collection '([^']+)' no longer exists/);
    if (missingMatch) {
      grouped.missingCollections.push(missingMatch[1]);
      continue;
    }
    grouped.other.push(error);
  }

  return grouped;
}

function SyncErrorsModal({
  open,
  result,
  onClose,
}: {
  open: boolean;
  result: SyncResult | null;
  onClose: () => void;
}) {
  if (!result) return null;

  const grouped = groupSyncErrors(result.errors || []);
  const totalErrors = result.errors?.length || 0;

  // Group duplicates by collection for cleaner display
  const dupsByCollection: Record<string, string[]> = {};
  for (const dup of grouped.duplicates) {
    if (!dupsByCollection[dup.collection]) {
      dupsByCollection[dup.collection] = [];
    }
    dupsByCollection[dup.collection].push(dup.name);
  }

  return (
    <Modal
      title={
        <Space>
          <WarningOutlined style={{ color: '#faad14' }} />
          <span>Sync completed with {totalErrors} warning{totalErrors !== 1 ? 's' : ''}</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="close" type="primary" onClick={onClose}>
          Close
        </Button>,
      ]}
      width={600}
    >
      <div style={{ marginBottom: 16 }}>
        <Text type="success">
          Successfully synced {result.synced} record{result.synced !== 1 ? 's' : ''} from {result.collections} collection{result.collections !== 1 ? 's' : ''}.
        </Text>
      </div>

      {grouped.duplicates.length > 0 && (
        <Alert
          type="warning"
          style={{ marginBottom: 12 }}
          message={`${grouped.duplicates.length} duplicate name${grouped.duplicates.length !== 1 ? 's' : ''} skipped`}
          description={
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {Object.entries(dupsByCollection).map(([collection, names]) => (
                <div key={collection} style={{ marginBottom: 8 }}>
                  <Text strong>From "{collection}":</Text>
                  <div style={{ paddingLeft: 16, color: '#666' }}>
                    {names.length <= 10 ? (
                      names.map((name, i) => (
                        <Tag key={i} style={{ margin: '2px 4px 2px 0' }}>{name}</Tag>
                      ))
                    ) : (
                      <>
                        {names.slice(0, 8).map((name, i) => (
                          <Tag key={i} style={{ margin: '2px 4px 2px 0' }}>{name}</Tag>
                        ))}
                        <Text type="secondary">...and {names.length - 8} more</Text>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          }
        />
      )}

      {grouped.missingCollections.length > 0 && (
        <Alert
          type="error"
          style={{ marginBottom: 12 }}
          message={`${grouped.missingCollections.length} collection${grouped.missingCollections.length !== 1 ? 's' : ''} no longer exist`}
          description={
            <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
              {grouped.missingCollections.map((name, i) => (
                <li key={i}>{name}</li>
              ))}
            </ul>
          }
        />
      )}

      {grouped.other.length > 0 && (
        <Alert
          type="error"
          style={{ marginBottom: 12 }}
          message="Other errors"
          description={
            <ul style={{ marginBottom: 0, paddingLeft: 20, maxHeight: 150, overflowY: 'auto' }}>
              {grouped.other.map((err, i) => (
                <li key={i}><Text code>{err}</Text></li>
              ))}
            </ul>
          }
        />
      )}
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
  const [syncErrorsModalOpen, setSyncErrorsModalOpen] = React.useState(false);
  const [syncResult, setSyncResult] = React.useState<SyncResult | null>(null);

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
        // Store result and open modal to show detailed errors
        setSyncResult({ synced, collections, errors });
        setSyncErrorsModalOpen(true);
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
      <SyncErrorsModal
        open={syncErrorsModalOpen}
        result={syncResult}
        onClose={() => {
          setSyncErrorsModalOpen(false);
          setSyncResult(null);
        }}
      />
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
