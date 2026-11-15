import React, { useCallback, useRef, useState } from 'react';
import {
  Compass,
  Grid3x3,
  Move3d,
  Orbit,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  StepForward,
} from 'lucide-react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Analytics } from '@vercel/analytics/react';
import { LeftControlPanel } from './components/LeftControlPanel';
import { TelemetryDashboard } from './components/TelemetryDashboard';
import { generateRandomSystem, ORBIT_PRESETS } from './physics/presets';
import {
  buildSimulationState,
  DEFAULT_G,
  DEFAULT_SOFTENING,
  FIXED_DT,
  removeBodyFromState,
  setBodyCountInState,
  SimulationState,
  updateBodyInState,
  updatePhysicsParamsInState,
  Vec3,
} from './physics/threeBodyEngine';
import {
  CameraPresetType,
  SceneViewOptions,
  ThreeBodyViewport,
  ViewportImperativeApi,
} from './scene/ThreeBodyViewport';

export default function App() {
  const [activePresetId, setActivePresetId] = useState<string>(ORBIT_PRESETS[0].id);
  const activePreset =
    ORBIT_PRESETS.find((p) => p.id === activePresetId) ?? ORBIT_PRESETS[0];

  const [simState, setSimState] = useState<SimulationState>(() =>
    buildSimulationState(
      ORBIT_PRESETS[0].bodies,
      0,
      undefined,
      ORBIT_PRESETS[0].G ?? DEFAULT_G,
      ORBIT_PRESETS[0].dt ?? FIXED_DT,
      ORBIT_PRESETS[0].softening ?? DEFAULT_SOFTENING,
    ),
  );
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(
    ORBIT_PRESETS[0].recommendedSpeed,
  );
  const [fps, setFps] = useState<number>(60);
  const [trailCounts, setTrailCounts] = useState<number[]>(() =>
    ORBIT_PRESETS[0].bodies.map(() => 1),
  );
  const [selectedBodyIndex, setSelectedBodyIndex] = useState<number>(0);

  const [showLeftPanel, setShowLeftPanel] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  );
  const [showRightPanel, setShowRightPanel] = useState<boolean>(true);
  const [showViewportDock, setShowViewportDock] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true,
  );

  const [viewOptions, setViewOptions] = useState<SceneViewOptions>({
    showTrails: true,
    trailLength: 900,
    showVelocityVectors: true,
    showAccelerationVectors: true,
    showForceVectors: false,
    showForceLinks: true,
    showGrid: true,
    followCom: false,
  });

  const viewportApiRef = useRef<ViewportImperativeApi | null>(null);
  const initialStateRef = useRef<SimulationState>(simState);

  const handleTelemetryTick = useCallback(
    (nextState: SimulationState, nextFps: number, nextTrails: number[]) => {
      setSimState(nextState);
      setFps(nextFps);
      setTrailCounts(nextTrails);
    },
    [],
  );

  const handleSelectPreset = (presetId: string) => {
    const preset = ORBIT_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setActivePresetId(preset.id);
    const bodies =
      preset.id === 'random-system'
        ? generateRandomSystem(simState.bodies.length || 8, simState.G)
        : preset.bodies;
    const nextState = buildSimulationState(
      bodies,
      0,
      undefined,
      preset.G ?? DEFAULT_G,
      preset.dt ?? FIXED_DT,
      preset.softening ?? DEFAULT_SOFTENING,
    );
    setSimState(nextState);
    setSelectedBodyIndex(0);
    setSpeedMultiplier(preset.recommendedSpeed);
    viewportApiRef.current?.resetScene(nextState, preset.cameraPosition);
  };

  const handleRandomize = () => {
    setActivePresetId('random-system');
    const bodies = generateRandomSystem(simState.bodies.length, simState.G);
    const nextState = buildSimulationState(
      bodies,
      0,
      undefined,
      simState.G,
      simState.dt,
      simState.softening,
    );
    setSimState(nextState);
    setSelectedBodyIndex(0);
    viewportApiRef.current?.resetScene(nextState, [1.2, 4.2, 5.8]);
  };

  const handleReset = () => {
    const bodies =
      activePreset.id === 'random-system'
        ? generateRandomSystem(simState.bodies.length, simState.G)
        : activePreset.bodies;
    const nextState = buildSimulationState(
      bodies,
      0,
      undefined,
      activePreset.G ?? DEFAULT_G,
      activePreset.dt ?? FIXED_DT,
      activePreset.softening ?? DEFAULT_SOFTENING,
    );
    setSimState(nextState);
    setSelectedBodyIndex(0);
    viewportApiRef.current?.resetScene(nextState, activePreset.cameraPosition);
  };

  const handleSingleStep = () => {
    if (isPlaying) {
      setIsPlaying(false);
    }
    viewportApiRef.current?.stepOnce();
  };

  const handleSetBodyCount = (count: number) => {
    setSimState((prev) => {
      const next = setBodyCountInState(prev, count);
      setSelectedBodyIndex((curr) => Math.min(curr, next.bodies.length - 1));
      viewportApiRef.current?.syncExternalState(next, false);
      return next;
    });
  };

  const handleRemoveBody = (bodyIndex: number) => {
    setSimState((prev) => {
      const next = removeBodyFromState(prev, bodyIndex);
      setSelectedBodyIndex((curr) => Math.min(curr, next.bodies.length - 1));
      viewportApiRef.current?.syncExternalState(next, true);
      return next;
    });
  };

  const handleUpdateBody = (
    bodyIndex: number,
    patch: {
      name?: string;
      color?: string;
      mass?: number;
      radius?: number;
      position?: Vec3;
      velocity?: Vec3;
    },
  ) => {
    setSimState((prev) => {
      const next = updateBodyInState(prev, bodyIndex, patch);
      viewportApiRef.current?.syncExternalState(next, patch.position !== undefined);
      return next;
    });
  };

  const handleUpdatePhysicsParams = (patch: { G?: number; dt?: number }) => {
    setSimState((prev) => {
      const next = updatePhysicsParamsInState(prev, patch);
      viewportApiRef.current?.syncExternalState(next, false);
      return next;
    });
  };

  const handleChangeTrailLength = (trailLength: number) => {
    setViewOptions((prev) => ({ ...prev, trailLength }));
  };

  const toggleViewOption = (
    key: Exclude<keyof SceneViewOptions, 'trailLength'>,
  ) => {
    setViewOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCameraPreset = (preset: CameraPresetType) => {
    viewportApiRef.current?.setCameraPreset(preset, activePreset.cameraPosition);
  };

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden bg-[#060911] text-slate-100"
      data-playing={isPlaying ? 'true' : 'false'}
      data-preset={activePresetId}
      data-body-count={simState.bodies.length}
    >
      {/* Top Control & Playback Bar */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/90 bg-[#080C16] px-3 sm:px-4 py-2 shrink-0">
        {/* Left: Collapse Left Panel + Brand Title */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowLeftPanel((s) => !s)}
            aria-expanded={showLeftPanel}
            aria-label={showLeftPanel ? 'Collapse configuration panel' : 'Expand configuration panel'}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700/80 bg-[#0D1322] px-2 py-1.5 text-xs font-medium text-slate-200 hover:bg-[#141D33] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {showLeftPanel ? (
              <PanelLeftClose className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            ) : (
              <PanelLeftOpen className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
            )}
            <span className="hidden md:inline">Controls</span>
          </button>

          <Orbit className="h-5 w-5 text-sky-400 shrink-0" aria-hidden="true" />
          <h1 className="text-sm sm:text-base font-semibold tracking-tight text-slate-100 whitespace-nowrap">
            N-Body Gravitational Simulator
          </h1>
        </div>

        {/* Right: Play/Pause, Step, Reset, Speed, Collapse Right Panel */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setIsPlaying((p) => !p)}
            aria-label={isPlaying ? 'Pause simulation' : 'Play simulation'}
            className="inline-flex items-center gap-1.5 rounded-md bg-sky-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-sky-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isPlaying ? (
              <>
                <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Play</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleSingleStep}
            aria-label="Single step simulation"
            className="inline-flex items-center gap-1 rounded-md border border-slate-700/80 bg-[#0D1322] px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-[#141D33] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <StepForward className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
            <span>Step</span>
          </button>

          <button
            type="button"
            onClick={handleReset}
            aria-label="Reset simulation"
            className="inline-flex items-center gap-1 rounded-md border border-slate-700/80 bg-[#0D1322] px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-[#141D33] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            <span>Reset</span>
          </button>

          {/* Speed Multiplier */}
          <div className="flex items-center gap-2 rounded-md border border-slate-800 bg-[#0B101D] px-2.5 py-1">
            <label
              htmlFor="sim-speed-slider"
              className="text-[11px] font-medium text-slate-400 whitespace-nowrap"
            >
              Speed
            </label>
            <input
              id="sim-speed-slider"
              aria-label="Simulation speed"
              type="range"
              min={0.1}
              max={5.0}
              step={0.1}
              value={speedMultiplier}
              onChange={(e) => setSpeedMultiplier(parseFloat(e.target.value))}
              className="sci-slider w-14 sm:w-20 cursor-pointer"
            />
            <span
              className="w-8 text-right font-mono text-[11px] tabular-nums text-slate-100"
              data-testid="speed-readout"
            >
              {speedMultiplier.toFixed(1)}×
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowRightPanel((s) => !s)}
            aria-expanded={showRightPanel}
            aria-label={showRightPanel ? 'Collapse telemetry panel' : 'Expand telemetry panel'}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700/80 bg-[#0D1322] px-2 py-1.5 text-xs font-medium text-slate-200 hover:bg-[#141D33] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {showRightPanel ? (
              <PanelRightClose className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            ) : (
              <PanelRightOpen className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
            )}
            <span className="hidden md:inline">Telemetry</span>
          </button>
        </div>
      </header>

      {/* Main 3-Section Layout: Left Configuration Panel | Center 3D Viewport | Right Telemetry Dashboard */}
      <main className="flex flex-1 min-h-0 flex-col lg:flex-row overflow-hidden">
        {/* Section 1: Left Collapsible Panel */}
        {showLeftPanel && (
          <div className="h-[38vh] lg:h-full w-full lg:w-[318px] xl:w-[332px] shrink-0 border-b lg:border-b-0 lg:border-r border-slate-800/90 overflow-hidden">
            <LeftControlPanel
              simState={simState}
              activePresetId={activePresetId}
              selectedBodyIndex={selectedBodyIndex}
              trailLength={viewOptions.trailLength}
              onSelectPreset={handleSelectPreset}
              onRandomize={handleRandomize}
              onSetBodyCount={handleSetBodyCount}
              onUpdatePhysicsParams={handleUpdatePhysicsParams}
              onChangeTrailLength={handleChangeTrailLength}
              onSelectBody={setSelectedBodyIndex}
              onUpdateBody={handleUpdateBody}
              onRemoveBody={handleRemoveBody}
            />
          </div>
        )}

        {/* Section 2: Center Interactive 3D Simulation Viewport */}
        <div className="relative flex-1 min-h-[280px] lg:min-h-0 overflow-hidden">
          <ThreeBodyViewport
            initialState={initialStateRef.current}
            defaultCameraPosition={activePreset.cameraPosition}
            isPlaying={isPlaying}
            speedMultiplier={speedMultiplier}
            viewOptions={viewOptions}
            onTelemetryTick={handleTelemetryTick}
            apiRef={viewportApiRef}
          />

          {/* Top-Left Unboxed Legend & Controls Hint */}
          <div className="pointer-events-none absolute top-3 left-3 max-w-lg space-y-1 pr-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-slate-200">
              {simState.bodies.map((b) => (
                <span key={b.id} className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-xs shrink-0"
                    style={{ backgroundColor: b.color }}
                    aria-hidden="true"
                  />
                  <span>
                    #{b.id} {b.name}
                  </span>
                </span>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 leading-snug hidden sm:block">
              {activePreset.summary}
            </p>
            <p className="text-[11px] text-slate-500">
              Drag to orbit · Scroll to zoom · Right-drag to pan
            </p>
          </div>

          {/* Bottom-Center Collapsible Camera & Vector Overlay Dock (solid obsidian, zero backdrop-blur) */}
          <div className="pointer-events-none absolute bottom-2.5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 max-w-[96%]">
            <button
              type="button"
              onClick={() => setShowViewportDock((v) => !v)}
              aria-expanded={showViewportDock}
              className="pointer-events-auto rounded border border-slate-800 bg-[#090D18]/95 px-2.5 py-0.5 text-[11px] font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              {showViewportDock ? 'Hide Viewport Tools' : 'Show Viewport Tools'}
            </button>

            {showViewportDock && (
              <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-slate-800 bg-[#090D18]/95 px-2 py-1 max-w-full overflow-x-auto sci-scroll">
                {/* Camera Presets */}
                <div className="flex items-center gap-0.5 border-r border-slate-800 pr-1.5 shrink-0">
                  <Compass className="h-3.5 w-3.5 text-slate-400 mr-0.5 shrink-0" aria-hidden="true" />
                  {(
                    [
                      { key: 'default', label: 'Reset' },
                      { key: 'perspective', label: '3D' },
                      { key: 'top', label: 'Top' },
                      { key: 'side', label: 'Side' },
                    ] as const
                  ).map((cam) => (
                    <button
                      key={cam.key}
                      type="button"
                      onClick={() => handleCameraPreset(cam.key)}
                      className="rounded px-1.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {cam.label}
                    </button>
                  ))}
                </div>

                {/* Scene Overlays */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    aria-pressed={viewOptions.showTrails}
                    onClick={() => toggleViewOption('showTrails')}
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      viewOptions.showTrails
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                    <span>Trails</span>
                  </button>

                  <button
                    type="button"
                    aria-pressed={viewOptions.showVelocityVectors}
                    onClick={() => toggleViewOption('showVelocityVectors')}
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      viewOptions.showVelocityVectors
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    <Move3d className="h-3 w-3" aria-hidden="true" />
                    <span>Vel</span>
                  </button>

                  <button
                    type="button"
                    aria-pressed={viewOptions.showAccelerationVectors}
                    onClick={() => toggleViewOption('showAccelerationVectors')}
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      viewOptions.showAccelerationVectors
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    <span>Accel</span>
                  </button>

                  <button
                    type="button"
                    aria-pressed={viewOptions.showForceVectors}
                    onClick={() => toggleViewOption('showForceVectors')}
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      viewOptions.showForceVectors
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    <span>Force</span>
                  </button>

                  <button
                    type="button"
                    aria-pressed={viewOptions.showForceLinks}
                    onClick={() => toggleViewOption('showForceLinks')}
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      viewOptions.showForceLinks
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    <SlidersHorizontal className="h-3 w-3" aria-hidden="true" />
                    <span>Links</span>
                  </button>

                  <button
                    type="button"
                    aria-pressed={viewOptions.showGrid}
                    onClick={() => toggleViewOption('showGrid')}
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      viewOptions.showGrid
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    <Grid3x3 className="h-3 w-3" aria-hidden="true" />
                    <span>Grid</span>
                  </button>

                  <button
                    type="button"
                    aria-pressed={viewOptions.followCom}
                    onClick={() => toggleViewOption('followCom')}
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      viewOptions.followCom
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    <span>COM</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section 3: Right Collapsible Real-Time Telemetry Dashboard */}
        {showRightPanel && (
          <div className="h-[40vh] lg:h-full w-full lg:w-[360px] xl:w-[400px] shrink-0 border-t lg:border-t-0 lg:border-l border-slate-800/90 overflow-hidden">
            <TelemetryDashboard
              simState={simState}
              fps={fps}
              speedMultiplier={speedMultiplier}
              trailCounts={trailCounts}
              isPlaying={isPlaying}
              onSelectBodyForEdit={(idx) => {
                setSelectedBodyIndex(idx);
                if (!showLeftPanel) setShowLeftPanel(true);
              }}
            />
          </div>
        )}
      </main>
      <SpeedInsights />
      <Analytics />
    </div>
  );
}
