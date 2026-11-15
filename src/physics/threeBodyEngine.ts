import {
  evaluateSystemStability,
  StabilityMemory,
  StabilityReport,
} from './stabilityMonitor';

export type Vec3 = [number, number, number];

export interface BodyInit {
  id: number;
  name: string;
  color: string;
  mass: number;
  position: Vec3;
  velocity: Vec3;
  radius?: number;
}

export interface BodyState extends BodyInit {
  radius: number;
  acceleration: Vec3;
  netForce: Vec3;
  speed: number;
  accelMag: number;
  forceMag: number;
  kineticEnergy: number;
}

export interface PairwiseInteraction {
  pair: [number, number];
  label: string;
  distance: number;
  forceMagnitude: number;
  potentialEnergy: number;
}

export interface SystemTelemetry {
  bodyCount: number;
  time: number;
  kineticEnergy: number;
  potentialEnergy: number;
  totalEnergy: number;
  initialEnergy: number;
  energyDriftPct: number;
  totalMomentum: Vec3;
  momentumMagnitude: number;
  totalAngularMomentum: Vec3;
  angularMomentumMagnitude: number;
  centerOfMass: Vec3;
  totalMass: number;
  pairs: PairwiseInteraction[];
}

export interface SimulationState {
  bodies: BodyState[];
  telemetry: SystemTelemetry;
  stability: StabilityReport;
  G: number;
  dt: number;
  softening: number;
}

export const MIN_BODIES = 2;
export const MAX_BODIES = 10;
export const DEFAULT_G = 1.0;
export const DEFAULT_SOFTENING = 0.015;
export const FIXED_DT = 0.002;

export const BODY_COLOR_PALETTE = [
  '#38BDF8', // Sky / Alpha
  '#F59E0B', // Amber / Helios
  '#F43F5E', // Rose / Cinder
  '#34D399', // Emerald / Verdant
  '#A78BFA', // Violet / Lyra
  '#FB7185', // Coral / Pyre
  '#2DD4BF', // Teal / Thalassa
  '#FBBF24', // Gold / Aurelia
  '#60A5FA', // Cobalt / Boreas
  '#E879F9', // Magenta / Nebula
] as const;

export const BODY_DEFAULT_NAMES = [
  'Alpha',
  'Helios',
  'Cinder',
  'Verdant',
  'Lyra',
  'Pyre',
  'Thalassa',
  'Aurelia',
  'Boreas',
  'Vega',
] as const;

function vecLenSq(v: Vec3): number {
  return v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
}

function vecLen(v: Vec3): number {
  return Math.sqrt(vecLenSq(v));
}

export function computeBodyVisualRadius(mass: number): number {
  const clamped = Math.max(0.05, Math.min(20, mass));
  return Number((0.08 + 0.06 * Math.cbrt(clamped)).toFixed(3));
}

export function clampBodyCount(count: number): number {
  return Math.max(MIN_BODIES, Math.min(MAX_BODIES, Math.round(count)));
}

/**
 * Computes Newtonian gravitational accelerations for all N interacting bodies:
 * a_i = G * sum_{j != i} m_j * (r_j - r_i) / (|r_j - r_i|^2 + eps^2)^(3/2)
 */
export function computeAccelerations(
  positions: Vec3[],
  masses: number[],
  G = DEFAULT_G,
  softening = DEFAULT_SOFTENING,
): Vec3[] {
  const n = positions.length;
  const acc: Vec3[] = Array.from({ length: n }, () => [0, 0, 0]);
  const eps2 = softening * softening;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = positions[j][0] - positions[i][0];
      const dy = positions[j][1] - positions[i][1];
      const dz = positions[j][2] - positions[i][2];
      const distSq = dx * dx + dy * dy + dz * dz + eps2;
      const invDist3 = 1.0 / (distSq * Math.sqrt(distSq));

      const factorI = G * masses[j] * invDist3;
      const factorJ = G * masses[i] * invDist3;

      acc[i][0] += dx * factorI;
      acc[i][1] += dy * factorI;
      acc[i][2] += dz * factorI;

      acc[j][0] -= dx * factorJ;
      acc[j][1] -= dy * factorJ;
      acc[j][2] -= dz * factorJ;
    }
  }

  return acc;
}

/**
 * Advances the N-body system by one step dt using 4th-order Runge-Kutta (RK4).
 */
