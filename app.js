'use strict';

const DEFAULT_CONFIG = {
  workDuration:   25,
  shortBreak:      5,
  longBreak:      15,
  longBreakAfter:  4,
};

let config        = loadConfig();
let mode          = 'work';
let totalSeconds  = minsToSecs(config.workDuration);
let remaining     = totalSeconds;
let running       = false;
let intervalId    = null;
let sessionCount  = 0;
let completedAll  = 0;
let totalFocused  = 0;

const CIRCUMFERENCE = 2 * Math.PI * 98;

const app             = document.getElementById('app');
const timeDisplay     = document.getElementById('timeDisplay');
const modeLabel       = document.getElementById('modeLabel');
const ringProgress    = document.getElementById('ringProgress');
const startBtn        = document.getElementById('startBtn');
const resetBtn        = document.getElementById('resetBtn');
const skipBtn         = document.getElementById('skipBtn');
const sessionsContainer = document.getElementById('sessionsContainer');
const completedEl     = document.getElementById('completedSessions');
const minutesEl       = document.getElementById('totalMinutes');
const taskInput       = document.getElementById('taskInput');
const settingsBtn     = document.getElementById('settingsBtn');
const settingsPanel   = document.getElementById('settingsPanel');
const saveSettingsBtn = document.getElementById('saveSettings');
const tabs            = document.querySelectorAll('.tab');

function init() {
  applyConfig();
  renderDots();
  updateDisplay();
  updateModeUI();
  loadTodayStats();
}

function startTimer() {
  if (running) return;
  running = true;
  startBtn.textContent = 'Pause';
  startBtn.classList.add('running');
  intervalId = setInterval(tick, 1000);
}

function pauseTimer() {
  running = false;
  startBtn.textContent = 'Start';
  startBtn.classList.remove('running');
  clearInterval(intervalId);
  intervalId = null;
}

function tick() {
  remaining--;
  if (remaining < 0) {
    remaining = 0;
    onTimerEnd();
    return;
  }
  updateDisplay();
}

function resetTimer() {
  pauseTimer();
  remaining = totalSeconds;
  updateDisplay();
}

function skipSession() {
  pauseTimer();
  advanceMode();
}

function onTimerEnd() {
  pauseTimer();
  playChime();
  notifyUser();

  if (mode === 'work') {
    sessionCount++;
    completedAll++;
    totalFocused += config.workDuration;
    saveTodayStats();
    updateStats();
    renderDots();

    if (sessionCount >= config.longBreakAfter) {
      sessionCount = 0;
      switchMode('long');
    } else {
      switchMode('short');
    }
  } else {
    switchMode('work');
  }
}

function advanceMode() {
  if (mode === 'work') {
    if (sessionCount >= config.longBreakAfter - 1) {
      switchMode('long');
    } else {
      switchMode('short');
    }
  } else {
    switchMode('work');
  }
}

const MODE_LABELS = {
  work:  'Focus Time',
  short: 'Short Break',
  long:  'Long Break',
};

function switchMode(newMode) {
  mode = newMode;
  totalSeconds = minsToSecs(modeDuration());
  remaining    = totalSeconds;
  updateModeUI();
  updateDisplay();
  renderDots();
  syncTabs();
}

function modeDuration() {
  if (mode === 'work')  return config.workDuration;
  if (mode === 'short') return config.shortBreak;
  return config.longBreak;
}

function updateModeUI() {
  app.className = `app mode-${mode}`;
  modeLabel.textContent = MODE_LABELS[mode];
  document.title = `${formatTime(remaining)} – Pomodoro`;
}

function syncTabs() {
  tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.mode === mode);
  });
}

function updateDisplay() {
  timeDisplay.textContent = formatTime(remaining);
  document.title = `${formatTime(remaining)} – ${MODE_LABELS[mode]}`;
  updateRing();
}

function updateRing() {
  const fraction = totalSeconds > 0 ? remaining / totalSeconds : 0;
  const offset   = CIRCUMFERENCE * (1 - fraction);
  ringProgress.style.strokeDashoffset = offset;
  ringProgress.style.strokeDasharray  = CIRCUMFERENCE;
}

