"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CompletionStats, ProposalEvidenceData, TargetCount } from "./evidence-model";

const MAX_PAID = 800;
const CURRENT_COLOR = "#f2646a";
const PROPOSAL_COLOR = "#1687a6";
const GRID_COLOR = "#dceaf2";
const TEXT_COLOR = "#60758a";
const COST_TARGETS = [2, 3, 4] as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatPercent(value: number) {
  if (value >= 0.99995) return "100.00%";
  return `${(value * 100).toFixed(2)}%`;
}

function formatCost(stats: CompletionStats) {
  return `${stats.mean.toFixed(1)} ± ${stats.sd.toFixed(1)}連`;
}

function prepareCanvas(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) return null;
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);
  return { context, width: rect.width, height: rect.height };
}

function drawLine(
  context: CanvasRenderingContext2D,
  values: number[],
  color: string,
  xAt: (value: number) => number,
  yAt: (value: number) => number,
) {
  context.beginPath();
  context.strokeStyle = color;
  context.lineWidth = 2.7;
  context.lineJoin = "round";
  for (let index = 0; index <= MAX_PAID; index += 1) {
    const x = xAt(index);
    const y = yAt(values[index] ?? 0);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();
}

function CompletionChart({
  current,
  proposal,
  target,
}: {
  current: number[];
  proposal: number[];
  target: TargetCount;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cursor, setCursor] = useState(400);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const prepared = prepareCanvas(canvas);
      if (!prepared) return;
      const { context, width, height } = prepared;
      const padding = { left: 54, right: 18, top: 22, bottom: 40 };
      const chartWidth = width - padding.left - padding.right;
      const chartHeight = height - padding.top - padding.bottom;
      const xAt = (value: number) => padding.left + chartWidth * value / MAX_PAID;
      const yAt = (value: number) => padding.top + chartHeight * (1 - clamp(value, 0, 1));

      context.font = "11px sans-serif";
      context.lineWidth = 1;
      for (let step = 0; step <= 4; step += 1) {
        const value = step / 4;
        const y = yAt(value);
        context.strokeStyle = GRID_COLOR;
        context.beginPath();
        context.moveTo(padding.left, y);
        context.lineTo(width - padding.right, y);
        context.stroke();
        context.fillStyle = TEXT_COLOR;
        context.textAlign = "right";
        context.textBaseline = "middle";
        context.fillText(`${Math.round(value * 100)}%`, padding.left - 8, y);
      }
      for (let step = 0; step <= 4; step += 1) {
        const value = step * 200;
        const x = xAt(value);
        context.fillStyle = TEXT_COLOR;
        context.textAlign = "center";
        context.textBaseline = "top";
        context.fillText(String(value), x, height - padding.bottom + 11);
      }
      for (const voucher of [120, 320, 520, 720]) {
        const x = xAt(voucher);
        context.strokeStyle = "#1687a633";
        context.setLineDash([4, 5]);
        context.beginPath();
        context.moveTo(x, padding.top);
        context.lineTo(x, padding.top + chartHeight);
        context.stroke();
      }
      context.setLineDash([]);

      drawLine(context, current, CURRENT_COLOR, xAt, yAt);
      drawLine(context, proposal, PROPOSAL_COLOR, xAt, yAt);

      const cursorX = xAt(cursor);
      context.strokeStyle = "#15324a66";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(cursorX, padding.top);
      context.lineTo(cursorX, padding.top + chartHeight);
      context.stroke();
      for (const [values, color] of [[current, CURRENT_COLOR], [proposal, PROPOSAL_COLOR]] as const) {
        context.fillStyle = "white";
        context.beginPath();
        context.arc(cursorX, yAt(values[cursor] ?? 0), 4.5, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = color;
        context.lineWidth = 2.5;
        context.stroke();
      }
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [current, cursor, proposal]);

  const updateCursor = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left - 54) / Math.max(1, rect.width - 72), 0, 1);
    setCursor(Math.round(ratio * MAX_PAID));
  };

  return (
    <div className="evidence-chart-wrap">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="img"
        aria-label={`${target}人全員確保率。横軸は青輝石を消費した募集回数、縦軸は全員確保率。現行仕様と提案仕様を比較。`}
        onPointerMove={(event) => updateCursor(event.clientX)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") setCursor((value) => Math.max(0, value - 10));
          if (event.key === "ArrowRight") setCursor((value) => Math.min(MAX_PAID, value + 10));
        }}
      />
      <div className="evidence-chart-readout" aria-live="polite">
        <strong>{cursor}連分</strong>
        <span className="current">現行 {formatPercent(current[cursor] ?? 0)}</span>
        <span className="proposal">提案 {formatPercent(proposal[cursor] ?? 0)}</span>
        <small>縦の破線は提案仕様のPU指名券到達位置</small>
      </div>
    </div>
  );
}