export function stepRK4(
  state: SimulationState,
  dtOverride?: number,
): SimulationState {
  const dt = dtOverride ?? state.dt;
  const { G, softening, bodies } = state;
  const n = bodies.length;

  const masses = bodies.map((b) => b.mass);
  const r0: Vec3[] = bodies.map((b) => [b.position[0], b.position[1], b.position[2]]);
  const v0: Vec3[] = bodies.map((b) => [b.velocity[0], b.velocity[1], b.velocity[2]]);

  // Stage 1
  const k1r = v0;
  const k1v = computeAccelerations(r0, masses, G, softening);

  // Stage 2
  const halfDt = 0.5 * dt;
  const r2: Vec3[] = Array.from({ length: n }, (_, i) => [
    r0[i][0] + halfDt * k1r[i][0],
    r0[i][1] + halfDt * k1r[i][1],
    r0[i][2] + halfDt * k1r[i][2],
  ]);
  const v2: Vec3[] = Array.from({ length: n }, (_, i) => [
    v0[i][0] + halfDt * k1v[i][0],
    v0[i][1] + halfDt * k1v[i][1],
    v0[i][2] + halfDt * k1v[i][2],
  ]);
  const k2r = v2;
  const k2v = computeAccelerations(r2, masses, G, softening);

  // Stage 3
  const r3: Vec3[] = Array.from({ length: n }, (_, i) => [
    r0[i][0] + halfDt * k2r[i][0],
    r0[i][1] + halfDt * k2r[i][1],
    r0[i][2] + halfDt * k2r[i][2],
  ]);
  const v3: Vec3[] = Array.from({ length: n }, (_, i) => [
    v0[i][0] + halfDt * k2v[i][0],
    v0[i][1] + halfDt * k2v[i][1],
    v0[i][2] + halfDt * k2v[i][2],
  ]);
  const k3r = v3;
  const k3v = computeAccelerations(r3, masses, G, softening);

  // Stage 4
  const r4: Vec3[] = Array.from({ length: n }, (_, i) => [
    r0[i][0] + dt * k3r[i][0],
    r0[i][1] + dt * k3r[i][1],
    r0[i][2] + dt * k3r[i][2],
  ]);
  const v4: Vec3[] = Array.from({ length: n }, (_, i) => [
    v0[i][0] + dt * k3v[i][0],
    v0[i][1] + dt * k3v[i][1],
    v0[i][2] + dt * k3v[i][2],
  ]);
  const k4r = v4;
  const k4v = computeAccelerations(r4, masses, G, softening);

  const sixthDt = dt / 6.0;
  const nextBodies: BodyInit[] = bodies.map((b, i) => ({
    id: b.id,
    name: b.name,
    color: b.color,
    mass: b.mass,
    radius: b.radius,
    position: [
      r0[i][0] + sixthDt * (k1r[i][0] + 2 * k2r[i][0] + 2 * k3r[i][0] + k4r[i][0]),
      r0[i][1] + sixthDt * (k1r[i][1] + 2 * k2r[i][1] + 2 * k3r[i][1] + k4r[i][1]),
      r0[i][2] + sixthDt * (k1r[i][2] + 2 * k2r[i][2] + 2 * k3r[i][2] + k4r[i][2]),
    ],
    velocity: [
      v0[i][0] + sixthDt * (k1v[i][0] + 2 * k2v[i][0] + 2 * k3v[i][0] + k4v[i][0]),
      v0[i][1] + sixthDt * (k1v[i][1] + 2 * k2v[i][1] + 2 * k3v[i][1] + k4v[i][1]),
      v0[i][2] + sixthDt * (k1v[i][2] + 2 * k2v[i][2] + 2 * k3v[i][2] + k4v[i][2]),
    ],
  }));

  return buildSimulationState(
    nextBodies,
    state.telemetry.time + dt,
    state.telemetry.initialEnergy,
    G,
    state.dt,
    softening,
    state.stability.memory,
  );
}

/**
 * Builds full synchronized telemetry and derived quantities for an N-body snapshot.
 */
