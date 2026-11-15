# N-Body Gravitational Simulator

An interactive, real-time 3D **N-Body Gravitational Simulator** built with React, TypeScript, and Three.js. Simulate **2 to 10 interacting celestial bodies** under Newtonian gravity using a **4th-order Runge–Kutta (RK4)** numerical integrator, complete with customizable orbital parameters, vector overlays, an automated stability monitor, and a synchronized physics telemetry dashboard.

---

## Features

### Dynamic N-Body Management (2–10 Bodies)
- Scale the simulation dynamically between **2 and 10 celestial bodies** via slider, numeric input, or **Add / Remove** controls.
- Customize every body individually:
  - **Name & Visual Color** (color picker + quick palette swatches reflected across core mesh, atmospheric halo, corona, vector arrows, and orbital trails)
  - **Physical Scale**: Mass ($M_\odot$) and visual radius ($AU$)
  - **3D State Vectors**: Position $(X, Y, Z)$ and Velocity $(V_x, V_y, V_z)$

### Predefined Orbital Presets
- **Three-Body System**: Classic Chenciner–Montgomery Figure-8 choreography with three equal masses.
- **Two-Body System**: Binary star pair orbiting a shared barycenter.
- **Four-Body System**: Symmetric four-body rosette in dynamic equilibrium.
- **Solar System**: Central star *Sol* with five planets (*Mercury*, *Venus*, *Earth*, *Mars*, *Jupiter*) in inclined Keplerian orbits.
- **Chaotic System**: Five asymmetric bodies exhibiting close gravitational exchanges and orbital shifts.
- **Random System**: Procedurally generated N-body configuration with zero net linear momentum (plus a one-click **Randomize** button).
- **Slingshot Ejection**: Close three-body encounter demonstrating gravitational slingshot acceleration and hyperbolic escape.

### RK4 Physics Engine & Stability Monitor
- Pairwise Newtonian gravity across all $N(N-1)/2$ interactions with configurable **Gravitational Constant ($G$)**, **Time Step ($\Delta t$)**, and gravitational softening ($\varepsilon = 0.015\text{ AU}$) to prevent close-encounter singularities.
- **Stability Monitor**: Continuously tracks close approaches, peak speeds, integration energy drift, and hyperbolic escape relative to the $(N-1)$-body subsystem center of mass—marking the system status **Unstable** and highlighting system energy cards in red during extreme velocity spikes or ejections.

### Interactive 3D Visualization
- Procedural surface maps, bump maps, Fresnel limb halos, equatorial rings, and additive corona sprites.
- Pooled dynamic point lights attached to the most massive active bodies.
- **OrbitControls** camera navigation (drag to rotate, scroll to zoom, right-drag to pan) plus quick camera presets (**Reset**, **3D**, **Top**, **Side**) and **Follow COM**.
- Independent overlays:
  - **Orbital Trails** with adjustable trail length (`50–2000` points)
  - **Velocity (`Vel`)**, **Acceleration (`Accel`)**, and **Net Gravitational Force (`Force`)** vector arrows
  - **Pairwise Gravity Links (`Links`)** scaled by interaction force magnitude
  - **Expanded Ecliptic Reference Grid (`Grid`)**: `24 AU` polar rings layered over a `48 × 48 AU` Cartesian reference grid

### Real-Time Telemetry Dashboard
- **System Statistics**: Active body count, total mass, Kinetic Energy ($KE$), Potential Energy ($PE$), Total Mechanical Energy ($E$) & conservation drift, Linear Momentum ($\mathbf{P}, |\mathbf{P}|$), Angular Momentum ($\mathbf{L}, |\mathbf{L}|$), and Center of Mass.
- **Individual Body Statistics**: Live $(X, Y, Z)$ position, velocity, acceleration, speed $|v|$, acceleration magnitude $|a|$, and individual kinetic energy $KE_i$ for every active body.
- **Orbital Pairs**: Pairwise distances, gravitational force magnitudes $|F_{ij}|$, pairwise potential energies $U_{ij}$, and orbital radius from COM.
- **Simulation Controls**: Play / Pause, **Single-Step**, Reset, Speed multiplier (`0.1× – 5.0×`), live FPS, and collapsible left/right panels to maximize the 3D viewport.

---

## Physics Model

For $N$ bodies with masses $m_i$ and positions $\mathbf{r}_i$, gravitational acceleration is computed pairwise with softening $\varepsilon$:

$$\mathbf{a}_i = G \sum_{j \neq i} \frac{m_j (\mathbf{r}_j - \mathbf{r}_i)}{\left(\|\mathbf{r}_j - \mathbf{r}_i\|^2 + \varepsilon^2\right)^{3/2}}$$

Total mechanical energy, linear momentum, and angular momentum are evaluated synchronously at each integration step:

$$KE = \frac{1}{2}\sum_{i=1}^{N} m_i \|\mathbf{v}_i\|^2, \qquad PE = -\sum_{i < j} \frac{G m_i m_j}{\sqrt{\|\mathbf{r}_j - \mathbf{r}_i\|^2 + \varepsilon^2}}, \qquad E = KE + PE$$

$$\mathbf{P} = \sum_{i=1}^{N} m_i \mathbf{v}_i, \qquad \mathbf{L} = \sum_{i=1}^{N} \mathbf{r}_i \times (m_i \mathbf{v}_i)$$

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide React
- **3D Rendering**: Three.js (`WebGLRenderer`, `OrbitControls`, custom Fresnel GLSL shader)
- **Build & Tooling**: Vite 8, `tsx` (Node test runner)

---

## Project Structure

```text
├── index.html
├── package.json
└── src/
    ├── App.tsx                             # 3-section layout, playback, and view controls
    ├── index.css                           # Tailwind CSS & custom dark theme styles
    ├── main.tsx
    ├── components/
    │   ├── BodyParameterControls.tsx       # Per-body identity, color, size, mass, pos, vel
    │   ├── CollapsibleSection.tsx          # Reusable collapsible panel section
    │   ├── LeftControlPanel.tsx            # Presets, body count (2–10), G, dt, trail length
    │   └── TelemetryDashboard.tsx          # Real-time N-body physics & stability dashboard
    ├── physics/
    │   ├── presets.ts                      # Orbital scenarios & random system generator
    │   ├── stabilityMonitor.ts             # Velocity spike, close encounter & ejection monitor
    │   ├── threeBodyEngine.ts              # Newtonian N-body RK4 integrator & telemetry
    │   └── threeBodyEngine.test.ts         # Unit tests for conservation laws & N-body logic
    └── scene/
        ├── ThreeBodyViewport.tsx           # Three.js 3D scene, trails, vectors & lights
        └── celestialTextures.ts            # Procedural neutral textures & Fresnel shader
```

---

## Getting Started

### Prerequisites
- Node.js 20+ and npm

### Installation
```bash
npm install
```

### Run Development Server
```bash
npm run dev
```
The app starts on `http://localhost:3000`.

### Type Check & Production Build
```bash
npm run lint
npm run build
```

### Run Physics Unit Tests
```bash
npx tsx --test src/physics/threeBodyEngine.test.ts
```

---

## License

Apache-2.0
