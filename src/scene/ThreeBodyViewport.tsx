import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  MAX_BODIES,
  SimulationState,
  stepRK4,
} from '../physics/threeBodyEngine';
import {
  createFresnelHaloMaterial,
  createNeutralCelestialTextures,
} from './celestialTextures';

export type CameraPresetType = 'perspective' | 'top' | 'side' | 'default';

export interface SceneViewOptions {
  showTrails: boolean;
  trailLength: number;
  showVelocityVectors: boolean;
  showAccelerationVectors: boolean;
  showForceVectors: boolean;
  showForceLinks: boolean;
  showGrid: boolean;
  followCom: boolean;
}

export interface ViewportImperativeApi {
  resetScene: (nextState: SimulationState, cameraPos?: [number, number, number]) => void;
  syncExternalState: (nextState: SimulationState, clearTrails?: boolean) => void;
  setCameraPreset: (preset: CameraPresetType, defaultCamPos?: [number, number, number]) => void;
  stepOnce: () => void;
}

interface ThreeBodyViewportProps {
  initialState: SimulationState;
  defaultCameraPosition: [number, number, number];
  isPlaying: boolean;
  speedMultiplier: number;
  viewOptions: SceneViewOptions;
  onTelemetryTick: (state: SimulationState, fps: number, trailCounts: number[]) => void;
  apiRef: React.MutableRefObject<ViewportImperativeApi | null>;
}

const MAX_TRAIL_CAPACITY = 2000;
const LIGHT_POOL_SIZE = 4;

