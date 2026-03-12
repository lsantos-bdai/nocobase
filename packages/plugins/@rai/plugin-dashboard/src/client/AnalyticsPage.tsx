import React, { useState, useRef } from 'react';
import { Layout, Menu, Input, Modal } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { AnalyticsDashboard } from './analytics/AnalyticsDashboard';
import { TeamDashboard } from './team/TeamDashboard';
import { TeamWidgets } from './team/TeamWidgets';
import { TeamPage } from './team/TeamPage';
import { AnalyticsFilters, thisMonthRange } from './analytics/types';
import { useTeamPages } from './hooks/useTeamPages';
import { TEAMS } from './teams';

const { Sider, Content } = Layout;

function buildMenuItems(teamPageMap: Record<string, { id: string; title: string }[]>) {
  const overall = { key: 'overall', label: 'Overall' };

  const teamGroups = TEAMS.map(t => ({
    key: `grp:${t.key}`,
    label: t.label,
    children: [
      { key: `${t.key}:overview`, label: 'Overview' },
      { key: `${t.key}:widgets`, label: 'Custom Widgets' },
      ...(teamPageMap[t.key] ?? []).map(p => ({
        key: `${t.key}:page:${p.id}`,
        label: p.title,
      })),
      {
        key: `${t.key}:add-page`,
        label: (
          <span style={{ color: '#1677ff', fontSize: 12 }}>
            <PlusOutlined /> Add page
          </span>
        ),
      },
    ],
  }));

  return [overall, ...teamGroups];
}

export function AnalyticsPage() {
  const [selectedKey, setSelectedKey] = useState('overall');
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const [teamFilters, setTeamFilters] = useState<Record<string, AnalyticsFilters>>({});
  const [addPageTeam, setAddPageTeam] = useState<string | null>(null);
  const [newPageTitle, setNewPageTitle] = useState('');
  const [addPageLoading, setAddPageLoading] = useState(false);
  const [teamPageMap, setTeamPageMap] = useState<Record<string, { id: string; title: string }[]>>({});

  // Each TeamPageLoader registers its addPage/removePage functions here so the modal can call it
  const addPageFnRef = useRef<Record<string, (values: { title: string }) => Promise<any>>>({});
  const removePageFnRef = useRef<Record<string, (id: string) => Promise<void>>>({});

  const getFilters = (team: string): AnalyticsFilters =>
    teamFilters[team] ?? { ...thisMonthRange() };

  const setFilters = (team: string, f: AnalyticsFilters) =>
    setTeamFilters(prev => ({ ...prev, [team]: f }));

  const handleMenuClick = ({ key }: { key: string }) => {
    if (key.endsWith(':add-page')) {
      const team = key.replace(':add-page', '');
      setAddPageTeam(team);
      setNewPageTitle('');
      return;
    }
    setSelectedKey(key);
  };

  const parseKey = (key: string) => {
    if (key === 'overall') return { type: 'overall' as const };
    const parts = key.split(':');
    if (parts.length === 2) {
      const [team, view] = parts;
      return { type: view as 'overview' | 'widgets', team };
    }
    if (parts.length === 3 && parts[1] === 'page') {
      return { type: 'page' as const, team: parts[0], pageId: parts[2] };
    }
    return { type: 'overall' as const };
  };

  const parsed = parseKey(selectedKey);

  const handleCreatePage = async () => {
    if (!addPageTeam || !newPageTitle.trim()) return;
    const fn = addPageFnRef.current[addPageTeam];
    if (!fn) return;
    setAddPageLoading(true);
    try {
      const created = await fn({ title: newPageTitle.trim() });
      setAddPageTeam(null);
      if (created?.id) {
        setSelectedKey(`${addPageTeam}:page:${created.id}`);
      }
    } finally {
      setAddPageLoading(false);
    }
  };

  return (
    <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
      <Sider
        width={220}
        style={{ background: '#fff', borderRight: '1px solid #f0f0f0' }}
        breakpoint="lg"
        collapsedWidth={0}
      >
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          openKeys={openKeys}
          onOpenChange={setOpenKeys}
          style={{ height: '100%', borderRight: 0, paddingTop: 16 }}
          items={buildMenuItems(teamPageMap)}
          onClick={handleMenuClick}
        />

        {TEAMS.map(t => (
          <TeamPageLoader
            key={t.key}
            team={t.key}
            onPages={pages => setTeamPageMap(prev => ({ ...prev, [t.key]: pages }))}
            onRegisterAddPage={fn => { addPageFnRef.current[t.key] = fn; }}
            onRegisterRemovePage={fn => { removePageFnRef.current[t.key] = fn; }}
          />
        ))}
      </Sider>

      <Content style={{ padding: 24 }}>
        {parsed.type === 'overall' && <AnalyticsDashboard />}

        {parsed.type === 'overview' && parsed.team && (
          <TeamDashboard
            team={parsed.team}
            filters={getFilters(parsed.team)}
            onFiltersChange={f => setFilters(parsed.team!, f)}
          />
        )}

        {parsed.type === 'widgets' && parsed.team && (
          <TeamWidgets team={parsed.team} pageId={null} />
        )}

        {parsed.type === 'page' && parsed.team && parsed.pageId && (
          <TeamPage
            team={parsed.team}
            pageId={parsed.pageId}
            removePage={removePageFnRef.current[parsed.team]}
            onDelete={() => setSelectedKey(`${parsed.team}:overview`)}
          />
        )}
      </Content>

      <Modal
        title="New Page"
        open={!!addPageTeam}
        onCancel={() => setAddPageTeam(null)}
        onOk={handleCreatePage}
        okButtonProps={{ disabled: !newPageTitle.trim(), loading: addPageLoading }}
        destroyOnClose
      >
        <Input
          placeholder="Page title"
          value={newPageTitle}
          onChange={e => setNewPageTitle(e.target.value)}
          onPressEnter={handleCreatePage}
          autoFocus
        />
      </Modal>
    </Layout>
  );
}

function TeamPageLoader({
  team,
  onPages,
  onRegisterAddPage,
  onRegisterRemovePage,
}: {
  team: string;
  onPages: (pages: { id: string; title: string }[]) => void;
  onRegisterAddPage: (fn: (values: { title: string }) => Promise<any>) => void;
  onRegisterRemovePage: (fn: (id: string) => Promise<void>) => void;
}) {
  const { pages, addPage, removePage } = useTeamPages(team);

  React.useEffect(() => {
    onPages(pages.map(p => ({ id: p.id, title: p.title })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages]);

  React.useEffect(() => {
    onRegisterAddPage(addPage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addPage]);

  React.useEffect(() => {
    onRegisterRemovePage(removePage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [removePage]);

  return null;
}
