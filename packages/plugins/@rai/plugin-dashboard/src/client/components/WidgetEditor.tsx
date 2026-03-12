import React, { useState } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  Button,
  Alert,
  Table,
  Collapse,
  Space,
} from 'antd';
import { useAPIClient } from '@nocobase/client';
import { Widget, WidgetType } from '../types';
import { StatWidget } from './widgets/StatWidget';
import { TimeseriesWidget } from './widgets/TimeseriesWidget';
import { BreakdownWidget } from './widgets/BreakdownWidget';
import { TableWidget } from './widgets/TableWidget';
import { PieWidget } from './widgets/PieWidget';

const { TextArea } = Input;

const T = `\`\${GCP_PROJECT_ID}.\${BQ_DATASET}.\${BQ_TABLE}\``;

const SQL_TEMPLATES: { label: string; type: WidgetType; sql: string }[] = [
  {
    label: 'Sessions over time (timeseries)',
    type: 'timeseries',
    sql: `SELECT DATE(upload_time) AS upload_date, COUNT(*) AS session_count\nFROM ${T}\nGROUP BY upload_date\nORDER BY upload_date ASC\nLIMIT 365`,
  },
  {
    label: 'Sessions by collector (breakdown)',
    type: 'breakdown',
    sql: `SELECT COALESCE(collector, '(unknown)') AS collector, COUNT(*) AS session_count\nFROM ${T}\nGROUP BY collector\nORDER BY session_count DESC\nLIMIT 30`,
  },
  {
    label: 'Sessions by data type (pie)',
    type: 'pie',
    sql: `SELECT COALESCE(data_type, '(unknown)') AS data_type, COUNT(*) AS session_count\nFROM ${T}\nGROUP BY data_type\nORDER BY session_count DESC\nLIMIT 20`,
  },
  {
    label: 'Total GB uploaded (stat)',
    type: 'stat',
    sql: `SELECT ROUND(SUM(data_size) / 1073741824.0, 2) AS total_gb\nFROM ${T}`,
  },
  {
    label: 'Recent sessions (table)',
    type: 'table',
    sql: `SELECT session_id, collector, robot_id, data_type,\n  ROUND(data_size / 1073741824.0, 3) AS size_gb, upload_time\nFROM ${T}\nORDER BY upload_time DESC\nLIMIT 50`,
  },
];

function extractParams(sql: string): string[] {
  const matches = sql.matchAll(/\{\{(\w+)\}\}/g);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const m of matches) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      result.push(m[1]);
    }
  }
  return result;
}

function buildPreviewWidget(values: any): Widget {
  return {
    id: '__preview__',
    title: values.title || 'Preview',
    type: values.type ?? 'table',
    sql: values.sql ?? '',
    colSpan: values.colSpan ?? 12,
    xColumn: values.xColumn || undefined,
    yColumn: values.yColumn || undefined,
    categoryColumn: values.categoryColumn || undefined,
    valueColumn: values.valueColumn || undefined,
  };
}

interface Props {
  open: boolean;
  initial?: Partial<Widget & { description?: string }>;
  onSave: (widget: Omit<Widget, 'id'> & { id?: string; description?: string }) => void;
  onCancel: () => void;
}

