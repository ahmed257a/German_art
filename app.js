/**
 * app.js - Core State Machine, UI Renderer & Data Retrieval Engine for MyRecallApp
 */

import {
  initStorage,
  isStorageConnected,
  isGoogleDriveConnected,
  connectGoogleDrive,
  loadProgress,
  saveProgress,
  resetProgress,
  updatePointer,
  recordWordResults,
  appendSessionLog,
  getCachedProgress,
} from "./storage.js";

// Application State
const state = {
  currentView: "SETUP",
  progressData: null,
  config: {
    mode: "new",
    level: "A1",
    pos: "noun",
    batchSize: 10,
    previewTimeS: 3,
    recallTimeM: 10,
    autoPlayAudio: true,
  },
  session: {
    words: [],
    currentIndex: 0,
    phase1Timer: null,
    phase2Timer: null,
    phase2StartTime: 0,
    results: [],
    isPaused: false,
    initialLastIndex: 0,
  },
};

let elements = {};
let germanVoice = null;

document.addEventListener("DOMContentLoaded", async () => {
  cacheElements();
  bindEvents();
  initTTSVoices();
  state.progressData = await loadProgress();
  updateStorageStatusUI();
  updatePointerBannerUI();
  renderStatsOverview();
});

function cacheElements() {
  elements = {
    viewSetup: document.getElementById("view-setup"),
    viewReview: document.getElementById("view-review"),
    viewPhase1: document.getElementById("view-phase1"),
    viewPhase2: document.getElementById("view-phase2"),
    viewSummary: document.getElementById("view-summary"),
    viewHistory: document.getElementById("view-history"),
    viewStats: document.getElementById("view-stats"),
    appHeader: document.getElementById("app-header"),
    tabBtnTraining: document.getElementById("tab-btn-training"),
    tabBtnReview: document.getElementById("tab-btn-review"),
    tabBtnHistory: document.getElementById("tab-btn-history"),
    tabBtnStats: document.getElementById("tab-btn-stats"),
    btnConnectStorage: document.getElementById("btn-connect-storage"),
    btnConnectGoogleDrive: document.getElementById("btn-connect-google-drive"),
    btnResetProgress: document.getElementById("btn-reset-progress"),
    storageStatusText: document.getElementById("storage-status-text"),
    pointerBannerText: document.getElementById("pointer-banner-text"),
    btnHeaderAudioToggle: document.getElementById("btn-header-audio-toggle"),
    audioToggleIcon: document.getElementById("audio-toggle-icon"),
    audioToggleText: document.getElementById("audio-toggle-text"),
    selectAudioMode: document.getElementById("select-audio-mode"),
    btnP1Speak: document.getElementById("btn-p1-speak"),
    selectMode: document.getElementById("select-mode"),
    selectLevel: document.getElementById("select-level"),
    selectPos: document.getElementById("select-pos"),
    inputBatchSize: document.getElementById("input-batch-size"),
    inputPreviewTime: document.getElementById("input-preview-time"),
    inputRecallTime: document.getElementById("input-recall-time"),
    btnStartSession: document.getElementById("btn-start-session"),
    btnStartReviewSession: document.getElementById("btn-start-review-session"),
    selectReviewLevel: document.getElementById("select-review-level"),
    selectReviewPos: document.getElementById("select-review-pos"),
    selectReviewPriority: document.getElementById("select-review-priority"),
    inputReviewCount: document.getElementById("input-review-count"),
    reviewPriorityContainer: document.getElementById(
      "review-priority-container",
    ),
    statTotalSessions: document.getElementById("stat-total-sessions"),
    statTotalLearnt: document.getElementById("stat-total-learnt"),
    statOverallAccuracy: document.getElementById("stat-overall-accuracy"),
    recentSessionsList: document.getElementById("recent-sessions-list"),
    btnViewAllHistory: document.getElementById("btn-view-all-history"),
    historyFullTableBody: document.getElementById("history-full-table-body"),
    btnRefreshHistory: document.getElementById("btn-refresh-history"),
    p1CardWord: document.getElementById("p1-card-word"),
    p1CardTranslation: document.getElementById("p1-card-translation"),
    p1CardNativeEx: document.getElementById("p1-card-native-ex"),
    p1CardEnglishEx: document.getElementById("p1-card-english-ex"),
    p1CardLevelPos: document.getElementById("p1-card-level-pos"),
    p1ProgressText: document.getElementById("p1-progress-text"),
    p1ProgressBarInner: document.getElementById("p1-progress-bar-inner"),
    p1TimerCircleSvg: document.getElementById("p1-timer-circle-svg"),
    p1TimerText: document.getElementById("p1-timer-text"),
    btnP1Prev: document.getElementById("btn-p1-prev"),
    btnP1Pause: document.getElementById("btn-p1-pause"),
    btnP1Next: document.getElementById("btn-p1-next"),
    btnP1SkipToRecall: document.getElementById("btn-p1-skip-recall"),
    p2CardEnglishPrompt: document.getElementById("p2-english-prompt"),
    p2Input: document.getElementById("p2-input"),
    btnP2Submit: document.getElementById("btn-p2-submit"),
    p2ProgressText: document.getElementById("p2-progress-text"),
    p2ProgressBarInner: document.getElementById("p2-progress-bar-inner"),
    p2TimerCircleSvg: document.getElementById("p2-timer-circle-svg"),
    p2TimerText: document.getElementById("p2-timer-text"),
    p2FeedbackBanner: document.getElementById("p2-feedback-banner"),
    summaryScoreBadge: document.getElementById("summary-score-badge"),
    summaryAccuracyVal: document.getElementById("summary-accuracy-val"),
    summaryAvgSpeedVal: document.getElementById("summary-avg-speed-val"),
    summaryTotalWordsVal: document.getElementById("summary-total-words-val"),
    summaryTableBody: document.getElementById("summary-table-body"),
    btnSummaryRestart: document.getElementById("btn-summary-restart"),
    btnSummarySetup: document.getElementById("btn-summary-setup"),
  };
}

