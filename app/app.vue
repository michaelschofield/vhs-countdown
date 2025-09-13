<template>
  <div class="min-h-screen relative">

    <NeonBackgroundCanvas />

    <div class="relative z-10">
      <div class="scanlines" />

      <div
          class="intro-wrap"
          :class="{ 'error-2000': isError }"
          v-on:click="isError ? reset() : undefined">
        <div class="noise" />
        <div class="noise noise-moving" />

        <template v-if="!isError">
          <div class="play"
               v-on:click.stop="toggle">
            {{ playLabel }}
          </div>

          <div class="time">
            {{ elapsedDisplay }}
          </div>
          <div class="label">
            Y2K Countdown
          </div>
          <div class="recordSpeed">
            {{ countdownDisplay }}
          </div>
        </template>
      </div>
    </div>

    <MatrixRain v-if="isError" v-on:reset="reset" />
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import MatrixRain from '../components/MatrixRain.vue';
import NeonBackgroundCanvas from '../components/NeonBackgroundCanvas.vue';

/**
 * Local state.
 */
const route = useRoute();

/**
 * The initial countdown time in minutes
 */
const startMinutes = computed(() => {
  const q = route.query.minutes
  // handle string | string[] | undefined
  const raw = Array.isArray(q) ? q[0] : q
  const num = Number(raw)
  // if NaN or not finite, fall back; if 0 or <1, bump; if huge, clamp
  const safe = Number.isFinite(num) ? Math.trunc(num) : 480
  return Math.min(999, Math.max(1, safe || 480))
});

/**
 * The initial countdown time in milliseconds.
 */
const startMilliseconds = computed(() => startMinutes.value * 60_000)

/**
 * Returns a formatted countdown string like "Y2K 0:00:00".
 */
const countdownDisplay = computed(() => {
  // Before first render, show "Y2K 0:00:00" like original
  return formatCountdown(msRemaining.value);
});

/**
 * Returns a formatted elapsed time string like "MM:SS".
 */
const elapsedDisplay = computed(() => {
  // Before starting, the original shows "--:--"
  if (!isRunning.value && elapsedMs.value === 0 && elapsedOffset.value === 0) return "--:--";
  return formatElapsed(elapsedMs.value);
});

/**
 * The total elapsed time in ms, excluding pauses.
 */
const elapsedMs = ref<number>(0);

/**
 * The total elapsed time in ms, including pauses.
 */
const elapsedOffset = ref<number>(0);

/**
 * The timestamp when the timer was started or resumed, or null if not running.
 * This is used to compute the elapsed time during running.
 */
const elapsedStartTs = ref<number | null>(null);

/**
 * The timestamp when the countdown will reach zero, or null if not running.
 * This is used to compute the remaining time during running.
 */
const endTs = ref<number | null>(null);

/**
 * Whether the timer is in an error state (countdown reached zero).
 */
const isError = ref<boolean>(false);

/**
 * Whether the timer is currently running.
 */
const isRunning = ref<boolean>(false);

/**
 * The remaining time in ms for the countdown.
 */
const msRemaining = ref<number>(startMilliseconds.value)

/**
 * The label for the play/pause button, depending on state.
 */
const playLabel = computed(() => (isRunning.value ? "PAUSE" : isError.value ? "STOP" : "PLAY"));

/**
 * The main tick loop, called every second when running.
 */
let timeoutId: number | null = null;

/**
 * $Methods
 */

/**
 * Clears the next scheduled tick, if any.
 */
const clearNext = () => {
  if (timeoutId != null) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
};

/**
 * The main tick loop, called every second when running.
 */
const computeTick = () => {
  const now = Date.now();
  if (endTs.value) msRemaining.value = Math.max(0, endTs.value - now);
  if (elapsedStartTs.value) elapsedMs.value = elapsedOffset.value + (now - elapsedStartTs.value);
};

/**
 * Formats a countdown time in ms to a string like "Y2K 0:00:00".
 */
