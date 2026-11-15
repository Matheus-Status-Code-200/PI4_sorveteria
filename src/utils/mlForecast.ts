import {
  DailyCombinedRow,
  DecisionRuleInsight,
  ForecastDayPrediction,
  HistoricalFittedPoint,
  MLForecastResult,
  ModelComparisonMetric,
  PredictionMode,
  WeatherDay,
} from '../types/analytics';

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// Domain-calibrated baseline prior (used smoothly when < 7 days of historical data exist)
const BASELINE_WEEKDAY_MULTIPLIER = [1.35, 0.72, 0.78, 0.85, 0.94, 1.18, 1.42]; // Dom..Sáb

interface TrainingPoint {
  date: string;
  dayOfWeek: number;
  tempMax: number;
  precipMm: number;
  isRainy: number;
  isWeekend: number;
  target: number;
}

function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivotRow][col])) {
        pivotRow = row;
      }
    }
    if (pivotRow !== col) {
      const temp = M[col];
      M[col] = M[pivotRow];
      M[pivotRow] = temp;
    }

    const pivot = M[col][col];
    if (Math.abs(pivot) < 1e-9) continue;

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

  return M.map((row) => (isFinite(row[n]) ? row[n] : 0));
}

function buildFeatureVector(
  point: { dayOfWeek: number; tempMax: number; precipMm: number; isRainy: number },
  tempMean: number,
  tempStd: number,
  precipStd: number
): number[] {
  // Reference day = Monday (1), dummies for Tue(2), Wed(3), Thu(4), Fri(5), Sat(6), Sun(0)
  const dowDummies = [
    point.dayOfWeek === 2 ? 1 : 0,
    point.dayOfWeek === 3 ? 1 : 0,
    point.dayOfWeek === 4 ? 1 : 0,
    point.dayOfWeek === 5 ? 1 : 0,
    point.dayOfWeek === 6 ? 1 : 0,
    point.dayOfWeek === 0 ? 1 : 0,
  ];
  const tempNorm = (point.tempMax - tempMean) / Math.max(1, tempStd);
  const precipNorm = point.precipMm / Math.max(2, precipStd);
  return [1, ...dowDummies, tempNorm, precipNorm, point.isRainy];
}

function fitRidgeRegression(points: TrainingPoint[], lambda = 1.5) {
  if (points.length === 0) {
    return {
      predict: () => 0,
      tempSlopePerDegree: 0.45,
      rainPenalty: -2.0,
      weights: [] as number[],
    };
  }

  const temps = points.map((p) => p.tempMax);
  const tempMean = temps.reduce((a, b) => a + b, 0) / temps.length;
  const tempVariance = temps.reduce((a, t) => a + (t - tempMean) ** 2, 0) / Math.max(1, temps.length);
  const tempStd = Math.max(2, Math.sqrt(tempVariance));

  const precips = points.map((p) => p.precipMm);
  const precipMean = precips.reduce((a, b) => a + b, 0) / precips.length;
  const precipStd = Math.max(
    3,
    Math.sqrt(precips.reduce((a, p) => a + (p - precipMean) ** 2, 0) / Math.max(1, precips.length))
  );

  const X = points.map((p) => buildFeatureVector(p, tempMean, tempStd, precipStd));
  const y = points.map((p) => p.target);
  const dim = X[0].length;

  // X^T X + lambda * I (do not penalize intercept at index 0)
  const XtX: number[][] = Array.from({ length: dim }, () => new Array(dim).fill(0));
  const Xty: number[] = new Array(dim).fill(0);

  for (let i = 0; i < X.length; i++) {
    for (let j = 0; j < dim; j++) {
      Xty[j] += X[i][j] * y[i];
      for (let k = 0; k < dim; k++) {
        XtX[j][k] += X[i][j] * X[i][k];
      }
    }
  }
  for (let j = 1; j < dim; j++) {
    XtX[j][j] += lambda;
  }

  const weights = solveLinearSystem(XtX, Xty);

  const predict = (p: { dayOfWeek: number; tempMax: number; precipMm: number; isRainy: number }) => {
    const vec = buildFeatureVector(p, tempMean, tempStd, precipStd);
    let sum = 0;
    for (let j = 0; j < dim; j++) sum += vec[j] * weights[j];
    return Math.max(0, sum);
  };

  // Index 7 is tempNorm, index 9 is isRainy
  const tempSlopePerDegree = weights[7] / tempStd;
  const rainPenalty = weights[9];

  return { predict, tempSlopePerDegree, rainPenalty, weights };
}

