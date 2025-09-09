<template>
  <div class="nye-wrap" aria-hidden="true">
    <canvas ref="canvas" class="nye-canvas"></canvas>
    <!-- soft vignette to keep foreground readable -->
    <div class="nye-scrim"></div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'

/**
 * Config (tweak if you like, or turn into props)
 */
const CONFETTI_BURST_EVERY_MS = 1600      // avg burst cadence
const CONFETTI_PER_BURST = 60             // pieces per burst
const AMBIENT_FALL_RATE = 40              // small sparkles per second
const MAX_PARTICLES = 800                 // safety cap
const MOTION_BLUR_ALPHA = 0.08            // lower = longer trails
const CITY_GLOW_HUES = [200, 320, 45]     // neon blues, magenta, amber
const CITY_GLOW_INTENSITY = 0.45          // background light strength (0–1)
const BEAM_COUNT = 3                      // sweeping light cones
const DPR_MAX = 2                         // clamp devicePixelRatio

const canvas = ref<HTMLCanvasElement | null>(null)
let ctx: CanvasRenderingContext2D | null = null
let width = 0, height = 0, dpr = 1
let raf = 0
let running = true
let lastTs = 0
let burstTimer = 0
let ambientAccumulator = 0

const particles: Particle[] = []
type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  life: number    // 0..1 (1 = fresh, 0 = dead)
  decay: number   // life decrease per second
  size: number
  rot: number
  spin: number
  color: string
  shape: 'rect' | 'dot'
  glow: number    // 0..1 glow amount
}

function resize() {
  if (!canvas.value) return
  dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX)
  width = canvas.value.clientWidth
  height = canvas.value.clientHeight
  canvas.value.width = Math.max(1, Math.floor(width * dpr))
  canvas.value.height = Math.max(1, Math.floor(height * dpr))
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function randomChoice<T>(arr: T[]) { return arr[Math.floor(Math.random() * arr.length)] }

function neon(h: number, s = 100, l = 60, a = 1) {
  return `hsla(${h},${s}%,${l}%,${a})`
}

function spawnBurst() {
  if (!ctx) return
  const cx = width * (0.2 + Math.random() * 0.6)   // middle band
  const cy = height * (0.25 + Math.random() * 0.25)
  const hueBase = randomChoice(CITY_GLOW_HUES)

  for (let i = 0; i < CONFETTI_PER_BURST; i++) {
    if (particles.length >= MAX_PARTICLES) break
    const angle = Math.random() * Math.PI * 2
    const speed = 50 + Math.random() * 230
    const size = 2 + Math.random() * 4
    const rot = Math.random() * Math.PI
    const spin = (Math.random() - 0.5) * 6
    const color = neon((hueBase + (Math.random()*40-20) + 360) % 360, 100, 60, 0.95)
    const glow = Math.random() * 0.9

    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 60, // bias upward
      life: 1,
      decay: 0.6 + Math.random() * 0.9,
      size, rot, spin, color,
      shape: Math.random() < 0.7 ? 'rect' : 'dot',
      glow
    })
  }
}

function spawnAmbient(dt: number) {
  // gentle drizzle of sparkles falling from top
  ambientAccumulator += AMBIENT_FALL_RATE * dt
  while (ambientAccumulator >= 1) {
    ambientAccumulator -= 1
    if (particles.length >= MAX_PARTICLES) return
    const x = Math.random() * width
    const hue = randomChoice(CITY_GLOW_HUES)
    particles.push({
      x, y: -10,
      vx: (Math.random() - 0.5) * 20,
      vy: 60 + Math.random() * 80,
      life: 1,
      decay: 0.9 + Math.random() * 0.8,
      size: 1 + Math.random() * 2,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 2,
      color: neon(hue, 90, 65, 0.9),
      shape: Math.random() < 0.5 ? 'dot' : 'rect',
      glow: 0.4 + Math.random() * 0.4
    })
  }
}

function drawCityGlow(t: number) {
  if (!ctx) return
  // base night gradient
  const g = ctx.createLinearGradient(0, 0, 0, height)
  g.addColorStop(0, 'rgb(5, 8, 14)')
  g.addColorStop(1, 'rgb(10, 12, 18)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, width, height)

  // distant neon haze blobs
  const blobs = 5
  for (let i = 0; i < blobs; i++) {
    const x = (i / blobs) * width + (Math.sin(t * 0.0003 + i) * 40)
    const y = height * (0.35 + 0.2 * Math.sin(t * 0.0004 + i * 1.7))
    const r = 140 + Math.sin(t * 0.0005 + i) * 40
    const hue = CITY_GLOW_HUES[i % CITY_GLOW_HUES.length]
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, neon(hue, 100, 55, 0.35 * CITY_GLOW_INTENSITY))
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = grad
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
}

function drawBeams(t: number) {
  if (!ctx) return
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < BEAM_COUNT; i++) {
    const base = (i + 1) / (BEAM_COUNT + 1)
    const x = width * (0.1 + 0.8 * ((Math.sin(t * 0.00025 + i) + 1) / 2))
    const y = height * 0.15
    const spread = 160 + 100 * Math.sin(t * 0.00035 + i * 1.3)
    const hue = CITY_GLOW_HUES[i % CITY_GLOW_HUES.length]
    const alpha = 0.08

    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x - spread, height)
    ctx.lineTo(x + spread, height)
    ctx.closePath()
    ctx.fillStyle = neon(hue, 100, 65, alpha)
    ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'
}

