import { useState, useEffect, useCallback } from 'react';
import { useAPIClient } from '@nocobase/client';
import { AnalyticsFilters, filterParams } from './types';

export function useAnalyticsAction<T>(
  action: string,
  filters: AnalyticsFilters,
  transform: (raw: any) => T,
  defaultValue: T,
) {
  const api = useAPIClient();
  const [data, setData] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.request({
        url: `rai-dashboard:${action}`,
        params: filterParams(filters),
      });
      const raw = res.data?.data;
      setData(raw != null ? transform(raw) : defaultValue);
    } catch (err: any) {
      setError(err.response?.data?.errors?.[0]?.message ?? err.message ?? 'Request failed');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, filters.collector, filters.robot_id, filters.data_type, filters.dateFrom, filters.dateTo, filters.collectors?.join(',') ?? '']);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refresh: fetch };
}
