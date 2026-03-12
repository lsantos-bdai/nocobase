import React, { useEffect, useState } from 'react';
import { Button, Card, Form, Input, Select, Spin, Typography, message, Divider, Alert } from 'antd';
import { useAPIClient } from '@nocobase/client';
import { useTeamCollectors } from '../hooks/useTeamCollectors';
import { TEAMS } from '../teams';

const { Title, Text } = Typography;

// ── BigQuery Connection Settings ──

interface BqSettings {
  projectId: string;
  dataset: string;
  table: string;
  location: string;
  accessToken: string;
}

function BigQuerySettings() {
  const api = useAPIClient();
  const [form] = Form.useForm<BqSettings>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    api.request({ url: 'raiDashboardSettings:get' })
      .then((res) => {
        const data = res.data?.data ?? {};
        form.setFieldsValue({
          projectId: data.projectId || '',
          dataset: data.dataset || '',
          table: data.table || 'sessions',
          location: data.location || 'us-central1',
          accessToken: '',
        });
        setHasToken(!!data.accessToken);
      })
      .catch(() => message.error('Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await api.request({
        url: 'raiDashboardSettings:update',
        method: 'POST',
        data: { values },
      });
      if (values.accessToken) {
        setHasToken(true);
        form.setFieldValue('accessToken', '');
      }
      message.success('BigQuery settings saved');
    } catch {
      message.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spin />;

  return (
    <Card
      title="BigQuery Connection"
      style={{ marginBottom: 24 }}
      extra={
        <Button type="primary" loading={saving} onClick={handleSave}>
          Save
        </Button>
      }
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Access token"
        description={
          <>
            Store your token as a secret in{' '}
            <Text strong>Settings &gt; Variables and secrets</Text> (e.g.{' '}
            <Text code>GCP_ACCESS_TOKEN</Text>), then reference it here as{' '}
            <Text code>{'{{$env.GCP_ACCESS_TOKEN}}'}</Text>.
            Or paste a raw <Text code>gcloud auth print-access-token</Text> value directly.
          </>
        }
      />
      <Form form={form} layout="vertical">
        <Form.Item
          name="projectId"
          label="GCP Project ID"
          rules={[{ required: true, message: 'Required' }]}
        >
          <Input placeholder="my-gcp-project" />
        </Form.Item>
        <Form.Item
          name="dataset"
          label="BigQuery Dataset"
          rules={[{ required: true, message: 'Required' }]}
        >
          <Input placeholder="my_dataset" />
        </Form.Item>
        <Form.Item name="table" label="BigQuery Table">
          <Input placeholder="sessions" />
        </Form.Item>
        <Form.Item name="location" label="BigQuery Location">
          <Input placeholder="us-central1" />
        </Form.Item>
        <Form.Item
          name="accessToken"
          label={
            <>
              Access Token
              {hasToken && (
                <Text type="secondary" style={{ marginLeft: 8, fontWeight: 'normal' }}>
                  (configured — leave blank to keep current)
                </Text>
              )}
            </>
          }
        >
          <Input.TextArea
            rows={2}
            placeholder={hasToken ? '' : '{{$env.GCP_ACCESS_TOKEN}} or paste token directly'}
          />
        </Form.Item>
      </Form>
    </Card>
  );
}

// ── Team Collector Assignment (existing) ──

interface AllCollectors {
  collectors: string[];
  loading: boolean;
}

function useAllCollectors(): AllCollectors {
  const api = useAPIClient();
  const [collectors, setCollectors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.request({ url: 'rai-dashboard:filterOptions' })
      .then(res => {
        const d = res.data?.data ?? {};
        setCollectors(d.collectors ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { collectors, loading };
}

function TeamCollectorRow({
  team,
  teamLabel,
  allCollectors,
}: {
  team: string;
  teamLabel: string;
  allCollectors: string[];
}) {
  const { collectors, loading, setTeamCollectors } = useTeamCollectors(team);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);

  const current = draft ?? collectors;

  const handleSave = async () => {
    setSaving(true);
    try {
      await setTeamCollectors(current);
      setDraft(null);
      message.success(`Saved collectors for ${teamLabel}`);
    } catch {
      message.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title={teamLabel}
      size="small"
      style={{ marginBottom: 16 }}
      extra={
        <Button
          type="primary"
          size="small"
          loading={saving}
          onClick={handleSave}
          disabled={draft === null}
        >
          Save
        </Button>
      }
    >
      {loading ? (
        <Spin size="small" />
      ) : (
        <Select
          mode="multiple"
          allowClear
          style={{ width: '100%' }}
          placeholder="No collectors assigned (shows all)"
          value={current}
          onChange={vals => setDraft(vals)}
          options={allCollectors.map(c => ({ label: c, value: c }))}
          showSearch
        />
      )}
    </Card>
  );
}

// ── Main Admin Page ──

export function AdminPage() {
  const { collectors: allCollectors, loading: globalLoading } = useAllCollectors();

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <Title level={3}>Page Analytics Settings</Title>

      <BigQuerySettings />

      <Divider />

      <Title level={4}>Team Collector Assignment</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
        Assign collectors to teams. When collectors are assigned, the team dashboard
        will be pre-filtered to only show data from those collectors.
      </Text>

      {globalLoading ? (
        <Spin />
      ) : (
        TEAMS.map(t => (
          <TeamCollectorRow
            key={t.key}
            team={t.key}
            teamLabel={t.label}
            allCollectors={allCollectors}
          />
        ))
      )}
    </div>
  );
}