// Pre-allocated scratch math helpers (zero GC inside render loop)
const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();
const _vecDir = new THREE.Vector3();
const _targetCamPos = new THREE.Vector3();
const _targetLookAt = new THREE.Vector3();
const _scratchColor = new THREE.Color();
const _ringMixColor = new THREE.Color('#cbd5e1');

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export const ThreeBodyViewport: React.FC<ThreeBodyViewportProps> = ({
  initialState,
  defaultCameraPosition,
  isPlaying,
  speedMultiplier,
  viewOptions,
  onTelemetryTick,
  apiRef,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  const simStateRef = useRef<SimulationState>(initialState);
  const isPlayingRef = useRef<boolean>(isPlaying);
  const speedRef = useRef<number>(speedMultiplier);
  const viewOptionsRef = useRef<SceneViewOptions>(viewOptions);
  const onTelemetryRef = useRef(onTelemetryTick);
  const defaultCamPosRef = useRef<[number, number, number]>(defaultCameraPosition);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    speedRef.current = speedMultiplier;
  }, [speedMultiplier]);

  useEffect(() => {
    viewOptionsRef.current = viewOptions;
  }, [viewOptions]);

  useEffect(() => {
    onTelemetryRef.current = onTelemetryTick;
  }, [onTelemetryTick]);

  useEffect(() => {
    defaultCamPosRef.current = defaultCameraPosition;
  }, [defaultCameraPosition]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError('WebGL rendering context could not be initialized in this browser.');
      return;
    }

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.setAttribute('data-testid', 'three-body-canvas');
    container.appendChild(canvas);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError('WebGL context lost. Attempting recovery...');
    };
    const onContextRestored = () => {
      setWebglError(null);
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    // Scene & Fog
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050811);
    scene.fog = new THREE.FogExp2(0x050811, 0.0085);

    // Studio Environment Reflection for metallic planetary rings & specular sheen
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    // Camera & OrbitControls
    const camera = new THREE.PerspectiveCamera(48, width / height, 0.05, 240);
    camera.position.set(...defaultCamPosRef.current);

    const controls = new OrbitControls(camera, canvas);
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 0.9;
    controls.maxDistance = 80;
    controls.target.set(0, 0, 0);

    // Lighting rig: hemisphere + key + rim + 4 pooled point lights attached to heaviest bodies
    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x0f172a, 0.6);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1d6, 1.3);
    keyLight.position.set(6, 9, 5);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.width = 1024;
      keyLight.shadow.mapSize.height = 1024;
      keyLight.shadow.bias = -0.0005;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.45);
    rimLight.position.set(-7, -3, -6);
    scene.add(rimLight);

    const pointLightPool: THREE.PointLight[] = Array.from({ length: LIGHT_POOL_SIZE }, () => {
      const pl = new THREE.PointLight(0xffffff, 1.8, 16, 1.7);
      scene.add(pl);
      return pl;
    });

    // Deep Starfield (InstancedMesh)
    const starCount = 520;
    const starGeo = new THREE.OctahedronGeometry(0.05, 0);
    const starMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const starField = new THREE.InstancedMesh(starGeo, starMat, starCount);
    starField.frustumCulled = false;

    const dummy = new THREE.Object3D();
    const starColor = new THREE.Color();
    const starTints = [0xe0f2fe, 0xffffff, 0xfef3c7, 0xfecdd3, 0xbae6fd];
    let seed = 1337;
    const nextRand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < starCount; i++) {
      const u = nextRand();
      const v = nextRand();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 34 + nextRand() * 38;
      dummy.position.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi),
      );
      const s = 0.55 + nextRand() * 1.15;
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      starField.setMatrixAt(i, dummy.matrix);
      starColor.setHex(starTints[i % starTints.length]);
      starColor.multiplyScalar(0.55 + nextRand() * 0.45);
      starField.setColorAt(i, starColor);
    }
    starField.instanceMatrix.needsUpdate = true;
    if (starField.instanceColor) starField.instanceColor.needsUpdate = true;
    starField.computeBoundingSphere();
    scene.add(starField);

    // Expanded Ecliptic Reference Grid (24 AU Polar Rings + 48x48 AU Cartesian Grid) & COM Marker
    const gridGroup = new THREE.Group();
    const polarGrid = new THREE.PolarGridHelper(24, 16, 16, 96, 0x1e293b, 0x0f172a);
    const gridMaterials = Array.isArray(polarGrid.material)
      ? polarGrid.material
      : [polarGrid.material];
    for (const m of gridMaterials) {
      m.transparent = true;
      m.opacity = 0.52;
      m.depthWrite = false;
    }
    gridGroup.add(polarGrid);

    const cartesianGrid = new THREE.GridHelper(48, 48, 0x1e293b, 0x0d172a);
    const cartMaterials = Array.isArray(cartesianGrid.material)
      ? cartesianGrid.material
      : [cartesianGrid.material];
    for (const m of cartMaterials) {
      m.transparent = true;
      m.opacity = 0.24;
      m.depthWrite = false;
    }
    cartesianGrid.position.y = -0.004;
    gridGroup.add(cartesianGrid);

    const axesHelper = new THREE.AxesHelper(1.5);
    const axesMat = axesHelper.material as THREE.LineBasicMaterial;
    axesMat.transparent = true;
    axesMat.opacity = 0.28;
    axesHelper.position.y = 0.005;
    gridGroup.add(axesHelper);
    scene.add(gridGroup);

    const comMarker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.038, 0),
      new THREE.MeshBasicMaterial({
        color: 0x94a3b8,
        wireframe: true,
        transparent: true,
        opacity: 0.65,
      }),
    );
    scene.add(comMarker);

    // Pre-allocate 4 neutral procedural surface texture variants shared across up to 10 bodies
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const textureVariants = [0, 1, 2, 3].map((v) =>
      createNeutralCelestialTextures((v + 1) * 9173, maxAniso),
    );
    const disposables: Array<{ dispose: () => void }> = [
      starGeo,
      starMat,
      envTex,
      polarGrid,
      cartesianGrid,
      axesHelper,
      comMarker.geometry,
      comMarker.material as THREE.Material,
    ];
    for (const t of textureVariants) {
      disposables.push(t.surfaceMap, t.bumpMap, t.glowMap);
    }

    interface BodyVisual {
      group: THREE.Group;
      coreMesh: THREE.Mesh;
      coreMat: THREE.MeshPhysicalMaterial;
      ringMesh: THREE.Mesh;
      ringMat: THREE.MeshStandardMaterial;
      haloMesh: THREE.Mesh;
      haloMat: THREE.ShaderMaterial;
      coronaSprite: THREE.Sprite;
      spriteMat: THREE.SpriteMaterial;
      velArrow: THREE.ArrowHelper;
      accArrow: THREE.ArrowHelper;
      forceArrow: THREE.ArrowHelper;
      trailPositions: Float32Array;
      trailColors: Float32Array;
      trailGeometry: THREE.BufferGeometry;
      trailLine: THREE.Line;
      trailCount: number;
      baseColor: THREE.Color;
      lastColorHex: string;
    }

    const sphereGeo = new THREE.SphereGeometry(1, 40, 26);
    const haloGeo = new THREE.SphereGeometry(1.16, 28, 18);
    const ringGeo = new THREE.TorusGeometry(1.52, 0.018, 10, 64);
    disposables.push(sphereGeo, haloGeo, ringGeo);

    // Pre-allocate MAX_BODIES (10) reusable body visuals
    const bodyVisuals: BodyVisual[] = Array.from({ length: MAX_BODIES }, (_, idx) => {
      const texSet = textureVariants[idx % textureVariants.length];
      const defaultHex = '#38BDF8';
      const group = new THREE.Group();
      group.visible = false;

      const coreMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(defaultHex),
        map: texSet.surfaceMap,
        bumpMap: texSet.bumpMap,
        bumpScale: 0.035,
        emissive: new THREE.Color(defaultHex),
        emissiveMap: texSet.surfaceMap,
        emissiveIntensity: 0.68,
        roughness: 0.42,
        metalness: 0.08,
        clearcoat: 0.35,
        clearcoatRoughness: 0.4,
      });
      const coreMesh = new THREE.Mesh(sphereGeo, coreMat);
      group.add(coreMesh);
      disposables.push(coreMat);

      const haloMat = createFresnelHaloMaterial(defaultHex);
      const haloMesh = new THREE.Mesh(haloGeo, haloMat);
      group.add(haloMesh);
      disposables.push(haloMat);

      const ringMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(defaultHex).lerp(_ringMixColor, 0.28),
        roughness: 0.28,
        metalness: 0.78,
        transparent: true,
        opacity: 0.36,
        emissive: new THREE.Color(defaultHex),
        emissiveIntensity: 0.35,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2.25 + idx * 0.22;
      ringMesh.rotation.y = idx * 0.55;
      group.add(ringMesh);
      disposables.push(ringMat);

      const spriteMat = new THREE.SpriteMaterial({
        map: texSet.glowMap,
        color: new THREE.Color(defaultHex),
        transparent: true,
        opacity: 0.82,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const coronaSprite = new THREE.Sprite(spriteMat);
      coronaSprite.scale.setScalar(4.2);
      group.add(coronaSprite);
      disposables.push(spriteMat);

      scene.add(group);

      // Separate Vector Arrows: Velocity (body color), Acceleration (silver-blue), Gravity Force (amber)
      const velArrow = new THREE.ArrowHelper(
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(),
        0.5,
        0x38bdf8,
        0.12,
        0.055,
      );
      const accArrow = new THREE.ArrowHelper(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(),
        0.4,
        0xe2e8f0,
        0.09,
        0.045,
      );
      const forceArrow = new THREE.ArrowHelper(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(),
        0.4,
        0xf59e0b,
        0.09,
        0.045,
      );
      velArrow.visible = false;
      accArrow.visible = false;
      forceArrow.visible = false;
      scene.add(velArrow);
      scene.add(accArrow);
      scene.add(forceArrow);

      // Orbital Trail Buffer up to MAX_TRAIL_CAPACITY (2000)
      const trailPositions = new Float32Array(MAX_TRAIL_CAPACITY * 3);
      const trailColors = new Float32Array(MAX_TRAIL_CAPACITY * 3);
      const trailGeometry = new THREE.BufferGeometry();
      trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
      trailGeometry.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
      trailGeometry.setDrawRange(0, 0);

      const trailMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const trailLine = new THREE.Line(trailGeometry, trailMat);
      trailLine.frustumCulled = false;
      trailLine.visible = false;
      scene.add(trailLine);
      disposables.push(trailGeometry, trailMat);

      return {
        group,
        coreMesh,
        coreMat,
        ringMesh,
        ringMat,
        haloMesh,
        haloMat,
        coronaSprite,
        spriteMat,
        velArrow,
        accArrow,
        forceArrow,
        trailPositions,
        trailColors,
        trailGeometry,
        trailLine,
        trailCount: 0,
        baseColor: new THREE.Color(defaultHex),
        lastColorHex: '',
      };
    });

    // Pre-allocate up to 45 pairwise gravitational tension beams (10 * 9 / 2)
    interface ForceLinkVisual {
      line: THREE.Line;
      positions: Float32Array;
      colors: Float32Array;
      mat: THREE.LineBasicMaterial;
      i: number;
      j: number;
    }
    const forceLinkLines: ForceLinkVisual[] = [];
    for (let i = 0; i < MAX_BODIES; i++) {
      for (let j = i + 1; j < MAX_BODIES; j++) {
        const positions = new Float32Array(6);
        const colors = new Float32Array(6);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const mat = new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.35,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const line = new THREE.Line(geo, mat);
        line.frustumCulled = false;
        line.visible = false;
        scene.add(line);
        disposables.push(geo, mat);
        forceLinkLines.push({ line, positions, colors, mat, i, j });
      }
    }

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const applyBodyVisualColor = (vis: BodyVisual, hexColor: string) => {
      if (vis.lastColorHex === hexColor) return;
      vis.lastColorHex = hexColor;
      _scratchColor.set(hexColor);
      vis.baseColor.copy(_scratchColor);
      vis.coreMat.color.copy(_scratchColor);
      vis.coreMat.emissive.copy(_scratchColor);
      vis.haloMat.uniforms.uColor.value.copy(_scratchColor);
      vis.ringMat.color.copy(_scratchColor).lerp(_ringMixColor, 0.25);
      vis.ringMat.emissive.copy(_scratchColor);
      vis.spriteMat.color.copy(_scratchColor);
      vis.velArrow.setColor(_scratchColor);
    };

    const appendTrailPoint = (
      vis: BodyVisual,
      pos: [number, number, number],
      maxTrailLen: number,
    ) => {
      const cap = Math.max(20, Math.min(MAX_TRAIL_CAPACITY, Math.round(maxTrailLen)));

      if (vis.trailCount > 0) {
        const lastIdx = (vis.trailCount - 1) * 3;
        const dx = pos[0] - vis.trailPositions[lastIdx];
        const dy = pos[1] - vis.trailPositions[lastIdx + 1];
        const dz = pos[2] - vis.trailPositions[lastIdx + 2];
        if (dx * dx + dy * dy + dz * dz < 1e-6) {
          // Still trim if user reduced trailLength slider
          if (vis.trailCount > cap) {
            const excess = vis.trailCount - cap;
            vis.trailPositions.copyWithin(0, excess * 3, vis.trailCount * 3);
            vis.trailCount = cap;
          } else {
            return;
          }
        }
      }

      if (vis.trailCount > cap) {
        const excess = vis.trailCount - cap;
        vis.trailPositions.copyWithin(0, excess * 3, vis.trailCount * 3);
        vis.trailCount = cap;
      }

      if (vis.trailCount < cap) {
        const idx = vis.trailCount * 3;
        vis.trailPositions[idx] = pos[0];
        vis.trailPositions[idx + 1] = pos[1];
        vis.trailPositions[idx + 2] = pos[2];
        vis.trailCount += 1;
      } else {
        vis.trailPositions.copyWithin(0, 3, cap * 3);
        const last = (cap - 1) * 3;
        vis.trailPositions[last] = pos[0];
        vis.trailPositions[last + 1] = pos[1];
        vis.trailPositions[last + 2] = pos[2];
      }

      const count = vis.trailCount;
      const r = vis.baseColor.r;
      const g = vis.baseColor.g;
      const b = vis.baseColor.b;
      for (let k = 0; k < count; k++) {
        const t = count > 1 ? k / (count - 1) : 1;
        const fade = t * t * 0.95 + 0.05;
        const cIdx = k * 3;
        vis.trailColors[cIdx] = r * fade;
        vis.trailColors[cIdx + 1] = g * fade;
        vis.trailColors[cIdx + 2] = b * fade;
      }

      const posAttr = vis.trailGeometry.getAttribute('position') as THREE.BufferAttribute;
      const colAttr = vis.trailGeometry.getAttribute('color') as THREE.BufferAttribute;
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      vis.trailGeometry.setDrawRange(0, count);
    };

    const clearAllTrails = () => {
      for (const vis of bodyVisuals) {
        vis.trailCount = 0;
        vis.trailGeometry.setDrawRange(0, 0);
      }
    };

    const getActiveTrailCounts = (count: number): number[] => {
      const counts: number[] = [];
      for (let i = 0; i < count; i++) {
        counts.push(bodyVisuals[i].trailCount);
      }
      return counts;
    };

    const syncSceneToState = (state: SimulationState, recordTrail: boolean) => {
      const opts = viewOptionsRef.current;
      const n = Math.min(MAX_BODIES, state.bodies.length);

      gridGroup.visible = opts.showGrid;
      comMarker.visible = opts.showGrid;
      comMarker.position.set(...state.telemetry.centerOfMass);

      for (let i = 0; i < MAX_BODIES; i++) {
        const vis = bodyVisuals[i];
        if (i >= n) {
          vis.group.visible = false;
          vis.velArrow.visible = false;
          vis.accArrow.visible = false;
          vis.forceArrow.visible = false;
          vis.trailLine.visible = false;
          continue;
        }

        const body = state.bodies[i];
        vis.group.visible = true;
        applyBodyVisualColor(vis, body.color);
        vis.group.position.set(...body.position);
        vis.group.scale.setScalar(body.radius);

        if (recordTrail) {
          appendTrailPoint(vis, body.position, opts.trailLength);
        } else if (vis.trailCount > opts.trailLength) {
          appendTrailPoint(vis, body.position, opts.trailLength);
        }
        vis.trailLine.visible = opts.showTrails;

        // Velocity Vector
        vis.velArrow.visible = opts.showVelocityVectors && body.speed > 1e-4;
        if (vis.velArrow.visible) {
          _vecA.set(...body.position);
          _vecDir.set(...body.velocity).normalize();
          vis.velArrow.position.copy(_vecA);
          vis.velArrow.setDirection(_vecDir);
          const vLen = Math.min(1.4, 0.22 + body.speed * 0.42);
          vis.velArrow.setLength(vLen, Math.min(0.14, vLen * 0.28), 0.055);
        }

        // Acceleration Vector
        vis.accArrow.visible = opts.showAccelerationVectors && body.accelMag > 1e-4;
        if (vis.accArrow.visible) {
          _vecA.set(...body.position);
          _vecDir.set(...body.acceleration).normalize();
          vis.accArrow.position.copy(_vecA);
          vis.accArrow.setDirection(_vecDir);
          const aLen = Math.min(1.15, 0.16 + Math.log1p(body.accelMag) * 0.24);
          vis.accArrow.setLength(aLen, Math.min(0.11, aLen * 0.28), 0.045);
        }

        // Net Gravitational Force Vector
        vis.forceArrow.visible = opts.showForceVectors && body.forceMag > 1e-4;
        if (vis.forceArrow.visible) {
          _vecA.set(...body.position);
          _vecDir.set(...body.netForce).normalize();
          vis.forceArrow.position.copy(_vecA);
          vis.forceArrow.setDirection(_vecDir);
          const fLen = Math.min(1.25, 0.18 + Math.log1p(body.forceMag) * 0.25);
          vis.forceArrow.setLength(fLen, Math.min(0.12, fLen * 0.28), 0.048);
        }
      }

      // Position pooled PointLights at the top-4 heaviest active bodies
      const rankedIndices = Array.from({ length: n }, (_, idx) => idx).sort(
        (a, b) => state.bodies[b].mass - state.bodies[a].mass,
      );
      for (let l = 0; l < LIGHT_POOL_SIZE; l++) {
        const pl = pointLightPool[l];
        if (l < rankedIndices.length) {
          const b = state.bodies[rankedIndices[l]];
          pl.visible = true;
          pl.position.set(...b.position);
          pl.color.set(b.color);
          pl.intensity = Math.min(3.2, 1.3 + b.mass * 0.45);
        } else {
          pl.visible = false;
        }
      }

      // Pairwise gravitational force links for active pairs
      let pairLookupIdx = 0;
      for (let k = 0; k < forceLinkLines.length; k++) {
        const link = forceLinkLines[k];
        const activePair = link.i < n && link.j < n;
        link.line.visible = opts.showForceLinks && activePair;
        if (!activePair) continue;

        if (link.line.visible) {
          const bodyA = state.bodies[link.i];
          const bodyB = state.bodies[link.j];
          const pA = bodyA.position;
          const pB = bodyB.position;
          link.positions[0] = pA[0];
          link.positions[1] = pA[1];
          link.positions[2] = pA[2];
          link.positions[3] = pB[0];
          link.positions[4] = pB[1];
          link.positions[5] = pB[2];
          (link.line.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate =
            true;

          const colA = bodyVisuals[link.i].baseColor;
          const colB = bodyVisuals[link.j].baseColor;
          link.colors[0] = colA.r;
          link.colors[1] = colA.g;
          link.colors[2] = colA.b;
          link.colors[3] = colB.r;
          link.colors[4] = colB.g;
          link.colors[5] = colB.b;
          (link.line.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;

          const pairInfo = state.telemetry.pairs[pairLookupIdx];
          const fMag = pairInfo ? pairInfo.forceMagnitude : 0.2;
          link.mat.opacity = Math.min(0.65, 0.08 + Math.log1p(fMag) * 0.16);
        }
        pairLookupIdx += 1;
      }
    };

    // Seed initial snapshot into trails
    syncSceneToState(simStateRef.current, true);

    let camTransitionActive = false;
    controls.addEventListener('start', () => {
      camTransitionActive = false;
    });

    let frameId = 0;
    let isDisposed = false;
    let loopRunning = false;
    let renderBusy = false;
    let renderDirty = false;
    let lastTickMs = performance.now();
    let lastTelemetryPushMs = 0;
    let fpsCounterFrames = 0;
    let fpsLastResetMs = performance.now();
    let currentFps = isSoftwareGl ? 12 : 60;

    function afterDraw(cb: () => void) {
      if (isDisposed) return;
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      const poll = () => {
        if (isDisposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        if (!sync) {
          frameId = window.setTimeout(cb, 80);
          return;
        }
        const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function requestRender() {
      if (isDisposed || loopRunning) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (isDisposed) return;
        renderDirty = false;
        syncSceneToState(simStateRef.current, false);
        controls.update();
        renderer.render(scene, camera);
        const done = () => {
          renderBusy = false;
          if (renderDirty && !loopRunning) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    const onControlsChange = () => {
      if (!loopRunning) requestRender();
    };
    controls.addEventListener('change', onControlsChange);

    apiRef.current = {
      resetScene: (nextState, cameraPos) => {
        simStateRef.current = nextState;
        clearAllTrails();
        syncSceneToState(nextState, true);
        if (cameraPos) {
          _targetCamPos.set(...cameraPos);
          _targetLookAt.set(0, 0, 0);
          camTransitionActive = true;
          ensureLoopActive();
        }
        onTelemetryRef.current(
          nextState,
          currentFps,
          getActiveTrailCounts(nextState.bodies.length),
        );
        requestRender();
      },
      syncExternalState: (nextState, shouldClearTrails = false) => {
        simStateRef.current = nextState;
        if (shouldClearTrails) {
          clearAllTrails();
        }
        syncSceneToState(nextState, true);
        onTelemetryRef.current(
          nextState,
          currentFps,
          getActiveTrailCounts(nextState.bodies.length),
        );
        requestRender();
      },
      setCameraPreset: (preset, defaultCamPos) => {
        const com = simStateRef.current.telemetry.centerOfMass;
        _targetLookAt.set(com[0], com[1], com[2]);
        if (preset === 'top') {
          _targetCamPos.set(com[0], com[1] + 5.6, com[2] + 0.01);
        } else if (preset === 'side') {
          _targetCamPos.set(com[0], com[1] + 0.15, com[2] + 5.6);
        } else if (preset === 'perspective') {
          _targetCamPos.set(com[0] + 3.0, com[1] + 3.0, com[2] + 3.8);
        } else {
          const fallback = defaultCamPos ?? defaultCamPosRef.current;
          _targetLookAt.set(0, 0, 0);
          _targetCamPos.set(...fallback);
        }
        camTransitionActive = true;
        ensureLoopActive();
      },
      stepOnce: () => {
        const current = simStateRef.current;
        const stepCount = Math.max(1, Math.round(speedRef.current * 4));
        let next = current;
        for (let s = 0; s < stepCount; s++) {
          next = stepRK4(next, next.dt);
        }
        simStateRef.current = next;
        for (let i = 0; i < next.bodies.length; i++) {
          bodyVisuals[i].coreMesh.rotation.y += 0.04;
          bodyVisuals[i].ringMesh.rotation.z += 0.02;
        }
        syncSceneToState(next, true);
        onTelemetryRef.current(
          next,
          currentFps,
          getActiveTrailCounts(next.bodies.length),
        );
        requestRender();
      },
    };

    function tick() {
      if (isDisposed) return;

      const now = performance.now();
      const rawDt = Math.min(0.05, Math.max(0.001, (now - lastTickMs) / 1000));
      lastTickMs = now;

      fpsCounterFrames += 1;
      const fpsElapsed = now - fpsLastResetMs;
      if (fpsElapsed >= 450) {
        currentFps = Math.max(1, Math.round((fpsCounterFrames * 1000) / fpsElapsed));
        fpsCounterFrames = 0;
        fpsLastResetMs = now;
      }

      if (isPlayingRef.current) {
        const stateDt = Math.max(0.0002, simStateRef.current.dt);
        const simAdvance = rawDt * speedRef.current;
        const steps = Math.max(1, Math.min(48, Math.round(simAdvance / stateDt)));
        const stepDt = simAdvance / steps;
        let state = simStateRef.current;
        for (let s = 0; s < steps; s++) {
          state = stepRK4(state, stepDt);
        }
        simStateRef.current = state;

        for (let i = 0; i < state.bodies.length; i++) {
          bodyVisuals[i].coreMesh.rotation.y += rawDt * (0.35 + (i % 4) * 0.12);
          bodyVisuals[i].ringMesh.rotation.z += rawDt * (0.24 - (i % 3) * 0.06);
        }

        syncSceneToState(state, true);
      } else {
        syncSceneToState(simStateRef.current, false);
      }

      if (camTransitionActive) {
        camera.position.x = THREE.MathUtils.damp(camera.position.x, _targetCamPos.x, 6, rawDt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, _targetCamPos.y, 6, rawDt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, _targetCamPos.z, 6, rawDt);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, _targetLookAt.x, 6, rawDt);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, _targetLookAt.y, 6, rawDt);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, _targetLookAt.z, 6, rawDt);

        if (
          camera.position.distanceToSquared(_targetCamPos) < 0.0004 &&
          controls.target.distanceToSquared(_targetLookAt) < 0.0004
        ) {
          camera.position.copy(_targetCamPos);
          controls.target.copy(_targetLookAt);
          camTransitionActive = false;
        }
      } else if (viewOptionsRef.current.followCom && isPlayingRef.current) {
        const com = simStateRef.current.telemetry.centerOfMass;
        _vecB.set(com[0], com[1], com[2]);
        controls.target.lerp(_vecB, 1 - Math.exp(-5 * rawDt));
      }

      controls.update();
      renderer.render(scene, camera);

      if (now - lastTelemetryPushMs >= 80) {
        lastTelemetryPushMs = now;
        onTelemetryRef.current(
          simStateRef.current,
          currentFps,
          getActiveTrailCounts(simStateRef.current.bodies.length),
        );
      }

      const shouldContinue = isPlayingRef.current || camTransitionActive;
      if (shouldContinue) {
        if (isSoftwareGl) afterDraw(tick);
        else frameId = requestAnimationFrame(tick);
      } else {
        loopRunning = false;
        onTelemetryRef.current(
          simStateRef.current,
          currentFps,
          getActiveTrailCounts(simStateRef.current.bodies.length),
        );
      }
    }

    function ensureLoopActive() {
      if (isDisposed || loopRunning) return;
      loopRunning = true;
      lastTickMs = performance.now();
      if (isSoftwareGl) {
        frameId = window.setTimeout(tick, 16);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    const onWakeEvent = () => {
      if (isPlayingRef.current || camTransitionActive) {
        ensureLoopActive();
      } else {
        requestRender();
      }
    };
    window.addEventListener('threebody:wake', onWakeEvent);

    const resizeObserver = new ResizeObserver(() => {
      if (isDisposed || !container) return;
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      if (!loopRunning) requestRender();
    });
    resizeObserver.observe(container);

    ensureLoopActive();

    return () => {
      isDisposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('threebody:wake', onWakeEvent);
      controls.removeEventListener('change', onControlsChange);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      resizeObserver.disconnect();
      controls.dispose();
      for (const d of disposables) {
        d.dispose();
      }
      renderer.dispose();
      if (canvas.parentNode === container) {
        container.removeChild(canvas);
      }
    };
  }, []);

  useEffect(() => {
    window.dispatchEvent(new Event('threebody:wake'));
  }, [isPlaying, viewOptions]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#050811]">
      <div ref={mountRef} className="h-full w-full cursor-grab active:cursor-grabbing" />
      {webglError && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#060911]/95 p-6 text-center">
          <div className="max-w-md border border-slate-800 bg-[#0B101D] p-6 rounded-lg">
            <h2 className="text-base font-semibold text-slate-100">3D Viewport Unavailable</h2>
            <p className="mt-2 text-sm text-slate-400">{webglError}</p>
          </div>
        </div>
      )}
    </div>
  );
};