// Shallow CART Decision Tree for Stage-2 residual learning & standalone comparison
interface TreeNode {
  leafValue?: number;
  feature?: 'tempMax' | 'precipMm' | 'isWeekend';
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
  samples: number;
}

function buildCartTree(
  rows: Array<{ tempMax: number; precipMm: number; isWeekend: number; value: number }>,
  depth = 0,
  maxDepth = 3,
  minSamplesLeaf = 3
): TreeNode {
  const meanVal = rows.reduce((s, r) => s + r.value, 0) / Math.max(1, rows.length);
  if (depth >= maxDepth || rows.length < minSamplesLeaf * 2) {
    return { leafValue: meanVal, samples: rows.length };
  }

  const totalSSR = rows.reduce((s, r) => s + (r.value - meanVal) ** 2, 0);
  let bestSSR = totalSSR;
  let bestFeature: 'tempMax' | 'precipMm' | 'isWeekend' | null = null;
  let bestThreshold = 0;
  let bestLeft: typeof rows = [];
  let bestRight: typeof rows = [];

  const candidateSplits: Array<{ feature: 'tempMax' | 'precipMm' | 'isWeekend'; threshold: number }> = [];

  // Weekend split
  candidateSplits.push({ feature: 'isWeekend', threshold: 0.5 });

  // Temperature thresholds (unique sorted midpoints)
  const uniqueTemps = Array.from(new Set(rows.map((r) => Math.round(r.tempMax)))).sort((a, b) => a - b);
  for (let i = 0; i < uniqueTemps.length - 1; i++) {
    candidateSplits.push({ feature: 'tempMax', threshold: (uniqueTemps[i] + uniqueTemps[i + 1]) / 2 });
  }

  // Precipitation thresholds
  for (const pt of [0.5, 1.5, 4.0, 8.0]) {
    candidateSplits.push({ feature: 'precipMm', threshold: pt });
  }

  for (const split of candidateSplits) {
    const left = rows.filter((r) => r[split.feature] <= split.threshold);
    const right = rows.filter((r) => r[split.feature] > split.threshold);
    if (left.length < minSamplesLeaf || right.length < minSamplesLeaf) continue;

    const leftMean = left.reduce((s, r) => s + r.value, 0) / left.length;
    const rightMean = right.reduce((s, r) => s + r.value, 0) / right.length;
    const ssr =
      left.reduce((s, r) => s + (r.value - leftMean) ** 2, 0) +
      right.reduce((s, r) => s + (r.value - rightMean) ** 2, 0);

    if (ssr < bestSSR - 1e-6) {
      bestSSR = ssr;
      bestFeature = split.feature;
      bestThreshold = split.threshold;
      bestLeft = left;
      bestRight = right;
    }
  }

  // Only split if meaningful variance reduction (>= 5%)
  if (!bestFeature || totalSSR - bestSSR < totalSSR * 0.05) {
    return { leafValue: meanVal, samples: rows.length };
  }

  return {
    feature: bestFeature,
    threshold: bestThreshold,
    samples: rows.length,
    left: buildCartTree(bestLeft, depth + 1, maxDepth, minSamplesLeaf),
    right: buildCartTree(bestRight, depth + 1, maxDepth, minSamplesLeaf),
  };
}

function predictCartTree(
  node: TreeNode,
  sample: { tempMax: number; precipMm: number; isWeekend: number }
): number {
  if (node.leafValue !== undefined || !node.feature || node.threshold === undefined) {
    return node.leafValue ?? 0;
  }
  if (sample[node.feature] <= node.threshold) {
    return node.left ? predictCartTree(node.left, sample) : 0;
  }
  return node.right ? predictCartTree(node.right, sample) : 0;
}

