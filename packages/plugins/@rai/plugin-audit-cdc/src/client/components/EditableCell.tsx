import React, { useState, useRef, useEffect } from 'react';
import { InputNumber, Checkbox, Space, Spin } from 'antd';

interface EditableCellProps {
  value: number | null;
  nullLabel: string;
  onChange: (value: number | null) => Promise<void>;
  min?: number;
  max?: number;
}

export const EditableCell: React.FC<EditableCellProps> = ({
  value,
  nullLabel,
  onChange,
  min = 1,
  max = 9999,
}) => {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState<number | null>(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  const handleSave = async () => {
    if (localValue === value) {
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      await onChange(localValue);
      setEditing(false);
    } catch (err) {
      setLocalValue(value);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setLocalValue(value);
      setEditing(false);
    }
  };

  const handleCheckboxChange = async (checked: boolean) => {
    const newValue = checked ? null : min;
    setLocalValue(newValue);
    setSaving(true);
    try {
      await onChange(newValue);
      setEditing(false);
    } catch (err) {
      setLocalValue(value);
    } finally {
      setSaving(false);
    }
  };

  if (saving) {
    return <Spin size="small" />;
  }

  if (!editing) {
    return (
      <span
        onClick={() => setEditing(true)}
        style={{
          cursor: 'pointer',
          padding: '4px 8px',
          borderRadius: 4,
          display: 'inline-block',
          minWidth: 60,
        }}
        onMouseEnter={(e) => {
          (e.target as HTMLElement).style.background = '#f5f5f5';
        }}
        onMouseLeave={(e) => {
          (e.target as HTMLElement).style.background = 'transparent';
        }}
      >
        {value === null ? nullLabel : value}
      </span>
    );
  }

  return (
    <Space direction="vertical" size={4}>
      <InputNumber
        ref={inputRef as any}
        value={localValue}
        onChange={(v) => setLocalValue(v)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        min={min}
        max={max}
        disabled={localValue === null}
        style={{ width: 80 }}
        size="small"
      />
      <Checkbox checked={localValue === null} onChange={(e) => handleCheckboxChange(e.target.checked)}>
        {nullLabel}
      </Checkbox>
    </Space>
  );
};

export default EditableCell;
