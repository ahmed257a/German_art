/**
 * storage.js - File System Access API handler, local fallback storage,
 * and optional Google Drive sync for MyRecallApp.
 */

const DEFAULT_PROGRESS_TEMPLATE = {
  version: "1.0",
  file_pointers: {},
  words: {},
  sessions: [],
};

const GOOGLE_CLIENT_ID =
  "726691658289-dnem9mn003n9a6vogfq1og2uuu2a99t6.apps.googleusercontent.com";
const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const GOOGLE_DRIVE_FILE_NAME = "myrecall_user_progress.json";

let fileHandle = null;
let currentProgress = null;
let googleDriveConnected = false;
let googleDriveAccessToken = null;
let googleDriveFileId = null;
let googleDriveAuthPromise = null;

/**
 * Initialize storage by asking user to select or connect user_progress.json
 * using the browser's File System Access API.
 */
export async function initStorage() {
  if (!("showOpenFilePicker" in window)) {
    console.warn(
      "File System Access API is not supported in this browser. Using fallback memory/localStorage mode.",
    );
    loadFallbackStorage();
    return {
      success: true,
      mode: "localStorage",
      name: "user_progress.json (LocalStorage)",
    };
  }

  try {
    const [handle] = await window.showOpenFilePicker({
      types: [
        {
          description: "JSON Files",
          accept: {
            "application/json": [".json"],
          },
        },
      ],
      multiple: false,
    });

    fileHandle = handle;
    await loadProgress();
    return { success: true, mode: "fsAccess", name: fileHandle.name };
  } catch (err) {
    if (err.name === "AbortError") {
      return { success: false, reason: "canceled" };
    }
    console.error("Error opening file handle:", err);
    throw err;
  }
}

export async function connectGoogleDrive() {
  if (!window.google?.accounts?.oauth2?.initTokenClient) {
    await ensureGoogleIdentitySdk();
  }

  try {
    googleDriveAccessToken = await requestGoogleDriveAccessToken();
    googleDriveConnected = true;
    await ensureGoogleDriveFile();

    const remoteProgress = await loadProgressFromGoogleDrive();
    if (remoteProgress) {
      currentProgress = mergeProgress(
        currentProgress || getCachedProgress(),
        remoteProgress,
      );
      await saveProgress(currentProgress);
    }

    return { success: true, mode: "googleDrive", name: GOOGLE_DRIVE_FILE_NAME };
  } catch (err) {
    console.error("Google Drive connection failed:", err);
    throw err;
  }
}

export function isStorageConnected() {
  return fileHandle !== null || googleDriveConnected;
}

export function isGoogleDriveConnected() {
  return googleDriveConnected;
}

export async function loadProgress() {
  if (fileHandle) {
    try {
      const file = await fileHandle.getFile();
      const text = await file.text();
      if (!text || text.trim() === "") {
        currentProgress = JSON.parse(JSON.stringify(DEFAULT_PROGRESS_TEMPLATE));
        await saveProgress(currentProgress);
      } else {
        const parsed = JSON.parse(text);
        currentProgress = normalizeProgress(parsed);
      }
    } catch (err) {
      console.error(
        "Failed to read file from handle, using default template:",
        err,
      );
      currentProgress = JSON.parse(JSON.stringify(DEFAULT_PROGRESS_TEMPLATE));
    }
  } else if (googleDriveConnected) {
    try {
      currentProgress = await loadProgressFromGoogleDrive();
    } catch (err) {
      console.warn(
        "Could not load progress from Google Drive, using local copy:",
        err,
      );
      loadFallbackStorage();
    }
  } else {
    loadFallbackStorage();
  }

  if (!currentProgress) {
    currentProgress = JSON.parse(JSON.stringify(DEFAULT_PROGRESS_TEMPLATE));
  }
  return currentProgress;
}

export async function saveProgress(data) {
  currentProgress =
    data ||
    currentProgress ||
    JSON.parse(JSON.stringify(DEFAULT_PROGRESS_TEMPLATE));

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

  if (googleDriveConnected) {
    try {
      await syncProgressToGoogleDrive(currentProgress);
    } catch (err) {
      console.warn(
        "Google Drive sync failed, but local storage was updated:",
        err,
      );
    }
  }

  return currentProgress;
}

export async function resetProgress() {
  currentProgress = JSON.parse(JSON.stringify(DEFAULT_PROGRESS_TEMPLATE));
  await saveProgress(currentProgress);
  return currentProgress;
}

export async function updatePointer(fileKey, newIndex) {
  if (!currentProgress) await loadProgress();
  if (!currentProgress.file_pointers) currentProgress.file_pointers = {};

  currentProgress.file_pointers[fileKey] = {
    lastIndex: Math.max(0, newIndex),
  };

  await saveProgress(currentProgress);
  return currentProgress.file_pointers[fileKey];
}

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
      lastReviewedAt: now,
    };

    existing.timesReviewed = (existing.timesReviewed || 0) + 1;
    if (item.isCorrect) {
      existing.timesCorrect = (existing.timesCorrect || 0) + 1;
    }
    existing.lastRecallSpeedMs = item.recallSpeedMs || 0;
    existing.lastReviewedAt = now;
    existing.level = item.level || existing.level;
    existing.pos = item.pos || existing.pos;

    const accuracy = existing.timesCorrect / existing.timesReviewed;
    existing.status = item.isCorrect && accuracy >= 0.5 ? "learnt" : "review";

    currentProgress.words[key] = existing;
  }

  await saveProgress(currentProgress);
  return currentProgress.words;
}

