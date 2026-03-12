import { useState, useCallback, useEffect } from 'react';
import { useAPIClient } from '@nocobase/client';

export interface TeamPage {
  id: string;
  team: string;
  title: string;
  content: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export function useTeamPages(team: string) {
  const api = useAPIClient();
  const [pages, setPages] = useState<TeamPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.request({
        url: 'rai-team-pages:list',
        params: { 'filter[team]': team },
      });
      setPages(res.data?.data ?? []);
    } catch (err: any) {
      setError(err.response?.data?.error ?? err.message ?? 'Failed to load pages');
    } finally {
      setLoading(false);
    }
  }, [team]);

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  const addPage = useCallback(async (values: { title: string; content?: string }) => {
    const res = await api.request({
      url: 'rai-team-pages:create',
      method: 'POST',
      data: { ...values, team },
    });
    const created = res.data?.data;
    if (created) setPages(prev => [...prev, created]);
    return created as TeamPage;
  }, [team]);

  const updatePage = useCallback(async (id: string, changes: { title?: string; content?: string }) => {
    const res = await api.request({
      url: `rai-team-pages:update/${id}`,
      method: 'PATCH',
      data: changes,
    });
    const updated = res.data?.data;
    if (updated) setPages(prev => prev.map(p => p.id === id ? updated : p));
    return updated as TeamPage;
  }, []);

  const removePage = useCallback(async (id: string) => {
    await api.request({
      url: `rai-team-pages:destroy/${id}`,
      method: 'DELETE',
    });
    setPages(prev => prev.filter(p => p.id !== id));
  }, []);

  const reorder = useCallback(async (orderedIds: string[]) => {
    setPages(prev => {
      const byId = new Map(prev.map(p => [p.id, p]));
      const reordered = orderedIds.map(id => byId.get(id)).filter(Boolean) as TeamPage[];
      const inOrder = new Set(orderedIds);
      const rest = prev.filter(p => !inOrder.has(p.id));
      return [...reordered, ...rest];
    });
    try {
      await api.request({
        url: 'rai-team-pages:reorder',
        method: 'POST',
        data: { team, orderedIds },
      });
    } catch {
      fetchPages();
    }
  }, [team, fetchPages]);

  return { pages, loading, error, addPage, updatePage, removePage, reorder, refetch: fetchPages };
}