const formatCountdown = (ms: number) => {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${padNumbersToTwoDigits(m)}:${padNumbersToTwoDigits(s)}`;
};

/**
 * Formats an elapsed time in ms to a string like "MM:SS".
 */
const formatElapsed = (ms: number) => {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${padNumbersToTwoDigits(m)}:${padNumbersToTwoDigits(s)}`;
};

/**
 * Pads a number to two digits with leading zero if necessary.
 */
const padNumbersToTwoDigits = (n: number) => String(n).padStart(2, "0");

/**
 * Handles the pause action, which stops the timer and freezes the elapsed time.
 */
const pauseTimer = () => {
  if (!isRunning.value) return;
  clearNext();
  const now = Date.now();
  isRunning.value = false;
  if (endTs.value) msRemaining.value = Math.max(0, endTs.value - now);
  if (elapsedStartTs.value) elapsedOffset.value += now - elapsedStartTs.value;
  // freeze elapsed
  elapsedMs.value = elapsedOffset.value;
};

/**
 * Handles the reset action, which stops the timer and resets all state.
 */
const reset = () => {
  clearNext();
  isRunning.value = false;
  isError.value = false;

  msRemaining.value = startMilliseconds.value;
  endTs.value = null;

  elapsedOffset.value = 0;
  elapsedStartTs.value = null;
  elapsedMs.value = 0;
};

/**
 * Schedules the next tick aligned to the next whole second.
 */
const scheduleNextTick = () => {
  clearNext();
  const remainder = 1000 - (Date.now() % 1000) || 1000;
  timeoutId = window.setTimeout(tickLoop, remainder);
};

/**
 * Handles the start action, which starts or resumes the timer.
 */
const startTimer = () => {
  if (isError.value) return; // don't start when error screen is up
  const now = Date.now();
  isRunning.value = true;
  endTs.value = now + msRemaining.value;
  elapsedStartTs.value = now;
  tickLoop(); // kick immediately; scheduler will align to next whole second
};

const tickLoop = () => {
  if (!isRunning.value) return;
  computeTick();

  if (msRemaining.value <= 0) {
    // stop & show error screen
    isRunning.value = false;
    isError.value = true;
    clearNext();
    return;
  }

  scheduleNextTick();
};

const toggle = () => {
  if (isError.value) return;
  isRunning.value ? pauseTimer() : startTimer();
};

/**
 * Lifecycle hooks
 */
onMounted(() => {
  // initial render state mirrors the original: PLAY, --:--, Y2K 0:00:00
  reset();
});

onBeforeUnmount(() => {
  clearNext();
});
</script>

<style>
@import url("https://fonts.googleapis.com/css?family=Press+Start+2P");

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

*::-moz-selection {
  background: #fd5d8d;
  color: #f1034a;
  color: #270245;
}

*::selection {
  background: #fd5d8d;
  color: #f1034a;
  color: #270245;
}

html, body {
  width: 100%;
  height: 100%;
}

body {
  position: relative;
  background: #000;
  overflow: hidden;
}

body:before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.4) 100%);
  z-index: 500;
  mix-blend-mode: overlay;
  pointer-events: none;
}

.noise {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  z-index: 400;
  opacity: 0.8;
  pointer-events: none;
}
.noise:before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: url("https://ice-creme.de/images/background-noise.png");
  pointer-events: none;
}
.noise-moving {
  opacity: 1;
  z-index: 450;
}
.noise-moving:before {
  will-change: background-position;
  -webkit-animation: noise 1s infinite alternate;
  animation: noise 1s infinite alternate;
}

.scanlines {
  position: fixed;
  left: 0;
  top: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 300;
  opacity: 0.6;
  will-change: opacity;
  -webkit-animation: opacity 3s linear infinite;
  animation: opacity 3s linear infinite;
}
.scanlines:before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  background: linear-gradient(to bottom, transparent 50%, rgba(0, 0, 0, 0.5) 51%);
  background-size: 100% 4px;
  will-change: background, background-size;
  -webkit-animation: scanlines 0.2s linear infinite;
  animation: scanlines 0.2s linear infinite;
}

