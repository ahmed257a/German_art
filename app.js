/**
 * app.js - Core State Machine, UI Renderer & Data Retrieval Engine for MyRecallApp
 */

import {
  initStorage,
  isStorageConnected,
  loadProgress,
  saveProgress,
  resetProgress,
  updatePointer,
  recordWordResults,
  appendSessionLog,
  getCachedProgress
} from './storage.js';

// Application State
const state = {
  currentView: 'SETUP', // 'SETUP' | 'PHASE_1' | 'PHASE_2' | 'SUMMARY' | 'HISTORY'
  progressData: null,
  
  // Session Configuration
  config: {
    mode: 'new',         // 'new' | 'revision'
    level: 'A1',         // 'A1' | 'A2' | 'B1' | 'B2' | 'C1'
    pos: 'noun',         // 'noun' | 'verb' | 'adjective' | 'adverb'
    batchSize: 10,       // N
    previewTimeS: 3,     // S seconds per word
    recallTimeM: 10,     // M seconds per word
    autoPlayAudio: true  // Auto-play German TTS pronunciation
  },
  
  // Active Session Data
  session: {
    words: [],           // Batch array of normalized word objects
    currentIndex: 0,     // Current word index in batch
    phase1Timer: null,   // Timer ref for passive learning
    phase2Timer: null,   // Timer ref for active recall
    phase2StartTime: 0,  // performance.now() mark
    results: [],         // Array of result objects for each word
    isPaused: false,
    initialLastIndex: 0  // Starting file pointer for this session
  }
};

// UI Elements Cache
let elements = {};
let germanVoice = null;

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  cacheElements();
  bindEvents();
  initTTSVoices();
  
  // Load initial progress data
  state.progressData = await loadProgress();
  updateStorageStatusUI();
  updatePointerBannerUI();
  renderStatsOverview();
});

function cacheElements() {
  elements = {
    // Views
    viewSetup: document.getElementById('view-setup'),
    viewPhase1: document.getElementById('view-phase1'),
    viewPhase2: document.getElementById('view-phase2'),
    viewSummary: document.getElementById('view-summary'),
    viewHistory: document.getElementById('view-history'),
    
    // Navigation Tabs & Storage
    tabBtnTraining: document.getElementById('tab-btn-training'),
    tabBtnHistory: document.getElementById('tab-btn-history'),
    btnConnectStorage: document.getElementById('btn-connect-storage'),
    btnResetProgress: document.getElementById('btn-reset-progress'),
    storageStatusText: document.getElementById('storage-status-text'),
    pointerBannerText: document.getElementById('pointer-banner-text'),
    
    // Audio Controls
    btnHeaderAudioToggle: document.getElementById('btn-header-audio-toggle'),
    audioToggleIcon: document.getElementById('audio-toggle-icon'),
    audioToggleText: document.getElementById('audio-toggle-text'),
    selectAudioMode: document.getElementById('select-audio-mode'),
    btnP1Speak: document.getElementById('btn-p1-speak'),

    // Setup Controls
    selectMode: document.getElementById('select-mode'),
    selectLevel: document.getElementById('select-level'),
    selectPos: document.getElementById('select-pos'),
    inputBatchSize: document.getElementById('input-batch-size'),
    inputPreviewTime: document.getElementById('input-preview-time'),
    inputRecallTime: document.getElementById('input-recall-time'),
    btnStartSession: document.getElementById('btn-start-session'),
    
    // Stats Summary in Setup
    statTotalSessions: document.getElementById('stat-total-sessions'),
    statTotalLearnt: document.getElementById('stat-total-learnt'),
    statOverallAccuracy: document.getElementById('stat-overall-accuracy'),
    recentSessionsList: document.getElementById('recent-sessions-list'),
    btnViewAllHistory: document.getElementById('btn-view-all-history'),
    
    // History View Table
    historyFullTableBody: document.getElementById('history-full-table-body'),
    btnRefreshHistory: document.getElementById('btn-refresh-history'),

    // Phase 1 (Passive Learning)
    p1CardWord: document.getElementById('p1-card-word'),
    p1CardTranslation: document.getElementById('p1-card-translation'),
    p1CardNativeEx: document.getElementById('p1-card-native-ex'),
    p1CardEnglishEx: document.getElementById('p1-card-english-ex'),
    p1CardLevelPos: document.getElementById('p1-card-level-pos'),
    p1ProgressText: document.getElementById('p1-progress-text'),
    p1ProgressBarInner: document.getElementById('p1-progress-bar-inner'),
    p1TimerCircleSvg: document.getElementById('p1-timer-circle-svg'),
    p1TimerText: document.getElementById('p1-timer-text'),
    btnP1Prev: document.getElementById('btn-p1-prev'),
    btnP1Pause: document.getElementById('btn-p1-pause'),
    btnP1Next: document.getElementById('btn-p1-next'),
    btnP1SkipToRecall: document.getElementById('btn-p1-skip-recall'),
    
    // Phase 2 (Active Recall)
    p2CardEnglishPrompt: document.getElementById('p2-english-prompt'),
    p2Input: document.getElementById('p2-input'),
    btnP2Submit: document.getElementById('btn-p2-submit'),
    p2ProgressText: document.getElementById('p2-progress-text'),
    p2ProgressBarInner: document.getElementById('p2-progress-bar-inner'),
    p2TimerCircleSvg: document.getElementById('p2-timer-circle-svg'),
    p2TimerText: document.getElementById('p2-timer-text'),
    p2FeedbackBanner: document.getElementById('p2-feedback-banner'),
    
    // Summary
    summaryScoreBadge: document.getElementById('summary-score-badge'),
    summaryAccuracyVal: document.getElementById('summary-accuracy-val'),
    summaryAvgSpeedVal: document.getElementById('summary-avg-speed-val'),
    summaryTotalWordsVal: document.getElementById('summary-total-words-val'),
    summaryTableBody: document.getElementById('summary-table-body'),
    btnSummaryRestart: document.getElementById('btn-summary-restart'),
    btnSummarySetup: document.getElementById('btn-summary-setup')
  };
}

