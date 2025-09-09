<template>
  <div class="matrix-wrap" @click="$emit('reset')">
    <canvas ref="canvas" class="matrix-canvas" />
    <div class="overlay">
      <div class="title">SYSTEM RECONFIGURE // 2000</div>
      <div class="hint">CLICK ANYWHERE TO RESET</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'

const canvas = ref<HTMLCanvasElement | null>(null)
let ctx: CanvasRenderingContext2D | null = null
let raf = 0
let width = 0, height = 0, dpr = 1

// Matrix columns
let fontSize = 16
let columns = 0
let drops: number[] = []

// Charset (mix of katakana + latin + digits feels right)
const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

function resize() {
  if (!canvas.value) return
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  width = canvas.value.clientWidth
  height = canvas.value.clientHeight
  canvas.value.width = Math.max(1, Math.floor(width * dpr))
  canvas.value.height = Math.max(1, Math.floor(height * dpr))
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  // font size scales up a bit with viewport
  fontSize = Math.max(14, Math.min(28, Math.floor(width / 80)))
  columns = Math.floor(width / fontSize)
  drops = Array.from({ length: columns }, () => Math.floor(Math.random() * -20))
}

function loop() {
  if (!ctx) return
  // translucent black for trails
  ctx.fillStyle = 'rgba(0,0,0,0.08)'
  ctx.fillRect(0, 0, width, height)

  ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`

  for (let i = 0; i < columns; i++) {
    const x = i * fontSize
    const y = drops[i] * fontSize

    // glow behind glyph (cheap)
    ctx.fillStyle = 'rgba(0,255,140,0.12)'
    ctx.fillRect(x, y - fontSize, fontSize, fontSize * 1.2)

    // glyph
    const ch = chars[Math.floor(Math.random() * chars.length)]
    // brighter lead on each stream
    const head = drops[i] % 20 === 0
    ctx.fillStyle = head ? 'rgb(180,255,200)' : 'rgb(0,255,140)'
    ctx.fillText(ch, x, y)

    // move drop
    if (y > height && Math.random() > 0.975) {
      drops[i] = 0
    } else {
      drops[i]++
    }
  }

  raf = requestAnimationFrame(loop)
}

function start() {
  ctx = canvas.value?.getContext('2d') ?? null
  if (!ctx) return
  resize()

  // reduced motion: render single frame
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce) {
    ctx.fillStyle = 'black'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = 'rgb(0,255,140)'
    ctx.font = `${fontSize}px monospace`
    ctx.fillText('M A T R I X  M O D E', 24, 48)
    return
  }

  raf = requestAnimationFrame(loop)
  window.addEventListener('resize', resize)
}

function stop() {
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', resize)
}

onMounted(start)
onBeforeUnmount(stop)
</script>

<style scoped>
.matrix-wrap {
  position: fixed;
  inset: 0;
  z-index: 50;                /* above your UI */
  background: #000;           /* base black */
  cursor: pointer;            /* hint that it resets */
}

.matrix-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;       /* clicks go to wrapper for reset */
}

.title {
  color: #66ffcc;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  text-shadow: 0 0 16px rgba(0,255,140,0.6);
  letter-spacing: 0.08em;
  font-size: clamp(1rem, 2.2vw, 1.4rem);
  opacity: .9;
}

.hint {
  color: #8cffd9;
  margin-top: .75rem;
  font-size: clamp(.8rem, 1.6vw, 1rem);
  opacity: .7;
}
</style>
