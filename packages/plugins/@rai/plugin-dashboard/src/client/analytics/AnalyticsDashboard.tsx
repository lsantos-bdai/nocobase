import React, { useState } from 'react';
import { AnalyticsFilters, thisMonthRange } from './types';
import { AnalyticsFilterBar } from './AnalyticsFilterBar';
import { StatCards } from './StatCards';
import { TimelineChart } from './TimelineChart';
import { CollectorChart } from './CollectorChart';
import { DataTypeChart } from './DataTypeChart';
import { RecentTable } from './RecentTable';
import { TeamWidgets } from '../team/TeamWidgets';
import { Col, Row } from 'antd';

export function AnalyticsDashboard() {
  const [filters, setFilters] = useState<AnalyticsFilters>({
    ...thisMonthRange(),
  });

  return (
    <div>
      <AnalyticsFilterBar filters={filters} onChange={setFilters} />

      <StatCards filters={filters} />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} xl={14}>
          <TimelineChart filters={filters} />
        </Col>
        <Col xs={24} xl={10}>
          <CollectorChart filters={filters} />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} xl={10}>
          <DataTypeChart filters={filters} />
        </Col>
        <Col xs={24} xl={14}>
          <RecentTable filters={filters} />
        </Col>
      </Row>

      <TeamWidgets team="overall" pageId={null} />
    </div>
  );
}
