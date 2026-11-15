import React, { useState } from 'react';
import { BodyState, SimulationState } from '../physics/threeBodyEngine';
import { CollapsibleSection } from './CollapsibleSection';

interface TelemetryDashboardProps {
  simState: SimulationState;
  fps: number;
  speedMultiplier: number;
  trailCounts: number[];
  isPlaying: boolean;
  onSelectBodyForEdit?: (index: number) => void;
}

function fmt(n: number, decimals = 3): string {
  if (!Number.isFinite(n)) return '0.000';
  const rounded = Math.abs(n) < 1e-9 ? 0 : n;
  return rounded.toFixed(decimals);
}

function fmtSigned(n: number, decimals = 3): string {
  if (!Number.isFinite(n)) return '+0.000';
  const rounded = Math.abs(n) < 1e-9 ? 0 : n;
  const sign = rounded >= 0 ? '+' : '';
  return `${sign}${rounded.toFixed(decimals)}`;
}

const BodyStatCard: React.FC<{
  body: BodyState;
  onInspect?: () => void;
}> = ({ body, onInspect }) => {
  return (
    <div
      className="rounded-md border border-slate-800/80 bg-[#0B101D] p-2.5"
      data-testid={`body-${body.id}-telemetry`}
    >
      <div className="flex items-center justify-between border-b border-slate-800/70 pb-1.5 mb-2 gap-2">
        <button
          type="button"
          onClick={onInspect}
          className="flex items-center gap-2 text-left hover:text-sky-300 transition-colors cursor-pointer min-w-0"
        >
          <span
            className="h-2.5 w-2.5 rounded-xs shrink-0"
            style={{ backgroundColor: body.color }}
            aria-hidden="true"
          />
          <span className="text-xs font-semibold text-slate-100 truncate">
            Body {body.id} · {body.name}
          </span>
        </button>
        <span className="font-mono text-[11px] tabular-nums text-slate-300 shrink-0">
          {fmt(body.mass, 2)} <span className="text-slate-500">M☉</span>
        </span>
      </div>

      <div className="grid grid-cols-[74px_1fr_1fr_1fr] gap-x-1.5 gap-y-1 font-mono text-[11px] tabular-nums">
        <span className="text-[10px] font-sans text-slate-500">Metric</span>
        <span className="text-right text-[10px] font-sans text-slate-500">X</span>
        <span className="text-right text-[10px] font-sans text-slate-500">Y</span>
        <span className="text-right text-[10px] font-sans text-slate-500">Z</span>

        <span className="text-slate-400 font-sans whitespace-nowrap">Pos (AU)</span>
        <span className="text-right text-slate-100">{fmtSigned(body.position[0], 3)}</span>
        <span className="text-right text-slate-100">{fmtSigned(body.position[1], 3)}</span>
        <span className="text-right text-slate-100">{fmtSigned(body.position[2], 3)}</span>

        <span className="text-slate-400 font-sans whitespace-nowrap">Vel (AU/τ)</span>
        <span className="text-right text-slate-100">{fmtSigned(body.velocity[0], 3)}</span>
        <span className="text-right text-slate-100">{fmtSigned(body.velocity[1], 3)}</span>
        <span className="text-right text-slate-100">{fmtSigned(body.velocity[2], 3)}</span>

        <span className="text-slate-400 font-sans whitespace-nowrap">Acc (AU/τ²)</span>
        <span className="text-right text-slate-300">{fmtSigned(body.acceleration[0], 2)}</span>
        <span className="text-right text-slate-300">{fmtSigned(body.acceleration[1], 2)}</span>
        <span className="text-right text-slate-300">{fmtSigned(body.acceleration[2], 2)}</span>
      </div>

      <div className="mt-2 pt-1.5 border-t border-slate-800/70 flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums">
        <span className="text-slate-400">
          |v| <strong className="font-medium text-slate-100">{fmt(body.speed, 3)}</strong>
        </span>
        <span className="text-slate-400">
          |a| <strong className="font-medium text-slate-100">{fmt(body.accelMag, 2)}</strong>
        </span>
        <span className="text-slate-400">
          KE <strong className="font-medium text-emerald-400">{fmt(body.kineticEnergy, 3)}</strong>
        </span>
      </div>
    </div>
  );
};

