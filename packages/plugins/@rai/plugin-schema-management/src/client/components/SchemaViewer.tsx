import React from 'react';
import { useAPIClient } from '@nocobase/client';
import { Button, Space, Spin, Empty, message, Typography } from 'antd';
import { CopyOutlined, DownloadOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface SchemaViewerProps {
  collectionName: string | null;
}

export function SchemaViewer({ collectionName }: SchemaViewerProps) {
  const api = useAPIClient();
  const [spec, setSpec] = React.useState<string>('');
  const [loading, setLoading] = React.useState(false);
  const [collectionTitle, setCollectionTitle] = React.useState<string>('');

  const fetchSpec = React.useCallback(async () => {
    if (!collectionName) {
      setSpec('');
      setCollectionTitle('');
      return;
    }

    try {
      setLoading(true);
      const response = await api.request({
        url: `schema-management:generate?collection=${encodeURIComponent(collectionName)}`,
        method: 'get',
      });
      // NocoBase wraps responses - extract the actual content
      // For YAML responses, the content may be in data.data or data directly
      const responseData = response?.data;
      let yamlContent = '';
      if (typeof responseData === 'string') {
        yamlContent = responseData;
      } else if (typeof responseData?.data === 'string') {
        yamlContent = responseData.data;
      }
      setSpec(yamlContent);

      // Extract title from the YAML for display
      const titleMatch = typeof yamlContent === 'string' ? yamlContent.match(/title:\s*(.+)/) : null;
      setCollectionTitle(titleMatch ? titleMatch[1].trim() : collectionName);
    } catch (err) {
      console.error('Failed to fetch spec:', err);
      setSpec('');
      message.error('Failed to generate OpenAPI spec');
    } finally {
      setLoading(false);
    }
  }, [api, collectionName]);

  React.useEffect(() => {
    fetchSpec();
  }, [fetchSpec]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(spec);
      message.success('Copied to clipboard');
    } catch {
      message.error('Failed to copy');
    }
  };

  const handleDownload = () => {
    const blob = new Blob([spec], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${collectionName}-openapi.yaml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    message.success('Downloaded');
  };

  if (!collectionName) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Empty description="Select a collection to view its OpenAPI spec" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Spin />
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
          paddingBottom: 12,
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        <div>
          <Text strong style={{ fontSize: 14 }}>
            OpenAPI Spec: {collectionTitle}
          </Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {collectionName}
          </Text>
        </div>
        <Space>
          <Button size="small" icon={<CopyOutlined />} onClick={handleCopy}>
            Copy
          </Button>
          <Button size="small" icon={<DownloadOutlined />} onClick={handleDownload}>
            Download
          </Button>
        </Space>
      </div>
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          backgroundColor: '#1e1e1e',
          borderRadius: 4,
          padding: 16,
        }}
      >
        <pre
          style={{
            margin: 0,
            fontFamily: 'Monaco, Menlo, Consolas, monospace',
            fontSize: 12,
            lineHeight: 1.5,
            color: '#d4d4d4',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {spec}
        </pre>
      </div>
    </div>
  );
}
