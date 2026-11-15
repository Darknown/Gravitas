import {
  BODY_COLOR_PALETTE,
  BODY_DEFAULT_NAMES,
  BodyInit,
  clampBodyCount,
  computeBodyVisualRadius,
  DEFAULT_G,
  DEFAULT_SOFTENING,
  FIXED_DT,
  Vec3,
} from './threeBodyEngine';

export interface OrbitPreset {
  id: string;
  name: string;
  summary: string;
  recommendedSpeed: number;
  cameraPosition: Vec3;
  G?: number;
  dt?: number;
  softening?: number;
  bodies: BodyInit[];
}

export const BODY_PALETTE = {
  1: { name: 'Alpha', hex: '#38BDF8', label: 'Body 1' },
  2: { name: 'Helios', hex: '#F59E0B', label: 'Body 2' },
  3: { name: 'Cinder', hex: '#F43F5E', label: 'Body 3' },
} as const;

// Tilts planar 2D coordinates (x, y) into 3D space around the X-axis while preserving SO(3) symmetry.
function tiltXZ(x: number, y: number, angleDeg = 20): Vec3 {
  const rad = (angleDeg * Math.PI) / 180;
  return [x, y * Math.sin(rad), y * Math.cos(rad)];
}

/**
 * Generates N randomized bodies (2..10) in bounded 3D space with zero net linear momentum
 * so the system center of mass stays centered in the viewport.
 */
export function generateRandomSystem(
  count = 8,
  G = DEFAULT_G,
): BodyInit[] {
  const n = clampBodyCount(count);
  const rawBodies: BodyInit[] = [];

  // Place a slightly heavier central anchor body plus N-1 randomized orbiting bodies
  for (let i = 0; i < n; i++) {
    const id = i + 1;
    const paletteIdx = i % BODY_COLOR_PALETTE.length;
    const angle = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.45;
    const r = i === 0 ? 0.35 + Math.random() * 0.35 : 0.9 + Math.random() * 2.1;
    const yOffset = (Math.random() - 0.5) * 0.95;
    const mass =
      i === 0
        ? Number((1.4 + Math.random() * 1.4).toFixed(2))
        : Number((0.25 + Math.random() * 1.15).toFixed(2));
    const speedScale = Math.sqrt((G * (n * 0.65)) / Math.max(0.6, r)) * (0.45 + Math.random() * 0.45);
    const vx = -speedScale * Math.sin(angle) + (Math.random() - 0.5) * 0.18;
    const vy = (Math.random() - 0.5) * 0.32;
    const vz = speedScale * Math.cos(angle) + (Math.random() - 0.5) * 0.18;

    rawBodies.push({
      id,
      name: BODY_DEFAULT_NAMES[paletteIdx] ?? `Body ${id}`,
      color: BODY_COLOR_PALETTE[paletteIdx],
      mass,
      radius: computeBodyVisualRadius(mass),
      position: [
        Number((r * Math.cos(angle)).toFixed(3)),
        Number(yOffset.toFixed(3)),
        Number((r * Math.sin(angle)).toFixed(3)),
      ],
      velocity: [Number(vx.toFixed(3)), Number(vy.toFixed(3)), Number(vz.toFixed(3))],
    });
  }

  // Zero out center of mass and total linear momentum
  let totalMass = 0;
  let cmX = 0;
  let cmY = 0;
  let cmZ = 0;
  let pX = 0;
  let pY = 0;
  let pZ = 0;
  for (const b of rawBodies) {
    totalMass += b.mass;
    cmX += b.mass * b.position[0];
    cmY += b.mass * b.position[1];
    cmZ += b.mass * b.position[2];
    pX += b.mass * b.velocity[0];
    pY += b.mass * b.velocity[1];
    pZ += b.mass * b.velocity[2];
  }
  cmX /= totalMass;
  cmY /= totalMass;
  cmZ /= totalMass;
  const vCmX = pX / totalMass;
  const vCmY = pY / totalMass;
  const vCmZ = pZ / totalMass;

  return rawBodies.map((b) => ({
    ...b,
    position: [
      Number((b.position[0] - cmX).toFixed(3)),
      Number((b.position[1] - cmY).toFixed(3)),
      Number((b.position[2] - cmZ).toFixed(3)),
    ],
    velocity: [
      Number((b.velocity[0] - vCmX).toFixed(3)),
      Number((b.velocity[1] - vCmY).toFixed(3)),
      Number((b.velocity[2] - vCmZ).toFixed(3)),
    ],
  }));
}

