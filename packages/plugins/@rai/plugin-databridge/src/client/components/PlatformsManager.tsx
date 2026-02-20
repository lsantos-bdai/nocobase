import React from 'react';
import { SchemaComponent, useAPIClient, useRequest } from '@nocobase/client';
import { Button, Table, Space, Modal, Form, Input, message } from 'antd';

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

function PlatformsTable() {
  const api = useAPIClient();
  const [platforms, setPlatforms] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

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

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Slug', dataIndex: 'slug', key: 'slug' },
    { title: 'Collection', dataIndex: 'collectionName', key: 'collectionName' },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" danger onClick={() => handleDelete(record.id)}>
            Delete
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Table
      rowKey="id"
      loading={loading}
      dataSource={platforms}
      columns={columns}
      pagination={false}
    />
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
