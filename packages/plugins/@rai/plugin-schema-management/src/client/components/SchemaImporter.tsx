import React from 'react';
import { useAPIClient } from '@nocobase/client';
import { Button, Input, Space, Alert, Tag, Empty, Spin, message } from 'antd';
import { UploadOutlined, CheckCircleOutlined, WarningOutlined, CloseCircleOutlined } from '@ant-design/icons';

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
openapi: '3.0.3'
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

export function SchemaImporter() {
  const api = useAPIClient();
  const [spec, setSpec] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<ImportResult | null>(null);

  const handleImport = async () => {
    if (!spec.trim()) {
      message.error('Please enter an OpenAPI spec');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await api.request({
        url: 'schema-management:import',
        method: 'post',
        data: { spec },
      });
      setResult(response?.data?.data || response?.data);
    } catch (err: any) {
      setResult({
        success: false,
        errors: [err.response?.data?.errors?.[0]?.message || err.message],
        fieldsCreated: [],
        fieldsSkipped: [],
        warnings: [],
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 24, height: 'calc(100vh - 280px)', minHeight: 400 }}>
      {/* Left: YAML Input */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Input.TextArea
          value={spec}
          onChange={(e) => setSpec(e.target.value)}
          placeholder={PLACEHOLDER_YAML}
          style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
        />
        <Space style={{ marginTop: 12 }}>
          <Button type="primary" icon={<UploadOutlined />} onClick={handleImport} loading={loading}>
            Import
          </Button>
        </Space>
      </div>

      {/* Right: Results */}
      <div
        style={{
          width: 350,
          border: '1px solid #f0f0f0',
          borderRadius: 8,
          padding: 16,
          overflow: 'auto',
          backgroundColor: '#fafafa',
        }}
      >
        <h4 style={{ margin: '0 0 16px 0', color: '#666' }}>Import Results</h4>
        {loading && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        )}
        {result && <ImportResultDisplay result={result} />}
        {!loading && !result && <Empty description="Import a spec to see results" />}
      </div>
    </div>
  );
}