function PayoutChart({ data }: { data: ProposalEvidenceData["payout"] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cursor, setCursor] = useState(400);
  const maxY = useMemo(() => {
    let max = 0;
    for (let index = 0; index <= MAX_PAID; index += 1) {
      max = Math.max(max, data.currentMean[index] + data.currentSd[index], data.proposalMean[index] + data.proposalSd[index]);
    }
    return Math.ceil(max / 2) * 2;
  }, [data]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const prepared = prepareCanvas(canvas);
      if (!prepared) return;
      const { context, width, height } = prepared;
      const padding = { left: 54, right: 18, top: 22, bottom: 40 };
      const chartWidth = width - padding.left - padding.right;
      const chartHeight = height - padding.top - padding.bottom;
      const xAt = (value: number) => padding.left + chartWidth * value / MAX_PAID;
      const yAt = (value: number) => padding.top + chartHeight * (1 - clamp(value / maxY, 0, 1));

      context.font = "11px sans-serif";
      for (let step = 0; step <= 4; step += 1) {
        const value = maxY * step / 4;
        const y = yAt(value);
        context.strokeStyle = GRID_COLOR;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(padding.left, y);
        context.lineTo(width - padding.right, y);
        context.stroke();
        context.fillStyle = TEXT_COLOR;
        context.textAlign = "right";
        context.textBaseline = "middle";
        context.fillText(value.toFixed(1), padding.left - 8, y);
      }
      for (let step = 0; step <= 4; step += 1) {
        const value = step * 200;
        context.fillStyle = TEXT_COLOR;
        context.textAlign = "center";
        context.textBaseline = "top";
        context.fillText(String(value), xAt(value), height - padding.bottom + 11);
      }

      const drawBand = (mean: number[], sd: number[], color: string) => {
        context.beginPath();
        for (let index = 0; index <= MAX_PAID; index += 1) {
          const x = xAt(index);
          const y = yAt(mean[index] + sd[index]);
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        for (let index = MAX_PAID; index >= 0; index -= 1) {
          context.lineTo(xAt(index), yAt(Math.max(0, mean[index] - sd[index])));
        }
        context.closePath();
        context.fillStyle = color;
        context.fill();
      };

      drawBand(data.currentMean, data.currentSd, "#f2646a1c");
      drawBand(data.proposalMean, data.proposalSd, "#1687a61f");
      drawLine(context, data.currentMean, CURRENT_COLOR, xAt, yAt);
      drawLine(context, data.proposalMean, PROPOSAL_COLOR, xAt, yAt);

      const cursorX = xAt(cursor);
      context.strokeStyle = "#15324a66";
      context.beginPath();
      context.moveTo(cursorX, padding.top);
      context.lineTo(cursorX, padding.top + chartHeight);
      context.stroke();
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [cursor, data, maxY]);

  const updateCursor = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left - 54) / Math.max(1, rect.width - 72), 0, 1);
    setCursor(Math.round(ratio * MAX_PAID));
  };

  return (
    <div className="evidence-chart-wrap">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="img"
        aria-label="4PU開催で、固定予算を使い切ったときのPU総獲得回数。実線は期待値、帯はプラスマイナス1標準偏差。"
        onPointerMove={(event) => updateCursor(event.clientX)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") setCursor((value) => Math.max(0, value - 10));
          if (event.key === "ArrowRight") setCursor((value) => Math.min(MAX_PAID, value + 10));
        }}
      />
      <div className="evidence-chart-readout" aria-live="polite">
        <strong>{cursor}連分</strong>
        <span className="current">現行 {data.currentMean[cursor].toFixed(2)} ± {data.currentSd[cursor].toFixed(2)}回</span>
        <span className="proposal">提案 {data.proposalMean[cursor].toFixed(2)} ± {data.proposalSd[cursor].toFixed(2)}回</span>
        <small>実線は期待値、色の帯は期待値 ± 1標準偏差</small>
      </div>
    </div>
  );
}