function extractTreeRules(
  node: TreeNode,
  conditions: string[] = [],
  learningRate = 1
): DecisionRuleInsight[] {
  if (node.leafValue !== undefined || !node.feature || node.threshold === undefined) {
    const adj = node.leafValue ?? 0;
    if (conditions.length === 0 || Math.abs(adj * learningRate) < 0.25) return [];
    return [
      {
        condition: conditions.join(' e '),
        adjustment: Number((adj * learningRate).toFixed(1)),
        samples: node.samples,
      },
    ];
  }

  const leftCond =
    node.feature === 'isWeekend'
      ? 'Dia útil (Seg–Sex)'
      : node.feature === 'tempMax'
      ? `Temp ≤ ${node.threshold.toFixed(1)}°C`
      : `Chuva ≤ ${node.threshold.toFixed(1)}mm`;

  const rightCond =
    node.feature === 'isWeekend'
      ? 'Fim de semana (Sáb/Dom)'
      : node.feature === 'tempMax'
      ? `Temp > ${node.threshold.toFixed(1)}°C`
      : `Chuva > ${node.threshold.toFixed(1)}mm`;

  return [
    ...(node.left ? extractTreeRules(node.left, [...conditions, leftCond], learningRate) : []),
    ...(node.right ? extractTreeRules(node.right, [...conditions, rightCond], learningRate) : []),
  ];
}

function computeMetrics(actual: number[], predicted: number[]): { mae: number; r2: number } {
  if (actual.length === 0) return { mae: 0, r2: 0 };
  const n = actual.length;
  const mean = actual.reduce((s, v) => s + v, 0) / n;
  let absErr = 0;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    absErr += Math.abs(actual[i] - predicted[i]);
    ssRes += (actual[i] - predicted[i]) ** 2;
    ssTot += (actual[i] - mean) ** 2;
  }
  const mae = absErr / n;
  const r2 = ssTot > 1e-6 ? Math.max(0, Math.min(0.99, 1 - ssRes / ssTot)) : 0;
  return {
    mae: Number(mae.toFixed(2)),
    r2: Number(r2.toFixed(2)),
  };
}

function baselinePriorPredict(
  dayOfWeek: number,
  tempMax: number,
  precipMm: number,
  baseMean: number
): number {
  const safeBase = Math.max(6, baseMean);
  const dowFactor = BASELINE_WEEKDAY_MULTIPLIER[dayOfWeek] ?? 1.0;
  // +4.5% demand per °C above 25°C, -3.5% below 25°C
  const tempFactor = Math.max(0.55, 1 + (tempMax - 25) * 0.045);
  // Rain penalty: -25% on moderate rain, up to -45% on heavy rain
  const rainFactor = precipMm > 5 ? 0.58 : precipMm > 1.5 ? 0.74 : precipMm > 0.2 ? 0.9 : 1.0;
  return Math.max(1, safeBase * dowFactor * tempFactor * rainFactor);
}

