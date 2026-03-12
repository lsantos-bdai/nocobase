import React, { useMemo } from 'react';
import { Empty } from 'antd';
import MarkdownIt from 'markdown-it';
import { Widget } from '../../types';

interface Props {
  widget: Widget;
}

export function MarkdownWidget({ widget }: Props) {
  const md = useMemo(() => new MarkdownIt({ linkify: true, typographer: true }), []);

  if (!widget.content?.trim()) {
    return <Empty description="No content" imageStyle={{ height: 32 }} />;
  }

  return (
    <div
      className="markdown-body"
      dangerouslySetInnerHTML={{ __html: md.render(widget.content) }}
    />
  );
}
