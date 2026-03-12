import React, { useState } from 'react';
import { Alert, Button, Col, Empty, Row, Space, Switch, Spin } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { Widget } from '../types';
import { useTeamWidgets } from '../hooks/useTeamWidgets';
import { WidgetCard } from '../components/WidgetCard';
import { WidgetEditor } from '../components/WidgetEditor';

interface Props {
  team: string;
  pageId?: string | null;
}

interface SortableItemProps {
  widget: Widget;
  editMode: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function SortableWidgetCard({ widget, editMode, onEdit, onDelete }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id });

  const style: React.CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0) scaleX(${transform.scaleX ?? 1}) scaleY(${transform.scaleY ?? 1})`
      : undefined,
    transition,
  };

  return (
    <Col ref={setNodeRef} span={widget.colSpan ?? 12} style={style}>
      <WidgetCard
        widget={widget}
        editMode={editMode}
        onEdit={onEdit}
        onDelete={onDelete}
        dragHandleProps={editMode ? { ...attributes, ...listeners } : undefined}
        isDragging={isDragging}
      />
    </Col>
  );
}

export function TeamWidgets({ team, pageId }: Props) {
  const { widgets, loading, error, addWidget, updateWidget, removeWidget, reorder } = useTeamWidgets(team, pageId);
  const [editMode, setEditMode] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingWidget, setEditingWidget] = useState<Widget | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const openAdd = () => {
    setEditingWidget(null);
    setEditorOpen(true);
  };

  const openEdit = (w: Widget) => {
    setEditingWidget(w);
    setEditorOpen(true);
  };

  const handleSave = async (values: Omit<Widget, 'id'> & { id?: string; description?: string }) => {
    if (values.id) {
      await updateWidget(values.id, values);
    } else {
      await addWidget(values);
    }
    setEditorOpen(false);
    setEditingWidget(null);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const oldIndex = widgets.findIndex(w => w.id === active.id);
    const newIndex = widgets.findIndex(w => w.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = [...widgets];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    reorder(reordered.map(w => w.id));
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
        <Spin />
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        type="error"
        message="Failed to load widgets"
        description={error}
        showIcon
        style={{ marginTop: 24 }}
        action={
          <Button size="small" onClick={() => window.location.reload()}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Space>
          {editMode && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
              Add Widget
            </Button>
          )}
          <Switch
            checked={editMode}
            onChange={setEditMode}
            checkedChildren="Editing"
            unCheckedChildren="Edit"
          />
        </Space>
      </div>

      {widgets.length === 0 ? (
        <Empty
          description={
            editMode
              ? 'Click "Add Widget" to create your first chart or table.'
              : 'No custom widgets yet. Toggle Edit to get started.'
          }
          style={{ marginTop: 40 }}
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={widgets.map(w => w.id)}
            strategy={rectSortingStrategy}
          >
            <Row gutter={[16, 16]}>
              {widgets.map(widget => (
                <SortableWidgetCard
                  key={widget.id}
                  widget={widget}
                  editMode={editMode}
                  onEdit={() => openEdit(widget)}
                  onDelete={() => removeWidget(widget.id)}
                />
              ))}
            </Row>
          </SortableContext>
        </DndContext>
      )}

      <WidgetEditor
        open={editorOpen}
        initial={editingWidget ?? undefined}
        onSave={handleSave}
        onCancel={() => {
          setEditorOpen(false);
          setEditingWidget(null);
        }}
      />
    </div>
  );
}
