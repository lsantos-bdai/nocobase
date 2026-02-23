import React from 'react';
import { useAPIClient } from '@nocobase/client';
import { Modal, Checkbox, Spin, Tag, Alert, Space, message, Typography } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import { Platform, CollectionInfo, DuplicateError } from './types';

const { Text } = Typography;

interface ManageModalProps {
  open: boolean;
  platform: Platform | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function ManageModal({ open, platform, onClose, onSuccess }: ManageModalProps) {
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
    if (!platform) return;

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

  const totalConflicts =
    (duplicateError?.withinNewCollections?.length || 0) + (duplicateError?.withExistingEntries?.length || 0);

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
          message={`Duplicate asset names found (${totalConflicts} conflicts)`}
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
                              <Tag key={i} style={{ margin: '2px 4px 2px 0' }}>
                                {item.name}
                              </Tag>
                            ))}
                            {items.length > 8 && <Text type="secondary">...and {items.length - 8} more</Text>}
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
                <Checkbox disabled={!coll.hasNameField} checked={isSelected} onChange={() => handleToggle(coll.name)}>
                  <span style={{ fontWeight: wasSynced ? 500 : 400 }}>
                    {coll.title}
                    {coll.name !== coll.title && <span style={{ color: '#999', marginLeft: 8 }}>({coll.name})</span>}
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
