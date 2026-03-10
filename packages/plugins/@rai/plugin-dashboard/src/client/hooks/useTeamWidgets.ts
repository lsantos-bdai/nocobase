import { useState, useCallback, useEffect } from 'react';
import { useAPIClient } from '@nocobase/client';
import { Widget } from '../types';

interface TeamWidget extends Widget {
  sortOrder?: number;
}

export function useTeamWidgets(team: string, pageId?: string | null) {
  const api = useAPIClient();
  const [widgets, setWidgets] = useState<TeamWidget[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWidgets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { 'filter[team]': team };
      if (pageId !== undefined) {
        // null means "no page" (team overview), string means specific page
        params['filter[page_id]'] = pageId === null ? 'null' : pageId;
      }
      const res = await api.request({
        url: `rai-team-widgets:list`,
        params,
      });
      setWidgets(res.data?.data ?? []);
    } catch (err: any) {
      setError(err.response?.data?.error ?? err.message ?? 'Failed to load widgets');
    } finally {
      setLoading(false);
    }
  }, [team, pageId]);

  useEffect(() => {
    fetchWidgets();
  }, [fetchWidgets]);

  const addWidget = useCallback(async (values: Omit<Widget, 'id'> & { description?: string; pageId?: string | null }) => {
    const res = await api.request({
      url: 'rai-team-widgets:create',
      method: 'POST',
      data: { ...values, team, pageId: values.pageId !== undefined ? values.pageId : pageId ?? undefined },
    });
    const created = res.data?.data;
    if (created) setWidgets(prev => [...prev, created]);
    return created;
  }, [team, pageId]);

  const updateWidget = useCallback(async (id: string, changes: Partial<Widget & { description?: string }>) => {
    const res = await api.request({
      url: `rai-team-widgets:update/${id}`,
      method: 'PATCH',
      data: changes,
    });
    const updated = res.data?.data;
    if (updated) setWidgets(prev => prev.map(w => w.id === id ? updated : w));
  }, []);

  const removeWidget = useCallback(async (id: string) => {
    await api.request({
      url: `rai-team-widgets:destroy/${id}`,
      method: 'DELETE',
    });
    setWidgets(prev => prev.filter(w => w.id !== id));
  }, []);

  const reorder = useCallback(async (orderedIds: string[]) => {
    // Optimistically reorder local state to match the new sequence
    setWidgets(prev => {
      const byId = new Map(prev.map(w => [w.id, w]));
      const reordered = orderedIds.map(id => byId.get(id)).filter(Boolean) as TeamWidget[];
      // Append any widgets not in orderedIds (safety net)
      const inOrder = new Set(orderedIds);
      const rest = prev.filter(w => !inOrder.has(w.id));
      return [...reordered, ...rest];
    });
    try {
      await api.request({
        url: 'rai-team-widgets:reorder',
        method: 'POST',
        data: { team, orderedIds },
      });
    } catch {
      // Revert on failure
      fetchWidgets();
    }
  }, [team, fetchWidgets]);

  return { widgets, loading, error, addWidget, updateWidget, removeWidget, reorder };
}