export function trainAndPredictFlow(params: {
  dailyData: DailyCombinedRow[];
  weatherDaily: WeatherDay[];
  mode: PredictionMode;
  horizonDays: 7 | 14;
}): MLForecastResult {
  const { dailyData, weatherDaily, mode, horizonDays } = params;

  const weatherByDate = new Map<string, WeatherDay>();
  for (const w of weatherDaily) weatherByDate.set(w.date, w);

  const todayStr = new Date().toISOString().split('T')[0];

  // Calculate store average ticket from orders with revenue > 0
  const pricedOrders = dailyData.filter((d) => d.ordersCount > 0 && d.revenue > 0);
  const totalRev = pricedOrders.reduce((s, d) => s + d.revenue, 0);
  const totalOrdersWithRev = pricedOrders.reduce((s, d) => s + d.ordersCount, 0);
  const avgTicket = totalOrdersWithRev > 0 ? totalRev / totalOrdersWithRev : 24.5;

  const activeOrderDays = dailyData.filter((d) => d.ordersCount > 0);
  const activeSensorDays = dailyData.filter((d) => d.estimatedVisitors > 0);

  // Use historical window days that have weather AND either order activity or sensor activity
  const trainingPointsOrders: TrainingPoint[] = [];
  const trainingPointsVisitors: TrainingPoint[] = [];
  const conversionObservations: Array<{
    dayOfWeek: number;
    tempMax: number;
    isRainy: boolean;
    rate: number;
  }> = [];

  for (const row of dailyData) {
    if (row.date > todayStr) continue;
    const w = weatherByDate.get(row.date);
    if (!w) continue;
    // Include days once the store has started recording orders (or active days)
    if (row.ordersCount === 0 && row.estimatedVisitors === 0) continue;

    const isRainy = w.precipitationSum >= 1.5 ? 1 : 0;
    const isWeekend = row.dayOfWeek === 0 || row.dayOfWeek === 6 ? 1 : 0;

    trainingPointsOrders.push({
      date: row.date,
      dayOfWeek: row.dayOfWeek,
      tempMax: w.tempMax,
      precipMm: w.precipitationSum,
      isRainy,
      isWeekend,
      target: row.ordersCount,
    });

    if (row.estimatedVisitors > 0) {
      trainingPointsVisitors.push({
        date: row.date,
        dayOfWeek: row.dayOfWeek,
        tempMax: w.tempMax,
        precipMm: w.precipitationSum,
        isRainy,
        isWeekend,
        target: row.estimatedVisitors,
      });

      conversionObservations.push({
        dayOfWeek: row.dayOfWeek,
        tempMax: w.tempMax,
        isRainy: isRainy === 1,
        rate: Math.min(0.95, row.ordersCount / row.estimatedVisitors),
      });
    }
  }

  const useVisitorTarget = mode === 'orders_weather_conversion' && trainingPointsVisitors.length >= 3;
  const primaryPoints = useVisitorTarget ? trainingPointsVisitors : trainingPointsOrders;

  const distinctDays = primaryPoints.length;
  const trainingStatus: 'trained_real' | 'hybrid_prior' =
    distinctDays >= 7 ? 'trained_real' : 'hybrid_prior';

  const baseMean =
    primaryPoints.length > 0
      ? primaryPoints.reduce((s, p) => s + p.target, 0) / primaryPoints.length
      : useVisitorTarget
      ? 28
      : 14;

  // Stage 1: Ridge Linear Regression
  const ridge = fitRidgeRegression(primaryPoints, 1.5);

  // Stage 2: Residual CART Decision Tree (activated when >= 14 days for non-linear interactions)
  const residualLearningRate = 0.5;
  let residualTree: TreeNode | null = null;
  let standaloneTree: TreeNode | null = null;

  if (primaryPoints.length >= 10) {
    const residualRows = primaryPoints.map((p) => ({
      tempMax: p.tempMax,
      precipMm: p.precipMm,
      isWeekend: p.isWeekend,
      value: p.target - ridge.predict(p),
    }));
    residualTree = buildCartTree(residualRows, 0, 3, 3);

    const rawTreeRows = primaryPoints.map((p) => ({
      tempMax: p.tempMax,
      precipMm: p.precipMm,
      isWeekend: p.isWeekend,
      value: p.target,
    }));
    standaloneTree = buildCartTree(rawTreeRows, 0, 3, 3);
  }

  // Blend alpha for few historical days (< 7 days)
  const alpha = Math.min(1, distinctDays / 7);

  const predictTargetValue = (input: {
    dayOfWeek: number;
    tempMax: number;
    precipMm: number;
    isRainy: number;
    isWeekend: number;
  }) => {
    const priorVal = baselinePriorPredict(input.dayOfWeek, input.tempMax, input.precipMm, baseMean);
    if (primaryPoints.length === 0) return priorVal;

    const ridgeVal = ridge.predict(input);
    const residualAdj = residualTree ? predictCartTree(residualTree, input) * residualLearningRate : 0;
    const modelVal = Math.max(0, ridgeVal + residualAdj);
    return alpha * modelVal + (1 - alpha) * priorVal;
  };

  // Global & conditional conversion rate model (Mode B)
  const avgConversionRate =
    conversionObservations.length > 0
      ? conversionObservations.reduce((s, c) => s + c.rate, 0) / conversionObservations.length
      : 0.58;

  const predictConversionRate = (dayOfWeek: number, tempMax: number, precipMm: number): number => {
    if (conversionObservations.length === 0) {
      // Sensible prior conversion rate adjusted gently by weather
      const warmBonus = tempMax >= 28 ? 0.05 : tempMax <= 20 ? -0.05 : 0;
      const rainPenalty = precipMm >= 1.5 ? -0.04 : 0;
      return Math.max(0.25, Math.min(0.9, 0.58 + warmBonus + rainPenalty));
    }

    const sameDow = conversionObservations.filter((c) => c.dayOfWeek === dayOfWeek);
    const dowMean =
      sameDow.length > 0
        ? sameDow.reduce((s, c) => s + c.rate, 0) / sameDow.length
        : avgConversionRate;

    const isRainy = precipMm >= 1.5;
    const sameRain = conversionObservations.filter((c) => c.isRainy === isRainy);
    const rainMean =
      sameRain.length > 0
        ? sameRain.reduce((s, c) => s + c.rate, 0) / sameRain.length
        : avgConversionRate;

    // Regularized shrink toward global average conversion
    const blended = 0.45 * avgConversionRate + 0.35 * dowMean + 0.2 * rainMean;
    return Math.max(0.15, Math.min(0.95, blended));
  };

  // Evaluate model comparison metrics on historical points
  const actualArr = primaryPoints.map((p) => p.target);
  const ridgePreds = primaryPoints.map((p) => ridge.predict(p));
  const treePreds = primaryPoints.map((p) =>
    standaloneTree ? predictCartTree(standaloneTree, p) : baseMean
  );
  const hybridPreds = primaryPoints.map((p) => predictTargetValue(p));

  const ridgeMetrics = computeMetrics(actualArr, ridgePreds);
  const treeMetrics = computeMetrics(actualArr, treePreds);
  const hybridMetrics = computeMetrics(actualArr, hybridPreds);

  const comparisonMetrics: ModelComparisonMetric[] = [
    {
      name: 'Regressão Linear (Ridge)',
      key: 'ridge',
      mae: ridgeMetrics.mae,
      r2: ridgeMetrics.r2,
      description: 'Tendência contínua de temperatura, chuva e dia da semana.',
    },
    {
      name: 'Árvore de Decisão (CART)',
      key: 'tree',
      mae: treeMetrics.mae,
      r2: treeMetrics.r2,
      description: 'Regras não-lineares combinadas (sem extrapolação térmica).',
    },
    {
      name: 'Híbrido (Ridge + Árvore)',
      key: 'hybrid',
      mae: hybridMetrics.mae,
      r2: hybridMetrics.r2,
      description: 'Base linear Ridge + ajustes não-lineares da árvore nos resíduos.',
    },
  ];

  const treeRules: DecisionRuleInsight[] = residualTree
    ? extractTreeRules(residualTree, [], residualLearningRate)
        .sort((a, b) => Math.abs(b.adjustment) - Math.abs(a.adjustment))
        .slice(0, 6)
    : [];

  // Historical fitted series for chart
  const historicalSeries: HistoricalFittedPoint[] = trainingPointsOrders.slice(-30).map((pt) => {
    const isRainy = pt.isRainy;
    const isWeekend = pt.isWeekend;
    const fittedRaw = predictTargetValue({
      dayOfWeek: pt.dayOfWeek,
      tempMax: pt.tempMax,
      precipMm: pt.precipMm,
      isRainy,
      isWeekend,
    });
    const conv = predictConversionRate(pt.dayOfWeek, pt.tempMax, pt.precipMm);
    const matchingDaily = dailyData.find((d) => d.date === pt.date);

    return {
      date: pt.date,
      actualOrders: pt.target,
      fittedOrders: useVisitorTarget ? Math.round(fittedRaw * conv) : Math.round(fittedRaw),
      actualVisitors: matchingDaily?.estimatedVisitors ?? 0,
      fittedVisitors: useVisitorTarget ? Math.round(fittedRaw) : undefined,
      tempMax: pt.tempMax,
      precipitationSum: pt.precipMm,
    };
  });

  // Weekday weights summary
  const weekdayWeights = [0, 1, 2, 3, 4, 5, 6].map((day) => {
    const pts = trainingPointsOrders.filter((p) => p.dayOfWeek === day);
    const avg =
      pts.length > 0
        ? pts.reduce((s, p) => s + p.target, 0) / pts.length
        : (BASELINE_WEEKDAY_MULTIPLIER[day] ?? 1) * (baseMean > 0 ? baseMean : 12);
    const globalAvg =
      trainingPointsOrders.length > 0
        ? trainingPointsOrders.reduce((s, p) => s + p.target, 0) / trainingPointsOrders.length
        : baseMean > 0
        ? baseMean
        : 12;
    return {
      day,
      label: WEEKDAY_LABELS[day],
      factor: Number((avg / Math.max(1, globalAvg)).toFixed(2)),
      avgOrders: Number(avg.toFixed(1)),
    };
  });

  // Future predictions (horizonDays)
  const futureWeather = weatherDaily.filter((w) => w.date >= todayStr).slice(0, horizonDays);
  const spreadMargin = Math.max(2, Math.round(hybridMetrics.mae || 3));

  const forecasts: ForecastDayPrediction[] = futureWeather.map((w) => {
    const dt = new Date(w.date + 'T12:00:00');
    const dow = dt.getDay();
    const isRainy = w.precipitationSum >= 1.5 ? 1 : 0;
    const isWeekend = dow === 0 || dow === 6 ? 1 : 0;

    const rawPred = predictTargetValue({
      dayOfWeek: dow,
      tempMax: w.tempMax,
      precipMm: w.precipitationSum,
      isRainy,
      isWeekend,
    });

    let predictedVisitors: number | undefined;
    let predictedConversionRate: number | undefined;
    let predictedOrders: number;

    if (mode === 'orders_weather_conversion') {
      const conv = predictConversionRate(dow, w.tempMax, w.precipitationSum);
      const vis = Math.max(1, Math.round(useVisitorTarget ? rawPred : rawPred / Math.max(0.2, conv)));
      predictedVisitors = vis;
      predictedConversionRate = Number((conv * 100).toFixed(1));
      predictedOrders = Math.max(1, Math.round(vis * conv));
    } else {
      predictedOrders = Math.max(1, Math.round(rawPred));
    }

    const predictedOrdersMin = Math.max(0, predictedOrders - spreadMargin);
    const predictedOrdersMax = predictedOrders + spreadMargin;

    let recommendation = 'Operação padrão de estoque e equipe.';
    let impactLevel: 'high' | 'medium' | 'low' = 'medium';

    if (w.tempMax >= 29 && w.precipitationSum < 1.5 && (isWeekend || predictedOrders >= baseMean * 1.15)) {
      recommendation = 'Dia quente favorável: reforçar estoque de açaí e escala de atendimento.';
      impactLevel = 'high';
    } else if (w.precipitationSum >= 4) {
      recommendation = 'Chuva prevista: focar em delivery/promoções e ajustar preparo imediato.';
      impactLevel = 'low';
    } else if (isWeekend) {
      recommendation = 'Movimento típico de fim de semana: preparar complementos extras.';
      impactLevel = 'high';
    }

    return {
      date: w.date,
      dayOfWeek: dow,
      weekdayLabel: WEEKDAY_LABELS[dow],
      tempMax: Number(w.tempMax.toFixed(1)),
      tempMin: Number(w.tempMin.toFixed(1)),
      precipitationSum: Number(w.precipitationSum.toFixed(1)),
      precipitationProb: Math.round(w.precipitationProb),
      weatherCode: w.weatherCode,
      predictedOrders,
      predictedOrdersMin,
      predictedOrdersMax,
      predictedVisitors,
      predictedConversionRate,
      estimatedRevenue: Number((predictedOrders * avgTicket).toFixed(2)),
      recommendation,
      impactLevel,
    };
  });

  // Compute interpretable thermal impact & rain impact percentage
  const tempImpactPerDegree =
    primaryPoints.length >= 5
      ? Number(ridge.tempSlopePerDegree.toFixed(2))
      : Number((baseMean * 0.045).toFixed(2));

  const dryPts = primaryPoints.filter((p) => p.isRainy === 0);
  const rainPts = primaryPoints.filter((p) => p.isRainy === 1);
  let rainImpactPct = -24;
  if (dryPts.length >= 2 && rainPts.length >= 1) {
    const dryAvg = dryPts.reduce((s, p) => s + p.target, 0) / dryPts.length;
    const rainAvg = rainPts.reduce((s, p) => s + p.target, 0) / rainPts.length;
    if (dryAvg > 0) {
      rainImpactPct = Math.round(((rainAvg - dryAvg) / dryAvg) * 100);
    }
  }

  return {
    mode,
    trainingStatus,
    distinctDaysWithOrders: activeOrderDays.length,
    distinctDaysWithSensor: activeSensorDays.length,
    totalDaysAnalyzed: dailyData.length,
    avgTicket: Number(avgTicket.toFixed(2)),
    avgConversionRate: Number((avgConversionRate * 100).toFixed(1)),
    tempImpactPerDegree,
    rainImpactPct,
    weekdayWeights,
    comparisonMetrics,
    treeRules,
    historicalSeries,
    forecasts,
  };
}
