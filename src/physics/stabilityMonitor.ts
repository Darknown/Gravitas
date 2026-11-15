import type { BodyState, SystemTelemetry } from './threeBodyEngine';

export type StabilityLevel = 'nominal' | 'elevated' | 'unstable';

export interface StabilityMemory {
  peakObservedSpeed: number;
  minObservedDistance: number;
  latchedSpikeBodyId: number | null;
  latchedSpikeSpeed: number;
}

export interface StabilityReport {
  level: StabilityLevel;
  label: string;
  reason: string;
  velocitySpikeDetected: boolean;
  velocitySpikeBodyId: number | null;
  ejectionDetected: boolean;
  ejectedBodyId: number | null;
  closeEncounterActive: boolean;
  closestPairLabel: string;
  minDistance: number;
  minObservedDistance: number;
  maxSpeed: number;
  peakObservedSpeed: number;
  energyDriftUnstable: boolean;
  memory: StabilityMemory;
}

export const STABILITY_THRESHOLDS = {
  VELOCITY_SPIKE: 3.8,
  VELOCITY_ELEVATED: 2.6,
  CLOSE_ENCOUNTER_CRITICAL: 0.12,
  CLOSE_ENCOUNTER_ELEVATED: 0.24,
  EJECTION_DISTANCE_ESCAPE: 3.8,
  EJECTION_DISTANCE_HARD: 8.5,
  ENERGY_DRIFT_UNSTABLE_PCT: 0.5,
  ENERGY_DRIFT_ELEVATED_PCT: 0.05,
} as const;

/**
 * Evaluates physical and numerical stability of an N-body gravitational system (N = 2..10):
 * - Extreme velocity spikes from tight gravitational slingshots
 * - Hyperbolic ejection / escape from the remaining (N-1)-body subsystem center of mass
 * - Close gravitational encounters
 * - Numerical mechanical energy drift
 */
