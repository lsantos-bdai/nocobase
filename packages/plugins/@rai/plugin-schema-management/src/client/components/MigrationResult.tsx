import React from 'react';
import { Alert, Tag, Empty } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, WarningOutlined } from '@ant-design/icons';

interface MigrationResultData {
  success: boolean;
  fieldsAdded: string[];
  fieldsModified: string[];
  fieldsSkipped: string[];
  errors: string[];
  warnings: string[];
}

interface MigrationResultProps {
  result: MigrationResultData | null;
}

export function MigrationResult({ result }: MigrationResultProps) {
  if (!result) {
    return (
      <Empty
        description="Apply a migration to see results"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    );
  }

  return (
    <div>
      {/* Success/Error Alert */}
      {result.success ? (
        <Alert
          type="success"
          message="Migration Successful"
          description="The schema changes have been applied to the collection."
          icon={<CheckCircleOutlined />}
          showIcon
          style={{ marginBottom: 16 }}
        />
      ) : (
        <Alert
          type="error"
          message="Migration Failed"
          description={result.errors?.[0] || 'An unknown error occurred'}
          icon={<CloseCircleOutlined />}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Additional errors */}
      {result.errors && result.errors.length > 1 && (
        <Alert
          type="error"
          message="Additional Errors"
          description={
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {result.errors.slice(1).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          }
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Warnings */}
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

      {/* Fields Added */}
      {result.fieldsAdded && result.fieldsAdded.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#389e0d', fontSize: 13 }}>
            Fields Added ({result.fieldsAdded.length})
          </h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {result.fieldsAdded.map((field) => (
              <Tag key={field} color="green">
                {field}
              </Tag>
            ))}
          </div>
        </div>
      )}

      {/* Fields Modified */}
      {result.fieldsModified && result.fieldsModified.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#1890ff', fontSize: 13 }}>
            Fields Modified ({result.fieldsModified.length})
          </h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {result.fieldsModified.map((field) => (
              <Tag key={field} color="blue">
                {field}
              </Tag>
            ))}
          </div>
        </div>
      )}

      {/* Fields Skipped */}
      {result.fieldsSkipped && result.fieldsSkipped.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#d46b08', fontSize: 13 }}>
            Fields Skipped ({result.fieldsSkipped.length})
          </h4>
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
