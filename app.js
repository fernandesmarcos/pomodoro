'use strict';

const DEFAULT_CONFIG = {
  workDuration:   25,
  shortBreak:      5,
  longBreak:      15,
  longBreakAfter:  4,
};

const ACCENT = {
  work:  '#66FF00',
  short: '#FFE600',
  long:  '#F5603A',
};

const MODE_LABELS = {
  work:  'Focus mode',
  short: 'Break',
  long:  'Long break',
};

// ── State ──
let config       = loadConfig();
let mode         = 'work';
let totalSeconds = mins(config.workDuration);
let remaining    = totalSeconds;
let running      = false;
let intervalId   = null;
let sessionCount = 0;
let completedAll = 0;
let totalFocused = 0;

// Ambient sound state
let ambientAudio    = null;
let ambientCtx      = null;
let ambientGain     = null;
let ambientAnalyser = null;
let ambientAnimId   = null;
let ambientFadeId   = null;
let ambientPlaying  = false;

// ── DOM ──
const menuBtn       = document.getElementById('menuBtn');
const settingsPanel = document.getElementById('settingsPanel');
const timeDisplay   = document.getElementById('timeDisplay');
const modeLabel     = document.getElementById('modeLabel');
const playBtn       = document.getElementById('playBtn');
const iconPlay      = document.getElementById('iconPlay');
const iconPause     = document.getElementById('iconPause');
const completedEl   = document.getElementById('completedSessions');
const sessionGoalEl = document.getElementById('sessionGoal');
const minutesEl     = document.getElementById('totalMinutes');
const soundBtn      = document.getElementById('soundBtn');

// ── Init ──
function init() {
  applyConfig();
  loadTodayStats();
  render();
}

// ── Timer ──
function start() {
  if (running) return;
  running = true;
  iconPlay.classList.add('hidden');
  iconPause.classList.remove('hidden');
  playBtn.classList.add('paused');
  intervalId = setInterval(tick, 1000);
}

function pause() {
  running = false;
  iconPlay.classList.remove('hidden');
  iconPause.classList.add('hidden');
  playBtn.classList.remove('paused');
  clearInterval(intervalId);
  intervalId = null;
}

function tick() {
  remaining--;
  if (remaining <= 0) {
    remaining = 0;
    render();
    onEnd();
    return;
  }
  render();
}

function onEnd() {
  pause();
  playChime();
  notify();

  if (mode === 'work') {
    sessionCount++;
    completedAll++;
    totalFocused += config.workDuration;
    saveTodayStats();
    minutesEl.textContent = totalFocused;

    if (sessionCount >= config.longBreakAfter) {
      sessionCount = 0;
      completedEl.textContent = sessionCount;
      switchMode('long');
    } else {
      completedEl.textContent = sessionCount;
      switchMode('short');
    }
  } else {
    switchMode('work');
  }
}

function switchMode(m) {
  mode         = m;
  totalSeconds = mins(modeDuration());
  remaining    = totalSeconds;
  applyAccent();
  render();
}

function modeDuration() {
  if (mode === 'work')  return config.workDuration;
  if (mode === 'short') return config.shortBreak;
  return config.longBreak;
}

// ── Render ──
function render() {
  const s = fmt(remaining);
  const [m, sec] = s.split(':');
  timeDisplay.innerHTML = `${m}<span class="colon${running ? ' pulse' : ''}">:</span>${sec}`;
  document.title = `${s} – Pomodoro`;
}

function applyAccent() {
  document.documentElement.style.setProperty('--accent', ACCENT[mode]);
  modeLabel.textContent = MODE_LABELS[mode];
}

// ── Settings ──
function applyConfig() {
  document.getElementById('workDuration').value   = config.workDuration;
  document.getElementById('shortBreak').value     = config.shortBreak;
  document.getElementById('longBreak').value      = config.longBreak;
  document.getElementById('longBreakAfter').value = config.longBreakAfter;
  sessionGoalEl.textContent = config.longBreakAfter;
  applyAccent();
}

function onSettingChange() {
  const clamp = (id, lo, hi, fb) => {
    const v = parseInt(document.getElementById(id).value, 10);
    return isNaN(v) ? fb : Math.min(hi, Math.max(lo, v));
  };
  config = {
    workDuration:   clamp('workDuration',   1, 60, DEFAULT_CONFIG.workDuration),
    shortBreak:     clamp('shortBreak',     1, 30, DEFAULT_CONFIG.shortBreak),
    longBreak:      clamp('longBreak',      5, 60, DEFAULT_CONFIG.longBreak),
    longBreakAfter: clamp('longBreakAfter', 1, 12, DEFAULT_CONFIG.longBreakAfter),
  };
  localStorage.setItem('pomodoroConfig', JSON.stringify(config));
  sessionGoalEl.textContent = config.longBreakAfter;

  pause();
  totalSeconds = mins(modeDuration());
  remaining    = totalSeconds;
  render();
}

// ── Persistence ──
function loadConfig() {
  try {
    const s = JSON.parse(localStorage.getItem('pomodoroConfig'));
    return s ? { ...DEFAULT_CONFIG, ...s } : { ...DEFAULT_CONFIG };
  } catch (_) { return { ...DEFAULT_CONFIG }; }
}

