import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  Brain,
  Calendar,
  CheckCircle2,
  Cloud,
  CloudLightning,
  CloudRain,
  CloudSun,
  Cpu,
  Database,
  Droplets,
  Flame,
  LineChart,
  MapPin,
  Navigation,
  RefreshCw,
  Settings2,
  Sliders,
  Snowflake,
  Sun,
  Thermometer,
  Trash2,
  TrendingUp,
  Users,
  ShoppingBag,
  Clock,
  Sparkles,
} from 'lucide-react';

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

export interface ManagerialDashboardProps {
  orders: OrderRecord[];
  products: ProductRecord[];
}

const CALIBRATION_STORAGE_KEY = 'mari_acai_door_calibration_v1';
const LOCATION_STORAGE_KEY = 'mari_acai_weather_location_v1';

const DEFAULT_CALIBRATION: DoorCalibrationConfig = {
  staffCount: 2,
  staffCrossingsPerDay: 8,
  bidirectionalDivisor: 2,
  debounceSeconds: 4,
  filterByBusinessHours: true,
  weekdayOpen: '11:00',
  weekdayClose: '22:00',
  weekendOpen: '12:00',
  weekendClose: '23:00',
};

const PRESET_CITIES = [
  { name: 'São Paulo, SP', lat: -23.5505, lon: -46.6333 },
  { name: 'Rio de Janeiro, RJ', lat: -22.9068, lon: -43.1729 },
  { name: 'Belo Horizonte, MG', lat: -19.9167, lon: -43.9345 },
  { name: 'Curitiba, PR', lat: -25.4284, lon: -49.2733 },
  { name: 'Salvador, BA', lat: -12.9714, lon: -38.5014 },
  { name: 'Belém, PA', lat: -1.4558, lon: -48.4902 },
  { name: 'Manaus, AM', lat: -3.119, lon: -60.0217 },
];

const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEEKDAY_PRIOR = [1.28, 0.78, 0.84, 0.9, 0.96, 1.12, 1.32];

function parsePriceValue(priceStr: string | number): number {
  if (typeof priceStr === 'number') return Number.isFinite(priceStr) ? priceStr : 0;
  if (!priceStr) return 0;
  const cleaned = String(priceStr)
    .replace(/R\$/gi, '')
    .replace(/\s+/g, '')
    .trim();
  if (!cleaned) return 0;
  if (cleaned.includes(',') && cleaned.includes('.')) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
  }
  if (cleaned.includes(',')) {
    return parseFloat(cleaned.replace(',', '.')) || 0;
  }
  return parseFloat(cleaned) || 0;
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);
}

