"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

type AxisMode = "paid" | "total";
type SystemName = "old" | "new";

type Model = {
  goal: number[];
  distributions: number[][];
  expectedDistinct: number[];
  expectedPu: number[];
  expectedStars: number[];
  expectedOffBanner: number[];
};

type LineSeries = {
  name: string;
  color: string;
  values: number[];
  dashed?: boolean;
};

type DistributionBucket = {
  key: string;
  label: string;
  subLabel?: string;
  oldValue: number;
  newValue: number;
  emphasis?: "goal" | "upside";
};

const MAX_AXIS = 800;
const MAX_TOTAL = 900;
const TICKET_MILESTONES = new Set([70, 130, 150, 170, 270, 330, 350, 370]);
const OLD_COLOR = "#1479c9";
const NEW_COLOR = "#f2646a";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatPercent(value: number, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

function probabilityAtLeast(values: number[], threshold: number) {
  return values.reduce((sum, value, count) => count >= threshold ? sum + (value ?? 0) : sum, 0);
}

function makeTicketMaps() {
  const totalForPaid = new Array<number>(MAX_AXIS + 1).fill(0);
  let total = 0;
  let tickets = 0;

  for (let paid = 1; paid <= MAX_AXIS; paid += 1) {
    total += 1;
    if (TICKET_MILESTONES.has(total)) tickets += 10;
    while (tickets > 0) {
      tickets -= 1;
      total += 1;
      if (TICKET_MILESTONES.has(total)) tickets += 10;
    }
    totalForPaid[paid] = total;
  }

  const paidForTotal = new Array<number>(MAX_TOTAL + 1).fill(0);
  let paid = 0;
  tickets = 0;
  for (let pull = 1; pull <= MAX_TOTAL; pull += 1) {
    if (tickets > 0) tickets -= 1;
    else paid += 1;
    if (TICKET_MILESTONES.has(pull)) tickets += 10;
    paidForTotal[pull] = paid;
  }

  return { totalForPaid, paidForTotal };
}

const TICKET_MAPS = makeTicketMaps();

function computeOldPuDistributions(puRate: number) {
  let state = [1];
  const distributions: number[][] = [state];

  for (let pull = 1; pull <= MAX_TOTAL; pull += 1) {
    const next = new Array<number>(state.length + 1).fill(0);
    for (let count = 0; count < state.length; count += 1) {
      next[count] += state[count] * (1 - puRate);
      next[count + 1] += state[count] * puRate;
    }
    state = pull % 200 === 0 ? [0, ...next] : next;
    distributions[pull] = state;
  }

  return distributions;
}

function computeNewPuDistributions(puRate: number) {
  const stateWidth = 200;
  const epsilon = 1e-15;
  let state = new Map<number, number>([[0, 1]]);
  const distributions: number[][] = [[1]];

  for (let pull = 1; pull <= MAX_TOTAL; pull += 1) {
    const next = new Map<number, number>();
    for (const [key, mass] of state) {
      const count = Math.floor(key / stateWidth);
      const charge = key % stateWidth;
      const nextCharge = charge + 1;
      const hitRate = nextCharge === 200 ? 1 : nextCharge === 100 ? 0.5 : puRate;
      const hitMass = mass * hitRate;
      const missMass = mass * (1 - hitRate);

      if (hitMass > epsilon) {
        const hitKey = (count + 1) * stateWidth;
        next.set(hitKey, (next.get(hitKey) ?? 0) + hitMass);
      }
      if (missMass > epsilon) {
        const missKey = count * stateWidth + nextCharge;
        next.set(missKey, (next.get(missKey) ?? 0) + missMass);
      }
    }

    state = next;
    let maxCount = 0;
    let totalMass = 0;
    for (const [key, mass] of state) {
      maxCount = Math.max(maxCount, Math.floor(key / stateWidth));
      totalMass += mass;
    }
    const dist = new Array<number>(maxCount + 1).fill(0);
    for (const [key, mass] of state) dist[Math.floor(key / stateWidth)] += mass / totalMass;
    distributions[pull] = dist;
  }

  return distributions;
}

function makeTargetDistributionBuckets(targetCount: number, oldValues: number[], newValues: number[]): DistributionBucket[] {
  return Array.from({ length: targetCount + 1 }, (_, count) => ({
    key: String(count),
    label: `${count}人`,
    subLabel: count === targetCount ? "全員確保" : undefined,
    oldValue: oldValues[count] ?? 0,
    newValue: newValues[count] ?? 0,
    emphasis: count === targetCount ? "goal" as const : undefined,
  })).filter((bucket) => bucket.oldValue > 1e-12 || bucket.newValue > 1e-12);
}

function makePuDistributionBuckets(targetCount: number, oldValues: number[], newValues: number[]): DistributionBucket[] {
  const length = Math.max(oldValues.length, newValues.length);
  const visibleThreshold = 0.0005;
  const visibleCounts = Array.from({ length }, (_, count) => count).filter((count) => (
    Math.max(oldValues[count] ?? 0, newValues[count] ?? 0) >= visibleThreshold
  ));
  const first = visibleCounts[0] ?? 0;
  const last = visibleCounts.at(-1) ?? 0;
  const buckets: DistributionBucket[] = [];

  const lowerOld = oldValues.slice(0, first).reduce((sum, value) => sum + value, 0);
  const lowerNew = newValues.slice(0, first).reduce((sum, value) => sum + value, 0);
  if (Math.max(lowerOld, lowerNew) >= visibleThreshold) {
    buckets.push({
      key: `under-${first}`,
      label: `${first - 1}回以下`,
      oldValue: lowerOld,
      newValue: lowerNew,
    });
  }

  for (let count = first; count <= last; count += 1) {
    buckets.push({
      key: String(count),
      label: `${count}回`,
      subLabel: count > targetCount ? "目標人数超え" : count === targetCount ? "目標人数" : undefined,
      oldValue: oldValues[count] ?? 0,
      newValue: newValues[count] ?? 0,
      emphasis: count > targetCount ? "upside" : count === targetCount ? "goal" : undefined,
    });
  }

  const upperOld = oldValues.slice(last + 1).reduce((sum, value) => sum + value, 0);
  const upperNew = newValues.slice(last + 1).reduce((sum, value) => sum + value, 0);
  if (Math.max(upperOld, upperNew) >= visibleThreshold) {
    buckets.push({
      key: `over-${last}`,
      label: `${last + 1}回以上`,
      subLabel: "目標人数超え",
      oldValue: upperOld,
      newValue: upperNew,
      emphasis: "upside",
    });
  }

  return buckets;
}

function computeOldModel(targetCount: number, puRate: number, starRate: number): Model {
  let state = new Float64Array(targetCount + 1);
  state[0] = 1;

  const goal = new Array<number>(MAX_TOTAL + 1).fill(0);
  const distributions = new Array<number[]>(MAX_TOTAL + 1);
  const expectedDistinct = new Array<number>(MAX_TOTAL + 1).fill(0);
  const expectedPu = new Array<number>(MAX_TOTAL + 1).fill(0);
  const expectedStars = new Array<number>(MAX_TOTAL + 1).fill(0);
  const expectedOffBanner = new Array<number>(MAX_TOTAL + 1).fill(0);
  distributions[0] = Array.from(state);

  for (let pull = 1; pull <= MAX_TOTAL; pull += 1) {
    let next = new Float64Array(targetCount + 1);
    for (let count = 0; count <= targetCount; count += 1) {
      const mass = state[count];
      if (!mass) continue;
      if (count === targetCount) {
        next[count] += mass;
      } else {
        next[count] += mass * (1 - puRate);
        next[count + 1] += mass * puRate;
      }
    }

    if (pull % 200 === 0) {
      const afterExchange = new Float64Array(targetCount + 1);
      for (let count = 0; count <= targetCount; count += 1) {
        afterExchange[Math.min(targetCount, count + 1)] += next[count];
      }
      next = afterExchange;
    }

    state = next;
    const dist = Array.from(state);
    distributions[pull] = dist;
    goal[pull] = dist[targetCount];
    expectedDistinct[pull] = dist.reduce((sum, mass, count) => sum + mass * count, 0);
    expectedPu[pull] = pull * puRate + Math.floor(pull / 200);
    expectedStars[pull] = pull * starRate + Math.floor(pull / 200);
    expectedOffBanner[pull] = pull * Math.max(0, starRate - puRate);
  }

  return { goal, distributions, expectedDistinct, expectedPu, expectedStars, expectedOffBanner };
}

function computeNewDistinct(targetCount: number, puRate: number) {
  let state = Array.from({ length: targetCount + 1 }, () => new Float64Array(200));
  state[0][0] = 1;

  const goal = new Array<number>(MAX_TOTAL + 1).fill(0);
  const distributions = new Array<number[]>(MAX_TOTAL + 1);
  const expectedDistinct = new Array<number>(MAX_TOTAL + 1).fill(0);
  distributions[0] = [1, ...new Array<number>(targetCount).fill(0)];

  for (let pull = 1; pull <= MAX_TOTAL; pull += 1) {
    const next = Array.from({ length: targetCount + 1 }, () => new Float64Array(200));

    for (let count = 0; count <= targetCount; count += 1) {
      for (let charge = 0; charge < 200; charge += 1) {
        const mass = state[count][charge];
        if (!mass) continue;
        if (count === targetCount) {
          next[count][0] += mass;
          continue;
        }

        const nextCharge = charge + 1;
        const hitRate = nextCharge === 200 ? 1 : nextCharge === 100 ? 0.5 : puRate;
        next[count + 1][0] += mass * hitRate;
        if (hitRate < 1) next[count][nextCharge] += mass * (1 - hitRate);
      }
    }

    state = next;
    const dist = new Array<number>(targetCount + 1).fill(0);
    for (let count = 0; count <= targetCount; count += 1) {
      for (let charge = 0; charge < 200; charge += 1) dist[count] += state[count][charge];
    }
    distributions[pull] = dist;
    goal[pull] = dist[targetCount];
    expectedDistinct[pull] = dist.reduce((sum, mass, count) => sum + mass * count, 0);
  }

  return { goal, distributions, expectedDistinct };
}

function computeNewContinuous(puRate: number, starRate: number) {
  let state = new Float64Array(200);
  state[0] = 1;
  const expectedPu = new Array<number>(MAX_TOTAL + 1).fill(0);
  const expectedStars = new Array<number>(MAX_TOTAL + 1).fill(0);
  const expectedOffBanner = new Array<number>(MAX_TOTAL + 1).fill(0);

  for (let pull = 1; pull <= MAX_TOTAL; pull += 1) {
    const next = new Float64Array(200);
    let puIncrement = 0;
    let starIncrement = 0;

    for (let charge = 0; charge < 200; charge += 1) {
      const mass = state[charge];
      if (!mass) continue;
      const nextCharge = charge + 1;
      const hitRate = nextCharge === 200 ? 1 : nextCharge === 100 ? 0.5 : puRate;
      const thisStarRate = nextCharge === 100 || nextCharge === 200 ? 1 : starRate;
      puIncrement += mass * hitRate;
      starIncrement += mass * thisStarRate;
      next[0] += mass * hitRate;
      if (hitRate < 1) next[nextCharge] += mass * (1 - hitRate);
    }

    state = next;
    expectedPu[pull] = expectedPu[pull - 1] + puIncrement;
    expectedStars[pull] = expectedStars[pull - 1] + starIncrement;
    expectedOffBanner[pull] = expectedStars[pull] - expectedPu[pull];
  }

  return { expectedPu, expectedStars, expectedOffBanner };
}

function computeNewModel(targetCount: number, puRate: number, starRate: number): Model {
  const distinct = computeNewDistinct(targetCount, puRate);
  const continuous = computeNewContinuous(puRate, starRate);
  return { ...distinct, ...continuous };
}

function pullAtAxis(axis: AxisMode, system: SystemName, value: number) {
  if (axis === "total" || system === "old") return value;
  return TICKET_MAPS.totalForPaid[value];
}

function makeAxisValues(values: number[], axis: AxisMode, system: SystemName) {
  return Array.from({ length: MAX_AXIS + 1 }, (_, value) => values[pullAtAxis(axis, system, value)] ?? values.at(-1) ?? 0);
}

function completionStats(goal: number[], axis: AxisMode, system: SystemName, targetCount: number) {
  const guarantee = targetCount * 200;
  let mean = 0;
  let previous = 0;
  for (let pull = 1; pull <= guarantee; pull += 1) {
    const probability = Math.max(0, goal[pull] - previous);
    const cost = axis === "paid" && system === "new" ? TICKET_MAPS.paidForTotal[pull] : pull;
    mean += probability * cost;
    previous = goal[pull];
  }

  const quantile = (q: number) => {
    for (let pull = 1; pull <= guarantee; pull += 1) {
      if (goal[pull] + 1e-12 >= q) {
        return axis === "paid" && system === "new" ? TICKET_MAPS.paidForTotal[pull] : pull;
      }
    }
    return axis === "paid" && system === "new" ? TICKET_MAPS.paidForTotal[guarantee] : guarantee;
  };

  return {
    mean,
    median: quantile(0.5),
    p90: quantile(0.9),
    p95: quantile(0.95),
    worst: axis === "paid" && system === "new" ? TICKET_MAPS.paidForTotal[guarantee] : guarantee,
  };
}

function CostValue({ value, axis, compact = false }: { value: number; axis: AxisMode; compact?: boolean }) {
  const pulls = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
  if (axis === "total") return <>{pulls}連</>;
  return (
    <>
      {pulls}連分
      {!compact && <span className="cost-sub">青輝石 約{Math.round(value * 120).toLocaleString("ja-JP")}個</span>}
    </>
  );
}

function LineChart({
  title,
  description,
  series,
  percent = false,
  axisLabel,
  maxX = MAX_AXIS,
  guides = [],
  summary,
  valueSuffix = "",
}: {
  title: string;
  description: string;
  series: LineSeries[];
  percent?: boolean;
  axisLabel: string;
  maxX?: number;
  guides?: { x: number; label: string; color?: string; offsetY?: number }[];
  summary?: ReactNode;
  valueSuffix?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const maxY = useMemo(() => {
    if (percent) return 1;
    const max = Math.max(1, ...series.flatMap((item) => item.values));
    return Math.ceil(max * 1.08 * 2) / 2;
  }, [percent, series]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * ratio));
      canvas.height = Math.max(1, Math.floor(rect.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      const width = rect.width;
      const height = rect.height;
      const padding = { left: 48, right: 16, top: 18, bottom: 34 };
      const chartWidth = width - padding.left - padding.right;
      const chartHeight = height - padding.top - padding.bottom;
      context.clearRect(0, 0, width, height);
      context.font = "11px var(--font-geist-sans), sans-serif";
      context.lineWidth = 1;

      for (let i = 0; i <= 4; i += 1) {
        const y = padding.top + (chartHeight * i) / 4;
        context.strokeStyle = "#dce9f4";
        context.beginPath();
        context.moveTo(padding.left, y);
        context.lineTo(width - padding.right, y);
        context.stroke();
        const value = maxY * (1 - i / 4);
        context.fillStyle = "#60758a";
        context.textAlign = "right";
        context.textBaseline = "middle";
        context.fillText(percent ? `${Math.round(value * 100)}%` : value.toFixed(value < 4 ? 1 : 0), padding.left - 8, y);
      }

      for (let step = 0; step <= 4; step += 1) {
        const xValue = Math.round((maxX * step) / 4);
        const x = padding.left + (chartWidth * xValue) / maxX;
        context.fillStyle = "#60758a";
        context.textAlign = "center";
        context.textBaseline = "top";
        context.fillText(String(xValue), x, height - padding.bottom + 9);
      }

      for (const guide of guides) {
        if (guide.x > maxX) continue;
        const x = padding.left + (chartWidth * guide.x) / maxX;
        context.strokeStyle = guide.color ?? "#7b91a377";
        context.lineWidth = 1;
        context.setLineDash([4, 4]);
        context.beginPath();
        context.moveTo(x, padding.top);
        context.lineTo(x, padding.top + chartHeight);
        context.stroke();
        context.setLineDash([]);
        context.fillStyle = guide.color ?? "#4f687b";
        context.textAlign = "left";
        context.textBaseline = "top";
        context.font = "700 10px var(--font-geist-sans), sans-serif";
        context.fillText(guide.label, x + 7, padding.top + 5 + (guide.offsetY ?? 0));
      }

      for (const item of series) {
        context.strokeStyle = item.color;
        context.lineWidth = item.dashed ? 2 : 2.5;
        context.setLineDash(item.dashed ? [8, 6] : []);
        context.lineJoin = "round";
        context.beginPath();
        item.values.forEach((value, index) => {
          const x = padding.left + (chartWidth * index) / maxX;
          const y = padding.top + chartHeight * (1 - clamp(value / maxY, 0, 1));
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.stroke();
      }
      context.setLineDash([]);

      if (hoverIndex !== null) {
        const x = padding.left + (chartWidth * hoverIndex) / maxX;
        context.strokeStyle = "#19324b55";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(x, padding.top);
        context.lineTo(x, padding.top + chartHeight);
        context.stroke();
        for (const item of series) {
          const value = item.values[hoverIndex] ?? 0;
          const y = padding.top + chartHeight * (1 - clamp(value / maxY, 0, 1));
          context.fillStyle = "white";
          context.beginPath();
          context.arc(x, y, 4.5, 0, Math.PI * 2);
          context.fill();
          context.strokeStyle = item.color;
          context.lineWidth = 2.5;
          context.stroke();
        }
      }
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [guides, hoverIndex, maxX, maxY, percent, series]);

  const handlePointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const index = Math.round(clamp((event.clientX - rect.left - 48) / Math.max(1, rect.width - 64), 0, 1) * maxX);
    setHoverIndex(index);
  };

  return (
    <article className="chart-card">
      <div className="chart-heading">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <div className="legend" aria-label="凡例">
          {series.map((item) => (
            <span key={item.name}><i className={item.dashed ? "dashed" : ""} style={item.dashed ? { borderColor: item.color } : { backgroundColor: item.color }} />{item.name}</span>
          ))}
        </div>
      </div>
      <div className="chart-wrap">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`${title}。横軸は${axisLabel}。${series.map((item) => item.name).join("、")}を比較。`}
          onPointerMove={handlePointer}
          onPointerLeave={() => setHoverIndex(null)}
        />
        {hoverIndex !== null && (
          <div
            className="chart-tooltip"
            style={{
              left: `${clamp((hoverIndex / maxX) * 100, 8, 92)}%`,
              transform: hoverIndex / maxX > 0.68 ? "translateX(-100%)" : undefined,
            }}
          >
            <strong>{hoverIndex}連{axisLabel === "青輝石消費" ? "分" : ""}</strong>
            {series.map((item) => (
              <span key={item.name}><i className={item.dashed ? "dashed" : ""} style={item.dashed ? { borderColor: item.color } : { backgroundColor: item.color }} />{item.name} {percent ? formatPercent(item.values[hoverIndex], 1) : `${item.values[hoverIndex].toFixed(2)}${valueSuffix}`}</span>
            ))}
          </div>
        )}
      </div>
      {summary}
    </article>
  );
}

function DistributionChart({
  title,
  description,
  buckets,
  xAxisLabel,
  axisMax,
  note,
  summary,
}: {
  title: string;
  description: string;
  buckets: DistributionBucket[];
  xAxisLabel: string;
  axisMax?: number;
  note?: string;
  summary?: ReactNode;
}) {
  const largestValue = Math.max(0, ...buckets.flatMap((bucket) => [bucket.oldValue, bucket.newValue]));
  const resolvedAxisMax = axisMax ?? clamp(Math.ceil(largestValue * 12) / 10, 0.1, 1);
  const ticks = Array.from({ length: 5 }, (_, index) => resolvedAxisMax * (1 - index / 4));
  const ariaDescription = buckets.map((bucket) => (
    `${bucket.label}は旧仕様${formatPercent(bucket.oldValue, 1)}、新仕様${formatPercent(bucket.newValue, 1)}`
  )).join("。 ");

  return (
    <article className="distribution-chart-card">
      <div className="distribution-chart-heading">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <div className="legend distribution-legend" aria-label="凡例">
          <span><i style={{ backgroundColor: OLD_COLOR }} />旧仕様</span>
          <span><i style={{ backgroundColor: NEW_COLOR }} />新仕様</span>
        </div>
      </div>

      <div className="distribution-chart" role="img" aria-label={`${title}。縦軸は確率、横軸は${xAxisLabel}。${ariaDescription}。`}>
        <div className="distribution-y-title">確率</div>
        <div className="distribution-y-axis" aria-hidden="true">
          {ticks.map((value) => <span key={value}>{formatPercent(value, value < 0.1 ? 1 : 0)}</span>)}
        </div>
        <div className="distribution-scroll">
          <div className="distribution-plot" style={{ minWidth: `${Math.max(620, buckets.length * 90)}px` }}>
            <div className="distribution-gridlines" aria-hidden="true">
              {ticks.map((value) => <i key={value} />)}
            </div>
            {buckets.map((bucket) => {
              const oldValue = bucket.oldValue;
              const newValue = bucket.newValue;
              return (
                <div className={`distribution-group${bucket.emphasis ? ` ${bucket.emphasis}` : ""}`} key={bucket.key}>
                  <div className="distribution-columns" aria-hidden="true">
                    <div className="distribution-bar-column">
                      <div className="distribution-bar-visual" style={{ height: `${(oldValue / resolvedAxisMax) * 100}%` }}>
                        <b>{formatPercent(oldValue, 1)}</b>
                        <i className="distribution-column old" />
                      </div>
                    </div>
                    <div className="distribution-bar-column">
                      <div className="distribution-bar-visual" style={{ height: `${(newValue / resolvedAxisMax) * 100}%` }}>
                        <b>{formatPercent(newValue, 1)}</b>
                        <i className="distribution-column new" />
                      </div>
                    </div>
                  </div>
                  <div className="distribution-x-label">
                    <strong>{bucket.label}</strong>
                    {bucket.subLabel && <small>{bucket.subLabel}</small>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="distribution-x-title">{xAxisLabel}</div>
      </div>
      {summary}
      {note && <p className="distribution-note">{note}</p>}
    </article>
  );
}

export default function Home() {
  const [axis, setAxis] = useState<AxisMode>("paid");
  const [targetCount, setTargetCount] = useState(2);
  const [budget, setBudget] = useState(200);
  const [puPercent, setPuPercent] = useState(0.7);
  const [starPercent, setStarPercent] = useState(3.0);

  const puRate = clamp(Math.min(puPercent, starPercent) / 100, 0, 1);
  const starRate = clamp(starPercent / 100, 0, 1);
  const oldModel = useMemo(() => computeOldModel(targetCount, puRate, starRate), [targetCount, puRate, starRate]);
  const newModel = useMemo(() => computeNewModel(targetCount, puRate, starRate), [targetCount, puRate, starRate]);
  const oldOneModel = useMemo(() => computeOldModel(1, puRate, starRate), [puRate, starRate]);
  const newOneModel = useMemo(() => computeNewModel(1, puRate, starRate), [puRate, starRate]);
  const oldTwoModel = useMemo(() => computeOldModel(2, puRate, starRate), [puRate, starRate]);
  const newTwoModel = useMemo(() => computeNewModel(2, puRate, starRate), [puRate, starRate]);
  const oldPuDistributions = useMemo(() => computeOldPuDistributions(puRate), [puRate]);
  const newPuDistributions = useMemo(() => computeNewPuDistributions(puRate), [puRate]);

  const oldPulls = pullAtAxis(axis, "old", budget);
  const newPulls = pullAtAxis(axis, "new", budget);
  const oldGoal = oldModel.goal[oldPulls];
  const newGoal = newModel.goal[newPulls];
  const oldStats = completionStats(oldModel.goal, axis, "old", targetCount);
  const newStats = completionStats(newModel.goal, axis, "new", targetCount);
  const goalDelta = newGoal - oldGoal;
  const oldTargetDistribution = oldModel.distributions[oldPulls] ?? [1];
  const newTargetDistribution = newModel.distributions[newPulls] ?? [1];
  const oldPuDistribution = oldPuDistributions[oldPulls] ?? [1];
  const newPuDistribution = newPuDistributions[newPulls] ?? [1];
  const targetDistributionBuckets = makeTargetDistributionBuckets(targetCount, oldTargetDistribution, newTargetDistribution);
  const puDistributionBuckets = makePuDistributionBuckets(targetCount, oldPuDistribution, newPuDistribution);
  const upsideThreshold = targetCount + 1;
  const oldUpsideProbability = probabilityAtLeast(oldPuDistribution, upsideThreshold);
  const newUpsideProbability = probabilityAtLeast(newPuDistribution, upsideThreshold);

  const goalSeries = useMemo<LineSeries[]>(() => [
    { name: "旧仕様", color: OLD_COLOR, values: makeAxisValues(oldModel.goal, axis, "old") },
    { name: "新仕様", color: NEW_COLOR, values: makeAxisValues(newModel.goal, axis, "new") },
  ], [axis, newModel.goal, oldModel.goal]);

  const puSeries = useMemo<LineSeries[]>(() => [
    { name: "旧仕様", color: OLD_COLOR, values: makeAxisValues(oldModel.expectedPu, axis, "old") },
    { name: "新仕様", color: NEW_COLOR, values: makeAxisValues(newModel.expectedPu, axis, "new") },
  ], [axis, newModel.expectedPu, oldModel.expectedPu]);

  const starSeries = useMemo<LineSeries[]>(() => [
    { name: "旧仕様", color: OLD_COLOR, values: makeAxisValues(oldModel.expectedStars, axis, "old") },
    { name: "新仕様", color: NEW_COLOR, values: makeAxisValues(newModel.expectedStars, axis, "new") },
  ], [axis, newModel.expectedStars, oldModel.expectedStars]);

  const reassuranceSeries = useMemo<LineSeries[]>(() => [
    { name: "旧仕様：2人全員", color: OLD_COLOR, values: makeAxisValues(oldTwoModel.goal, "paid", "old").slice(0, 401) },
    { name: "新仕様：2人全員", color: NEW_COLOR, values: makeAxisValues(newTwoModel.goal, "paid", "new").slice(0, 401) },
    { name: "旧仕様：1人確保", color: "#5d9fce", dashed: true, values: makeAxisValues(oldOneModel.goal, "paid", "old").slice(0, 401) },
    { name: "新仕様：1人確保", color: "#e99299", dashed: true, values: makeAxisValues(newOneModel.goal, "paid", "new").slice(0, 401) },
  ], [newOneModel.goal, newTwoModel.goal, oldOneModel.goal, oldTwoModel.goal]);

  const winningRunRows = [100, 200].map((paid) => {
    const newPullsAtPaid = pullAtAxis("paid", "new", paid);
    return {
      paid,
      newPulls: newPullsAtPaid,
      oldOne: oldOneModel.goal[paid],
      newOne: newOneModel.goal[newPullsAtPaid],
      oldTwo: oldTwoModel.goal[paid],
      newTwo: newTwoModel.goal[newPullsAtPaid],
    };
  });
  const oneHundred = winningRunRows[0];
  const twoHundred = winningRunRows[1];
  const twoHundredDelta = twoHundred.newTwo - twoHundred.oldTwo;
  const twoHundredComparison = Math.abs(twoHundredDelta) < 0.0005
    ? "ほぼ同水準"
    : `新仕様が${Math.abs(twoHundredDelta * 100).toFixed(1)}ポイント${twoHundredDelta > 0 ? "高い" : "低い"}`;

  const checkpointValues = axis === "paid" ? [100, 160, 200, 240, 300, 320, 400, 600, 800] : [100, 199, 200, 300, 400, 600, 800];
  const verdict = Math.abs(goalDelta) < 0.005
    ? "この予算では、全員そろう確率はほぼ互角です。"
    : goalDelta > 0
      ? `この予算では、新仕様が ${Math.abs(goalDelta * 100).toFixed(1)}ポイント高確率です。`
      : `この予算では、旧仕様が ${Math.abs(goalDelta * 100).toFixed(1)}ポイント高確率です。`;

  return (
    <main>
      <header className="hero">
        <nav className="topbar" aria-label="ページ内ナビゲーション">
          <a className="brand" href="#top" aria-label="期待値ラボの先頭へ">
            <span className="brand-mark">Σ</span>
            <span><b>募集期待値ラボ</b><small>UNOFFICIAL CALCULATOR</small></span>
          </a>
          <div className="nav-links">
            <a href="#result">比較結果</a>
            <a href="#details">指標</a>
            <a href="#assumptions">計算前提</a>
            <a href="#columns">コラム</a>
          </div>
        </nav>

        <section className="hero-grid" id="top">
          <div className="hero-copy">
            <span className="eyebrow">2026 募集システム新旧比較</span>
            <h1>その石で、<br /><em>何人そろう？</em></h1>
            <p>目標のPU生徒が全員そろう確率・必要コスト・PUと★3の平均獲得回数を、旧交換方式と新チャージ方式で同じ条件から比較します。</p>
            <a className="source-link" href="https://bluearchive.jp/news/newsJump/679" target="_blank" rel="noreferrer">公式告知の前提を確認 ↗</a>
          </div>

          <div className="control-panel" aria-label="計算条件">
            <div className="control-block">
              <span className="control-label">比較する横軸</span>
              <div className="segmented two" role="group" aria-label="比較軸">
                <button className={axis === "paid" ? "active" : ""} onClick={() => setAxis("paid")} aria-pressed={axis === "paid"}>青輝石消費</button>
                <button className={axis === "total" ? "active" : ""} onClick={() => setAxis("total")} aria-pressed={axis === "total"}>総募集回数</button>
              </div>
              <p className="control-help">{axis === "paid" ? "無料チケットを差し引いた、実際に石を使う回数で比較" : "無料分を含め、画面上で実行した募集回数で比較"}</p>
            </div>

            <div className="control-block">
              <span className="control-label">そろえたいPU生徒の人数</span>
              <div className="segmented four" role="group" aria-label="目標PU人数">
                {[1, 2, 3, 4].map((count) => (
                  <button key={count} className={targetCount === count ? "active" : ""} onClick={() => setTargetCount(count)} aria-pressed={targetCount === count}>{count}人</button>
                ))}
              </div>
            </div>

            <div className="budget-control">
              <div className="budget-head">
                <label htmlFor="budget">{axis === "paid" ? "青輝石予算" : "総募集回数"}</label>
                <strong>{axis === "paid" ? `${(budget * 120).toLocaleString("ja-JP")}個` : `${budget}連`}</strong>
              </div>
              <input id="budget" type="range" min="0" max={MAX_AXIS} step="10" value={budget} onChange={(event) => setBudget(Number(event.target.value))} />
              <div className="budget-foot"><span>0</span><span>{axis === "paid" ? `${budget}連分` : "800連"}</span><span>{axis === "paid" ? "96,000個" : "800"}</span></div>
            </div>

            <div className="pull-comparison">
              <div><span>旧仕様</span><strong>{oldPulls}連</strong></div>
              <div className="arrow">→</div>
              <div><span>新仕様</span><strong>{newPulls}連</strong></div>
              {axis === "paid" && <span className="ticket-chip">特典 +{newPulls - budget}連</span>}
            </div>
          </div>
        </section>
      </header>

      <section className="results section-shell" id="result">
        <div className="section-heading">
          <div>
            <span className="eyebrow">RESULT AT {budget}</span>
            <h2>目標の{targetCount}人が全員そろう確率</h2>
            <p className="term-note">このラボでは、これを短く「全員確保率」と呼びます。</p>
          </div>
          <p className={goalDelta >= 0 ? "verdict new-win" : "verdict old-win"}>{verdict}</p>
        </div>

        <div className="probability-showcase">
          <article className="system-result old">
            <span className="system-tag">旧仕様</span>
            <strong>{formatPercent(oldGoal, 1)}</strong>
            <div className="meter"><i style={{ width: `${oldGoal * 100}%` }} /></div>
            <p>{oldPulls}連時点</p>
          </article>
          <div className="delta-orb">
            <span>差</span>
            <strong>{goalDelta >= 0 ? "+" : ""}{(goalDelta * 100).toFixed(1)}pt</strong>
          </div>
          <article className="system-result new">
            <span className="system-tag">新仕様</span>
            <strong>{formatPercent(newGoal, 1)}</strong>
            <div className="meter"><i style={{ width: `${newGoal * 100}%` }} /></div>
            <p>{newPulls}連時点{axis === "paid" ? `（無料${newPulls - budget}連込み）` : ""}</p>
          </article>
        </div>

        <div className="metric-grid summary-two">
          <article className="metric-card">
            <span>予算を使い切ると、PUは平均何回手に入る？</span>
            <div><b>{oldModel.expectedPu[oldPulls].toFixed(2)}<em>回</em></b><i>→</i><b>{newModel.expectedPu[newPulls].toFixed(2)}<em>回</em></b></div>
            <small>旧仕様 → 新仕様 / 交換・保証・重複を含む平均獲得回数</small>
          </article>
          <article className="metric-card">
            <span>★3は平均何回手に入る？</span>
            <div><b>{oldModel.expectedStars[oldPulls].toFixed(2)}<em>回</em></b><i>→</i><b>{newModel.expectedStars[newPulls].toFixed(2)}<em>回</em></b></div>
            <small>旧仕様 → 新仕様 / PU・すり抜け・交換・確定枠を含む平均獲得回数</small>
          </article>
        </div>
      </section>

      <section className="chart-section section-shell" id="details">
        <div className="section-heading compact">
          <div>
            <span className="eyebrow">0 — 800</span>
            <h2>予算を動かして、差の形を見る</h2>
          </div>
          <p>線に触れると、その地点の数値を確認できます。</p>
        </div>

        <LineChart
          title={`目標の${targetCount}人が全員そろう確率（全員確保率）`}
          description="予算ごとに、目標のPU生徒を全員確保できる確率を比較"
          series={goalSeries}
          percent
          axisLabel={axis === "paid" ? "青輝石消費" : "総募集回数"}
        />

        <div className="chart-grid">
          <LineChart
            title="PU獲得回数の期待値"
            description="予算をすべて使ったとき、交換・保証・重複を含めてPUを平均何回獲得するか"
            series={puSeries}
            axisLabel={axis === "paid" ? "青輝石消費" : "総募集回数"}
            valueSuffix="回"
          />
          <LineChart
            title="★3獲得回数の期待値"
            description="PU・すり抜け・交換・確定枠を含めて★3を平均何回獲得するか"
            series={starSeries}
            axisLabel={axis === "paid" ? "青輝石消費" : "総募集回数"}
            valueSuffix="回"
          />
        </div>
      </section>

      <section className="distribution-section section-shell">
        <div className="section-heading compact">
          <div>
            <span className="eyebrow">OUTCOME DISTRIBUTION</span>
            <h2>{budget}{axis === "paid" ? "連分の石" : "連"}で、結果はどう分かれる？</h2>
          </div>
          <p>目標未達の内訳と、予算を使い切ったときの上振れを、別々の確率分布で確認します。</p>
        </div>
        <DistributionChart
          title={`目標${targetCount}人のうち、何人そろう？`}
          description="同じPU生徒の重複は数えません。旧仕様・新仕様ともに確率が0%の人数は省略しています。"
          buckets={targetDistributionBuckets}
          xAxisLabel="確保できた目標PU生徒の人数"
          axisMax={1}
        />
        <DistributionChart
          title="PUは合計何回手に入る？"
          description="予算を最後まで使った場合の分布です。交換・保証・同じPU生徒の重複も、すべて1回の獲得として数えます。"
          buckets={puDistributionBuckets}
          xAxisLabel="PU獲得回数"
          summary={(
            <div className="distribution-summary">
              <div>
                <span>平均獲得回数</span>
                <strong className="old-text">旧 {oldModel.expectedPu[oldPulls].toFixed(2)}回</strong>
                <strong className="new-text">新 {newModel.expectedPu[newPulls].toFixed(2)}回</strong>
              </div>
              <div>
                <span>目標人数を超える{upsideThreshold}回以上</span>
                <strong className="old-text">旧 {formatPercent(oldUpsideProbability, 1)}</strong>
                <strong className="new-text">新 {formatPercent(newUpsideProbability, 1)}</strong>
              </div>
            </div>
          )}
          note="平均獲得回数は、各回数にその確率を掛けて足し合わせた値です。目標人数を超えた回数も含むため、そろえたい人数より大きくなることがあります。"
        />
      </section>

      <section className="cost-section section-shell">
        <div className="section-heading compact">
          <div>
            <span className="eyebrow">COST TO COMPLETE</span>
            <h2>全員確保までのコスト感</h2>
          </div>
          <p>{axis === "paid" ? "青輝石を消費する募集回数。新仕様は特典チケットを即時使用。" : "無料分を含む、実際に行う総募集回数。"}</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>指標</th><th className="old-text">旧仕様</th><th className="new-text">新仕様</th><th>差</th></tr></thead>
            <tbody>
              {([
                ["平均", oldStats.mean, newStats.mean],
                ["中央値", oldStats.median, newStats.median],
                ["90%ライン", oldStats.p90, newStats.p90],
                ["95%ライン", oldStats.p95, newStats.p95],
                ["最悪保証", oldStats.worst, newStats.worst],
              ] as [string, number, number][]).map(([label, oldValue, newValue]) => (
                <tr key={label}>
                  <th>{label}</th>
                  <td><CostValue value={oldValue} axis={axis} /></td>
                  <td><CostValue value={newValue} axis={axis} /></td>
                  <td className={newValue <= oldValue ? "new-text" : "old-text"}>{newValue - oldValue > 0 ? "+" : ""}{(newValue - oldValue).toFixed(Number.isInteger(newValue - oldValue) ? 0 : 1)}連</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="checkpoint-section section-shell">
        <div className="section-heading compact">
          <div>
            <span className="eyebrow">CHECKPOINTS</span>
            <h2>主要予算で全員そろう確率</h2>
          </div>
        </div>
        <div className="checkpoint-list">
          {checkpointValues.map((value) => {
            const oldN = pullAtAxis(axis, "old", value);
            const newN = pullAtAxis(axis, "new", value);
            return (
              <article key={value}>
                <strong>{value}{axis === "paid" ? "連分" : "連"}</strong>
                {axis === "paid" && <small>青輝石 {(value * 120).toLocaleString("ja-JP")}個</small>}
                <div><span className="old-text">旧 {formatPercent(oldModel.goal[oldN], 1)}</span><span className="new-text">新 {formatPercent(newModel.goal[newN], 1)}</span></div>
                {axis === "paid" && <p>新仕様は総{newN}連</p>}
              </article>
            );
          })}
        </div>
      </section>

      <section className="assumptions section-shell" id="assumptions">
        <div className="assumption-copy">
          <span className="eyebrow">MODEL & ASSUMPTIONS</span>
          <h2>計算前提を見える場所に</h2>
          <p>既定値は通常時の★3率3.0%、選択中PU率0.7%。新仕様は100チャージで★3確定かつ50%でPU、200チャージでPU確定、PU獲得時にチャージをリセットするモデルです。</p>
          <p>異なるPUを狙う場合は、1人確保するたびに次のPU募集へ切り替える戦略で計算します。新仕様の募集回数特典は獲得後すぐ同じ開催中に使用し、その無料募集も次の特典進捗へ加算します。</p>
        </div>
        <div className="rate-editor">
          <label>★3排出率 <span>{starPercent.toFixed(1)}%</span><input type="range" min="1" max="10" step="0.1" value={starPercent} onChange={(event) => setStarPercent(Number(event.target.value))} /></label>
          <label>選択中PU率 <span>{puPercent.toFixed(1)}%</span><input type="range" min="0.1" max="2" step="0.1" value={puPercent} onChange={(event) => setPuPercent(Number(event.target.value))} /></label>
          {puPercent > starPercent && <p className="rate-warning">PU率は★3率を超えない値として計算しています。</p>}
          <div className="ticket-road" aria-label="10連チケット獲得タイミング">
            <span>10連特典</span>
            {[70, 130, 150, 170, 270, 330, 350, 370].map((point) => <i key={point}>{point}</i>)}
          </div>
        </div>
      </section>

      <section className="column-section section-shell" id="columns">
        <header className="column-group-heading">
          <span className="eyebrow">THREE COLUMNS</span>
          <h2>数字の意味から、<br />ガチャを引く気持ちまで。</h2>
          <p>計算結果の読み方と、新旧仕様で変わるガチャ体験を、三つのコラムに分けて整理します。</p>
          <nav className="column-toc" aria-label="コラム一覧">
            <a href="#column-rate"><span>01</span><b>確率と期待値</b></a>
            <a href="#column-winning"><span>02</span><b>ウィニングラン</b></a>
            <a href="#column-feeling"><span>03</span><b>旧仕様が好きだった理由</b></a>
          </nav>
        </header>

        <article className="column-story" id="column-rate">
          <header className="column-story-heading">
            <div className="column-kicker"><span>01</span><small>RATE ≠ AVERAGE</small></div>
            <h3>「全員そろう確率」と「期待値」は、答えている問いが違う</h3>
            <p>目標の全員がそろわない下振れを知りたい場面で、期待値だけを示しても問いへの回答にはなりません。一方で、「期待値は下振れを考慮していない」という説明も正確ではありません。</p>
          </header>
          <div className="metric-definition-grid">
            <article>
              <span>全員そろう確率（全員確保率）</span>
              <h4>予算内に、目標の2人がそろう確率</h4>
              <p>このラボでは短く「全員確保率」と呼びます。目標未達の確率は「100% − 全員そろう確率」です。2人を必ず狙う人が知りたい下振れリスクを、そのまま確認できます。</p>
              <strong>目標未達の確率 ＝ 100% − 全員そろう確率</strong>
            </article>
            <article>
              <span>平均でそろう人数（期待値）</span>
              <h4>0人・1人・2人の全結果を平均した人数</h4>
              <p>期待値にも0人や1人の下振れは、発生確率を掛けて含まれています。ただし、一つの平均値へ畳み込まれるため、「2人そろわない確率」は期待値だけでは分かりません。</p>
              <strong>期待値 ＝ 0×P(0人) ＋ 1×P(1人) ＋ 2×P(2人)</strong>
            </article>
          </div>
          <p className="metric-conclusion">「平均で何人そろうか」を比べるなら期待値、「予算内に全員そろわない危険がどれだけあるか」を比べるなら全員そろう確率を使います。どちらも下振れを含みますが、下振れを直接示せるのは全員そろう確率です。</p>
        </article>

        <article className="column-story" id="column-winning">
          <header className="column-story-heading">
            <div className="column-kicker"><span>02</span><small>WINNING RUN / PU {(puRate * 100).toFixed(1)}%</small></div>
            <h3>ウィニングランは、気持ちいい。<br />それでも新仕様のほうが早い。</h3>
            <p className="column-lead">旧仕様には、200連という分かりやすいゴールがあります。途中で1人引ければ、残りは交換で2人目を迎えるまで走るだけ。結果が見えた瞬間に緊張が解け、残りの募集がウィニングランへ変わります。</p>
            <p>ただし、気持ちよさと実際のリターンは別の話です。破線は「1人確保してウィニングランへ入った確率」、実線は「2人とも確保し終えた確率」を示します。</p>
          </header>

          <div className="focus-chart">
            <LineChart
              title="ウィニングランは、どこから始まる？"
              description="破線は1人以上を確保できる確率、実線は2人とも確保できる確率。同じ青輝石予算で、新旧それぞれどこまで進めるかを比較します。"
              series={reassuranceSeries}
              percent
              axisLabel="青輝石消費"
              maxX={400}
              guides={[
                { x: TICKET_MAPS.paidForTotal[200], label: "新：1人保証", color: "#d86f79" },
                { x: 200, label: "旧：1人保証", color: "#3184bd", offsetY: 15 },
              ]}
            />
          </div>

          <div className="winning-checkpoints" aria-label="100連分と200連分の比較">
            {winningRunRows.map((row) => (
              <article key={row.paid}>
                <header><strong>{row.paid}連分の石</strong><small>新仕様は特典込み総{row.newPulls}連</small></header>
                <div className="winning-system old">
                  <b>旧仕様</b>
                  <span>1人以上そろう確率 <strong>{formatPercent(row.oldOne, 1)}</strong></span>
                  <span>2人ともそろう確率 <strong>{formatPercent(row.oldTwo, 1)}</strong></span>
                </div>
                <div className="winning-system new">
                  <b>新仕様</b>
                  <span>1人以上そろう確率 <strong>{formatPercent(row.newOne, 1)}</strong></span>
                  <span>2人ともそろう確率 <strong>{formatPercent(row.newTwo, 1)}</strong></span>
                </div>
              </article>
            ))}
          </div>

          <div className="column-copy-grid">
            <article>
              <span className="column-number">A</span>
              <h4>新仕様は、ウィニングランへの入口が早い</h4>
              <p>{oneHundred.paid}連分の石では、旧仕様で1人以上を確保している確率は{formatPercent(oneHundred.oldOne, 1)}です。新仕様は無料募集と100チャージの50%PU枠を含めて{formatPercent(oneHundred.newOne, 1)}。2人とも確保済みの確率も、旧仕様の{formatPercent(oneHundred.oldTwo, 1)}に対して新仕様は{formatPercent(oneHundred.newTwo, 1)}です。</p>
              <p>旧仕様は「引いた後に残り回数が見える」ため、安心感を強く自覚できます。新仕様は同じ演出を持ちませんが、確率上はより早い段階から1人を確保し、2人確保の完了にも近づいています。</p>
            </article>
            <article>
              <span className="column-number">B</span>
              <h4>固定ゴールを失っても、結果まで失うわけではない</h4>
              <p>新仕様は特典募集により、青輝石160連分で総200連へ到達し、遅くとも1人を確保します。旧仕様が1人を保証するのは青輝石200連分です。保証の見え方は変わっても、ウィニングランへ入る時点は新仕様のほうが早くなります。</p>
              <p>同じ200連分の石で2人とも確保できる確率は、旧仕様{formatPercent(twoHundred.oldTwo, 1)}、新仕様{formatPercent(twoHundred.newTwo, 1)}です。現在のPU率では{twoHundredComparison}です。旧仕様の気持ちよさを手放すことは、確保結果の悪化を意味しません。</p>
            </article>
          </div>
        </article>

        <article className="column-story" id="column-feeling">
          <header className="column-story-heading">
            <div className="column-kicker"><span>03</span><small>THE FEELING OF A PULL</small></div>
            <h3>数字では新仕様がお得。<br />それでも旧仕様が好きだった理由</h3>
            <p>新仕様の方が欲しいキャラを安くそろえやすくても、「前のガチャの方が楽しかった」と感じるのは自然なことです。</p>
          </header>

          <div className="feeling-contrast" aria-label="旧仕様と新仕様のガチャ体験の違い">
            <article className="feeling-card old-feeling">
              <span>旧仕様</span>
              <h4>安心しながら、ワクワクできた</h4>
              <p>200連まで回せば、最後は好きなPUを選べました。途中でPUを引いても、200連へ向かうポイントは消えません。</p>
              <blockquote>「ここで引けた！<br />しかも、あと少しでもう1人取れる！」</blockquote>
            </article>
            <article className="feeling-card new-feeling">
              <span>新仕様</span>
              <h4>得をしても、喜びきれないことがある</h4>
              <p>PUを引くとチャージがリセットされます。100チャージで★3が出ても、PUでなければ残念さが残ります。</p>
              <blockquote>「うれしいけど、チャージが消えた」<br />「★3だけど、欲しいキャラではなかった」</blockquote>
            </article>
          </div>

          <div className="feeling-copy">
            <p>旧仕様では、たとえば190連目でPUを1人引けば、あと10連で別のPUを選べました。途中で運よく引けたことが、そのまま追加の得になります。引けなかった場合にも、200連という分かりやすいゴールがありました。安心できる道の上で、大当たりも期待できる仕組みだったのです。</p>
            <p>新仕様には無料チケットなどの特典があり、最終的には得になりやすい設計です。ただし、その得は何か所にも分けて配られます。旧仕様にあった「ここで一気に2人そろった」という強い盛り上がりは起こりにくくなりました。</p>
            <p>結果がよくても、引いている途中に「損ではないけど、気持ちよくもない」という時間が長くなることがあります。</p>
            <div className="feeling-conclusion">
              <strong>二つの評価は、同時に成り立ちます。</strong>
              <p>新仕様の方が、欲しいキャラを安くそろえやすい。<br />それでも、旧仕様の方が安心できて、ガチャとして熱かった。</p>
            </div>
            <p>ガチャは、キャラを安く手に入れるためだけの仕組みではありません。引く前の期待や、当たった瞬間の喜びも、ゲームから受け取る楽しさの一部です。</p>
            <p>旧仕様を惜しむ気持ちは、数字を理解していないから生まれるものとは限りません。新仕様がお得だと分かったうえで、「前の方が安心してワクワクできた」と感じることには、十分な理由があります。</p>
          </div>
        </article>
      </section>

      <footer>
        <div className="brand footer-brand"><span className="brand-mark">Σ</span><span><b>募集期待値ラボ</b><small>UNOFFICIAL CALCULATOR</small></span></div>
        <p>本サイトは非公式の確率計算ツールです。実際の募集条件はゲーム内表示と公式告知を確認してください。</p>
        <a href="https://bluearchive.jp/news/newsJump/679" target="_blank" rel="noreferrer">公式「生徒募集システムのリニューアルについて」↗</a>
      </footer>
    </main>
  );
}