function renderDots() {
  const total = config.longBreakAfter;
  sessionsContainer.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const dot = document.createElement('div');
    dot.className = 'dot';
    if (i < sessionCount) dot.classList.add('done');
    else if (i === sessionCount && mode === 'work') dot.classList.add('current');
    sessionsContainer.appendChild(dot);
  }
}

function updateStats() {
  completedEl.textContent = completedAll;
  minutesEl.textContent   = totalFocused;
}

function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.22;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.6);
      osc.start(start);
      osc.stop(start + 0.65);
    });
  } catch (_) {}
}

function notifyUser() {
  if (!('Notification' in window)) return;
  const label = MODE_LABELS[mode];
  const msg   = mode === 'work'
    ? 'Time for a break! Great work.'
    : 'Break over – back to focus!';

  if (Notification.permission === 'granted') {
    new Notification(`🍅 ${label} complete`, { body: msg });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') new Notification(`🍅 ${label} complete`, { body: msg });
    });
  }
}

function applyConfig() {
  document.getElementById('workDuration').value   = config.workDuration;
  document.getElementById('shortBreak').value     = config.shortBreak;
  document.getElementById('longBreak').value      = config.longBreak;
  document.getElementById('longBreakAfter').value = config.longBreakAfter;
}

function saveSettings() {
  const parse = (id, min, max, fallback) => {
    const v = parseInt(document.getElementById(id).value, 10);
    return isNaN(v) ? fallback : Math.min(max, Math.max(min, v));
  };

  config = {
    workDuration:   parse('workDuration',   1, 60, DEFAULT_CONFIG.workDuration),
    shortBreak:     parse('shortBreak',     1, 30, DEFAULT_CONFIG.shortBreak),
    longBreak:      parse('longBreak',      5, 60, DEFAULT_CONFIG.longBreak),
    longBreakAfter: parse('longBreakAfter', 1, 10, DEFAULT_CONFIG.longBreakAfter),
  };

  localStorage.setItem('pomodoroConfig', JSON.stringify(config));
  applyConfig();
  pauseTimer();
  totalSeconds = minsToSecs(modeDuration());
  remaining    = totalSeconds;
  updateDisplay();
  renderDots();
  settingsPanel.classList.add('hidden');
}

function loadConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem('pomodoroConfig'));
    return saved ? { ...DEFAULT_CONFIG, ...saved } : { ...DEFAULT_CONFIG };
  } catch (_) {
    return { ...DEFAULT_CONFIG };
  }
}

function saveTodayStats() {
  const today = new Date().toDateString();
  localStorage.setItem('pomodoroStats', JSON.stringify({
    date: today, completedAll, totalFocused,
  }));
}

function loadTodayStats() {
  try {
    const data = JSON.parse(localStorage.getItem('pomodoroStats'));
    if (data && data.date === new Date().toDateString()) {
      completedAll = data.completedAll || 0;
      totalFocused = data.totalFocused || 0;
    }
  } catch (_) {}
  updateStats();
}

function minsToSecs(m) { return m * 60; }

function formatTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

startBtn.addEventListener('click', () => running ? pauseTimer() : startTimer());
resetBtn.addEventListener('click', resetTimer);
skipBtn.addEventListener('click', skipSession);

settingsBtn.addEventListener('click', () => {
  settingsPanel.classList.toggle('hidden');
});
saveSettingsBtn.addEventListener('click', saveSettings);

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    if (running) pauseTimer();
    mode = tab.dataset.mode;
    totalSeconds = minsToSecs(modeDuration());
    remaining    = totalSeconds;
    sessionCount = 0;
    updateModeUI();
    updateDisplay();
    renderDots();
    syncTabs();
  });
});

document.addEventListener('keydown', e => {
  if (e.target === taskInput) return;
  if (e.code === 'Space') { e.preventDefault(); running ? pauseTimer() : startTimer(); }
  if (e.code === 'KeyR') resetTimer();
  if (e.code === 'KeyS') skipSession();
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) updateDisplay();
});

init();
