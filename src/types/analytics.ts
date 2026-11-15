export interface OrderRecord {
  id: number;
  customer_name: string;
  items: string;
  status: 'pending' | 'ready' | 'delivered';
  created_at: string;
}

export interface ProductRecord {
  id: number;
  name: string;
  description: string;
  ingredients: string;
  price: string;
  image: string;
  category: 'acai' | 'sorvete';
}

export interface SensorEntry {
  id: number;
  status: string;
  source: 'esp32' | 'manual' | 'sample' | string;
  created_at: string;
}

export interface DoorCalibrationConfig {
  staffCount: number;
  staffCrossingsPerDay: number;
  bidirectionalDivisor: 1 | 2;
  debounceSeconds: number;
  filterByBusinessHours: boolean;
  weekdayOpen: string;
  weekdayClose: string;
  weekendOpen: string;
  weekendClose: string;
}

export interface WeatherDay {
  date: string;
  tempMax: number;
  tempMin: number;
  tempMean: number;
  precipitationSum: number;
  precipitationProb: number;
  weatherCode: number;
  isForecast: boolean;
}

export interface WeatherResponse {
  location: {
    lat: number;
    lon: number;
    city: string;
  };
  current: {
    temperature: number;
    precipitation: number;
    weatherCode: number;
  } | null;
  daily: WeatherDay[];
}

export interface DailyCombinedRow {
  date: string;
  dayOfWeek: number;
  ordersCount: number;
  revenue: number;
  acaiUnits: number;
  sorveteUnits: number;
  rawCrossings: number;
  debouncedCrossings: number;
  validCrossingsInHours: number;
  staffAllowanceApplied: number;
  estimatedVisitors: number;
  conversionRate: number | null;
}

export interface HourlyFlowRow {
  hour: number;
  label: string;
  rawCrossings: number;
  estimatedVisitors: number;
  ordersCount: number;
  conversionRate: number | null;
  isBusinessHour: boolean;
}

export type PredictionMode = 'orders_weather' | 'orders_weather_conversion';

export interface ModelComparisonMetric {
  name: string;
  key: 'ridge' | 'tree' | 'hybrid';
  mae: number;
  r2: number;
  description: string;
}

export interface DecisionRuleInsight {
  condition: string;
  adjustment: number;
  samples: number;
}

export interface ForecastDayPrediction {
  date: string;
  dayOfWeek: number;
  weekdayLabel: string;
  tempMax: number;
  tempMin: number;
  precipitationSum: number;
  precipitationProb: number;
  weatherCode: number;
  predictedOrders: number;
  predictedOrdersMin: number;
  predictedOrdersMax: number;
  predictedVisitors?: number;
  predictedConversionRate?: number;
  estimatedRevenue: number;
  recommendation: string;
  impactLevel: 'high' | 'medium' | 'low';
}

export interface HistoricalFittedPoint {
  date: string;
  actualOrders: number;
  fittedOrders: number;
  actualVisitors: number;
  fittedVisitors?: number;
  tempMax: number;
  precipitationSum: number;
}

export interface MLForecastResult {
  mode: PredictionMode;
  trainingStatus: 'trained_real' | 'hybrid_prior';
  distinctDaysWithOrders: number;
  distinctDaysWithSensor: number;
  totalDaysAnalyzed: number;
  avgTicket: number;
  avgConversionRate: number;
  tempImpactPerDegree: number;
  rainImpactPct: number;
  weekdayWeights: Array<{ day: number; label: string; factor: number; avgOrders: number }>;
  comparisonMetrics: ModelComparisonMetric[];
  treeRules: DecisionRuleInsight[];
  historicalSeries: HistoricalFittedPoint[];
  forecasts: ForecastDayPrediction[];
}
