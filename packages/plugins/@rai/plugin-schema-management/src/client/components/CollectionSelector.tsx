import React from 'react';
import { useAPIClient } from '@nocobase/client';
import { List, Spin, Input, Empty } from 'antd';
import { DatabaseOutlined } from '@ant-design/icons';

interface Collection {
  name: string;
  title: string;
  fieldCount: number;
}

interface CollectionSelectorProps {
  selectedCollection: string | null;
  onSelect: (collectionName: string) => void;
}

export function CollectionSelector({ selectedCollection, onSelect }: CollectionSelectorProps) {
  const api = useAPIClient();
  const [collections, setCollections] = React.useState<Collection[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchText, setSearchText] = React.useState('');

  const fetchCollections = React.useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.request({
        url: 'schema-management:listCollections',
        method: 'get',
      });
      setCollections(response?.data || []);
    } catch (err) {
      console.error('Failed to fetch collections:', err);
      setCollections([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  React.useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  const filteredCollections = React.useMemo(() => {
    if (!searchText) return collections;
    const lower = searchText.toLowerCase();
    return collections.filter(
      (c) => c.name.toLowerCase().includes(lower) || c.title.toLowerCase().includes(lower),
    );
  }, [collections, searchText]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
        <Spin />
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Input.Search
        placeholder="Search collections..."
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        style={{ marginBottom: 12 }}
        allowClear
      />
      <div style={{ flex: 1, overflow: 'auto' }}>
        {filteredCollections.length === 0 ? (
          <Empty description="No collections found" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <List
            size="small"
            dataSource={filteredCollections}
            renderItem={(item) => (
              <List.Item
                onClick={() => onSelect(item.name)}
                style={{
                  cursor: 'pointer',
                  padding: '8px 12px',
                  backgroundColor: selectedCollection === item.name ? '#e6f4ff' : 'transparent',
                  borderRadius: 4,
                  marginBottom: 2,
                }}
              >
                <List.Item.Meta
                  avatar={<DatabaseOutlined style={{ fontSize: 16, color: '#1890ff' }} />}
                  title={<span style={{ fontSize: 13 }}>{item.title}</span>}
                  description={
                    <span style={{ fontSize: 11, color: '#888' }}>
                      {item.name} · {item.fieldCount} fields
                    </span>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </div>
    </div>
  );
}
