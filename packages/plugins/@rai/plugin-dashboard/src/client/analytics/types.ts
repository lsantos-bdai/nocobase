export interface AnalyticsFilters {
  collector?: string;
  collectors?: string[];
  robot_id?: string;
  data_type?: string;
  dateFrom: string;
  dateTo: string;
}

export function thisMonthRange(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const dateFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const dateTo = now.toISOString().slice(0, 10);
  return { dateFrom, dateTo };
}

export function filterParams(f: AnalyticsFilters): Record<string, string> {
  const p: Record<string, string> = {};
  if (f.collectors && f.collectors.length > 0) {
    p['filter[collectors]'] = JSON.stringify(f.collectors);
  } else if (f.collector) {
    p['filter[collector]'] = f.collector;
  }
  if (f.robot_id) p['filter[robot_id]'] = f.robot_id;
  if (f.data_type) p['filter[data_type]'] = f.data_type;
  if (f.dateFrom) p['filter[date_from]'] = f.dateFrom;
  if (f.dateTo) p['filter[date_to]'] = f.dateTo;
  return p;
}
