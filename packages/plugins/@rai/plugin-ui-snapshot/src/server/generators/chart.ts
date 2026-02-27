/**
 * Chart Generator
 *
 * Generates ChartBlockModel flowModels for various chart types.
 *
 * CRITICAL: All flowModels MUST include parentId, subKey, subType from the start.
 * This ensures the closure table (flowModelTreePath) is populated correctly.
 * See: nocobase-ui-manipulation.md lines 111-134
 */
import type { Database } from '@nocobase/database';
import type { ChartBlockConfig, FlowModel } from '../types';
import { generateUid } from './uid';

export interface GeneratedChart {
  uid: string;
  flowModel: Partial<FlowModel>;
}

/**
 * Generate a ChartBlockModel from configuration
 *
 * @param config - Chart block configuration
 * @param collectionName - Resolved collection name (internal t_xxx format)
 * @param parentId - UID of parent flowModel (BlockGridModel)
 * @param sortIndex - Position among siblings
 */
export function generateChart(
  config: ChartBlockConfig,
  collectionName: string,
  parentId: string,
  sortIndex: number
): GeneratedChart {
  const uid = generateUid();
  const { chart } = config;

  // Build query configuration
  // Only include alias if defined - undefined values can cause issues
  const measures = [
    {
      field: [chart.measure.field],
      aggregation: chart.measure.aggregation,
      ...(chart.measure.alias && { alias: chart.measure.alias }),
    },
  ];

  // Add secondary measure for dual axes charts
  if (chart.type === 'dualAxes' && chart.secondaryMeasure) {
    measures.push({
      field: [chart.secondaryMeasure.field],
      aggregation: chart.secondaryMeasure.aggregation,
      ...(chart.secondaryMeasure.alias && { alias: chart.secondaryMeasure.alias }),
    });
  }

  const dimensions = [{ field: [chart.dimension] }];

  // Build chart options based on chart type
  const chartOption = buildChartOption(chart.type, chart.dimension, chart.measure.field, chart.options);

  // Include parent relationship from the start
  const flowModel: Partial<FlowModel> = {
    uid,
    use: 'ChartBlockModel',
    parentId,
    subKey: 'items',
    subType: 'array',
    sortIndex,
    stepParams: {
      chartSettings: {
        configure: {
          query: {
            collectionPath: ['main', collectionName],
            measures,
            dimensions,
            orders: [],
            mode: 'builder',
          },
          chart: {
            option: chartOption,
          },
        },
      },
    },
    flowRegistry: {},
  };

  return { uid, flowModel };
}

/**
 * Build chart option configuration based on chart type
 */
function buildChartOption(
  type: string,
  dimension: string,
  measureField: string,
  options?: {
    legend?: boolean;
    tooltip?: boolean;
    labelType?: string;
    colors?: string[];
    xAxisTitle?: string;
    yAxisTitle?: string;
  }
): Record<string, unknown> {
  const baseOptions = {
    mode: 'basic',
    builder: {
      type,
      legend: options?.legend ?? true,
      tooltip: options?.tooltip ?? true,
    },
  };

  switch (type) {
    case 'pie':
      return {
        ...baseOptions,
        builder: {
          ...baseOptions.builder,
          label: false,
          pieCategory: dimension,
          pieValue: measureField,
          pieRadiusInner: 0,
          pieRadiusOuter: 70,
          pieLabelType: options?.labelType || 'percent',
        },
      };

    case 'bar':
      return {
        ...baseOptions,
        builder: {
          ...baseOptions.builder,
          xField: dimension,
          yField: measureField,
          seriesField: undefined,
        },
      };

    case 'line':
      return {
        ...baseOptions,
        builder: {
          ...baseOptions.builder,
          xField: dimension,
          yField: measureField,
          seriesField: undefined,
          smooth: false,
        },
      };

    case 'area':
      return {
        ...baseOptions,
        builder: {
          ...baseOptions.builder,
          xField: dimension,
          yField: measureField,
          seriesField: undefined,
        },
      };

    case 'scatter':
      return {
        ...baseOptions,
        builder: {
          ...baseOptions.builder,
          xField: dimension,
          yField: measureField,
        },
      };

    case 'dualAxes':
      return {
        ...baseOptions,
        builder: {
          ...baseOptions.builder,
          xField: dimension,
        },
      };

    default:
      return baseOptions;
  }
}

/**
 * Save a ChartBlockModel to the database
 *
 * Uses FlowModelRepository.upsertModel() which correctly handles:
 * - The 'options' JSON column structure
 * - Tree path (closure table) creation for parent-child relationships
 */
export async function saveChart(db: Database, chart: GeneratedChart): Promise<void> {
  const repo = db.getRepository('flowModels') as any;

  await repo.upsertModel(chart.flowModel);
}
