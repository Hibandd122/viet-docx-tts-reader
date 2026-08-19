/**
 * ==========================================================================
 * VOL 9 WEB READER PRO · APPLICATION CORE
 * Multi-Engine TTS (Edge Neural AI, Web Speech, Chrome Ext)
 * Audio Preloading Buffer, Bookmark Manager, Sleep Timer, Zen Mode
 * ==========================================================================
 */

(() => {
  'use strict';

  if (typeof window === 'undefined') return;

  const chapters = window.CHAPTERS || [];
  const $ = id => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);

  // Storage Keys
  const STORAGE_SETTINGS = 'vol9_pro_settings';
  const STORAGE_PROGRESS = 'vol9_pro_progress';
  const STORAGE_BOOKMARKS = 'vol9_pro_bookmarks';

  // Environment detection
  const isExtension = typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);
  const isHttp = location.protocol.startsWith('http');
  const serverBaseUrl = isHttp ? location.origin : 'http://127.0.0.1:8765';

  // Load Saved Data
  const savedSettings = (() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_SETTINGS) || '{}'); } catch { return {}; }
  })();
  const savedProgress = (() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_PROGRESS) || '{}'); } catch { return {}; }
  })();
  const savedBookmarks = (() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_BOOKMARKS) || '[]'); } catch { return []; }
  })();

  // App State
  const state = {
    // Reading position
    chapterIndex: Math.min(Math.max(0, Number(savedProgress.lastChapter ?? 0)), Math.max(0, chapters.length - 1)),
    paragraphIndex: -1,
    progressMap: { ...(savedProgress.chapters || {}) },

    // Playback state
    isPlaying: false,
    isPaused: false,
    isBuffering: false,
    token: 0,

    // Audio & TTS Engine
    engine: savedSettings.engine || 'edge', // 'edge' | 'webspeech' | 'chrome-ext'
    voice: savedSettings.voice || 'vi-VN-HoaiMyNeural',
    rate: Number(savedSettings.rate ?? 1.0),
    pitch: Number(savedSettings.pitch ?? 1.0),
    volume: Number(savedSettings.volume ?? 1.0),
    isMuted: false,
    prevVolume: 1.0,

    // Voices catalog
    edgeVoices: [],
    webVoices: [],

    // Reader UI Preferences
    theme: savedSettings.theme || 'deep-night',
    font: savedSettings.font || "'Be Vietnam Pro', sans-serif",
    fontSize: Number(savedSettings.fontSize ?? 19),
    lineHeight: Number(savedSettings.lineHeight ?? 1.85),
    pageWidth: Number(savedSettings.pageWidth ?? 880),
    textAlign: savedSettings.textAlign || 'left',
    autoScroll: savedSettings.autoScroll !== false,
    autoNext: savedSettings.autoNext === true,
    dropCap: savedSettings.dropCap !== false,
    isZenMode: false,
    isSidebarOpen: true,

    // Bookmarks
    bookmarks: Array.isArray(savedBookmarks) ? savedBookmarks : [],

    // Sleep Timer
    sleepTimer: {
      mode: 'off', // 'off' | 'minutes' | 'chapter'
      minutes: 0,
      remainingSeconds: 0,
      intervalId: null
    },

    // Master Audio Player (Single persistent instance to avoid mobile browser auto-play block)
    masterAudio: new Audio(),
    preloadedUrls: {}, // paragraphIndex -> blobUrl
    wakeLock: null
  };

  // ==========================================================================
  // PERSISTENCE & LOCAL STORAGE
  // ==========================================================================
  function saveSettings(patch = {}) {
    Object.assign(state, patch);
    const toSave = {
      engine: state.engine,
      voice: state.voice,
      rate: state.rate,
      pitch: state.pitch,
      volume: state.volume,
      theme: state.theme,
      font: state.font,
      fontSize: state.fontSize,
      lineHeight: state.lineHeight,
      pageWidth: state.pageWidth,
      textAlign: state.textAlign,
      autoScroll: state.autoScroll,
      autoNext: state.autoNext,
      dropCap: state.dropCap
    };
    try { localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(toSave)); } catch {}
  }

  function saveReadingProgress(chapIdx, paraIdx) {
    state.progressMap[chapIdx] = Math.max(0, paraIdx);
    const toSave = {
      lastChapter: chapIdx,
      chapters: state.progressMap
    };
    try { localStorage.setItem(STORAGE_PROGRESS, JSON.stringify(toSave)); } catch {}
    updateOverallProgress();
    updateChapterListProgress(chapIdx);
  }

  function saveBookmarksToStorage() {
    try { localStorage.setItem(STORAGE_BOOKMARKS, JSON.stringify(state.bookmarks)); } catch {}
    renderBookmarksList();
    updateBookmarkBadge();
  }

  // ==========================================================================
  // TOAST NOTIFICATIONS & STATUS
  // ==========================================================================
  function showToast(message, duration = 3000) {
    const container = $('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 260);
    }, duration);
  }

  function updateStatus(text) {
    const el = $('statusMessage');
    if (el) el.textContent = text;
  }

  function updateEngineBadge() {
    const textEl = $('engineStatusText');
    const badgeEl = $('engineStatusBadge');
    const dot = badgeEl?.querySelector('.status-dot');
    if (!textEl || !dot) return;

    dot.className = 'status-dot';
    if (state.engine === 'edge') {
      textEl.textContent = 'Edge AI: ' + (state.voice.includes('NamMinh') ? 'Nam Minh' : 'Hoài My');
    } else if (state.engine === 'webspeech') {
      textEl.textContent = 'Web Speech: ' + (state.voice || 'Trình duyệt');
      dot.classList.add('warning');
    } else {
      textEl.textContent = 'Chrome OS Voice 2';
    }
  }

  // ==========================================================================
  // THEME & STYLING APPLIERS
  // ==========================================================================
  function applyTheme(themeName) {
    state.theme = themeName;
    document.documentElement.setAttribute('data-theme', themeName);
    document.body.className = `theme-${themeName}${state.isZenMode ? ' zen-mode' : ''}`;
    
    // Update theme button label & swatch
    const label = $('themeNameLabel');
    const swatch = document.querySelector('.current-theme-swatch');
    const names = {
      'deep-night': 'Đêm OLED',
      'obsidian': 'Xám Than',
      'warm-paper': 'Giấy Ấm',
      'sepia': 'Sepia Cổ Điển',
      'white': 'Trắng Sáng'
    };
    if (label) label.textContent = names[themeName] || themeName;
    if (swatch) {
      const colors = {
        'deep-night': '#818cf8',
        'obsidian': '#38bdf8',
        'warm-paper': '#9a3412',
        'sepia': '#854d0e',
        'white': '#2563eb'
      };
      swatch.style.background = colors[themeName] || '#818cf8';
    }
  }

  function applyTypography() {
    document.documentElement.style.setProperty('--reader-font', state.font);
    document.documentElement.style.setProperty('--reader-size', `${state.fontSize}px`);
    document.documentElement.style.setProperty('--reader-line-height', String(state.lineHeight));
    document.documentElement.style.setProperty('--reader-width', `${state.pageWidth}px`);
    document.documentElement.style.setProperty('--reader-align', state.textAlign);

    document.body.classList.toggle('no-drop-cap', !state.dropCap);

    $$('[data-align]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.align === state.textAlign);
    });
  }

  // ==========================================================================
  // CHAPTERS & CONTENT RENDERING
  // ==========================================================================
  function getParagraphTotal(chap) {
    if (!chap) return 0;
    if (chap.paragraphs) return chap.paragraphs.length;
    if (chap.blocks) return chap.blocks.filter(b => b.type === 'p').length;
    return 0;
  }

  function getSavedParagraphForChapter(chapIdx) {
    return Math.max(0, Number(state.progressMap[chapIdx] || 0));
  }

  function formatDuration(mins) {
    if (!mins || mins < 1) return '~1 phút đọc';
    if (mins >= 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `~${h}h${m > 0 ? ` ${m}p` : ''} đọc`;
    }
    return `~${mins} phút đọc`;
  }

  function escapeHtml(str = '') {
    return str.replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
  }

  function fontNameMap(name) {
    const map = {
      Montserrat: 'Montserrat Local',
      QuattrocentoSans: 'Quattrocento Local',
      Arial: 'Arial',
      'Arial Unicode MS': 'Arial Unicode MS',
      Cambria: 'Cambria',
      Georgia: 'Georgia',
      'Liberation Serif': 'Liberation Serif'
    };
    return map[name] || 'Montserrat Local';
  }

  function renderRuns(block) {
    if (!block.runs?.length) return escapeHtml(block.text || '');
    return block.runs.map(run => {
      const f = run.font ? `font-family:'${fontNameMap(run.font)}';` : '';
      const b = run.bold ? 'font-weight:700;' : '';
      const i = run.italic ? 'font-style:italic;' : '';
      const style = f || b || i ? ` style="${f}${b}${i}"` : '';
      return `<span${style}>${escapeHtml(run.text)}</span>`;
    }).join('');
  }

  function renderChapterList() {
    const listEl = $('chapterList');
    const badgeEl = $('chapterBadgeCount');
    if (!listEl) return;
    if (badgeEl) badgeEl.textContent = `(${chapters.length})`;

    listEl.innerHTML = chapters.map((chap, idx) => {
      const total = getParagraphTotal(chap);
      const saved = Math.min(getSavedParagraphForChapter(idx), Math.max(0, total - 1));
      const percent = total > 0 ? Math.round(((saved + 1) / total) * 100) : 0;
      const progressText = saved > 0 ? `${saved + 1}/${total} đoạn (${percent}%)` : 'Chưa đọc';
      const words = chap.wordCount ? `${(chap.wordCount / 1000).toFixed(1)}k từ` : '';
      const estTime = chap.estMinutes ? `${chap.estMinutes}p` : '';
      const metaPill = [words, estTime].filter(Boolean).join(' · ');

      return `
        <button class="chapter-card ${idx === state.chapterIndex ? 'active' : ''}" data-chapter-index="${idx}">
          <div class="chapter-card-header">
            <span>Phần ${idx + 1}</span>
            <span class="chapter-percent">${saved > 0 ? `${percent}%` : ''}</span>
          </div>
          <div class="chapter-card-title">${escapeHtml(chap.title)}</div>
          <div class="chapter-card-footer">
            <span class="badge-pill">${metaPill || 'Chương'}</span>
            <span class="chapter-prog-text">${progressText}</span>
          </div>
        </button>
      `;
    }).join('');

    updateOverallProgress();
  }

  function updateChapterListProgress(idx) {
    const card = document.querySelector(`.chapter-card[data-chapter-index="${idx}"]`);
    if (!card || !chapters[idx]) return;
    const total = getParagraphTotal(chapters[idx]);
    const saved = Math.min(getSavedParagraphForChapter(idx), Math.max(0, total - 1));
    const percent = total > 0 ? Math.round(((saved + 1) / total) * 100) : 0;
    const progTextEl = card.querySelector('.chapter-prog-text');
    const percentEl = card.querySelector('.chapter-percent');
    if (progTextEl) progTextEl.textContent = saved > 0 ? `${saved + 1}/${total} đoạn (${percent}%)` : 'Chưa đọc';
    if (percentEl) percentEl.textContent = saved > 0 ? `${percent}%` : '';
  }

  function updateOverallProgress() {
    if (!chapters.length) return;
    let totalParagraphs = 0;
    let readParagraphs = 0;

    chapters.forEach((chap, i) => {
      const total = getParagraphTotal(chap);
      const saved = getSavedParagraphForChapter(i);
      totalParagraphs += total;
      readParagraphs += Math.min(saved, total);
    });

    const percent = totalParagraphs > 0 ? Math.round((readParagraphs / totalParagraphs) * 100) : 0;
    const bar = $('overallProgressBar');
    const val = $('overallProgressPercent');
    const globalBar = $('globalProgressFill');
    if (bar) bar.style.width = `${percent}%`;
    if (val) val.textContent = `${percent}%`;
    if (globalBar) globalBar.style.width = `${percent}%`;
  }

  function filterChapterList(query = '') {
    const clean = query.trim().toLocaleLowerCase('vi');
    let visibleCount = 0;
    $$('.chapter-card').forEach(card => {
      const text = card.textContent.toLocaleLowerCase('vi');
      const matches = !clean || text.includes(clean);
      card.hidden = !matches;
      if (matches) visibleCount += 1;
    });
    const emptyNotice = $('chapterEmpty');
    if (emptyNotice) emptyNotice.hidden = visibleCount > 0;
    const clearBtn = $('searchClearBtn');
    if (clearBtn) clearBtn.hidden = !clean;
  }

  function selectChapter(idx, restorePosition = true) {
    if (!chapters[idx]) return;
    stopPlayback();

    state.chapterIndex = idx;
    const chap = chapters[idx];

    // Ensure paragraphs array is parsed and attached
    const blocks = chap.blocks || (chap.paragraphs || []).map(t => ({ type:'p', text:t }));
    chap.paragraphs = blocks.filter(b => b.type === 'p').map(b => b.text);
    const totalParas = chap.paragraphs.length;

    // Update Header Meta
    if ($('chapterNumberLabel')) $('chapterNumberLabel').textContent = `PHẦN ${String(idx + 1).padStart(2, '0')} / ${String(chapters.length).padStart(2, '0')}`;
    if ($('chapterTitle')) $('chapterTitle').textContent = chap.title;
    if ($('chapterStatsLabel')) {
      const words = chap.wordCount ? `${chap.wordCount.toLocaleString('vi-VN')} từ` : '';
      const timeStr = formatDuration(chap.estMinutes);
      $('chapterStatsLabel').textContent = [words, timeStr].filter(Boolean).join(' · ');
    }

    // Top Subnav buttons
    if ($('prevChapterBtnTop')) $('prevChapterBtnTop').disabled = idx === 0;
    if ($('nextChapterBtnTop')) $('nextChapterBtnTop').disabled = idx === chapters.length - 1;

    // Bottom Navigation Cards
    const prevChap = chapters[idx - 1];
    const nextChap = chapters[idx + 1];
    if ($('prevChapterBtnBottom')) {
      $('prevChapterBtnBottom').disabled = !prevChap;
      $('prevChapterTitleLabel').textContent = prevChap ? prevChap.title : 'Đầu danh sách';
    }
    if ($('nextChapterBtnBottom')) {
      $('nextChapterBtnBottom').disabled = !nextChap;
      $('nextChapterTitleLabel').textContent = nextChap ? nextChap.title : 'Hết tác phẩm';
    }

    // Render Blocks
    const contentEl = $('content');
    let pCount = 0;
    contentEl.innerHTML = blocks.map(block => {
      if (block.type === 'image') {
        return `
          <div class="book-image-wrapper">
            <img src="${encodeURI(block.src)}" alt="Ảnh minh họa Chương ${idx + 1}" loading="lazy" class="zoomable-img">
          </div>
        `;
      }
      const pIdx = pCount++;
      const isBookmarked = isParagraphBookmarked(idx, pIdx);
      return `
        <p id="para-${pIdx}" data-paragraph="${pIdx}">
          ${renderRuns(block)}
          <button class="para-action-btn ${isBookmarked ? 'active' : ''}" data-bookmark-btn="${pIdx}" title="Đánh dấu đoạn này">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="${isBookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
          </button>
        </p>
      `;
    }).join('');

    // Highlight active chapter in sidebar list
    $$('.chapter-card').forEach((c, i) => {
      c.classList.toggle('active', i === idx);
    });

    const savedPara = getSavedParagraphForChapter(idx);
    updateChapterProgressBar(savedPara, totalParas);

    if (restorePosition && savedPara > 0 && savedPara < totalParas) {
      const targetEl = $(`para-${savedPara}`);
      if (targetEl) {
        targetEl.classList.add('resume-point');
        setTimeout(() => targetEl.scrollIntoView({ block:'center', behavior:'smooth' }), 100);
      }
      updateNowReadingUI(`Tiếp tục từ đoạn ${savedPara + 1}/${totalParas}`);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      updateNowReadingUI(`Sẵn sàng đọc (${totalParas} đoạn)`);
    }

    updateStatus(`Đã mở ${chap.title} (${totalParas} đoạn)`);
  }

  function updateChapterProgressBar(paraIdx, total) {
    const fill = $('chapterProgressBar');
    const label = $('chapterParagraphProgress');
    const totalParas = total || getParagraphTotal(chapters[state.chapterIndex]);
    const current = Math.max(0, paraIdx + 1);
    const percent = totalParas > 0 ? Math.min(100, Math.round((current / totalParas) * 100)) : 0;
    if (fill) fill.style.width = `${percent}%`;
    if (label) label.textContent = `${current}/${totalParas} đoạn (${percent}%)`;
  }

  function markActiveParagraph(paraIdx) {
    $$('.book-content p.reading-now, .book-content p.resume-point').forEach(p => p.classList.remove('reading-now', 'resume-point'));
    const target = $(`para-${paraIdx}`);
    if (target) {
      target.classList.add('reading-now');
      if (state.autoScroll) {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
    const total = getParagraphTotal(chapters[state.chapterIndex]);
    updateChapterProgressBar(paraIdx, total);
    saveReadingProgress(state.chapterIndex, paraIdx);
  }

  // ==========================================================================
  // BOOKMARK SYSTEM
  // ==========================================================================
  function isParagraphBookmarked(chapIdx, paraIdx) {
    return state.bookmarks.some(b => b.chapterIndex === chapIdx && b.paragraphIndex === paraIdx);
  }

  function toggleBookmark(chapIdx, paraIdx) {
    const existingIdx = state.bookmarks.findIndex(b => b.chapterIndex === chapIdx && b.paragraphIndex === paraIdx);
    if (existingIdx >= 0) {
      state.bookmarks.splice(existingIdx, 1);
      showToast('Đã xóa đánh dấu');
    } else {
      const chap = chapters[chapIdx];
      const paraText = chap?.paragraphs?.[paraIdx] || '';
      const snippet = paraText.slice(0, 100) + (paraText.length > 100 ? '…' : '');
      state.bookmarks.push({
        id: `${chapIdx}_${paraIdx}_${Date.now()}`,
        chapterIndex: chapIdx,
        paragraphIndex: paraIdx,
        chapterTitle: chap?.title || `Chương ${chapIdx + 1}`,
        snippet,
        timestamp: Date.now()
      });
      showToast('Đã đánh dấu đoạn này 🔖');
    }

    saveBookmarksToStorage();

    // Update paragraph bookmark button active state in DOM
    const btn = document.querySelector(`[data-bookmark-btn="${paraIdx}"]`);
    if (btn) {
      const active = isParagraphBookmarked(chapIdx, paraIdx);
      btn.classList.toggle('active', active);
      const svg = btn.querySelector('svg');
      if (svg) svg.setAttribute('fill', active ? 'currentColor' : 'none');
    }
  }

  function renderBookmarksList() {
    const listEl = $('bookmarkList');
    const emptyEl = $('bookmarkEmpty');
    if (!listEl) return;

    if (!state.bookmarks.length) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    listEl.innerHTML = state.bookmarks.map(b => `
      <div class="bookmark-card" data-bookmark-id="${b.id}">
        <div class="bookmark-meta">
          <span>Phần ${b.chapterIndex + 1} · Đoạn ${b.paragraphIndex + 1}</span>
          <button class="bookmark-delete-btn" data-del-bookmark="${b.id}" title="Xóa đánh dấu">✕</button>
        </div>
        <div class="bookmark-snippet" data-jump-chapter="${b.chapterIndex}" data-jump-para="${b.paragraphIndex}">
          ${escapeHtml(b.snippet)}
        </div>
      </div>
    `).join('');
  }

  function updateBookmarkBadge() {
    const badge = $('bookmarkCountBadge');
    if (badge) badge.textContent = String(state.bookmarks.length);
  }

  // ==========================================================================
  // MULTI-ENGINE TTS CONTROLLER
  // ==========================================================================
  const speechApi = window.speechSynthesis;

  async function loadAllVoices() {
    // 1. Edge Neural Voices via Server API
    try {
      const res = await fetch(`${serverBaseUrl}/api/voices`, { method:'GET', signal:AbortSignal.timeout(2500) });
      if (res.ok) {
        const data = await res.json();
        if (data.voices?.length) {
          state.edgeVoices = data.voices;
        }
      }
    } catch {
      state.edgeVoices = [
        { ShortName:'vi-VN-HoaiMyNeural', FriendlyName:'Microsoft Hoài My (Nữ AI Tự nhiên)' },
        { ShortName:'vi-VN-NamMinhNeural', FriendlyName:'Microsoft Nam Minh (Nam AI Tự nhiên)' }
      ];
    }

    // 2. Web Speech API Voices
    if (speechApi) {
      const v = speechApi.getVoices();
      state.webVoices = v.filter(voice => 
        /vi|vietnamese|tiếng việt/i.test(voice.name || '') || 
        /^(vi|vie)([-_]|$)/i.test(voice.lang || '')
      );
      if (!state.webVoices.length) {
        state.webVoices = v; // Fallback to all available voices
      }
    }

    populateVoiceSelect();
    updateEngineBadge();
  }

  function populateVoiceSelect() {
    const select = $('voiceSelect');
    if (!select) return;

    if (state.engine === 'edge') {
      select.innerHTML = state.edgeVoices.map(v => 
        `<option value="${v.ShortName}">${escapeHtml(v.FriendlyName || v.ShortName)}</option>`
      ).join('');
      if (!state.edgeVoices.some(v => v.ShortName === state.voice)) {
        state.voice = state.edgeVoices[0]?.ShortName || 'vi-VN-HoaiMyNeural';
      }
    } else if (state.engine === 'webspeech') {
      if (state.webVoices.length) {
        select.innerHTML = state.webVoices.map(v => 
          `<option value="${escapeHtml(v.name)}">${escapeHtml(v.name)} (${v.lang})</option>`
        ).join('');
        if (!state.webVoices.some(v => v.name === state.voice)) {
          state.voice = state.webVoices[0]?.name || '';
        }
      } else {
        select.innerHTML = '<option value="">Không tìm thấy voice Việt trên máy</option>';
      }
    } else {
      select.innerHTML = '<option value="Chrome OS Vietnamese 2">Chrome OS Vietnamese 2</option>';
      state.voice = 'Chrome OS Vietnamese 2';
    }

    select.value = state.voice;
  }

  function getEdgeVoiceShortName() {
    let v = state.voice;
    if (!v || typeof v !== 'string' || !v.includes('Neural')) {
      if (/NamMinh|Nam Minh|Male|Nam/i.test(v)) return 'vi-VN-NamMinhNeural';
      return 'vi-VN-HoaiMyNeural';
    }
    return v;
  }

  // Direct Client-Side WebSocket Microsoft Edge Neural AI Synthesizer
  async function generateClientEdgeAudioUrl(text, voice = 'vi-VN-HoaiMyNeural', rate = 1.0, pitch = 1.0) {
    return new Promise(async (resolve, reject) => {
      try {
        const TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
        const ticks = Math.floor(Date.now() / 1000) + 11644473600;
        const rounded = ticks - (ticks % 300);
        const windowsTicks = rounded * 10000000;
        const encoder = new TextEncoder();
        const data = encoder.encode(`${windowsTicks}${TRUSTED_TOKEN}`);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hash = Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('')
          .toUpperCase();

        const reqId = 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
        const connId = 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });

        const ratePercent = `${rate >= 1 ? '+' : ''}${Math.round((rate - 1) * 100)}%`;
        const pitchPercent = `${pitch >= 1 ? '+' : ''}${Math.round((pitch - 1) * 50)}Hz`;

        const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_TOKEN}&Sec-MS-GEC=${hash}&Sec-MS-GEC-Version=1-143.0.3650.96&ConnectionId=${connId}`;

        const ws = new WebSocket(url);
        ws.binaryType = 'arraybuffer';

        const audioChunks = [];
        const timer = setTimeout(() => {
          try { ws.close(); } catch {}
          reject(new Error('Edge TTS timeout'));
        }, 12000);

        ws.onopen = () => {
          const configMsg = 'Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}';
          ws.send(configMsg);

          const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="vi-VN"><voice name="${voice}"><prosody pitch="${pitchPercent}" rate="${ratePercent}">${escaped}</prosody></voice></speak>`;
          const ssmlMsg = `X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`;
          ws.send(ssmlMsg);
        };

        ws.onmessage = (e) => {
          if (e.data instanceof ArrayBuffer) {
            const view = new DataView(e.data);
            const headerLen = view.getUint16(0);
            if (e.data.byteLength > headerLen + 2) {
              audioChunks.push(e.data.slice(headerLen + 2));
            }
          } else if (typeof e.data === 'string' && e.data.includes('Path:turn.end')) {
            clearTimeout(timer);
            try { ws.close(); } catch {}
            const blob = new Blob(audioChunks, { type: 'audio/mpeg' });
            resolve(URL.createObjectURL(blob));
          }
        };

        ws.onerror = (err) => {
          clearTimeout(timer);
          try { ws.close(); } catch {}
          reject(err);
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  // Preload next 2 paragraphs in background for zero-latency gapless playback
  async function preloadNextParagraphs(currentIdx) {
    if (state.engine !== 'edge') return;
    const chap = chapters[state.chapterIndex];
    if (!chap || !chap.paragraphs) return;
    const voiceName = getEdgeVoiceShortName();

    for (let offset = 1; offset <= 2; offset++) {
      const targetIdx = currentIdx + offset;
      if (targetIdx >= chap.paragraphs.length) break;
      if (state.preloadedUrls[targetIdx]) continue;

      const text = chap.paragraphs[targetIdx]?.trim();
      if (!text) continue;

      try {
        const blobUrl = await generateClientEdgeAudioUrl(text, voiceName, state.rate, state.pitch);
        state.preloadedUrls[targetIdx] = blobUrl;
      } catch {
        // Ignored in background preload
      }
    }
  }

  // MediaSession API Integration for Lock Screen and Background Playback
  function updateMediaSession(chapTitle, paraIndex, totalParas) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: chapTitle || 'Vol 9 · Tiểu Thuyết Tiếng Việt',
        artist: `Đoạn ${paraIndex + 1}/${totalParas}`,
        album: 'Vol 9 Web Reader Pro',
        artwork: [
          { src: 'favicon.png', sizes: '512x512', type: 'image/png' }
        ]
      });
      navigator.mediaSession.playbackState = state.isPlaying && !state.isPaused ? 'playing' : 'paused';

      navigator.mediaSession.setActionHandler('play', () => resumePlayback());
      navigator.mediaSession.setActionHandler('pause', () => pausePlayback());
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        const prevIdx = Math.max(0, state.paragraphIndex - 1);
        playParagraph(prevIdx);
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        const chap = chapters[state.chapterIndex];
        const nextIdx = Math.min((chap?.paragraphs?.length || 1) - 1, state.paragraphIndex + 1);
        playParagraph(nextIdx);
      });
    } catch {}
  }

  // WakeLock to prevent screen timeout while listening
  async function requestWakeLock() {
    if ('wakeLock' in navigator && !state.wakeLock) {
      try {
        state.wakeLock = await navigator.wakeLock.request('screen');
        state.wakeLock.addEventListener('release', () => {
          state.wakeLock = null;
        });
      } catch {}
    }
  }

  // Web Speech Garbage-Collection Keepalive Timer
  let speechKeepAliveTimer = null;
  function keepSpeechAlive() {
    clearInterval(speechKeepAliveTimer);
    speechKeepAliveTimer = setInterval(() => {
      if (state.engine === 'webspeech' && state.isPlaying && !state.isPaused && speechApi && speechApi.speaking) {
        speechApi.pause();
        speechApi.resume();
      }
    }, 8000);
  }

  async function playParagraph(paraIdx) {
    const currentToken = ++state.token;
    const chap = chapters[state.chapterIndex];
    if (!chap || !chap.paragraphs || !chap.paragraphs.length) return;

    // Skip empty paragraphs automatically
    while (paraIdx < chap.paragraphs.length && !chap.paragraphs[paraIdx]?.trim()) {
      paraIdx++;
    }

    if (paraIdx >= chap.paragraphs.length) {
      // Completed current chapter
      if (state.sleepTimer.mode === 'chapter') {
        stopPlayback();
        showToast('Đã dừng đọc theo hẹn giờ hết chương 🌙');
        return;
      }

      if (state.autoNext && state.chapterIndex < chapters.length - 1) {
        showToast(`Đang chuyển sang Phần ${state.chapterIndex + 2}…`);
        selectChapter(state.chapterIndex + 1, false);
        state.paragraphIndex = 0;
        playParagraph(0);
        return;
      }

      stopPlayback();
      showToast('🎉 Đã đọc xong toàn bộ chương!');
      updateNowReadingUI('Đã đọc xong chương');
      return;
    }

    state.paragraphIndex = paraIdx;
    state.isPlaying = true;
    state.isPaused = false;
    syncPlayerControlsUI();
    markActiveParagraph(paraIdx);
    saveReadingProgress(state.chapterIndex, paraIdx);

    const text = chap.paragraphs[paraIdx].trim();
    const snippet = text.slice(0, 80) + (text.length > 80 ? '…' : '');
    updateNowReadingUI(`Đang đọc đoạn ${paraIdx + 1}/${chap.paragraphs.length}: "${snippet}"`);
    updateMediaSession(chap.title, paraIdx, chap.paragraphs.length);
    requestWakeLock();

    // Auto scroll to active paragraph if enabled
    if (state.autoScroll) {
      const el = $(`para-${paraIdx}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // --- ENGINE 1: EDGE NEURAL TTS ---
    if (state.engine === 'edge') {
      const voiceName = getEdgeVoiceShortName();
      const audio = state.masterAudio;

      audio.volume = state.isMuted ? 0 : state.volume;
      audio.playbackRate = 1.0;

      audio.ontimeupdate = () => {
        if (state.token !== currentToken) return;
        const cur = audio.currentTime || 0;
        const dur = audio.duration || 1;
        updatePlayerTimeline(cur, dur);
      };

      audio.onended = () => {
        if (state.token !== currentToken) return;
        playParagraph(state.paragraphIndex + 1);
      };

      audio.onerror = (e) => {
        if (state.token !== currentToken) return;
        console.warn('Edge TTS playback notice, advancing next...', e);
        setTimeout(() => {
          if (state.token === currentToken && state.isPlaying) {
            playParagraph(state.paragraphIndex + 1);
          }
        }, 400);
      };

      // Check preloaded cache first for instant 0ms playback
      let audioUrl = state.preloadedUrls[paraIdx];
      if (!audioUrl) {
        try {
          audioUrl = await generateClientEdgeAudioUrl(text, voiceName, state.rate, state.pitch);
          state.preloadedUrls[paraIdx] = audioUrl;
        } catch {
          audioUrl = `${serverBaseUrl}/api/tts?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(voiceName)}&rate=${state.rate}&pitch=${state.pitch}`;
        }
      }

      if (state.token !== currentToken) return;

      audio.src = audioUrl;
      audio.play().catch(err => {
        console.warn('Audio play() catch:', err);
      });

      // Eagerly preload next 2 paragraphs
      preloadNextParagraphs(paraIdx);
      return;
    }

    // --- ENGINE 2: WEB SPEECH API ---
    if (state.engine === 'webspeech') {
      if (!speechApi) {
        showToast('Trình duyệt không hỗ trợ Web Speech API');
        stopPlayback();
        return;
      }

      speechApi.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'vi-VN';
      utterance.rate = state.rate;
      utterance.pitch = state.pitch;
      utterance.volume = state.isMuted ? 0 : state.volume;

      const selectedVoice = state.webVoices.find(v => v.name === state.voice);
      if (selectedVoice) utterance.voice = selectedVoice;

      window._currentUtterance = utterance; // Prevent garbage collection bug

      utterance.onend = () => {
        if (state.token !== currentToken) return;
        playParagraph(state.paragraphIndex + 1);
      };

      utterance.onerror = (e) => {
        if (state.token !== currentToken) return;
        console.error('Speech error:', e);
        setTimeout(() => {
          if (state.token === currentToken && state.isPlaying) {
            playParagraph(state.paragraphIndex + 1);
          }
        }, 400);
      };

      speechApi.speak(utterance);
      keepSpeechAlive();
      return;
    }

    // --- ENGINE 3: CHROME EXTENSION TTS ---
    if (state.engine === 'chrome-ext' && isExtension) {
      chrome.runtime.sendMessage({
        type: 'TTS_SPEAK',
        text,
        voiceName: state.voice,
        rate: state.rate,
        pitch: state.pitch,
        volume: state.isMuted ? 0 : state.volume
      }, res => {
        if (state.token !== currentToken) return;
        if (chrome.runtime.lastError || res?.ok === false) {
          showToast('Lỗi Chrome OS TTS: ' + (res?.error || 'Không hỗ trợ'));
          stopPlayback();
        }
      });
    }
  }

  function pausePlayback() {
    if (!state.isPlaying || state.isPaused) return;
    state.isPaused = true;
    syncPlayerControlsUI();

    if (state.engine === 'edge') {
      state.masterAudio.pause();
    } else if (state.engine === 'webspeech' && speechApi) {
      speechApi.pause();
    } else if (state.engine === 'chrome-ext' && isExtension) {
      chrome.runtime.sendMessage({ type: 'TTS_CONTROL', action: 'pause' });
    }

    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    updateStatus('Đã tạm dừng');
  }

  function resumePlayback() {
    if (!state.isPlaying) {
      startPlayback();
      return;
    }

    if (state.isPaused) {
      state.isPaused = false;
      syncPlayerControlsUI();

      if (state.engine === 'edge') {
        state.masterAudio.play().catch(() => playParagraph(state.paragraphIndex));
      } else if (state.engine === 'webspeech' && speechApi) {
        if (speechApi.paused) speechApi.resume();
        else playParagraph(state.paragraphIndex);
      } else if (state.engine === 'chrome-ext' && isExtension) {
        chrome.runtime.sendMessage({ type: 'TTS_CONTROL', action: 'resume' });
      }

      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
      updateStatus('Đang đọc');
    }
  }

  function startPlayback() {
    const chap = chapters[state.chapterIndex];
    if (!chap) return;
    const startPara = state.paragraphIndex >= 0 ? state.paragraphIndex : getSavedParagraphForChapter(state.chapterIndex);
    playParagraph(startPara);
  }

  function stopPlayback() {
    state.token++;
    state.isPlaying = false;
    state.isPaused = false;

    if (state.masterAudio) {
      state.masterAudio.pause();
      state.masterAudio.removeAttribute('src');
      state.masterAudio.load();
    }
    if (speechApi) {
      speechApi.cancel();
    }
    if (isExtension) {
      chrome.runtime.sendMessage({ type: 'TTS_CONTROL', action: 'stop' });
    }
    clearInterval(speechKeepAliveTimer);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';

    syncPlayerControlsUI();
    markActiveParagraph(-1);
    updatePlayerTimeline(0, 1);
    updateStatus('Đã dừng');
  }

  // ==========================================================================
  // PLAYER UI & CONTROLS SYNC
  // ==========================================================================
  function syncPlayerControlsUI() {
    const playIcon = $('playIconSvg');
    const pauseIcon = $('pauseIconSvg');
    const playBtn = $('playerPlayPauseBtn');

    if (playIcon && pauseIcon) {
      playIcon.hidden = state.isPlaying && !state.isPaused;
      pauseIcon.hidden = !state.isPlaying || state.isPaused;
    }
    if (playBtn) {
      playBtn.title = state.isPlaying && !state.isPaused ? 'Tạm dừng (Space)' : 'Phát (Space)';
    }

    const chapLabel = $('playerChapterLabel');
    if (chapLabel) chapLabel.textContent = `Phần ${state.chapterIndex + 1}`;
  }

  function updateNowReadingUI(text) {
    const snippet = $('nowReadingSnippet');
    const pos = $('nowReadingPos');
    const chap = chapters[state.chapterIndex];
    const total = chap?.paragraphs?.length || 0;

    if (snippet) snippet.textContent = text;
    if (pos) {
      if (state.paragraphIndex >= 0 && total > 0) {
        pos.textContent = `Đoạn ${state.paragraphIndex + 1} / ${total}`;
      } else {
        pos.textContent = `${total} đoạn`;
      }
    }
  }

  function updatePlayerTimeline(current, total) {
    const fill = $('timelineFill');
    const curLabel = $('playerCurrentTime');
    const totLabel = $('playerTotalTime');

    const percent = total > 0 ? Math.min(100, (current / total) * 100) : 0;
    if (fill) fill.style.width = `${percent}%`;

    const fmt = s => {
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return `${m}:${String(sec).padStart(2, '0')}`;
    };

    if (curLabel) curLabel.textContent = fmt(current);
    if (totLabel) totLabel.textContent = total > 1 ? fmt(total) : '--:--';
  }

  // ==========================================================================
  // SLEEP TIMER SYSTEM
  // ==========================================================================
  function setSleepTimer(minutesOrMode) {
    clearInterval(state.sleepTimer.intervalId);

    if (minutesOrMode === 0 || minutesOrMode === '0') {
      state.sleepTimer.mode = 'off';
      state.sleepTimer.minutes = 0;
      state.sleepTimer.remainingSeconds = 0;
      $('sleepTimerLabel').textContent = 'Hẹn giờ';
      $('playerTimerLabel').textContent = 'Tắt';
      $('activeTimerNotice').hidden = true;
      showToast('Đã tắt hẹn giờ');
      return;
    }

    if (minutesOrMode === 'chapter') {
      state.sleepTimer.mode = 'chapter';
      $('sleepTimerLabel').textContent = 'Hết chương';
      $('playerTimerLabel').textContent = 'Hết chương';
      $('activeTimerNotice').hidden = false;
      $('timerCountdownDisplay').textContent = 'Sau khi đọc xong chương hiện tại';
      showToast('Đã hẹn giờ: Tự dừng khi hết chương 🌙');
      return;
    }

    const mins = Number(minutesOrMode);
    state.sleepTimer.mode = 'minutes';
    state.sleepTimer.minutes = mins;
    state.sleepTimer.remainingSeconds = mins * 60;

    $('activeTimerNotice').hidden = false;
    updateSleepTimerUI();

    state.sleepTimer.intervalId = setInterval(() => {
      state.sleepTimer.remainingSeconds--;
      updateSleepTimerUI();

      if (state.sleepTimer.remainingSeconds <= 0) {
        clearInterval(state.sleepTimer.intervalId);
        state.sleepTimer.mode = 'off';
        stopPlayback();
        showToast('🌙 Hẹn giờ kết thúc. Chúc bạn ngủ ngon!');
        setSleepTimer(0);
      }
    }, 1000);

    showToast(`Đã hẹn giờ tắt sau ${mins} phút 🌙`);
  }

  function updateSleepTimerUI() {
    const sec = state.sleepTimer.remainingSeconds;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    const timeStr = `${m}:${String(s).padStart(2, '0')}`;
    
    if ($('timerCountdownDisplay')) $('timerCountdownDisplay').textContent = timeStr;
    if ($('sleepTimerLabel')) $('sleepTimerLabel').textContent = timeStr;
    if ($('playerTimerLabel')) $('playerTimerLabel').textContent = timeStr;
  }

  // ==========================================================================
  // LIGHTBOX & IMAGE VIEWER
  // ==========================================================================
  function openLightbox(src, caption) {
    const modal = $('lightboxModal');
    const img = $('lightboxImg');
    const cap = $('lightboxCaption');
    if (!modal || !img) return;

    img.src = src;
    if (cap) cap.textContent = caption || '';
    modal.hidden = false;
  }

  function closeLightbox() {
    const modal = $('lightboxModal');
    if (modal) modal.hidden = true;
  }

  // ==========================================================================
  // Helper: Toggle Sidebar Drawer for Desktop and Mobile
  function toggleSidebar(forceState) {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      const open = forceState !== undefined ? forceState : !document.body.classList.contains('sidebar-open');
      document.body.classList.toggle('sidebar-open', open);
      const backdrop = $('sidebarBackdrop');
      if (backdrop) backdrop.hidden = !open;
    } else {
      state.isSidebarOpen = forceState !== undefined ? forceState : !state.isSidebarOpen;
      document.body.classList.toggle('sidebar-closed', !state.isSidebarOpen);
    }
  }

  // Helper: Synchronize Volume UI across popover, settings panel and audio element
  function applyVolumeChange(newVal, toggleMute = false) {
    if (toggleMute) {
      state.isMuted = !state.isMuted;
    } else {
      state.volume = Math.max(0, Math.min(1, Number(newVal)));
      state.isMuted = state.volume === 0;
    }

    const pct = Math.round(state.volume * 100);
    const effectiveVol = state.isMuted ? 0 : state.volume;

    const volSlider = $('quickVolumeSlider');
    const volSettingsSlider = $('volume');
    const volPctBadge = $('quickVolumePercent');
    const volValLabel = $('volumeValue');
    const highSvg = $('volumeHighSvg');
    const muteSvg = $('volumeMuteSvg');

    if (volSlider) volSlider.value = state.volume;
    if (volSettingsSlider) volSettingsSlider.value = state.volume;
    if (volPctBadge) volPctBadge.textContent = state.isMuted ? '0%' : `${pct}%`;
    if (volValLabel) volValLabel.textContent = `${pct}%`;
    if (highSvg) highSvg.hidden = state.isMuted || state.volume === 0;
    if (muteSvg) muteSvg.hidden = !state.isMuted && state.volume > 0;

    if (state.currentAudio) {
      state.currentAudio.volume = effectiveVol;
    }
    saveSettings({ volume: state.volume });
  }

  // ==========================================================================
  // EVENT LISTENERS & WIRING
  // ==========================================================================
  function initEventListeners() {
    // --- Topbar Actions & Mobile Drawer ---
    $('sidebarToggleBtn')?.addEventListener('click', () => toggleSidebar());
    $('sidebarCloseBtn')?.addEventListener('click', () => toggleSidebar(false));
    $('sidebarBackdrop')?.addEventListener('click', () => toggleSidebar(false));

    $('zenModeBtn')?.addEventListener('click', () => {
      state.isZenMode = !state.isZenMode;
      document.body.classList.toggle('zen-mode', state.isZenMode);
      showToast(state.isZenMode ? 'Chế độ Đọc Tập Trung (F)' : 'Đã thoát chế độ tập trung');
    });

    $('quickSearchBtn')?.addEventListener('click', () => {
      toggleSidebar(true);
      switchSidebarTab('chapters');
      $('chapterSearch')?.focus();
    });

    $('bookmarksBtn')?.addEventListener('click', () => {
      toggleSidebar(true);
      switchSidebarTab('bookmarks');
    });

    $('settingsToggleBtn')?.addEventListener('click', () => {
      toggleSidebar(true);
      switchSidebarTab('settings');
    });

    // Theme Picker
    $('themePickerBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = $('themeDropdownMenu');
      if (menu) menu.hidden = !menu.hidden;
    });

    $$('.theme-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        const t = opt.dataset.theme;
        applyTheme(t);
        saveSettings({ theme: t });
        $('themeDropdownMenu').hidden = true;
        showToast(`Đã đổi giao diện: ${opt.textContent.trim()}`);
      });
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.theme-dropdown-wrap')) {
        const menu = $('themeDropdownMenu');
        if (menu) menu.hidden = true;
      }
      if (!e.target.closest('#volumeControlWrap')) {
        const popover = $('volumePopover');
        if (popover) popover.hidden = true;
      }
    });

    // --- Sidebar Tabs ---
    $$('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchSidebarTab(btn.dataset.tab));
    });

    // Chapter Search
    $('chapterSearch')?.addEventListener('input', (e) => filterChapterList(e.target.value));
    $('searchClearBtn')?.addEventListener('click', () => {
      $('chapterSearch').value = '';
      filterChapterList('');
      $('chapterSearch').focus();
    });

    // Chapter List Click Delegation
    $('chapterList')?.addEventListener('click', (e) => {
      const card = e.target.closest('.chapter-card');
      if (!card) return;
      const idx = Number(card.dataset.chapterIndex);
      selectChapter(idx, true);
      if (window.innerWidth <= 768) {
        toggleSidebar(false);
      }
    });

    // Bookmark list actions
    $('bookmarkList')?.addEventListener('click', (e) => {
      const delBtn = e.target.closest('[data-del-bookmark]');
      if (delBtn) {
        const id = delBtn.dataset.delBookmark;
        state.bookmarks = state.bookmarks.filter(b => b.id !== id);
        saveBookmarksToStorage();
        showToast('Đã xóa đánh dấu');
        return;
      }

      const jumpEl = e.target.closest('[data-jump-chapter]');
      if (jumpEl) {
        const chapIdx = Number(jumpEl.dataset.jumpChapter);
        const paraIdx = Number(jumpEl.dataset.jumpPara);
        selectChapter(chapIdx, false);
        state.paragraphIndex = paraIdx;
        markActiveParagraph(paraIdx);
        showToast(`Đã chuyển tới đoạn ${paraIdx + 1}`);
        if (window.innerWidth <= 768) {
          toggleSidebar(false);
        }
      }
    });

    $('clearAllBookmarksBtn')?.addEventListener('click', () => {
      if (!state.bookmarks.length) return;
      if (confirm('Bạn có chắc muốn xóa tất cả các đoạn đã đánh dấu không?')) {
        state.bookmarks = [];
        saveBookmarksToStorage();
        showToast('Đã xóa toàn bộ đánh dấu');
      }
    });

    // --- Settings Panel Controls ---
    $$('input[name="ttsEngine"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        state.engine = e.target.value;
        populateVoiceSelect();
        updateEngineBadge();
        saveSettings({ engine: state.engine });
        showToast(`Đã chuyển sang: ${state.engine === 'edge' ? 'Microsoft Edge Neural AI' : 'Web Speech API'}`);
      });
    });

    $('voiceSelect')?.addEventListener('change', (e) => {
      state.voice = e.target.value;
      updateEngineBadge();
      saveSettings({ voice: state.voice });
    });

    $('voiceTestBtn')?.addEventListener('click', () => {
      const testText = 'Xin chào. Đây là bản thử giọng đọc AI tiếng Việt chất lượng cao của trình đọc Vol 9.';
      if (state.engine === 'edge') {
        const voiceName = getEdgeVoiceShortName();
        const url = `${serverBaseUrl}/api/tts?text=${encodeURIComponent(testText)}&voice=${encodeURIComponent(voiceName)}&rate=${state.rate}&pitch=${state.pitch}`;
        const a = new Audio(url);
        a.volume = state.isMuted ? 0 : state.volume;
        a.play().then(() => showToast('Đang phát thử giọng Edge AI…')).catch(err => {
          showToast('Lỗi phát thử giọng: ' + err.message);
        });
      } else if (state.engine === 'webspeech' && speechApi) {
        speechApi.cancel();
        const u = new SpeechSynthesisUtterance(testText);
        u.lang = 'vi-VN';
        u.rate = state.rate;
        u.pitch = state.pitch;
        u.volume = state.volume;
        const v = state.webVoices.find(x => x.name === state.voice);
        if (v) u.voice = v;
        speechApi.speak(u);
        showToast('Đang phát thử giọng Web Speech…');
      }
    });

    // Speed / Rate Slider
    $('rate')?.addEventListener('input', (e) => {
      state.rate = Number(e.target.value);
      $('rateValue').textContent = `${state.rate.toFixed(2)}×`;
      $('speedPillLabel').textContent = `${state.rate.toFixed(2)}×`;
      saveSettings({ rate: state.rate });
    });

    $$('.slider-ticks span').forEach(tick => {
      tick.addEventListener('click', () => {
        const val = Number(tick.dataset.val);
        state.rate = val;
        $('rate').value = val;
        $('rateValue').textContent = `${val.toFixed(2)}×`;
        $('speedPillLabel').textContent = `${val.toFixed(2)}×`;
        $$('.slider-ticks span').forEach(t => t.classList.toggle('active', t === tick));
        saveSettings({ rate: val });
      });
    });

    // Pitch Slider
    $('pitch')?.addEventListener('input', (e) => {
      state.pitch = Number(e.target.value);
      $('pitchValue').textContent = state.pitch.toFixed(2);
      saveSettings({ pitch: state.pitch });
    });

    // Volume Sliders & Popover
    $('volume')?.addEventListener('input', (e) => {
      applyVolumeChange(e.target.value);
    });

    $('quickVolumeSlider')?.addEventListener('input', (e) => {
      applyVolumeChange(e.target.value);
    });

    // Toggle Volume Popover on click
    $('volumeMuteBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const popover = $('volumePopover');
      if (popover) {
        popover.hidden = !popover.hidden;
      }
    });

    // Typography Settings
    $('fontSelect')?.addEventListener('change', (e) => {
      state.font = e.target.value;
      applyTypography();
      saveSettings({ font: state.font });
    });

    $('fontSize')?.addEventListener('input', (e) => {
      state.fontSize = Number(e.target.value);
      $('fontSizeValue').textContent = `${state.fontSize}px`;
      applyTypography();
      saveSettings({ fontSize: state.fontSize });
    });

    $('lineHeight')?.addEventListener('input', (e) => {
      state.lineHeight = Number(e.target.value);
      $('lineHeightValue').textContent = state.lineHeight.toFixed(2);
      applyTypography();
      saveSettings({ lineHeight: state.lineHeight });
    });

    $('pageWidth')?.addEventListener('input', (e) => {
      state.pageWidth = Number(e.target.value);
      $('pageWidthValue').textContent = `${state.pageWidth}px`;
      applyTypography();
      saveSettings({ pageWidth: state.pageWidth });
    });

    $$('[data-align]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.textAlign = btn.dataset.align;
        applyTypography();
        saveSettings({ textAlign: state.textAlign });
      });
    });

    // Toggles
    $('autoScrollCheck')?.addEventListener('change', (e) => {
      state.autoScroll = e.target.checked;
      saveSettings({ autoScroll: state.autoScroll });
    });

    $('autoNextCheck')?.addEventListener('change', (e) => {
      state.autoNext = e.target.checked;
      saveSettings({ autoNext: state.autoNext });
      showToast(state.autoNext ? 'Đã bật tự đọc tiếp chương sau' : 'Đã tắt tự đọc tiếp chương sau');
    });

    $('dropCapCheck')?.addEventListener('change', (e) => {
      state.dropCap = e.target.checked;
      applyTypography();
      saveSettings({ dropCap: state.dropCap });
    });

    // Export / Import Backup Data
    $('exportDataBtn')?.addEventListener('click', () => {
      const data = {
        version: '1.0',
        timestamp: Date.now(),
        settings: state,
        progress: state.progressMap,
        bookmarks: state.bookmarks
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vol9_reader_backup_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Đã tải xuống file sao lưu!');
    });

    $('importDataBtn')?.addEventListener('click', () => {
      $('importFileInput')?.click();
    });

    $('importFileInput')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const imported = JSON.parse(event.target?.result || '{}');
          if (imported.progress) state.progressMap = imported.progress;
          if (imported.bookmarks) state.bookmarks = imported.bookmarks;
          if (imported.settings) Object.assign(state, imported.settings);
          saveSettings();
          saveBookmarksToStorage();
          saveReadingProgress(state.chapterIndex, getSavedParagraphForChapter(state.chapterIndex));
          applyTheme(state.theme);
          applyTypography();
          renderChapterList();
          selectChapter(state.chapterIndex, true);
          showToast('Đã phục hồi dữ liệu sao lưu thành công! 🎉');
        } catch (err) {
          alert('Lỗi định dạng file JSON sao lưu: ' + err.message);
        }
      };
      reader.readAsText(file);
    });

    // Reset Progress
    let resetTimer = 0;
    $('resetProgressBtn')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      if (btn.dataset.confirm !== 'yes') {
        btn.dataset.confirm = 'yes';
        btn.textContent = '⚠ Bấm lần nữa để xác nhận xóa sạch tiến độ';
        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => {
          btn.dataset.confirm = '';
          btn.textContent = '↺ Xóa toàn bộ vị trí & tiến độ đọc';
        }, 4000);
        return;
      }
      btn.dataset.confirm = '';
      btn.textContent = '↺ Xóa toàn bộ vị trí & tiến độ đọc';
      clearTimeout(resetTimer);
      state.progressMap = {};
      localStorage.removeItem(STORAGE_PROGRESS);
      stopPlayback();
      renderChapterList();
      selectChapter(0, false);
      showToast('Đã xóa toàn bộ tiến độ đã lưu');
    });

    // --- Content Clicks (Paragraph selection, bookmark pin, image zoom) ---
    $('content')?.addEventListener('click', (e) => {
      const bmBtn = e.target.closest('[data-bookmark-btn]');
      if (bmBtn) {
        e.stopPropagation();
        const pIdx = Number(bmBtn.dataset.bookmarkBtn);
        toggleBookmark(state.chapterIndex, pIdx);
        return;
      }

      const img = e.target.closest('img.zoomable-img');
      if (img) {
        openLightbox(img.src, img.alt);
        return;
      }

      const para = e.target.closest('p[data-paragraph]');
      if (para) {
        const pIdx = Number(para.dataset.paragraph);
        stopPlayback();
        playParagraph(pIdx);
      }
    });

    // --- Player Bar Controls ---
    $('playerPlayPauseBtn')?.addEventListener('click', () => {
      if (state.isPlaying && !state.isPaused) {
        pausePlayback();
      } else {
        resumePlayback();
      }
    });

    $('playerStopBtn')?.addEventListener('click', stopPlayback);

    $('playerPrevParaBtn')?.addEventListener('click', () => {
      const prevIdx = Math.max(0, state.paragraphIndex - 1);
      stopPlayback();
      playParagraph(prevIdx);
    });

    $('playerNextParaBtn')?.addEventListener('click', () => {
      const chap = chapters[state.chapterIndex];
      const nextIdx = Math.min((chap?.paragraphs?.length || 1) - 1, state.paragraphIndex + 1);
      stopPlayback();
      playParagraph(nextIdx);
    });

    $('playerSeekBackBtn')?.addEventListener('click', () => {
      if (state.engine === 'edge' && state.currentAudio) {
        state.currentAudio.currentTime = Math.max(0, state.currentAudio.currentTime - 5);
      } else {
        const prevIdx = Math.max(0, state.paragraphIndex - 1);
        stopPlayback();
        playParagraph(prevIdx);
      }
    });

    $('playerSeekFwdBtn')?.addEventListener('click', () => {
      if (state.engine === 'edge' && state.currentAudio) {
        state.currentAudio.currentTime = Math.min(state.currentAudio.duration || 0, state.currentAudio.currentTime + 5);
      } else {
        const chap = chapters[state.chapterIndex];
        const nextIdx = Math.min((chap?.paragraphs?.length || 1) - 1, state.paragraphIndex + 1);
        stopPlayback();
        playParagraph(nextIdx);
      }
    });

    // Timeline Scrubber
    $('timelineBar')?.addEventListener('click', (e) => {
      if (state.engine !== 'edge' || !state.currentAudio || !state.currentAudio.duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      state.currentAudio.currentTime = ratio * state.currentAudio.duration;
    });

    // Speed Pill Cycle
    $('speedPillBtn')?.addEventListener('click', () => {
      const speeds = [0.8, 1.0, 1.25, 1.5, 1.75, 2.0];
      let nextIdx = speeds.indexOf(state.rate) + 1;
      if (nextIdx >= speeds.length || nextIdx < 0) nextIdx = 0;
      const newRate = speeds[nextIdx];
      state.rate = newRate;
      $('rate').value = newRate;
      $('rateValue').textContent = `${newRate.toFixed(2)}×`;
      $('speedPillLabel').textContent = `${newRate.toFixed(2)}×`;
      saveSettings({ rate: newRate });
      showToast(`Tốc độ: ${newRate.toFixed(2)}×`);
    });

    // Chapter Nav Buttons (Top & Bottom)
    $('prevChapterBtnTop')?.addEventListener('click', () => selectChapter(Math.max(0, state.chapterIndex - 1)));
    $('nextChapterBtnTop')?.addEventListener('click', () => selectChapter(Math.min(chapters.length - 1, state.chapterIndex + 1)));
    $('prevChapterBtnBottom')?.addEventListener('click', () => selectChapter(Math.max(0, state.chapterIndex - 1)));
    $('nextChapterBtnBottom')?.addEventListener('click', () => selectChapter(Math.min(chapters.length - 1, state.chapterIndex + 1)));

    // Sleep Timer Modal
    $('sleepTimerBtn')?.addEventListener('click', () => {
      $('sleepTimerModal').hidden = false;
    });
    $('playerTimerPillBtn')?.addEventListener('click', () => {
      $('sleepTimerModal').hidden = false;
    });
    $('sleepTimerCloseBtn')?.addEventListener('click', () => {
      $('sleepTimerModal').hidden = true;
    });
    $('sleepTimerBackdrop')?.addEventListener('click', () => {
      $('sleepTimerModal').hidden = true;
    });

    $$('.timer-opt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.minutes;
        setSleepTimer(val);
        $$('.timer-opt-btn').forEach(b => b.classList.toggle('active', b === btn));
        setTimeout(() => $('sleepTimerModal').hidden = true, 300);
      });
    });

    // Lightbox Modal Closers
    $('lightboxCloseBtn')?.addEventListener('click', closeLightbox);
    $('lightboxBackdrop')?.addEventListener('click', closeLightbox);

    // Shortcuts Modal
    $('shortcutsCloseBtn')?.addEventListener('click', () => $('shortcutsModal').hidden = true);
    $('shortcutsBackdrop')?.addEventListener('click', () => $('shortcutsModal').hidden = true);

    // --- Global Keyboard Shortcuts ---
    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input, select, textarea')) return;

      if (e.code === 'Space') {
        e.preventDefault();
        $('playerPlayPauseBtn')?.click();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) {
          $('prevChapterBtnTop')?.click();
        } else {
          $('playerPrevParaBtn')?.click();
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) {
          $('nextChapterBtnTop')?.click();
        } else {
          $('playerNextParaBtn')?.click();
        }
      } else if (e.key === 'f' || e.key === 'F') {
        $('zenModeBtn')?.click();
      } else if (e.key === 'b' || e.key === 'B') {
        const paraIdx = state.paragraphIndex >= 0 ? state.paragraphIndex : getSavedParagraphForChapter(state.chapterIndex);
        toggleBookmark(state.chapterIndex, paraIdx);
      } else if (e.key === 'm' || e.key === 'M') {
        $('sidebarToggleBtn')?.click();
      } else if (e.key === 't' || e.key === 'T') {
        $('settingsToggleBtn')?.click();
      } else if (e.key === '?') {
        $('shortcutsModal').hidden = false;
      } else if (e.key === 'Escape') {
        closeLightbox();
        $('sleepTimerModal').hidden = true;
        $('shortcutsModal').hidden = true;
        if (state.isPlaying) stopPlayback();
      }
    });

    // Hide Chrome Extension Option if not running in extension
    if (!isExtension) {
      const extCard = $('chromeExtEngineCard');
      if (extCard) extCard.style.opacity = '0.5';
    }
  }

  function switchSidebarTab(tabName) {
    $$('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));
    $$('.tab-pane').forEach(pane => pane.hidden = true);
    const targetPane = $(`tabContent${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
    if (targetPane) targetPane.hidden = false;

    // Ensure sidebar is open
    if (!state.isSidebarOpen) {
      state.isSidebarOpen = true;
      document.body.classList.remove('sidebar-closed');
    }
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================
  async function init() {
    applyTheme(state.theme);
    applyTypography();

    // Populate Settings Controls
    if ($('rate')) $('rate').value = state.rate;
    if ($('rateValue')) $('rateValue').textContent = `${state.rate.toFixed(2)}×`;
    if ($('speedPillLabel')) $('speedPillLabel').textContent = `${state.rate.toFixed(2)}×`;
    if ($('pitch')) $('pitch').value = state.pitch;
    if ($('pitchValue')) $('pitchValue').textContent = state.pitch.toFixed(2);
    if ($('volume')) $('volume').value = state.volume;
    if ($('volumeValue')) $('volumeValue').textContent = `${Math.round(state.volume * 100)}%`;
    if ($('fontSelect')) $('fontSelect').value = state.font;
    if ($('fontSize')) $('fontSize').value = state.fontSize;
    if ($('fontSizeValue')) $('fontSizeValue').textContent = `${state.fontSize}px`;
    if ($('lineHeight')) $('lineHeight').value = state.lineHeight;
    if ($('lineHeightValue')) $('lineHeightValue').textContent = state.lineHeight.toFixed(2);
    if ($('pageWidth')) $('pageWidth').value = state.pageWidth;
    if ($('pageWidthValue')) $('pageWidthValue').textContent = `${state.pageWidth}px`;
    if ($('autoScrollCheck')) $('autoScrollCheck').checked = state.autoScroll;
    if ($('autoNextCheck')) $('autoNextCheck').checked = state.autoNext;
    if ($('dropCapCheck')) $('dropCapCheck').checked = state.dropCap;

    const engineRadio = document.querySelector(`input[name="ttsEngine"][value="${state.engine}"]`);
    if (engineRadio) engineRadio.checked = true;

    initEventListeners();
    renderBookmarksList();
    updateBookmarkBadge();
    renderChapterList();

    // Select initial chapter
    selectChapter(state.chapterIndex, true);
    syncPlayerControlsUI();

    // Load Voices
    await loadAllVoices();

    // Register Service Worker for offline PWA
    if ('serviceWorker' in navigator && isHttp) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
      }, { once: true });
    }
  }

  // Start app when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

