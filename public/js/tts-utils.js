/**
 * ==========================================================================
 * WEB READER PRO · TTS UTILITIES & DATA MODEL HELPERS
 * Pure Functional Helpers for TTS Identity, Text Sanitization, Book Stats, and LRU Cache
 * ==========================================================================
 */

export const MAX_CACHE_BYTES = 120 * 1024 * 1024; // 120 MB

/**
 * Regular expression matching decorative non-speech glyphs, scene breaks, and emoji
 */
export const DECORATIVE_SYMBOLS_REGEX = /[✧✦₊★☆♡♥♪♫✿❀❁❃❄❅❆❇❈❉❊❋▲▼◀▶◆◇■□●○◎✪✫✬✭✮✯✰※†‡~～〰=_*^#§•·\\/|<>🔖]/gu;

/**
 * Checks if a string is a non-empty scene break / decorative divider without speakable content
 */
export function isSceneBreakDivider(text) {
  if (text === null || text === undefined || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  const stripped = trimmed.replace(DECORATIVE_SYMBOLS_REGEX, '').replace(/[\s\-\.\,\:\;\"\'\(\)\[\]\{\}\/\\—–]/g, '');
  return stripped.length === 0;
}

/**
 * Checks if a text has any speakable letters or digits
 */
export function isSpeakableText(text) {
  if (text === null || text === undefined || typeof text !== 'string') return false;
  const cleaned = cleanTextForTTS(text);
  return /[\p{L}\p{N}]/u.test(cleaned);
}

/**
 * Sanitizes and prepares text for speech synthesis (both Edge Neural TTS & Web Speech API)
 * Removes decorative symbols (✧ ₊ ✦ ₊ ✧, ◆, ★, etc.) while preserving natural speech flow and punctuation
 */
export function cleanTextForTTS(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  
  let text = rawText
    .replace(/🔖/g, '')
    .replace(DECORATIVE_SYMBOLS_REGEX, ' ')
    .replace(/[\—\–]{2,}/g, ', ')
    .replace(/~{2,}/g, ', ')
    .replace(/\.{4,}/g, '...')
    .replace(/\s+/g, ' ')
    .trim();

  text = text.replace(/^[\,\:\;\-\–\—\s]+/, '').replace(/[\-\–\—\s]+$/, '');
  return text;
}

export function getParagraphKey(volId, chapIdx, pIdx, voice, rate, pitch) {
  const rStr = `${rate >= 1 ? '+' : ''}${Math.round((rate - 1) * 100)}%`;
  const pStr = `${pitch >= 1 ? '+' : ''}${Math.round((pitch - 1) * 50)}Hz`;
  return `${volId}:ch${chapIdx}:p${pIdx}:${voice}:${rStr}:${pStr}`;
}

export function getBookStats(volData) {
  if (!volData || !Array.isArray(volData.chapters)) {
    return { total: 0, chapters: 0, extras: 0, afterwords: 0, text: '0 chương' };
  }
  
  const chapters = volData.chapters;
  let chapCount = 0;
  let extraCount = 0;
  let afterwordCount = 0;

  chapters.forEach(ch => {
    const title = (ch.title || '').toLowerCase();
    if (title.includes('lời bạt')) {
      afterwordCount++;
    } else if (title.includes('ngoại truyện') || title.includes('truyện ngắn')) {
      extraCount++;
    } else {
      chapCount++;
    }
  });

  const total = chapters.length;
  let text = `${chapCount} chương`;
  if (extraCount > 0) text += ` · ${extraCount} ngoại truyện`;
  if (afterwordCount > 0) text += ` · ${afterwordCount} lời bạt`;

  return { total, chapters: chapCount, extras: extraCount, afterwords: afterwordCount, text };
}

export function planLRUEviction(items, incomingBytes, maxBytes = MAX_CACHE_BYTES) {
  if (!Array.isArray(items)) return [];
  let totalSize = items.reduce((sum, item) => sum + (item.size || 0), 0);
  if (totalSize + incomingBytes <= maxBytes) return [];

  const sorted = [...items].sort((a, b) => (a.lastAccess || 0) - (b.lastAccess || 0));
  const toDelete = [];
  const targetSize = maxBytes * 0.85;

  for (const item of sorted) {
    if (totalSize + incomingBytes <= targetSize) break;
    toDelete.push(item.key);
    totalSize -= (item.size || 0);
  }

  return toDelete;
}

if (typeof window !== 'undefined') {
  window.TTSUtils = {
    MAX_CACHE_BYTES,
    DECORATIVE_SYMBOLS_REGEX,
    isSceneBreakDivider,
    isSpeakableText,
    cleanTextForTTS,
    getParagraphKey,
    getBookStats,
    planLRUEviction
  };
}