function formatDateBR(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}`;
}

function toLocalDateString(dateObj: Date): string {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseTimestamp(raw: string): Date | null {
  if (!raw) return null;
  let normalized = raw.trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalized)) {
    normalized = normalized.replace(' ', 'T') + 'Z';
  }
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

function isWithinBusinessHours(dateObj: Date, config: DoorCalibrationConfig): boolean {
  if (!config.filterByBusinessHours) return true;
  const dow = dateObj.getDay();
  const isWeekend = dow === 0 || dow === 6;
  const openMin = timeToMinutes(isWeekend ? config.weekendOpen : config.weekdayOpen);
  const closeMin = timeToMinutes(isWeekend ? config.weekendClose : config.weekdayClose);
  const currentMin = dateObj.getHours() * 60 + dateObj.getMinutes();
  if (closeMin >= openMin) {
    return currentMin >= openMin && currentMin <= closeMin;
  }
  return currentMin >= openMin || currentMin <= closeMin;
}

function parseOrderMetrics(
  order: OrderRecord,
  products: ProductRecord[],
  fallbackTicket: number
): { revenue: number; acaiUnits: number; sorveteUnits: number } {
  const text = (order.items || '').trim();
  if (!text) return { revenue: fallbackTicket, acaiUnits: 1, sorveteUnits: 0 };

  const segments = text.split(',').map((s) => s.trim()).filter(Boolean);
  let revenue = 0;
  let acaiUnits = 0;
  let sorveteUnits = 0;
  let matchedAny = false;

  for (const seg of segments) {
    const qtyMatch = seg.match(/^(\d+)\s*x\s+(.+)$/i);
    const qty = qtyMatch ? Math.max(1, parseInt(qtyMatch[1], 10)) : 1;
    const itemName = (qtyMatch ? qtyMatch[2] : seg).trim().toLowerCase();

    const exact = products.find((p) => p.name.trim().toLowerCase() === itemName);
    const partial =
      exact ||
      products.find(
        (p) =>
          itemName.includes(p.name.trim().toLowerCase()) ||
          p.name.trim().toLowerCase().includes(itemName)
      );

    if (partial) {
      matchedAny = true;
      revenue += qty * parsePriceValue(partial.price);
      if (partial.category === 'acai') acaiUnits += qty;
      else sorveteUnits += qty;
    } else if (itemName.includes('sorvet') || itemName.includes('casquinha') || itemName.includes('milk')) {
      sorveteUnits += qty;
    } else {
      acaiUnits += qty;
    }
  }

  if (!matchedAny) {
    const totalUnits = Math.max(1, acaiUnits + sorveteUnits);
    revenue = totalUnits * fallbackTicket;
  }

  return { revenue, acaiUnits, sorveteUnits };
}

function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) {
        maxRow = row;
      }
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];
    const pivot = M[col][col];
    if (Math.abs(pivot) < 1e-10) continue;

    for (let j = col; j <= n; j++) {
      M[col][j] /= pivot;
    }
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = M[row][col];
      for (let j = col; j <= n; j++) {
        M[row][j] -= factor * M[col][j];
      }
    }
  }

  return M.map((row) => row[n] ?? 0);
}

function fitRidgeRegression(X: number[][], y: number[], lambda = 1.5): number[] {
  if (X.length === 0) return [];
  const cols = X[0].length;
  const XtX: number[][] = Array.from({ length: cols }, () => Array(cols).fill(0));
  const Xty: number[] = Array(cols).fill(0);

  for (let i = 0; i < X.length; i++) {
    for (let j = 0; j < cols; j++) {
      Xty[j] += X[i][j] * y[i];
      for (let k = 0; k < cols; k++) {
        XtX[j][k] += X[i][j] * X[i][k];
      }
    }
  }

  // Regularize all non-intercept coefficients
  for (let j = 1; j < cols; j++) {
    XtX[j][j] += lambda;
  }

  return solveLinearSystem(XtX, Xty);
}

function calcMetrics(actual: number[], predicted: number[]): { mae: number; r2: number } {
  if (actual.length === 0) return { mae: 0, r2: 0 };
  const n = actual.length;
  const mean = actual.reduce((s, v) => s + v, 0) / n;
  let absErr = 0;
  let ssRes = 0;
  let ssTot = 0;

  for (let i = 0; i < n; i++) {
    const err = actual[i] - predicted[i];
    absErr += Math.abs(err);
    ssRes += err * err;
    ssTot += (actual[i] - mean) * (actual[i] - mean);
  }

  const mae = absErr / n;
  const r2 = ssTot > 1e-6 ? Math.max(-1, Math.min(1, 1 - ssRes / ssTot)) : 0;
  return {
    mae: Number(mae.toFixed(2)),
    r2: Number(r2.toFixed(3)),
  };
}

function describeWeatherCode(code: number): { label: string; kind: 'sun' | 'partly' | 'cloud' | 'rain' | 'storm' } {
  if (code === 0 || code === 1) return { label: 'Ensolarado', kind: 'sun' };
  if (code === 2) return { label: 'Parcialmente nublado', kind: 'partly' };
  if (code === 3 || code === 45 || code === 48) return { label: 'Nublado', kind: 'cloud' };
  if (code >= 95) return { label: 'Tempestade', kind: 'storm' };
  if (code >= 51) return { label: 'Chuva', kind: 'rain' };
  return { label: 'Tempo firme', kind: 'sun' };
}

function WeatherIcon({ code, size = 18 }: { code: number; size?: number }) {
  const { kind } = describeWeatherCode(code);
  if (kind === 'sun') return <Sun size={size} className="text-amber-500" />;
  if (kind === 'partly') return <CloudSun size={size} className="text-amber-400" />;
  if (kind === 'cloud') return <Cloud size={size} className="text-slate-400" />;
  if (kind === 'storm') return <CloudLightning size={size} className="text-indigo-500" />;
  return <CloudRain size={size} className="text-sky-500" />;
}

export const ManagerialDashboard: React.FC<ManagerialDashboardProps> = ({ orders, products }) => {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'forecast' | 'calibration'>('overview');
  const [periodDays, setPeriodDays] = useState<7 | 14 | 30>(14);
  const [forecastHorizon, setForecastHorizon] = useState<7 | 14>(7);
  const [predictionMode, setPredictionMode] = useState<PredictionMode>('orders_weather_conversion');

  const [calibration, setCalibration] = useState<DoorCalibrationConfig>(() => {
    try {
      const saved = localStorage.getItem(CALIBRATION_STORAGE_KEY);
      if (saved) return { ...DEFAULT_CALIBRATION, ...JSON.parse(saved) };
    } catch (_) {}
    return DEFAULT_CALIBRATION;
  });

  const [location, setLocation] = useState<{ lat: number; lon: number; label: string }>(() => {
    try {
      const saved = localStorage.getItem(LOCATION_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return { lat: PRESET_CITIES[0].lat, lon: PRESET_CITIES[0].lon, label: PRESET_CITIES[0].name };
  });

  const [sensorEntries, setSensorEntries] = useState<SensorEntry[]>([]);
  const [loadingSensor, setLoadingSensor] = useState(true);
  const [sensorStatus, setSensorStatus] = useState<'on' | 'off'>('off');
  const [wsConnected, setWsConnected] = useState(false);

  const [weatherData, setWeatherData] = useState<WeatherResponse | null>(null);
  const [loadingWeather, setLoadingWeather] = useState(true);
  const [weatherError, setWeatherError] = useState('');

  const [sampleLoading, setSampleLoading] = useState(false);
  const [sensorFeedback, setSensorFeedback] = useState('');
  const [hoveredDayIdx, setHoveredDayIdx] = useState<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(calibration));
    } catch (_) {}
  }, [calibration]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(location));
    } catch (_) {}
  }, [location]);

  const fetchSensorEntries = useCallback(async () => {
    try {
      setLoadingSensor(true);
      const res = await fetch('/api/esp32/entries');
      if (!res.ok) throw new Error('Falha ao buscar registros do sensor ESP32');
      const json = await res.json();
      setSensorEntries(Array.isArray(json.entries) ? json.entries : []);
      setSensorStatus(json.currentStatus === 'on' ? 'on' : 'off');
    } catch (err) {
      console.error('Sensor fetch error:', err);
    } finally {
      setLoadingSensor(false);
    }
  }, []);

  const fetchWeather = useCallback(async (lat: number, lon: number) => {
    try {
      setLoadingWeather(true);
      setWeatherError('');
      const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}&past_days=45&forecast_days=14`);
      if (!res.ok) throw new Error('Não foi possível carregar dados climáticos');
      const json: WeatherResponse = await res.json();
      setWeatherData(json);
    } catch (err: any) {
      console.error('Weather fetch error:', err);
      setWeatherError(err?.message || 'Erro ao consultar previsão do tempo');
    } finally {
      setLoadingWeather(false);
    }
  }, []);

  useEffect(() => {
    fetchSensorEntries();
  }, [fetchSensorEntries]);

  useEffect(() => {
    fetchWeather(location.lat, location.lon);
  }, [location.lat, location.lon, fetchWeather]);

  // Real-time WebSocket listener for ESP32 door sensor events
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let unmounted = false;

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          if (!unmounted) setWsConnected(true);
        };
        ws.onclose = () => {
          if (!unmounted) {
            setWsConnected(false);
            reconnectTimer = setTimeout(connect, 5000);
          }
        };
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'SENSOR_ENTRY' && msg.entry) {
              setSensorEntries((prev) => [msg.entry, ...prev]);
            } else if (msg.type === 'LED_STATUS_CHANGED') {
              setSensorStatus(msg.status === 'on' ? 'on' : 'off');
            } else if (msg.type === 'SENSOR_SAMPLE_UPDATED') {
              fetchSensorEntries();
            }
          } catch (_) {}
        };
      } catch (_) {}
    };

    connect();
    return () => {
      unmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [fetchSensorEntries]);

  const handleSimulateCrossing = async () => {
    try {
      setSensorFeedback('');
      const res = await fetch('/api/esp32/led', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: '1', source: 'manual' }),
      });
      if (!res.ok) throw new Error('Falha ao registrar passagem');
      setSensorFeedback('Passagem manual registrada no banco.');
      setTimeout(() => {
        fetch('/api/esp32/led', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: '0', source: 'manual' }),
        }).catch(() => {});
      }, 1500);
    } catch (err: any) {
      setSensorFeedback(err?.message || 'Erro ao simular passagem');
    }
  };

  const handleSeedSampleEntries = async () => {
    try {
      setSampleLoading(true);
      setSensorFeedback('');
      const entries: Array<{ status: string; created_at: string }> = [];
      const now = new Date();

      for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
        const d = new Date(now);
        d.setDate(d.getDate() - dayOffset);
        const dow = d.getDay();
        const isWeekend = dow === 0 || dow === 6;

        // Check weather if available to create realistic temperature correlation
        const dateKey = toLocalDateString(d);
        const weatherDay = weatherData?.daily.find((w) => w.date === dateKey);
        const tempFactor = weatherDay ? Math.max(0.65, 1 + (weatherDay.tempMax - 25) * 0.045) : 1;
        const rainFactor = weatherDay && weatherDay.precipitationSum > 3 ? 0.72 : 1;

        const baseVisitors = (isWeekend ? 48 : 28) * tempFactor * rainFactor;
        const dailyCrossings = Math.round(baseVisitors * calibration.bidirectionalDivisor + calibration.staffCount * calibration.staffCrossingsPerDay);

        for (let i = 0; i < dailyCrossings; i++) {
          // Peak around 14h–20h
          const r = Math.random();
          let hour = 15;
          if (r < 0.06) hour = 9 + Math.floor(Math.random() * 2); // Off-hours / staff arrival
          else if (r < 0.25) hour = 12 + Math.floor(Math.random() * 2);
          else if (r < 0.75) hour = 14 + Math.floor(Math.random() * 5);
          else hour = 19 + Math.floor(Math.random() * 3);

          const minute = Math.floor(Math.random() * 60);
          const second = Math.floor(Math.random() * 60);
          const stamp = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute, second);
          entries.push({ status: '1', created_at: stamp.toISOString() });
        }
      }

      const res = await fetch('/api/esp32/entries/sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      });
      if (!res.ok) throw new Error('Falha ao gerar base de teste');
      await fetchSensorEntries();
      setSensorFeedback(`${entries.length} eventos de fluxo (30 dias) carregados para calibração.`);
    } catch (err: any) {
      setSensorFeedback(err?.message || 'Erro ao gerar dados de amostra');
    } finally {
      setSampleLoading(false);
    }
  };

  const handleClearSampleEntries = async () => {
    try {
      setSampleLoading(true);
      setSensorFeedback('');
      const res = await fetch('/api/esp32/entries/sample', { method: 'DELETE' });
      if (!res.ok) throw new Error('Falha ao limpar dados de amostra');
      await fetchSensorEntries();
      setSensorFeedback('Dados de simulação removidos. Mantidos apenas logs reais do hardware ESP32.');
    } catch (err: any) {
      setSensorFeedback(err?.message || 'Erro ao limpar dados de amostra');
    } finally {
      setSampleLoading(false);
    }
  };

  const handleUseGeolocation = () => {
    if (!navigator.geolocation) {
      setWeatherError('Geolocalização não suportada pelo navegador.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          lat: Number(pos.coords.latitude.toFixed(4)),
          lon: Number(pos.coords.longitude.toFixed(4)),
          label: 'Localização Atual (GPS)',
        });
      },
      () => {
        setWeatherError('Permissão de localização negada. Selecione uma cidade na lista.');
      }
    );
  };

  const catalogAvgPrice = useMemo(() => {
    const prices = products.map((p) => parsePriceValue(p.price)).filter((n) => n > 0);
    if (prices.length === 0) return 22;
    return prices.reduce((s, n) => s + n, 0) / prices.length;
  }, [products]);

  // Compute daily combined rows & hourly flow rows
  const { dailyRows, hourlyRows, realHardwareCount, sampleCount } = useMemo(() => {
    const today = new Date();
    const daysList: string[] = [];
    for (let i = 44; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      daysList.push(toLocalDateString(d));
    }

    const ordersByDate = new Map<string, { count: number; revenue: number; acaiUnits: number; sorveteUnits: number }>();
    const ordersByHour = Array.from({ length: 24 }, () => 0);

    for (const o of orders) {
      const dt = parseTimestamp(o.created_at);
      if (!dt) continue;
      const dateStr = toLocalDateString(dt);
      const metrics = parseOrderMetrics(o, products, catalogAvgPrice);
      const cur = ordersByDate.get(dateStr) || { count: 0, revenue: 0, acaiUnits: 0, sorveteUnits: 0 };
      cur.count += 1;
      cur.revenue += metrics.revenue;
      cur.acaiUnits += metrics.acaiUnits;
      cur.sorveteUnits += metrics.sorveteUnits;
      ordersByDate.set(dateStr, cur);

      if (daysList.slice(-periodDays).includes(dateStr)) {
        ordersByHour[dt.getHours()] += 1;
      }
    }

    let hwCount = 0;
    let smpCount = 0;
    const sensorByDate = new Map<string, Date[]>();

    for (const entry of sensorEntries) {
      if (entry.source === 'sample') smpCount += 1;
      else hwCount += 1;

      const dt = parseTimestamp(entry.created_at);
      if (!dt) continue;
      const dateStr = toLocalDateString(dt);
      if (!sensorByDate.has(dateStr)) sensorByDate.set(dateStr, []);
      sensorByDate.get(dateStr)!.push(dt);
    }

    const hourlyRaw = Array.from({ length: 24 }, () => 0);
    const hourlyValid = Array.from({ length: 24 }, () => 0);
    const periodDateSet = new Set(daysList.slice(-periodDays));

    const combined: DailyCombinedRow[] = daysList.map((dateStr) => {
      const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
      const dateObj = new Date(y, m - 1, d);
      const dow = dateObj.getDay();

      const rawDates = (sensorByDate.get(dateStr) || []).slice().sort((a, b) => a.getTime() - b.getTime());
      const rawCrossings = rawDates.length;

      // Debounce
      const debounced: Date[] = [];
      let lastTime = -Infinity;
      const debounceMs = Math.max(0, calibration.debounceSeconds) * 1000;
      for (const dt of rawDates) {
        if (dt.getTime() - lastTime >= debounceMs) {
          debounced.push(dt);
          lastTime = dt.getTime();
        }
      }

      const validInHours = debounced.filter((dt) => isWithinBusinessHours(dt, calibration));

      if (periodDateSet.has(dateStr)) {
        for (const dt of rawDates) hourlyRaw[dt.getHours()] += 1;
        for (const dt of debounced) hourlyValid[dt.getHours()] += 1;
      }

      const dividedCrossings = validInHours.length / calibration.bidirectionalDivisor;
      const staffAllowanceApplied =
        validInHours.length > 0
          ? Math.round((calibration.staffCount * calibration.staffCrossingsPerDay) / calibration.bidirectionalDivisor)
          : 0;

      const estimatedVisitors =
        validInHours.length > 0 ? Math.max(0, Math.round(dividedCrossings - staffAllowanceApplied)) : 0;

      const ord = ordersByDate.get(dateStr) || { count: 0, revenue: 0, acaiUnits: 0, sorveteUnits: 0 };
      const conversionRate =
        estimatedVisitors > 0 ? Number(Math.min(100, (ord.count / estimatedVisitors) * 100).toFixed(1)) : null;

      return {
        date: dateStr,
        dayOfWeek: dow,
        ordersCount: ord.count,
        revenue: Number(ord.revenue.toFixed(2)),
        acaiUnits: ord.acaiUnits,
        sorveteUnits: ord.sorveteUnits,
        rawCrossings,
        debouncedCrossings: debounced.length,
        validCrossingsInHours: validInHours.length,
        staffAllowanceApplied,
        estimatedVisitors,
        conversionRate,
      };
    });

    const openH = parseInt(calibration.weekdayOpen.split(':')[0], 10) || 11;
    const closeH = parseInt(calibration.weekdayClose.split(':')[0], 10) || 22;

    const hourly: HourlyFlowRow[] = Array.from({ length: 24 }, (_, hour) => {
      const rawCrossings = hourlyRaw[hour];
      const estimatedVisitors = Math.round(hourlyValid[hour] / calibration.bidirectionalDivisor);
      const ordersCount = ordersByHour[hour];
      const conversionRate =
        estimatedVisitors > 0 ? Number(Math.min(100, (ordersCount / estimatedVisitors) * 100).toFixed(1)) : null;

      return {
        hour,
        label: `${String(hour).padStart(2, '0')}h`,
        rawCrossings,
        estimatedVisitors,
        ordersCount,
        conversionRate,
        isBusinessHour: hour >= openH && hour <= closeH,
      };
    });

    return {
      dailyRows: combined,
      hourlyRows: hourly,
      realHardwareCount: hwCount,
      sampleCount: smpCount,
    };
  }, [orders, products, sensorEntries, calibration, catalogAvgPrice, periodDays]);

  const visibleDailyRows = useMemo(() => dailyRows.slice(-periodDays), [dailyRows, periodDays]);

  // Period KPI summaries
  const periodKPIs = useMemo(() => {
    const totalOrders = visibleDailyRows.reduce((s, r) => s + r.ordersCount, 0);
    const totalRevenue = visibleDailyRows.reduce((s, r) => s + r.revenue, 0);
    const totalVisitors = visibleDailyRows.reduce((s, r) => s + r.estimatedVisitors, 0);
    const totalRaw = visibleDailyRows.reduce((s, r) => s + r.rawCrossings, 0);
    const totalAcai = visibleDailyRows.reduce((s, r) => s + r.acaiUnits, 0);
    const totalSorvete = visibleDailyRows.reduce((s, r) => s + r.sorveteUnits, 0);
    const avgConversion = totalVisitors > 0 ? Math.min(100, (totalOrders / totalVisitors) * 100) : 0;
    const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : catalogAvgPrice;

    return {
      totalOrders,
      totalRevenue,
      totalVisitors,
      totalRaw,
      totalAcai,
      totalSorvete,
      avgConversion,
      avgTicket,
    };
  }, [visibleDailyRows, catalogAvgPrice]);

  // Machine Learning Forecasting Engine
  const mlForecast: MLForecastResult = useMemo(() => {
    const weatherMap = new Map<string, WeatherDay>();
    (weatherData?.daily || []).forEach((w) => weatherMap.set(w.date, w));

    const daysWithOrders = dailyRows.filter((r) => r.ordersCount > 0);
    const daysWithSensor = dailyRows.filter((r) => r.estimatedVisitors > 0);
    const trainingStatus: 'trained_real' | 'hybrid_prior' =
      daysWithOrders.length >= 5 ? 'trained_real' : 'hybrid_prior';

    const avgTicket =
      daysWithOrders.length > 0
        ? daysWithOrders.reduce((s, r) => s + r.revenue, 0) /
          Math.max(1, daysWithOrders.reduce((s, r) => s + r.ordersCount, 0))
        : catalogAvgPrice;

    const validConvDays = dailyRows.filter((r) => r.conversionRate !== null && r.ordersCount > 0);
    const avgConversionRate =
      validConvDays.length > 0
        ? validConvDays.reduce((s, r) => s + (r.conversionRate || 0), 0) / validConvDays.length
        : 38.0;

    // Build aligned training dataset (days with orders OR sensor activity + weather)
    const aligned = dailyRows
      .map((row) => {
        const w = weatherMap.get(row.date);
        return {
          row,
          tempMax: w?.tempMax ?? 27,
          tempMin: w?.tempMin ?? 19,
          precip: w?.precipitationSum ?? 0,
          isWeekend: row.dayOfWeek === 0 || row.dayOfWeek === 6 ? 1 : 0,
        };
      })
      .filter((item) => item.row.ordersCount > 0 || item.row.estimatedVisitors > 0);

    // Fallback synthetic prior rows if history is too sparse so Ridge/Tree math remains well-conditioned
    const effectiveSamples =
      aligned.length >= 5
        ? aligned
        : dailyRows.slice(-14).map((row) => {
            const w = weatherMap.get(row.date);
            const tMax = w?.tempMax ?? 27;
            const precip = w?.precipitationSum ?? 0;
            const priorOrders = Math.max(
              2,
              Math.round(
                (10 + (tMax - 24) * 0.7 - (precip > 2 ? 2.5 : 0)) * WEEKDAY_PRIOR[row.dayOfWeek]
              )
            );
            const priorVisitors =
              row.estimatedVisitors > 0
                ? row.estimatedVisitors
                : Math.round(priorOrders / (avgConversionRate / 100));
            return {
              row: {
                ...row,
                ordersCount: row.ordersCount > 0 ? row.ordersCount : priorOrders,
                estimatedVisitors: priorVisitors,
              },
              tempMax: tMax,
              tempMin: w?.tempMin ?? 19,
              precip,
              isWeekend: row.dayOfWeek === 0 || row.dayOfWeek === 6 ? 1 : 0,
            };
          });

    const useConversionSignal = predictionMode === 'orders_weather_conversion';

    // 1. Ridge Regression
    const X = effectiveSamples.map((s) => {
      const base = [1, (s.tempMax - 25) / 10, s.precip > 2 ? 1 : 0, s.isWeekend];
      if (useConversionSignal) {
        base.push(s.row.estimatedVisitors / 50);
      }
      return base;
    });
    const y = effectiveSamples.map((s) => s.row.ordersCount);
    const beta = fitRidgeRegression(X, y, 1.5);
    const ridgePreds = X.map((rowVec) =>
      Math.max(0, rowVec.reduce((sum, val, idx) => sum + val * (beta[idx] || 0), 0))
    );
    const ridgeMetrics = calcMetrics(y, ridgePreds);

    // 2. Decision Tree Rules (interpretable splits on temperature, rain, weekend)
    const meanOrders = y.reduce((s, v) => s + v, 0) / Math.max(1, y.length);
    const hotSamples = effectiveSamples.filter((s) => s.tempMax >= 28);
    const coolSamples = effectiveSamples.filter((s) => s.tempMax < 21);
    const rainSamples = effectiveSamples.filter((s) => s.precip >= 2);
    const weekendSamples = effectiveSamples.filter((s) => s.isWeekend === 1);

    const calcAdj = (subset: typeof effectiveSamples, fallback: number) =>
      subset.length > 0
        ? Number((subset.reduce((s, x) => s + x.row.ordersCount, 0) / subset.length - meanOrders).toFixed(2))
        : fallback;

    const hotAdj = calcAdj(hotSamples, 3.2);
    const coolAdj = calcAdj(coolSamples, -2.8);
    const rainAdj = calcAdj(rainSamples, -2.4);
    const weekendAdj = calcAdj(weekendSamples, 4.1);

    const treeRules: DecisionRuleInsight[] = [
      { condition: 'Temperatura Máxima ≥ 28°C (Calor)', adjustment: hotAdj, samples: hotSamples.length },
      { condition: 'Fim de Semana (Sábado / Domingo)', adjustment: weekendAdj, samples: weekendSamples.length },
      { condition: 'Chuva Significativa (≥ 2,0 mm)', adjustment: rainAdj, samples: rainSamples.length },
      { condition: 'Temperatura Amena (< 21°C)', adjustment: coolAdj, samples: coolSamples.length },
    ];

    const predictTree = (tMax: number, precip: number, isWknd: number, visitors?: number) => {
      let pred = meanOrders;
      if (tMax >= 28) pred += hotAdj * 0.65;
      else if (tMax < 21) pred += coolAdj * 0.65;
      if (precip >= 2) pred += rainAdj * 0.65;
      if (isWknd === 1) pred += weekendAdj * 0.65;
      if (useConversionSignal && visitors !== undefined && visitors > 0) {
        const convEstimate = visitors * (avgConversionRate / 100);
        pred = pred * 0.55 + convEstimate * 0.45;
      }
      return Math.max(0, pred);
    };

    const treePreds = effectiveSamples.map((s) =>
      predictTree(s.tempMax, s.precip, s.isWeekend, s.row.estimatedVisitors)
    );
    const treeMetrics = calcMetrics(y, treePreds);

    // 3. Hybrid Ensemble
    const hybridPreds = ridgePreds.map((rp, i) => Math.max(0, rp * 0.55 + treePreds[i] * 0.45));
    const hybridMetrics = calcMetrics(y, hybridPreds);

    // Weekday weights
    const weekdayWeights = WEEKDAY_SHORT.map((label, day) => {
      const dayItems = effectiveSamples.filter((s) => s.row.dayOfWeek === day);
      const avg =
        dayItems.length > 0
          ? dayItems.reduce((s, x) => s + x.row.ordersCount, 0) / dayItems.length
          : meanOrders * WEEKDAY_PRIOR[day];
      return {
        day,
        label,
        avgOrders: Number(avg.toFixed(1)),
        factor: Number((meanOrders > 0 ? avg / meanOrders : WEEKDAY_PRIOR[day]).toFixed(2)),
      };
    });

    // Visitor flow Ridge model (used when in conversion mode)
    const Xv = effectiveSamples.map((s) => [1, (s.tempMax - 25) / 10, s.precip > 2 ? 1 : 0, s.isWeekend]);
    const yv = effectiveSamples.map((s) => s.row.estimatedVisitors);
    const betaVisitors = fitRidgeRegression(Xv, yv, 1.5);

    const historicalSeries: HistoricalFittedPoint[] = dailyRows.slice(-14).map((row) => {
      const w = weatherMap.get(row.date);
      const tMax = w?.tempMax ?? 27;
      const precip = w?.precipitationSum ?? 0;
      const isWknd = row.dayOfWeek === 0 || row.dayOfWeek === 6 ? 1 : 0;

      const feat = [1, (tMax - 25) / 10, precip > 2 ? 1 : 0, isWknd];
      if (useConversionSignal) feat.push(row.estimatedVisitors / 50);

      const rp = Math.max(0, feat.reduce((s, v, idx) => s + v * (beta[idx] || 0), 0));
      const tp = predictTree(tMax, precip, isWknd, row.estimatedVisitors);
      const fitted = Math.round(rp * 0.55 + tp * 0.45);

      const fittedVis = Math.max(
        0,
        Math.round(
          [1, (tMax - 25) / 10, precip > 2 ? 1 : 0, isWknd].reduce(
            (s, v, idx) => s + v * (betaVisitors[idx] || 0),
            0
          )
        )
      );

      return {
        date: row.date,
        actualOrders: row.ordersCount,
        fittedOrders: fitted,
        actualVisitors: row.estimatedVisitors,
        fittedVisitors: useConversionSignal ? fittedVis : undefined,
        tempMax: tMax,
        precipitationSum: precip,
      };
    });

    const todayStr = toLocalDateString(new Date());
    const forecastDaysList = (weatherData?.daily || [])
      .filter((w) => w.date >= todayStr)
      .slice(0, forecastHorizon);

    const intervalPad = Math.max(2, Math.ceil(hybridMetrics.mae * 1.25));

    const forecasts: ForecastDayPrediction[] = forecastDaysList.map((w) => {
      const [y, m, d] = w.date.split('-').map((n) => parseInt(n, 10));
      const dt = new Date(y, m - 1, d);
      const dow = dt.getDay();
      const isWknd = dow === 0 || dow === 6 ? 1 : 0;

      const estVisitors = Math.max(
        4,
        Math.round(
          [1, (w.tempMax - 25) / 10, w.precipitationSum > 2 ? 1 : 0, isWknd].reduce(
            (s, v, idx) => s + v * (betaVisitors[idx] || 0),
            0
          )
        )
      );

      const feat = [1, (w.tempMax - 25) / 10, w.precipitationSum > 2 ? 1 : 0, isWknd];
      if (useConversionSignal) feat.push(estVisitors / 50);

      const rp = Math.max(0, feat.reduce((s, v, idx) => s + v * (beta[idx] || 0), 0));
      const tp = predictTree(w.tempMax, w.precipitationSum, isWknd, estVisitors);
      const weekdayFactor = weekdayWeights[dow]?.factor ?? 1;

      const rawHybrid = rp * 0.55 + tp * 0.45;
      const predictedOrders = Math.max(1, Math.round(rawHybrid * (0.75 + 0.25 * weekdayFactor)));
      const predictedOrdersMin = Math.max(0, predictedOrders - intervalPad);
      const predictedOrdersMax = predictedOrders + intervalPad;

      let impactLevel: 'high' | 'medium' | 'low' = 'medium';
      if (predictedOrders >= meanOrders * 1.18) impactLevel = 'high';
      else if (predictedOrders <= meanOrders * 0.85) impactLevel = 'low';

      let recommendation = 'Operação padrão com estoque regular de açaí e complementos.';
      if (w.tempMax >= 29 && w.precipitationSum < 2) {
        recommendation = 'Calor intenso: reforce estoque de polpa de açaí, gelo e copos de 500ml.';
      } else if (w.precipitationSum >= 5 || w.precipitationProb >= 70) {
        recommendation = 'Alta chance de chuva: priorize embalagens térmicas e equipe para delivery.';
      } else if (isWknd === 1) {
        recommendation = 'Pico de fim de semana: antecipe preparo de cremes e organize escala de balcão.';
      }

      return {
        date: w.date,
        dayOfWeek: dow,
        weekdayLabel: WEEKDAY_SHORT[dow],
        tempMax: w.tempMax,
        tempMin: w.tempMin,
        precipitationSum: w.precipitationSum,
        precipitationProb: w.precipitationProb,
        weatherCode: w.weatherCode,
        predictedOrders,
        predictedOrdersMin,
        predictedOrdersMax,
        predictedVisitors: useConversionSignal ? estVisitors : undefined,
        predictedConversionRate: useConversionSignal
          ? Number(Math.min(100, (predictedOrders / Math.max(1, estVisitors)) * 100).toFixed(1))
          : undefined,
        estimatedRevenue: Number((predictedOrders * avgTicket).toFixed(2)),
        recommendation,
        impactLevel,
      };
    });

    const tempImpactPerDegree = Number(((beta[1] || 0) / 10).toFixed(2));
    const rainImpactPct =
      meanOrders > 0 ? Number((((beta[2] || 0) / meanOrders) * 100).toFixed(1)) : -15;

    const comparisonMetrics: ModelComparisonMetric[] = [
      {
        name: 'Regressão Ridge (L2)',
        key: 'ridge',
        mae: ridgeMetrics.mae,
        r2: ridgeMetrics.r2,
        description: 'Captura relação linear contínua entre temperatura, chuva e volume diário.',
      },
      {
        name: 'Árvore de Regras',
        key: 'tree',
        mae: treeMetrics.mae,
        r2: treeMetrics.r2,
        description: 'Segmenta limiares climáticos (calor ≥ 28°C, chuva e finais de semana).',
      },
      {
        name: 'Ensemble Híbrido',
        key: 'hybrid',
        mae: hybridMetrics.mae,
        r2: hybridMetrics.r2,
        description: 'Combina Ridge (55%) + Árvore (45%) para reduzir variância nas previsões.',
      },
    ];

    return {
      mode: predictionMode,
      trainingStatus,
      distinctDaysWithOrders: daysWithOrders.length,
      distinctDaysWithSensor: daysWithSensor.length,
      totalDaysAnalyzed: dailyRows.length,
      avgTicket: Number(avgTicket.toFixed(2)),
      avgConversionRate: Number(avgConversionRate.toFixed(1)),
      tempImpactPerDegree,
      rainImpactPct,
      weekdayWeights,
      comparisonMetrics,
      treeRules,
      historicalSeries,
      forecasts,
    };
  }, [dailyRows, weatherData, predictionMode, forecastHorizon, catalogAvgPrice]);

  // SVG Chart geometries
  const chartMaxFlow = useMemo(() => {
    const vals = visibleDailyRows.flatMap((r) => [r.estimatedVisitors, r.ordersCount]);
    return Math.max(10, ...vals);
  }, [visibleDailyRows]);

  const hourlyMax = useMemo(() => {
    const relevant = hourlyRows.filter((h) => h.hour >= 8 && h.hour <= 23);
    const vals = relevant.flatMap((h) => [h.estimatedVisitors, h.ordersCount]);
    return Math.max(5, ...vals);
  }, [hourlyRows]);

  const visibleHourlyRows = useMemo(
    () => hourlyRows.filter((h) => h.hour >= 8 && h.hour <= 23),
    [hourlyRows]
  );

  const forecastChartSeries = useMemo(() => {
    const hist = mlForecast.historicalSeries.slice(-7).map((h) => ({
      date: h.date,
      label: formatDateBR(h.date),
      actual: h.actualOrders,
      predicted: h.fittedOrders,
      min: h.fittedOrders,
      max: h.fittedOrders,
      tempMax: h.tempMax,
      isFuture: false,
    }));
    const fut = mlForecast.forecasts.map((f) => ({
      date: f.date,
      label: `${f.weekdayLabel} ${formatDateBR(f.date)}`,
      actual: null as number | null,
      predicted: f.predictedOrders,
      min: f.predictedOrdersMin,
      max: f.predictedOrdersMax,
      tempMax: f.tempMax,
      isFuture: true,
    }));
    return [...hist, ...fut];
  }, [mlForecast]);

  const forecastChartMaxY = useMemo(() => {
    const vals = forecastChartSeries.flatMap((d) => [d.actual ?? 0, d.max, d.predicted]);
    return Math.max(10, ...vals);
  }, [forecastChartSeries]);

  return (
    <div className="space-y-8">
      {/* Header & Sub-Navigation Toolbar */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 md:p-6 border border-slate-200 dark:border-slate-800 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-5">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span className="font-semibold text-pink-600 dark:text-pink-400">Inteligência Gerencial</span>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1.5">
              {wsConnected && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
              )}
              ESP32 {wsConnected ? 'Conectado em tempo real' : 'Sincronização periódica'}
            </span>
            {weatherData?.location?.city && (
              <>
                <span aria-hidden="true">·</span>
                <span>{weatherData.location.city}</span>
              </>
            )}
          </div>
          <h3 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100">
            Fluxo de Loja, Conversão & Previsão ML
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
          {/* Segmented Sub-tabs */}
          <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl flex items-center gap-1 flex-1 sm:flex-none overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveSubTab('overview')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                activeSubTab === 'overview'
                  ? 'bg-white dark:bg-slate-900 text-pink-600 dark:text-pink-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BarChart3 size={15} />
              Fluxo & Conversão
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('forecast')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                activeSubTab === 'forecast'
                  ? 'bg-white dark:bg-slate-900 text-pink-600 dark:text-pink-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Brain size={15} />
              Previsão ML & Clima
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('calibration')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                activeSubTab === 'calibration'
                  ? 'bg-white dark:bg-slate-900 text-pink-600 dark:text-pink-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Sliders size={15} />
              Calibração ESP32
            </button>
          </div>

          {/* Period Selector */}
          <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl flex items-center gap-1 shrink-0">
            {([7, 14, 30] as const).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setPeriodDays(days)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold tabular-nums transition-colors whitespace-nowrap shrink-0 ${
                  periodDays === days
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {days}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Top KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
            <span>Visitantes Estimados ({periodDays}d)</span>
            <Users size={16} className="text-pink-600 dark:text-pink-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {loadingSensor ? '—' : periodKPIs.totalVisitors.toLocaleString('pt-BR')}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
            {periodKPIs.totalRaw.toLocaleString('pt-BR')} passagens brutas no sensor
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
            <span>Pedidos & Conversão ({periodDays}d)</span>
            <ShoppingBag size={16} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
              {periodKPIs.totalOrders}
            </span>
            <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
              {periodKPIs.totalVisitors > 0 ? `${periodKPIs.avgConversion.toFixed(1)}% conv.` : 'Sem fluxo ESP32'}
            </span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
            {periodKPIs.totalAcai} Açaís · {periodKPIs.totalSorvete} Sorvetes
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
            <span>Receita Estimada ({periodDays}d)</span>
            <TrendingUp size={16} className="text-pink-600 dark:text-pink-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {formatBRL(periodKPIs.totalRevenue)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
            Ticket médio: {formatBRL(periodKPIs.avgTicket)}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
            <span>Clima Atual & Próximo Pico</span>
            {weatherData?.current ? (
              <WeatherIcon code={weatherData.current.weatherCode} size={18} />
            ) : (
              <Thermometer size={16} className="text-amber-500" />
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
              {loadingWeather || !weatherData?.current ? '—' : `${weatherData.current.temperature.toFixed(1)}°C`}
            </span>
            {weatherData?.current && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {describeWeatherCode(weatherData.current.weatherCode).label}
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
            {mlForecast.forecasts[0]
              ? `Prev. hoje: ${mlForecast.forecasts[0].predictedOrders} pedidos`
              : 'Consultando previsão'}
          </div>
        </div>
      </div>

      {/* TAB 1: OVERVIEW & FLOW */}
      {activeSubTab === 'overview' && (
        <div className="space-y-6">
          {/* Quick ESP32 Sensor Bar */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 md:p-5 border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                <Cpu size={20} />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>Sensor de Presença ESP32</span>
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    ({sensorStatus === 'on' ? 'Presença ativa' : 'Aguardando passagem'})
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {realHardwareCount} registros de hardware · {sampleCount} registros de simulação · Divisor {calibration.bidirectionalDivisor}x · Debounce {calibration.debounceSeconds}s
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <button
                type="button"
                onClick={handleSimulateCrossing}
                className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
              >
                <Activity size={14} />
                Registrar Passagem
              </button>
              <button
                type="button"
                onClick={handleSeedSampleEntries}
                disabled={sampleLoading}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                {sampleLoading ? 'Gerando...' : 'Gerar Amostra 30d'}
              </button>
              {sampleCount > 0 && (
                <button
                  type="button"
                  onClick={handleClearSampleEntries}
                  disabled={sampleLoading}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 flex items-center gap-1"
                >
                  <Trash2 size={14} />
                  Limpar Amostra
                </button>
              )}
              <button
                type="button"
                onClick={fetchSensorEntries}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
                title="Atualizar dados do sensor"
              >
                <RefreshCw size={15} />
              </button>
            </div>
          </div>

          {sensorFeedback && (
            <div className="px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 text-xs font-medium flex items-center gap-2">
              <CheckCircle2 size={15} />
              <span>{sensorFeedback}</span>
            </div>
          )}

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Daily Visitors vs Orders Chart (2 cols) */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl p-5 md:p-6 border border-slate-200 dark:border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
                <div>
                  <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Visitantes Calibrados vs. Pedidos Diários
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Comparativo dos últimos {periodDays} dias após desconto de equipe e horário comercial
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-pink-200 dark:bg-pink-900/70 inline-block" />
                    Visitantes
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-1 rounded-full bg-pink-600 inline-block" />
                    Pedidos
                  </span>
                </div>
              </div>

              <div className="relative w-full overflow-x-auto no-scrollbar">
                <svg viewBox="0 0 720 250" className="w-full min-w-[540px] h-64">
                  {/* Horizontal Grid Lines */}
                  {[0, 0.25, 0.5, 0.75, 1].map((t, idx) => {
                    const y = 210 - t * 180;
                    const labelVal = Math.round(t * chartMaxFlow);
                    return (
                      <g key={idx}>
                        <line
                          x1={44}
                          y1={y}
                          x2={705}
                          y2={y}
                          stroke="currentColor"
                          className="text-slate-100 dark:text-slate-800"
                          strokeDasharray="3 3"
                        />
                        <text
                          x={36}
                          y={y + 4}
                          textAnchor="end"
                          className="fill-slate-400 text-[10px] font-mono"
                        >
                          {labelVal}
                        </text>
                      </g>
                    );
                  })}

                  {/* Visitor Bars */}
                  {visibleDailyRows.map((row, i) => {
                    const plotWidth = 650;
                    const step = plotWidth / Math.max(1, visibleDailyRows.length);
                    const barW = Math.max(6, Math.min(24, step * 0.6));
                    const x = 50 + i * step + (step - barW) / 2;
                    const barH = (row.estimatedVisitors / chartMaxFlow) * 180;
                    const y = 210 - barH;
                    const isHovered = hoveredDayIdx === i;

                    return (
                      <g
                        key={row.date}
                        onMouseEnter={() => setHoveredDayIdx(i)}
                        onMouseLeave={() => setHoveredDayIdx(null)}
                        className="cursor-pointer"
                      >
                        <rect
                          x={x}
                          y={y}
                          width={barW}
                          height={Math.max(2, barH)}
                          rx={4}
                          className={
                            isHovered
                              ? 'fill-pink-400 dark:fill-pink-500 transition-colors'
                              : 'fill-pink-200/80 dark:fill-pink-900/50 transition-colors'
                          }
                        />
                        {(visibleDailyRows.length <= 14 || i % Math.ceil(visibleDailyRows.length / 10) === 0) && (
                          <text
                            x={x + barW / 2}
                            y={232}
                            textAnchor="middle"
                            className="fill-slate-400 text-[10px] font-mono"
                          >
                            {formatDateBR(row.date)}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* Orders Line */}
                  {visibleDailyRows.length > 1 && (
                    <polyline
                      fill="none"
                      stroke="#db2777"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={visibleDailyRows
                        .map((row, i) => {
                          const plotWidth = 650;
                          const step = plotWidth / visibleDailyRows.length;
                          const cx = 50 + i * step + step / 2;
                          const cy = 210 - (row.ordersCount / chartMaxFlow) * 180;
                          return `${cx},${cy}`;
                        })
                        .join(' ')}
                    />
                  )}

                  {/* Orders Points */}
                  {visibleDailyRows.map((row, i) => {
                    const plotWidth = 650;
                    const step = plotWidth / Math.max(1, visibleDailyRows.length);
                    const cx = 50 + i * step + step / 2;
                    const cy = 210 - (row.ordersCount / chartMaxFlow) * 180;
                    return (
                      <circle
                        key={`pt-${row.date}`}
                        cx={cx}
                        cy={cy}
                        r={hoveredDayIdx === i ? 5 : 3.2}
                        className="fill-pink-600 stroke-white dark:stroke-slate-900"
                        strokeWidth={1.5}
                        onMouseEnter={() => setHoveredDayIdx(i)}
                      />
                    );
                  })}
                </svg>

                {/* Hover Readout Strip */}
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                  {hoveredDayIdx !== null && visibleDailyRows[hoveredDayIdx] ? (
                    <>
                      <span className="font-semibold">
                        {WEEKDAY_SHORT[visibleDailyRows[hoveredDayIdx].dayOfWeek]} · {formatDateBR(visibleDailyRows[hoveredDayIdx].date)}
                      </span>
                      <span>
                        Visitantes: <strong>{visibleDailyRows[hoveredDayIdx].estimatedVisitors}</strong> · Pedidos:{' '}
                        <strong>{visibleDailyRows[hoveredDayIdx].ordersCount}</strong> · Receita:{' '}
                        <strong>{formatBRL(visibleDailyRows[hoveredDayIdx].revenue)}</strong> · Conversão:{' '}
                        <strong>
                          {visibleDailyRows[hoveredDayIdx].conversionRate !== null
                            ? `${visibleDailyRows[hoveredDayIdx].conversionRate}%`
                            : '—'}
                        </strong>
                      </span>
                    </>
                  ) : (
                    <span className="text-slate-400">
                      Passe o cursor sobre as barras para inspecionar visitantes, pedidos e taxa de conversão do dia.
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Hourly Distribution Chart */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 md:p-6 border border-slate-200 dark:border-slate-800 flex flex-col">
              <div className="mb-4">
                <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Fluxo por Faixa Horária
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Picos de circulação (08h às 23h)
                </p>
              </div>

              <div className="flex-1 flex items-end gap-1.5 pt-4 pb-2 min-h-[190px]">
                {visibleHourlyRows.map((h) => {
                  const visPct = Math.round((h.estimatedVisitors / hourlyMax) * 100);
                  const ordPct = Math.round((h.ordersCount / hourlyMax) * 100);
                  return (
                    <div
                      key={h.hour}
                      className="flex-1 flex flex-col items-center gap-1 group"
                      title={`${h.label}: ${h.estimatedVisitors} visitantes / ${h.ordersCount} pedidos`}
                    >
                      <div className="w-full h-36 flex items-end justify-center gap-0.5">
                        <div
                          style={{ height: `${Math.max(4, visPct)}%` }}
                          className={`w-1/2 rounded-t transition-all ${
                            h.isBusinessHour
                              ? 'bg-pink-300 dark:bg-pink-800/70'
                              : 'bg-slate-200 dark:bg-slate-700'
                          }`}
                        />
                        <div
                          style={{ height: `${Math.max(2, ordPct)}%` }}
                          className="w-1/2 rounded-t bg-pink-600 dark:bg-pink-500 transition-all"
                        />
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 tabular-nums">
                        {h.hour % 2 === 0 ? h.label : ''}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Horário pico:</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                  {(() => {
                    const top = [...visibleHourlyRows].sort((a, b) => b.estimatedVisitors - a.estimatedVisitors)[0];
                    return top && top.estimatedVisitors > 0 ? `${top.label} (${top.estimatedVisitors} vis.)` : 'Sem registros';
                  })()}
                </span>
              </div>
            </div>
          </div>

          {/* Daily Combined Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-5 md:p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Auditoria Diária: Sensor ESP32 × Vendas
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Passagens brutas filtradas por debounce, horário comercial e equipe
                </p>
              </div>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                Exibindo {visibleDailyRows.length} dias
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-800/40">
                    <th className="py-3 px-4">Data</th>
                    <th className="py-3 px-4 text-right">Bruto ESP32</th>
                    <th className="py-3 px-4 text-right">Horário Útil</th>
                    <th className="py-3 px-4 text-right">Visitantes Est.</th>
                    <th className="py-3 px-4 text-right">Pedidos</th>
                    <th className="py-3 px-4 text-right">Conversão</th>
                    <th className="py-3 px-4 text-right">Receita Est.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {visibleDailyRows
                    .slice()
                    .reverse()
                    .map((row) => (
                      <tr
                        key={row.date}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {WEEKDAY_SHORT[row.dayOfWeek]} · {formatDateBR(row.date)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {row.rawCrossings}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                          {row.validCrossingsInHours}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                          {row.estimatedVisitors}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-pink-600 dark:text-pink-400">
                          {row.ordersCount}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          {row.conversionRate !== null ? (
                            <span
                              className={
                                row.conversionRate >= 35
                                  ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                                  : row.conversionRate >= 20
                                  ? 'text-amber-600 dark:text-amber-400 font-semibold'
                                  : 'text-rose-600 dark:text-rose-400 font-semibold'
                              }
                            >
                              {row.conversionRate.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                          {formatBRL(row.revenue)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ML DEMAND FORECAST & WEATHER */}
      {activeSubTab === 'forecast' && (
        <div className="space-y-6">
          {/* Weather Location & ML Mode Controls */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 md:p-6 border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                <MapPin size={16} className="text-pink-600 dark:text-pink-400" />
                <span>Localidade:</span>
              </div>
              <select
                value={
                  PRESET_CITIES.find(
                    (c) => Math.abs(c.lat - location.lat) < 0.01 && Math.abs(c.lon - location.lon) < 0.01
                  )?.name || 'custom'
                }
                onChange={(e) => {
                  const found = PRESET_CITIES.find((c) => c.name === e.target.value);
                  if (found) setLocation({ lat: found.lat, lon: found.lon, label: found.name });
                }}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-pink-500"
              >
                {PRESET_CITIES.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
                {!PRESET_CITIES.some(
                  (c) => Math.abs(c.lat - location.lat) < 0.01 && Math.abs(c.lon - location.lon) < 0.01
                ) && <option value="custom">{weatherData?.location?.city || location.label}</option>}
              </select>

              <button
                type="button"
                onClick={handleUseGeolocation}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Navigation size={13} />
                Usar GPS
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-between lg:justify-end">
              {/* Prediction Mode Toggle */}
              <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPredictionMode('orders_weather')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    predictionMode === 'orders_weather'
                      ? 'bg-white dark:bg-slate-900 text-pink-600 dark:text-pink-400 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  Pedidos + Clima
                </button>
                <button
                  type="button"
                  onClick={() => setPredictionMode('orders_weather_conversion')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    predictionMode === 'orders_weather_conversion'
                      ? 'bg-white dark:bg-slate-900 text-pink-600 dark:text-pink-400 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  + Conversão ESP32
                </button>
              </div>

              {/* Horizon Toggle */}
              <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl flex items-center gap-1">
                {([7, 14] as const).map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setForecastHorizon(h)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold tabular-nums transition-colors whitespace-nowrap shrink-0 ${
                      forecastHorizon === h
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {h} dias
                  </button>
                ))}
              </div>
            </div>
          </div>

          {weatherError && (
            <div className="px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-medium flex items-center gap-2">
              <AlertCircle size={15} />
              <span>{weatherError}</span>
            </div>
          )}

          {/* ML Training Status & Elasticities */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Status de Treinamento
              </div>
              <div className="text-base font-bold text-slate-900 dark:text-slate-100">
                {mlForecast.trainingStatus === 'trained_real'
                  ? 'Treinado com Histórico Real'
                  : 'Modelo Híbrido (Prior + Real)'}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                {mlForecast.distinctDaysWithOrders} dias com pedidos · {mlForecast.distinctDaysWithSensor} dias com sensor
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Sensibilidade Térmica
              </div>
              <div className="text-base font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
                {mlForecast.tempImpactPerDegree >= 0 ? '+' : ''}
                {mlForecast.tempImpactPerDegree} pedidos / °C
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                Impacto de dias chuvosos: {mlForecast.rainImpactPct}% na demanda
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Receita Prevista ({forecastHorizon} dias)
              </div>
              <div className="text-base font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatBRL(mlForecast.forecasts.reduce((s, f) => s + f.estimatedRevenue, 0))}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                Total previsto: {mlForecast.forecasts.reduce((s, f) => s + f.predictedOrders, 0)} pedidos
              </p>
            </div>
          </div>

          {/* Historical Fit + Forecast Band Chart */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 md:p-6 border border-slate-200 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
              <div>
                <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Ajuste Histórico & Curva de Previsão ({forecastHorizon} dias)
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Série histórica recente (pedidos reais) seguida pela projeção com faixa de confiança
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-slate-800 dark:bg-slate-200 inline-block" />
                  Real
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-1 rounded-full bg-pink-600 inline-block" />
                  Previsto ML
                </span>
              </div>
            </div>

            <div className="overflow-x-auto no-scrollbar">
              <svg viewBox="0 0 760 250" className="w-full min-w-[580px] h-64">
                {[0, 0.25, 0.5, 0.75, 1].map((t, idx) => {
                  const y = 210 - t * 180;
                  return (
                    <g key={idx}>
                      <line
                        x1={44}
                        y1={y}
                        x2={745}
                        y2={y}
                        stroke="currentColor"
                        className="text-slate-100 dark:text-slate-800"
                        strokeDasharray="3 3"
                      />
                      <text x={36} y={y + 4} textAnchor="end" className="fill-slate-400 text-[10px] font-mono">
                        {Math.round(t * forecastChartMaxY)}
                      </text>
                    </g>
                  );
                })}

                {/* Confidence Band Polygon */}
                {forecastChartSeries.length > 1 && (
                  <polygon
                    fill="rgba(219, 39, 119, 0.12)"
                    points={[
                      ...forecastChartSeries.map((pt, i) => {
                        const step = 685 / Math.max(1, forecastChartSeries.length - 1);
                        const x = 52 + i * step;
                        const yMax = 210 - (pt.max / forecastChartMaxY) * 180;
                        return `${x},${yMax}`;
                      }),
                      ...forecastChartSeries
                        .slice()
                        .reverse()
                        .map((pt, revIdx) => {
                          const i = forecastChartSeries.length - 1 - revIdx;
                          const step = 685 / Math.max(1, forecastChartSeries.length - 1);
                          const x = 52 + i * step;
                          const yMin = 210 - (pt.min / forecastChartMaxY) * 180;
                          return `${x},${yMin}`;
                        }),
                    ].join(' ')}
                  />
                )}

                {/* Predicted Line */}
                {forecastChartSeries.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="#db2777"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={forecastChartSeries
                      .map((pt, i) => {
                        const step = 685 / Math.max(1, forecastChartSeries.length - 1);
                        const x = 52 + i * step;
                        const y = 210 - (pt.predicted / forecastChartMaxY) * 180;
                        return `${x},${y}`;
                      })
                      .join(' ')}
                  />
                )}

                {/* Actual Points */}
                {forecastChartSeries.map((pt, i) => {
                  const step = 685 / Math.max(1, forecastChartSeries.length - 1);
                  const x = 52 + i * step;
                  const yPred = 210 - (pt.predicted / forecastChartMaxY) * 180;
                  const yAct = pt.actual !== null ? 210 - (pt.actual / forecastChartMaxY) * 180 : null;

                  return (
                    <g key={pt.date}>
                      <circle
                        cx={x}
                        cy={yPred}
                        r={pt.isFuture ? 4 : 2.5}
                        className="fill-pink-600 stroke-white dark:stroke-slate-900"
                        strokeWidth={1.5}
                      />
                      {yAct !== null && (
                        <circle
                          cx={x}
                          cy={yAct}
                          r={3.5}
                          className="fill-slate-800 dark:fill-slate-100"
                        />
                      )}
                      {(forecastChartSeries.length <= 14 || i % 2 === 0) && (
                        <text x={x} y={232} textAnchor="middle" className="fill-slate-400 text-[10px] font-mono">
                          {formatDateBR(pt.date)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Model Comparison & Decision Rules */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 md:p-6 border border-slate-200 dark:border-slate-800">
              <h4 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-4">
                Comparativo de Modelos Preditivos
              </h4>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {mlForecast.comparisonMetrics.map((m) => (
                  <div key={m.key} className="py-3.5 first:pt-0 last:pb-0 flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <span>{m.name}</span>
                        {m.key === 'hybrid' && (
                          <span className="text-[11px] font-medium text-pink-600 dark:text-pink-400">
                            · Ativo na projeção
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{m.description}</p>
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0">
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        MAE: {m.mae}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">R²: {m.r2}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 md:p-6 border border-slate-200 dark:border-slate-800">
              <h4 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-4">
                Regras Climáticas & Sazonalidade Semanal
              </h4>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 mb-5">
                {mlForecast.treeRules.map((rule) => (
                  <div key={rule.condition} className="py-2.5 first:pt-0 flex items-center justify-between text-xs">
                    <span className="text-slate-700 dark:text-slate-300 font-medium">{rule.condition}</span>
                    <div className="flex items-center gap-3 font-mono tabular-nums">
                      <span className="text-slate-400">{rule.samples}d</span>
                      <span
                        className={
                          rule.adjustment >= 0
                            ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                            : 'text-rose-600 dark:text-rose-400 font-semibold'
                        }
                      >
                        {rule.adjustment >= 0 ? `+${rule.adjustment}` : rule.adjustment} ped.
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                {mlForecast.weekdayWeights.map((w) => (
                  <div
                    key={w.day}
                    className="text-center py-2 px-1 rounded-xl bg-slate-50 dark:bg-slate-800/60"
                  >
                    <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{w.label}</div>
                    <div className="text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                      {w.factor}x
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Daily Forecast Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-5 md:p-6 border-b border-slate-100 dark:border-slate-800">
              <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Previsão Operacional Diária ({forecastHorizon} dias)
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Recomendações de estoque e escala baseadas em temperatura, chuva e histórico
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-800/40">
                    <th className="py-3 px-4">Dia</th>
                    <th className="py-3 px-4">Clima</th>
                    <th className="py-3 px-4 text-right">Temp. (Mín/Máx)</th>
                    <th className="py-3 px-4 text-right">Chuva</th>
                    {predictionMode === 'orders_weather_conversion' && (
                      <th className="py-3 px-4 text-right">Visitantes Prev.</th>
                    )}
                    <th className="py-3 px-4 text-right">Pedidos Prev.</th>
                    <th className="py-3 px-4 text-right">Receita Est.</th>
                    <th className="py-3 px-4">Ação Recomendada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {mlForecast.forecasts.map((f) => (
                    <tr key={f.date} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {f.weekdayLabel} · {formatDateBR(f.date)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                          <WeatherIcon code={f.weatherCode} size={16} />
                          <span>{describeWeatherCode(f.weatherCode).label}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {Math.round(f.tempMin)}° / <strong>{Math.round(f.tempMax)}°C</strong>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {f.precipitationSum.toFixed(1)}mm ({f.precipitationProb}%)
                      </td>
                      {predictionMode === 'orders_weather_conversion' && (
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {f.predictedVisitors ?? '—'}
                        </td>
                      )}
                      <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <span className="font-bold text-pink-600 dark:text-pink-400">{f.predictedOrders}</span>
                        <span className="text-slate-400 ml-1">
                          ({f.predictedOrdersMin}–{f.predictedOrdersMax})
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {formatBRL(f.estimatedRevenue)}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300 max-w-xs">
                        {f.recommendation}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ESP32 CALIBRATION */}
      {activeSubTab === 'calibration' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 space-y-5">
            <div>
              <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Parâmetros do Sensor de Porta ESP32
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Ajuste como os disparos brutos do sensor são convertidos em visitantes reais da loja.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Modo de Contagem
                </label>
                <select
                  value={calibration.bidirectionalDivisor}
                  onChange={(e) =>
                    setCalibration((prev) => ({
                      ...prev,
                      bidirectionalDivisor: Number(e.target.value) === 1 ? 1 : 2,
                    }))
                  }
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-pink-500"
                >
                  <option value={2}>Bidirecional (÷ 2: entrada + saída)</option>
                  <option value={1}>Unidirecional (÷ 1: só entrada)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Janela de Debounce (segundos)
                </label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={calibration.debounceSeconds}
                  onChange={(e) =>
                    setCalibration((prev) => ({
                      ...prev,
                      debounceSeconds: Math.max(0, parseInt(e.target.value, 10) || 0),
                    }))
                  }
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-mono tabular-nums text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-pink-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Funcionários no Turno
                </label>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={calibration.staffCount}
                  onChange={(e) =>
                    setCalibration((prev) => ({
                      ...prev,
                      staffCount: Math.max(0, parseInt(e.target.value, 10) || 0),
                    }))
                  }
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-mono tabular-nums text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-pink-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Passagens/Dia por Funcionário
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={calibration.staffCrossingsPerDay}
                  onChange={(e) =>
                    setCalibration((prev) => ({
                      ...prev,
                      staffCrossingsPerDay: Math.max(0, parseInt(e.target.value, 10) || 0),
                    }))
                  }
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-mono tabular-nums text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-pink-500"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Filtrar passagens apenas no horário comercial
                </span>
                <input
                  type="checkbox"
                  checked={calibration.filterByBusinessHours}
                  onChange={(e) =>
                    setCalibration((prev) => ({ ...prev, filterByBusinessHours: e.target.checked }))
                  }
                  className="w-4 h-4 accent-pink-600 rounded"
                />
              </label>

              {calibration.filterByBusinessHours && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Seg–Sex Abre</label>
                    <input
                      type="time"
                      value={calibration.weekdayOpen}
                      onChange={(e) => setCalibration((prev) => ({ ...prev, weekdayOpen: e.target.value }))}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 text-xs font-mono text-slate-800 dark:text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Seg–Sex Fecha</label>
                    <input
                      type="time"
                      value={calibration.weekdayClose}
                      onChange={(e) => setCalibration((prev) => ({ ...prev, weekdayClose: e.target.value }))}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 text-xs font-mono text-slate-800 dark:text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Sáb–Dom Abre</label>
                    <input
                      type="time"
                      value={calibration.weekendOpen}
                      onChange={(e) => setCalibration((prev) => ({ ...prev, weekendOpen: e.target.value }))}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 text-xs font-mono text-slate-800 dark:text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Sáb–Dom Fecha</label>
                    <input
                      type="time"
                      value={calibration.weekendClose}
                      onChange={(e) => setCalibration((prev) => ({ ...prev, weekendClose: e.target.value }))}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 text-xs font-mono text-slate-800 dark:text-slate-200"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setCalibration(DEFAULT_CALIBRATION)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300"
              >
                Restaurar Padrão
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 space-y-5">
            <div>
              <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Integração de Hardware & Base de Testes
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Endpoint HTTP para o microcontrolador ESP32 enviar eventos de passagem na porta.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2 text-xs font-mono">
              <div className="text-slate-500 dark:text-slate-400">POST {window.location.origin}/api/esp32/led</div>
              <div className="text-slate-800 dark:text-slate-200">{`{"status": "1", "source": "esp32"}`}</div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleSimulateCrossing}
                className="px-4 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-xs font-semibold transition-colors"
              >
                Simular 1 Passagem Agora
              </button>
              <button
                type="button"
                onClick={handleSeedSampleEntries}
                disabled={sampleLoading}
                className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {sampleLoading ? 'Gerando...' : 'Gerar 30 Dias de Amostra'}
              </button>
              {sampleCount > 0 && (
                <button
                  type="button"
                  onClick={handleClearSampleEntries}
                  disabled={sampleLoading}
                  className="px-4 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  Limpar Dados de Amostra
                </button>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              <h5 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                Últimos 6 eventos recebidos
              </h5>
              {sensorEntries.length === 0 ? (
                <p className="text-xs text-slate-400">Nenhum evento registrado ainda.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {sensorEntries.slice(0, 6).map((entry) => {
                    const dt = parseTimestamp(entry.created_at);
                    return (
                      <div key={entry.id} className="py-2 flex items-center justify-between font-mono tabular-nums">
                        <span className="text-slate-700 dark:text-slate-300">
                          #{entry.id} · origem: {entry.source}
                        </span>
                        <span className="text-slate-400">
                          {dt ? dt.toLocaleString('pt-BR') : entry.created_at}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagerialDashboard;
