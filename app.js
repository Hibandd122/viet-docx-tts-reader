/**
 * ==========================================================================
 * WEB READER PRO · APPLICATION CORE (MOBILE-FIRST LUXURY UX & TTS)
 * Senior Frontend & Mobile UX Architecture · Multi-Engine TTS
 * ==========================================================================
 */

(() => {
  'use strict';

  if (typeof window === 'undefined') return;

  const $ = id => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);

  // Storage Keys (100% Backward Compatible)
  const STORAGE_SETTINGS = 'vol9_pro_settings';
  const STORAGE_PROGRESS = 'vol9_pro_progress';
  const STORAGE_BOOKMARKS = 'vol9_pro_bookmarks';
  const DB_NAME = 'WebReaderProAudioDB';
  const DB_STORE = 'audio_chunks';
  const DB_VERSION = 1;
  const APP_BUILD = 'ux-mobile-pro-v3';

  // Environment detection
  const isExtension = typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);
  const isHttp = location.protocol.startsWith('http');
  const serverBaseUrl = isHttp ? location.origin : 'http://127.0.0.1:8765';

  // Load Saved Data Safely
  const savedSettings = (() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_SETTINGS) || '{}'); } catch { return {}; }
  })();
  const savedProgress = (() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_PROGRESS) || '{}'); } catch { return {}; }
  })();
  const savedBookmarks = (() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_BOOKMARKS) || '[]'); } catch { return []; }
  })();

  // IndexedDB Audio Cache
  let dbPromise = null;
  function getDB() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve) => {
        if (!('indexedDB' in window)) return resolve(null);
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(DB_STORE)) {
            db.createObjectStore(DB_STORE, { keyPath: 'key' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
    }
    return dbPromise;
  }

  async function getCachedAudio(key) {
    try {
      const db = await getDB();
      if (!db) return null;
      return new Promise((resolve) => {
        const tx = db.transaction(DB_STORE, 'readonly');
        const store = tx.objectStore(DB_STORE);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result?.blob || null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  async function setCachedAudio(key, blob) {
    try {
      const db = await getDB();
      if (!db) return;
      const tx = db.transaction(DB_STORE, 'readwrite');
      const store = tx.objectStore(DB_STORE);
      store.put({ key, blob, time: Date.now() });
      updateCacheStatsUI();
    } catch {}
  }

  async function clearIndexedDBCache() {
    try {
      const db = await getDB();
      if (!db) return;
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).clear();
    } catch {}
  }

  async function updateCacheStatsUI() {
    try {
      const db = await getDB();
      if (!db) return;
      const tx = db.transaction(DB_STORE, 'readonly');
      const store = tx.objectStore(DB_STORE);
      const countReq = store.count();
      countReq.onsuccess = () => {
        const count = countReq.result || 0;
        const countEl = $('cacheCountLabel');
        if (countEl) countEl.textContent = count.toLocaleString();
        const sizeEl = $('cacheSizeLabel');
        if (sizeEl) sizeEl.textContent = `~${(count * 22).toLocaleString()} KB`;
      };
    } catch {}
  }

  // Multi-Volume Support
  function getActiveVolumeId() {
    return state?.volumeId || savedProgress.lastVolume || window.ACTIVE_VOLUME_ID || 'vol10';
  }

  function getActiveVolumeData() {
    const volId = getActiveVolumeId();
    if (window.VOLUMES && window.VOLUMES[volId]) {
      return window.VOLUMES[volId];
    }
    return {
      id: volId,
      title: 'Tập ' + volId,
      chapters: window.CHAPTERS || []
    };
  }

  function getVolumeCountBreakdown(volId) {
    if (volId === 'vol10') {
      return { total: 12, text: '10 chương · 6 ngoại truyện · 1 lời bạt' };
    }
    return { total: 10, text: '10 chương đầy đủ' };
  }

  // App State Model
  const state = {
    // Volume & Navigation
    volumeId: savedProgress.lastVolume || window.ACTIVE_VOLUME_ID || 'vol10',
    chapterIndex: 0,
    paragraphIndex: -1,
    progressMap: { ...(savedProgress.chapters || {}) },

    // Status State Machine
    statusState: 'INITIALIZING', // INITIALIZING | LOADING_BOOK | LOADING_TTS | READY | PLAYING | PAUSED | ERROR

    // Playback State
    isPlaying: false,
    isPaused: false,
    isLoadingAudio: false,
    token: 0,
    wakeLock: null,

    // Audio & TTS Engine
    engine: savedSettings.engine || 'edge', // 'edge' | 'webspeech' | 'chrome-ext'
    voice: savedSettings.voice || 'vi-VN-HoaiMyNeural',
    rate: Number(savedSettings.rate ?? 1.0),
    pitch: Number(savedSettings.pitch ?? 1.0),
    volume: Number(savedSettings.volume ?? 1.0),
    isMuted: savedSettings.isMuted === true,
    prevVolume: 1.0,

    // Voices catalog
    edgeVoices: [],
    webVoices: [],

    // Reader UI Preferences
    theme: savedSettings.theme || 'deep-night',
    font: savedSettings.font || "'Be Vietnam Pro', sans-serif",
    fontSize: Number(savedSettings.fontSize ?? 18),
    lineHeight: Number(savedSettings.lineHeight ?? 1.85),
    pageWidth: Number(savedSettings.pageWidth ?? 840),
    textAlign: savedSettings.textAlign || 'left',
    autoScroll: savedSettings.autoScroll !== false,
    autoNext: savedSettings.autoNext !== false,
    autoPreloadNext: savedSettings.autoPreloadNext !== false,
    dropCap: savedSettings.dropCap !== false,
    isZenMode: false,
    isSidebarOpen: window.innerWidth > 900,

    // Bookmarks & Timer
    bookmarks: Array.isArray(savedBookmarks) ? savedBookmarks : [],
    sleepTimer: {
      mode: 'off',
      minutes: 0,
      remainingSeconds: 0,
      intervalId: null
    },

    // Audio Engine Instances
    masterAudio: new Audio(),
    preloadedUrls: {},
    audioPreloadPromises: {},
    saveProgressTimer: null,
    lastScrollY: 0,
    savedScrollBeforeLock: 0
  };

  // Safe initial chapter index
  const initVol = getActiveVolumeData();
  state.chapterIndex = Math.min(
    Math.max(0, Number(savedProgress.lastChapter ?? 0)),
    Math.max(0, (initVol.chapters ? initVol.chapters.length - 1 : 0))
  );

  // ==========================================================================
  // 1. DYNAMIC MEASUREMENT & SAFE AREA
  // ==========================================================================
  function updateDynamicLayoutMeasurements() {
    // Measure dynamic viewport height
    const vh = window.innerHeight;
    document.documentElement.style.setProperty('--app-height', `${vh}px`);

    // Measure player actual rendered height
    const player = $('audioPlayer');
    if (player) {
      const rect = player.getBoundingClientRect();
      const pHeight = Math.round(rect.height) || 84;
      document.documentElement.style.setProperty('--player-height', `${pHeight}px`);
    }
  }

  function lockBodyScroll() {
    state.savedScrollBeforeLock = window.scrollY;
    document.body.classList.add('scroll-locked');
  }

  function unlockBodyScroll() {
    document.body.classList.remove('scroll-locked');
    window.scrollTo(0, state.savedScrollBeforeLock);
  }

  // ==========================================================================
  // 2. PERSISTENCE & STORAGE (DEBOUNCED)
  // ==========================================================================
  function saveSettings(patch = {}) {
    Object.assign(state, patch);
    const toSave = {
      engine: state.engine,
      voice: state.voice,
      rate: state.rate,
      pitch: state.pitch,
      volume: state.volume,
      isMuted: state.isMuted,
      theme: state.theme,
      font: state.font,
      fontSize: state.fontSize,
      lineHeight: state.lineHeight,
      pageWidth: state.pageWidth,
      textAlign: state.textAlign,
      autoScroll: state.autoScroll,
      autoNext: state.autoNext,
      autoPreloadNext: state.autoPreloadNext,
      dropCap: state.dropCap
    };
    try { localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(toSave)); } catch {}
  }

  function saveReadingProgress(chapIdx, paraIdx) {
    if (typeof chapIdx !== 'number' || chapIdx < 0 || typeof paraIdx !== 'number' || paraIdx < 0) return;
    state.progressMap[chapIdx] = paraIdx;
    
    clearTimeout(state.saveProgressTimer);
    state.saveProgressTimer = setTimeout(() => {
      const toSave = {
        lastVolume: state.volumeId,
        lastChapter: chapIdx,
        chapters: state.progressMap
      };
      try { localStorage.setItem(STORAGE_PROGRESS, JSON.stringify(toSave)); } catch {}
      updateOverallProgress();
      updateChapterListProgress(chapIdx);
      renderQuickChapterChips();
    }, 250);
  }

  function saveBookmarksToStorage() {
    try { localStorage.setItem(STORAGE_BOOKMARKS, JSON.stringify(state.bookmarks)); } catch {}
    renderBookmarksList();
    updateBookmarkBadge();
  }

  // ==========================================================================
  // 3. TOASTS, STATUS & BADGES
  // ==========================================================================
  function showToast(message, duration = 2500) {
    const container = $('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      toast.style.transition = 'all 0.22s ease';
      setTimeout(() => toast.remove(), 240);
    }, duration);
  }

  function setStatusState(newState, message = '') {
    state.statusState = newState;
    const msgEl = $('statusMessage');
    const textEl = $('engineStatusText');
    const dot = $('engineStatusBadge')?.querySelector('.status-dot');
    
    if (dot) {
      dot.className = 'status-dot';
      if (newState === 'ERROR') dot.classList.add('error');
      else if (newState === 'PLAYING') dot.classList.add('playing');
      else if (state.engine === 'webspeech') dot.classList.add('warning');
    }

    if (textEl) {
      if (state.engine === 'edge') {
        const vName = state.voice.includes('NamMinh') ? 'Nam Minh' : 'Hoài My';
        textEl.textContent = `Edge AI: ${vName}`;
      } else if (state.engine === 'webspeech') {
        textEl.textContent = `WebSpeech: ${state.voice || 'Mặc định'}`;
      } else {
        textEl.textContent = 'Chrome Voice';
      }
    }

    if (msgEl && message) {
      msgEl.textContent = message;
    }
  }

  // ==========================================================================
  // 4. THEME & TYPOGRAPHY APPLIERS
  // ==========================================================================
  function applyTheme(themeName) {
    state.theme = themeName;
    document.documentElement.setAttribute('data-theme', themeName);
    document.body.className = `theme-${themeName}${state.isZenMode ? ' zen-mode' : ''}`;
    
    const label = $('themeNameLabel');
    const swatch = document.querySelector('.current-theme-swatch');
    const names = {
      'deep-night': 'Đêm OLED',
      'obsidian': 'Obsidian',
      'warm-paper': 'Giấy Ấm',
      'sepia': 'Sepia',
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

    // Update theme-color meta for mobile browser chrome
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      const metaColors = {
        'deep-night': '#070709',
        'obsidian': '#0b1120',
        'warm-paper': '#f8f4ec',
        'sepia': '#f2ebd9',
        'white': '#ffffff'
      };
      themeMeta.content = metaColors[themeName] || '#070709';
    }

    $$('#settingsThemeSwatches .swatch-card').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === themeName);
    });
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
  // 5. VOLUME SWITCHING & DATA BINDING
  // ==========================================================================
  function switchVolume(volId) {
    if (!window.VOLUMES || !window.VOLUMES[volId]) return;
    stopPlayback();
    
    state.volumeId = volId;
    window.ACTIVE_VOLUME_ID = volId;
    window.CHAPTERS = window.VOLUMES[volId].chapters;
    
    const volData = window.VOLUMES[volId];
    state.chapterIndex = 0;
    state.paragraphIndex = -1;
    
    const volBadge = $('appVolumeBadge');
    if (volBadge) volBadge.textContent = volData.id.toUpperCase();
    
    const pickerLabel = $('volumePickerLabel');
    if (pickerLabel) pickerLabel.textContent = volData.id === 'vol10' ? 'Tập 10' : 'Tập 9';
    
    const cardTitle = $('volCardTitle');
    if (cardTitle) cardTitle.textContent = volData.title;
    
    const countInfo = getVolumeCountBreakdown(volId);
    const cardSub = $('volCardSub');
    if (cardSub) cardSub.textContent = countInfo.text;
    
    const badgeCount = $('chapterBadgeCount');
    if (badgeCount) badgeCount.textContent = `(${countInfo.total})`;
    
    const cardCover = $('volCardCover');
    if (cardCover && volData.cover) cardCover.src = volData.cover;
    
    $$('.volume-opt').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.volume === volId);
    });
    
    saveReadingProgress(0, 0);
    
    renderChapterList();
    renderQuickChapterChips();
    loadChapter(0, true);
    
    showToast(`Đã chuyển sang ${volData.title}`);
  }

  // ==========================================================================
  // 6. CHAPTER RENDERING & READING SPY
  // ==========================================================================
  function loadChapter(index, forceScrollTop = false) {
    const volData = getActiveVolumeData();
    const currentChapters = volData.chapters || [];
    
    if (index < 0 || index >= currentChapters.length) return;
    
    stopPlayback();
    state.chapterIndex = index;
    state.preloadedUrls = {};
    state.audioPreloadPromises = {};
    
    const chapter = currentChapters[index];
    setStatusState('LOADING_BOOK', 'Đang nạp chương…');
    
    const numLabel = $('chapterNumberLabel');
    if (numLabel) numLabel.textContent = `PHẦN ${(index + 1).toString().padStart(2, '0')}`;
    
    const titleEl = $('chapterTitle');
    if (titleEl) titleEl.textContent = chapter.title || `Chương ${index + 1}`;
    
    const statsSkeleton = $('chapterStatsSkeleton');
    const statsText = $('chapterStatsRealText');
    if (statsSkeleton) statsSkeleton.style.display = 'none';
    if (statsText) {
      statsText.style.display = 'inline';
      statsText.textContent = `${(chapter.wordCount || 0).toLocaleString()} từ · ~${chapter.estMinutes || 1} phút đọc`;
    }
    
    const totalParas = chapter.blocks ? chapter.blocks.filter(b => b.type === 'p').length : 0;
    const progressEl = $('chapterParagraphProgress');
    if (progressEl) progressEl.textContent = `${totalParas} đoạn`;
    
    const prevTop = $('prevChapterBtnTop');
    const nextTop = $('nextChapterBtnTop');
    if (prevTop) prevTop.disabled = index === 0;
    if (nextTop) nextTop.disabled = index === currentChapters.length - 1;
    
    const prevBottom = $('prevChapterBtnBottom');
    const nextBottom = $('nextChapterBtnBottom');
    const prevTitle = $('prevChapterTitleLabel');
    const nextTitle = $('nextChapterTitleLabel');
    
    if (prevBottom) {
      prevBottom.disabled = index === 0;
      if (prevTitle) prevTitle.textContent = index > 0 ? currentChapters[index - 1].title : 'Không có';
    }
    if (nextBottom) {
      nextBottom.disabled = index === currentChapters.length - 1;
      if (nextTitle) nextTitle.textContent = index < currentChapters.length - 1 ? currentChapters[index + 1].title : 'Không có';
    }
    
    const contentEl = $('content');
    if (!contentEl) return;
    contentEl.innerHTML = '';
    
    let pIdx = 0;
    (chapter.blocks || []).forEach((block, bIdx) => {
      if (block.type === 'p') {
        const p = document.createElement('p');
        p.id = `para-${pIdx}`;
        p.dataset.index = pIdx;
        if (pIdx === 0) p.classList.add('first-paragraph');
        if (block.align === 'center') p.classList.add('text-center');
        
        if (Array.isArray(block.runs) && block.runs.length > 0) {
          block.runs.forEach(r => {
            const span = document.createElement('span');
            span.textContent = r.text;
            if (r.bold) span.style.fontWeight = '700';
            if (r.italic) span.style.fontStyle = 'italic';
            p.appendChild(span);
          });
        } else {
          p.textContent = block.text;
        }
        
        const bBtn = document.createElement('button');
        bBtn.className = 'para-bookmark-btn mobile-touch-target';
        bBtn.innerHTML = '🔖';
        bBtn.title = 'Đánh dấu đoạn này';
        bBtn.setAttribute('aria-label', `Đánh dấu đoạn ${pIdx + 1}`);
        bBtn.onclick = (e) => {
          e.stopPropagation();
          toggleBookmark(state.volumeId, state.chapterIndex, p.dataset.index, p.textContent);
        };
        
        if (isParagraphBookmarked(state.volumeId, state.chapterIndex, pIdx)) {
          bBtn.classList.add('bookmarked');
        }
        
        p.appendChild(bBtn);
        
        p.onclick = () => {
          playParagraph(Number(p.dataset.index));
        };
        
        contentEl.appendChild(p);
        pIdx++;
      } else if (block.type === 'image') {
        const wrap = document.createElement('div');
        wrap.className = 'story-illustration-wrap';
        const img = document.createElement('img');
        img.src = block.src;
        img.alt = 'Tranh minh họa nhân vật';
        img.loading = 'lazy';
        img.onclick = () => openLightbox(block.src, chapter.title);
        wrap.appendChild(img);
        contentEl.appendChild(wrap);
      } else if (block.type === 'divider') {
        const div = document.createElement('div');
        div.className = 'scene-divider';
        div.textContent = '✧ ₊ ✦ ₊ ✧';
        contentEl.appendChild(div);
      }
    });
    
    highlightActiveChapterInTOC(index);
    updateQuickChapterActive(index);
    
    const savedPara = state.progressMap[index] ?? 0;
    state.paragraphIndex = savedPara;
    updatePlayerStatusUI();
    
    if (forceScrollTop) {
      $('readerArea')?.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (savedPara > 0) {
      setTimeout(() => {
        const targetP = $(`para-${savedPara}`);
        if (targetP) {
          targetP.scrollIntoView({ block: 'center', behavior: 'smooth' });
          targetP.classList.add('resume-target');
          setTimeout(() => targetP.classList.remove('resume-target'), 2000);
        }
      }, 150);
    }
    
    updateMediaSessionMetadata();
    setStatusState('READY', 'Sẵn sàng đọc');
  }

  // ==========================================================================
  // 7. REDESIGNED TTS PLAYBACK CONTROLLER & SPAM PROTECTION
  // ==========================================================================
  async function playParagraph(pIdx) {
    const volData = getActiveVolumeData();
    const currentChapters = volData.chapters || [];
    const chapter = currentChapters[state.chapterIndex];
    if (!chapter) return;
    
    const pEls = $$('#content p');
    if (pIdx < 0 || pIdx >= pEls.length) {
      if (pIdx >= pEls.length && state.autoNext && state.chapterIndex < currentChapters.length - 1) {
        showToast('Đang chuyển sang chương kế tiếp…');
        setTimeout(() => {
          loadChapter(state.chapterIndex + 1);
          playParagraph(0);
        }, 600);
      } else {
        stopPlayback();
      }
      return;
    }
    
    state.token++;
    const currentToken = state.token;
    state.paragraphIndex = pIdx;
    state.isPlaying = true;
    state.isPaused = false;
    state.isLoadingAudio = true;
    
    pEls.forEach(el => el.classList.remove('reading-active'));
    const activeEl = $(`para-${pIdx}`);
    if (activeEl) {
      activeEl.classList.add('reading-active');
      if (state.autoScroll) {
        activeEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
    
    saveReadingProgress(state.chapterIndex, pIdx);
    updatePlayerStatusUI();
    updatePlayPauseButtonUI(true, true);
    requestScreenWakeLock();
    updateMediaSessionMetadata();
    setStatusState('PLAYING', `Đang đọc đoạn ${pIdx + 1}`);
    
    const textToRead = activeEl ? activeEl.textContent.replace(/🔖/g, '').trim() : '';
    if (!textToRead) {
      playParagraph(pIdx + 1);
      return;
    }
    
    if (state.engine === 'edge') {
      playEdgeTTS(textToRead, pIdx, currentToken);
    } else if (state.engine === 'webspeech') {
      playWebSpeechTTS(textToRead, pIdx, currentToken);
    } else {
      playChromeExtTTS(textToRead, pIdx, currentToken);
    }
    
    if (state.autoPreloadNext) {
      preloadNextParagraphs(pIdx, 5);
    }
  }

  async function playEdgeTTS(text, pIdx, token) {
    stopCurrentAudio();
    
    const audio = state.masterAudio;
    audio.playbackRate = state.rate;
    audio.volume = state.isMuted ? 0 : state.volume;
    
    const rateStr = `${state.rate >= 1 ? '+' : ''}${Math.round((state.rate - 1) * 100)}%`;
    const pitchStr = `${state.pitch >= 1 ? '+' : ''}${Math.round((state.pitch - 1) * 50)}Hz`;
    const cacheKey = `${state.volumeId}_ch${state.chapterIndex}_p${pIdx}_${state.voice}_${rateStr}_${pitchStr}`;

    // 1. Check in-memory preloaded URL
    if (state.preloadedUrls[pIdx]) {
      audio.src = state.preloadedUrls[pIdx];
      audio.play().catch(e => console.warn('Audio play error:', e));
      updatePlayPauseButtonUI(true, false);
      setupAudioEvents(audio, pIdx, token);
      return;
    }

    // 2. Check IndexedDB cached blob
    const cachedBlob = await getCachedAudio(cacheKey);
    if (cachedBlob) {
      const blobUrl = URL.createObjectURL(cachedBlob);
      state.preloadedUrls[pIdx] = blobUrl;
      audio.src = blobUrl;
      audio.play().catch(e => console.warn('Audio play cached error:', e));
      updatePlayPauseButtonUI(true, false);
      setupAudioEvents(audio, pIdx, token);
      return;
    }
    
    // 3. Synthesize via Server endpoint
    const url = `${serverBaseUrl}/api/tts?voice=${encodeURIComponent(state.voice)}&rate=${encodeURIComponent(rateStr)}&pitch=${encodeURIComponent(pitchStr)}&text=${encodeURIComponent(text)}`;
    
    fetch(url)
      .then(async res => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const blob = await res.blob();
        setCachedAudio(cacheKey, blob);
        const blobUrl = URL.createObjectURL(blob);
        state.preloadedUrls[pIdx] = blobUrl;
        if (state.token !== token) return;
        audio.src = blobUrl;
        audio.play().catch(err => {
          console.warn('Audio play error, falling back to WebSpeech:', err);
          playWebSpeechTTS(text, pIdx, token);
        });
        updatePlayPauseButtonUI(true, false);
        setupAudioEvents(audio, pIdx, token);
      })
      .catch(err => {
        console.warn('Edge TTS network error, falling back to WebSpeech:', err);
        playWebSpeechTTS(text, pIdx, token);
      });
  }

  function setupAudioEvents(audio, pIdx, token) {
    audio.onended = () => {
      if (state.token !== token) return;
      playParagraph(pIdx + 1);
    };
    audio.ontimeupdate = () => {
      if (state.token !== token) return;
      const cur = audio.currentTime || 0;
      const dur = audio.duration || 1;
      const fill = $('timelineFill');
      if (fill) fill.style.width = `${(cur / dur) * 100}%`;
      const curLabel = $('playerCurrentTime');
      if (curLabel) curLabel.textContent = formatTime(cur);
      const totalLabel = $('playerTotalTime');
      if (totalLabel && isFinite(dur)) totalLabel.textContent = formatTime(dur);
    };
    audio.onerror = (e) => {
      if (state.token !== token) return;
      console.warn('Audio element error, trying next segment:', e);
      playParagraph(pIdx + 1);
    };
  }

  function playWebSpeechTTS(text, pIdx, token) {
    if (!('speechSynthesis' in window)) {
      showToast('Trình duyệt không hỗ trợ Web Speech API');
      stopPlayback();
      return;
    }
    window.speechSynthesis.cancel();
    
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = state.rate;
    utter.pitch = state.pitch;
    utter.volume = state.isMuted ? 0 : state.volume;
    utter.lang = 'vi-VN';
    
    utter.onstart = () => {
      if (state.token !== token) return;
      updatePlayPauseButtonUI(true, false);
    };
    utter.onend = () => {
      if (state.token !== token) return;
      playParagraph(pIdx + 1);
    };
    utter.onerror = (err) => {
      if (state.token !== token) return;
      console.warn('WebSpeech error:', err);
      playParagraph(pIdx + 1);
    };
    
    window.speechSynthesis.speak(utter);
  }

  function playChromeExtTTS(text, pIdx, token) {
    playWebSpeechTTS(text, pIdx, token);
  }

  function preloadNextParagraphs(currentIdx, count = 5) {
    const pEls = $$('#content p');
    for (let i = 1; i <= count; i++) {
      const targetIdx = currentIdx + i;
      if (targetIdx >= pEls.length) break;
      if (state.preloadedUrls[targetIdx] || state.audioPreloadPromises[targetIdx]) continue;
      
      const p = $(`para-${targetIdx}`);
      if (!p) continue;
      const text = p.textContent.replace(/🔖/g, '').trim();
      if (!text) continue;
      
      const rateStr = `${state.rate >= 1 ? '+' : ''}${Math.round((state.rate - 1) * 100)}%`;
      const pitchStr = `${state.pitch >= 1 ? '+' : ''}${Math.round((state.pitch - 1) * 50)}Hz`;
      const cacheKey = `${state.volumeId}_ch${state.chapterIndex}_p${targetIdx}_${state.voice}_${rateStr}_${pitchStr}`;
      const url = `${serverBaseUrl}/api/tts?voice=${encodeURIComponent(state.voice)}&rate=${encodeURIComponent(rateStr)}&pitch=${encodeURIComponent(pitchStr)}&text=${encodeURIComponent(text)}`;
      
      state.audioPreloadPromises[targetIdx] = fetch(url)
        .then(r => r.blob())
        .then(blob => {
          setCachedAudio(cacheKey, blob);
          state.preloadedUrls[targetIdx] = URL.createObjectURL(blob);
        })
        .catch(err => console.warn(`Preload error for para ${targetIdx}:`, err));
    }
  }

  function stopCurrentAudio() {
    if (state.masterAudio) {
      state.masterAudio.pause();
      state.masterAudio.removeAttribute('src');
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  function togglePlayPause() {
    if (state.isPlaying && !state.isPaused) {
      state.isPaused = true;
      if (state.masterAudio) state.masterAudio.pause();
      if ('speechSynthesis' in window) window.speechSynthesis.pause();
      updatePlayPauseButtonUI(false, false);
      releaseScreenWakeLock();
      setStatusState('PAUSED', 'Tạm dừng đọc');
    } else if (state.isPaused) {
      state.isPaused = false;
      if (state.masterAudio && state.masterAudio.src) {
        state.masterAudio.play();
      } else {
        playParagraph(state.paragraphIndex >= 0 ? state.paragraphIndex : 0);
      }
      updatePlayPauseButtonUI(true, false);
      requestScreenWakeLock();
      setStatusState('PLAYING', `Đang đọc đoạn ${state.paragraphIndex + 1}`);
    } else {
      const targetPara = state.paragraphIndex >= 0 ? state.paragraphIndex : (state.progressMap[state.chapterIndex] ?? 0);
      playParagraph(targetPara);
    }
  }

  function stopPlayback() {
    state.token++;
    state.isPlaying = false;
    state.isPaused = false;
    state.isLoadingAudio = false;
    stopCurrentAudio();
    updatePlayPauseButtonUI(false, false);
    releaseScreenWakeLock();
    $$('#content p').forEach(el => el.classList.remove('reading-active'));
    setStatusState('READY', 'Sẵn sàng đọc');
  }

  function updatePlayPauseButtonUI(isPlaying, isLoading = false) {
    const playSvg = $('playIconSvg');
    const pauseSvg = $('pauseIconSvg');
    const spinner = $('playerLoadingSpinner');
    const pulseDot = $('playerPulseDot');
    
    if (spinner) spinner.hidden = !isLoading;
    if (playSvg) playSvg.hidden = isPlaying || isLoading;
    if (pauseSvg) pauseSvg.hidden = !isPlaying || isLoading;
    if (pulseDot) pulseDot.classList.toggle('playing', isPlaying);
  }

  function updatePlayerStatusUI() {
    const volData = getActiveVolumeData();
    const chapter = volData.chapters ? volData.chapters[state.chapterIndex] : null;
    const totalParas = chapter && chapter.blocks ? chapter.blocks.filter(b => b.type === 'p').length : 0;
    const curP = state.paragraphIndex >= 0 ? state.paragraphIndex + 1 : 0;
    
    const chLabel = $('playerChapterLabel');
    if (chLabel) chLabel.textContent = `Chương ${state.chapterIndex + 1}`;
    
    const posBadge = $('playerSegmentPos');
    if (posBadge) posBadge.textContent = `Đoạn ${curP}/${totalParas}`;
    
    const snippetEl = $('nowReadingSnippet');
    if (snippetEl) {
      const activeP = $(`para-${state.paragraphIndex}`);
      if (activeP) {
        snippetEl.textContent = activeP.textContent.replace(/🔖/g, '').trim();
      } else {
        snippetEl.textContent = 'Chọn một đoạn hoặc bấm Phát để bắt đầu đọc';
      }
    }
    
    const speedBadge = $('playerSpeedBadge');
    if (speedBadge) speedBadge.textContent = `${state.rate.toFixed(2)}×`;
    const speedPill = $('speedPillLabel');
    if (speedPill) speedPill.textContent = `${state.rate.toFixed(2)}×`;
    
    const voiceBadge = $('playerVoiceBadge');
    if (voiceBadge) voiceBadge.textContent = state.voice.includes('NamMinh') ? 'Nam Minh' : 'Hoài My';
    
    const timerBadge = $('playerTimerBadge');
    const timerPill = $('playerTimerLabel');
    const formattedTimer = state.sleepTimer.mode !== 'off'
      ? `${formatTime(state.sleepTimer.remainingSeconds)}`
      : 'Tắt';
    
    if (timerBadge) timerBadge.textContent = `🌙 ${formattedTimer}`;
    if (timerPill) timerPill.textContent = formattedTimer;
    
    const engineBadge = $('playerEngineBadge');
    if (engineBadge) {
      engineBadge.textContent = state.engine === 'edge' ? 'Edge AI' : (state.engine === 'webspeech' ? 'WebSpeech' : 'Chrome');
    }
    
    const chProgBadge = $('chapterParagraphProgress');
    if (chProgBadge) chProgBadge.textContent = `${curP}/${totalParas} đoạn`;
    
    const chProgBar = $('chapterProgressBar');
    if (chProgBar && totalParas > 0) {
      chProgBar.style.width = `${(curP / totalParas) * 100}%`;
    }

    updateDynamicLayoutMeasurements();
  }

  function formatTime(secs) {
    if (!isFinite(secs) || secs <= 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ==========================================================================
  // 8. MEDIA SESSION API & SCREEN WAKE LOCK
  // ==========================================================================
  function updateMediaSessionMetadata() {
    if (!('mediaSession' in navigator)) return;
    const volData = getActiveVolumeData();
    const currentChapters = volData.chapters || [];
    const chapter = currentChapters[state.chapterIndex];
    if (!chapter) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: chapter.title || `Chương ${state.chapterIndex + 1}`,
        artist: 'Thiên Sứ Nhà Bên',
        album: volData.title || 'Audiobook Tiếng Việt',
        artwork: [
          { src: volData.cover || 'images/cover.jpg', sizes: '512x512', type: 'image/jpeg' }
        ]
      });
    } catch {}
  }

  function initMediaSessionActionHandlers() {
    if (!('mediaSession' in navigator)) return;
    const actions = [
      ['play', () => togglePlayPause()],
      ['pause', () => togglePlayPause()],
      ['previoustrack', () => playParagraph(Math.max(0, state.paragraphIndex - 1))],
      ['nexttrack', () => playParagraph(state.paragraphIndex + 1)],
      ['seekbackward', () => {
        if (state.masterAudio?.currentTime) state.masterAudio.currentTime = Math.max(0, state.masterAudio.currentTime - 5);
      }],
      ['seekforward', () => {
        if (state.masterAudio?.currentTime) state.masterAudio.currentTime = Math.min(state.masterAudio.duration || 999, state.masterAudio.currentTime + 5);
      }]
    ];

    actions.forEach(([action, handler]) => {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch {}
    });
  }

  async function requestScreenWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        state.wakeLock = await navigator.wakeLock.request('screen');
      } catch {}
    }
  }

  function releaseScreenWakeLock() {
    if (state.wakeLock) {
      try {
        state.wakeLock.release();
        state.wakeLock = null;
      } catch {}
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.isPlaying && !state.isPaused) {
      requestScreenWakeLock();
    }
  });

  // ==========================================================================
  // 9. SIDEBAR, TOC & QUICK JUMP
  // ==========================================================================
  function renderChapterList() {
    const listEl = $('chapterList');
    if (!listEl) return;
    listEl.innerHTML = '';
    
    const volData = getActiveVolumeData();
    const chaptersList = volData.chapters || [];
    
    chaptersList.forEach((ch, idx) => {
      const btn = document.createElement('button');
      btn.className = `chapter-item-btn mobile-touch-target${idx === state.chapterIndex ? ' active' : ''}`;
      btn.dataset.index = idx;
      
      const totalP = ch.blocks ? ch.blocks.filter(b => b.type === 'p').length : 0;
      const savedP = state.progressMap[idx] ?? 0;
      const pct = totalP > 0 ? Math.round((savedP / totalP) * 100) : 0;
      
      btn.innerHTML = `
        <div class="chapter-item-header">
          <span>Phần ${(idx + 1).toString().padStart(2, '0')}</span>
          <span>${pct}%</span>
        </div>
        <div class="chapter-item-title">${ch.title}</div>
        <div class="chapter-mini-progress">
          <div class="chapter-mini-fill" style="width: ${pct}%"></div>
        </div>
      `;
      
      btn.onclick = () => {
        loadChapter(idx, true);
        if (window.innerWidth <= 900) closeSidebar();
      };
      
      listEl.appendChild(btn);
    });
  }

  function highlightActiveChapterInTOC(idx) {
    $$('.chapter-item-btn').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.index) === idx);
    });
  }

  function updateChapterListProgress(idx) {
    const btn = document.querySelector(`.chapter-item-btn[data-index="${idx}"]`);
    if (!btn) return;
    const volData = getActiveVolumeData();
    const ch = volData.chapters ? volData.chapters[idx] : null;
    if (!ch) return;
    const totalP = ch.blocks ? ch.blocks.filter(b => b.type === 'p').length : 0;
    const savedP = state.progressMap[idx] ?? 0;
    const pct = totalP > 0 ? Math.round((savedP / totalP) * 100) : 0;
    
    const fill = btn.querySelector('.chapter-mini-fill');
    if (fill) fill.style.width = `${pct}%`;
    const pctLabel = btn.querySelector('.chapter-item-header span:last-child');
    if (pctLabel) pctLabel.textContent = `${pct}%`;
  }

  function renderQuickChapterChips() {
    const container = $('quickChapterChips');
    if (!container) return;
    container.innerHTML = '';
    
    const volData = getActiveVolumeData();
    const chaptersList = volData.chapters || [];
    
    chaptersList.forEach((ch, idx) => {
      const chip = document.createElement('button');
      chip.className = `chip-btn mobile-touch-target${idx === state.chapterIndex ? ' active' : ''}`;
      chip.textContent = `${idx + 1}`;
      chip.title = ch.title;
      chip.dataset.index = idx;
      chip.onclick = () => loadChapter(idx, true);
      container.appendChild(chip);
    });
  }

  function updateQuickChapterActive(idx) {
    $$('.chip-btn').forEach(chip => {
      chip.classList.toggle('active', Number(chip.dataset.index) === idx);
    });
  }

  function updateOverallProgress() {
    const volData = getActiveVolumeData();
    const chaptersList = volData.chapters || [];
    let totalP = 0;
    let readP = 0;
    
    chaptersList.forEach((ch, idx) => {
      const pCount = ch.blocks ? ch.blocks.filter(b => b.type === 'p').length : 0;
      totalP += pCount;
      readP += Math.min(state.progressMap[idx] ?? 0, pCount);
    });
    
    const overallPct = totalP > 0 ? Math.round((readP / totalP) * 100) : 0;
    const bar = $('overallProgressBar');
    const label = $('overallProgressPercent');
    const globalBar = $('globalProgressFill');
    
    if (bar) bar.style.width = `${overallPct}%`;
    if (label) label.textContent = `${overallPct}%`;
    if (globalBar) globalBar.style.width = `${overallPct}%`;
  }

  // ==========================================================================
  // 10. BOOKMARKS MANAGER
  // ==========================================================================
  function toggleBookmark(volId, chapIdx, pIdx, text) {
    const numPIdx = Number(pIdx);
    const existingIndex = state.bookmarks.findIndex(
      b => b.volId === volId && b.chapIdx === chapIdx && b.pIdx === numPIdx
    );
    
    if (existingIndex >= 0) {
      state.bookmarks.splice(existingIndex, 1);
      showToast('Đã xóa đánh dấu');
    } else {
      state.bookmarks.unshift({
        volId,
        chapIdx,
        pIdx: numPIdx,
        text: text.slice(0, 120),
        time: Date.now()
      });
      showToast('Đã lưu đánh dấu trang 🔖');
    }
    
    saveBookmarksToStorage();
    
    const bBtn = $(`para-${numPIdx}`)?.querySelector('.para-bookmark-btn');
    if (bBtn) {
      bBtn.classList.toggle('bookmarked', existingIndex < 0);
    }
  }

  function isParagraphBookmarked(volId, chapIdx, pIdx) {
    return state.bookmarks.some(b => b.volId === volId && b.chapIdx === chapIdx && b.pIdx === pIdx);
  }

  function renderBookmarksList() {
    const listEl = $('bookmarkList');
    const emptyEl = $('bookmarkEmpty');
    if (!listEl || !emptyEl) return;
    
    listEl.innerHTML = '';
    const bookmarks = state.bookmarks;
    
    if (bookmarks.length === 0) {
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;
    
    bookmarks.forEach((b, idx) => {
      const card = document.createElement('div');
      card.className = 'bookmark-card mobile-touch-target';
      card.innerHTML = `
        <div class="bookmark-card-meta">
          <span>Tập ${b.volId === 'vol10' ? '10' : '9'} · Chương ${b.chapIdx + 1} · Đoạn ${b.pIdx + 1}</span>
          <button class="bookmark-remove-btn" title="Xóa đánh dấu">&times;</button>
        </div>
        <div class="bookmark-snippet">${b.text}</div>
      `;
      
      card.onclick = (e) => {
        if (e.target.classList.contains('bookmark-remove-btn')) {
          e.stopPropagation();
          state.bookmarks.splice(idx, 1);
          saveBookmarksToStorage();
          showToast('Đã xóa đánh dấu');
          return;
        }
        
        if (state.volumeId !== b.volId) {
          switchVolume(b.volId);
        }
        if (state.chapterIndex !== b.chapIdx) {
          loadChapter(b.chapIdx);
        }
        setTimeout(() => {
          playParagraph(b.pIdx);
        }, 200);
        if (window.innerWidth <= 900) closeSidebar();
      };
      
      listEl.appendChild(card);
    });
  }

  function updateBookmarkBadge() {
    const badge = $('bookmarkCountBadge');
    if (badge) badge.textContent = state.bookmarks.length;
  }

  // ==========================================================================
  // 11. QUICK SPEED SHEET & SLEEP TIMER
  // ==========================================================================
  function openSpeedSheet() {
    $$('.speed-opt-btn').forEach(btn => {
      const s = Number(btn.dataset.speed);
      btn.classList.toggle('active', Math.abs(s - state.rate) < 0.04);
    });
    openModal('quickSpeedModal');
  }

  function setRate(r) {
    state.rate = Math.max(0.5, Math.min(2.5, r));
    const rateInput = $('rate');
    if (rateInput) rateInput.value = state.rate;
    const rateVal = $('rateValue');
    if (rateVal) rateVal.textContent = `${state.rate.toFixed(2)}×`;
    const speedPill = $('speedPillLabel');
    if (speedPill) speedPill.textContent = `${state.rate.toFixed(2)}×`;
    const speedBadge = $('playerSpeedBadge');
    if (speedBadge) speedBadge.textContent = `${state.rate.toFixed(2)}×`;
    
    $$('.slider-ticks span').forEach(span => {
      span.classList.toggle('active', Math.abs(Number(span.dataset.val) - state.rate) < 0.05);
    });
    
    $$('.speed-opt-btn').forEach(btn => {
      btn.classList.toggle('active', Math.abs(Number(btn.dataset.speed) - state.rate) < 0.04);
    });
    
    if (state.masterAudio) state.masterAudio.playbackRate = state.rate;
    saveSettings({ rate: state.rate });
    updatePlayerStatusUI();
  }

  function setSleepTimer(minutes) {
    clearInterval(state.sleepTimer.intervalId);
    
    if (minutes === 0 || minutes === 'off') {
      state.sleepTimer.mode = 'off';
      state.sleepTimer.minutes = 0;
      state.sleepTimer.remainingSeconds = 0;
      $('activeTimerNotice')?.setAttribute('hidden', '');
      showToast('Đã tắt hẹn giờ');
    } else if (minutes === 'chapter') {
      state.sleepTimer.mode = 'chapter';
      state.sleepTimer.minutes = 0;
      $('activeTimerNotice')?.setAttribute('hidden', '');
      showToast('Hẹn giờ: Dừng khi hết chương');
    } else {
      const mins = Number(minutes);
      state.sleepTimer.mode = 'minutes';
      state.sleepTimer.minutes = mins;
      state.sleepTimer.remainingSeconds = mins * 60;
      
      const notice = $('activeTimerNotice');
      if (notice) notice.removeAttribute('hidden');
      updateTimerDisplay();
      
      state.sleepTimer.intervalId = setInterval(() => {
        state.sleepTimer.remainingSeconds--;
        updateTimerDisplay();
        
        if (state.sleepTimer.remainingSeconds <= 0) {
          clearInterval(state.sleepTimer.intervalId);
          state.sleepTimer.mode = 'off';
          stopPlayback();
          showToast('🌙 Hết giờ đọc, đã tự động dừng');
          $('activeTimerNotice')?.setAttribute('hidden', '');
          updatePlayerStatusUI();
        }
      }, 1000);
      
      showToast(`Đã bật hẹn giờ: ${mins} phút`);
    }
    
    updateTimerActiveButtons();
    updatePlayerStatusUI();
  }

  function updateTimerDisplay() {
    const el = $('timerCountdownDisplay');
    if (el) el.textContent = formatTime(state.sleepTimer.remainingSeconds);
    const badge = $('playerTimerBadge');
    if (badge) badge.textContent = `🌙 ${formatTime(state.sleepTimer.remainingSeconds)}`;
    const pillLabel = $('playerTimerLabel');
    if (pillLabel) pillLabel.textContent = formatTime(state.sleepTimer.remainingSeconds);
  }

  function updateTimerActiveButtons() {
    $$('.timer-opt-btn').forEach(btn => {
      const m = btn.dataset.minutes;
      if (state.sleepTimer.mode === 'off' && m === '0') btn.classList.add('active');
      else if (state.sleepTimer.mode === 'chapter' && m === 'chapter') btn.classList.add('active');
      else if (state.sleepTimer.mode === 'minutes' && Number(m) === state.sleepTimer.minutes) btn.classList.add('active');
      else btn.classList.remove('active');
    });
  }

  function extendSleepTimer(extraMinutes = 10) {
    if (state.sleepTimer.mode === 'minutes') {
      state.sleepTimer.remainingSeconds += extraMinutes * 60;
      state.sleepTimer.minutes += extraMinutes;
      updateTimerDisplay();
      showToast(`Đã cộng thêm ${extraMinutes} phút hẹn giờ`);
    } else {
      setSleepTimer(extraMinutes);
    }
  }

  // ==========================================================================
  // 12. MODALS, LIGHTBOX & BOTTOM SHEETS
  // ==========================================================================
  function openLightbox(src, caption = '') {
    const modal = $('lightboxModal');
    const img = $('lightboxImg');
    const cap = $('lightboxCaption');
    if (!modal || !img) return;
    img.src = src;
    if (cap) cap.textContent = caption;
    lockBodyScroll();
    modal.removeAttribute('hidden');
  }

  function closeLightbox() {
    const modal = $('lightboxModal');
    if (modal) modal.setAttribute('hidden', '');
    unlockBodyScroll();
  }

  function openColorGallery() {
    const volData = getActiveVolumeData();
    const grid = $('colorGalleryGrid');
    const modal = $('colorGalleryModal');
    const title = $('galleryModalTitle');
    if (!grid || !modal) return;
    
    grid.innerHTML = '';
    if (title) title.textContent = `🎨 Tranh Màu Đầu Sách · ${volData.title}`;
    
    const gallery = volData.colorGallery || [];
    gallery.forEach(imgSrc => {
      const item = document.createElement('div');
      item.className = 'gallery-item';
      const img = document.createElement('img');
      img.src = imgSrc;
      img.alt = 'Tranh màu đầu sách';
      img.loading = 'lazy';
      img.onclick = () => {
        closeModal('colorGalleryModal');
        openLightbox(imgSrc, 'Tranh màu đầu sách');
      };
      item.appendChild(img);
      grid.appendChild(item);
    });
    
    openModal('colorGalleryModal');
  }

  function openQuickJumpModal() {
    const volData = getActiveVolumeData();
    const grid = $('quickJumpGrid');
    const modal = $('quickJumpModal');
    if (!grid || !modal) return;
    
    grid.innerHTML = '';
    const chaptersList = volData.chapters || [];
    
    chaptersList.forEach((ch, idx) => {
      const item = document.createElement('button');
      item.className = `quick-jump-item mobile-touch-target${idx === state.chapterIndex ? ' active' : ''}`;
      item.innerHTML = `
        <div class="chapter-item-header">
          <span>Phần ${(idx + 1).toString().padStart(2, '0')}</span>
          <span>${ch.wordCount || 0} từ</span>
        </div>
        <div class="chapter-item-title">${ch.title}</div>
      `;
      item.onclick = () => {
        closeModal('quickJumpModal');
        loadChapter(idx, true);
      };
      grid.appendChild(item);
    });
    
    openModal('quickJumpModal');
  }

  function openModal(modalId) {
    const modal = $(modalId);
    if (modal) {
      modal.removeAttribute('hidden');
      lockBodyScroll();
    }
  }

  function closeModal(modalId) {
    const modal = $(modalId);
    if (modal) {
      modal.setAttribute('hidden', '');
      unlockBodyScroll();
    }
  }

  function showConfirmDialog(title, message, onConfirm) {
    const modal = $('confirmModal');
    const titleEl = $('confirmModalTitle');
    const msgEl = $('confirmModalMessage');
    const okBtn = $('confirmOkBtn');
    const cancelBtn = $('confirmCancelBtn');
    
    if (!modal) return;
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    
    openModal('confirmModal');
    
    const cleanup = () => {
      closeModal('confirmModal');
      okBtn.onclick = null;
      cancelBtn.onclick = null;
    };
    
    okBtn.onclick = () => {
      cleanup();
      onConfirm();
    };
    cancelBtn.onclick = cleanup;
  }

  // ==========================================================================
  // 13. SIDEBAR & ZEN FOCUS MODE
  // ==========================================================================
  function toggleSidebar() {
    const sidebar = $('sidebar');
    const backdrop = $('sidebarBackdrop');
    if (!sidebar) return;
    
    if (window.innerWidth <= 900) {
      const isOpen = sidebar.classList.toggle('open');
      if (backdrop) backdrop.hidden = !isOpen;
      if (isOpen) lockBodyScroll();
      else unlockBodyScroll();
    } else {
      state.isSidebarOpen = !state.isSidebarOpen;
      sidebar.style.display = state.isSidebarOpen ? 'flex' : 'none';
    }
  }

  function closeSidebar() {
    const sidebar = $('sidebar');
    const backdrop = $('sidebarBackdrop');
    if (sidebar) sidebar.classList.remove('open');
    if (backdrop) backdrop.hidden = true;
    unlockBodyScroll();
  }

  function toggleZenMode() {
    state.isZenMode = !state.isZenMode;
    document.body.classList.toggle('zen-mode', state.isZenMode);
    showToast(state.isZenMode ? 'Bật chế độ Focus (F để thoát)' : 'Đã tắt chế độ Focus');
  }

  // ==========================================================================
  // 14. VOICES LOADER & INITIALIZER
  // ==========================================================================
  async function loadVoices() {
    const select = $('voiceSelect');
    if (!select) return;
    
    select.innerHTML = '';
    
    try {
      const res = await fetch(`${serverBaseUrl}/api/voices`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        state.edgeVoices = await res.json();
      }
    } catch {
      state.edgeVoices = [
        { ShortName: 'vi-VN-HoaiMyNeural', FriendlyName: 'Microsoft Hoài My (Nữ - Tự nhiên)' },
        { ShortName: 'vi-VN-NamMinhNeural', FriendlyName: 'Microsoft Nam Minh (Nam - Tự nhiên)' }
      ];
    }
    
    if (state.edgeVoices.length > 0) {
      const optGroup = document.createElement('optgroup');
      optGroup.label = '⚡ Microsoft Neural AI (Chuẩn Studio)';
      state.edgeVoices.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.ShortName;
        opt.textContent = v.FriendlyName || v.ShortName;
        if (v.ShortName === state.voice) opt.selected = true;
        optGroup.appendChild(opt);
      });
      select.appendChild(optGroup);
    }
    
    if ('speechSynthesis' in window) {
      const populateWeb = () => {
        const voices = window.speechSynthesis.getVoices();
        const viVoices = voices.filter(v => v.lang.startsWith('vi') || /vietnam/i.test(v.name));
        if (viVoices.length > 0) {
          const optGroup = document.createElement('optgroup');
          optGroup.label = '🌐 Web Speech Trình Duyệt';
          viVoices.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.voiceURI || v.name;
            opt.textContent = v.name;
            optGroup.appendChild(opt);
          });
          select.appendChild(optGroup);
        }
      };
      populateWeb();
      window.speechSynthesis.onvoiceschanged = populateWeb;
    }
    
    setStatusState('READY', 'Sẵn sàng đọc');
  }

  // ==========================================================================
  // 15. EVENT LISTENERS & WIRING
  // ==========================================================================
  function initEventListeners() {
    $('sidebarToggleBtn')?.addEventListener('click', toggleSidebar);
    $('sidebarCloseBtn')?.addEventListener('click', closeSidebar);
    $('sidebarBackdrop')?.addEventListener('click', closeSidebar);
    $('zenModeBtn')?.addEventListener('click', toggleZenMode);
    
    // Auto-collapse header on scroll
    const readerArea = $('readerArea');
    if (readerArea) {
      readerArea.addEventListener('scroll', () => {
        const curY = readerArea.scrollTop;
        const topbar = $('topbar');
        if (!topbar) return;
        
        if (curY > 50 && curY > state.lastScrollY + 12) {
          topbar.classList.add('topbar-hidden');
        } else if (curY < state.lastScrollY - 8 || curY <= 25) {
          topbar.classList.remove('topbar-hidden');
        }
        state.lastScrollY = curY;
      }, { passive: true });
    }
    
    // Volume Picker Dropdown
    const volPickerBtn = $('volumePickerBtn');
    const volDropdown = $('volumeDropdownMenu');
    if (volPickerBtn && volDropdown) {
      volPickerBtn.onclick = (e) => {
        e.stopPropagation();
        const isHidden = volDropdown.hasAttribute('hidden');
        if (isHidden) volDropdown.removeAttribute('hidden');
        else volDropdown.setAttribute('hidden', '');
      };
      $$('.volume-opt').forEach(btn => {
        btn.onclick = () => {
          volDropdown.setAttribute('hidden', '');
          switchVolume(btn.dataset.volume);
        };
      });
    }

    // Theme Picker Dropdown & Settings Swatches
    const themeBtn = $('themePickerBtn');
    const themeMenu = $('themeDropdownMenu');
    if (themeBtn && themeMenu) {
      themeBtn.onclick = (e) => {
        e.stopPropagation();
        const isHidden = themeMenu.hasAttribute('hidden');
        if (isHidden) themeMenu.removeAttribute('hidden');
        else themeMenu.setAttribute('hidden', '');
      };
      $$('.theme-opt').forEach(btn => {
        btn.onclick = () => {
          themeMenu.setAttribute('hidden', '');
          applyTheme(btn.dataset.theme);
          saveSettings({ theme: btn.dataset.theme });
        };
      });
    }
    
    $$('#settingsThemeSwatches .swatch-card').forEach(btn => {
      btn.onclick = () => {
        applyTheme(btn.dataset.theme);
        saveSettings({ theme: btn.dataset.theme });
      };
    });

    document.addEventListener('click', () => {
      volDropdown?.setAttribute('hidden', '');
      themeMenu?.setAttribute('hidden', '');
      $('volumePopover')?.setAttribute('hidden', '');
    });

    // Sidebar Tabs
    $$('.tab-btn').forEach(btn => {
      btn.onclick = () => {
        $$('.tab-btn').forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        $$('.tab-pane').forEach(p => p.setAttribute('hidden', ''));
        
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        const targetPane = $(`tabContent${btn.dataset.tab.charAt(0).toUpperCase() + btn.dataset.tab.slice(1)}`);
        if (targetPane) targetPane.removeAttribute('hidden');
      };
    });

    // Speed Picker Triggers & Sheet
    $('playerSpeedBadgeBtn')?.addEventListener('click', openSpeedSheet);
    $('speedPillBtn')?.addEventListener('click', openSpeedSheet);
    $('quickSpeedCloseBtn')?.addEventListener('click', () => closeModal('quickSpeedModal'));
    $('quickSpeedBackdrop')?.addEventListener('click', () => closeModal('quickSpeedModal'));
    $$('.speed-opt-btn').forEach(btn => {
      btn.onclick = () => {
        setRate(Number(btn.dataset.speed));
        closeModal('quickSpeedModal');
      };
    });

    // Sleep Timer Triggers & Sheet
    $('playerTimerBadgeBtn')?.addEventListener('click', () => openModal('sleepTimerModal'));
    $('playerTimerPillBtn')?.addEventListener('click', () => openModal('sleepTimerModal'));
    $('sleepTimerBtn')?.addEventListener('click', () => openModal('sleepTimerModal'));
    $('sleepTimerCloseBtn')?.addEventListener('click', () => closeModal('sleepTimerModal'));
    $('sleepTimerBackdrop')?.addEventListener('click', () => closeModal('sleepTimerModal'));
    $('extendTimerBtn')?.addEventListener('click', () => extendSleepTimer(10));
    
    $$('.timer-opt-btn').forEach(btn => {
      btn.onclick = () => {
        const val = btn.dataset.minutes;
        setSleepTimer(val === 'chapter' ? 'chapter' : Number(val));
        closeModal('sleepTimerModal');
      };
    });

    // Gallery, Jump, Bookmarks, Settings Triggers
    $('colorGalleryBtn')?.addEventListener('click', openColorGallery);
    $('colorGalleryCloseBtn')?.addEventListener('click', () => closeModal('colorGalleryModal'));
    $('colorGalleryBackdrop')?.addEventListener('click', () => closeModal('colorGalleryModal'));

    $('quickChapterModalBtn')?.addEventListener('click', openQuickJumpModal);
    $('quickJumpCloseBtn')?.addEventListener('click', () => closeModal('quickJumpModal'));
    $('quickJumpBackdrop')?.addEventListener('click', () => closeModal('quickJumpModal'));

    $('bookmarksBtn')?.addEventListener('click', () => {
      if (window.innerWidth <= 900) toggleSidebar();
      $('tabBookmarksBtn')?.click();
    });
    $('clearAllBookmarksBtn')?.addEventListener('click', () => {
      showConfirmDialog('Xóa tất cả đánh dấu?', 'Thao tác này sẽ xóa toàn bộ các đoạn bạn đã lưu.', () => {
        state.bookmarks = [];
        saveBookmarksToStorage();
        showToast('Đã xóa tất cả đánh dấu');
      });
    });

    $('settingsToggleBtn')?.addEventListener('click', () => {
      if (window.innerWidth <= 900) toggleSidebar();
      $('tabSettingsBtn')?.click();
    });

    $('shortcutsCloseBtn')?.addEventListener('click', () => closeModal('shortcutsModal'));
    $('shortcutsBackdrop')?.addEventListener('click', () => closeModal('shortcutsModal'));

    $('lightboxCloseBtn')?.addEventListener('click', closeLightbox);
    $('lightboxBackdrop')?.addEventListener('click', closeLightbox);

    $('prevChapterBtnTop')?.addEventListener('click', () => loadChapter(state.chapterIndex - 1, true));
    $('nextChapterBtnTop')?.addEventListener('click', () => loadChapter(state.chapterIndex + 1, true));
    $('prevChapterBtnBottom')?.addEventListener('click', () => loadChapter(state.chapterIndex - 1, true));
    $('nextChapterBtnBottom')?.addEventListener('click', () => loadChapter(state.chapterIndex + 1, true));

    // Player Playback Controls
    $('playerPlayPauseBtn')?.addEventListener('click', togglePlayPause);
    $('playerPrevParaBtn')?.addEventListener('click', () => {
      playParagraph(Math.max(0, state.paragraphIndex - 1));
    });
    $('playerNextParaBtn')?.addEventListener('click', () => {
      playParagraph(state.paragraphIndex + 1);
    });
    $('playerStopBtn')?.addEventListener('click', stopPlayback);
    
    $('playerSeekBackBtn')?.addEventListener('click', () => {
      if (state.masterAudio && state.masterAudio.currentTime) {
        state.masterAudio.currentTime = Math.max(0, state.masterAudio.currentTime - 5);
      } else {
        playParagraph(Math.max(0, state.paragraphIndex - 1));
      }
    });
    $('playerSeekFwdBtn')?.addEventListener('click', () => {
      if (state.masterAudio && state.masterAudio.currentTime) {
        state.masterAudio.currentTime = Math.min(state.masterAudio.duration || 999, state.masterAudio.currentTime + 5);
      } else {
        playParagraph(state.paragraphIndex + 1);
      }
    });

    // Timeline Seeking
    $('timelineBar')?.addEventListener('click', (e) => {
      const bar = $('timelineBar');
      if (!bar || !state.masterAudio || !state.masterAudio.duration) return;
      const rect = bar.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      state.masterAudio.currentTime = pct * state.masterAudio.duration;
    });

    // Volume Popover
    const volMuteBtn = $('volumeMuteBtn');
    const volPopover = $('volumePopover');
    const quickVolSlider = $('quickVolumeSlider');
    
    if (volMuteBtn && volPopover) {
      volMuteBtn.onclick = (e) => {
        e.stopPropagation();
        const isHidden = volPopover.hasAttribute('hidden');
        if (isHidden) volPopover.removeAttribute('hidden');
        else volPopover.setAttribute('hidden', '');
      };
    }
    if (quickVolSlider) {
      quickVolSlider.oninput = (e) => {
        const val = Number(e.target.value);
        setVolume(val);
      };
    }

    // Settings Sliders
    const rateInput = $('rate');
    if (rateInput) {
      rateInput.oninput = (e) => setRate(Number(e.target.value));
    }
    $$('.slider-ticks span').forEach(span => {
      span.onclick = () => setRate(Number(span.dataset.val));
    });

    const pitchInput = $('pitch');
    if (pitchInput) {
      pitchInput.oninput = (e) => {
        state.pitch = Number(e.target.value);
        $('pitchValue').textContent = state.pitch.toFixed(2);
        saveSettings({ pitch: state.pitch });
      };
    }

    const volumeInput = $('volume');
    if (volumeInput) {
      volumeInput.oninput = (e) => setVolume(Number(e.target.value));
    }

    const fontSizeInput = $('fontSize');
    if (fontSizeInput) {
      fontSizeInput.oninput = (e) => {
        state.fontSize = Number(e.target.value);
        $('fontSizeValue').textContent = `${state.fontSize}px`;
        applyTypography();
        saveSettings({ fontSize: state.fontSize });
      };
    }

    const fontSelect = $('fontSelect');
    if (fontSelect) {
      fontSelect.onchange = (e) => {
        state.font = e.target.value;
        applyTypography();
        saveSettings({ font: state.font });
      };
    }

    const lineHeightInput = $('lineHeight');
    if (lineHeightInput) {
      lineHeightInput.oninput = (e) => {
        state.lineHeight = Number(e.target.value);
        $('lineHeightValue').textContent = state.lineHeight.toFixed(2);
        applyTypography();
        saveSettings({ lineHeight: state.lineHeight });
      };
    }

    const pageWidthInput = $('pageWidth');
    if (pageWidthInput) {
      pageWidthInput.oninput = (e) => {
        state.pageWidth = Number(e.target.value);
        $('pageWidthValue').textContent = `${state.pageWidth}px`;
        applyTypography();
        saveSettings({ pageWidth: state.pageWidth });
      };
    }

    $$('[data-align]').forEach(btn => {
      btn.onclick = () => {
        state.textAlign = btn.dataset.align;
        applyTypography();
        saveSettings({ textAlign: state.textAlign });
      };
    });

    $('voiceSelect')?.addEventListener('change', (e) => {
      state.voice = e.target.value;
      saveSettings({ voice: state.voice });
      updatePlayerStatusUI();
    });

    $$('input[name="ttsEngine"]').forEach(radio => {
      radio.onchange = (e) => {
        state.engine = e.target.value;
        saveSettings({ engine: state.engine });
        setStatusState('READY');
        updatePlayerStatusUI();
      };
    });

    $('voiceTestBtn')?.addEventListener('click', () => {
      stopPlayback();
      const testText = 'Xin chào, đây là giọng đọc thử nghiệm của Thiên Sứ Nhà Bên.';
      if (state.engine === 'edge') {
        playEdgeTTS(testText, -99, 9999);
      } else {
        playWebSpeechTTS(testText, -99, 9999);
      }
    });

    $('autoScrollCheck')?.addEventListener('change', (e) => {
      state.autoScroll = e.target.checked;
      saveSettings({ autoScroll: state.autoScroll });
    });
    $('autoNextCheck')?.addEventListener('change', (e) => {
      state.autoNext = e.target.checked;
      saveSettings({ autoNext: state.autoNext });
    });
    $('autoPreloadNextCheck')?.addEventListener('change', (e) => {
      state.autoPreloadNext = e.target.checked;
      saveSettings({ autoPreloadNext: state.autoPreloadNext });
    });
    $('dropCapCheck')?.addEventListener('change', (e) => {
      state.dropCap = e.target.checked;
      applyTypography();
      saveSettings({ dropCap: state.dropCap });
    });

    $('clearCacheBtn')?.addEventListener('click', async () => {
      state.preloadedUrls = {};
      state.audioPreloadPromises = {};
      await clearIndexedDBCache();
      updateCacheStatsUI();
      showToast('Đã dọn dẹp sạch sẽ bộ nhớ đệm');
    });

    $('exportDataBtn')?.addEventListener('click', () => {
      const backup = {
        settings: JSON.parse(localStorage.getItem(STORAGE_SETTINGS) || '{}'),
        progress: JSON.parse(localStorage.getItem(STORAGE_PROGRESS) || '{}'),
        bookmarks: JSON.parse(localStorage.getItem(STORAGE_BOOKMARKS) || '[]'),
        timestamp: new Date().toISOString()
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `otonari-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      showToast('Đã xuất file sao lưu JSON');
    });

    $('importDataBtn')?.addEventListener('click', () => {
      $('importFileInput')?.click();
    });

    $('importFileInput')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (data.settings) localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(data.settings));
          if (data.progress) localStorage.setItem(STORAGE_PROGRESS, JSON.stringify(data.progress));
          if (data.bookmarks) localStorage.setItem(STORAGE_BOOKMARKS, JSON.stringify(data.bookmarks));
          showToast('Nhập sao lưu thành công! Đang tải lại…');
          setTimeout(() => location.reload(), 800);
        } catch {
          showToast('File JSON không hợp lệ');
        }
      };
      reader.readAsText(file);
    });

    $('resetProgressBtn')?.addEventListener('click', () => {
      showConfirmDialog('Xóa tiến độ đọc?', 'Toàn bộ lịch sử vị trí đọc các chương sẽ được đưa về đầu.', () => {
        state.progressMap = {};
        localStorage.removeItem(STORAGE_PROGRESS);
        updateOverallProgress();
        renderChapterList();
        renderQuickChapterChips();
        showToast('Đã xóa toàn bộ tiến độ đọc');
      });
    });

    $('resetSettingsBtn')?.addEventListener('click', () => {
      showConfirmDialog('Khôi phục cài đặt gốc?', 'Toàn bộ phông chữ, giao diện, âm lượng và tốc độ sẽ về mặc định.', () => {
        localStorage.removeItem(STORAGE_SETTINGS);
        showToast('Đã khôi phục cài đặt gốc! Đang tải lại…');
        setTimeout(() => location.reload(), 600);
      });
    });

    const searchInput = $('chapterSearch');
    const searchClear = $('searchClearBtn');
    if (searchInput) {
      searchInput.oninput = (e) => {
        const q = e.target.value.toLowerCase().trim();
        if (searchClear) searchClear.hidden = !q;
        let matchCount = 0;
        $$('.chapter-item-btn').forEach(btn => {
          const title = btn.querySelector('.chapter-item-title')?.textContent.toLowerCase() || '';
          const match = title.includes(q);
          btn.style.display = match ? 'flex' : 'none';
          if (match) matchCount++;
        });
        $('chapterEmpty').hidden = matchCount > 0;
      };
      searchClear?.addEventListener('click', () => {
        searchInput.value = '';
        searchClear.hidden = true;
        $$('.chapter-item-btn').forEach(btn => btn.style.display = 'flex');
        $('chapterEmpty').hidden = true;
      });
    }

    $('quickSearchBtn')?.addEventListener('click', () => {
      if (window.innerWidth <= 900) toggleSidebar();
      $('tabChaptersBtn')?.click();
      setTimeout(() => $('chapterSearch')?.focus(), 200);
    });

    window.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (e.key === 'Escape') document.activeElement.blur();
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.key === 'ArrowLeft') {
        if (e.shiftKey) {
          e.preventDefault();
          loadChapter(state.chapterIndex - 1, true);
        } else {
          e.preventDefault();
          playParagraph(Math.max(0, state.paragraphIndex - 1));
        }
      } else if (e.key === 'ArrowRight') {
        if (e.shiftKey) {
          e.preventDefault();
          loadChapter(state.chapterIndex + 1, true);
        } else {
          e.preventDefault();
          playParagraph(state.paragraphIndex + 1);
        }
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleZenMode();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        toggleSidebar();
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        const activeP = $(`para-${state.paragraphIndex}`);
        if (activeP) {
          toggleBookmark(state.volumeId, state.chapterIndex, state.paragraphIndex, activeP.textContent);
        }
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        if (window.innerWidth <= 900) toggleSidebar();
        $('tabSettingsBtn')?.click();
      } else if (e.key === '?') {
        e.preventDefault();
        openModal('shortcutsModal');
      } else if (e.key === 'Escape') {
        if (!$('lightboxModal')?.hasAttribute('hidden')) closeLightbox();
        else if (!$('confirmModal')?.hasAttribute('hidden')) closeModal('confirmModal');
        else if (!$('shortcutsModal')?.hasAttribute('hidden')) closeModal('shortcutsModal');
        else if (!$('quickSpeedModal')?.hasAttribute('hidden')) closeModal('quickSpeedModal');
        else if (!$('quickJumpModal')?.hasAttribute('hidden')) closeModal('quickJumpModal');
        else if (!$('colorGalleryModal')?.hasAttribute('hidden')) closeModal('colorGalleryModal');
        else if (!$('sleepTimerModal')?.hasAttribute('hidden')) closeModal('sleepTimerModal');
        else if (state.isZenMode) toggleZenMode();
        else if (window.innerWidth <= 900 && $('sidebar')?.classList.contains('open')) closeSidebar();
        else stopPlayback();
      }
    });

    window.addEventListener('resize', updateDynamicLayoutMeasurements);
    window.addEventListener('orientationchange', () => {
      setTimeout(updateDynamicLayoutMeasurements, 150);
    });
  }

  function setVolume(v) {
    state.volume = Math.max(0, Math.min(1, v));
    state.isMuted = state.volume === 0;
    
    const volInput = $('volume');
    if (volInput) volInput.value = state.volume;
    const quickVol = $('quickVolumeSlider');
    if (quickVol) quickVol.value = state.volume;
    
    const pct = Math.round(state.volume * 100);
    const volVal = $('volumeValue');
    if (volVal) volVal.textContent = `${pct}%`;
    const quickPct = $('quickVolumePercent');
    if (quickPct) quickPct.textContent = `${pct}%`;
    
    const highSvg = $('volumeHighSvg');
    const muteSvg = $('volumeMuteSvg');
    if (highSvg) highSvg.hidden = state.isMuted;
    if (muteSvg) muteSvg.hidden = !state.isMuted;
    
    if (state.masterAudio) state.masterAudio.volume = state.volume;
    saveSettings({ volume: state.volume, isMuted: state.isMuted });
  }

  // ==========================================================================
  // 16. APP BOOTSTRAP & SERVICE WORKER
  // ==========================================================================
  async function initApp() {
    console.info(`[Web Reader Pro] Initializing mobile-first app (${APP_BUILD})...`);
    
    updateDynamicLayoutMeasurements();
    applyTheme(state.theme);
    applyTypography();
    
    if ($('rate')) $('rate').value = state.rate;
    if ($('rateValue')) $('rateValue').textContent = `${state.rate.toFixed(2)}×`;
    if ($('pitch')) $('pitch').value = state.pitch;
    if ($('pitchValue')) $('pitchValue').textContent = state.pitch.toFixed(2);
    if ($('volume')) $('volume').value = state.volume;
    if ($('volumeValue')) $('volumeValue').textContent = `${Math.round(state.volume * 100)}%`;
    if ($('fontSize')) $('fontSize').value = state.fontSize;
    if ($('fontSizeValue')) $('fontSizeValue').textContent = `${state.fontSize}px`;
    if ($('lineHeight')) $('lineHeight').value = state.lineHeight;
    if ($('lineHeightValue')) $('lineHeightValue').textContent = state.lineHeight.toFixed(2);
    if ($('pageWidth')) $('pageWidth').value = state.pageWidth;
    if ($('pageWidthValue')) $('pageWidthValue').textContent = `${state.pageWidth}px`;
    if ($('fontSelect')) $('fontSelect').value = state.font;
    if ($('autoScrollCheck')) $('autoScrollCheck').checked = state.autoScroll;
    if ($('autoNextCheck')) $('autoNextCheck').checked = state.autoNext;
    if ($('autoPreloadNextCheck')) $('autoPreloadNextCheck').checked = state.autoPreloadNext;
    if ($('dropCapCheck')) $('dropCapCheck').checked = state.dropCap;
    
    $$('input[name="ttsEngine"]').forEach(r => {
      r.checked = r.value === state.engine;
    });

    initEventListeners();
    initMediaSessionActionHandlers();
    renderBookmarksList();
    updateBookmarkBadge();
    updateCacheStatsUI();
    
    const volData = getActiveVolumeData();
    const countInfo = getVolumeCountBreakdown(volData.id);
    
    if ($('appVolumeBadge')) $('appVolumeBadge').textContent = volData.id.toUpperCase();
    if ($('volumePickerLabel')) $('volumePickerLabel').textContent = volData.id === 'vol10' ? 'Tập 10' : 'Tập 9';
    if ($('volCardTitle')) $('volCardTitle').textContent = volData.title;
    if ($('volCardSub')) $('volCardSub').textContent = countInfo.text;
    if ($('chapterBadgeCount')) $('chapterBadgeCount').textContent = `(${countInfo.total})`;
    if ($('volCardCover') && volData.cover) $('volCardCover').src = volData.cover;
    
    renderChapterList();
    renderQuickChapterChips();
    updateOverallProgress();
    
    loadChapter(state.chapterIndex, false);
    
    await loadVoices();

    // Register PWA Service Worker gracefully
    if ('serviceWorker' in navigator && isHttp) {
      navigator.serviceWorker.register('./sw.js').catch(err => {
        console.warn('PWA ServiceWorker register notice:', err.message);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})();
