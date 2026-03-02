import React from 'react';
import { Alert, Tag, Empty, Typography } from 'antd';
import { WarningOutlined, CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';

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

interface DiffPreviewProps {
  changes: ClassifiedChanges | null;
  validationWarnings: ValidationWarning[];
  canAutoApply: boolean;
}

function ChangeTag({ change, color }: { change: ClassifiedChange; color: string }) {
  return (
    <Tag color={color} style={{ marginBottom: 4 }}>
      <strong>{change.field}</strong>: {change.description}
    </Tag>
  );
}

export function DiffPreview({ changes, validationWarnings, canAutoApply }: DiffPreviewProps) {
  if (!changes) {
    return (
      <Empty
        description="Preview changes to see the diff"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    );
  }

  const hasNoChanges =
    changes.nonBreaking.length === 0 &&
    changes.breaking.length === 0 &&
    changes.unclassified.length === 0;

  if (hasNoChanges) {
    return (
      <Alert
        type="info"
        message="No Changes Detected"
        description="The new spec is identical to the current schema."
        showIcon
      />
    );
  }

  return (
    <div>
      {/* Auto-apply status */}
      {canAutoApply ? (
        <Alert
          type="success"
          message="Safe to Apply"
          description="All changes are non-breaking and can be applied automatically."
          icon={<CheckCircleOutlined />}
          showIcon
          style={{ marginBottom: 16 }}
        />
      ) : (
        <Alert
          type="warning"
          message="Breaking Changes Detected"
          description="This migration contains breaking changes. Export your data before applying."
          icon={<ExclamationCircleOutlined />}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Validation warnings */}
      {validationWarnings.length > 0 && (
        <Alert
          type="error"
          message="Data Validation Warnings"
          description={
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {validationWarnings.map((warning, i) => (
                <li key={i}>
                  <strong>{warning.field}</strong>: {warning.message}
                  {warning.samples && warning.samples.length > 0 && (
                    <Text type="secondary" style={{ marginLeft: 8 }}>
                      (e.g., {warning.samples.slice(0, 3).map(String).join(', ')})
                    </Text>
                  )}
                </li>
              ))}
            </ul>
          }
          icon={<WarningOutlined />}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Breaking changes */}
      {changes.breaking.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#cf1322', fontSize: 13 }}>
            Breaking Changes ({changes.breaking.length})
          </h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {changes.breaking.map((change, i) => (
              <ChangeTag key={i} change={change} color="red" />
            ))}
          </div>
        </div>
      )}

      {/* Non-breaking changes */}
      {changes.nonBreaking.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#389e0d', fontSize: 13 }}>
            Non-Breaking Changes ({changes.nonBreaking.length})
          </h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {changes.nonBreaking.map((change, i) => (
              <ChangeTag key={i} change={change} color="green" />
            ))}
          </div>
        </div>
      )}

      {/* Unclassified changes */}
      {changes.unclassified.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#d46b08', fontSize: 13 }}>
            Unclassified Changes ({changes.unclassified.length})
          </h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {changes.unclassified.map((change, i) => (
              <ChangeTag key={i} change={change} color="orange" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