function bindEvents() {
  // Navigation Tabs
  elements.tabBtnTraining.addEventListener('click', () => switchView('SETUP'));
  elements.tabBtnHistory.addEventListener('click', () => switchView('HISTORY'));
  elements.btnViewAllHistory.addEventListener('click', () => switchView('HISTORY'));
  elements.btnRefreshHistory.addEventListener('click', renderFullHistoryView);

  // Storage Connection & Reset
  elements.btnConnectStorage.addEventListener('click', handleStorageConnect);
  elements.btnResetProgress.addEventListener('click', handleResetProgress);
  
  // Audio Toggle Handlers
  elements.btnHeaderAudioToggle.addEventListener('click', toggleAudioMode);
  if (elements.selectAudioMode) {
    elements.selectAudioMode.addEventListener('change', (e) => {
      setAudioMode(e.target.value === 'on');
    });
  }
  if (elements.btnP1Speak) {
    elements.btnP1Speak.addEventListener('click', () => {
      const currentWordObj = state.session.words[state.session.currentIndex];
      if (currentWordObj) speakGermanText(currentWordObj.target);
    });
  }

  // Setup inputs change
  elements.selectLevel.addEventListener('change', updatePointerBannerUI);
  elements.selectPos.addEventListener('change', updatePointerBannerUI);
  elements.selectMode.addEventListener('change', updatePointerBannerUI);
  
  elements.btnStartSession.addEventListener('click', handleStartSession);
  
  // Phase 1 Controls
  elements.btnP1Prev.addEventListener('click', () => navigatePhase1(-1));
  elements.btnP1Next.addEventListener('click', () => navigatePhase1(1));
  elements.btnP1Pause.addEventListener('click', togglePhase1Pause);
  elements.btnP1SkipToRecall.addEventListener('click', transitionToPhase2);
  
  // Phase 2 Controls
  elements.btnP2Submit.addEventListener('click', submitPhase2Answer);
  elements.p2Input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') submitPhase2Answer();
  });
  
  // Summary Controls
  elements.btnSummaryRestart.addEventListener('click', handleStartSession);
  elements.btnSummarySetup.addEventListener('click', () => switchView('SETUP'));
}