function bindEvents() {
  elements.tabBtnTraining.addEventListener("click", () => switchView("SETUP"));
  elements.tabBtnReview.addEventListener("click", () => switchView("REVIEW"));
  elements.tabBtnHistory.addEventListener("click", () => switchView("HISTORY"));
  elements.tabBtnStats.addEventListener("click", () => switchView("STATS"));
  elements.btnViewAllHistory.addEventListener("click", () =>
    switchView("HISTORY"),
  );
  elements.btnRefreshHistory.addEventListener("click", renderFullHistoryView);
  if (elements.btnConnectStorage) {
    elements.btnConnectStorage.addEventListener("click", handleStorageConnect);
  }
  if (elements.btnConnectGoogleDrive) {
    elements.btnConnectGoogleDrive.addEventListener(
      "click",
      handleGoogleDriveConnect,
    );
  }
  if (elements.btnResetProgress) {
    elements.btnResetProgress.addEventListener("click", handleResetProgress);
  }
  elements.btnHeaderAudioToggle.addEventListener("click", toggleAudioMode);
  if (elements.selectAudioMode) {
    elements.selectAudioMode.addEventListener("change", (e) =>
      setAudioMode(e.target.value === "on"),
    );
  }
  if (elements.btnP1Speak) {
    elements.btnP1Speak.addEventListener("click", () => {
      const w = state.session.words[state.session.currentIndex];
      if (w) speakGermanText(w.target);
    });
  }
  elements.selectLevel.addEventListener("change", updatePointerBannerUI);
  elements.selectPos.addEventListener("change", updatePointerBannerUI);
  elements.selectMode.addEventListener("change", updatePointerBannerUI);
  elements.btnStartSession.addEventListener("click", handleStartSession);
  elements.btnStartReviewSession.addEventListener(
    "click",
    handleStartReviewSession,
  );
  if (elements.selectReviewLevel)
    elements.selectReviewLevel.addEventListener("change", renderReviewView);
  if (elements.selectReviewPos)
    elements.selectReviewPos.addEventListener("change", renderReviewView);
  if (elements.selectReviewPriority)
    elements.selectReviewPriority.addEventListener("change", renderReviewView);
  elements.btnP1Prev.addEventListener("click", () => navigatePhase1(-1));
  elements.btnP1Next.addEventListener("click", () => navigatePhase1(1));
  elements.btnP1Pause.addEventListener("click", togglePhase1Pause);
  elements.btnP1SkipToRecall.addEventListener("click", transitionToPhase2);
  elements.btnP2Submit.addEventListener("click", submitPhase2Answer);
  elements.p2Input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") submitPhase2Answer();
  });
  elements.btnSummaryRestart.addEventListener("click", handleStartSession);
  elements.btnSummarySetup.addEventListener("click", () => switchView("SETUP"));
}

/* ==========================================
   GERMAN SPEECH SYNTHESIS ENGINE
   ========================================== */

function initTTSVoices() {
  if (!("speechSynthesis" in window)) return;
  const loadVoices = () => {
    const voices = window.speechSynthesis.getVoices();
    germanVoice = voices.find((v) => v.lang.startsWith("de")) || null;
  };
  loadVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
}

function speakGermanText(text) {
  if (!text || !("speechSynthesis" in window)) return;
  if (!state.config.autoPlayAudio && event?.type !== "click") return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (germanVoice) utterance.voice = germanVoice;
    utterance.lang = "de-DE";
    utterance.rate = 0.9;
    if (elements.btnP1Speak) {
      utterance.onstart = () => elements.btnP1Speak.classList.add("speaking");
      utterance.onend = () => elements.btnP1Speak.classList.remove("speaking");
      utterance.onerror = () =>
        elements.btnP1Speak.classList.remove("speaking");
    }
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.error(err);
  }
}

function stopGermanSpeech() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

function toggleAudioMode() {
  setAudioMode(!state.config.autoPlayAudio);
}

function setAudioMode(enabled) {
  state.config.autoPlayAudio = enabled;
  elements.audioToggleIcon.textContent = enabled ? "🔊" : "🔇";
  elements.audioToggleText.textContent = enabled ? "Audio: ON" : "Audio: OFF";
  elements.btnHeaderAudioToggle.classList.toggle("audio-muted", !enabled);
  if (elements.selectAudioMode)
    elements.selectAudioMode.value = enabled ? "on" : "off";
  if (!enabled) stopGermanSpeech();
}

/* ==========================================
   REPEAT SESSION FROM LOG
   ========================================== */

window.repeatSessionFromLog = function (lvl, pos, mode, n) {
  if (elements.selectLevel) elements.selectLevel.value = lvl;
  if (elements.selectPos) elements.selectPos.value = pos;
  if (elements.selectMode) elements.selectMode.value = mode;
  if (elements.inputBatchSize) elements.inputBatchSize.value = n || 10;
  updatePointerBannerUI();
  handleStartSession();
};

