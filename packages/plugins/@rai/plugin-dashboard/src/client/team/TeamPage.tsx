import React, { useState, useMemo } from 'react';
import { Button, Dropdown, Input, Modal, Space, Spin, Typography } from 'antd';
import { EditOutlined, SaveOutlined, CloseOutlined, MoreOutlined, DeleteOutlined } from '@ant-design/icons';
import MarkdownIt from 'markdown-it';
import { useTeamPages } from '../hooks/useTeamPages';
import { TeamWidgets } from './TeamWidgets';

const { TextArea } = Input;

interface Props {
  team: string;
  pageId: string;
  removePage?: (id: string) => Promise<void>;
  onDelete?: () => void;
}

export function TeamPage({ team, pageId, removePage, onDelete }: Props) {
  const md = useMemo(() => new MarkdownIt({ linkify: true, typographer: true }), []);
  const { pages, loading, updatePage } = useTeamPages(team);
  const [editingContent, setEditingContent] = useState(false);
  const [draftContent, setDraftContent] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const page = pages.find(p => p.id === pageId);

  const startEditContent = () => {
    setDraftContent(page?.content ?? '');
    setEditingContent(true);
  };

  const saveContent = async () => {
    if (!page) return;
    setSaving(true);
    try {
      await updatePage(pageId, { content: draftContent });
      setEditingContent(false);
    } finally {
      setSaving(false);
    }
  };

  const startEditTitle = () => {
    setDraftTitle(page?.title ?? '');
    setEditingTitle(true);
  };

  const saveTitle = async () => {
    if (!page || !draftTitle.trim()) return;
    setSaving(true);
    try {
      await updatePage(pageId, { title: draftTitle.trim() });
      setEditingTitle(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!removePage) return;
    setDeleting(true);
    try {
      await removePage(pageId);
      setDeleteModal(false);
      onDelete?.();
    } finally {
      setDeleting(false);
    }
  };

  const menuItems = [
    {
      key: 'delete',
      label: 'Delete page',
      icon: <DeleteOutlined />,
      danger: true,
      onClick: () => setDeleteModal(true),
    },
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
        <Spin />
      </div>
    );
  }

  if (!page) {
    return <Typography.Text type="secondary">Page not found.</Typography.Text>;
  }

  return (
    <div>
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        {editingTitle ? (
          <>
            <Input
              value={draftTitle}
              onChange={e => setDraftTitle(e.target.value)}
              onPressEnter={saveTitle}
              style={{ maxWidth: 400, fontSize: 20, fontWeight: 600 }}
              autoFocus
            />
            <Button
              type="primary"
              size="small"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={saveTitle}
              disabled={!draftTitle.trim()}
            >
              Save
            </Button>
            <Button size="small" icon={<CloseOutlined />} onClick={() => setEditingTitle(false)} />
          </>
        ) : (
          <>
            <Typography.Title level={3} style={{ margin: 0 }}>{page.title}</Typography.Title>
            <Button size="small" icon={<EditOutlined />} type="text" onClick={startEditTitle} />
            <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
              <Button size="small" icon={<MoreOutlined />} type="text" />
            </Dropdown>
          </>
        )}
      </div>

      {/* Markdown content block */}
      <div
        style={{
          background: '#fafafa',
          border: '1px solid #f0f0f0',
          borderRadius: 8,
          padding: 16,
          marginBottom: 24,
          minHeight: 60,
        }}
      >
        {editingContent ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <TextArea
              value={draftContent}
              onChange={e => setDraftContent(e.target.value)}
              rows={8}
              placeholder="Write markdown here..."
              autoFocus
            />
            <Space>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={saving}
                onClick={saveContent}
              >
                Save
              </Button>
              <Button icon={<CloseOutlined />} onClick={() => setEditingContent(false)}>
                Cancel
              </Button>
            </Space>
          </Space>
        ) : (
          <div style={{ position: 'relative' }}>
            {page.content ? (
              <div
                className="markdown-body"
                dangerouslySetInnerHTML={{ __html: md.render(page.content) }}
              />
            ) : (
              <Typography.Text type="secondary" style={{ fontStyle: 'italic' }}>
                No description yet. Click edit to add markdown content.
              </Typography.Text>
            )}
            <Button
              size="small"
              icon={<EditOutlined />}
              type="text"
              style={{ position: 'absolute', top: 0, right: 0 }}
              onClick={startEditContent}
            />
          </div>
        )}
      </div>

      {/* Widget canvas scoped to this page */}
      <TeamWidgets team={team} pageId={pageId} />

      <Modal
        title="Delete page"
        open={deleteModal}
        onCancel={() => setDeleteModal(false)}
        onOk={handleDelete}
        okText="Delete"
        okButtonProps={{ danger: true, loading: deleting }}
        destroyOnClose
      >
        <Typography.Text>
          Are you sure you want to delete <strong>{page.title}</strong>? This will also remove all widgets on this page.
        </Typography.Text>
      </Modal>
    </div>
  );
}
