import React from 'react';
import { Trash2 } from 'lucide-react';
import {
  BODY_COLOR_PALETTE,
  BodyState,
  MIN_BODIES,
  Vec3,
} from '../physics/threeBodyEngine';

interface BodyParameterControlsProps {
  bodies: BodyState[];
  selectedBodyIndex: number;
  onSelectBody: (index: number) => void;
  onUpdateBody: (
    bodyIndex: number,
    patch: {
      name?: string;
      color?: string;
      mass?: number;
      radius?: number;
      position?: Vec3;
      velocity?: Vec3;
    },
  ) => void;
  onRemoveBody: (bodyIndex: number) => void;
}

interface SliderNumberRowProps {
  id: string;
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  accentColor: string;
  onChange: (val: number) => void;
}

const SliderNumberRow: React.FC<SliderNumberRowProps> = ({
  id,
  label,
  unit,
  value,
  min,
  max,
  step,
  decimals = 3,
  accentColor,
  onChange,
}) => {
  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = parseFloat(e.target.value);
    if (Number.isFinite(parsed)) {
      onChange(parsed);
    }
  };

  const clampedValue = Math.min(max, Math.max(min, value));
  const progressPct = max > min ? ((clampedValue - min) / (max - min)) * 100 : 0;

  return (
    <div className="grid grid-cols-[54px_1fr_72px] items-center gap-2">
      <label
        htmlFor={`${id}-num`}
        className="text-[11px] font-medium text-slate-400 truncate select-none"
      >
        {label}
      </label>
      <input
        id={`${id}-range`}
        aria-label={`${label} slider`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={clampedValue}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="sci-slider w-full cursor-pointer"
        style={
          {
            '--slider-accent': accentColor,
            '--slider-progress': `${progressPct.toFixed(2)}%`,
          } as React.CSSProperties
        }
      />
      <input
        id={`${id}-num`}
        aria-label={label}
        type="number"
        step={step}
        value={Number(value.toFixed(decimals))}
        onChange={handleNumberChange}
        className="w-full rounded border border-slate-800 bg-[#0D1322] px-1.5 py-1 text-right font-mono text-[11px] tabular-nums text-slate-100 focus:border-sky-500 focus:outline-none"
      />
      <span className="sr-only">{unit}</span>
    </div>
  );
};