function getPriorityForRecord(record) {
  const reviewCount = Number(record?.timesReviewed) || 0;
  if (reviewCount === 0) return "low";
  const correctCount = Number(record?.timesCorrect) || 0;
  const failures = Math.max(0, reviewCount - correctCount);
  const accuracy = reviewCount > 0 ? correctCount / reviewCount : 0;
  if (failures >= 2 || accuracy < 0.4) return "urgent";
  if (failures >= 1 || accuracy < 0.75) return "medium";
  return "low";
}

function matchesReviewPriority(record, priority) {
  if (!priority || priority === "all") return true;
  return getPriorityForRecord(record) === priority;
}

/* ==========================================
   DATA ENGINE
   ========================================== */

async function getBatchForSession(
  mode,
  level,
  pos,
  count,
  reviewPriority = null,
) {
  const filePath = `./output_data/${level}/${pos}.json`;
  try {
    const response = await fetch(filePath);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const fullDataset = await response.json();
    if (!Array.isArray(fullDataset) || fullDataset.length === 0)
      throw new Error("Empty dataset");

    const progress = getCachedProgress();
    const fileKey = `${level}_${pos}`;
    const pointer = progress.file_pointers?.[fileKey] || { lastIndex: 0 };
    state.session.initialLastIndex = pointer.lastIndex || 0;

    let selectedItems = [];
    if (mode === "new") {
      const start = state.session.initialLastIndex % fullDataset.length;
      selectedItems = fullDataset.slice(start, start + count);
      if (selectedItems.length < count) {
        selectedItems = selectedItems.concat(
          fullDataset.slice(0, count - selectedItems.length),
        );
      }
    } else if (mode === "priority") {
      const userWords = progress.words || {};
      const matching = fullDataset.filter((item) => {
        const key = item.word || item.target;
        const rec = userWords[key];
        return (
          rec &&
          Number(rec.timesReviewed) > 0 &&
          matchesReviewPriority(rec, reviewPriority)
        );
      });
      selectedItems =
        matching.length > 0 ? shuffleArray(matching).slice(0, count) : [];
    } else {
      const userWords = progress.words || {};
      const matching = fullDataset.filter((item) => {
        const key = item.word || item.target;
        const rec = userWords[key];
        return rec && (rec.status === "learnt" || rec.status === "review");
      });
      selectedItems =
        matching.length > 0
          ? shuffleArray(matching).slice(0, count)
          : fullDataset.slice(0, count);
    }

    return selectedItems.map((item, idx) => {
      const targetStr =
        item.target ||
        (item.article ? `${item.article} ${item.word}` : item.word);
      return {
        id: `${level}_${pos}_${idx}_${item.word}`,
        word: item.word,
        target: targetStr,
        english: item.english_translation || item.english || "",
        example_sentence_native: item.example_sentence_native || "",
        example_sentence_english: item.example_sentence_english || "",
        level,
        pos,
        article: item.article || "",
      };
    });
  } catch (err) {
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
      renderReviewView();
    }
  } catch (err) {
    console.error(err);
  }
}

async function handleGoogleDriveConnect() {
  try {
    const result = await connectGoogleDrive();
    if (result.success) {
      state.progressData = await loadProgress();
      updateStorageStatusUI(result.name);
      updatePointerBannerUI();
      renderStatsOverview();
      renderReviewView();
    }
  } catch (err) {
    alert(`Google Drive connection failed: ${err.message}`);
  }
}

async function handleResetProgress() {
  if (
    !confirm(
      "Are you sure you want to RESET ALL PROGRESS?\n\nThis will permanently wipe all file pointers, learned word stats, and session history.",
    )
  )
    return;
  try {
    state.progressData = await resetProgress();
    updatePointerBannerUI();
    renderStatsOverview();
    renderFullHistoryView();
    renderDetailedStatsView();
    renderReviewView();
    alert("All progress has been reset.");
  } catch (err) {
    alert("Could not reset: " + err.message);
  }
}

function updateStorageStatusUI(fileName = null) {
  const connected = isStorageConnected();
  const driveConnected = isGoogleDriveConnected();
  const label = driveConnected
    ? "Google Drive + Local"
    : fileName || "user_progress.json";
  elements.storageStatusText.textContent = connected
    ? `Connected: ${label}`
    : "Offline Local Mode";
  elements.storageStatusText.classList.toggle("status-connected", connected);
  elements.storageStatusText.classList.toggle(
    "status-disconnected",
    !connected,
  );
  elements.btnConnectStorage.textContent = connected
    ? "Change Local File"
    : "Connect Local File";
  elements.btnConnectGoogleDrive.textContent = driveConnected
    ? "Google Drive Connected"
    : "Connect Google Drive";
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
  } catch (e) {}
  elements.pointerBannerText.textContent = `Word pointer: ${lastIndex} in ${level}/${pos}.json`;
}