export function evaluateSystemStability(
  bodies: BodyState[],
  telemetry: SystemTelemetry,
  G: number,
  prevMemory?: StabilityMemory,
): StabilityReport {
  let maxSpeed = 0;
  let maxSpeedBodyId = bodies[0]?.id ?? 1;

  for (const b of bodies) {
    if (b.speed >= maxSpeed) {
      maxSpeed = b.speed;
      maxSpeedBodyId = b.id;
    }
  }

  let minDistance = Infinity;
  let closestPairLabel = telemetry.pairs[0]?.label ?? '—';
  for (const p of telemetry.pairs) {
    if (p.distance < minDistance) {
      minDistance = p.distance;
      closestPairLabel = p.label;
    }
  }

  const com = telemetry.centerOfMass;
  const totalMomentum = telemetry.totalMomentum;
  let ejectedBodyId: number | null = null;
  let maxSeparationFromSubsystem = 0;

  for (const b of bodies) {
    const otherMass = Math.max(0.01, telemetry.totalMass - b.mass);
    const otherComX = (telemetry.totalMass * com[0] - b.mass * b.position[0]) / otherMass;
    const otherComY = (telemetry.totalMass * com[1] - b.mass * b.position[1]) / otherMass;
    const otherComZ = (telemetry.totalMass * com[2] - b.mass * b.position[2]) / otherMass;

    const otherVelX = (totalMomentum[0] - b.mass * b.velocity[0]) / otherMass;
    const otherVelY = (totalMomentum[1] - b.mass * b.velocity[1]) / otherMass;
    const otherVelZ = (totalMomentum[2] - b.mass * b.velocity[2]) / otherMass;

    const rx = b.position[0] - otherComX;
    const ry = b.position[1] - otherComY;
    const rz = b.position[2] - otherComZ;
    const vx = b.velocity[0] - otherVelX;
    const vy = b.velocity[1] - otherVelY;
    const vz = b.velocity[2] - otherVelZ;

    const rSep = Math.sqrt(rx * rx + ry * ry + rz * rz);
    const vRelSq = vx * vx + vy * vy + vz * vz;
    if (rSep > maxSeparationFromSubsystem) maxSeparationFromSubsystem = rSep;

    const radialDotVel = rx * vx + ry * vy + rz * vz;
    const specificEscapeEnergy =
      0.5 * vRelSq - (G * telemetry.totalMass) / Math.max(0.05, rSep);

    const isHyperbolicEscape =
      rSep >= STABILITY_THRESHOLDS.EJECTION_DISTANCE_ESCAPE &&
      radialDotVel > 0 &&
      specificEscapeEnergy > 0;

    if (isHyperbolicEscape || rSep >= STABILITY_THRESHOLDS.EJECTION_DISTANCE_HARD) {
      ejectedBodyId = b.id;
      break;
    }
  }

  const peakObservedSpeed = Math.max(prevMemory?.peakObservedSpeed ?? 0, maxSpeed);
  const minObservedDistance = Math.min(
    prevMemory?.minObservedDistance ?? Infinity,
    minDistance,
  );

  // Relative velocity spike threshold scales softly when G is high (e.g. Solar System G=1, M_sun=6)
  const effectiveSpikeThreshold =
    STABILITY_THRESHOLDS.VELOCITY_SPIKE * Math.max(1, Math.sqrt(G));

  const liveSpike = maxSpeed >= effectiveSpikeThreshold;
  const latchedSpikeBodyId = liveSpike
    ? maxSpeedBodyId
    : prevMemory?.latchedSpikeBodyId ?? null;
  const latchedSpikeSpeed = liveSpike
    ? Math.max(maxSpeed, prevMemory?.latchedSpikeSpeed ?? 0)
    : prevMemory?.latchedSpikeSpeed ?? 0;

  const velocitySpikeDetected = liveSpike || latchedSpikeBodyId !== null;
  const velocitySpikeBodyId = liveSpike ? maxSpeedBodyId : latchedSpikeBodyId;
  const ejectionDetected = ejectedBodyId !== null;
  const energyDriftUnstable =
    Math.abs(telemetry.energyDriftPct) >= STABILITY_THRESHOLDS.ENERGY_DRIFT_UNSTABLE_PCT;
  const closeEncounterCritical =
    minDistance <= STABILITY_THRESHOLDS.CLOSE_ENCOUNTER_CRITICAL;
  const closeEncounterActive =
    minDistance <= STABILITY_THRESHOLDS.CLOSE_ENCOUNTER_ELEVATED;

  let level: StabilityLevel = 'nominal';
  let label = '● Nominal';
  let reason = 'Orbital energy and velocities within stable bounds';

  if (
    ejectionDetected ||
    velocitySpikeDetected ||
    energyDriftUnstable ||
    closeEncounterCritical
  ) {
    level = 'unstable';
    label = '✖ Unstable';
    if (ejectionDetected && ejectedBodyId !== null) {
      reason = `Ejection detected: Body ${ejectedBodyId} escaping system (${maxSeparationFromSubsystem.toFixed(2)} AU)`;
    } else if (velocitySpikeDetected && velocitySpikeBodyId !== null) {
      const displaySpeed = Math.max(maxSpeed, latchedSpikeSpeed);
      reason = `Extreme velocity spike: Body ${velocitySpikeBodyId} reached ${displaySpeed.toFixed(2)} AU/τ`;
    } else if (energyDriftUnstable) {
      reason = `Energy conservation drift (${telemetry.energyDriftPct.toFixed(2)}%) from close encounter`;
    } else {
      reason = `Critical close encounter: ${closestPairLabel} (${minDistance.toFixed(3)} AU)`;
    }
  } else if (
    closeEncounterActive ||
    maxSpeed >= STABILITY_THRESHOLDS.VELOCITY_ELEVATED * Math.max(1, Math.sqrt(G)) ||
    Math.abs(telemetry.energyDriftPct) >= STABILITY_THRESHOLDS.ENERGY_DRIFT_ELEVATED_PCT
  ) {
    level = 'elevated';
    label = '▲ Close Encounter';
    if (closeEncounterActive) {
      reason = `Close approach: ${closestPairLabel} (${minDistance.toFixed(3)} AU)`;
    } else if (maxSpeed >= STABILITY_THRESHOLDS.VELOCITY_ELEVATED * Math.max(1, Math.sqrt(G))) {
      reason = `Elevated velocity on Body ${maxSpeedBodyId} (${maxSpeed.toFixed(2)} AU/τ)`;
    } else {
      reason = `Minor integration drift (${telemetry.energyDriftPct.toFixed(3)}%)`;
    }
  }

  return {
    level,
    label,
    reason,
    velocitySpikeDetected,
    velocitySpikeBodyId,
    ejectionDetected,
    ejectedBodyId,
    closeEncounterActive,
    closestPairLabel,
    minDistance,
    minObservedDistance,
    maxSpeed,
    peakObservedSpeed,
    energyDriftUnstable,
    memory: {
      peakObservedSpeed,
      minObservedDistance,
      latchedSpikeBodyId,
      latchedSpikeSpeed,
    },
  };
}