.intro-wrap {
  position: fixed;
  top: 0;
  left: 0;
  font-family: "Press Start 2P", cursive;
  color: #fff;
  font-size: 2rem;
  width: 100vw;
  height: 100vh;
  background: transparent;
}
.intro-wrap .noise:before {
  background-size: 200%;
}
.intro-wrap .play {
  cursor: pointer;
  position: absolute;
  left: 2rem;
  top: 2rem;
  will-change: text-shadow;
  -webkit-animation: rgbText 2s steps(9) 0s infinite alternate;
  animation: rgbText 2s steps(9) 0s infinite alternate;
}
.intro-wrap .play .char {
  will-change: opacity;
  -webkit-animation: type 1.2s infinite alternate;
  animation: type 1.2s infinite alternate;
  -webkit-animation-delay: calc(60ms * var(--char-index));
  animation-delay: calc(60ms * var(--char-index));
}
.intro-wrap .time {
  position: absolute;
  right: 2rem;
  top: 2rem;
  will-change: text-shadow;
  -webkit-animation: rgbText 1s steps(9) 0s infinite alternate;
  animation: rgbText 1s steps(9) 0s infinite alternate;
}
.intro-wrap .recordSpeed {
  position: absolute;
  left: 2rem;
  right: 2rem;
  text-align: center;
  width: 100%;
  bottom: 50%;
  will-change: text-shadow;
  -webkit-animation: rgbText 1s steps(9) 0s infinite alternate;
  animation: rgbText 1s steps(9) 0s infinite alternate;
}
.intro-wrap .label {
  position: absolute;
  left: 2rem;
  right: 2rem;
  text-align: center;
  width: 100%;
  bottom: 55%;
  will-change: text-shadow;
  -webkit-animation: rgbText 1s steps(9) 0s infinite alternate;
  animation: rgbText 1s steps(9) 0s infinite alternate;
}

