import * as THREE from 'three';

export interface NeutralBodyTextureSet {
  surfaceMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  glowMap: THREE.CanvasTexture;
}

function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Generates neutral grayscale/ivory procedural surface texture, bump map, and white radial
 * corona sprite texture so runtime color edits on any body update instantaneously via material tinting.
 */
export function createNeutralCelestialTextures(
  seed: number,
  maxAnisotropy: number,
): NeutralBodyTextureSet {
  const rand = seededRandom(seed);
  const w = 512;
  const h = 256;

  const surfaceCanvas = document.createElement('canvas');
  surfaceCanvas.width = w;
  surfaceCanvas.height = h;
  const sCtx = surfaceCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = w;
  bumpCanvas.height = h;
  const bCtx = bumpCanvas.getContext('2d')!;

  // Base latitudinal luminance gradient (white/ivory to mid-gray so material.color tints cleanly)
  const grad = sCtx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#6a7280');
  grad.addColorStop(0.32, '#c8d0dc');
  grad.addColorStop(0.5, '#ffffff');
  grad.addColorStop(0.68, '#c8d0dc');
  grad.addColorStop(1, '#6a7280');
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, w, h);

  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, w, h);

  // Convective bands & turbulent striations
  for (let i = 0; i < 48; i++) {
    const y = rand() * h;
    const bandH = 4 + rand() * 18;
    const lum = Math.round(105 + rand() * 145);
    sCtx.fillStyle = `rgba(${lum}, ${lum}, ${lum}, ${0.14 + rand() * 0.24})`;
    sCtx.fillRect(0, y, w, bandH);

    bCtx.fillStyle = `rgba(${lum}, ${lum}, ${lum}, 0.28)`;
    bCtx.fillRect(0, y, w, bandH);
  }

  // Granules / storm cells (seamlessly wrapped horizontally)
  for (let i = 0; i < 180; i++) {
    const cx = rand() * w;
    const cy = 12 + rand() * (h - 24);
    const rx = 6 + rand() * 26;
    const ry = 3 + rand() * 11;
    const isBright = rand() > 0.42;
    const lum = isBright ? 248 : 88;
    const alpha = 0.08 + rand() * 0.22;

    for (const offsetX of [0, -w, w]) {
      sCtx.save();
      sCtx.beginPath();
      sCtx.ellipse(cx + offsetX, cy, rx, ry, 0, 0, Math.PI * 2);
      sCtx.fillStyle = `rgba(${lum}, ${lum}, ${lum}, ${alpha})`;
      sCtx.fill();
      sCtx.restore();

      const bVal = isBright ? 218 : 48;
      bCtx.save();
      bCtx.beginPath();
      bCtx.ellipse(cx + offsetX, cy, rx, ry, 0, 0, Math.PI * 2);
      bCtx.fillStyle = `rgba(${bVal}, ${bVal}, ${bVal}, 0.18)`;
      bCtx.fill();
      bCtx.restore();
    }
  }

  const surfaceMap = new THREE.CanvasTexture(surfaceCanvas);
  surfaceMap.colorSpace = THREE.SRGBColorSpace;
  surfaceMap.wrapS = THREE.RepeatWrapping;
  surfaceMap.wrapT = THREE.ClampToEdgeWrapping;
  surfaceMap.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.ClampToEdgeWrapping;
  bumpMap.anisotropy = maxAnisotropy;

  // Soft white radial corona glow sprite (tinted at runtime via SpriteMaterial.color)
  const gSize = 256;
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = gSize;
  glowCanvas.height = gSize;
  const gCtx = glowCanvas.getContext('2d')!;

  const rGrad = gCtx.createRadialGradient(
    gSize / 2,
    gSize / 2,
    0,
    gSize / 2,
    gSize / 2,
    gSize / 2,
  );
  rGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.96)');
  rGrad.addColorStop(0.2, 'rgba(255, 255, 255, 0.72)');
  rGrad.addColorStop(0.45, 'rgba(255, 255, 255, 0.24)');
  rGrad.addColorStop(0.75, 'rgba(255, 255, 255, 0.05)');
  rGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  gCtx.fillStyle = rGrad;
  gCtx.fillRect(0, 0, gSize, gSize);

  const glowMap = new THREE.CanvasTexture(glowCanvas);
  glowMap.colorSpace = THREE.SRGBColorSpace;

  return { surfaceMap, bumpMap, glowMap };
}

/**
 * Creates a Fresnel atmospheric/coronal halo ShaderMaterial for realistic star/planet limb glow.
 */
export function createFresnelHaloMaterial(hexColor: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(hexColor) },
      uIntensity: { value: 1.35 },
    },
    vertexShader: `
      varying vec3 vNormalWorld;
      varying vec3 vWorldPos;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vNormalWorld = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec3 vNormalWorld;
      varying vec3 vWorldPos;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float ndotv = max(0.0, dot(normalize(vNormalWorld), viewDir));
        float fresnel = pow(1.0 - ndotv, 2.6);
        gl_FragColor = vec4(uColor * uIntensity, fresnel * 0.85);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
  });
}
