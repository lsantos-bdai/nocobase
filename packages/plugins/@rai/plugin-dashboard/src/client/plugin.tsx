import { Plugin } from '@nocobase/client';
import React from 'react';
import { AnalyticsPage } from './AnalyticsPage';
import { AdminPage } from './admin/AdminPage';

export class PluginRaiDashboardClient extends Plugin {
  async load() {
    this.app.router.add('admin.analytics', {
      path: '/admin/page-analytics',
      Component: AnalyticsPage,
    });

    this.pluginSettingsManager.add('rai-dashboard', {
      title: 'Page Analytics',
      icon: 'BarChartOutlined',
      Component: AdminPage,
    });
  }
}

export default PluginRaiDashboardClient;
