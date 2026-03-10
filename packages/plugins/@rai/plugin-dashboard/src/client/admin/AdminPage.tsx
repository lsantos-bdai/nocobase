import React, { useEffect, useState } from 'react';
import { Button, Card, Select, Spin, Typography, message } from 'antd';
import { useAPIClient } from '@nocobase/client';
import { useTeamCollectors } from '../hooks/useTeamCollectors';
import { TEAMS } from '../teams';

const { Title, Text } = Typography;

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

export function AdminPage() {
  const { collectors: allCollectors, loading: globalLoading } = useAllCollectors();

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <Title level={3}>Page Analytics Settings</Title>
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