function CostChart({ completion }: { completion: ProposalEvidenceData["completion"] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const prepared = prepareCanvas(canvas);
      if (!prepared) return;
      const { context, width, height } = prepared;
      const padding = { left: 54, right: 18, top: 24, bottom: 48 };
      const chartWidth = width - padding.left - padding.right;
      const chartHeight = height - padding.top - padding.bottom;
      const maxY = 450;
      const yAt = (value: number) => padding.top + chartHeight * (1 - clamp(value / maxY, 0, 1));

      context.font = "11px sans-serif";
      for (let step = 0; step <= 4; step += 1) {
        const value = step * 100;
        const y = yAt(value);
        context.strokeStyle = GRID_COLOR;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(padding.left, y);
        context.lineTo(width - padding.right, y);
        context.stroke();
        context.fillStyle = TEXT_COLOR;
        context.textAlign = "right";
        context.textBaseline = "middle";
        context.fillText(String(value), padding.left - 8, y);
      }

      const groupWidth = chartWidth / COST_TARGETS.length;
      const barWidth = Math.min(42, groupWidth * 0.2);
      COST_TARGETS.forEach((target, groupIndex) => {
        const center = padding.left + groupWidth * (groupIndex + 0.5);
        const rows = [
          { stats: completion[target].currentStats, color: CURRENT_COLOR, x: center - barWidth - 5 },
          { stats: completion[target].proposalStats, color: PROPOSAL_COLOR, x: center + 5 },
        ];
        for (const row of rows) {
          const meanY = yAt(row.stats.mean);
          context.fillStyle = row.color;
          context.globalAlpha = 0.82;
          context.fillRect(row.x, meanY, barWidth, yAt(0) - meanY);
          context.globalAlpha = 1;
          const whiskerX = row.x + barWidth / 2;
          const upper = yAt(row.stats.mean + row.stats.sd);
          const lower = yAt(Math.max(0, row.stats.mean - row.stats.sd));
          context.strokeStyle = row.color;
          context.lineWidth = 2;
          context.beginPath();
          context.moveTo(whiskerX, upper);
          context.lineTo(whiskerX, lower);
          context.moveTo(whiskerX - 7, upper);
          context.lineTo(whiskerX + 7, upper);
          context.moveTo(whiskerX - 7, lower);
          context.lineTo(whiskerX + 7, lower);
          context.stroke();
        }
        context.fillStyle = TEXT_COLOR;
        context.textAlign = "center";
        context.textBaseline = "top";
        context.fillText(`${target}人`, center, height - padding.bottom + 14);
      });
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [completion]);

  return (
    <div className="evidence-chart-wrap cost-chart-wrap">
      <canvas ref={canvasRef} role="img" aria-label="2人、3人、4人を全員確保するまでの青輝石消費回数。棒は平均、ひげはプラスマイナス1標準偏差。" />
      <div className="evidence-chart-readout static">
        <span className="current">現行仕様</span>
        <span className="proposal">提案仕様</span>
        <small>棒は平均コスト、ひげは平均 ± 1標準偏差</small>
      </div>
    </div>
  );
}

