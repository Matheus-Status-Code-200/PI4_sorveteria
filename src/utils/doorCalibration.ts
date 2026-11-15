import {
  DailyCombinedRow,
  DoorCalibrationConfig,
  HourlyFlowRow,
  OrderRecord,
  ProductRecord,
  SensorEntry,
} from '../types/analytics';

export const DEFAULT_DOOR_CALIBRATION: DoorCalibrationConfig = {
  staffCount: 2,
  staffCrossingsPerDay: 4, // Entrada manhã, saída almoço, volta almoço, saída fim do expediente
  bidirectionalDivisor: 2, // Porta única: cliente cruza na entrada e na saída
  debounceSeconds: 2, // Evita oscilação na porta em < 2s
  filterByBusinessHours: true,
  weekdayOpen: '14:00',
  weekdayClose: '22:00',
  weekendOpen: '12:00',
  weekendClose: '23:00',
};

export function parsePriceNumber(price: string | number | undefined | null): number {
  if (price === undefined || price === null || price === '') return 0;
  let clean = String(price).trim().replace(/[R$\s]/g, '');
  const hasComma = clean.includes(',');
  const dotCount = (clean.match(/\./g) || []).length;
  if (hasComma || dotCount > 1) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  }
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

export function parseLocalDate(raw: string): Date {
  if (!raw) return new Date();
  // SQLite CURRENT_TIMESTAMP produces "YYYY-MM-DD HH:MM:SS" in UTC
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) {
    return new Date(raw.replace(' ', 'T') + 'Z');
  }
  return new Date(raw);
}

export function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseOrderItems(
  itemsText: string,
  products: ProductRecord[]
): {
  revenue: number;
  acaiUnits: number;
  sorveteUnits: number;
  itemBreakdown: Array<{ productName: string; category: 'acai' | 'sorvete' | 'outro'; quantity: number; revenue: number }>;
} {
  if (!itemsText) {
    return { revenue: 0, acaiUnits: 0, sorveteUnits: 0, itemBreakdown: [] };
  }

  const parts = itemsText
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  let revenue = 0;
  let acaiUnits = 0;
  let sorveteUnits = 0;
  const itemBreakdown: Array<{
    productName: string;
    category: 'acai' | 'sorvete' | 'outro';
    quantity: number;
    revenue: number;
  }> = [];

  for (const part of parts) {
    const match = part.match(/^(\d+)\s*x\s+(.+)$/i);
    const quantity = match ? Math.max(1, parseInt(match[1], 10)) : 1;
    const rawName = (match ? match[2] : part).trim();
    const lowerName = rawName.toLowerCase();

    const matchedProduct =
      products.find((p) => p.name.toLowerCase() === lowerName) ||
      products.find((p) => lowerName.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(lowerName));

    if (matchedProduct) {
      const unitPrice = parsePriceNumber(matchedProduct.price);
      const lineTotal = unitPrice * quantity;
      revenue += lineTotal;
      if (matchedProduct.category === 'acai') acaiUnits += quantity;
      else if (matchedProduct.category === 'sorvete') sorveteUnits += quantity;

      itemBreakdown.push({
        productName: matchedProduct.name,
        category: matchedProduct.category,
        quantity,
        revenue: lineTotal,
      });
    } else {
      // Fallback category inference by text
      const fallbackCat = lowerName.includes('açaí') || lowerName.includes('acai')
        ? 'acai'
        : lowerName.includes('sorvete') || lowerName.includes('casquinha') || lowerName.includes('milk')
        ? 'sorvete'
        : 'outro';
      if (fallbackCat === 'acai') acaiUnits += quantity;
      if (fallbackCat === 'sorvete') sorveteUnits += quantity;
      itemBreakdown.push({
        productName: rawName,
        category: fallbackCat,
        quantity,
        revenue: 0,
      });
    }
  }

  return { revenue, acaiUnits, sorveteUnits, itemBreakdown };
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((v) => parseInt(v, 10));
  if (isNaN(h)) return 0;
  return h * 60 + (isNaN(m) ? 0 : m);
}