function createFourBodyQuartet(): BodyInit[] {
  // Four equal masses on a square of half-diagonal r in circular choreography:
  // Net inward force on each corner = G*m^2 / (2*r^2) * (1/sqrt(2) + 1/2) ... wait:
  // Pair distances from (r,0) to (0,r), (0,-r) are sqrt(2)*r; to (-r,0) is 2*r.
  // Inward radial accel = G*m * [ 2 * cos(45)/(2*r^2) + 1/(4*r^2) ] = (G*m / r^2) * (sqrt(2)/2 + 1/4).
  const r = 1.25;
  const m = 1.0;
  const factor = Math.SQRT1_2 + 0.25;
  const v = Math.sqrt((m * factor) / r);
  const angles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

  return angles.map((theta, idx) => {
    const id = idx + 1;
    const px = r * Math.cos(theta);
    const py = r * Math.sin(theta);
    const vx = -v * Math.sin(theta);
    const vy = v * Math.cos(theta);
    return {
      id,
      name: BODY_DEFAULT_NAMES[idx],
      color: BODY_COLOR_PALETTE[idx],
      mass: m,
      radius: computeBodyVisualRadius(m),
      position: tiltXZ(px, py, 18),
      velocity: tiltXZ(vx, vy, 18),
    };
  });
}

function createSolarSystemBodies(): BodyInit[] {
  const starMass = 3.6;
  const G = DEFAULT_G;
  const planets: Array<{
    name: string;
    color: string;
    mass: number;
    radius: number;
    orbitR: number;
    phase: number;
    inclDeg: number;
  }> = [
    { name: 'Mercury', color: '#94A3B8', mass: 0.05, radius: 0.055, orbitR: 0.85, phase: 0.4, inclDeg: 4 },
    { name: 'Venus', color: '#FBBF24', mass: 0.08, radius: 0.072, orbitR: 1.25, phase: 2.1, inclDeg: 2.5 },
    { name: 'Earth', color: '#38BDF8', mass: 0.1, radius: 0.078, orbitR: 1.75, phase: 4.1, inclDeg: 0 },
    { name: 'Mars', color: '#F43F5E', mass: 0.06, radius: 0.064, orbitR: 2.35, phase: 5.4, inclDeg: 3 },
    { name: 'Jupiter', color: '#FB923C', mass: 0.28, radius: 0.12, orbitR: 3.18, phase: 1.2, inclDeg: 1.8 },
  ];

  const bodies: BodyInit[] = [
    {
      id: 1,
      name: 'Sol',
      color: '#F59E0B',
      mass: starMass,
      radius: 0.21,
      position: [0, 0, 0],
      velocity: [0, 0, 0],
    },
  ];

  let pX = 0;
  let pY = 0;
  let pZ = 0;
  for (let i = 0; i < planets.length; i++) {
    const p = planets[i];
    const speed = Math.sqrt((G * (starMass + p.mass)) / p.orbitR);
    const inclRad = (p.inclDeg * Math.PI) / 180;
    const x = p.orbitR * Math.cos(p.phase);
    const y = p.orbitR * Math.sin(p.phase) * Math.sin(inclRad);
    const z = p.orbitR * Math.sin(p.phase) * Math.cos(inclRad);

    const vx = -speed * Math.sin(p.phase);
    const vy = speed * Math.cos(p.phase) * Math.sin(inclRad);
    const vz = speed * Math.cos(p.phase) * Math.cos(inclRad);

    pX += p.mass * vx;
    pY += p.mass * vy;
    pZ += p.mass * vz;

    bodies.push({
      id: i + 2,
      name: p.name,
      color: p.color,
      mass: p.mass,
      radius: p.radius,
      position: [Number(x.toFixed(4)), Number(y.toFixed(4)), Number(z.toFixed(4))],
      velocity: [Number(vx.toFixed(4)), Number(vy.toFixed(4)), Number(vz.toFixed(4))],
    });
  }

  // Give central star counter-momentum so total system linear momentum is zero
  bodies[0].velocity = [
    Number((-pX / starMass).toFixed(5)),
    Number((-pY / starMass).toFixed(5)),
    Number((-pZ / starMass).toFixed(5)),
  ];

  return bodies;
}