/* ==========================================
   GERMAN SPEECH SYNTHESIS ENGINE (TTS)
   ========================================== */

function initTTSVoices() {
  if (!('speechSynthesis' in window)) {
    console.warn("Speech Synthesis is not supported in this browser.");
    return;
  }

  const loadVoices = () => {
    const voices = window.speechSynthesis.getVoices();
    germanVoice = voices.find(v => v.lang.startsWith('de')) || null;
  };

  loadVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
}

function speakGermanText(text) {
  if (!text || !('speechSynthesis' in window)) return;
  if (!state.config.autoPlayAudio && event?.type !== 'click') return;

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    if (germanVoice) {
      utterance.voice = germanVoice;
    }
    utterance.lang = 'de-DE';
    utterance.rate = 0.9;

    if (elements.btnP1Speak) {
      utterance.onstart = () => elements.btnP1Speak.classList.add('speaking');
      utterance.onend = () => elements.btnP1Speak.classList.remove('speaking');
      utterance.onerror = () => elements.btnP1Speak.classList.remove('speaking');
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.error("Speech Synthesis Error:", err);
  }
}

function stopGermanSpeech() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

function toggleAudioMode() {
  setAudioMode(!state.config.autoPlayAudio);
}

function setAudioMode(enabled) {
  state.config.autoPlayAudio = enabled;
  
  if (enabled) {
    elements.audioToggleIcon.textContent = '🔊';
    elements.audioToggleText.textContent = 'Audio: ON';
    elements.btnHeaderAudioToggle.classList.remove('audio-muted');
    if (elements.selectAudioMode) elements.selectAudioMode.value = 'on';
  } else {
    elements.audioToggleIcon.textContent = '🔇';
    elements.audioToggleText.textContent = 'Audio: OFF';
    elements.btnHeaderAudioToggle.classList.add('audio-muted');
    if (elements.selectAudioMode) elements.selectAudioMode.value = 'off';
    stopGermanSpeech();
  }
}

/* ==========================================
   REPLAY LOG SESSION HELPER
   ========================================== */

window.repeatSessionFromLog = function(lvl, pos, mode, n) {
  if (elements.selectLevel) elements.selectLevel.value = lvl;
  if (elements.selectPos) elements.selectPos.value = pos;
  if (elements.selectMode) elements.selectMode.value = mode;
  if (elements.inputBatchSize) elements.inputBatchSize.value = n || 10;

  updatePointerBannerUI();
  handleStartSession();
};

/* ==========================================
   DATA ENGINE
   ========================================== */

async function getBatchForSession(mode, level, pos, count) {
  const filePath = `./output_data/${level}/${pos}.json`;
  
  try {
    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error(`Failed to fetch dataset from ${filePath} (HTTP ${response.status})`);
    }
    const fullDataset = await response.json();
    
    if (!Array.isArray(fullDataset) || fullDataset.length === 0) {
      throw new Error(`Dataset at ${filePath} is empty or invalid.`);
    }

    const progress = getCachedProgress();
    const fileKey = `${level}_${pos}`;
    const pointer = progress.file_pointers?.[fileKey] || { lastIndex: 0 };
    state.session.initialLastIndex = pointer.lastIndex || 0;

    let selectedItems = [];

    if (mode === 'new') {
      const start = state.session.initialLastIndex % fullDataset.length;
      selectedItems = fullDataset.slice(start, start + count);
      
      if (selectedItems.length < count) {
        const remaining = count - selectedItems.length;
        selectedItems = selectedItems.concat(fullDataset.slice(0, remaining));
      }
    } else if (mode === 'revision') {
      const userWords = progress.words || {};
      const matchingDictionaryWords = fullDataset.filter(item => {
        const key = item.word || item.target;
        const recorded = userWords[key];
        return recorded && (recorded.status === 'learnt' || recorded.status === 'review');
      });

      if (matchingDictionaryWords.length > 0) {
        selectedItems = shuffleArray(matchingDictionaryWords).slice(0, count);
      } else {
        selectedItems = fullDataset.slice(0, count);
      }
    }

    return selectedItems.map((item, idx) => {
      const targetStr = item.target || (item.article ? `${item.article} ${item.word}` : item.word);
      return {
        id: `${level}_${pos}_${idx}_${item.word}`,
        word: item.word,
        target: targetStr,
        english: item.english_translation || item.english || '',
        example_sentence_native: item.example_sentence_native || '',
        example_sentence_english: item.example_sentence_english || '',
        level: level,
        pos: pos,
        article: item.article || ''
      };
    });
  } catch (err) {
    console.error("Data Engine Fetch Error:", err);
    alert(`Could not load dictionary data for ${level} ${pos}: ${err.message}`);
    return [];
  }
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ==========================================
   STORAGE UI & RESET
   ========================================== */

