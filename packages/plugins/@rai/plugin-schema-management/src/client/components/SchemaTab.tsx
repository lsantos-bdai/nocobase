import React from 'react';
import { useAPIClient } from '@nocobase/client';
import { Button, Input, Space, Alert, Tag, Empty, Spin, message, Typography, Divider } from 'antd';
import {
  UploadOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { CollectionSelector } from './CollectionSelector';

const { Text } = Typography;

interface ImportResult {
  success: boolean;
  collection?: { name: string; title: string };
  fieldsCreated: string[];
  fieldsSkipped: string[];
  errors: string[];
  warnings: string[];
}

const PLACEHOLDER_YAML = `# Paste your OpenAPI YAML spec here
# Example:
openapi: '3.1.0'
info:
  title: My Collection
  version: 1.0.0
components:
  schemas:
    My Collection:
      type: object
      properties:
        name:
          type: string
        status:
          type: string
          enum:
            - active
            - inactive
      required:
        - name`;

function ImportResultDisplay({ result }: { result: ImportResult }) {
  return (
    <div>
      {result.success ? (
        <Alert
          type="success"
          message="Import Successful"
          description={
            result.collection ? (
              <span>
                Created collection: <strong>{result.collection.title}</strong>
              </span>
            ) : undefined
          }
          icon={<CheckCircleOutlined />}
          showIcon
          style={{ marginBottom: 16 }}
        />
      ) : (
        <Alert
          type="error"
          message="Import Failed"
          description={result.errors?.[0]}
          icon={<CloseCircleOutlined />}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {result.warnings && result.warnings.length > 0 && (
        <Alert
          type="warning"
          message="Warnings"
          description={
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          }
          icon={<WarningOutlined />}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {result.fieldsCreated && result.fieldsCreated.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#666', fontSize: 13 }}>Fields Created</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {result.fieldsCreated.map((field) => (
              <Tag key={field} color="green">
                {field}
              </Tag>
            ))}
          </div>
        </div>
      )}

      {result.fieldsSkipped && result.fieldsSkipped.length > 0 && (
        <div>
          <h4 style={{ margin: '0 0 8px 0', color: '#666', fontSize: 13 }}>Fields Skipped</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {result.fieldsSkipped.map((field) => (
              <Tag key={field} color="orange">
                {field}
              </Tag>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function SchemaTab() {
  const api = useAPIClient();

  // Export state
  const [selectedCollection, setSelectedCollection] = React.useState<string | null>(null);
  const [spec, setSpec] = React.useState<string>('');
  const [collectionTitle, setCollectionTitle] = React.useState<string>('');
  const [exportLoading, setExportLoading] = React.useState(false);

  // Import state
  const [importSpec, setImportSpec] = React.useState('');
  const [importLoading, setImportLoading] = React.useState(false);
  const [importResult, setImportResult] = React.useState<ImportResult | null>(null);

  // Fetch spec when collection is selected
  const fetchSpec = React.useCallback(async () => {
    if (!selectedCollection) {
      setSpec('');
      setCollectionTitle('');
      return;
    }

    try {
      setExportLoading(true);
      const response = await api.request({
        url: `schema-management:generate?collection=${encodeURIComponent(selectedCollection)}`,
        method: 'get',
      });

      const responseData = response?.data;
      let yamlContent = '';
      if (typeof responseData === 'string') {
        yamlContent = responseData;
      } else if (typeof responseData?.data === 'string') {
        yamlContent = responseData.data;
      }
      setSpec(yamlContent);

      const titleMatch = typeof yamlContent === 'string' ? yamlContent.match(/title:\s*(.+)/) : null;
      setCollectionTitle(titleMatch ? titleMatch[1].trim() : selectedCollection);
    } catch (err) {
      console.error('Failed to fetch spec:', err);
      setSpec('');
      message.error('Failed to generate OpenAPI spec');
    } finally {
      setExportLoading(false);
    }
  }, [api, selectedCollection]);

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
    a.download = `${selectedCollection}-openapi.yaml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    message.success('Downloaded');
  };

  const handleImport = async () => {
    if (!importSpec.trim()) {
      message.error('Please enter an OpenAPI spec');
      return;
    }

    setImportLoading(true);
    setImportResult(null);

    try {
      const response = await api.request({
        url: 'schema-management:import',
        method: 'post',
        data: { spec: importSpec },
      });
      setImportResult(response?.data?.data || response?.data);
    } catch (err: any) {
      setImportResult({
        success: false,
        errors: [err.response?.data?.errors?.[0]?.message || err.message],
        fieldsCreated: [],
        fieldsSkipped: [],
        warnings: [],
      });
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 24, height: 'calc(100vh - 280px)', minHeight: 400 }}>
      {/* Left: Collection selector + Export */}
      <div
        style={{
          width: 300,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Collection selector */}
        <div
          style={{
            flex: 1,
            border: '1px solid #f0f0f0',
            borderRadius: 8,
            padding: 16,
            backgroundColor: '#fafafa',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <h4 style={{ margin: '0 0 12px 0', color: '#666' }}>Export Collection</h4>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <CollectionSelector selectedCollection={selectedCollection} onSelect={setSelectedCollection} />
          </div>
        </div>
      </div>

      {/* Middle: Spec viewer (export) */}
      <div
        style={{
          flex: 1,
          border: '1px solid #f0f0f0',
          borderRadius: 8,
          padding: 16,
          backgroundColor: '#fff',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {!selectedCollection ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Empty description="Select a collection to view its OpenAPI spec" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        ) : exportLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Spin />
          </div>
        ) : (
          <>
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
                  {selectedCollection}
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
          </>
        )}
      </div>

      {/* Right: Import section */}
      <div
        style={{
          width: 400,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* YAML input */}
        <div
          style={{
            flex: 1,
            border: '1px solid #f0f0f0',
            borderRadius: 8,
            padding: 16,
            backgroundColor: '#fff',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <h4 style={{ margin: '0 0 12px 0', color: '#666' }}>Import New Collection</h4>
          <Input.TextArea
            value={importSpec}
            onChange={(e) => setImportSpec(e.target.value)}
            placeholder={PLACEHOLDER_YAML}
            style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
          />
          <Space style={{ marginTop: 12 }}>
            <Button type="primary" icon={<UploadOutlined />} onClick={handleImport} loading={importLoading}>
              Import
            </Button>
          </Space>
        </div>

        {/* Results */}
        <div
          style={{
            border: '1px solid #f0f0f0',
            borderRadius: 8,
            padding: 16,
            backgroundColor: '#fafafa',
            maxHeight: 200,
            overflow: 'auto',
          }}
        >
          <h4 style={{ margin: '0 0 16px 0', color: '#666' }}>Import Results</h4>
          {importLoading && (
            <div style={{ textAlign: 'center', padding: 20 }}>
              <Spin />
            </div>
          )}
          {importResult && <ImportResultDisplay result={importResult} />}
          {!importLoading && !importResult && <Empty description="Import a spec to see results" />}
        </div>
      </div>
    </div>
  );
}