export function buildSimulationState(
  inits: BodyInit[],
  time = 0,
  initialEnergy?: number,
  G = DEFAULT_G,
  dt = FIXED_DT,
  softening = DEFAULT_SOFTENING,
  prevStabilityMemory?: StabilityMemory,
): SimulationState {
  const positions: Vec3[] = inits.map((b) => [b.position[0], b.position[1], b.position[2]]);
  const masses: number[] = inits.map((b) => Math.max(0.01, b.mass));
  const accelerations = computeAccelerations(positions, masses, G, softening);

  let kineticEnergy = 0;
  let totalMass = 0;
  const totalMomentum: Vec3 = [0, 0, 0];
  const totalAngularMomentum: Vec3 = [0, 0, 0];
  const centerOfMass: Vec3 = [0, 0, 0];

  const bodies: BodyState[] = inits.map((b, i) => {
    const m = masses[i];
    const r = positions[i];
    const v = b.velocity;
    const a = accelerations[i];
    const speedSq = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
    const speed = Math.sqrt(speedSq);
    const accelMag = vecLen(a);
    const netForce: Vec3 = [m * a[0], m * a[1], m * a[2]];
    const forceMag = m * accelMag;
    const bodyKe = 0.5 * m * speedSq;

    kineticEnergy += bodyKe;
    totalMass += m;

    const px = m * v[0];
    const py = m * v[1];
    const pz = m * v[2];
    totalMomentum[0] += px;
    totalMomentum[1] += py;
    totalMomentum[2] += pz;

    // L = r x p
    totalAngularMomentum[0] += r[1] * pz - r[2] * py;
    totalAngularMomentum[1] += r[2] * px - r[0] * pz;
    totalAngularMomentum[2] += r[0] * py - r[1] * px;

    centerOfMass[0] += m * r[0];
    centerOfMass[1] += m * r[1];
    centerOfMass[2] += m * r[2];

    return {
      ...b,
      mass: m,
      radius: b.radius ?? computeBodyVisualRadius(m),
      position: [r[0], r[1], r[2]],
      velocity: [v[0], v[1], v[2]],
      acceleration: a,
      netForce,
      speed,
      accelMag,
      forceMag,
      kineticEnergy: bodyKe,
    };
  });

  if (totalMass > 0) {
    centerOfMass[0] /= totalMass;
    centerOfMass[1] /= totalMass;
    centerOfMass[2] /= totalMass;
  }

  const eps2 = softening * softening;
  const pairs: PairwiseInteraction[] = [];
  let potentialEnergy = 0;

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const dx = positions[j][0] - positions[i][0];
      const dy = positions[j][1] - positions[i][1];
      const dz = positions[j][2] - positions[i][2];
      const distSq = dx * dx + dy * dy + dz * dz;
      const r = Math.sqrt(distSq);
      const rSoft = Math.sqrt(distSq + eps2);
      const pe = -(G * masses[i] * masses[j]) / rSoft;
      const forceMag = (G * masses[i] * masses[j]) / (distSq + eps2);
      potentialEnergy += pe;
      pairs.push({
        pair: [bodies[i].id, bodies[j].id],
        label: `Body ${bodies[i].id} ↔ Body ${bodies[j].id}`,
        distance: r,
        forceMagnitude: forceMag,
        potentialEnergy: pe,
      });
    }
  }

  const totalEnergy = kineticEnergy + potentialEnergy;
  const refEnergy = initialEnergy !== undefined ? initialEnergy : totalEnergy;
  const denom = Math.max(1e-9, Math.abs(refEnergy));
  const energyDriftPct = ((totalEnergy - refEnergy) / denom) * 100;

  const telemetry: SystemTelemetry = {
    bodyCount: bodies.length,
    time,
    kineticEnergy,
    potentialEnergy,
    totalEnergy,
    initialEnergy: refEnergy,
    energyDriftPct,
    totalMomentum,
    momentumMagnitude: vecLen(totalMomentum),
    totalAngularMomentum,
    angularMomentumMagnitude: vecLen(totalAngularMomentum),
    centerOfMass,
    totalMass,
    pairs,
  };

  const stability = evaluateSystemStability(bodies, telemetry, G, prevStabilityMemory);

  return {
    bodies,
    telemetry,
    stability,
    G,
    dt,
    softening,
  };
}

function toBodyInit(b: BodyState): BodyInit {
  return {
    id: b.id,
    name: b.name,
    color: b.color,
    mass: b.mass,
    radius: b.radius,
    position: [b.position[0], b.position[1], b.position[2]],
    velocity: [b.velocity[0], b.velocity[1], b.velocity[2]],
  };
}

/**
 * Generates a physically balanced additional body in an outer inclined orbit around
 * the existing system's center of mass.
 */