export default function ProposalEvidence({ data }: { data: ProposalEvidenceData }) {
  const [target, setTarget] = useState<TargetCount>(4);
  const completion = data.completion[target];

  return (
    <div className="proposal-evidence">
      <article className="evidence-block">
        <header className="evidence-heading">
          <span>TEST 01 / COMPLETION CDF</span>
          <h3>予算を増やしたとき、全員確保率はどう推移するか</h3>
          <p>全員確保率は、指定予算までに異なるPUを全員そろえ終える累積確率です。人数を切り替えると、保証到達前後の差と、最終的な収束位置を比較できます。</p>
          <div className="evidence-target-switch" role="group" aria-label="全員確保するPU人数">
            {([2, 3, 4] as const).map((value) => (
              <button key={value} type="button" className={target === value ? "active" : ""} aria-pressed={target === value} onClick={() => setTarget(value)}>{value}人</button>
            ))}
          </div>
        </header>
        <div className="evidence-card">
          <div className="evidence-card-title">
            <div><b>{target}人を全員確保する確率</b><small>横軸：青輝石を消費した募集回数</small></div>
            <div className="evidence-legend"><span className="current">現行仕様</span><span className="proposal">提案仕様</span></div>
          </div>
          <CompletionChart current={completion.current} proposal={completion.proposal} target={target} />
        </div>
        <div className="evidence-checkpoints">
          {[200, 400, 600].map((budget) => (
            <div key={budget}>
              <strong>{budget}連分</strong>
              <span className="current">現行 {formatPercent(completion.current[budget])}</span>
              <span className="proposal">提案 {formatPercent(completion.proposal[budget])}</span>
            </div>
          ))}
        </div>
        <p className="evidence-interpretation">提案仕様は、すべての予算地点で現行仕様を上回る設計ではありません。指名券の120・320・520・720連で段差が生じる一方、現行仕様は100・200チャージ保証と無料募集で別の形を取ります。比較すべきなのは一点の勝敗ではなく、平均、分散、保証位置を含む曲線全体です。</p>
      </article>

      <article className="evidence-block">
        <header className="evidence-heading">
          <span>TEST 02 / SUPPLY VOLUME</span>
          <h3>固定予算で、PUを平均何回払い出すか</h3>
          <p>4PU開催で予算を最後まで使う条件です。指名券と重複を含むPU総獲得回数を集計し、期待値を実線、個人差の大きさを標準偏差の帯で示します。</p>
        </header>
        <div className="evidence-card">
          <div className="evidence-card-title">
            <div><b>PU総獲得回数の期待値と標準偏差</b><small>4人全員確保後は、提案仕様のPU率を通常の0.70%へ戻す</small></div>
            <div className="evidence-legend"><span className="current">現行仕様</span><span className="proposal">提案仕様</span></div>
          </div>
          <PayoutChart data={data.payout} />
        </div>
        <div className="evidence-stat-table-wrap">
          <table className="evidence-stat-table">
            <thead><tr><th>固定予算</th><th>現行仕様</th><th>提案仕様</th><th>期待値差</th><th>標準偏差差</th></tr></thead>
            <tbody>
              {[200, 400, 800].map((budget) => (
                <tr key={budget}>
                  <th>{budget}連分</th>
                  <td>{data.payout.currentMean[budget].toFixed(2)} ± {data.payout.currentSd[budget].toFixed(2)}回</td>
                  <td>{data.payout.proposalMean[budget].toFixed(2)} ± {data.payout.proposalSd[budget].toFixed(2)}回</td>
                  <td>{data.payout.proposalMean[budget] - data.payout.currentMean[budget] >= 0 ? "+" : ""}{(data.payout.proposalMean[budget] - data.payout.currentMean[budget]).toFixed(2)}回</td>
                  <td>{data.payout.proposalSd[budget] - data.payout.currentSd[budget] >= 0 ? "+" : ""}{(data.payout.proposalSd[budget] - data.payout.currentSd[budget]).toFixed(2)}回</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="evidence-interpretation">200・400・800連分で、PU期待値の差は最大約4.5%、標準偏差の差は最大約0.20回です。提案仕様は確保体験を変えますが、運営側が管理する平均払い出し量と結果のばらつきを大きく変えていません。</p>
      </article>

      <article className="evidence-block">
        <header className="evidence-heading">
          <span>TEST 03 / COST RISK</span>
          <h3>全員確保までの平均コストと、個人差は近いか</h3>
          <p>平均は長期的な取得コスト、標準偏差はユーザーごとの振れ幅を表します。棒の高さだけでなく、ひげの長さまで近いかを確認します。</p>
        </header>
        <div className="evidence-card">
          <div className="evidence-card-title">
            <div><b>全員確保までの青輝石消費</b><small>棒：期待値 / ひげ：期待値 ± 1標準偏差</small></div>
            <div className="evidence-legend"><span className="current">現行仕様</span><span className="proposal">提案仕様</span></div>
          </div>
          <CostChart completion={data.completion} />
        </div>
        <div className="evidence-stat-table-wrap">
          <table className="evidence-stat-table">
            <thead><tr><th>目標</th><th>現行仕様</th><th>提案仕様</th><th>平均差</th><th>95% / 最悪</th></tr></thead>
            <tbody>
              {([2, 3, 4] as const).map((value) => {
                const currentStats = data.completion[value].currentStats;
                const proposalStats = data.completion[value].proposalStats;
                const delta = proposalStats.mean - currentStats.mean;
                return (
                  <tr key={value}>
                    <th>{value}人</th>
                    <td>{formatCost(currentStats)}</td>
                    <td>{formatCost(proposalStats)}</td>
                    <td>{delta >= 0 ? "+" : ""}{delta.toFixed(1)}連</td>
                    <td>現行 {currentStats.p95}/{currentStats.worst}・提案 {proposalStats.p95}/{proposalStats.worst}連</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="evidence-interpretation">平均コストの差は2～4人で約3～6連、標準偏差の差は約7～12連です。平均は現行仕様と非常に近く、最悪保証は2～4人ですべて一致します。一方、3人確保の標準偏差は提案仕様の方が約12連大きく、この差は運営データで継続率への影響を確認すべき項目です。</p>
      </article>

      <aside className="evidence-verdict">
        <span>VALIDATION RESULT</span>
        <h3>確率的な整合性は高い。売上の同等性は、まだ断定しない。</h3>
        <p>全員確保率の曲線、固定予算のPU期待値・標準偏差、全員確保コストの平均・標準偏差は、いずれも現行仕様に近い範囲へ収まっています。ただし、未所持PUと重複PUの価値、120連まで継続する割合、スタンプ残高による次回行動は公開情報だけでは分かりません。採用判断には、実ユーザーの停止行動を含む売上シミュレーションが必要です。</p>
      </aside>
    </div>
  );
}
