import React from 'react';
import { Minus, Plus, Shuffle } from 'lucide-react';
import { OrbitPreset, ORBIT_PRESETS } from '../physics/presets';
import {
  MAX_BODIES,
  MIN_BODIES,
  SimulationState,
  Vec3,
} from '../physics/threeBodyEngine';
import { BodyParameterControls } from './BodyParameterControls';
import { CollapsibleSection } from './CollapsibleSection';

interface LeftControlPanelProps {
  simState: SimulationState;
  activePresetId: string;
  selectedBodyIndex: number;
  trailLength: number;
  onSelectPreset: (presetId: string) => void;
  onRandomize: () => void;
  onSetBodyCount: (count: number) => void;
  onUpdatePhysicsParams: (patch: { G?: number; dt?: number }) => void;
  onChangeTrailLength: (length: number) => void;
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

export const LeftControlPanel: React.FC<LeftControlPanelProps> = ({
  simState,
  activePresetId,
  selectedBodyIndex,
  trailLength,
  onSelectPreset,
  onRandomize,
  onSetBodyCount,
  onUpdatePhysicsParams,
  onChangeTrailLength,
  onSelectBody,
  onUpdateBody,
  onRemoveBody,
}) => {
  const [openSections, setOpenSections] = React.useState({
    presets: true,
    system: true,
    bodyConfig: true,
  });

  const toggle = (key: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const bodyCount = simState.bodies.length;
  const activePreset: OrbitPreset =
    ORBIT_PRESETS.find((p) => p.id === activePresetId) ?? ORBIT_PRESETS[0];

  return (
    <aside
      aria-label="Simulation Configuration Panel"
      className="flex h-full flex-col bg-[#080C16] text-slate-100 overflow-hidden"
    >
      <div className="flex items-center justify-between border-b border-slate-800/90 px-4 py-2.5 bg-[#0A0F1C] shrink-0">
        <div>
          <h2 className="text-xs font-semibold tracking-wide text-slate-100">
            System Configuration
          </h2>
          <p className="text-[11px] text-slate-400">
            Presets · {bodyCount} Bodies · Constants
          </p>
        </div>
        <button
          type="button"
          onClick={onRandomize}
          aria-label="Randomize N-Body System"
          className="inline-flex items-center gap-1 rounded border border-slate-700/80 bg-[#11182A] px-2 py-1 text-[11px] font-medium text-slate-200 hover:bg-[#19233C] transition-colors whitespace-nowrap cursor-pointer"
        >
          <Shuffle className="h-3 w-3 text-sky-400" aria-hidden="true" />
          <span>Randomize</span>
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain sci-scroll">
        {/* 1. Simulation Presets */}
        <CollapsibleSection
          title="Simulation Presets"
          subtitle={activePreset.name}
          isOpen={openSections.presets}
          onToggle={() => toggle('presets')}
        >
          <div className="grid grid-cols-2 gap-1.5">
            {ORBIT_PRESETS.map((preset) => {
              const isActive = preset.id === activePresetId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onSelectPreset(preset.id)}
                  data-testid={`preset-btn-${preset.id}`}
                  className={`flex items-center justify-between gap-1 rounded border px-2 py-1.5 text-left text-[11px] font-medium transition-colors cursor-pointer ${
                    isActive
                      ? 'border-sky-500/70 bg-sky-500/15 text-sky-200'
                      : 'border-slate-800/90 bg-[#0B101D] text-slate-300 hover:border-slate-700 hover:text-white'
                  }`}
                >
                  <span className="whitespace-nowrap">{preset.name}</span>
                  <span className="font-mono text-[10px] text-slate-400 shrink-0">
                    {preset.id === 'random-system' && isActive
                      ? bodyCount
                      : preset.bodies.length}
                    B
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] leading-snug text-slate-400">
            {activePreset.summary}
          </p>
        </CollapsibleSection>

        {/* 2. Body Count & Physics Constants */}
        <CollapsibleSection
          title="Body Count & Physics"
          subtitle={`N = ${bodyCount} · G = ${simState.G.toFixed(2)}`}
          isOpen={openSections.system}
          onToggle={() => toggle('system')}
        >
          <div className="divide-y divide-slate-800/70 rounded-md border border-slate-800/80 bg-[#0B101D] px-3">
            {/* Dynamic Body Count Selector (2..10) */}
            <div className="py-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="body-count-num"
                  className="text-[11px] font-medium text-slate-300 whitespace-nowrap"
                >
                  Body Count (2–10)
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={bodyCount <= MIN_BODIES}
                    onClick={() => onSetBodyCount(bodyCount - 1)}
                    aria-label="Decrease body count"
                    className="rounded border border-slate-700/80 bg-[#11182A] p-1 text-slate-200 hover:bg-[#19233C] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Minus className="h-3 w-3" aria-hidden="true" />
                  </button>
                  <input
                    id="body-count-num"
                    aria-label="Number of bodies input"
                    type="number"
                    min={MIN_BODIES}
                    max={MAX_BODIES}
                    step={1}
                    value={bodyCount}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (Number.isFinite(val)) onSetBodyCount(val);
                    }}
                    className="w-12 rounded border border-slate-800 bg-[#0D1322] px-1.5 py-0.5 text-center font-mono text-xs tabular-nums text-slate-100 focus:border-sky-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={bodyCount >= MAX_BODIES}
                    onClick={() => onSetBodyCount(bodyCount + 1)}
                    aria-label="Add body"
                    className="inline-flex items-center gap-1 rounded border border-slate-700/80 bg-[#11182A] px-2 py-1 text-[11px] font-medium text-sky-300 hover:bg-[#19233C] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Plus className="h-3 w-3" aria-hidden="true" />
                    <span>Add</span>
                  </button>
                </div>
              </div>
              <input
                id="body-count-slider"
                aria-label="Number of bodies slider"
                type="range"
                min={MIN_BODIES}
                max={MAX_BODIES}
                step={1}
                value={bodyCount}
                onChange={(e) => onSetBodyCount(parseInt(e.target.value, 10))}
                className="sci-slider w-full cursor-pointer"
              />
            </div>

            {/* Gravitational Constant G */}
            <div className="py-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <label htmlFor="gravity-const-num" className="font-medium text-slate-300">
                  Gravity Constant (G)
                </label>
                <span className="font-mono text-slate-400">AU³/(M☉·τ²)</span>
              </div>
              <div className="grid grid-cols-[1fr_72px] items-center gap-2">
                <input
                  id="gravity-const-slider"
                  aria-label="Gravitational constant G slider"
                  type="range"
                  min={0.1}
                  max={4.0}
                  step={0.05}
                  value={Math.min(4.0, Math.max(0.1, simState.G))}
                  onChange={(e) =>
                    onUpdatePhysicsParams({ G: parseFloat(e.target.value) })
                  }
                  className="sci-slider w-full cursor-pointer"
                />
                <input
                  id="gravity-const-num"
                  aria-label="Gravitational constant G"
                  type="number"
                  min={0.05}
                  max={10}
                  step={0.05}
                  value={Number(simState.G.toFixed(2))}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (Number.isFinite(val)) onUpdatePhysicsParams({ G: val });
                  }}
                  className="w-full rounded border border-slate-800 bg-[#0D1322] px-1.5 py-1 text-right font-mono text-[11px] tabular-nums text-slate-100 focus:border-sky-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Integration Time Step dt */}
            <div className="py-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <label htmlFor="timestep-num" className="font-medium text-slate-300">
                  Time Step (Δt)
                </label>
                <span className="font-mono text-slate-400">τ / step</span>
              </div>
              <div className="grid grid-cols-[1fr_72px] items-center gap-2">
                <input
                  id="timestep-slider"
                  aria-label="Time step slider"
                  type="range"
                  min={0.0005}
                  max={0.01}
                  step={0.0005}
                  value={Math.min(0.01, Math.max(0.0005, simState.dt))}
                  onChange={(e) =>
                    onUpdatePhysicsParams({ dt: parseFloat(e.target.value) })
                  }
                  className="sci-slider w-full cursor-pointer"
                />
                <input
                  id="timestep-num"
                  aria-label="Simulation time step"
                  type="number"
                  min={0.0002}
                  max={0.02}
                  step={0.0005}
                  value={Number(simState.dt.toFixed(4))}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (Number.isFinite(val)) onUpdatePhysicsParams({ dt: val });
                  }}
                  className="w-full rounded border border-slate-800 bg-[#0D1322] px-1.5 py-1 text-right font-mono text-[11px] tabular-nums text-slate-100 focus:border-sky-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Orbital Trail Length */}
            <div className="py-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <label htmlFor="trail-length-slider" className="font-medium text-slate-300">
                  Trail Length
                </label>
                <span className="font-mono tabular-nums text-slate-300">
                  {trailLength} pts
                </span>
              </div>
              <input
                id="trail-length-slider"
                aria-label="Trail length slider"
                type="range"
                min={50}
                max={2000}
                step={50}
                value={trailLength}
                onChange={(e) => onChangeTrailLength(parseInt(e.target.value, 10))}
                className="sci-slider w-full cursor-pointer"
              />
            </div>
          </div>
        </CollapsibleSection>

        {/* 3. Individual Body Configuration */}
        <CollapsibleSection
          title="Individual Body Settings"
          subtitle={`Body ${simState.bodies[Math.min(selectedBodyIndex, bodyCount - 1)]?.id ?? 1}`}
          isOpen={openSections.bodyConfig}
          onToggle={() => toggle('bodyConfig')}
          accentDotColor={
            simState.bodies[Math.min(selectedBodyIndex, bodyCount - 1)]?.color
          }
        >
          <BodyParameterControls
            bodies={simState.bodies}
            selectedBodyIndex={selectedBodyIndex}
            onSelectBody={onSelectBody}
            onUpdateBody={onUpdateBody}
            onRemoveBody={onRemoveBody}
          />
        </CollapsibleSection>
      </div>
    </aside>
  );
};
