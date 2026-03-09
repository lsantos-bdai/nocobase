import React from 'react';
import { useAPIClient } from '@nocobase/client';
import { Modal, Table, message } from 'antd';
import { Platform, LookupEntry } from './types';

interface ViewModalProps {
  open: boolean;
  platform: Platform | null;
  onClose: () => void;
}

const DEFAULT_PAGE_SIZE = 50;

export function ViewModal({ open, platform, onClose }: ViewModalProps) {
  const api = useAPIClient();
  const [entries, setEntries] = React.useState<LookupEntry[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [pagination, setPagination] = React.useState({ page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0 });

  const fetchEntries = React.useCallback(
    async (page: number, pageSize: number) => {
      if (!platform) return;
      setLoading(true);
      try {
        const res = await api.request({
          url: `databridge_platforms:view?platform=${platform.id}&page=${page}&pageSize=${pageSize}`,
          method: 'get',
        });
        const responseBody = res?.data || {};
        const data = responseBody.data;
        const meta = responseBody.meta;
        setEntries(Array.isArray(data) ? data : []);
        setPagination({
          page: meta?.page || 1,
          pageSize: meta?.pageSize || DEFAULT_PAGE_SIZE,
          total: meta?.total || 0,
        });
      } catch (err) {
        console.error('Failed to fetch entries:', err);
        message.error('Failed to load entries');
        setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [api, platform],
  );

  React.useEffect(() => {
    if (open && platform) {
      setEntries([]);
      setPagination({ page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0 });
      fetchEntries(1, DEFAULT_PAGE_SIZE);
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
