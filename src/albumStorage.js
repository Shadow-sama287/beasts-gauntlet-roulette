// src/albumStorage.js — Safe localStorage persistence for Beast collection, named captures & companion
const STORAGE_KEY = 'br.album';

export function loadAlbum() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        caughtIds: [],
        caughtAt: {},
        capturedNamed: [],
        activeCompanionId: null,
        companionStrikeBonus: 0,
        discoveredIds: [],
        friendliness: {},
      };
    }
    const parsed = JSON.parse(raw);
    return {
      caughtIds: Array.isArray(parsed.caughtIds) ? parsed.caughtIds.map(String) : [],
      caughtAt: typeof parsed.caughtAt === 'object' && parsed.caughtAt !== null ? parsed.caughtAt : {},
      capturedNamed: Array.isArray(parsed.capturedNamed) ? parsed.capturedNamed : [],
      activeCompanionId: parsed.activeCompanionId ? String(parsed.activeCompanionId) : null,
      companionStrikeBonus: Number(parsed.companionStrikeBonus) || 0,
      discoveredIds: Array.isArray(parsed.discoveredIds) ? parsed.discoveredIds.map(String) : [],
      friendliness: typeof parsed.friendliness === 'object' && parsed.friendliness !== null ? parsed.friendliness : {},
    };
  } catch (err) {
    console.warn('Failed to load album from localStorage:', err);
    return {
      caughtIds: [],
      caughtAt: {},
      capturedNamed: [],
      activeCompanionId: null,
      companionStrikeBonus: 0,
      discoveredIds: [],
      friendliness: {},
    };
  }
}

export function saveAlbum(albumData) {
  try {
    const payload = {
      caughtIds: Array.from(albumData.caughtIds || []).map(String),
      caughtAt: albumData.caughtAt || {},
      capturedNamed: Array.isArray(albumData.capturedNamed) ? albumData.capturedNamed : [],
      activeCompanionId: albumData.activeCompanionId ? String(albumData.activeCompanionId) : null,
      companionStrikeBonus: Number(albumData.companionStrikeBonus) || 0,
      discoveredIds: Array.from(albumData.discoveredIds || []).map(String),
      friendliness: albumData.friendliness || {},
      updatedAt: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('Failed to save album to localStorage:', err);
  }
}

export function clearAlbum() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('Failed to clear album from localStorage:', err);
  }
}

