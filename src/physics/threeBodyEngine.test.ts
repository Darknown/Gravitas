import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSimulationState,
  computeAccelerations,
  FIXED_DT,
  MAX_BODIES,
  MIN_BODIES,
  removeBodyFromState,
  setBodyCountInState,
  stepRK4,
  updateBodyInState,
  updatePhysicsParamsInState,
} from './threeBodyEngine';
import { generateRandomSystem, ORBIT_PRESETS } from './presets';

test('Newtonian acceleration obeys action-reaction force symmetry for N bodies', () => {
  const acc = computeAccelerations(
    [
      [1, 0, 0],
      [-1, 0.5, 0],
      [0, -1, 1],
      [0.4, 0.7, -0.9],
    ],
    [2.0, 1.5, 0.75, 1.25],
    1.0,
    0,
  );
  const masses = [2.0, 1.5, 0.75, 1.25];
  let fx = 0;
  let fy = 0;
  let fz = 0;
  for (let i = 0; i < masses.length; i++) {
    fx += masses[i] * acc[i][0];
    fy += masses[i] * acc[i][1];
    fz += masses[i] * acc[i][2];
  }

  assert.ok(Math.abs(fx) < 1e-12, `Expected Fx ~ 0, got ${fx}`);
  assert.ok(Math.abs(fy) < 1e-12, `Expected Fy ~ 0, got ${fy}`);
  assert.ok(Math.abs(fz) < 1e-12, `Expected Fz ~ 0, got ${fz}`);
});

test('RK4 integrator conserves energy, linear momentum, and angular momentum for Three-Body Figure-8', () => {
  const threeBody = ORBIT_PRESETS.find((p) => p.id === 'three-body')!;
  let state = buildSimulationState(threeBody.bodies);
  const initialE = state.telemetry.totalEnergy;
  const initialL = state.telemetry.angularMomentumMagnitude;

  for (let i = 0; i < 1500; i++) {
    state = stepRK4(state, FIXED_DT);
  }

  const relativeEnergyError = Math.abs(state.telemetry.totalEnergy - initialE) / Math.abs(initialE);
  assert.ok(
    relativeEnergyError < 5e-4,
    `Expected relative energy drift < 5e-4, got ${relativeEnergyError}`,
  );
  assert.ok(
    state.telemetry.momentumMagnitude < 1e-10,
    `Expected total momentum ~ 0, got ${state.telemetry.momentumMagnitude}`,
  );
  assert.ok(
    Math.abs(state.telemetry.angularMomentumMagnitude - initialL) < 1e-6,
    `Expected angular momentum conservation, drift ${Math.abs(state.telemetry.angularMomentumMagnitude - initialL)}`,
  );
});

test('Solar System preset builds 6 bodies and stays nominal under RK4 integration', () => {
  const solar = ORBIT_PRESETS.find((p) => p.id === 'solar-system')!;
  let state = buildSimulationState(solar.bodies);
  assert.equal(state.telemetry.bodyCount, 6);
  assert.equal(state.telemetry.pairs.length, 15);
  assert.equal(state.stability.level, 'nominal');

  for (let i = 0; i < 600; i++) {
    state = stepRK4(state, FIXED_DT);
  }
  assert.equal(state.stability.level, 'nominal');
});

test('setBodyCountInState scales dynamically from 2 to 10 bodies and clamps bounds', () => {
  const twoBody = ORBIT_PRESETS.find((p) => p.id === 'two-body')!;
  const base = buildSimulationState(twoBody.bodies);
  assert.equal(base.bodies.length, 2);
  assert.equal(base.telemetry.pairs.length, 1);

  const sevenBodies = setBodyCountInState(base, 7);
  assert.equal(sevenBodies.bodies.length, 7);
  assert.equal(sevenBodies.telemetry.bodyCount, 7);
  assert.equal(sevenBodies.telemetry.pairs.length, (7 * 6) / 2);

  const clampedMax = setBodyCountInState(sevenBodies, 25);
  assert.equal(clampedMax.bodies.length, MAX_BODIES);
  assert.equal(clampedMax.telemetry.pairs.length, (MAX_BODIES * (MAX_BODIES - 1)) / 2);

  const clampedMin = setBodyCountInState(clampedMax, 1);
  assert.equal(clampedMin.bodies.length, MIN_BODIES);
});

test('removeBodyFromState removes specific body and enforces minimum of 2 bodies', () => {
  const fourBody = ORBIT_PRESETS.find((p) => p.id === 'four-body')!;
  let state = buildSimulationState(fourBody.bodies);
  state = removeBodyFromState(state, 1);
  assert.equal(state.bodies.length, 3);
  state = removeBodyFromState(state, 0);
  assert.equal(state.bodies.length, 2);
  const stillTwo = removeBodyFromState(state, 0);
  assert.equal(stillTwo.bodies.length, 2);
});

test('updateBodyInState and updatePhysicsParamsInState sync telemetry immediately', () => {
  const threeBody = ORBIT_PRESETS.find((p) => p.id === 'three-body')!;
  const initial = buildSimulationState(threeBody.bodies);
  const edited = updateBodyInState(initial, 0, {
    name: 'Sirius',
    color: '#22C55E',
    radius: 0.25,
    mass: 2.5,
  });

  assert.equal(edited.bodies[0].name, 'Sirius');
  assert.equal(edited.bodies[0].color, '#22C55E');
  assert.equal(edited.bodies[0].radius, 0.25);
  assert.equal(edited.bodies[0].mass, 2.5);
  assert.notEqual(edited.bodies[0].kineticEnergy, initial.bodies[0].kineticEnergy);

  const withParams = updatePhysicsParamsInState(edited, { G: 2.2, dt: 0.004 });
  assert.equal(withParams.G, 2.2);
  assert.equal(withParams.dt, 0.004);
  assert.ok(Math.abs(withParams.telemetry.potentialEnergy) > Math.abs(edited.telemetry.potentialEnergy));
});

test('generateRandomSystem produces valid N-body configurations with zero net momentum', () => {
  const randomBodies = generateRandomSystem(10);
  assert.equal(randomBodies.length, 10);
  const state = buildSimulationState(randomBodies);
  assert.ok(state.telemetry.momentumMagnitude < 1e-2);
});

test('Stability Monitor detects velocity spikes, close encounters, and hyperbolic ejections', () => {
  const threeBody = ORBIT_PRESETS.find((p) => p.id === 'three-body')!;
  const initial = buildSimulationState(threeBody.bodies);
  assert.equal(initial.stability.level, 'nominal');

  const spiked = updateBodyInState(initial, 0, { velocity: [4.4, 0, 0] });
  assert.equal(spiked.stability.level, 'unstable');
  assert.equal(spiked.stability.velocitySpikeDetected, true);
  assert.equal(spiked.stability.velocitySpikeBodyId, 1);

  const restored = updateBodyInState(spiked, 0, { velocity: threeBody.bodies[0].velocity });
  assert.equal(restored.stability.level, 'nominal');

  const close = updateBodyInState(initial, 0, { position: [0.18, 0, 0] });
  assert.equal(close.stability.closeEncounterActive, true);
  assert.equal(close.stability.level, 'elevated');

  const ejected = updateBodyInState(initial, 2, {
    position: [4.1, 0, 0],
    velocity: [2.1, 0, 0],
  });
  assert.equal(ejected.stability.ejectionDetected, true);
  assert.equal(ejected.stability.ejectedBodyId, 3);
  assert.equal(ejected.stability.level, 'unstable');
});
