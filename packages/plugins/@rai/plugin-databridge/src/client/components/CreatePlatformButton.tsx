import React from 'react';
import { useAPIClient } from '@nocobase/client';
import { Button, Modal, Form, Input, message } from 'antd';

export function CreatePlatformButton() {
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