export const ORBIT_PRESETS: OrbitPreset[] = [
  {
    id: 'three-body',
    name: 'Three-Body System',
    summary: 'Classic Chenciner–Montgomery Figure-8 choreography with three equal masses.',
    recommendedSpeed: 1.0,
    cameraPosition: [0, 2.7, 3.6],
    G: DEFAULT_G,
    dt: FIXED_DT,
    softening: DEFAULT_SOFTENING,
    bodies: [
      {
        id: 1,
        name: BODY_DEFAULT_NAMES[0],
        color: BODY_COLOR_PALETTE[0],
        mass: 1.0,
        radius: computeBodyVisualRadius(1.0),
        position: tiltXZ(0.97000436, -0.24308753, 22),
        velocity: tiltXZ(0.466203685, 0.43236573, 22),
      },
      {
        id: 2,
        name: BODY_DEFAULT_NAMES[1],
        color: BODY_COLOR_PALETTE[1],
        mass: 1.0,
        radius: computeBodyVisualRadius(1.0),
        position: tiltXZ(-0.97000436, 0.24308753, 22),
        velocity: tiltXZ(0.466203685, 0.43236573, 22),
      },
      {
        id: 3,
        name: BODY_DEFAULT_NAMES[2],
        color: BODY_COLOR_PALETTE[2],
        mass: 1.0,
        radius: computeBodyVisualRadius(1.0),
        position: [0, 0, 0],
        velocity: tiltXZ(-0.93240737, -0.86473146, 22),
      },
    ],
  },
  {
    id: 'two-body',
    name: 'Two-Body System',
    summary: 'Binary star system orbiting a shared barycenter in stable elliptical motion.',
    recommendedSpeed: 1.0,
    cameraPosition: [0, 2.5, 3.5],
    G: DEFAULT_G,
    dt: FIXED_DT,
    softening: DEFAULT_SOFTENING,
    bodies: (() => {
      // Binary orbit: m1=1.4 at x1=-0.65, m2=1.0 at x2=+0.91 -> r = 1.56, COM = 0
      // Circular v_rel = sqrt(G*(m1+m2)/r), slight eccentricity 0.88x
      const m1 = 1.4;
      const m2 = 1.0;
      const r = 1.56;
      const x1 = -(m2 / (m1 + m2)) * r;
      const x2 = (m1 / (m1 + m2)) * r;
      const vRel = Math.sqrt((DEFAULT_G * (m1 + m2)) / r) * 0.92;
      const v1 = -(m2 / (m1 + m2)) * vRel;
      const v2 = (m1 / (m1 + m2)) * vRel;
      return [
        {
          id: 1,
          name: BODY_DEFAULT_NAMES[0],
          color: BODY_COLOR_PALETTE[0],
          mass: m1,
          radius: computeBodyVisualRadius(m1),
          position: [Number(x1.toFixed(4)), 0.08, 0],
          velocity: [0, 0.08, Number(v1.toFixed(4))],
        },
        {
          id: 2,
          name: BODY_DEFAULT_NAMES[1],
          color: BODY_COLOR_PALETTE[1],
          mass: m2,
          radius: computeBodyVisualRadius(m2),
          position: [Number(x2.toFixed(4)), -0.112, 0],
          velocity: [0, -0.112, Number(v2.toFixed(4))],
        },
      ];
    })(),
  },
  {
    id: 'four-body',
    name: 'Four-Body System',
    summary: 'Symmetric four-body rosette maintaining dynamic equilibrium around the barycenter.',
    recommendedSpeed: 1.0,
    cameraPosition: [0.3, 3.3, 4.3],
    G: DEFAULT_G,
    dt: FIXED_DT,
    softening: DEFAULT_SOFTENING,
    bodies: createFourBodyQuartet(),
  },
  {
    id: 'solar-system',
    name: 'Solar System',
    summary: 'Central star Sol with five inner and outer planets in inclined Keplerian orbits.',
    recommendedSpeed: 0.9,
    cameraPosition: [0.8, 4.8, 6.2],
    G: DEFAULT_G,
    dt: FIXED_DT,
    softening: DEFAULT_SOFTENING,
    bodies: createSolarSystemBodies(),
  },
  {
    id: 'chaotic-system',
    name: 'Chaotic System',
    summary: 'Five asymmetric bodies undergoing close gravitational exchanges and orbital shifts.',
    recommendedSpeed: 1.0,
    cameraPosition: [0.8, 3.6, 5.2],
    G: DEFAULT_G,
    dt: FIXED_DT,
    softening: DEFAULT_SOFTENING,
    bodies: [
      {
        id: 1,
        name: BODY_DEFAULT_NAMES[0],
        color: BODY_COLOR_PALETTE[0],
        mass: 1.4,
        radius: computeBodyVisualRadius(1.4),
        position: [-0.95, 0.25, -0.25],
        velocity: [0.32, -0.16, 0.48],
      },
      {
        id: 2,
        name: BODY_DEFAULT_NAMES[1],
        color: BODY_COLOR_PALETTE[1],
        mass: 1.15,
        radius: computeBodyVisualRadius(1.15),
        position: [0.88, -0.28, 0.42],
        velocity: [-0.4, 0.22, 0.14],
      },
      {
        id: 3,
        name: BODY_DEFAULT_NAMES[2],
        color: BODY_COLOR_PALETTE[2],
        mass: 0.9,
        radius: computeBodyVisualRadius(0.9),
        position: [0.15, 0.18, -1.1],
        velocity: [0.06, -0.04, -0.7],
      },
      {
        id: 4,
        name: BODY_DEFAULT_NAMES[3],
        color: BODY_COLOR_PALETTE[3],
        mass: 0.7,
        radius: computeBodyVisualRadius(0.7),
        position: [-0.35, -0.45, 1.25],
        velocity: [0.38, 0.18, 0.24],
      },
      {
        id: 5,
        name: BODY_DEFAULT_NAMES[4],
        color: BODY_COLOR_PALETTE[4],
        mass: 0.55,
        radius: computeBodyVisualRadius(0.55),
        position: [1.35, 0.42, -0.85],
        velocity: [-0.58, -0.25, -0.35],
      },
    ],
  },
  {
    id: 'random-system',
    name: 'Random System',
    summary: 'Procedurally generated N-body configuration with randomized masses, positions, and velocities.',
    recommendedSpeed: 1.0,
    cameraPosition: [1.2, 4.2, 5.8],
    G: DEFAULT_G,
    dt: FIXED_DT,
    softening: DEFAULT_SOFTENING,
    bodies: generateRandomSystem(8, DEFAULT_G),
  },
  {
    id: 'slingshot-ejection',
    name: 'Slingshot Ejection',
    summary: 'Close three-body encounter triggering a gravitational slingshot velocity spike and ejection.',
    recommendedSpeed: 1.0,
    cameraPosition: [0.6, 3.2, 4.6],
    G: DEFAULT_G,
    dt: FIXED_DT,
    softening: DEFAULT_SOFTENING,
    bodies: [
      {
        id: 1,
        name: BODY_DEFAULT_NAMES[0],
        color: BODY_COLOR_PALETTE[0],
        mass: 1.8,
        radius: computeBodyVisualRadius(1.8),
        position: [-0.55, 0.05, 0.0],
        velocity: [0.0, 0.1, -0.82],
      },
      {
        id: 2,
        name: BODY_DEFAULT_NAMES[1],
        color: BODY_COLOR_PALETTE[1],
        mass: 1.6,
        radius: computeBodyVisualRadius(1.6),
        position: [0.55, -0.05, 0.0],
        velocity: [0.0, -0.1, 0.82],
      },
      {
        id: 3,
        name: BODY_DEFAULT_NAMES[2],
        color: BODY_COLOR_PALETTE[2],
        mass: 0.65,
        radius: computeBodyVisualRadius(0.65),
        position: [0.22, 0.32, -1.4],
        velocity: [-0.08, -0.22, 0.78],
      },
    ],
  },
];
