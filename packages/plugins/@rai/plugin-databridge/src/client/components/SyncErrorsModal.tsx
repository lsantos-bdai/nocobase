import React from 'react';
import { Modal, Button, Alert, Tag, Space, Typography } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import { SyncResult } from './types';
import { groupSyncErrors } from '../utils';

const { Text } = Typography;

interface SyncErrorsModalProps {
  open: boolean;
  result: SyncResult | null;
  onClose: () => void;
}

export function SyncErrorsModal({ open, result, onClose }: SyncErrorsModalProps) {
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

  const MAX_INLINE_TAGS = 8;
  const MAX_TAGS_BEFORE_ELLIPSIS = 10;

  return (
    <Modal
      title={
        <Space>
          <WarningOutlined style={{ color: '#faad14' }} />
          <span>
            Sync completed with {totalErrors} warning{totalErrors !== 1 ? 's' : ''}
          </span>
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
          Successfully synced {result.synced} record{result.synced !== 1 ? 's' : ''} from {result.collections}{' '}
          collection{result.collections !== 1 ? 's' : ''}.
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
                    {names.length <= MAX_TAGS_BEFORE_ELLIPSIS ? (
                      names.map((name, i) => (
                        <Tag key={i} style={{ margin: '2px 4px 2px 0' }}>
                          {name}
                        </Tag>
                      ))
                    ) : (
                      <>
                        {names.slice(0, MAX_INLINE_TAGS).map((name, i) => (
                          <Tag key={i} style={{ margin: '2px 4px 2px 0' }}>
                            {name}
                          </Tag>
                        ))}
                        <Text type="secondary">...and {names.length - MAX_INLINE_TAGS} more</Text>
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
                <li key={i}>
                  <Text code>{err}</Text>
                </li>
              ))}
            </ul>
          }
        />
      )}
    </Modal>
  );
}
