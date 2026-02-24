import React, { useState, useEffect } from 'react';
import { Modal, Switch, Button, Alert, Spin, Typography, Tag, Divider, Space, message } from 'antd';
import { ExclamationCircleOutlined, RollbackOutlined, WarningOutlined } from '@ant-design/icons';
import { useAPIClient } from '@nocobase/client';
import { DiffViewer } from './DiffViewer';

const { Text, Title } = Typography;

interface Snapshot {
  id: number;
  recordId: string;
  recordName: string;
  operation: string;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  changedFields: string[];
  userName: string | null;
  createdAt: string;
  version: number;
}

interface PreviewItem {
  collection: string;
  recordId: string;
  recordName: string;
  action: 'restore' | 'update' | 'delete';
  currentData: Record<string, unknown> | null;
  rollbackData: Record<string, unknown> | null;
}

interface RollbackModalProps {
  visible: boolean;
  snapshot: Snapshot | null;
  collectionName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const RollbackModal: React.FC<RollbackModalProps> = ({
  visible,
  snapshot,
  collectionName,
  onClose,
  onSuccess,
}) => {
  const api = useAPIClient();
  const [cascade, setCascade] = useState(false);
  const [preview, setPreview] = useState<PreviewItem[] | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [executing, setExecuting] = useState(false);

  useEffect(() => {
    if (visible && snapshot) {
      loadPreview();
    } else {
      setPreview(null);
      setCascade(false);
    }
  }, [visible, snapshot, cascade]);

  const loadPreview = async () => {
    if (!snapshot) return;

    setLoadingPreview(true);
    try {
      const response = await api.request({
        url: 'cdc:preview',
        method: 'POST',
        data: {
          snapshotId: snapshot.id,
          cascade,
        },
      });

      if (response?.data?.preview) {
        setPreview(response.data.preview);
      }
    } catch (err: any) {
      message.error(`Failed to load preview: ${err.message || 'Unknown error'}`);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleRollback = async () => {
    if (!snapshot) return;

    setExecuting(true);
    try {
      const response = await api.request({
        url: 'cdc:rollback',
        method: 'POST',
        data: {
          snapshotId: snapshot.id,
          cascade,
          confirmed: true,
        },
      });

      if (response?.data?.success) {
        message.success(response.data.message || 'Rollback successful');
        onSuccess();
        onClose();
      }
    } catch (err: any) {
      message.error(`Rollback failed: ${err.message || 'Unknown error'}`);
    } finally {
      setExecuting(false);
    }
  };

  const getOperationTag = (operation: string) => {
    const colors: Record<string, string> = {
      create: 'green',
      update: 'blue',
      destroy: 'red',
    };
    return <Tag color={colors[operation] || 'default'}>{operation}</Tag>;
  };

  const getActionTag = (action: string) => {
    const colors: Record<string, string> = {
      restore: 'green',
      update: 'orange',
      delete: 'red',
    };
    return <Tag color={colors[action] || 'default'}>{action}</Tag>;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  if (!snapshot) return null;

  return (
    <Modal
      open={visible}
      title={
        <Space>
          <RollbackOutlined />
          <span>Rollback to Version {snapshot.version}</span>
        </Space>
      }
      width={800}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose} disabled={executing}>
          Cancel
        </Button>,
        <Button
          key="rollback"
          type="primary"
          danger
          icon={<RollbackOutlined />}
          onClick={handleRollback}
          loading={executing}
          disabled={loadingPreview}
        >
          Execute Rollback
        </Button>,
      ]}
    >
      <div style={{ marginBottom: 16 }}>
        <Alert
          message="Warning: This action will modify data"
          description="Rolling back will change records to their previous state. This action cannot be undone, but new snapshots will be created for the changes."
          type="warning"
          icon={<WarningOutlined />}
          showIcon
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <Title level={5}>Snapshot Details</Title>
        <table style={{ width: '100%' }}>
          <tbody>
            <tr>
              <td style={{ padding: '4px 12px 4px 0', color: '#666' }}>Record:</td>
              <td>{snapshot.recordName} (ID: {snapshot.recordId})</td>
            </tr>
            <tr>
              <td style={{ padding: '4px 12px 4px 0', color: '#666' }}>Operation:</td>
              <td>{getOperationTag(snapshot.operation)}</td>
            </tr>
            <tr>
              <td style={{ padding: '4px 12px 4px 0', color: '#666' }}>Changed by:</td>
              <td>{snapshot.userName || 'Unknown'}</td>
            </tr>
            <tr>
              <td style={{ padding: '4px 12px 4px 0', color: '#666' }}>Changed at:</td>
              <td>{formatDate(snapshot.createdAt)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Space>
          <Text>Include related records (cascade):</Text>
          <Switch checked={cascade} onChange={setCascade} disabled={loadingPreview || executing} />
        </Space>
      </div>

      <Divider />

      <Title level={5}>Changes Preview</Title>
      {loadingPreview ? (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin />
          <div style={{ marginTop: 8 }}>Loading preview...</div>
        </div>
      ) : preview ? (
        <div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            {preview.length} record(s) will be affected
          </Text>
          {preview.map((item, index) => (
            <div
              key={`${item.collection}-${item.recordId}`}
              style={{
                marginBottom: 16,
                padding: 12,
                border: '1px solid #f0f0f0',
                borderRadius: 4,
              }}
            >
              <div style={{ marginBottom: 8 }}>
                <Space>
                  <Text strong>{item.recordName}</Text>
                  <Text type="secondary">({item.collection})</Text>
                  {getActionTag(item.action)}
                </Space>
              </div>
              {item.action !== 'delete' && (
                <DiffViewer
                  beforeData={item.currentData}
                  afterData={item.rollbackData}
                  mode="unified"
                />
              )}
              {item.action === 'delete' && (
                <Text type="secondary">This record will be deleted</Text>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Text type="secondary">No preview available</Text>
      )}
    </Modal>
  );
};

export default RollbackModal;
