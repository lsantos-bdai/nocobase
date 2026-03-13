import React from 'react';
import { useAPIClient } from '@nocobase/client';
import { Table, Space, Button, Modal, message } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import { Platform, SyncResult } from './types';
import { ManageModal } from './ManageModal';
import { ViewModal } from './ViewModal';
import { SyncErrorsModal } from './SyncErrorsModal';

export function PlatformsTable() {
  const api = useAPIClient();
  const [platforms, setPlatforms] = React.useState<Platform[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [manageModalOpen, setManageModalOpen] = React.useState(false);
  const [viewModalOpen, setViewModalOpen] = React.useState(false);
  const [selectedPlatform, setSelectedPlatform] = React.useState<Platform | null>(null);
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
      const responseBody = response?.data || {};
      const data = responseBody.data;
      setPlatforms(Array.isArray(data) ? data : []);
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
            url: `databridge_platforms:deletePlatform?platform=${id}`,
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

  const handleManage = (platform: Platform) => {
    setSelectedPlatform(platform);
    setManageModalOpen(true);
  };

  const handleView = (platform: Platform) => {
    setSelectedPlatform(platform);
    setViewModalOpen(true);
  };

  const handleSyncAll = async (platform: Platform) => {
    setSyncingPlatformId(platform.id);
    try {
      const res = await api.request({
        url: `databridge_platforms:syncAll?platform=${platform.id}`,
        method: 'post',
      });
      const { synced, collections, errors } = res?.data || {};
      if (errors && errors.length > 0) {
        // Store result and open modal to show detailed errors
        setSyncResult({ synced, collections, errors });
        setSyncErrorsModalOpen(true);
      } else {
        message.success(`Synced ${synced} records from ${collections?.length || 0} collections`);
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
      render: (_: any, record: Platform) => (
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