function stepParticles(dt: number) {
  if (!ctx) return
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.vy += 200 * dt      // gravity
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.rot += p.spin * dt
    p.life -= p.decay * dt

    if (p.life <= 0 || p.y > height + 50 || p.x < -50 || p.x > width + 50) {
      particles.splice(i, 1)
    }
  }
}

function drawParticles() {
  if (!ctx) return
  ctx.globalCompositeOperation = 'lighter';
  for (const p of particles) {
    const a = Math.max(0, Math.min(1, p.life))
    if (p.glow > 0) {
      ctx.shadowColor = p.color
      ctx.shadowBlur = 8 * p.glow
    } else {
      ctx.shadowBlur = 0
    }
    ctx.fillStyle = p.color.replace(/[\d.]+\)$/, `${a})`) // keep hsla alpha in place if present

    if (p.shape === 'rect') {
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2)
      ctx.restore()
    } else {
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.shadowBlur = 0
  ctx.globalCompositeOperation = 'source-over';
}

function loop(ts: number) {
  if (!ctx || !running) return
  const dt = Math.min(0.05, (ts - (lastTs || ts)) / 1000)
  lastTs = ts

  // motion blur: translucent clear
  ctx.fillStyle = `rgba(0,0,0,${MOTION_BLUR_ALPHA})`
  ctx.fillRect(0, 0, width, height)

  drawCityGlow(ts)
  drawBeams(ts)

  burstTimer -= (ts ? (ts - (lastTs - dt*1000)) : 0)
  // stochastic bursts
  if (burstTimer <= 0) {
    spawnBurst()
    burstTimer = CONFETTI_BURST_EVERY_MS * (0.6 + Math.random() * 0.9)
  }

  spawnAmbient(dt)
  stepParticles(dt)
  drawParticles()

  raf = requestAnimationFrame(loop)
}

function drawStaticFrame(t: number) {
  if (!ctx) return
  ctx.clearRect(0, 0, width, height)
  drawCityGlow(t)
  drawBeams(t)
  // a light sprinkle so it’s not dead still
  for (let i = 0; i < 120; i++) particles.push({
    x: Math.random()*width, y: Math.random()*height*0.7,
    vx: 0, vy: 0, life: 0.2+Math.random()*0.8, decay: 0,
    size: 1+Math.random()*2, rot: 0, spin: 0,
    color: neon(randomChoice(CITY_GLOW_HUES), 90, 65, 0.6),
    shape: Math.random()<0.5?'dot':'rect', glow: Math.random()*0.5
  })
  drawParticles()
}

function start() {
  if (!canvas.value) return
  ctx = canvas.value.getContext('2d')
  if (!ctx) return
  resize()

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce) {
    running = false
    drawStaticFrame(performance.now())
    return
  }

  running = true
  lastTs = 0
  burstTimer = 400 // first burst soon
  raf = requestAnimationFrame(loop)

  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('resize', resize)
}

function stop() {
  running = false
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', resize)
  document.removeEventListener('visibilitychange', onVis)
}

function onVis() {
  if (document.hidden) {
    stop()
  } else {
    start()
  }
}

onMounted(start)
onBeforeUnmount(stop)
</script>

<style scoped>
.nye-wrap {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none; /* never blocks your UI */
}
.nye-canvas {
  width: 100%;
  height: 100%;
  display: block;
  background: #0a0d14; /* safety fallback */
}
.nye-scrim {
  position: absolute;
  inset: 0;
  background:
      radial-gradient(circle at 20% 30%, #ff00ff44, transparent 70%),
      radial-gradient(circle at 80% 70%, #00ffff44, transparent 70%),
      linear-gradient(135deg, rgba(10,0,20,.55), rgba(25,0,51,.55) 70%);
  mix-blend-mode: screen;
  opacity: .7;                 /* tune 0.4–0.8 */
  pointer-events: none;        /* belt-and-suspenders */
}

</style>
