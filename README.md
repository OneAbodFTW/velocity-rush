# Velocity Rush

A 3D arcade racing game for the browser, inspired by Mario Kart. Built with
Three.js and vanilla JavaScript — no build step, no external assets, runs fully
offline.

**Play online:** [https://oneabodftw.github.io/velocity-rush/](https://oneabodftw.github.io/velocity-rush/)

## Run it

```bash
cd velocity-rush
python3 -m http.server 8123
# open http://localhost:8123
```

Any static file server works (e.g. `npx serve`, `python3 -m http.server`).
The game must be served over HTTP (module scripts don't load from `file://`).

## Controls

| Key | Action |
|-----|--------|
| `W` / `↑` | Accelerate |
| `S` / `↓` | Brake / Reverse |
| `A` `D` / `←` `→` | Steer |
| `Space` | Drift (hold in corners for a slide + boost charge) |
| `Enter` | Use item |
| `R` | Restart race |

## Features

- **Track**: a closed circuit with elevation changes, a hairpin, an uphill
  climb, a downhill sweeper, a chicane, and a high-speed final corner.
  Barriers line both edges; scenery (trees, rocks) and landmarks (a windmill,
  a lighthouse, a start/finish arch) make it a designed course.
- **Vehicle physics**: acceleration, braking, reverse, speed-scaled steering,
  drifting with a slide, traction, off-road slowdown, and car-to-car collisions.
- **5 AI opponents** that follow the track, brake for corners, overtake each
  other and the player, and rubber-band to keep the pack close.
- **Race**: 3 laps, checkpoints, countdown, starting grid, live position,
  lap timing, finish detection, and a results screen.
- **Power-ups**: boost (mushroom), shell (projectile), shield, and banana
  (spin-out obstacle). Item boxes respawn around the track.
- **Polish**: particle tire smoke, sparks, boost flames, camera shake,
  synthesized engine + ambient audio, shadows, lighting, and a smooth
  third-person chase camera.
- **HUD**: minimap, speedometer, position, lap indicator, item box, and boost
  meter.

## Architecture

| File | Responsibility |
|------|----------------|
| `js/main.js` | Scene, game loop, state machine, race logic, collisions, input |
| `js/track.js` | Catmull-Rom circuit, road ribbon, barriers, checkpoints, scenery, landmarks |
| `js/car.js` | Arcade vehicle physics + low-poly car mesh |
| `js/ai.js` | AI path-following, overtaking, rubber-banding |
| `js/powerups.js` | Item boxes, projectiles, effects |
| `js/effects.js` | Pooled particle systems (smoke, sparks, flames) |
| `js/audio.js` | Web Audio engine hum, ambient, SFX |
| `js/camera.js` | Chase camera with shake |
| `js/hud.js` | DOM overlays + canvas minimap/speedometer |
| `js/three.module.js` | Vendored Three.js (offline) |

## Credits & Setup

Built by **Claude** (Anthropic's AI coding assistant) for Abod, in a single
session. All design, architecture, and implementation decisions were made
autonomously; the game was developed and tested headlessly (Puppeteer +
headless Chrome with SwiftShader) before being pushed.

### Tech stack

- **Rendering**: [Three.js](https://threejs.org/) r160 (vendored in
  `js/three.module.js` so the game runs fully offline with no CDN).
- **Language**: modern ES modules, vanilla JavaScript — no framework, no
  build step, no bundler.
- **Audio**: Web Audio API (synthesized engine hum, ambient noise, and SFX —
  no audio files).
- **HUD**: DOM overlays + 2D canvas (minimap, speedometer).
- **Testing**: Puppeteer driving headless Chrome (SwiftShader WebGL) to run
  full races and verify laps, overtaking, finish detection, and results.

### Development environment

- Linux x64, Node v24, Python 3, Google Chrome (headless).
- The only external dependency fetched during development was the Three.js
  module build; everything else is hand-written.