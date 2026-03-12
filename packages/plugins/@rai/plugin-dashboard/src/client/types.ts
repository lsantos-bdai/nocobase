export type WidgetType = 'stat' | 'timeseries' | 'breakdown' | 'table' | 'pie' | 'markdown';

export interface Widget {
  id: string;
  title: string;
  description?: string;
  type: WidgetType;
  sql: string;
  content?: string;
  colSpan?: 8 | 12 | 24;
  valueColumn?: string;
  xColumn?: string;
  yColumn?: string;
  categoryColumn?: string;
}