export const TelemetryDashboard: React.FC<TelemetryDashboardProps> = ({
  simState,
  fps,
  speedMultiplier,
  trailCounts,
  isPlaying,
  onSelectBodyForEdit,
}) => {
  const [openSections, setOpenSections] = useState({
    systemStats: true,
    bodyStats: true,
    orbitalData: false,
    simInfo: true,
  });

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const { bodies, telemetry, stability } = simState;
  const com = telemetry.centerOfMass;
  const isUnstable = stability.level === 'unstable';
  const isElevated = stability.level === 'elevated';

  const bodyColorById = new Map<number, string>();
  for (const b of bodies) bodyColorById.set(b.id, b.color);

  const energyCardClass = isUnstable
    ? 'rounded-md border border-rose-500/80 bg-rose-950/40 p-2.5 transition-colors'
    : 'rounded-md border border-slate-800/80 bg-[#0B101D] p-2.5 transition-colors';

  const statusTextClass = isUnstable
    ? 'text-rose-400'
    : isElevated
      ? 'text-amber-400'
      : 'text-emerald-400';

  const monitorBoxClass = isUnstable
    ? 'mb-2.5 rounded-md border border-rose-500/75 bg-rose-950/35 p-2.5'
    : isElevated
      ? 'mb-2.5 rounded-md border border-amber-500/60 bg-amber-950/25 p-2.5'
      : 'mb-2.5 rounded-md border border-slate-800/80 bg-[#0B101D] p-2.5';

  return (
    <aside
      aria-label="Real-Time Physics Telemetry Dashboard"
      data-stability={stability.level}
      className="flex h-full flex-col bg-[#080C16] text-slate-100 overflow-hidden"
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-slate-800/90 px-4 py-2.5 bg-[#0A0F1C] shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold tracking-wide text-slate-100">
              Physics Telemetry
            </h2>
            <span
              className={`text-[11px] font-medium ${statusTextClass}`}
              data-testid="stability-header-status"
            >
              {stability.label}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-mono tabular-nums">
            N = {telemetry.bodyCount} · G = {simState.G.toFixed(2)} · Δt ={' '}
            {simState.dt.toFixed(4)}
          </p>
        </div>
        <span
          className="font-mono text-xs tabular-nums text-slate-300"
          data-testid="telemetry-body-count"
        >
          {telemetry.bodyCount} Bodies
        </span>
      </div>

      <div className="flex-1 overflow-y-auto sci-scroll">
        {/* 1. System Statistics & Stability Monitor */}
        <CollapsibleSection
          title="System Statistics"
          subtitle="Energy · Momentum · Stability"
          isOpen={openSections.systemStats}
          onToggle={() => toggleSection('systemStats')}
          rightSlot={
            <span className={`text-[11px] font-semibold ${statusTextClass}`}>
              {stability.label}
            </span>
          }
        >
          {/* Stability Monitor Card */}
          <div
            className={monitorBoxClass}
            data-testid="stability-monitor"
            data-stability-level={stability.level}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-200">
                Stability Monitor
              </span>
              <span className={`text-[11px] font-semibold ${statusTextClass}`}>
                {stability.label}
              </span>
            </div>
            <p
              className={`mt-1 text-[11px] leading-snug ${
                isUnstable
                  ? 'text-rose-200'
                  : isElevated
                    ? 'text-amber-200'
                    : 'text-slate-400'
              }`}
              data-testid="stability-reason"
            >
              {stability.reason}
            </p>
            <div className="mt-2 pt-1.5 border-t border-slate-800/70 flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-400">
              <span>
                Min Sep:{' '}
                <strong className="text-slate-200">
                  {fmt(stability.minObservedDistance, 3)}
                </strong>{' '}
                AU
              </span>
              <span>
                Peak |v|:{' '}
                <strong className={isUnstable ? 'text-rose-300' : 'text-slate-200'}>
                  {fmt(stability.peakObservedSpeed, 2)}
                </strong>{' '}
                AU/τ
              </span>
            </div>
          </div>

          <div
            className="grid grid-cols-2 gap-2"
            data-testid="system-energy-grid"
            data-energy-alert={isUnstable ? 'red' : 'normal'}
          >
            <div className={energyCardClass}>
              <div
                className={`text-[10px] font-medium ${
                  isUnstable ? 'text-rose-300' : 'text-slate-400'
                }`}
              >
                Kinetic Energy (KE)
              </div>
              <div
                className={`mt-0.5 font-mono text-sm font-semibold tabular-nums ${
                  isUnstable ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {fmt(telemetry.kineticEnergy, 4)}
              </div>
              <div
                className={`text-[10px] font-mono ${
                  isUnstable ? 'text-rose-300/70' : 'text-slate-500'
                }`}
              >
                M☉·AU²/τ²
              </div>
            </div>

            <div className={energyCardClass}>
              <div
                className={`text-[10px] font-medium ${
                  isUnstable ? 'text-rose-300' : 'text-slate-400'
                }`}
              >
                Potential Energy (PE)
              </div>
              <div
                className={`mt-0.5 font-mono text-sm font-semibold tabular-nums ${
                  isUnstable ? 'text-rose-400' : 'text-amber-400'
                }`}
              >
                {fmtSigned(telemetry.potentialEnergy, 4)}
              </div>
              <div
                className={`text-[10px] font-mono ${
                  isUnstable ? 'text-rose-300/70' : 'text-slate-500'
                }`}
              >
                M☉·AU²/τ²
              </div>
            </div>

            <div className={energyCardClass}>
              <div
                className={`text-[10px] font-medium ${
                  isUnstable ? 'text-rose-300' : 'text-slate-400'
                }`}
              >
                Total Energy (E)
              </div>
              <div
                className={`mt-0.5 font-mono text-sm font-semibold tabular-nums ${
                  isUnstable ? 'text-rose-300' : 'text-slate-100'
                }`}
                data-testid="total-energy-value"
              >
                {fmtSigned(telemetry.totalEnergy, 4)}
              </div>
              <div
                className={`text-[10px] font-mono tabular-nums ${
                  isUnstable ? 'text-rose-300 font-semibold' : 'text-slate-400'
                }`}
              >
                Drift: {fmtSigned(telemetry.energyDriftPct, 4)}%
              </div>
            </div>

            <div className="rounded-md border border-slate-800/80 bg-[#0B101D] p-2.5">
              <div className="text-[10px] font-medium text-slate-400">Total Bodies / Mass</div>
              <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-slate-100">
                {telemetry.bodyCount}{' '}
                <span className="text-xs font-normal text-slate-400">
                  ({fmt(telemetry.totalMass, 2)} M☉)
                </span>
              </div>
              <div className="text-[10px] font-mono tabular-nums text-slate-500">
                {telemetry.pairs.length} pairs active
              </div>
            </div>

            <div className="rounded-md border border-slate-800/80 bg-[#0B101D] p-2.5">
              <div className="text-[10px] font-medium text-slate-400">Linear Momentum |P|</div>
              <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-sky-400">
                {fmt(telemetry.momentumMagnitude, 4)}
              </div>
              <div className="text-[10px] font-mono tabular-nums text-slate-500 truncate">
                ({fmtSigned(telemetry.totalMomentum[0], 2)},{' '}
                {fmtSigned(telemetry.totalMomentum[1], 2)},{' '}
                {fmtSigned(telemetry.totalMomentum[2], 2)})
              </div>
            </div>

            <div className="rounded-md border border-slate-800/80 bg-[#0B101D] p-2.5">
              <div className="text-[10px] font-medium text-slate-400">Angular Momentum |L|</div>
              <div
                className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-indigo-300"
                data-testid="angular-momentum-value"
              >
                {fmt(telemetry.angularMomentumMagnitude, 4)}
              </div>
              <div className="text-[10px] font-mono tabular-nums text-slate-500 truncate">
                ({fmtSigned(telemetry.totalAngularMomentum[0], 2)},{' '}
                {fmtSigned(telemetry.totalAngularMomentum[1], 2)},{' '}
                {fmtSigned(telemetry.totalAngularMomentum[2], 2)})
              </div>
            </div>
          </div>

          <div className="mt-2 rounded-md border border-slate-800/80 bg-[#0B101D] px-2.5 py-1.5 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Center of Mass (AU)</span>
            <span className="font-mono tabular-nums text-slate-200">
              ({fmtSigned(com[0], 3)}, {fmtSigned(com[1], 3)}, {fmtSigned(com[2], 3)})
            </span>
          </div>
        </CollapsibleSection>

        {/* 2. Individual Body Statistics (dynamically adapts to 2..10 bodies) */}
        <CollapsibleSection
          title={`Body Statistics (${bodies.length})`}
          subtitle="Pos · Vel · Acc · Body KE"
          isOpen={openSections.bodyStats}
          onToggle={() => toggleSection('bodyStats')}
        >
          <div className="space-y-2.5">
            {bodies.map((body, idx) => (
              <BodyStatCard
                key={body.id}
                body={body}
                onInspect={() => onSelectBodyForEdit?.(idx)}
              />
            ))}
          </div>
        </CollapsibleSection>

        {/* 3. Orbital Data & Pairwise Gravitational Interactions */}
        <CollapsibleSection
          title={`Orbital Pairs (${telemetry.pairs.length})`}
          subtitle="Separations · Forces · Trails"
          isOpen={openSections.orbitalData}
          onToggle={() => toggleSection('orbitalData')}
        >
          <div className="space-y-2.5">
            <div className="rounded-md border border-slate-800/80 bg-[#0B101D] overflow-hidden max-h-60 overflow-y-auto sci-scroll">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-[#0D1322]">
                  <tr className="border-b border-slate-800/80 text-[10px] font-medium text-slate-400">
                    <th className="py-1.5 px-2.5">Pair</th>
                    <th className="py-1.5 px-2 text-right">Dist (AU)</th>
                    <th className="py-1.5 px-2 text-right">Force |F|</th>
                    <th className="py-1.5 px-2.5 text-right">U_ij</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-[11px] tabular-nums divide-y divide-slate-800/50">
                  {telemetry.pairs.map((p) => {
                    const colA = bodyColorById.get(p.pair[0]) ?? '#38BDF8';
                    const colB = bodyColorById.get(p.pair[1]) ?? '#F59E0B';
                    return (
                      <tr key={p.label} className="hover:bg-slate-900/40">
                        <td className="py-1.5 px-2.5 font-sans text-slate-200 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            <span
                              className="h-2 w-2 rounded-xs"
                              style={{ backgroundColor: colA }}
                            />
                            <span>{p.pair[0]}</span>
                            <span className="text-slate-500">↔</span>
                            <span
                              className="h-2 w-2 rounded-xs"
                              style={{ backgroundColor: colB }}
                            />
                            <span>{p.pair[1]}</span>
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-right text-slate-100">
                          {fmt(p.distance, 3)}
                        </td>
                        <td className="py-1.5 px-2 text-right text-sky-300">
                          {fmt(p.forceMagnitude, 3)}
                        </td>
                        <td className="py-1.5 px-2.5 text-right text-slate-300">
                          {fmtSigned(p.potentialEnergy, 3)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {bodies.map((b, i) => {
                const dx = b.position[0] - com[0];
                const dy = b.position[1] - com[1];
                const dz = b.position[2] - com[2];
                const rCom = Math.sqrt(dx * dx + dy * dy + dz * dz);
                return (
                  <div
                    key={b.id}
                    className="rounded-md border border-slate-800/80 bg-[#0B101D] p-2"
                  >
                    <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400 truncate">
                      <span
                        className="h-2 w-2 rounded-xs shrink-0"
                        style={{ backgroundColor: b.color }}
                      />
                      <span className="truncate">
                        B{b.id} · {b.name}
                      </span>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between font-mono text-xs tabular-nums text-slate-100">
                      <span>{fmt(rCom, 3)} AU</span>
                      <span className="text-[10px] text-slate-500">
                        {trailCounts[i] ?? 0} pts
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CollapsibleSection>

        {/* 4. Simulation Information */}
        <CollapsibleSection
          title="Simulation Information"
          subtitle="Time · Speed · FPS"
          isOpen={openSections.simInfo}
          onToggle={() => toggleSection('simInfo')}
        >
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md border border-slate-800/80 bg-[#0B101D] p-2">
              <div className="text-[10px] font-medium text-slate-400">Elapsed Time</div>
              <div
                className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-slate-100"
                data-testid="elapsed-time-value"
              >
                {fmt(telemetry.time, 2)} <span className="text-[10px] text-slate-500">τ</span>
              </div>
            </div>

            <div className="rounded-md border border-slate-800/80 bg-[#0B101D] p-2">
              <div className="text-[10px] font-medium text-slate-400">Speed</div>
              <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-slate-100">
                {speedMultiplier.toFixed(1)}×
              </div>
            </div>

            <div className="rounded-md border border-slate-800/80 bg-[#0B101D] p-2">
              <div className="text-[10px] font-medium text-slate-400">Frame Rate</div>
              <div
                className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-slate-100"
                data-testid="fps-value"
              >
                {fps} <span className="text-[10px] text-slate-500">FPS</span>
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 px-0.5">
            <span>Integrator: RK4 (4th-Order Runge–Kutta)</span>
            <span>Status: {isPlaying ? 'Running' : 'Paused'}</span>
          </div>
        </CollapsibleSection>
      </div>
    </aside>
  );
};