function saveTodayStats() {
  localStorage.setItem('pomodoroStats', JSON.stringify({
    date: new Date().toDateString(), completedAll, totalFocused,
  }));
}

function loadTodayStats() {
  try {
    const d = JSON.parse(localStorage.getItem('pomodoroStats'));
    if (d && d.date === new Date().toDateString()) {
      completedAll = d.completedAll || 0;
      totalFocused = d.totalFocused || 0;
    }
  } catch (_) {}
  completedEl.textContent = sessionCount;
  minutesEl.textContent   = totalFocused;
}

// ── Ambient Sound ──
function initAmbient() {
  if (ambientCtx) return;
  ambientAudio = new Audio('rain-forest.wav');
  ambientAudio.loop = true;
  ambientCtx      = new (window.AudioContext || window.webkitAudioContext)();
  ambientAnalyser = ambientCtx.createAnalyser();
  ambientAnalyser.fftSize = 256;
  ambientGain = ambientCtx.createGain();
  ambientGain.gain.value = 0;
  const src = ambientCtx.createMediaElementSource(ambientAudio);
  src.connect(ambientAnalyser);
  ambientAnalyser.connect(ambientGain);
  ambientGain.connect(ambientCtx.destination);
}

function startAmbient() {
  if (ambientPlaying) return;
  try {
    initAmbient();
    if (ambientCtx.state === 'suspended') ambientCtx.resume();
    ambientAudio.play().catch(() => {});
    clearInterval(ambientFadeId);
    let vol = 0;
    ambientFadeId = setInterval(() => {
      vol = Math.min(1, vol + 0.05);
      ambientGain.gain.value = vol;
      if (vol >= 1) clearInterval(ambientFadeId);
    }, 75);
    ambientPlaying = true;
    soundBtn.classList.add('playing');
    animateBars();
  } catch (_) {}
}

function stopAmbient() {
  if (!ambientPlaying) return;
  clearInterval(ambientFadeId);
  let vol = ambientGain.gain.value;
  ambientFadeId = setInterval(() => {
    vol = Math.max(0, vol - 0.05);
    ambientGain.gain.value = vol;
    if (vol <= 0) {
      clearInterval(ambientFadeId);
      ambientAudio.pause();
      ambientPlaying = false;
      soundBtn.classList.remove('playing');
      cancelAnimationFrame(ambientAnimId);
      soundBtn.querySelectorAll('.sound-bar').forEach(b => { b.style.height = ''; });
    }
  }, 75);
}

function animateBars() {
  const bars   = soundBtn.querySelectorAll('.sound-bar');
  const data   = new Uint8Array(ambientAnalyser.frequencyBinCount);
  const smooth = [5, 11, 8, 14];
  const bands  = [[0, 15], [16, 39], [40, 79], [80, 127]];

  function frame() {
    if (!ambientPlaying) return;
    ambientAnalyser.getByteFrequencyData(data);
    bands.forEach(([start, end], i) => {
      let sum = 0;
      for (let j = start; j <= end; j++) sum += data[j];
      const avg    = sum / (end - start + 1);
      const target = 2 + (avg / 255) * 12;
      smooth[i]    = smooth[i] * 0.6 + target * 0.4;
      bars[i].style.height = `${smooth[i].toFixed(1)}px`;
    });
    ambientAnimId = requestAnimationFrame(frame);
  }

  ambientAnimId = requestAnimationFrame(frame);
}

// ── Audio (chime) ──
function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.22;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.25, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.start(t);
      osc.stop(t + 0.65);
    });
  } catch (_) {}
}

function notify() {
  if (!('Notification' in window)) return;
  const body = mode === 'work' ? 'Time for a break!' : 'Back to focus!';
  if (Notification.permission === 'granted') {
    new Notification('Pomodoro', { body });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(p => {
      if (p === 'granted') new Notification('Pomodoro', { body });
    });
  }
}

// ── Helpers ──
function mins(m) { return m * 60; }
function fmt(s) {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}

// ── Events ──
playBtn.addEventListener('click', () => running ? pause() : start());

soundBtn.addEventListener('click', () => ambientPlaying ? stopAmbient() : startAmbient());

menuBtn.addEventListener('click', e => {
  e.stopPropagation();
  const opening = settingsPanel.classList.contains('hidden');
  settingsPanel.classList.toggle('hidden', !opening);
  menuBtn.classList.toggle('open', opening);
});

document.addEventListener('click', e => {
  if (!settingsPanel.contains(e.target) && !menuBtn.contains(e.target)) {
    settingsPanel.classList.add('hidden');
    menuBtn.classList.remove('open');
  }
});

['workDuration', 'shortBreak', 'longBreak', 'longBreakAfter'].forEach(id => {
  document.getElementById(id).addEventListener('change', onSettingChange);
  document.getElementById(id).addEventListener('click', e => e.stopPropagation());
});

document.addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); running ? pause() : start(); }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) render();
});

// ── Boot ──
init();
