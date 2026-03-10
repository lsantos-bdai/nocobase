import React, { useEffect, useState } from 'react';
import { Select, DatePicker, Space, Button } from 'antd';
import { useAPIClient } from '@nocobase/client';
import dayjs from 'dayjs';
import { AnalyticsFilters, thisMonthRange } from './types';

const { RangePicker } = DatePicker;

interface Props {
  filters: AnalyticsFilters;
  onChange: (f: AnalyticsFilters) => void;
  /** When provided, restricts the collector select to only these values. */
  allowedCollectors?: string[];
}

interface FilterOptions {
  collectors: string[];
  robots: string[];
  dataTypes: string[];
}

export function AnalyticsFilterBar({ filters, onChange, allowedCollectors }: Props) {
  const api = useAPIClient();
  const [options, setOptions] = useState<FilterOptions>({ collectors: [], robots: [], dataTypes: [] });

  useEffect(() => {
    api.request({ url: 'rai-dashboard:filterOptions' })
      .then(res => {
        const d = res.data?.data ?? {};
        setOptions({
          collectors: d.collectors ?? [],
          robots: d.robots ?? [],
          dataTypes: d.dataTypes ?? [],
        });
      })
      .catch(() => {});
  }, []);

  // If allowedCollectors is set, restrict the available collector options
  const collectorOptions = allowedCollectors
    ? allowedCollectors.map(c => ({ label: c, value: c }))
    : options.collectors.map(c => ({ label: c, value: c }));

  const rangeValue: [dayjs.Dayjs, dayjs.Dayjs] | null =
    filters.dateFrom && filters.dateTo
      ? [dayjs(filters.dateFrom), dayjs(filters.dateTo)]
      : null;

  return (
    <Space wrap style={{ marginBottom: 20 }}>
      <Select
        placeholder={allowedCollectors ? 'All team collectors' : 'All collectors'}
        allowClear
        mode={allowedCollectors ? 'multiple' : undefined}
        style={{ width: allowedCollectors ? 280 : 220 }}
        value={allowedCollectors ? (filters.collectors ?? []) : filters.collector}
        onChange={v => {
          if (allowedCollectors) {
            onChange({ ...filters, collectors: v as string[], collector: undefined });
          } else {
            onChange({ ...filters, collector: v as string });
          }
        }}
        options={collectorOptions}
        showSearch
      />
      <Select
        placeholder="All robots"
        allowClear
        style={{ width: 180 }}
        value={filters.robot_id}
        onChange={v => onChange({ ...filters, robot_id: v })}
        options={options.robots.map(r => ({ label: r, value: r }))}
        showSearch
      />
      <Select
        placeholder="All data types"
        allowClear
        style={{ width: 160 }}
        value={filters.data_type}
        onChange={v => onChange({ ...filters, data_type: v })}
        options={options.dataTypes.map(d => ({ label: d, value: d }))}
        showSearch
      />
      <RangePicker
        value={rangeValue}
        onChange={(_, strings) =>
          onChange({ ...filters, dateFrom: strings[0] || '', dateTo: strings[1] || '' })
        }
        style={{ width: 240 }}
      />
      <Button onClick={() => onChange({ ...filters, ...thisMonthRange() })}>This Month</Button>
      <Button onClick={() => onChange({ ...filters, dateFrom: '', dateTo: '' })}>All Time</Button>
    </Space>
  );
}