async function handleStorageConnect() {
  try {
    const result = await initStorage();
    if (result.success) {
      state.progressData = await loadProgress();
      updateStorageStatusUI(result.name);
      updatePointerBannerUI();
      renderStatsOverview();
    }
  } catch (err) {
    console.error("Storage connection failed:", err);
  }
}

async function handleResetProgress() {
  const confirmReset = confirm("Are you sure you want to RESET ALL PROGRESS?\n\nThis will permanently wipe all file pointers, learned word stats, and session history logs from user_progress.json.");
  if (!confirmReset) return;

  try {
    state.progressData = await resetProgress();
    updatePointerBannerUI();
    renderStatsOverview();
    renderFullHistoryView();
    alert("All progress and session logs have been successfully reset.");
  } catch (err) {
    console.error("Failed to reset progress:", err);
    alert("Could not reset progress: " + err.message);
  }
}

function updateStorageStatusUI(fileName = null) {
  const connected = isStorageConnected();
  if (connected) {
    elements.storageStatusText.textContent = `Connected: ${fileName || 'user_progress.json'}`;
    elements.storageStatusText.classList.add('status-connected');
    elements.storageStatusText.classList.remove('status-disconnected');
    elements.btnConnectStorage.textContent = 'Change File';
  } else {
    elements.storageStatusText.textContent = `Offline Local Mode (user_progress.json disconnected)`;
    elements.storageStatusText.classList.add('status-disconnected');
    elements.storageStatusText.classList.remove('status-connected');
    elements.btnConnectStorage.textContent = 'Connect user_progress.json';
  }
}

async function updatePointerBannerUI() {
  const level = elements.selectLevel.value;
  const pos = elements.selectPos.value;
  const fileKey = `${level}_${pos}`;
  
  const progress = getCachedProgress();
  const lastIndex = progress?.file_pointers?.[fileKey]?.lastIndex || 0;
  
  try {
    const res = await fetch(`./output_data/${level}/${pos}.json`);
    if (res.ok) {
      const data = await res.json();
      elements.pointerBannerText.textContent = `Word pointer: ${lastIndex} of ${data.length} in ${level}/${pos}.json`;
      return;
    }
  } catch (e) {
    // Ignore fetch error
  }
  
  elements.pointerBannerText.textContent = `Word pointer: ${lastIndex} in ${level}/${pos}.json`;
}