export function WidgetEditor({ open, initial, onSave, onCancel }: Props) {
  const api = useAPIClient();
  const [form] = Form.useForm();

  // 5-row preview for the table
  const [preview, setPreview] = useState<{ columns: string[]; rows: any[] } | null>(null);
  // Full rows for the live chart preview
  const [previewAllRows, setPreviewAllRows] = useState<Record<string, any>[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // Collapse active keys — auto-open after preview
  const [collapseKeys, setCollapseKeys] = useState<string[]>([]);

  // Watch fields for live chart preview
  const watchedSql = Form.useWatch('sql', form) ?? '';
  const watchedType = Form.useWatch('type', form) ?? 'table';
  const watchedXColumn = Form.useWatch('xColumn', form);
  const watchedYColumn = Form.useWatch('yColumn', form);
  const watchedCategoryColumn = Form.useWatch('categoryColumn', form);
  const watchedValueColumn = Form.useWatch('valueColumn', form);

  const isMarkdown = watchedType === 'markdown';

  const detectedParams = extractParams(watchedSql);

  const handlePreview = async () => {
    const sql = form.getFieldValue('sql');
    if (!sql?.trim()) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await api.request({ url: 'rai-dashboard:query', method: 'POST', data: { sql } });
      const rows: Record<string, any>[] = res.data?.data ?? [];
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      setPreview({ columns, rows: rows.slice(0, 5) });
      setPreviewAllRows(rows);
      // Auto-populate column selects if not already set
      if (columns.length > 0) {
        form.setFieldsValue({
          xColumn: form.getFieldValue('xColumn') || columns[0],
          yColumn: form.getFieldValue('yColumn') || (columns[1] ?? ''),
          categoryColumn: form.getFieldValue('categoryColumn') || columns[0],
          valueColumn: form.getFieldValue('valueColumn') || (columns[1] ?? columns[0]),
        });
      }
      // Auto-open column mapping section
      setCollapseKeys(['cols']);
    } catch (err: any) {
      setPreviewError(err.response?.data?.error ?? err.message ?? 'Query failed');
      setPreview(null);
      setPreviewAllRows(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleOk = () => {
    form.validateFields().then(values => {
      const clean: any = { ...values };
      if (clean.type === 'markdown') {
        // markdown widgets don't use SQL or column mappings
        clean.sql = '';
        ['xColumn', 'yColumn', 'categoryColumn', 'valueColumn'].forEach(k => delete clean[k]);
      } else {
        ['xColumn', 'yColumn', 'categoryColumn', 'valueColumn'].forEach(k => {
          if (!clean[k]) delete clean[k];
        });
        delete clean.content;
      }
      if (!clean.description) delete clean.description;
      onSave({ ...initial, ...clean });
      form.resetFields();
      setPreview(null);
      setPreviewAllRows(null);
      setCollapseKeys([]);
    });
  };

  const handleCancel = () => {
    form.resetFields();
    setPreview(null);
    setPreviewAllRows(null);
    setCollapseKeys([]);
    onCancel();
  };

  const previewColumns =
    preview?.columns.map(c => ({
      title: c,
      dataIndex: c,
      key: c,
      render: (v: any) => {
        const val = v?.value ?? v;
        return val === null || val === undefined ? '-' : String(val);
      },
    })) ?? [];

  const detectedColumns = preview?.columns ?? [];
  const colOptions = detectedColumns.map(c => ({ label: c, value: c }));

  // Build a mock widget from current form values for live chart preview
  const liveWidget: Widget | null = previewAllRows
    ? buildPreviewWidget({
        title: form.getFieldValue('title'),
        type: watchedType,
        sql: watchedSql,
        colSpan: form.getFieldValue('colSpan'),
        xColumn: watchedXColumn,
        yColumn: watchedYColumn,
        categoryColumn: watchedCategoryColumn,
        valueColumn: watchedValueColumn,
      })
    : null;

  const renderLivePreview = () => {
    if (!liveWidget || !previewAllRows) return null;
    const commonProps = { data: previewAllRows, widget: liveWidget };
    switch (liveWidget.type) {
      case 'stat':        return <StatWidget {...commonProps} />;
      case 'timeseries':  return <TimeseriesWidget {...commonProps} />;
      case 'breakdown':   return <BreakdownWidget {...commonProps} />;
      case 'pie':         return <PieWidget {...commonProps} />;
      case 'table':       return <TableWidget {...commonProps} />;
      default:            return null;
    }
  };

  return (
    <Modal
      title={initial?.id ? 'Edit Widget' : 'Add Widget'}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      width={760}
      okText="Save"
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          title: initial?.title ?? '',
          description: initial?.description ?? '',
          type: (initial?.type ?? 'table') as WidgetType,
          sql: initial?.sql ?? '',
          colSpan: initial?.colSpan ?? 12,
          xColumn: initial?.xColumn ?? '',
          yColumn: initial?.yColumn ?? '',
          categoryColumn: initial?.categoryColumn ?? '',
          valueColumn: initial?.valueColumn ?? '',
        }}
      >
        <Form.Item name="title" label="Title" rules={[{ required: true, message: 'Required' }]}>
          <Input placeholder="Widget title" />
        </Form.Item>

        <Form.Item name="description" label="Description">
          <TextArea rows={2} placeholder="Optional description" />
        </Form.Item>

        <Space style={{ width: '100%' }} size={16}>
          <Form.Item name="type" label="Type" rules={[{ required: true }]} style={{ flex: 1 }}>
            <Select
              options={[
                { label: 'Stat (single value)', value: 'stat' },
                { label: 'Time-series (line chart)', value: 'timeseries' },
                { label: 'Breakdown (bar chart)', value: 'breakdown' },
                { label: 'Pie chart', value: 'pie' },
                { label: 'Table (row data)', value: 'table' },
                { label: 'Markdown (text / notes)', value: 'markdown' },
              ]}
            />
          </Form.Item>
          <Form.Item name="colSpan" label="Width" style={{ flex: 1 }}>
            <Select
              options={[
                { label: 'One-third page', value: 8 },
                { label: 'Half page', value: 12 },
                { label: 'Full page', value: 24 },
              ]}
            />
          </Form.Item>
        </Space>

        {isMarkdown ? (
          <Form.Item name="content" label="Content (Markdown)">
            <TextArea rows={10} placeholder="Write markdown here..." />
          </Form.Item>
        ) : (
          <>
            <Form.Item label="SQL Query">
              <Select
                placeholder="Load a template..."
                style={{ width: 280, marginBottom: 6 }}
                size="small"
                allowClear
                onChange={(val: string) => {
                  const tpl = SQL_TEMPLATES.find(t => t.label === val);
                  if (tpl) {
                    form.setFieldsValue({ sql: tpl.sql, type: tpl.type });
                  }
                }}
                options={SQL_TEMPLATES.map(t => ({ label: t.label, value: t.label }))}
              />
              <Form.Item name="sql" noStyle rules={[{ required: true, message: 'Required' }]}>
                <TextArea
                  rows={8}
                  placeholder="SELECT ..."
                  style={{ fontFamily: 'monospace', fontSize: 13 }}
                />
              </Form.Item>
            </Form.Item>

            {detectedParams.length > 0 && (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 8 }}
                message={
                  <>
                    Parameter placeholders detected:{' '}
                    {detectedParams.map(p => (
                      <code key={p} style={{ marginRight: 6 }}>{`{{${p}}}`}</code>
                    ))}
                    <br />
                    Runtime substitution will be available in a future update.
                  </>
                }
              />
            )}

            <Button onClick={handlePreview} loading={previewLoading} size="small">
              Preview (first 5 rows)
            </Button>

            {previewError && (
              <Alert message={previewError} type="error" style={{ marginTop: 8 }} showIcon />
            )}
            {preview && (
              <Table
                size="small"
                style={{ marginTop: 8 }}
                columns={previewColumns}
                dataSource={preview.rows.map((r, i) => ({ ...r, _key: i }))}
                rowKey="_key"
                pagination={false}
                scroll={{ x: true }}
              />
            )}

            {liveWidget && previewAllRows && (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  border: '1px dashed #d9d9d9',
                  borderRadius: 6,
                  background: '#fafafa',
                }}
              >
                <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>Live preview</div>
                {renderLivePreview()}
              </div>
            )}

            <Collapse
              style={{ marginTop: 12 }}
              size="small"
              activeKey={collapseKeys}
              onChange={keys => setCollapseKeys(keys as string[])}
              items={[
                {
                  key: 'cols',
                  label: 'Column mapping (optional — overrides auto-detection)',
                  children: (
                    <>
                      <Form.Item name="xColumn" label="X-axis column (timeseries)" style={{ marginBottom: 8 }}>
                        {colOptions.length > 0 ? (
                          <Select allowClear options={colOptions} placeholder="default: first column" />
                        ) : (
                          <Input placeholder="e.g. upload_date  — default: first column" />
                        )}
                      </Form.Item>
                      <Form.Item name="yColumn" label="Y-axis column (timeseries)" style={{ marginBottom: 8 }}>
                        {colOptions.length > 0 ? (
                          <Select allowClear options={colOptions} placeholder="default: second column" />
                        ) : (
                          <Input placeholder="e.g. session_count  — default: second column" />
                        )}
                      </Form.Item>
                      <Form.Item name="categoryColumn" label="Category column (breakdown / pie)" style={{ marginBottom: 8 }}>
                        {colOptions.length > 0 ? (
                          <Select allowClear options={colOptions} placeholder="default: first column" />
                        ) : (
                          <Input placeholder="e.g. data_type  — default: first column" />
                        )}
                      </Form.Item>
                      <Form.Item name="valueColumn" label="Value column (stat / breakdown / pie)" style={{ marginBottom: 0 }}>
                        {colOptions.length > 0 ? (
                          <Select allowClear options={colOptions} placeholder="default: first column" />
                        ) : (
                          <Input placeholder="e.g. total  — default: first column" />
                        )}
                      </Form.Item>
                    </>
                  ),
                },
              ]}
            />
          </>
        )}
      </Form>
    </Modal>
  );
}
