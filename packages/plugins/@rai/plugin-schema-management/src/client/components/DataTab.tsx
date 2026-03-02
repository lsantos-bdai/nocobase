import React from 'react';
import { useAPIClient } from '@nocobase/client';
import { Button, Input, Space, Alert, Empty, Spin, message, Typography, Radio, Upload, Divider } from 'antd';
import {
  UploadOutlined,
  DownloadOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import { CollectionSelector } from './CollectionSelector';

const { Text } = Typography;
const { Dragger } = Upload;

interface ImportResult {
  success: boolean;
  recordsInserted: number;
  recordsUpdated: number;
  recordsSkipped: number;
  errors: string[];
  warnings: string[];
}

function ImportResultDisplay({ result }: { result: ImportResult }) {
  const totalProcessed = result.recordsInserted + result.recordsUpdated;

  return (
    <div>
      {result.success ? (
        <Alert
          type="success"
          message="Import Successful"
          description={
            <div>
              <div>Records inserted: <strong>{result.recordsInserted}</strong></div>
              {result.recordsUpdated > 0 && (
                <div>Records updated: <strong>{result.recordsUpdated}</strong></div>
              )}
              {result.recordsSkipped > 0 && (
                <div style={{ color: '#faad14' }}>Records skipped: {result.recordsSkipped}</div>
              )}
            </div>
          }
          icon={<CheckCircleOutlined />}
          showIcon
          style={{ marginBottom: 16 }}
        />
      ) : (
        <Alert
          type="error"
          message="Import Failed"
          description={
            <div>
              {result.errors?.[0]}
              {result.recordsSkipped > 0 && (
                <div style={{ marginTop: 8 }}>Total skipped: {result.recordsSkipped}</div>
              )}
            </div>
          }
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

      {result.errors && result.errors.length > 1 && (
        <div>
          <h4 style={{ margin: '0 0 8px 0', color: '#666', fontSize: 13 }}>Errors</h4>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: '#ff4d4f' }}>
            {result.errors.slice(1, 6).map((err, i) => (
              <li key={i}>{err}</li>
            ))}
            {result.errors.length > 6 && (
              <li style={{ color: '#999' }}>... and {result.errors.length - 6} more</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export function DataTab() {
  const api = useAPIClient();

  // Collection selection
  const [selectedCollection, setSelectedCollection] = React.useState<string | null>(null);

  // Export state
  const [exportLoading, setExportLoading] = React.useState(false);

  // Import state
  const [importData, setImportData] = React.useState('');
  const [importMode, setImportMode] = React.useState<'insert' | 'upsert'>('insert');
  const [importLoading, setImportLoading] = React.useState(false);
  const [importResult, setImportResult] = React.useState<ImportResult | null>(null);

  // Handle data export
  const handleExport = async () => {
    if (!selectedCollection) {
      message.error('Please select a collection');
      return;
    }

    setExportLoading(true);

    try {
      const response = await api.request({
        url: `schema-management:exportGet?collection=${encodeURIComponent(selectedCollection)}`,
        method: 'get',
        responseType: 'blob',
      });

      // Create download link
      const blob = new Blob([response.data], { type: 'application/x-ndjson' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedCollection}-data.jsonl`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      message.success('Data exported successfully');
    } catch (err: any) {
      console.error('Export failed:', err);
      message.error('Failed to export data');
    } finally {
      setExportLoading(false);
    }
  };

  // Handle data import
  const handleImport = async () => {
    if (!selectedCollection) {
      message.error('Please select a collection');
      return;
    }

    if (!importData.trim()) {
      message.error('Please provide JSON Lines data to import');
      return;
    }

    setImportLoading(true);
    setImportResult(null);

    try {
      const response = await api.request({
        url: 'schema-management:importData',
        method: 'post',
        data: {
          collection: selectedCollection,
          data: importData,
          mode: importMode,
        },
      });

      setImportResult(response?.data?.data || response?.data);
    } catch (err: any) {
      setImportResult({
        success: false,
        recordsInserted: 0,
        recordsUpdated: 0,
        recordsSkipped: 0,
        errors: [err.response?.data?.errors?.[0]?.message || err.message],
        warnings: [],
      });
    } finally {
      setImportLoading(false);
    }
  };

  // Handle file upload
  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setImportData(content);
    };
    reader.readAsText(file);
    return false; // Prevent default upload behavior
  };

  return (
    <div style={{ display: 'flex', gap: 24, height: 'calc(100vh - 280px)', minHeight: 400 }}>
      {/* Left: Collection selector */}
      <div
        style={{
          width: 280,
          flexShrink: 0,
          border: '1px solid #f0f0f0',
          borderRadius: 8,
          padding: 16,
          backgroundColor: '#fafafa',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <h4 style={{ margin: '0 0 12px 0', color: '#666' }}>Select Collection</h4>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <CollectionSelector selectedCollection={selectedCollection} onSelect={setSelectedCollection} />
        </div>

        {/* Export section */}
        {selectedCollection && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e8e8e8' }}>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={handleExport}
              loading={exportLoading}
              block
            >
              Export Data (JSON Lines)
            </Button>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
              Download all records as .jsonl file
            </Text>
          </div>
        )}
      </div>

      {/* Middle: Import section */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {!selectedCollection ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #f0f0f0',
              borderRadius: 8,
              backgroundColor: '#fafafa',
            }}
          >
            <Empty description="Select a collection to import/export data" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        ) : (
          <>
            {/* File upload area */}
            <Dragger
              accept=".jsonl,.json,.ndjson"
              beforeUpload={handleFileUpload}
              showUploadList={false}
              style={{ padding: 16 }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">Click or drag JSON Lines file to upload</p>
              <p className="ant-upload-hint" style={{ fontSize: 11 }}>
                Supports .jsonl, .json, .ndjson files
              </p>
            </Dragger>

            {/* Text area for pasting data */}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text strong>JSON Lines Data</Text>
                <Radio.Group
                  value={importMode}
                  onChange={(e) => setImportMode(e.target.value)}
                  size="small"
                >
                  <Radio.Button value="insert">Insert</Radio.Button>
                  <Radio.Button value="upsert">Upsert</Radio.Button>
                </Radio.Group>
              </div>

              <Input.TextArea
                value={importData}
                onChange={(e) => setImportData(e.target.value)}
                placeholder={`{"name": "Record 1", "status": "active"}\n{"name": "Record 2", "status": "pending"}\n...`}
                style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
              />

              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {importMode === 'insert'
                    ? 'Insert: Create new records only'
                    : 'Upsert: Update existing records by ID, insert new ones'}
                </Text>
                <Button
                  type="primary"
                  icon={<UploadOutlined />}
                  onClick={handleImport}
                  loading={importLoading}
                  disabled={!importData.trim()}
                >
                  Import Data
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Right: Results */}
      <div
        style={{
          width: 320,
          flexShrink: 0,
          border: '1px solid #f0f0f0',
          borderRadius: 8,
          padding: 16,
          backgroundColor: '#fafafa',
          overflow: 'auto',
        }}
      >
        <h4 style={{ margin: '0 0 16px 0', color: '#666' }}>Import Results</h4>
        {importLoading && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        )}
        {importResult && <ImportResultDisplay result={importResult} />}
        {!importLoading && !importResult && (
          <Empty description="Import data to see results" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </div>
    </div>
  );
}