function renderStatsOverview() {
  const progress = getCachedProgress();
  const sessions = progress?.sessions || [];
  const words = progress?.words || {};

  elements.statTotalSessions.textContent = sessions.length;

  const learntCount = Object.values(words).filter(w => w.status === 'learnt').length;
  elements.statTotalLearnt.textContent = learntCount;

  if (sessions.length > 0) {
    const avgAcc = sessions.reduce((acc, s) => acc + (s.acc || 0), 0) / sessions.length;
    elements.statOverallAccuracy.textContent = `${Math.round(avgAcc)}%`;
  } else {
    elements.statOverallAccuracy.textContent = `0%`;
  }

  // Render recent 5 sessions with Repeat button
  if (elements.recentSessionsList) {
    if (sessions.length === 0) {
      elements.recentSessionsList.innerHTML = `<div class="empty-state">No recorded sessions yet. Start your first session above!</div>`;
    } else {
      const recent = [...sessions].reverse().slice(0, 5);
      elements.recentSessionsList.innerHTML = recent.map(s => {
        const dateStr = s.ts ? new Date(s.ts * 1000).toLocaleDateString() + ' ' + new Date(s.ts * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'N/A';
        return `
          <div class="session-log-item">
            <div class="log-cell-main">
              <span class="badge-level-pos">${s.lvl} ${s.pos}</span>
              <span class="log-mode-tag">${s.mode} (${s.n || 10})</span>
            </div>
            <div class="log-cell-metrics">
              <span><strong>${s.acc}%</strong> acc</span>
              <span><strong>${s.spd}s</strong>/word</span>
              <span class="log-date">${dateStr}</span>
              <button onclick="window.repeatSessionFromLog('${s.lvl}', '${s.pos}', '${s.mode}', ${s.n || 10})" class="btn btn-secondary" style="padding:2px 8px; font-size:0.75rem;" title="Start session again with these settings">
                ▶ Repeat
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  }
}

function renderFullHistoryView() {
  const progress = getCachedProgress();
  const sessions = progress?.sessions || [];

  if (!elements.historyFullTableBody) return;

  if (sessions.length === 0) {
    elements.historyFullTableBody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-state">No historical sessions recorded yet in user_progress.json.</td>
      </tr>
    `;
    return;
  }

  const logsDesc = [...sessions].reverse();
  elements.historyFullTableBody.innerHTML = logsDesc.map((s, idx) => {
    const sessionNum = sessions.length - idx;
    const dateStr = s.ts ? new Date(s.ts * 1000).toLocaleDateString() + ' ' + new Date(s.ts * 1000).toLocaleTimeString() : 'N/A';
    const accClass = s.acc >= 80 ? 'pill-correct' : (s.acc >= 50 ? '' : 'pill-incorrect');
    
    return `
      <tr>
        <td>#${sessionNum}</td>
        <td style="font-size:0.88rem; color:var(--text-secondary);">${dateStr}</td>
        <td>
          <span class="badge-level-pos">${s.lvl} ${s.pos.toUpperCase()}</span>
        </td>
        <td style="text-transform:capitalize; font-size:0.9rem;">${s.mode}</td>
        <td><strong>${s.n || 0}</strong> words</td>
        <td>
          <span class="user-typed-pill ${accClass}">
            ${s.acc}%
          </span>
        </td>
        <td>${s.spd || 0} s/word</td>
        <td>
          <button onclick="window.repeatSessionFromLog('${s.lvl}', '${s.pos}', '${s.mode}', ${s.n || 10})" class="btn btn-secondary" style="padding:4px 10px; font-size:0.8rem;" title="Replay this session">
            ▶ Repeat
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

/* ==========================================
   STATE MACHINE & VIEW CONTROLLER
   ========================================== */

function switchView(viewName) {
  state.currentView = viewName;
  stopGermanSpeech();
  
  elements.viewSetup.classList.toggle('hidden', viewName !== 'SETUP');
  elements.viewPhase1.classList.toggle('hidden', viewName !== 'PHASE_1');
  elements.viewPhase2.classList.toggle('hidden', viewName !== 'PHASE_2');
  elements.viewSummary.classList.toggle('hidden', viewName !== 'SUMMARY');
  elements.viewHistory.classList.toggle('hidden', viewName !== 'HISTORY');

  elements.tabBtnTraining.classList.toggle('active', viewName === 'SETUP' || viewName === 'PHASE_1' || viewName === 'PHASE_2' || viewName === 'SUMMARY');
  elements.tabBtnHistory.classList.toggle('active', viewName === 'HISTORY');

  if (viewName === 'SETUP') {
    renderStatsOverview();
    updatePointerBannerUI();
  } else if (viewName === 'HISTORY') {
    renderFullHistoryView();
  }
}

async function handleStartSession() {
  state.config.mode = elements.selectMode.value;
  state.config.level = elements.selectLevel.value;
  state.config.pos = elements.selectPos.value;
  state.config.batchSize = parseInt(elements.inputBatchSize.value, 10) || 10;
  state.config.previewTimeS = parseInt(elements.inputPreviewTime.value, 10) || 3;
  state.config.recallTimeM = parseInt(elements.inputRecallTime.value, 10) || 10;

  if (elements.selectAudioMode) {
    state.config.autoPlayAudio = (elements.selectAudioMode.value === 'on');
  }

  const words = await getBatchForSession(
    state.config.mode,
    state.config.level,
    state.config.pos,
    state.config.batchSize
  );

  if (words.length === 0) {
    alert("No words available for this selection. Try choosing another level or mode.");
    return;
  }

  state.session.words = words;
  state.session.currentIndex = 0;
  state.session.results = [];
  state.session.isPaused = false;

  startPhase1();
}

/* ==========================================
   PHASE 1: PASSIVE LEARNING (S seconds/word)
   ========================================== */

function startPhase1() {
  switchView('PHASE_1');
  renderPhase1Word();
}

function renderPhase1Word() {
  clearInterval(state.session.phase1Timer);
  
  const wordObj = state.session.words[state.session.currentIndex];
  const total = state.session.words.length;
  const currentNum = state.session.currentIndex + 1;

  elements.p1CardWord.textContent = wordObj.target;
  elements.p1CardTranslation.textContent = wordObj.english;
  elements.p1CardNativeEx.textContent = wordObj.example_sentence_native || '—';
  elements.p1CardEnglishEx.textContent = wordObj.example_sentence_english || '—';
  elements.p1CardLevelPos.textContent = `${wordObj.level} • ${wordObj.pos.toUpperCase()}`;
  
  elements.p1ProgressText.textContent = `Word ${currentNum} of ${total}`;
  elements.p1ProgressBarInner.style.width = `${(currentNum / total) * 100}%`;

  if (state.config.autoPlayAudio) {
    speakGermanText(wordObj.target);
  }

  const durationMs = state.config.previewTimeS * 1000;
  let elapsedMs = 0;
  const stepMs = 50;

  updatePhase1TimerVisual(1);
  elements.p1TimerText.textContent = `${state.config.previewTimeS}s`;

  state.session.phase1Timer = setInterval(() => {
    if (state.session.isPaused) return;

    elapsedMs += stepMs;
    const remainingSec = Math.max(0, Math.ceil((durationMs - elapsedMs) / 1000));
    const fraction = Math.max(0, (durationMs - elapsedMs) / durationMs);

    updatePhase1TimerVisual(fraction);
    elements.p1TimerText.textContent = `${remainingSec}s`;

    if (elapsedMs >= durationMs) {
      clearInterval(state.session.phase1Timer);
      navigatePhase1(1);
    }
  }, stepMs);
}

function updatePhase1TimerVisual(fraction) {
  const circle = elements.p1TimerCircleSvg;
  if (!circle) return;
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference * (1 - fraction);
  circle.style.strokeDasharray = `${circumference}`;
  circle.style.strokeDashoffset = `${dashoffset}`;
}

function navigatePhase1(direction) {
  clearInterval(state.session.phase1Timer);
  stopGermanSpeech();

  const nextIdx = state.session.currentIndex + direction;

  if (nextIdx < 0) {
    state.session.currentIndex = 0;
    renderPhase1Word();
  } else if (nextIdx >= state.session.words.length) {
    transitionToPhase2();
  } else {
    state.session.currentIndex = nextIdx;
    renderPhase1Word();
  }
}

function togglePhase1Pause() {
  state.session.isPaused = !state.session.isPaused;
  elements.btnP1Pause.textContent = state.session.isPaused ? 'Resume' : 'Pause';
  if (state.session.isPaused) stopGermanSpeech();
}

/* ==========================================
   PHASE 2: ACTIVE RECALL
   ========================================== */

function transitionToPhase2() {
  clearInterval(state.session.phase1Timer);
  stopGermanSpeech();

  state.session.currentIndex = 0;
  state.session.results = [];
  switchView('PHASE_2');
  renderPhase2Word();
}

function renderPhase2Word() {
  clearInterval(state.session.phase2Timer);
  
  const wordObj = state.session.words[state.session.currentIndex];
  const total = state.session.words.length;
  const currentNum = state.session.currentIndex + 1;

  elements.p2FeedbackBanner.className = 'feedback-banner hidden';
  elements.p2Input.value = '';
  elements.p2Input.disabled = false;
  elements.btnP2Submit.disabled = false;
  elements.p2Input.focus();

  elements.p2CardEnglishPrompt.textContent = wordObj.english;

  elements.p2ProgressText.textContent = `Recall ${currentNum} of ${total}`;
  elements.p2ProgressBarInner.style.width = `${(currentNum / total) * 100}%`;

  state.session.phase2StartTime = performance.now();

  const durationMs = state.config.recallTimeM * 1000;
  let elapsedMs = 0;
  const stepMs = 50;

  updatePhase2TimerVisual(1);
  elements.p2TimerText.textContent = `${state.config.recallTimeM}s`;

  state.session.phase2Timer = setInterval(() => {
    elapsedMs += stepMs;
    const remainingSec = Math.max(0, Math.ceil((durationMs - elapsedMs) / 1000));
    const fraction = Math.max(0, (durationMs - elapsedMs) / durationMs);

    updatePhase2TimerVisual(fraction);
    elements.p2TimerText.textContent = `${remainingSec}s`;

    if (elapsedMs >= durationMs) {
      clearInterval(state.session.phase2Timer);
      evaluatePhase2Answer(null);
    }
  }, stepMs);
}

function updatePhase2TimerVisual(fraction) {
  const circle = elements.p2TimerCircleSvg;
  if (!circle) return;
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference * (1 - fraction);
  circle.style.strokeDasharray = `${circumference}`;
  circle.style.strokeDashoffset = `${dashoffset}`;
}

function submitPhase2Answer() {
  if (elements.p2Input.disabled) return;
  const userInput = elements.p2Input.value;
  evaluatePhase2Answer(userInput);
}

function evaluatePhase2Answer(userRawInput) {
  clearInterval(state.session.phase2Timer);
  
  const endTime = performance.now();
  const recallSpeedMs = Math.round(endTime - state.session.phase2StartTime);
  
  const wordObj = state.session.words[state.session.currentIndex];
  
  const normalizedInput = (userRawInput || '').trim().toLowerCase();
  const normalizedTarget = (wordObj.target || '').trim().toLowerCase();
  const normalizedWord = (wordObj.word || '').trim().toLowerCase();

  let isCorrect = false;
  if (userRawInput !== null && normalizedInput.length > 0) {
    isCorrect = (normalizedInput === normalizedTarget) || 
                (normalizedInput === normalizedWord);
    
    if (!isCorrect) {
      const cleanInput = normalizedInput.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");
      const cleanTarget = normalizedTarget.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");
      isCorrect = (cleanInput === cleanTarget);
    }
  }

  elements.p2Input.disabled = true;
  elements.btnP2Submit.disabled = true;

  if (state.config.autoPlayAudio) {
    speakGermanText(wordObj.target);
  }

  if (isCorrect) {
    elements.p2FeedbackBanner.className = 'feedback-banner feedback-correct';
    elements.p2FeedbackBanner.innerHTML = `
      <div class="feedback-icon">✓</div>
      <div class="feedback-text">
        <strong>Correct!</strong> ${wordObj.target} (${(recallSpeedMs / 1000).toFixed(1)}s)
      </div>
      <button onclick="window.speakGermanAudioTarget('${wordObj.target.replace(/'/g, "\\'")}')" class="btn-speaker" style="margin-left:auto; width:32px; height:32px;" title="Listen again">
        🔊
      </button>
    `;
  } else {
    elements.p2FeedbackBanner.className = 'feedback-banner feedback-incorrect';
    elements.p2FeedbackBanner.innerHTML = `
      <div class="feedback-icon">✕</div>
      <div class="feedback-text">
        <strong>Incorrect!</strong> Correct answer: <span class="correct-answer-text">${wordObj.target}</span>
        ${userRawInput ? `<span class="your-answer-text">(You typed: "${userRawInput}")</span>` : '<span class="your-answer-text">(Time Out)</span>'}
      </div>
      <button onclick="window.speakGermanAudioTarget('${wordObj.target.replace(/'/g, "\\'")}')" class="btn-speaker" style="margin-left:auto; width:32px; height:32px;" title="Listen again">
        🔊
      </button>
    `;
  }
  elements.p2FeedbackBanner.classList.remove('hidden');

  state.session.results.push({
    word: wordObj.word,
    target: wordObj.target,
    english: wordObj.english,
    level: wordObj.level,
    pos: wordObj.pos,
    isCorrect: isCorrect,
    userTyped: userRawInput || '',
    recallSpeedMs: recallSpeedMs
  });

  setTimeout(() => {
    const nextIdx = state.session.currentIndex + 1;
    if (nextIdx < state.session.words.length) {
      state.session.currentIndex = nextIdx;
      renderPhase2Word();
    } else {
      finishSessionAndShowSummary();
    }
  }, 1500);
}

window.speakGermanAudioTarget = function(text) {
  speakGermanText(text);
};

/* ==========================================
   SESSION SUMMARY & DISK PERSISTENCE
   ========================================== */

async function finishSessionAndShowSummary() {
  switchView('SUMMARY');

  const results = state.session.results;
  const total = results.length;
  const correctCount = results.filter(r => r.isCorrect).length;
  const accRate = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  
  const totalSpeedMs = results.reduce((acc, r) => acc + r.recallSpeedMs, 0);
  const avgSpeedSec = total > 0 ? parseFloat((totalSpeedMs / total / 1000).toFixed(1)) : 0;

  elements.summaryAccuracyVal.textContent = `${accRate}%`;
  elements.summaryAvgSpeedVal.textContent = `${avgSpeedSec} s/word`;
  elements.summaryTotalWordsVal.textContent = total;

  if (accRate >= 80) {
    elements.summaryScoreBadge.className = 'score-badge score-high';
    elements.summaryScoreBadge.textContent = 'Excellent!';
  } else if (accRate >= 50) {
    elements.summaryScoreBadge.className = 'score-badge score-medium';
    elements.summaryScoreBadge.textContent = 'Good Job!';
  } else {
    elements.summaryScoreBadge.className = 'score-badge score-low';
    elements.summaryScoreBadge.textContent = 'Keep Practicing!';
  }

  elements.summaryTableBody.innerHTML = results.map((r, i) => {
    return `
      <tr>
        <td>#${i + 1}</td>
        <td>
          <strong class="target-word">${r.target}</strong>
          <button onclick="window.speakGermanAudioTarget('${r.target.replace(/'/g, "\\'")}')" class="btn-speaker" style="width:26px; height:26px; margin-left:6px; font-size:0.75rem;" title="Listen">🔊</button>
          <div class="sub-english">${r.english}</div>
        </td>
        <td>
          <span class="user-typed-pill ${r.isCorrect ? 'pill-correct' : 'pill-incorrect'}">
            ${r.userTyped || '(Timed out)'}
          </span>
        </td>
        <td>
          <span class="badge-result ${r.isCorrect ? 'bg-success' : 'bg-error'}">
            ${r.isCorrect ? 'Correct' : 'Missed'}
          </span>
        </td>
        <td>${(r.recallSpeedMs / 1000).toFixed(1)}s</td>
      </tr>
    `;
  }).join('');

  try {
    if (state.config.mode === 'new') {
      const newPointerIndex = state.session.initialLastIndex + total;
      const fileKey = `${state.config.level}_${state.config.pos}`;
      await updatePointer(fileKey, newPointerIndex);
    }

    await recordWordResults(results);

    const sessionSummaryObj = {
      ts: Math.floor(Date.now() / 1000),
      lvl: state.config.level,
      pos: state.config.pos,
      mode: state.config.mode,
      n: total,
      acc: accRate,
      spd: avgSpeedSec
    };
    await appendSessionLog(sessionSummaryObj);

    state.progressData = getCachedProgress();
  } catch (err) {
    console.error("Error saving session results to disk:", err);
  }
}