function renderReviewView() {
  if (!elements.reviewPriorityContainer) return;

  const level = elements.selectReviewLevel?.value || state.config.level;
  const pos = elements.selectReviewPos?.value || state.config.pos;
  if (elements.selectReviewLevel) elements.selectReviewLevel.value = level;
  if (elements.selectReviewPos) elements.selectReviewPos.value = pos;

  const progress = getCachedProgress();
  const words = progress?.words || {};

  const reviewedWords = Object.entries(words)
    .filter(
      ([wordKey, record]) =>
        record &&
        Number(record.timesReviewed) > 0 &&
        record.level === level &&
        record.pos === pos,
    )
    .map(([wordKey, record]) => {
      const reviewCount = Number(record.timesReviewed) || 0;
      const correctCount = Number(record.timesCorrect) || 0;
      const failures = Math.max(0, reviewCount - correctCount);
      const accuracy =
        reviewCount > 0 ? Math.round((correctCount / reviewCount) * 100) : 0;
      return {
        word: wordKey,
        ...record,
        reviewCount,
        correctCount,
        failures,
        accuracy,
        priority: getPriorityForRecord(record),
      };
    })
    .sort((a, b) => {
      const priorityOrder = { urgent: 0, medium: 1, low: 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority])
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      if (b.failures !== a.failures) return b.failures - a.failures;
      if (b.reviewCount !== a.reviewCount) return b.reviewCount - a.reviewCount;
      return a.word.localeCompare(b.word);
    });

  const grouped = { urgent: [], medium: [], low: [] };
  reviewedWords.forEach((item) => grouped[item.priority].push(item));

  const priorityMeta = {
    urgent: {
      title: "Priority 1 — Needs attention",
      desc: "More misses than hits. Start here first.",
      className: "urgent",
    },
    medium: {
      title: "Priority 2 — Needs practice",
      desc: "Some recall is there, but it is still shaky.",
      className: "medium",
    },
    low: {
      title: "Priority 3 — Stable",
      desc: "Reliable recall. Great for confidence building.",
      className: "low",
    },
  };

  elements.reviewPriorityContainer.innerHTML = ["urgent", "medium", "low"]
    .map((priority) => {
      const items = grouped[priority];
      const meta = priorityMeta[priority];
      return `
      <div class="review-card ${meta.className}">
        <div class="review-card-header">
          <div class="review-card-title">${meta.title}</div>
          <div class="review-card-count">${items.length} words</div>
        </div>
        <div class="review-card-desc">${meta.desc}</div>
        <div class="review-word-list">
          ${
            items.length > 0
              ? items
                  .map(
                    (item) => `
            <div class="review-word-item">
              <div class="review-word-top">
                <div class="review-word-name">${item.word}</div>
                <div class="review-word-meta">${item.level} · ${item.pos}</div>
              </div>
              <div class="review-pill-row">
                <span class="review-pill">${item.accuracy}% correct</span>
                <span class="review-pill ${item.failures > 0 ? "review-pill-warning" : "review-pill-good"}">${item.failures} fail${item.failures === 1 ? "" : "s"}</span>
                <span class="review-pill">${item.reviewCount} reviews</span>
              </div>
            </div>
          `,
                  )
                  .join("")
              : '<div class="review-empty-state">No words here yet.</div>'
          }
        </div>
      </div>`;
    })
    .join("");
}

function renderStatsOverview() {
  const progress = getCachedProgress();
  const sessions = progress?.sessions || [];
  const words = progress?.words || {};

  elements.statTotalSessions.textContent = sessions.length;
  elements.statTotalLearnt.textContent = Object.values(words).filter(
    (w) => w.status === "learnt",
  ).length;
  elements.statOverallAccuracy.textContent =
    sessions.length > 0
      ? `${Math.round(sessions.reduce((a, s) => a + (s.acc || 0), 0) / sessions.length)}%`
      : "0%";

  if (sessions.length === 0) {
    elements.recentSessionsList.innerHTML = `<div class="empty-state">No recorded sessions yet.</div>`;
    return;
  }

  // Group sessions by lvl+pos+mode
  const grouped = groupSessions([...sessions].reverse().slice(0, 10));
  elements.recentSessionsList.innerHTML = grouped
    .map((grp) => {
      const last = grp.sessions[0];
      const dateStr = last.ts
        ? new Date(last.ts * 1000).toLocaleDateString() +
          " " +
          new Date(last.ts * 1000).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "";
      const avgAcc = Math.round(
        grp.sessions.reduce((a, s) => a + s.acc, 0) / grp.sessions.length,
      );
      const count = grp.sessions.length;
      return `
      <div class="session-log-item">
        <div class="log-cell-main">
          <span class="badge-level-pos">${grp.lvl} ${grp.pos}</span>
          <span class="log-mode-tag">${grp.mode}</span>
          ${count > 1 ? `<span class="group-count-badge">×${count}</span>` : ""}
        </div>
        <div class="log-cell-metrics">
          <span><strong>${avgAcc}%</strong> avg acc</span>
          <span class="log-date">${dateStr}</span>
          <button onclick="window.repeatSessionFromLog('${grp.lvl}','${grp.pos}','${grp.mode}',${last.n || 10})" class="btn btn-secondary" style="padding:2px 10px;font-size:0.75rem;">▶ Repeat</button>
        </div>
      </div>`;
    })
    .join("");
}

/**
 * Group consecutive sessions with the same lvl+pos+mode together
 */
