import React, { useEffect } from 'react';
import { Col, Row } from 'antd';
import { AnalyticsFilters } from '../analytics/types';
import { AnalyticsFilterBar } from '../analytics/AnalyticsFilterBar';
import { StatCards } from '../analytics/StatCards';
import { TimelineChart } from '../analytics/TimelineChart';
import { CollectorChart } from '../analytics/CollectorChart';
import { DataTypeChart } from '../analytics/DataTypeChart';
import { RecentTable } from '../analytics/RecentTable';
import { TeamWidgets } from './TeamWidgets';
import { useTeamCollectors } from '../hooks/useTeamCollectors';

interface Props {
  team: string;
  filters: AnalyticsFilters;
  onFiltersChange: (f: AnalyticsFilters) => void;
}

export function TeamDashboard({ team, filters, onFiltersChange }: Props) {
  const { collectors: allowedCollectors, loading: collectorsLoading } = useTeamCollectors(team);

  // When the allowed collector list loads and the team has assigned collectors,
  // pre-populate the `collectors` filter so charts are scoped to this team.
  useEffect(() => {
    if (!collectorsLoading && allowedCollectors.length > 0) {
      // Only pre-populate if the filter hasn't been explicitly customised yet
      if (!filters.collectors && !filters.collector) {
        onFiltersChange({ ...filters, collectors: allowedCollectors });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectorsLoading, allowedCollectors.join(',')]);

  return (
    <div>
      <AnalyticsFilterBar
        filters={filters}
        onChange={onFiltersChange}
        allowedCollectors={allowedCollectors.length > 0 ? allowedCollectors : undefined}
      />

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

      <TeamWidgets team={team} pageId={null} />
    </div>
  );
}
