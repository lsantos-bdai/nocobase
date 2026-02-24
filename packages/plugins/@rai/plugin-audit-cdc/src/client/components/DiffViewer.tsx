import React from 'react';
import { Typography, Tag, Space, Collapse } from 'antd';

const { Text } = Typography;

interface DiffViewerProps {
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  changedFields?: string[];
  mode?: 'side-by-side' | 'unified';
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  beforeData,
  afterData,
  changedFields = [],
  mode = 'unified',
}) => {
  const allKeys = new Set<string>();
  if (beforeData) Object.keys(beforeData).forEach((k) => allKeys.add(k));
  if (afterData) Object.keys(afterData).forEach((k) => allKeys.add(k));

  const sortedKeys = Array.from(allKeys).sort();

  const formatValue = (value: unknown): string => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }
    return String(value);
  };

  const isChanged = (key: string): boolean => {
    if (changedFields.length > 0) {
      return changedFields.includes(key);
    }
    const before = beforeData?.[key];
    const after = afterData?.[key];
    return JSON.stringify(before) !== JSON.stringify(after);
  };

  const getChangeType = (key: string): 'added' | 'removed' | 'modified' | 'unchanged' => {
    const hasBefore = beforeData && key in beforeData;
    const hasAfter = afterData && key in afterData;

    if (!hasBefore && hasAfter) return 'added';
    if (hasBefore && !hasAfter) return 'removed';
    if (isChanged(key)) return 'modified';
    return 'unchanged';
  };

  const getTagColor = (type: 'added' | 'removed' | 'modified' | 'unchanged'): string => {
    switch (type) {
      case 'added':
        return 'green';
      case 'removed':
        return 'red';
      case 'modified':
        return 'orange';
      default:
        return 'default';
    }
  };

  if (mode === 'side-by-side') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            Before
          </Text>
          <pre
            style={{
              background: '#fafafa',
              padding: 12,
              borderRadius: 4,
              fontSize: 12,
              maxHeight: 400,
              overflow: 'auto',
              margin: 0,
            }}
          >
            {beforeData ? JSON.stringify(beforeData, null, 2) : '(empty)'}
          </pre>
        </div>
        <div>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            After
          </Text>
          <pre
            style={{
              background: '#fafafa',
              padding: 12,
              borderRadius: 4,
              fontSize: 12,
              maxHeight: 400,
              overflow: 'auto',
              margin: 0,
            }}
          >
            {afterData ? JSON.stringify(afterData, null, 2) : '(empty)'}
          </pre>
        </div>
      </div>
    );
  }

  // Unified view
  return (
    <div style={{ fontSize: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#fafafa' }}>
            <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>
              Field
            </th>
            <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>
              Before
            </th>
            <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>
              After
            </th>
            <th
              style={{
                padding: '8px 12px',
                textAlign: 'center',
                borderBottom: '1px solid #e8e8e8',
                width: 80,
              }}
            >
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedKeys.map((key) => {
            const changeType = getChangeType(key);
            const before = beforeData?.[key];
            const after = afterData?.[key];

            return (
              <tr
                key={key}
                style={{
                  background:
                    changeType !== 'unchanged'
                      ? changeType === 'added'
                        ? '#f6ffed'
                        : changeType === 'removed'
                          ? '#fff1f0'
                          : '#fffbe6'
                      : undefined,
                }}
              >
                <td
                  style={{
                    padding: '6px 12px',
                    borderBottom: '1px solid #f0f0f0',
                    fontWeight: changeType !== 'unchanged' ? 500 : 400,
                  }}
                >
                  {key}
                </td>
                <td
                  style={{
                    padding: '6px 12px',
                    borderBottom: '1px solid #f0f0f0',
                    fontFamily: 'monospace',
                    maxWidth: 200,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={formatValue(before)}
                >
                  {formatValue(before)}
                </td>
                <td
                  style={{
                    padding: '6px 12px',
                    borderBottom: '1px solid #f0f0f0',
                    fontFamily: 'monospace',
                    maxWidth: 200,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={formatValue(after)}
                >
                  {formatValue(after)}
                </td>
                <td
                  style={{ padding: '6px 12px', borderBottom: '1px solid #f0f0f0', textAlign: 'center' }}
                >
                  {changeType !== 'unchanged' && (
                    <Tag color={getTagColor(changeType)} style={{ margin: 0 }}>
                      {changeType}
                    </Tag>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default DiffViewer;