function groupSessions(sessions) {
  const groups = [];
  for (const s of sessions) {
    const key = `${s.lvl}_${s.pos}_${s.mode}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.sessions.push(s);
    } else {
      groups.push({ key, lvl: s.lvl, pos: s.pos, mode: s.mode, sessions: [s] });
    }
  }
  return groups;
}

function renderFullHistoryView() {
  const progress = getCachedProgress();
  const sessions = progress?.sessions || [];
  if (!elements.historyFullTableBody) return;

  if (sessions.length === 0) {
    elements.historyFullTableBody.innerHTML = `<tr><td colspan="8" class="empty-state">No sessions yet.</td></tr>`;
    return;
  }

  // Group ALL sessions chronologically by same consecutive lvl+pos+mode
  const grouped = groupSessions([...sessions].reverse());
  elements.historyFullTableBody.innerHTML = grouped
    .map((grp, idx) => {
      const sessionNum = grouped.length - idx;
      const last = grp.sessions[0];
      const dateStr = last.ts
        ? new Date(last.ts * 1000).toLocaleDateString() +
          " " +
          new Date(last.ts * 1000).toLocaleTimeString()
        : "N/A";
      const avgAcc = Math.round(
        grp.sessions.reduce((a, s) => a + s.acc, 0) / grp.sessions.length,
      );
      const avgSpd = (
        grp.sessions.reduce((a, s) => a + s.spd, 0) / grp.sessions.length
      ).toFixed(1);
      const totalN = grp.sessions.reduce((a, s) => a + (s.n || 0), 0);
      const accClass =
        avgAcc >= 80 ? "pill-correct" : avgAcc >= 50 ? "" : "pill-incorrect";
      const countTag =
        grp.sessions.length > 1
          ? `<span class="group-count-badge">×${grp.sessions.length} runs</span>`
          : "";
      return `
      <tr>
        <td>#${sessionNum}</td>
        <td style="font-size:0.88rem;color:var(--text-secondary);">${dateStr}</td>
        <td><span class="badge-level-pos">${grp.lvl} ${grp.pos.toUpperCase()}</span> ${countTag}</td>
        <td style="text-transform:capitalize;">${grp.mode}</td>
        <td><strong>${totalN}</strong> words</td>
        <td><span class="user-typed-pill ${accClass}">${avgAcc}%</span></td>
        <td>${avgSpd} s/w</td>
        <td>
          <button onclick="window.repeatSessionFromLog('${grp.lvl}','${grp.pos}','${grp.mode}',${last.n || 10})" class="btn btn-secondary" style="padding:4px 10px;font-size:0.8rem;">▶ Repeat</button>
        </td>
      </tr>`;
    })
    .join("");
}

/* ==========================================
   DETAILED STATS VIEW
   ========================================== */

function renderDetailedStatsView() {
  const progress = getCachedProgress();
  const words = progress?.words || {};
  const sessions = progress?.sessions || [];

  const LEVELS = ["A1", "A2", "B1", "B2", "C1"];
  const POS = ["noun", "verb", "adjective", "adverb"];

  const all = Object.values(words);
  const learnt = all.filter((w) => w.status === "learnt");
  const review = all.filter((w) => w.status === "review");

  // By CEFR level
  const byLevel = {};
  LEVELS.forEach((lvl) => {
    byLevel[lvl] = {
      total: all.filter((w) => w.level === lvl).length,
      learnt: all.filter((w) => w.level === lvl && w.status === "learnt")
        .length,
      review: all.filter((w) => w.level === lvl && w.status === "review")
        .length,
    };
  });

  // By POS
  const byPos = {};
  POS.forEach((pos) => {
    byPos[pos] = {
      total: all.filter((w) => w.pos === pos).length,
      learnt: all.filter((w) => w.pos === pos && w.status === "learnt").length,
      review: all.filter((w) => w.pos === pos && w.status === "review").length,
    };
  });

  // Session stats
  const totalAcc =
    sessions.length > 0
      ? Math.round(sessions.reduce((a, s) => a + s.acc, 0) / sessions.length)
      : 0;
  const bestSession =
    sessions.length > 0
      ? sessions.reduce((best, s) => (s.acc > best.acc ? s : best), sessions[0])
      : null;
  const fastestSession =
    sessions.length > 0
      ? sessions.reduce((f, s) => (s.spd < f.spd ? s : f), sessions[0])
      : null;

  const container = document.getElementById("view-stats");
  if (!container) return;
  container.innerHTML = `
    <div class="summary-card">
      <h1 style="font-size:1.6rem;font-weight:700;margin-bottom:6px;">Vocabulary Statistics</h1>
      <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:28px;">Full breakdown of your German learning progress.</p>

      <!-- Top Overview -->
      <div class="stats-section-title">📊 Overall Summary</div>
      <div class="stats-grid-4" style="margin-bottom:32px;">
        <div class="stat-item">
          <div class="stat-num">${all.length}</div>
          <div class="stat-lbl">Total Words Tracked</div>
        </div>
        <div class="stat-item" style="border-color: rgba(34,197,94,0.3);">
          <div class="stat-num" style="color:#4ade80;">${learnt.length}</div>
          <div class="stat-lbl">Words Mastered</div>
        </div>
        <div class="stat-item" style="border-color: rgba(245,158,11,0.3);">
          <div class="stat-num" style="color:#fbbf24;">${review.length}</div>
          <div class="stat-lbl">Needs Review</div>
        </div>
        <div class="stat-item">
          <div class="stat-num">${sessions.length}</div>
          <div class="stat-lbl">Total Sessions</div>
        </div>
      </div>

      <!-- Session Performance -->
      <div class="stats-section-title">⚡ Session Performance</div>
      <div class="stats-grid-3" style="margin-bottom:32px;">
        <div class="stat-item">
          <div class="stat-num">${totalAcc}%</div>
          <div class="stat-lbl">Overall Accuracy</div>
        </div>
        <div class="stat-item" style="border-color:rgba(99,102,241,0.3);">
          <div class="stat-num" style="color:#a5b4fc;">${bestSession ? bestSession.acc + "%" : "—"}</div>
          <div class="stat-lbl">Best Session</div>
        </div>
        <div class="stat-item" style="border-color:rgba(139,92,246,0.3);">
          <div class="stat-num" style="color:#c084fc;">${fastestSession ? fastestSession.spd + "s" : "—"}</div>
          <div class="stat-lbl">Fastest Avg Speed</div>
        </div>
      </div>

      <!-- By CEFR Level -->
      <div class="stats-section-title">🎓 Words by CEFR Level</div>
      <div class="stats-breakdown-table" style="margin-bottom:32px;">
        ${LEVELS.map(
          (lvl) => `
          <div class="breakdown-row">
            <div class="breakdown-label"><span class="badge-level-pos">${lvl}</span></div>
            <div class="breakdown-bar-wrap">
              <div class="breakdown-bar" style="width:${byLevel[lvl].total > 0 ? Math.round((byLevel[lvl].learnt / Math.max(byLevel[lvl].total, 1)) * 100) : 0}%"></div>
            </div>
            <div class="breakdown-nums">
              <span style="color:#4ade80;">${byLevel[lvl].learnt}</span>
              <span style="color:var(--text-muted);">/</span>
              <span>${byLevel[lvl].total}</span>
              <span style="color:var(--text-muted); font-size:0.8rem;">tracked</span>
            </div>
          </div>`,
        ).join("")}
      </div>

      <!-- By Part of Speech -->
      <div class="stats-section-title">📝 Words by Part of Speech</div>
      <div class="stats-breakdown-table">
        ${POS.map((pos) => {
          const icons = {
            noun: "🔵",
            verb: "🟣",
            adjective: "🟡",
            adverb: "🟠",
          };
          return `
          <div class="breakdown-row">
            <div class="breakdown-label">${icons[pos] || ""} <span style="text-transform:capitalize;">${pos}</span></div>
            <div class="breakdown-bar-wrap">
              <div class="breakdown-bar" style="background:var(--accent-gradient);width:${byPos[pos].total > 0 ? Math.round((byPos[pos].learnt / Math.max(byPos[pos].total, 1)) * 100) : 0}%"></div>
            </div>
            <div class="breakdown-nums">
              <span style="color:#4ade80;">${byPos[pos].learnt}</span>
              <span style="color:var(--text-muted);">/</span>
              <span>${byPos[pos].total}</span>
              <span style="color:var(--text-muted); font-size:0.8rem;">tracked</span>
            </div>
          </div>`;
        }).join("")}
      </div>
    </div>
  `;
}

/* ==========================================
   STATE MACHINE & VIEW CONTROLLER
   ========================================== */

function switchView(viewName) {
  state.currentView = viewName;
  stopGermanSpeech();

  const isActiveSession = viewName === "PHASE_1" || viewName === "PHASE_2";

  // Hide header on mobile during active session phases
  if (elements.appHeader) {
    elements.appHeader.classList.toggle(
      "header-hidden-mobile",
      isActiveSession,
    );
  }

  elements.viewSetup.classList.toggle("hidden", viewName !== "SETUP");
  elements.viewReview.classList.toggle("hidden", viewName !== "REVIEW");
  elements.viewPhase1.classList.toggle("hidden", viewName !== "PHASE_1");
  elements.viewPhase2.classList.toggle("hidden", viewName !== "PHASE_2");
  elements.viewSummary.classList.toggle("hidden", viewName !== "SUMMARY");
  elements.viewHistory.classList.toggle("hidden", viewName !== "HISTORY");
  elements.viewStats.classList.toggle("hidden", viewName !== "STATS");

  elements.tabBtnTraining.classList.toggle(
    "active",
    ["SETUP", "PHASE_1", "PHASE_2", "SUMMARY"].includes(viewName),
  );
  elements.tabBtnReview.classList.toggle("active", viewName === "REVIEW");
  elements.tabBtnHistory.classList.toggle("active", viewName === "HISTORY");
  elements.tabBtnStats.classList.toggle("active", viewName === "STATS");

  if (viewName === "SETUP") {
    renderStatsOverview();
    updatePointerBannerUI();
  } else if (viewName === "REVIEW") renderReviewView();
  else if (viewName === "HISTORY") renderFullHistoryView();
  else if (viewName === "STATS") renderDetailedStatsView();
}

async function handleStartSession() {
  state.config.mode = elements.selectMode.value;
  state.config.level = elements.selectLevel.value;
  state.config.pos = elements.selectPos.value;
  state.config.batchSize = parseInt(elements.inputBatchSize.value, 10) || 10;
  state.config.previewTimeS =
    parseInt(elements.inputPreviewTime.value, 10) || 3;
  state.config.recallTimeM = parseInt(elements.inputRecallTime.value, 10) || 10;
  if (elements.selectAudioMode)
    state.config.autoPlayAudio = elements.selectAudioMode.value === "on";

  const words = await getBatchForSession(
    state.config.mode,
    state.config.level,
    state.config.pos,
    state.config.batchSize,
  );
  if (words.length === 0) {
    alert("No words available.");
    return;
  }

  state.session.words = words;
  state.session.currentIndex = 0;
  state.session.results = [];
  state.session.isPaused = false;
  startPhase1();
}

async function handleStartReviewSession() {
  const level = elements.selectReviewLevel?.value || state.config.level;
  const pos = elements.selectReviewPos?.value || state.config.pos;
  const priority = elements.selectReviewPriority?.value || "all";
  const count = parseInt(elements.inputReviewCount?.value, 10) || 10;

  state.config.mode = "priority";
  state.config.level = level;
  state.config.pos = pos;
  state.config.batchSize = count;
  state.config.previewTimeS =
    parseInt(elements.inputPreviewTime?.value, 10) || 3;
  state.config.recallTimeM =
    parseInt(elements.inputRecallTime?.value, 10) || 10;

  const words = await getBatchForSession(
    "priority",
    level,
    pos,
    count,
    priority,
  );
  if (words.length === 0) {
    alert(
      "No reviewed words are available in that priority for this category yet.",
    );
    return;
  }

  state.session.words = words;
  state.session.currentIndex = 0;
  state.session.results = [];
  state.session.isPaused = false;
  startPhase1();
}

/* ==========================================
   PHASE 1
   ========================================== */

function startPhase1() {
  switchView("PHASE_1");
  renderPhase1Word();
}

function renderPhase1Word() {
  clearInterval(state.session.phase1Timer);
  const wordObj = state.session.words[state.session.currentIndex];
  const total = state.session.words.length;
  const currentNum = state.session.currentIndex + 1;

  elements.p1CardWord.textContent = wordObj.target;
  elements.p1CardTranslation.textContent = wordObj.english;
  elements.p1CardNativeEx.textContent = wordObj.example_sentence_native || "—";
  elements.p1CardEnglishEx.textContent =
    wordObj.example_sentence_english || "—";
  elements.p1CardLevelPos.textContent = `${wordObj.level} • ${wordObj.pos.toUpperCase()}`;
  elements.p1ProgressText.textContent = `Word ${currentNum} of ${total}`;
  elements.p1ProgressBarInner.style.width = `${(currentNum / total) * 100}%`;

  if (state.config.autoPlayAudio) speakGermanText(wordObj.target);

  const durationMs = state.config.previewTimeS * 1000;
  let elapsedMs = 0;
  updatePhase1TimerVisual(1);
  elements.p1TimerText.textContent = `${state.config.previewTimeS}s`;

  state.session.phase1Timer = setInterval(() => {
    if (state.session.isPaused) return;
    elapsedMs += 50;
    const fraction = Math.max(0, (durationMs - elapsedMs) / durationMs);
    updatePhase1TimerVisual(fraction);
    elements.p1TimerText.textContent = `${Math.max(0, Math.ceil((durationMs - elapsedMs) / 1000))}s`;
    if (elapsedMs >= durationMs) {
      clearInterval(state.session.phase1Timer);
      navigatePhase1(1);
    }
  }, 50);
}

function updatePhase1TimerVisual(fraction) {
  const c = elements.p1TimerCircleSvg;
  if (!c) return;
  const circ = 2 * Math.PI * 24;
  c.style.strokeDasharray = `${circ}`;
  c.style.strokeDashoffset = `${circ * (1 - fraction)}`;
}

function navigatePhase1(dir) {
  clearInterval(state.session.phase1Timer);
  stopGermanSpeech();
  const next = state.session.currentIndex + dir;
  if (next < 0) {
    state.session.currentIndex = 0;
    renderPhase1Word();
  } else if (next >= state.session.words.length) transitionToPhase2();
  else {
    state.session.currentIndex = next;
    renderPhase1Word();
  }
}

function togglePhase1Pause() {
  state.session.isPaused = !state.session.isPaused;
  elements.btnP1Pause.textContent = state.session.isPaused ? "Resume" : "Pause";
  if (state.session.isPaused) stopGermanSpeech();
}

/* ==========================================
   PHASE 2
   ========================================== */

function transitionToPhase2() {
  clearInterval(state.session.phase1Timer);
  stopGermanSpeech();
  state.session.currentIndex = 0;
  state.session.results = [];
  switchView("PHASE_2");
  renderPhase2Word();
}

function renderPhase2Word() {
  clearInterval(state.session.phase2Timer);
  const wordObj = state.session.words[state.session.currentIndex];
  const total = state.session.words.length;
  const currentNum = state.session.currentIndex + 1;

  elements.p2FeedbackBanner.className = "feedback-banner hidden";
  elements.p2Input.value = "";
  elements.p2Input.disabled = false;
  elements.btnP2Submit.disabled = false;
  elements.p2Input.focus();
  elements.p2CardEnglishPrompt.textContent = wordObj.english;
  elements.p2ProgressText.textContent = `Recall ${currentNum} of ${total}`;
  elements.p2ProgressBarInner.style.width = `${(currentNum / total) * 100}%`;
  state.session.phase2StartTime = performance.now();

  const durationMs = state.config.recallTimeM * 1000;
  let elapsedMs = 0;
  updatePhase2TimerVisual(1);
  elements.p2TimerText.textContent = `${state.config.recallTimeM}s`;

  state.session.phase2Timer = setInterval(() => {
    elapsedMs += 50;
    const fraction = Math.max(0, (durationMs - elapsedMs) / durationMs);
    updatePhase2TimerVisual(fraction);
    elements.p2TimerText.textContent = `${Math.max(0, Math.ceil((durationMs - elapsedMs) / 1000))}s`;
    if (elapsedMs >= durationMs) {
      clearInterval(state.session.phase2Timer);
      evaluatePhase2Answer(null);
    }
  }, 50);
}

function updatePhase2TimerVisual(fraction) {
  const c = elements.p2TimerCircleSvg;
  if (!c) return;
  const circ = 2 * Math.PI * 24;
  c.style.strokeDasharray = `${circ}`;
  c.style.strokeDashoffset = `${circ * (1 - fraction)}`;
}

function submitPhase2Answer() {
  if (elements.p2Input.disabled) return;
  evaluatePhase2Answer(elements.p2Input.value);
}

function evaluatePhase2Answer(userRawInput) {
  clearInterval(state.session.phase2Timer);
  const endTime = performance.now();
  const recallSpeedMs = Math.round(endTime - state.session.phase2StartTime);
  const wordObj = state.session.words[state.session.currentIndex];

  const norm = (s) =>
    (s || "")
      .trim()
      .toLowerCase()
      .replace(/[.,\/#!$%^&*;:{}=\-_`~()]/g, "");
  const isCorrect =
    userRawInput !== null &&
    norm(userRawInput).length > 0 &&
    (norm(userRawInput) === norm(wordObj.target) ||
      norm(userRawInput) === norm(wordObj.word));

  elements.p2Input.disabled = true;
  elements.btnP2Submit.disabled = true;
  if (state.config.autoPlayAudio) speakGermanText(wordObj.target);

  const safeTarget = wordObj.target.replace(/'/g, "\\'");
  if (isCorrect) {
    elements.p2FeedbackBanner.className = "feedback-banner feedback-correct";
    elements.p2FeedbackBanner.innerHTML = `
      <div class="feedback-icon">✓</div>
      <div class="feedback-text"><strong>Correct!</strong> ${wordObj.target} (${(recallSpeedMs / 1000).toFixed(1)}s)</div>
      <button onclick="window.speakGermanAudioTarget('${safeTarget}')" class="btn-speaker" style="margin-left:auto;width:32px;height:32px;">🔊</button>`;
  } else {
    elements.p2FeedbackBanner.className = "feedback-banner feedback-incorrect";
    elements.p2FeedbackBanner.innerHTML = `
      <div class="feedback-icon">✕</div>
      <div class="feedback-text"><strong>Incorrect!</strong> Answer: <span class="correct-answer-text">${wordObj.target}</span>
        ${userRawInput ? `<span class="your-answer-text">(You: "${userRawInput}")</span>` : '<span class="your-answer-text">(Timeout)</span>'}
      </div>
      <button onclick="window.speakGermanAudioTarget('${safeTarget}')" class="btn-speaker" style="margin-left:auto;width:32px;height:32px;">🔊</button>`;
  }
  elements.p2FeedbackBanner.classList.remove("hidden");

  state.session.results.push({
    word: wordObj.word,
    target: wordObj.target,
    english: wordObj.english,
    level: wordObj.level,
    pos: wordObj.pos,
    isCorrect,
    userTyped: userRawInput || "",
    recallSpeedMs,
  });

  setTimeout(() => {
    const next = state.session.currentIndex + 1;
    if (next < state.session.words.length) {
      state.session.currentIndex = next;
      renderPhase2Word();
    } else finishSessionAndShowSummary();
  }, 1500);
}

