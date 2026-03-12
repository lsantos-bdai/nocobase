import { useState, useCallback } from 'react';
import { useAPIClient } from '@nocobase/client';

export interface BQResult {
  data: Record<string, any>[];
  loading: boolean;
  error: string | null;
  run: () => Promise<void>;
}

export function useBigQuery(sql: string): BQResult {
  const api = useAPIClient();
  const [data, setData] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!sql.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.request({
        url: 'rai-dashboard:query',
        method: 'POST',
        data: { sql },
      });
      setData(res.data?.data ?? []);
    } catch (err: any) {
      setError(err.response?.data?.errors?.[0]?.message ?? err.message ?? 'Query failed');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [sql]);

  return { data, loading, error, run };
}