/* Animations */
@-webkit-keyframes noise {
  0%, 100% {
    background-position: 0 0;
  }
  10% {
    background-position: -5% -10%;
  }
  20% {
    background-position: -15% 5%;
  }
  30% {
    background-position: 7% -25%;
  }
  40% {
    background-position: 20% 25%;
  }
  50% {
    background-position: -25% 10%;
  }
  60% {
    background-position: 15% 5%;
  }
  70% {
    background-position: 0 15%;
  }
  80% {
    background-position: 25% 35%;
  }
  90% {
    background-position: -10% 10%;
  }
}
@keyframes noise {
  0%, 100% {
    background-position: 0 0;
  }
  10% {
    background-position: -5% -10%;
  }
  20% {
    background-position: -15% 5%;
  }
  30% {
    background-position: 7% -25%;
  }
  40% {
    background-position: 20% 25%;
  }
  50% {
    background-position: -25% 10%;
  }
  60% {
    background-position: 15% 5%;
  }
  70% {
    background-position: 0 15%;
  }
  80% {
    background-position: 25% 35%;
  }
  90% {
    background-position: -10% 10%;
  }
}
@-webkit-keyframes opacity {
  0% {
    opacity: 0.6;
  }
  20% {
    opacity: 0.3;
  }
  35% {
    opacity: 0.5;
  }
  50% {
    opacity: 0.8;
  }
  60% {
    opacity: 0.4;
  }
  80% {
    opacity: 0.7;
  }
  100% {
    opacity: 0.6;
  }
}
@keyframes opacity {
  0% {
    opacity: 0.6;
  }
  20% {
    opacity: 0.3;
  }
  35% {
    opacity: 0.5;
  }
  50% {
    opacity: 0.8;
  }
  60% {
    opacity: 0.4;
  }
  80% {
    opacity: 0.7;
  }
  100% {
    opacity: 0.6;
  }
}
@-webkit-keyframes scanlines {
  from {
    background: linear-gradient(to bottom, transparent 50%, rgba(0, 0, 0, 0.5) 51%);
    background-size: 100% 4px;
  }
  to {
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0.5) 50%, transparent 51%);
    background-size: 100% 4px;
  }
}
@keyframes scanlines {
  from {
    background: linear-gradient(to bottom, transparent 50%, rgba(0, 0, 0, 0.5) 51%);
    background-size: 100% 4px;
  }
  to {
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0.5) 50%, transparent 51%);
    background-size: 100% 4px;
  }
}
@-webkit-keyframes rgbText {
  0% {
    text-shadow: -1px 1px 8px rgba(255, 255, 255, 0.6), 1px -1px 8px rgba(255, 255, 235, 0.7), 0px 0 1px rgba(251, 0, 231, 0.8), 0 0px 3px rgba(0, 233, 235, 0.8), 0px 0 3px rgba(0, 242, 14, 0.8), 0 0px 3px rgba(244, 45, 0, 0.8), 0px 0 3px rgba(59, 0, 226, 0.8);
  }
  25% {
    text-shadow: -1px 1px 8px rgba(255, 255, 255, 0.6), 1px -1px 8px rgba(255, 255, 235, 0.7), 0px 0 1px rgba(251, 0, 231, 0.8), 0 0px 3px rgba(0, 233, 235, 0.8), 0px 0 3px rgba(0, 242, 14, 0.8), 0 0px 3px rgba(244, 45, 0, 0.8), 0px 0 3px rgba(59, 0, 226, 0.8);
  }
  45% {
    text-shadow: -1px 1px 8px rgba(255, 255, 255, 0.6), 1px -1px 8px rgba(255, 255, 235, 0.7), 5px 0 1px rgba(251, 0, 231, 0.8), 0 5px 1px rgba(0, 233, 235, 0.8), -5px 0 1px rgba(0, 242, 14, 0.8), 0 -5px 1px rgba(244, 45, 0, 0.8), 5px 0 1px rgba(59, 0, 226, 0.8);
  }
  50% {
    text-shadow: -1px 1px 8px rgba(255, 255, 255, 0.6), 1px -1px 8px rgba(255, 255, 235, 0.7), -5px 0 1px rgba(251, 0, 231, 0.8), 0 -5px 1px rgba(0, 233, 235, 0.8), 5px 0 1px rgba(0, 242, 14, 0.8), 0 5px 1px rgba(244, 45, 0, 0.8), -5px 0 1px rgba(59, 0, 226, 0.8);
  }
  55% {
    text-shadow: -1px 1px 8px rgba(255, 255, 255, 0.6), 1px -1px 8px rgba(255, 255, 235, 0.7), 0px 0 3px rgba(251, 0, 231, 0.8), 0 0px 3px rgba(0, 233, 235, 0.8), 0px 0 3px rgba(0, 242, 14, 0.8), 0 0px 3px rgba(244, 45, 0, 0.8), 0px 0 3px rgba(59, 0, 226, 0.8);
  }
  90% {
    text-shadow: -1px 1px 8px rgba(255, 255, 255, 0.6), 1px -1px 8px rgba(255, 255, 235, 0.7), -5px 0 1px rgba(251, 0, 231, 0.8), 0 5px 1px rgba(0, 233, 235, 0.8), 5px 0 1px rgba(0, 242, 14, 0.8), 0 -5px 1px rgba(244, 45, 0, 0.8), 5px 0 1px rgba(59, 0, 226, 0.8);
  }
  100% {
    text-shadow: -1px 1px 8px rgba(255, 255, 255, 0.6), 1px -1px 8px rgba(255, 255, 235, 0.7), 5px 0 1px rgba(251, 0, 231, 0.8), 0 -5px 1px rgba(0, 233, 235, 0.8), -5px 0 1px rgba(0, 242, 14, 0.8), 0 5px 1px rgba(244, 45, 0, 0.8), -5px 0 1px rgba(59, 0, 226, 0.8);
  }
}
@keyframes rgbText {
  0% {
    text-shadow: -1px 1px 8px rgba(255, 255, 255, 0.6), 1px -1px 8px rgba(255, 255, 235, 0.7), 0px 0 1px rgba(251, 0, 231, 0.8), 0 0px 3px rgba(0, 233, 235, 0.8), 0px 0 3px rgba(0, 242, 14, 0.8), 0 0px 3px rgba(244, 45, 0, 0.8), 0px 0 3px rgba(59, 0, 226, 0.8);
  }
  25% {
    text-shadow: -1px 1px 8px rgba(255, 255, 255, 0.6), 1px -1px 8px rgba(255, 255, 235, 0.7), 0px 0 1px rgba(251, 0, 231, 0.8), 0 0px 3px rgba(0, 233, 235, 0.8), 0px 0 3px rgba(0, 242, 14, 0.8), 0 0px 3px rgba(244, 45, 0, 0.8), 0px 0 3px rgba(59, 0, 226, 0.8);
  }
  45% {
    text-shadow: -1px 1px 8px rgba(255, 255, 255, 0.6), 1px -1px 8px rgba(255, 255, 235, 0.7), 5px 0 1px rgba(251, 0, 231, 0.8), 0 5px 1px rgba(0, 233, 235, 0.8), -5px 0 1px rgba(0, 242, 14, 0.8), 0 -5px 1px rgba(244, 45, 0, 0.8), 5px 0 1px rgba(59, 0, 226, 0.8);
  }
  50% {
    text-shadow: -1px 1px 8px rgba(255, 255, 255, 0.6), 1px -1px 8px rgba(255, 255, 235, 0.7), -5px 0 1px rgba(251, 0, 231, 0.8), 0 -5px 1px rgba(0, 233, 235, 0.8), 5px 0 1px rgba(0, 242, 14, 0.8), 0 5px 1px rgba(244, 45, 0, 0.8), -5px 0 1px rgba(59, 0, 226, 0.8);
  }
  55% {
    text-shadow: -1px 1px 8px rgba(255, 255, 255, 0.6), 1px -1px 8px rgba(255, 255, 235, 0.7), 0px 0 3px rgba(251, 0, 231, 0.8), 0 0px 3px rgba(0, 233, 235, 0.8), 0px 0 3px rgba(0, 242, 14, 0.8), 0 0px 3px rgba(244, 45, 0, 0.8), 0px 0 3px rgba(59, 0, 226, 0.8);
  }
  90% {
    text-shadow: -1px 1px 8px rgba(255, 255, 255, 0.6), 1px -1px 8px rgba(255, 255, 235, 0.7), -5px 0 1px rgba(251, 0, 231, 0.8), 0 5px 1px rgba(0, 233, 235, 0.8), 5px 0 1px rgba(0, 242, 14, 0.8), 0 -5px 1px rgba(244, 45, 0, 0.8), 5px 0 1px rgba(59, 0, 226, 0.8);
  }
  100% {
    text-shadow: -1px 1px 8px rgba(255, 255, 255, 0.6), 1px -1px 8px rgba(255, 255, 235, 0.7), 5px 0 1px rgba(251, 0, 231, 0.8), 0 -5px 1px rgba(0, 233, 235, 0.8), -5px 0 1px rgba(0, 242, 14, 0.8), 0 5px 1px rgba(244, 45, 0, 0.8), -5px 0 1px rgba(59, 0, 226, 0.8);
  }
}
@-webkit-keyframes type {
  0%, 19% {
    opacity: 0;
  }
  20%, 100% {
    opacity: 1;
  }
}
@keyframes type {
  0%, 19% {
    opacity: 0;
  }
  20%, 100% {
    opacity: 1;
  }
}
/* Error state */
.error-2000 {
  background: #556195;
  /* old Windows blue screen */
  color: white;
  text-align: center;
  display: flex;
  justify-content: center;
  flex-direction: column;
}
S
.error-2000 .play,
.error-2000 .recordSpeed,
.error-2000 .time {
  font-size: 1.5em;
  margin: 1em 0;
}
</style>