window.speakGermanAudioTarget = function (text) {
  speakGermanText(text);
};

/* ==========================================
   SESSION SUMMARY
   ========================================== */

async function finishSessionAndShowSummary() {
  switchView("SUMMARY");
  const results = state.session.results;
  const total = results.length;
  const correctCount = results.filter((r) => r.isCorrect).length;
  const accRate = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const avgSpeedSec =
    total > 0
      ? parseFloat(
          (
            results.reduce((a, r) => a + r.recallSpeedMs, 0) /
            total /
            1000
          ).toFixed(1),
        )
      : 0;

  elements.summaryAccuracyVal.textContent = `${accRate}%`;
  elements.summaryAvgSpeedVal.textContent = `${avgSpeedSec} s/word`;
  elements.summaryTotalWordsVal.textContent = total;
  elements.summaryScoreBadge.className = `score-badge ${accRate >= 80 ? "score-high" : accRate >= 50 ? "score-medium" : "score-low"}`;
  elements.summaryScoreBadge.textContent =
    accRate >= 80
      ? "Excellent!"
      : accRate >= 50
        ? "Good Job!"
        : "Keep Practicing!";

  elements.summaryTableBody.innerHTML = results
    .map(
      (r, i) => `
    <tr>
      <td>#${i + 1}</td>
      <td>
        <strong class="target-word">${r.target}</strong>
        <button onclick="window.speakGermanAudioTarget('${r.target.replace(/'/g, "\\'")}') " class="btn-speaker" style="width:26px;height:26px;margin-left:6px;font-size:0.75rem;">🔊</button>
        <div class="sub-english">${r.english}</div>
      </td>
      <td><span class="user-typed-pill ${r.isCorrect ? "pill-correct" : "pill-incorrect"}">${r.userTyped || "(Timed out)"}</span></td>
      <td><span class="badge-result ${r.isCorrect ? "bg-success" : "bg-error"}">${r.isCorrect ? "Correct" : "Missed"}</span></td>
      <td>${(r.recallSpeedMs / 1000).toFixed(1)}s</td>
    </tr>`,
    )
    .join("");

  try {
    if (state.config.mode === "new") {
      await updatePointer(
        `${state.config.level}_${state.config.pos}`,
        state.session.initialLastIndex + total,
      );
    }
    await recordWordResults(results);
    await appendSessionLog({
      ts: Math.floor(Date.now() / 1000),
      lvl: state.config.level,
      pos: state.config.pos,
      mode: state.config.mode,
      n: total,
      acc: accRate,
      spd: avgSpeedSec,
    });
    state.progressData = getCachedProgress();
    renderReviewView();
  } catch (err) {
    console.error(err);
  }
}
