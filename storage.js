/**
 * storage.js - File System Access API handler & local state manager
 * Manages reading/writing user_progress.json on disk.
 */

const DEFAULT_PROGRESS_TEMPLATE = {
  version: "1.0",
  file_pointers: {},
  words: {},
  sessions: []
};

let fileHandle = null;
let currentProgress = null;

/**
 * Initialize storage by asking user to select or connect user_progress.json
 * using the browser's File System Access API.
 */
export async function initStorage() {
  if (!('showOpenFilePicker' in window)) {
    console.warn("File System Access API is not supported in this browser. Using fallback memory/localStorage mode.");
    loadFallbackStorage();
    return { success: true, mode: "localStorage", name: "user_progress.json (LocalStorage)" };
  }

  try {
    const [handle] = await window.showOpenFilePicker({
      types: [
        {
          description: 'JSON Files',
          accept: {
            'application/json': ['.json']
          }
        }
      ],
      multiple: false
    });

    fileHandle = handle;
    await loadProgress();
    return { success: true, mode: "fsAccess", name: fileHandle.name };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { success: false, reason: "canceled" };
    }
    console.error("Error opening file handle:", err);
    throw err;
  }
}

/**
 * Check if a file handle is active
 */
export function isStorageConnected() {
  return fileHandle !== null;
}

/**
 * Load and parse user_progress.json from the file handle or fallback storage
 */
export async function loadProgress() {
  if (fileHandle) {
    try {
      const file = await fileHandle.getFile();
      const text = await file.text();
      if (!text || text.trim() === '') {
        currentProgress = JSON.parse(JSON.stringify(DEFAULT_PROGRESS_TEMPLATE));
        await saveProgress(currentProgress);
      } else {
        const parsed = JSON.parse(text);
        currentProgress = {
          version: parsed.version || "1.0",
          file_pointers: parsed.file_pointers || {},
          words: parsed.words || {},
          sessions: Array.isArray(parsed.sessions) ? parsed.sessions : []
        };
      }
    } catch (err) {
      console.error("Failed to read file from handle, using default template:", err);
      currentProgress = JSON.parse(JSON.stringify(DEFAULT_PROGRESS_TEMPLATE));
    }
  } else {
    loadFallbackStorage();
  }
  return currentProgress;
}

/**
 * Save progress data to disk (or fallback storage)
 */
export async function saveProgress(data) {
  currentProgress = data || currentProgress || JSON.parse(JSON.stringify(DEFAULT_PROGRESS_TEMPLATE));
  
  if (fileHandle) {
    try {
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(currentProgress, null, 2));
      await writable.close();
      console.log("Successfully saved progress to user_progress.json");
    } catch (err) {
      console.error("Error saving file via File System Access API:", err);
      saveFallbackStorage();
    }
  } else {
    saveFallbackStorage();
  }
  return currentProgress;
}

/**
 * Reset all progress data back to empty state
 */
export async function resetProgress() {
  currentProgress = JSON.parse(JSON.stringify(DEFAULT_PROGRESS_TEMPLATE));
  await saveProgress(currentProgress);
  return currentProgress;
}

/**
 * Update the lastIndex for a category pointer (e.g. "A1_noun", "C1_adverb")
 */
export async function updatePointer(fileKey, newIndex) {
  if (!currentProgress) await loadProgress();
  if (!currentProgress.file_pointers) currentProgress.file_pointers = {};
  
  currentProgress.file_pointers[fileKey] = {
    lastIndex: Math.max(0, newIndex)
  };
  
  await saveProgress(currentProgress);
  return currentProgress.file_pointers[fileKey];
}

/**
 * Record batch results into the `words` object map
 * resultsArray: Array of { word, target, level, pos, isCorrect, recallSpeedMs }
 */
export async function recordWordResults(resultsArray) {
  if (!currentProgress) await loadProgress();
  if (!currentProgress.words) currentProgress.words = {};

  const now = new Date().toISOString();

  for (const item of resultsArray) {
    const key = item.word || item.target;
    if (!key) continue;

    const existing = currentProgress.words[key] || {
      status: "review",
      level: item.level,
      pos: item.pos,
      timesReviewed: 0,
      timesCorrect: 0,
      lastRecallSpeedMs: 0,
      lastReviewedAt: now
    };

    existing.timesReviewed = (existing.timesReviewed || 0) + 1;
    if (item.isCorrect) {
      existing.timesCorrect = (existing.timesCorrect || 0) + 1;
    }
    existing.lastRecallSpeedMs = item.recallSpeedMs || 0;
    existing.lastReviewedAt = now;
    existing.level = item.level || existing.level;
    existing.pos = item.pos || existing.pos;

    // Status rule: if correct at least once and success rate >= 50%, mark as learnt; else review
    const accuracy = existing.timesCorrect / existing.timesReviewed;
    existing.status = (item.isCorrect && accuracy >= 0.5) ? "learnt" : "review";

    currentProgress.words[key] = existing;
  }

  await saveProgress(currentProgress);
  return currentProgress.words;
}

/**
 * Append a session summary to the sessions array permanently (NO PRUNING)
 * sessionSummary: { ts, lvl, pos, mode, n, acc, spd }
 */
export async function appendSessionLog(sessionSummary) {
  if (!currentProgress) await loadProgress();
  if (!Array.isArray(currentProgress.sessions)) {
    currentProgress.sessions = [];
  }

  currentProgress.sessions.push(sessionSummary);
  await saveProgress(currentProgress);
  return currentProgress.sessions;
}

/**
 * Return current in-memory progress object
 */
export function getCachedProgress() {
  if (!currentProgress) {
    loadFallbackStorage();
  }
  return currentProgress;
}

/* Fallback local storage helpers if file access isn't initialized yet */
function loadFallbackStorage() {
  const stored = localStorage.getItem('myrecall_user_progress');
  if (stored) {
    try {
      currentProgress = JSON.parse(stored);
    } catch (e) {
      currentProgress = JSON.parse(JSON.stringify(DEFAULT_PROGRESS_TEMPLATE));
    }
  } else {
    currentProgress = JSON.parse(JSON.stringify(DEFAULT_PROGRESS_TEMPLATE));
  }
}

function saveFallbackStorage() {
  if (currentProgress) {
    localStorage.setItem('myrecall_user_progress', JSON.stringify(currentProgress));
  }
}