export function createOrbitingBody(state: SimulationState, nextIndex: number): BodyInit {
  const existingIds = new Set(state.bodies.map((b) => b.id));
  let id = 1;
  while (existingIds.has(id)) id += 1;

  const com = state.telemetry.centerOfMass;
  const totalM = Math.max(0.5, state.telemetry.totalMass);
  const angle = (nextIndex * 2.39996) % (Math.PI * 2); // golden-angle spacing
  const orbitR = 1.65 + (nextIndex % 4) * 0.42;
  const incl = ((nextIndex % 3) - 1) * 0.25;

  const px = com[0] + orbitR * Math.cos(angle);
  const py = com[1] + orbitR * Math.sin(incl);
  const pz = com[2] + orbitR * Math.sin(angle);

  const speed = Math.sqrt((state.G * totalM) / orbitR) * 0.88;
  const vx = -speed * Math.sin(angle);
  const vy = speed * Math.sin(incl) * 0.35;
  const vz = speed * Math.cos(angle);

  const paletteIdx = (id - 1) % BODY_COLOR_PALETTE.length;
  const mass = 0.75 + ((id * 0.17) % 0.6);

  return {
    id,
    name: BODY_DEFAULT_NAMES[paletteIdx] ?? `Body ${id}`,
    color: BODY_COLOR_PALETTE[paletteIdx],
    mass: Number(mass.toFixed(2)),
    radius: computeBodyVisualRadius(mass),
    position: [Number(px.toFixed(3)), Number(py.toFixed(3)), Number(pz.toFixed(3))],
    velocity: [Number(vx.toFixed(3)), Number(vy.toFixed(3)), Number(vz.toFixed(3))],
  };
}

/**
 * Dynamically sets the number of bodies in the simulation (clamped to 2..10).
 */
export function setBodyCountInState(
  state: SimulationState,
  targetCount: number,
): SimulationState {
  const clamped = clampBodyCount(targetCount);
  if (clamped === state.bodies.length) return state;

  let nextInits: BodyInit[] = state.bodies.map(toBodyInit);

  if (clamped < nextInits.length) {
    nextInits = nextInits.slice(0, clamped);
  } else {
    let tempState = state;
    while (nextInits.length < clamped) {
      const added = createOrbitingBody(tempState, nextInits.length);
      nextInits.push(added);
      tempState = buildSimulationState(
        nextInits,
        state.telemetry.time,
        undefined,
        state.G,
        state.dt,
        state.softening,
      );
    }
  }

  return buildSimulationState(
    nextInits,
    state.telemetry.time,
    undefined,
    state.G,
    state.dt,
    state.softening,
  );
}

/**
 * Removes an individual body by index (enforces minimum 2 bodies).
 */
export function removeBodyFromState(
  state: SimulationState,
  bodyIndex: number,
): SimulationState {
  if (state.bodies.length <= MIN_BODIES) return state;
  if (bodyIndex < 0 || bodyIndex >= state.bodies.length) return state;

  const nextInits = state.bodies
    .filter((_, idx) => idx !== bodyIndex)
    .map(toBodyInit);

  return buildSimulationState(
    nextInits,
    state.telemetry.time,
    undefined,
    state.G,
    state.dt,
    state.softening,
  );
}

/**
 * Updates a single body's editable properties and recomputes all synchronized telemetry.
 */
export function updateBodyInState(
  state: SimulationState,
  bodyIndex: number,
  patch: Partial<Pick<BodyInit, 'name' | 'color' | 'mass' | 'radius' | 'position' | 'velocity'>>,
): SimulationState {
  if (bodyIndex < 0 || bodyIndex >= state.bodies.length) return state;

  const nextInits = state.bodies.map((b, idx) => {
    const base = toBodyInit(b);
    if (idx !== bodyIndex) return base;
    const nextMass = patch.mass !== undefined ? Math.max(0.05, patch.mass) : base.mass;
    return {
      ...base,
      name: patch.name !== undefined ? patch.name : base.name,
      color: patch.color !== undefined ? patch.color : base.color,
      mass: nextMass,
      radius: patch.radius !== undefined ? Math.max(0.04, patch.radius) : base.radius,
      position: patch.position
        ? ([...patch.position] as Vec3)
        : base.position,
      velocity: patch.velocity
        ? ([...patch.velocity] as Vec3)
        : base.velocity,
    };
  });

  return buildSimulationState(
    nextInits,
    state.telemetry.time,
    undefined,
    state.G,
    state.dt,
    state.softening,
  );
}

/**
 * Updates global physics constants (gravitational constant G or time step dt).
 */
export function updatePhysicsParamsInState(
  state: SimulationState,
  patch: { G?: number; dt?: number },
): SimulationState {
  const nextG = patch.G !== undefined ? Math.max(0.05, patch.G) : state.G;
  const nextDt = patch.dt !== undefined ? Math.max(0.0002, Math.min(0.02, patch.dt)) : state.dt;
  return buildSimulationState(
    state.bodies.map(toBodyInit),
    state.telemetry.time,
    patch.G !== undefined ? undefined : state.telemetry.initialEnergy,
    nextG,
    nextDt,
    state.softening,
  );
}
