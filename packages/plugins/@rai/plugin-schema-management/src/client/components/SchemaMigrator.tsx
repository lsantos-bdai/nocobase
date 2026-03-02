import React from 'react';
import { useAPIClient } from '@nocobase/client';
import { Button, Input, Space, Spin, Empty, message, Typography, Tabs, Checkbox } from 'antd';
import {
  DiffOutlined,
  ThunderboltOutlined,
  DownloadOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { CollectionSelector } from './CollectionSelector';
import { DiffPreview } from './DiffPreview';
import { MigrationResult } from './MigrationResult';

const { Text } = Typography;

interface ClassifiedChange {
  type: string;
  field: string;
  description: string;
  details?: Record<string, unknown>;
}

interface ValidationWarning {
  type: string;
  field: string;
  message: string;
  count: number;
  samples?: unknown[];
}

interface ClassifiedChanges {
  nonBreaking: ClassifiedChange[];
  breaking: ClassifiedChange[];
  unclassified: ClassifiedChange[];
}

interface DiffResponse {
  currentSpec: string;
  changes: ClassifiedChanges;
  validationWarnings: ValidationWarning[];
  canAutoApply: boolean;
}

interface MigrationResultData {
  success: boolean;
  fieldsAdded: string[];
  fieldsModified: string[];
  fieldsSkipped: string[];
  errors: string[];
  warnings: string[];
}

export function SchemaMigrator() {
  const api = useAPIClient();

  // Collection selection
  const [selectedCollection, setSelectedCollection] = React.useState<string | null>(null);

  // Spec states
  const [currentSpec, setCurrentSpec] = React.useState<string>('');
  const [newSpec, setNewSpec] = React.useState<string>('');
  const [loadingSpec, setLoadingSpec] = React.useState(false);

  // Diff states
  const [diffResult, setDiffResult] = React.useState<DiffResponse | null>(null);
  const [diffLoading, setDiffLoading] = React.useState(false);

  // Migration states
  const [migrationResult, setMigrationResult] = React.useState<MigrationResultData | null>(null);
  const [migrateLoading, setMigrateLoading] = React.useState(false);
  const [forceApply, setForceApply] = React.useState(false);

  // Export states
  const [exportLoading, setExportLoading] = React.useState(false);

  // Load current spec when collection is selected
  const loadCurrentSpec = React.useCallback(async () => {
    if (!selectedCollection) {
      setCurrentSpec('');
      setNewSpec('');
      return;
    }

    setLoadingSpec(true);
    setDiffResult(null);
    setMigrationResult(null);

    try {
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

      setCurrentSpec(yamlContent);
      setNewSpec(yamlContent); // Start with current spec as base
    } catch (err) {
      console.error('Failed to load spec:', err);
      message.error('Failed to load current schema');
      setCurrentSpec('');
      setNewSpec('');
    } finally {
      setLoadingSpec(false);
    }
  }, [api, selectedCollection]);

  React.useEffect(() => {
    loadCurrentSpec();
  }, [loadCurrentSpec]);

  // Preview changes
  const handlePreviewChanges = async () => {
    if (!selectedCollection || !newSpec.trim()) {
      message.error('Please select a collection and provide a new spec');
      return;
    }

    setDiffLoading(true);
    setDiffResult(null);
    setMigrationResult(null);

    try {
      const response = await api.request({
        url: 'schema-management:diff',
        method: 'post',
        data: {
          collection: selectedCollection,
          spec: newSpec,
        },
      });

      const result = response?.data?.data || response?.data;
      setDiffResult(result);
    } catch (err: any) {
      console.error('Diff failed:', err);
      message.error(err.response?.data?.errors?.[0]?.message || 'Failed to generate diff');
    } finally {
      setDiffLoading(false);
    }
  };

  // Apply migration
  const handleApplyMigration = async () => {
    if (!selectedCollection || !newSpec.trim()) {
      message.error('Please select a collection and provide a new spec');
      return;
    }

    setMigrateLoading(true);
    setMigrationResult(null);

    try {
      const response = await api.request({
        url: 'schema-management:migrate',
        method: 'post',
        data: {
          collection: selectedCollection,
          spec: newSpec,
          force: forceApply,
        },
      });

      const result = response?.data?.data || response?.data;
      setMigrationResult(result);

      if (result.success) {
        message.success('Migration applied successfully');
        // Refresh current spec
        await loadCurrentSpec();
        setDiffResult(null);
      }
    } catch (err: any) {
      console.error('Migration failed:', err);
      setMigrationResult({
        success: false,
        fieldsAdded: [],
        fieldsModified: [],
        fieldsSkipped: [],
        errors: [err.response?.data?.errors?.[0]?.message || err.message],
        warnings: [],
      });
    } finally {
      setMigrateLoading(false);
    }
  };

  // Export data
  const handleExportData = async () => {
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
      a.download = `${selectedCollection}-export.jsonl`;
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

  const resultTabItems = [
    {
      key: 'diff',
      label: 'Changes',
      children: (
        <DiffPreview
          changes={diffResult?.changes || null}
          validationWarnings={diffResult?.validationWarnings || []}
          canAutoApply={diffResult?.canAutoApply ?? true}
        />
      ),
    },
    {
      key: 'result',
      label: 'Migration Result',
      children: <MigrationResult result={migrationResult} />,
    },
  ];

  return (
    <div style={{ display: 'flex', gap: 24, height: 'calc(100vh - 280px)', minHeight: 500 }}>
      {/* Left sidebar: Collection selector */}
      <div
        style={{
          width: 250,
          flexShrink: 0,
          border: '1px solid #f0f0f0',
          borderRadius: 8,
          padding: 16,
          backgroundColor: '#fafafa',
          overflow: 'auto',
        }}
      >
        <h4 style={{ margin: '0 0 12px 0', color: '#666' }}>Select Collection</h4>
        <CollectionSelector selectedCollection={selectedCollection} onSelect={setSelectedCollection} />
      </div>

      {/* Middle: Spec editors */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {!selectedCollection ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Empty description="Select a collection to migrate its schema" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        ) : loadingSpec ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Spin />
          </div>
        ) : (
          <>
            {/* Editor header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <Text strong>Edit Schema: {selectedCollection}</Text>
              <Space>
                <Button size="small" icon={<ReloadOutlined />} onClick={loadCurrentSpec}>
                  Reset
                </Button>
                <Button
                  size="small"
                  icon={<DiffOutlined />}
                  onClick={handlePreviewChanges}
                  loading={diffLoading}
                >
                  Preview Changes
                </Button>
              </Space>
            </div>

            {/* Side-by-side editors */}
            <div style={{ flex: 1, display: 'flex', gap: 16, minHeight: 0 }}>
              {/* Current spec (read-only) */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <Text type="secondary" style={{ marginBottom: 4, fontSize: 12 }}>
                  Current Schema (read-only)
                </Text>
                <div
                  style={{
                    flex: 1,
                    backgroundColor: '#1e1e1e',
                    borderRadius: 4,
                    padding: 12,
                    overflow: 'auto',
                  }}
                >
                  <pre
                    style={{
                      margin: 0,
                      fontFamily: 'Monaco, Menlo, Consolas, monospace',
                      fontSize: 11,
                      lineHeight: 1.4,
                      color: '#9e9e9e',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {currentSpec}
                  </pre>
                </div>
              </div>

              {/* New spec (editable) */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <Text type="secondary" style={{ marginBottom: 4, fontSize: 12 }}>
                  New Schema (editable)
                </Text>
                <Input.TextArea
                  value={newSpec}
                  onChange={(e) => setNewSpec(e.target.value)}
                  style={{
                    flex: 1,
                    fontFamily: 'Monaco, Menlo, Consolas, monospace',
                    fontSize: 11,
                    lineHeight: 1.4,
                    resize: 'none',
                  }}
                />
              </div>
            </div>

            {/* Action buttons */}
            <div
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: '1px solid #f0f0f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Space>
                <Button
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  onClick={handleApplyMigration}
                  loading={migrateLoading}
                  disabled={!diffResult}
                >
                  Apply Migration
                </Button>
                {diffResult && !diffResult.canAutoApply && (
                  <Checkbox checked={forceApply} onChange={(e) => setForceApply(e.target.checked)}>
                    Force apply (ignore breaking changes)
                  </Checkbox>
                )}
              </Space>
              <Button
                icon={<DownloadOutlined />}
                onClick={handleExportData}
                loading={exportLoading}
                danger={diffResult && !diffResult.canAutoApply}
              >
                Export Data
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Right sidebar: Results */}
      <div
        style={{
          width: 350,
          flexShrink: 0,
          border: '1px solid #f0f0f0',
          borderRadius: 8,
          padding: 16,
          overflow: 'auto',
          backgroundColor: '#fafafa',
        }}
      >
        <Tabs items={resultTabItems} size="small" />
      </div>
    </div>
  );
}
