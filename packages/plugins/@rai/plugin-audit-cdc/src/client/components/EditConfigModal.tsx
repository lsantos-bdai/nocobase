import React, { useEffect, useState } from 'react';
import { Modal, Form, InputNumber, Checkbox, Space } from 'antd';

interface EditConfigModalProps {
  visible: boolean;
  collectionName: string;
  collectionTitle: string;
  retentionDays: number | null;
  maxVersions: number | null;
  onSave: (retentionDays: number | null, maxVersions: number | null) => Promise<void>;
  onCancel: () => void;
}

export const EditConfigModal: React.FC<EditConfigModalProps> = ({
  visible,
  collectionName,
  collectionTitle,
  retentionDays,
  maxVersions,
  onSave,
  onCancel,
}) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [retentionForever, setRetentionForever] = useState(retentionDays === null);
  const [versionsUnlimited, setVersionsUnlimited] = useState(maxVersions === null);

  useEffect(() => {
    if (visible) {
      setRetentionForever(retentionDays === null);
      setVersionsUnlimited(maxVersions === null);
      form.setFieldsValue({
        retentionDays: retentionDays ?? 30,
        maxVersions: maxVersions ?? 100,
      });
    }
  }, [visible, retentionDays, maxVersions, form]);

  const handleOk = async () => {
    setSaving(true);
    try {
      const values = form.getFieldsValue();
      const finalRetention = retentionForever ? null : values.retentionDays;
      const finalVersions = versionsUnlimited ? null : values.maxVersions;
      await onSave(finalRetention, finalVersions);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Edit Settings: ${collectionTitle}`}
      open={visible}
      onOk={handleOk}
      onCancel={onCancel}
      confirmLoading={saving}
      okText="Save"
      cancelText="Cancel"
      destroyOnClose
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item label="Retention (days)">
          <Space direction="vertical" size={8}>
            <Form.Item name="retentionDays" noStyle>
              <InputNumber
                min={1}
                max={3650}
                disabled={retentionForever}
                style={{ width: 120 }}
              />
            </Form.Item>
            <Checkbox
              checked={retentionForever}
              onChange={(e) => setRetentionForever(e.target.checked)}
            >
              Forever (no expiration)
            </Checkbox>
          </Space>
        </Form.Item>

        <Form.Item label="Max Versions">
          <Space direction="vertical" size={8}>
            <Form.Item name="maxVersions" noStyle>
              <InputNumber
                min={1}
                max={9999}
                disabled={versionsUnlimited}
                style={{ width: 120 }}
              />
            </Form.Item>
            <Checkbox
              checked={versionsUnlimited}
              onChange={(e) => setVersionsUnlimited(e.target.checked)}
            >
              Unlimited
            </Checkbox>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default EditConfigModal;