function isWithinBusinessHours(date: Date, config: DoorCalibrationConfig): boolean {
  if (!config.filterByBusinessHours) return true;
  const day = date.getDay();
  const isWeekend = day === 0 || day === 6;
  const openMin = timeToMinutes(isWeekend ? config.weekendOpen : config.weekdayOpen);
  const closeMin = timeToMinutes(isWeekend ? config.weekendClose : config.weekdayClose);
  const currentMin = date.getHours() * 60 + date.getMinutes();
  return currentMin >= openMin && currentMin <= closeMin;
}

export function enumerateDateKeys(startDate: string, endDate: string): string[] {
  const result: string[] = [];
  const cursor = new Date(startDate + 'T12:00:00');
  const end = new Date(endDate + 'T12:00:00');
  if (isNaN(cursor.getTime()) || isNaN(end.getTime())) return result;
  let guard = 0;
  while (cursor <= end && guard < 366) {
    result.push(toLocalDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
    guard++;
  }
  return result;
}

export function calibrateDailyAndHourlyEntries(
  entries: SensorEntry[],
  orders: OrderRecord[],
  products: ProductRecord[],
  config: DoorCalibrationConfig,
  startDate: string,
  endDate: string
): {
  daily: DailyCombinedRow[];
  hourly: HourlyFlowRow[];
  totals: {
    rawCrossings: number;
    debouncedCrossings: number;
    validCrossingsInHours: number;
    staffAllowanceTotal: number;
    estimatedVisitors: number;
    totalOrders: number;
    conversionRate: number | null;
    peakHourLabel: string;
  };
} {
  const dateKeys = enumerateDateKeys(startDate, endDate);
  const dateSet = new Set(dateKeys);

  // Initialize daily map
  const dailyMap = new Map<string, DailyCombinedRow>();
  for (const key of dateKeys) {
    const dow = new Date(key + 'T12:00:00').getDay();
    dailyMap.set(key, {
      date: key,
      dayOfWeek: dow,
      ordersCount: 0,
      revenue: 0,
      acaiUnits: 0,
      sorveteUnits: 0,
      rawCrossings: 0,
      debouncedCrossings: 0,
      validCrossingsInHours: 0,
      staffAllowanceApplied: 0,
      estimatedVisitors: 0,
      conversionRate: null,
    });
  }

  // Hourly counters for hours 08..23
  const hourlyRaw = new Array<number>(24).fill(0);
  const hourlyOrders = new Array<number>(24).fill(0);
  const perDayHourlyValid = new Map<string, number[]>();

  // Aggregate orders
  for (const order of orders) {
    const dt = parseLocalDate(order.created_at);
    const key = toLocalDateKey(dt);
    const row = dailyMap.get(key);
    if (!row) continue;

    const parsed = parseOrderItems(order.items, products);
    row.ordersCount += 1;
    row.revenue += parsed.revenue;
    row.acaiUnits += parsed.acaiUnits;
    row.sorveteUnits += parsed.sorveteUnits;

    const hr = dt.getHours();
    hourlyOrders[hr] = (hourlyOrders[hr] || 0) + 1;
  }

  // Sort sensor entries chronologically for accurate temporal debounce
  const sortedEntries = [...entries]
    .map((e) => ({ entry: e, dt: parseLocalDate(e.created_at) }))
    .filter((item) => !isNaN(item.dt.getTime()))
    .sort((a, b) => a.dt.getTime() - b.dt.getTime());

  let lastAcceptedMs = -Infinity;
  const debounceMs = Math.max(0, config.debounceSeconds) * 1000;

  for (const { dt } of sortedEntries) {
    const key = toLocalDateKey(dt);
    if (!dateSet.has(key)) continue;

    const row = dailyMap.get(key)!;
    row.rawCrossings += 1;

    const ms = dt.getTime();
    if (debounceMs > 0 && ms - lastAcceptedMs < debounceMs) {
      continue;
    }
    lastAcceptedMs = ms;
    row.debouncedCrossings += 1;

    const hr = dt.getHours();
    if (isWithinBusinessHours(dt, config)) {
      row.validCrossingsInHours += 1;
      hourlyRaw[hr] += 1;
      if (!perDayHourlyValid.has(key)) {
        perDayHourlyValid.set(key, new Array<number>(24).fill(0));
      }
      perDayHourlyValid.get(key)![hr] += 1;
    }
  }

  // Apply daily staff deduction and bidirectional single-door division
  const hourlyVisitorsAccum = new Array<number>(24).fill(0);
  const dailyStaffAllowance = Math.max(0, config.staffCount) * Math.max(0, config.staffCrossingsPerDay);

  let totalRaw = 0;
  let totalDebounced = 0;
  let totalValid = 0;
  let totalStaffAllowance = 0;
  let totalVisitors = 0;
  let totalOrders = 0;

  for (const row of dailyMap.values()) {
    if (row.validCrossingsInHours > 0) {
      // Only deduct staff crossings on days with sensor activity (if store was open)
      const deducted = Math.min(row.validCrossingsInHours, dailyStaffAllowance);
      row.staffAllowanceApplied = deducted;
      const netCrossings = Math.max(0, row.validCrossingsInHours - deducted);
      row.estimatedVisitors = Math.round(netCrossings / config.bidirectionalDivisor);

      const scale = row.estimatedVisitors / row.validCrossingsInHours;
      const dayHours = perDayHourlyValid.get(row.date);
      if (dayHours) {
        for (let h = 0; h < 24; h++) {
          hourlyVisitorsAccum[h] += dayHours[h] * scale;
        }
      }
    } else {
      row.staffAllowanceApplied = 0;
      row.estimatedVisitors = 0;
    }

    row.conversionRate =
      row.estimatedVisitors > 0
        ? Math.min(100, (row.ordersCount / row.estimatedVisitors) * 100)
        : null;

    totalRaw += row.rawCrossings;
    totalDebounced += row.debouncedCrossings;
    totalValid += row.validCrossingsInHours;
    totalStaffAllowance += row.staffAllowanceApplied;
    totalVisitors += row.estimatedVisitors;
    totalOrders += row.ordersCount;
  }

  const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  const openMin = Math.min(timeToMinutes(config.weekdayOpen), timeToMinutes(config.weekendOpen));
  const closeMin = Math.max(timeToMinutes(config.weekdayClose), timeToMinutes(config.weekendClose));

  const hourly: HourlyFlowRow[] = [];
  let peakHourLabel = '--:--';
  let peakVal = -1;

  for (let h = 8; h <= 23; h++) {
    const estVis = Math.round(hourlyVisitorsAccum[h]);
    const ords = hourlyOrders[h];
    const hourMidMin = h * 60 + 30;
    const isBusiness = !config.filterByBusinessHours || (hourMidMin >= openMin && hourMidMin <= closeMin);
    const label = `${String(h).padStart(2, '0')}h`;

    if (estVis > peakVal && (estVis > 0 || hourlyRaw[h] > 0)) {
      peakVal = estVis;
      peakHourLabel = `${String(h).padStart(2, '0')}:00`;
    }

    hourly.push({
      hour: h,
      label,
      rawCrossings: hourlyRaw[h],
      estimatedVisitors: estVis,
      ordersCount: ords,
      conversionRate: estVis > 0 ? Math.min(100, (ords / estVis) * 100) : null,
      isBusinessHour: isBusiness,
    });
  }

  return {
    daily,
    hourly,
    totals: {
      rawCrossings: totalRaw,
      debouncedCrossings: totalDebounced,
      validCrossingsInHours: totalValid,
      staffAllowanceTotal: totalStaffAllowance,
      estimatedVisitors: totalVisitors,
      totalOrders,
      conversionRate: totalVisitors > 0 ? Math.min(100, (totalOrders / totalVisitors) * 100) : null,
      peakHourLabel,
    },
  };
}
