import { useState, useCallback, useEffect } from 'react';
import { useAPIClient } from '@nocobase/client';

export function useTeamCollectors(team: string) {
  const api = useAPIClient();
  const [collectors, setCollectors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCollectors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.request({
        url: 'rai-team-collectors:list',
        params: { 'filter[team]': team },
      });
      setCollectors(res.data?.data ?? []);
    } catch (err: any) {
      setError(err.response?.data?.error ?? err.message ?? 'Failed to load collectors');
    } finally {
      setLoading(false);
    }
  }, [team]);

  useEffect(() => {
    fetchCollectors();
  }, [fetchCollectors]);

  const setTeamCollectors = useCallback(async (newCollectors: string[]) => {
    const res = await api.request({
      url: 'rai-team-collectors:set',
      method: 'POST',
      data: { team, collectors: newCollectors },
    });
    if (res.data?.data?.ok) {
      setCollectors(newCollectors);
    }
  }, [team]);

  return { collectors, loading, error, setTeamCollectors, refetch: fetchCollectors };
}