export const BodyParameterControls: React.FC<BodyParameterControlsProps> = ({
  bodies,
  selectedBodyIndex,
  onSelectBody,
  onUpdateBody,
  onRemoveBody,
}) => {
  const safeIndex = Math.min(Math.max(0, selectedBodyIndex), bodies.length - 1);
  const activeBody = bodies[safeIndex];
  const canRemove = bodies.length > MIN_BODIES;

  const handleCoordChange = (
    field: 'position' | 'velocity',
    axis: 0 | 1 | 2,
    nextVal: number,
  ) => {
    const nextVec: Vec3 = [...activeBody[field]] as Vec3;
    nextVec[axis] = nextVal;
    onUpdateBody(safeIndex, { [field]: nextVec });
  };

  const axes: Array<{ idx: 0 | 1 | 2; label: string }> = [
    { idx: 0, label: 'X' },
    { idx: 1, label: 'Y' },
    { idx: 2, label: 'Z' },
  ];

  return (
    <div className="space-y-2.5">
      {/* Dynamic Body Selector Tabs (supports 2..10 bodies) */}
      <div
        className="grid grid-cols-2 gap-1 rounded-md border border-slate-800/90 bg-[#060911] p-1"
        role="tablist"
        aria-label="Select celestial body to configure"
      >
        {bodies.map((b, idx) => {
          const isSelected = idx === safeIndex;
          return (
            <button
              key={b.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => onSelectBody(idx)}
              className={`flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                isSelected
                  ? 'bg-[#121A2D] text-white border border-slate-700/80'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <span
                className="h-2 w-2 rounded-xs shrink-0"
                style={{ backgroundColor: b.color }}
                aria-hidden="true"
              />
              <span className="truncate">
                #{b.id} {b.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected Body Identity & Properties */}
      <div className="divide-y divide-slate-800/70 rounded-md border border-slate-800/80 bg-[#0B101D] px-3">
        {/* Name, Color & Remove Action */}
        <div className="py-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-slate-300">
              Body {activeBody.id} Identity
            </span>
            <button
              type="button"
              disabled={!canRemove}
              onClick={() => onRemoveBody(safeIndex)}
              aria-label={`Remove Body ${activeBody.id}`}
              className="inline-flex items-center gap-1 rounded border border-slate-700/80 bg-[#11182A] px-2 py-0.5 text-[11px] font-medium text-rose-300 hover:bg-rose-950/50 hover:border-rose-500/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap cursor-pointer"
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" />
              <span>Remove</span>
            </button>
          </div>

          <div className="grid grid-cols-[1fr_auto] items-center gap-2">
            <input
              type="text"
              aria-label={`Body ${activeBody.id} Name`}
              value={activeBody.name}
              maxLength={18}
              onChange={(e) => onUpdateBody(safeIndex, { name: e.target.value })}
              className="w-full rounded border border-slate-800 bg-[#0D1322] px-2 py-1 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
            />
            <label className="flex items-center gap-1.5 rounded border border-slate-800 bg-[#0D1322] px-1.5 py-0.5 cursor-pointer">
              <input
                type="color"
                aria-label={`Body ${activeBody.id} Color`}
                value={activeBody.color}
                onChange={(e) => onUpdateBody(safeIndex, { color: e.target.value })}
                className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0"
              />
              <span className="font-mono text-[10px] text-slate-400 uppercase">
                {activeBody.color}
              </span>
            </label>
          </div>

          <div className="flex items-center gap-1.5 pt-0.5">
            {BODY_COLOR_PALETTE.slice(0, 8).map((hex) => (
              <button
                key={hex}
                type="button"
                aria-label={`Set color ${hex}`}
                onClick={() => onUpdateBody(safeIndex, { color: hex })}
                className={`h-4 w-4 rounded-xs border transition-transform cursor-pointer ${
                  activeBody.color.toLowerCase() === hex.toLowerCase()
                    ? 'border-white scale-110'
                    : 'border-slate-700 hover:scale-105'
                }`}
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
        </div>

        {/* Mass & Size (Radius) */}
        <div className="py-2.5 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-slate-300">Physical Scale</span>
            <span className="font-mono text-slate-400">M☉ · R</span>
          </div>
          <SliderNumberRow
            id={`body-${activeBody.id}-mass`}
            label="Mass"
            unit="M☉"
            value={activeBody.mass}
            min={0.05}
            max={6.0}
            step={0.05}
            decimals={2}
            accentColor={activeBody.color}
            onChange={(val) =>
              onUpdateBody(safeIndex, { mass: Math.max(0.05, val) })
            }
          />
          <SliderNumberRow
            id={`body-${activeBody.id}-radius`}
            label="Size"
            unit="AU"
            value={activeBody.radius}
            min={0.04}
            max={0.35}
            step={0.005}
            decimals={3}
            accentColor={activeBody.color}
            onChange={(val) =>
              onUpdateBody(safeIndex, { radius: Math.max(0.04, val) })
            }
          />
        </div>

        {/* Position X, Y, Z */}
        <div className="py-2.5 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] pb-0.5">
            <span className="font-medium text-slate-300">Position Vector</span>
            <span className="font-mono text-slate-400">AU</span>
          </div>
          {axes.map(({ idx, label }) => (
            <SliderNumberRow
              key={`pos-${label}`}
              id={`body-${activeBody.id}-pos-${label}`}
              label={`Pos ${label}`}
              unit="AU"
              value={activeBody.position[idx]}
              min={-4.0}
              max={4.0}
              step={0.05}
              accentColor={activeBody.color}
              onChange={(val) => handleCoordChange('position', idx, val)}
            />
          ))}
        </div>

        {/* Velocity Vx, Vy, Vz */}
        <div className="py-2.5 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] pb-0.5">
            <span className="font-medium text-slate-300">Velocity Vector</span>
            <span className="font-mono text-slate-400">AU/τ</span>
          </div>
          {axes.map(({ idx, label }) => (
            <SliderNumberRow
              key={`vel-${label}`}
              id={`body-${activeBody.id}-vel-${label}`}
              label={`Vel ${label}`}
              unit="AU/τ"
              value={activeBody.velocity[idx]}
              min={-3.5}
              max={3.5}
              step={0.02}
              accentColor={activeBody.color}
              onChange={(val) => handleCoordChange('velocity', idx, val)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