export async function appendSessionLog(sessionSummary) {
  if (!currentProgress) await loadProgress();
  if (!Array.isArray(currentProgress.sessions)) {
    currentProgress.sessions = [];
  }

  currentProgress.sessions.push(sessionSummary);
  await saveProgress(currentProgress);
  return currentProgress.sessions;
}

export function getCachedProgress() {
  if (!currentProgress) {
    loadFallbackStorage();
  }
  return currentProgress;
}

function normalizeProgress(parsed) {
  return {
    version: parsed.version || "1.0",
    file_pointers: parsed.file_pointers || {},
    words: parsed.words || {},
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
  };
}

function mergeProgress(localProgress, remoteProgress) {
  const base = normalizeProgress(localProgress || {});
  const incoming = normalizeProgress(remoteProgress || {});
  const merged = JSON.parse(JSON.stringify(DEFAULT_PROGRESS_TEMPLATE));

  merged.version =
    incoming.version || base.version || DEFAULT_PROGRESS_TEMPLATE.version;
  merged.file_pointers = {
    ...(base.file_pointers || {}),
    ...(incoming.file_pointers || {}),
  };
  merged.words = { ...(base.words || {}), ...(incoming.words || {}) };

  const mergedSessions = [
    ...(base.sessions || []),
    ...(incoming.sessions || []),
  ];
  const seen = new Set();
  merged.sessions = mergedSessions
    .filter((session) => {
      const key = JSON.stringify(session);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (a.ts || 0) - (b.ts || 0));

  return merged;
}

function loadFallbackStorage() {
  const stored = localStorage.getItem("myrecall_user_progress");
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
    localStorage.setItem(
      "myrecall_user_progress",
      JSON.stringify(currentProgress),
    );
  }
}

async function ensureGoogleIdentitySdk() {
  if (window.google?.accounts?.oauth2?.initTokenClient) return;
  if (googleDriveAuthPromise) return googleDriveAuthPromise;

  googleDriveAuthPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById("google-drive-auth-script");
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Google auth SDK failed to load")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.id = "google-drive-auth-script";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google auth SDK failed to load"));
    document.head.appendChild(script);
  });

  await googleDriveAuthPromise;
}

async function requestGoogleDriveAccessToken() {
  await ensureGoogleIdentitySdk();
  return new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_DRIVE_SCOPE,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        resolve(response.access_token);
      },
      error_callback: (error) =>
        reject(new Error(error?.error || "Google auth error")),
    });

    tokenClient.requestAccessToken();
  });
}

async function ensureGoogleDriveFile() {
  const token = googleDriveAccessToken;
  if (!token) throw new Error("Google Drive access token is not available.");

  const query = encodeURIComponent(
    `name = '${GOOGLE_DRIVE_FILE_NAME}' and mimeType = 'application/json' and trashed = false`,
  );
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!response.ok) {
    throw new Error(`Google Drive file lookup failed: ${response.status}`);
  }

  const data = await response.json();
  const existingFile = data.files?.[0];
  if (existingFile?.id) {
    googleDriveFileId = existingFile.id;
    return existingFile.id;
  }

  const metadata = {
    name: GOOGLE_DRIVE_FILE_NAME,
    mimeType: "application/json",
  };

  const formData = new FormData();
  formData.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" }),
  );
  formData.append(
    "file",
    new Blob(
      [
        JSON.stringify(
          currentProgress ||
            JSON.parse(JSON.stringify(DEFAULT_PROGRESS_TEMPLATE)),
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
  );

  const uploadResponse = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    },
  );

  if (!uploadResponse.ok) {
    throw new Error(
      `Google Drive file creation failed: ${uploadResponse.status}`,
    );
  }

  const created = await uploadResponse.json();
  googleDriveFileId = created.id;
  return created.id;
}

async function syncProgressToGoogleDrive(progress) {
  if (!googleDriveConnected || !googleDriveAccessToken) return;
  if (!googleDriveFileId) {
    await ensureGoogleDriveFile();
  }

  const metadata = {
    name: GOOGLE_DRIVE_FILE_NAME,
    mimeType: "application/json",
  };

  const formData = new FormData();
  formData.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" }),
  );
  formData.append(
    "file",
    new Blob([JSON.stringify(progress, null, 2)], { type: "application/json" }),
  );

  const response = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${googleDriveFileId}?uploadType=multipart`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${googleDriveAccessToken}` },
      body: formData,
    },
  );

  if (!response.ok) {
    throw new Error(`Google Drive sync failed: ${response.status}`);
  }
}

async function loadProgressFromGoogleDrive() {
  if (!googleDriveConnected || !googleDriveAccessToken) return null;
  if (!googleDriveFileId) {
    await ensureGoogleDriveFile();
  }

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${googleDriveFileId}?alt=media`,
    {
      headers: { Authorization: `Bearer ${googleDriveAccessToken}` },
    },
  );

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Could not read Google Drive file: ${response.status}`);
  }

  const text = await response.text();
  if (!text || !text.trim())
    return JSON.parse(JSON.stringify(DEFAULT_PROGRESS_TEMPLATE));
  return normalizeProgress(JSON.parse(text));
}
