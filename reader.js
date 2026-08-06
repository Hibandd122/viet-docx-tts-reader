(() => {
  const chapters = window.CHAPTERS || [];
  const readerConfig = window.READER_CONFIG || {};
  const readerTitle = readerConfig.title || 'DOCX Reader';
  const storageKey = String(readerConfig.storageKey || readerTitle).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'docx-reader';
  const progressStorageKey = `docx-reader:${storageKey}:progress`;
  const settingsStorageKey = `docx-reader:${storageKey}:settings`;
  const playbackStorageKey = `docx-reader:${storageKey}:active-playback`;
  const tabId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const $ = id => document.getElementById(id);
  document.title = `${readerTitle} · Trình đọc tiếng Việt`;
  document.querySelector('h1')?.replaceChildren(`${readerTitle} · Tiếng Việt`);
  const savedProgress = (() => { try { return JSON.parse(localStorage.getItem(progressStorageKey) || '{}'); } catch { return {}; } })();
  const savedSettings = (() => { try { return JSON.parse(localStorage.getItem(settingsStorageKey) || '{}'); } catch { return {}; } })();
  const chapterProgress = { ...(savedProgress.chapters || {}) };
  const progressFor = index => Math.max(0, Number(chapterProgress[index] ?? (Number(savedProgress.chapter) === index ? savedProgress.paragraph : 0)) || 0);
  const saveProgress = (chapter, paragraph, allowRewind = false) => {
    const requested = Math.max(0, Number(paragraph) || 0);
    let stored = 0;
    try {
      const latest = JSON.parse(localStorage.getItem(progressStorageKey) || '{}');
      stored = Number(latest.chapters?.[chapter] ?? (Number(latest.chapter) === chapter ? latest.paragraph : 0)) || 0;
    } catch { /* Dùng bản tiến độ trong bộ nhớ nếu localStorage tạm thời lỗi. */ }
    const current = Math.max(0, Number(chapterProgress[chapter]) || 0, stored);
    chapterProgress[chapter] = allowRewind ? requested : Math.max(current, requested);
    localStorage.setItem(progressStorageKey, JSON.stringify({ chapter, paragraph:chapterProgress[chapter], chapters:chapterProgress }));
  };
  const settings = { ...savedSettings };
  const state = { index: 0, utterance: null, paused: false, edgeFailed: false, speakToken: 0, requestId: 0, voice: null, voices: [], paragraph: -1, chunkIndex: 0, chunkParagraph: -1, chunks: [], volume: Number(savedSettings.volume ?? 1), pitch: Number(savedSettings.pitch ?? 1), autoScroll: savedSettings.autoScroll !== false, autoNext: savedSettings.autoNext === true, resumeChapter: Number(savedProgress.chapter) || 0, resumeParagraph: progressFor(Number(savedProgress.chapter) || 0) };
  window.addEventListener('storage', event => {
    if (event.key !== progressStorageKey || !event.newValue) return;
    try {
      const incoming = JSON.parse(event.newValue);
      Object.entries(incoming.chapters || {}).forEach(([chapter, paragraph]) => {
        chapterProgress[chapter] = Math.max(Number(chapterProgress[chapter]) || 0, Number(paragraph) || 0);
      });
      if (!state.utterance && Number(incoming.chapter) === state.index) {
        state.resumeChapter = state.index;
        state.resumeParagraph = progressFor(state.index);
        updateListProgress(state.index);
        nowReading(`Sẵn sàng tiếp tục từ đoạn ${state.resumeParagraph + 1}/${chapters[state.index]?.paragraphs?.length || 0}`);
      }
    } catch { /* Bỏ qua dữ liệu tiến độ hỏng từ tab khác. */ }
  });
  const directExtensionTts = typeof chrome !== 'undefined' && !!chrome.runtime?.id;
  const bridgeExtensionId = 'eflagfifekpkhoiaeciaobdaiabpppbd';
  const webExtensionMessaging = !directExtensionTts && typeof chrome !== 'undefined' && typeof chrome.runtime?.sendMessage === 'function';
  const appleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const localWebSpeech = /^(localhost|127\.0\.0\.1|::1)$/i.test(location.hostname);
  const extensionTts = !appleMobile && !localWebSpeech && (directExtensionTts || webExtensionMessaging);
  const edgeTtsEnabled = !extensionTts && !localWebSpeech;
  const edgeTtsEndpoint = readerConfig.edgeTtsEndpoint || '/api/tts';
  const edgeChapterEndpoint = readerConfig.edgeChapterEndpoint || '/api/chapter';
  const edgeTtsVoices = [
    { voiceName:'vi-VN-HoaiMyNeural', lang:'vi-VN', label:'Edge TTS · Hoài My (nữ)' },
    { voiceName:'vi-VN-NamMinhNeural', lang:'vi-VN', label:'Edge TTS · Nam Minh (nam)' }
  ];
  let edgeAudioContext = null;
  let edgePrefetch = null;
  let bridgeRequestId = 0;
  const sendTtsMessage = (message, callback = () => {}) => {
    if (directExtensionTts) { chrome.runtime.sendMessage(message, callback); return; }
    if (webExtensionMessaging) {
      try {
        chrome.runtime.sendMessage(bridgeExtensionId, message, response => {
          const error = chrome.runtime.lastError;
          callback(error ? { ok:false, error:error.message } : response);
        });
        return;
      } catch (error) { callback({ ok:false, error:error.message }); return; }
    }
    const id = ++bridgeRequestId;
    const handler = event => {
      if (event.source !== window || event.data?.source !== 'viet-docx-tts-web' || event.data?.direction !== 'from-extension' || event.data?.id !== id) return;
      window.removeEventListener('message', handler);
      callback(event.data.response);
    };
    window.addEventListener('message', handler);
    window.postMessage({ source:'viet-docx-tts-web', direction:'to-extension', id, message }, '*');
    setTimeout(() => { window.removeEventListener('message', handler); callback({ ok:false, error:'Chưa cài cầu nối ChromeOS TTS' }); }, 5000);
  };
  let testingVoice = false;
  let resetConfirmTimer = 0;
  setTimeout(() => {
    const button = $('resetProgress');
    if (!button) return;
    button.onclick = () => {
      if (button.dataset.confirm !== 'yes') {
        button.dataset.confirm = 'yes';
        button.textContent = '⚠ Bấm lần nữa để xóa';
        status('Bấm lại để xác nhận xóa vị trí đọc');
        clearTimeout(resetConfirmTimer);
        resetConfirmTimer = setTimeout(() => { button.dataset.confirm = ''; button.textContent = '↺ Xóa vị trí đã lưu'; }, 3500);
        return;
      }
      button.dataset.confirm = '';
      button.textContent = '↺ Xóa vị trí đã lưu';
      clearTimeout(resetConfirmTimer);
      chapters.forEach((_, index) => { chapterProgress[index] = 0; });
      localStorage.setItem(progressStorageKey, JSON.stringify({ chapter:state.index, paragraph:0, chapters:chapterProgress }));
      state.resumeChapter = state.index; state.resumeParagraph = 0;
      stop(); renderList(); select(state.index, true);
      status('Đã xóa vị trí đọc đã lưu');
    };
  }, 0);
  const handleVoiceTestEvent = message => { if (!testingVoice || message.type !== 'TTS_EVENT') return; if (message.event.type === 'end') { testingVoice = false; status('Đã thử xong voice'); } if (message.event.type === 'error') { testingVoice = false; status(message.event.errorMessage || 'TTS lỗi khi thử voice'); } };
  if (directExtensionTts) chrome.runtime.onMessage.addListener(handleVoiceTestEvent);
  if (!directExtensionTts) window.addEventListener('message', event => { if (event.data?.source === 'viet-docx-tts-web' && event.data?.event) handleVoiceTestEvent(event.data.event); });
  const status = text => { $('status').textContent = text; };
  const updateProgress = (index, total) => { const progress = $('chapterProgress'); if (progress) progress.style.width = `${total ? Math.max(0, Math.min(100, ((index + 1) / total) * 100)) : 0}%`; };
  const saveSettings = patch => { Object.assign(settings, { volume:state.volume, pitch:state.pitch, ...patch }); localStorage.setItem(settingsStorageKey, JSON.stringify(settings)); };
  const applyBackground = theme => { document.body.classList.toggle('light', theme === 'paper'); document.body.classList.toggle('white', theme === 'white'); $('background').value = theme; };
  const applyAlignment = align => { const value = align === 'justify' ? 'justify' : 'left'; document.documentElement.style.setProperty('--reader-align', value); document.querySelectorAll('[data-align]').forEach(button => button.classList.toggle('active', button.dataset.align === value)); };
  const nowReading = text => { $('nowReading').textContent = text; };
  const syncControls = () => { const active = Boolean(state.utterance); $('pauseButton').disabled = !active || state.paused; $('resumeButton').disabled = active && !state.paused; $('stopButton').disabled = !active; $('playButton').disabled = active; };
  const getSpeech = () => window.speechSynthesis && window.SpeechSynthesisUtterance ? window.speechSynthesis : null;
  const escapeHtml = text => text.replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
  const voiceLabel = voice => voice?.label || voice?.voiceName || voice?.name || voice?.lang || 'voice tiếng Việt';
  const fontName = name => ({ Montserrat:'Montserrat Local', QuattrocentoSans:'Quattrocento Local', Arial:'Arial', 'Arial Unicode MS':'Arial Unicode MS', Cambria:'Cambria', Georgia:'Georgia', 'Liberation Serif':'Liberation Serif' }[name] || 'Montserrat Local');
  const renderRuns = block => block.runs?.length ? block.runs.map(run => `<span style="font-family:'${fontName(run.font)}';${run.bold ? 'font-weight:700;' : ''}${run.italic ? 'font-style:italic;' : ''}">${escapeHtml(run.text)}</span>`).join('') : escapeHtml(block.text);
  const splitForSpeechSafe = (text, maxLength = 900) => {
    const parts = [];
    let rest = text.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '').replace(/\s+/g, ' ').trim();
    const minimumCut = Math.floor(maxLength * 0.45);
    while (rest.length > maxLength) {
      let cut = -1;
      for (const punctuation of ['.', '!', '?', '\u3002', '\uFF01', '\uFF1F']) cut = Math.max(cut, rest.lastIndexOf(punctuation, maxLength));
      if (cut < minimumCut) cut = rest.lastIndexOf(' ', maxLength);
      if (cut < 1) cut = maxLength;
      parts.push(rest.slice(0, cut + 1).trim());
      rest = rest.slice(cut + 1).trim();
    }
    if (rest) parts.push(rest);
    return parts.length ? parts : [''];
  };
  const updateListProgress = index => {
    const button = document.querySelector(`.chapter-link[data-index="${index}"]`);
    const total = paragraphTotal(chapters[index]);
    const saved = Math.min(progressFor(index), Math.max(0, total - 1));
    const progress = saved > 0 ? `${saved + 1}/${total}` : 'chưa đọc';
    const small = button?.querySelector('[data-progress]');
    if (small) small.textContent = `Phần ${index + 1} · ${progress}`;
  };
  const markReading = (index, allowRewind = false) => {
    if (state.utterance?.edgeChapter && index < state.paragraph) return;
    document.querySelectorAll('.content p.reading-now, .content p.resume-point').forEach(p => p.classList.remove('reading-now', 'resume-point'));
    const paragraph = $('paragraph-' + index);
    paragraph?.classList.add('reading-now');
    if (state.autoScroll) paragraph?.scrollIntoView({ block:'center', behavior:'smooth' });
    updateProgress(index, chapters[state.index]?.paragraphs.length || 0);
    state.resumeChapter = state.index; state.resumeParagraph = index;
    saveProgress(state.index, index, allowRewind);
    updateListProgress(state.index);
  };
  const isVoice2 = v => /chrome\s*os\s*(?:vietnamese|ti\u1ebfng\s*vi\u1ec7t)\s*2/i.test(`${v.name || ''} ${v.voiceName || ''}`);
  const isSiriVoice = v => /siri/i.test(`${v.name || ''} ${v.voiceName || ''} ${v.voiceURI || ''}`);
  const findVoice = () => state.voice || (appleMobile && state.voices.find(isSiriVoice)) || state.voices.find(isVoice2) || state.voices[0] || null;
  const loadVoices = async () => {
    if (extensionTts) state.voices = await new Promise(resolve => sendTtsMessage({ type:'GET_VOICES' }, response => resolve(response?.voices || [])));
    else if (edgeTtsEnabled) state.voices = edgeTtsVoices;
    else { const speech = getSpeech(); const voices = speech ? speech.getVoices() : []; state.voices = voices.filter(v => /chrome\s*os\s*(?:vietnamese|ti\u1ebfng\s*vi\u1ec7t)|google\s*(?:vietnamese|ti\u1ebfng\s*vi\u1ec7t)|vietnamese|ti\u1ebfng\s*vi\u1ec7t/i.test(`${v.name || ''} ${v.voiceName || ''}`) || /^(vi|vie)([-_]|$)/i.test(v.lang || '')); }
    $('voice').innerHTML = state.voices.length ? state.voices.map((v, i) => `<option value="${i}">${escapeHtml(v.label || (appleMobile && isSiriVoice(v) ? `Siri · ${v.voiceName || v.name || v.lang}` : (v.voiceName || v.name || v.lang)))}</option>`).join('') : '<option value="">Không tìm thấy voice Việt</option>';
    const voiceHint = $('voiceHint');
    if (voiceHint) {
      if (edgeTtsEnabled) {
        voiceHint.hidden = false;
        voiceHint.textContent = `Đang dùng Edge TTS trực tiếp: ${state.voices.length} voice Việt.`;
      } else if (localWebSpeech) {
        voiceHint.hidden = false;
        voiceHint.textContent = 'Localhost: đang dùng trực tiếp voice ChromeOS của trình duyệt.';
      } else if (extensionTts) {
        voiceHint.hidden = false;
        voiceHint.textContent = state.voices.length ? `Extension Chrome OS: ${state.voices.length} voice Việt khả dụng.` : 'Extension chưa trả về voice Chrome OS.';
      } else if (appleMobile) {
        voiceHint.hidden = false;
        voiceHint.textContent = state.voices.some(isSiriVoice) ? 'iPhone/iPad: đã ưu tiên Siri tiếng Việt của iOS.' : 'iPhone/iPad: Safari chưa trả về voice Siri; đang dùng voice tiếng Việt hệ thống.';
      } else if (state.voices.length <= 1) {
        voiceHint.hidden = false;
        voiceHint.textContent = 'Web Vercel chỉ thấy voice trình duyệt (thường là Linh). Muốn dùng Chrome OS Vietnamese 1–5, hãy mở bản extension Chrome OS.';
      } else {
        voiceHint.hidden = true;
      }
    }
    state.voice = state.voices.find(v => (v.voiceName || v.name || '') === savedSettings.voice) || (edgeTtsEnabled ? state.voices[0] : null) || (appleMobile && state.voices.find(isSiriVoice)) || state.voices.find(isVoice2) || state.voices[0] || null;
    if (state.voice) $('voice').value = String(state.voices.indexOf(state.voice));
  };
  const paragraphTotal = chapter => chapter.paragraphs?.length || chapter.blocks?.filter(block => block.type === 'p').length || 0;
  const renderList = () => {
    $('chapterCount').textContent = `(${chapters.length})`;
    $('chapterList').innerHTML = chapters.map((c, i) => { const total = paragraphTotal(c); const saved = Math.min(progressFor(i), Math.max(0, total - 1)); const progress = saved > 0 ? `${saved + 1}/${total}` : 'chưa đọc'; return `<button class="chapter-link" data-index="${i}" aria-current="false"><small data-progress>Ph\u1ea7n ${i + 1} · ${progress}</small>${c.title}</button>`; }).join('');
    $('chapterList').onclick = event => { const button = event.target.closest('[data-index]'); if (button) select(Number(button.dataset.index)); };
  };
  const filterList = query => {
    const value = query.trim().toLocaleLowerCase('vi');
    let visible = 0;
    document.querySelectorAll('.chapter-link').forEach(button => {
      const matches = !value || button.textContent.toLocaleLowerCase('vi').includes(value);
      button.hidden = !matches;
      if (matches) visible += 1;
    });
    $('chapterEmpty').hidden = visible > 0;
  };
  const audioExport = { recorder:null, source:null, chunks:[], chapter:null, batch:null };
  const exportChunkLimit = 5000;
  const exportSpeech = (paragraphs, start) => {
    let end = start;
    let length = 0;
    while (end < paragraphs.length) {
      const addition = paragraphs[end].trim();
      const nextLength = length ? length + 2 + addition.length : addition.length;
      if (length && nextLength > exportChunkLimit) break;
      length = nextLength;
      end += 1;
    }
    if (end === start) end += 1;
    return { text: paragraphs.slice(start, end).join('\n\n'), end };
  };
  const finishAudioExport = save => {
    const recorder = audioExport.recorder;
    if (!recorder) return;
    const complete = () => {
      const batch = audioExport.batch;
      let keepBatch = Boolean(batch);
      if (save) {
        const blob = new Blob(audioExport.chunks, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size < 1000) {
          keepBatch = false;
          status('Không có âm thanh được thu. Với Extension ChromeOS, hãy bật chia sẻ âm thanh hệ thống hoặc xuất từ localhost.');
        } else {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          const name = String(audioExport.chapter?.title || `Phan-${state.index + 1}`).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
          link.href = url; link.download = `${String(state.index + 1).padStart(3, '0')}-${name || `Phan-${state.index + 1}`}.webm`; link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          status(`Đã lưu audio: ${link.download}`);
        }
      }
      if (!keepBatch) audioExport.source?.getTracks().forEach(track => track.stop());
      audioExport.recorder = null; if (!keepBatch) audioExport.source = null; audioExport.chunks = []; audioExport.chapter = null;
      const button = $('exportAudioButton'); if (button) button.textContent = 'Xuất audio chương này';
      if (!keepBatch) { audioExport.batch = null; const allButton = $('exportAllAudioButton'); if (allButton) allButton.textContent = 'Xuất tất cả audio'; }
      if (keepBatch && batch?.next) setTimeout(batch.next, 450);
    };
    recorder.onstop = complete;
    if (recorder.state === 'inactive') complete(); else recorder.stop();
  };
  const recordAudioChapter = (source, index, batch = null) => {
    select(index, true);
    const stream = new MediaStream(source.getAudioTracks());
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    audioExport.recorder = recorder; audioExport.source = source; audioExport.chunks = []; audioExport.chapter = chapters[index]; audioExport.batch = batch;
    recorder.ondataavailable = event => { if (event.data.size) audioExport.chunks.push(event.data); };
    // Ít sự kiện data hơn giúp batch export nhẹ hơn khi xuất hàng trăm chương.
    recorder.start(1000);
    $('exportAudioButton').textContent = batch ? `Đang xuất ${index + 1}/${chapters.length}` : 'Dừng thu audio';
    state.voice = findVoice(); state.paragraph = 0; state.chunkParagraph = -1; state.exportEndParagraph = 0; speakParagraph();
  };
  const startAudioExport = async () => {
    if (audioExport.recorder) { audioExport.batch = null; finishAudioExport(false); return; }
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === 'undefined') { status('Trình duyệt không hỗ trợ thu audio tab'); return; }
    try {
      status(extensionTts ? 'Trong hộp thoại chia sẻ, hãy bật âm thanh hệ thống để thu đúng voice ChromeOS…' : 'Chọn tab hiện tại và bật chia sẻ âm thanh…');
      const source = await navigator.mediaDevices.getDisplayMedia({ video:true, audio:true, systemAudio:'include', selfBrowserSurface:'include' });
      if (!source.getAudioTracks().length) { source.getTracks().forEach(track => track.stop()); status('Hãy bật Chia sẻ âm thanh tab khi chọn màn hình'); return; }
      recordAudioChapter(source, state.index);
      status('Đang đọc và thu audio chương này…');
    } catch (error) { status(error?.name === 'NotAllowedError' ? 'Bạn chưa cho phép chia sẻ audio tab' : `Không thể thu audio: ${error.message}`); }
  };
  const startAllAudioExport = async () => {
    if (audioExport.recorder || audioExport.batch) { audioExport.batch = null; finishAudioExport(false); return; }
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === 'undefined') { status('Trình duyệt không hỗ trợ thu audio tab'); return; }
    try {
      status(extensionTts ? 'Trong hộp thoại chia sẻ, hãy bật âm thanh hệ thống để thu đúng voice ChromeOS…' : 'Chọn tab hiện tại và bật chia sẻ âm thanh…');
      const source = await navigator.mediaDevices.getDisplayMedia({ video:true, audio:true, systemAudio:'include', selfBrowserSurface:'include' });
      if (!source.getAudioTracks().length) { source.getTracks().forEach(track => track.stop()); status('Hãy bật Chia sẻ âm thanh tab khi chọn màn hình'); return; }
      const batch = { index:0, next:null };
      batch.next = () => {
        const nextIndex = batch.index + 1;
        if (nextIndex >= chapters.length) {
          source.getTracks().forEach(track => track.stop()); audioExport.batch = null;
          const button = $('exportAllAudioButton'); if (button) button.textContent = 'Xuất tất cả audio';
          status(`Đã xuất xong ${chapters.length} file audio`); return;
        }
        batch.index = nextIndex; recordAudioChapter(source, nextIndex, batch);
        status(`Đang xuất audio phần ${nextIndex + 1}/${chapters.length}…`);
      };
      const button = $('exportAllAudioButton'); if (button) button.textContent = 'Dừng xuất audio';
      recordAudioChapter(source, 0, batch);
      status(`Đang xuất audio phần 1/${chapters.length}…`);
    } catch (error) { status(error?.name === 'NotAllowedError' ? 'Bạn chưa cho phép chia sẻ audio tab' : `Không thể thu audio: ${error.message}`); }
  };
  const select = (index, restore = false) => {
    if (!chapters[index]) return;
    stop(); state.index = index;
    if (!restore) { state.resumeChapter = index; state.resumeParagraph = progressFor(index); }
    const chapter = chapters[index];
    updateProgress(-1, chapter.paragraphs?.length || chapter.blocks?.filter(block => block.type === 'p').length || 0);
    $('chapterNumber').textContent = `Ph\u1ea7n ${index + 1}`;
    $('chapterTitle').textContent = chapter.title;
    const blocks = chapter.blocks || (chapter.paragraphs || []).map(text => ({ type:'p', text }));
    chapter.paragraphs = blocks.filter(block => block.type === 'p').map(block => block.text);
    const savedParagraph = progressFor(index);
    updateProgress(savedParagraph > 0 ? savedParagraph : -1, chapter.paragraphs.length);
    let paragraphIndex = 0;
    $('content').innerHTML = blocks.map(block => block.type === 'image' ? `<img src="${encodeURI(block.src)}" alt="\u1ea2nh minh h\u1ecda ch\u01b0\u01a1ng ${index + 1}">` : `<p id="paragraph-${paragraphIndex++}">${renderRuns(block)}</p>`).join('');
    if (savedParagraph > 0) document.querySelector(`#paragraph-${savedParagraph}`)?.classList.add('resume-point');
    if (savedParagraph > 0 && state.autoScroll) {
      const restoreScroll = () => requestAnimationFrame(() => document.querySelector(`#paragraph-${savedParagraph}`)?.scrollIntoView({ block:'center', behavior:'auto' }));
      const images = Array.from(document.querySelectorAll('#content img'));
      const pendingImages = images.filter(image => !image.complete);
      if (pendingImages.length) Promise.all(pendingImages.map(image => new Promise(resolve => { const done = () => resolve(); image.addEventListener('load', done, { once:true }); image.addEventListener('error', done, { once:true }); }))).then(restoreScroll);
      else restoreScroll();
    }
    $('content').onclick = event => { const paragraph = event.target.closest('p[id^="paragraph-"]'); if (!paragraph) return; const selected = Number(paragraph.id.slice(10)); stop(); state.resumeChapter = state.index; state.resumeParagraph = selected; saveProgress(state.index, selected, true); markReading(selected, true); nowReading(`\u0110\u00e3 ch\u1ecdn \u0111o\u1ea1n ${selected + 1}/${chapter.paragraphs.length}`); status(`S\u1eb5n s\u00e0ng ti\u1ebfp t\u1ee5c t\u1eeb \u0111o\u1ea1n ${selected + 1}`); };
    document.querySelectorAll('.chapter-link').forEach((b, i) => { const active = i === index; b.classList.toggle('active', active); b.setAttribute('aria-current', active ? 'page' : 'false'); });
    status(`${chapter.paragraphs.length} \u0111o\u1ea1n \u00b7 s\u1eb5n s\u00e0ng \u0111\u1ecdc`);
    if (savedParagraph > 0) nowReading(`S\u1eb5n s\u00e0ng ti\u1ebfp t\u1ee5c t\u1eeb \u0111o\u1ea1n ${savedParagraph + 1}/${chapter.paragraphs.length}`);
    $('prevButton').disabled = index === 0; $('nextButton').disabled = index === chapters.length - 1;
  };
  const applyEdgeAudioControls = audio => {
    audio.playbackRate = Number($('rate').value);
    if (audio.edgeGain) audio.edgeGain.gain.value = state.volume;
    else audio.volume = state.volume;
  };
  const edgeAudioFor = (text, voice) => {
    const url = new URL(edgeTtsEndpoint, location.href);
    const pitch = Math.round((state.pitch - 1) * 20);
    url.searchParams.set('text', text);
    url.searchParams.set('voice', voice?.voiceName || edgeTtsVoices[0].voiceName);
    // Tạo audio ở tốc độ bình thường; playbackRate bên dưới áp dụng ngay cả
    // khi người dùng kéo thanh tốc độ trong lúc đang đọc.
    url.searchParams.set('rate', '+0%');
    url.searchParams.set('pitch', `${pitch >= 0 ? '+' : ''}${pitch}Hz`);
    url.searchParams.set('volume', '100%');
    const audio = new Audio(url.href);
    audio.preload = 'auto';
    audio.volume = state.volume;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      try {
        edgeAudioContext ||= new AudioContextClass();
        const source = edgeAudioContext.createMediaElementSource(audio);
        const gain = edgeAudioContext.createGain();
        gain.gain.value = state.volume;
        source.connect(gain).connect(edgeAudioContext.destination);
        audio.edgeGain = gain;
        audio.edgeSource = source;
        audio.volume = 1;
        edgeAudioContext.resume().catch(() => {});
      } catch { /* Safari có thể không cho nối lại cùng một audio element. */ }
    }
    applyEdgeAudioControls(audio);
    return audio;
  };
  const takeEdgeAudio = (text, voice) => {
    const key = `${voice?.voiceName || ''}|${state.pitch}|${text}`;
    if (edgePrefetch?.key === key) {
      const ready = edgePrefetch.audio;
      edgePrefetch = null;
      applyEdgeAudioControls(ready);
      return ready;
    }
    return edgeAudioFor(text, voice);
  };
  const prepareEdgeAudio = (text, voice) => {
    const key = `${voice?.voiceName || ''}|${state.pitch}|${text}`;
    if (edgePrefetch?.key === key) {
      applyEdgeAudioControls(edgePrefetch.audio);
      const ready = edgePrefetch.audio;
      edgePrefetch = null;
      return ready;
    }
    edgePrefetch?.audio?.pause();
    edgePrefetch?.audio?.edgeSource?.disconnect();
    const audio = edgeAudioFor(text, voice);
    audio.onerror = () => { if (edgePrefetch?.audio === audio) edgePrefetch = null; };
    audio.load();
    edgePrefetch = { key, audio };
    return audio;
  };
  const skipEdgeLeadSilence = audio => {
    if (audio.dataset.leadSilenceSkipped === 'yes' || audio.currentTime > 0.02 || !audio.seekable.length) return;
    try {
      const skip = Number.isFinite(audio.duration) ? Math.min(0.24, Math.max(0, audio.duration - 0.05)) : 0.24;
      if (skip > 0) audio.currentTime = skip;
      audio.dataset.leadSilenceSkipped = 'yes';
    } catch { /* Safari có thể chưa cho seek khi stream mới bắt đầu. */ }
  };
  const edgeChapterAudioFor = (chapterIndex, startParagraph, voice) => {
    const url = new URL(edgeChapterEndpoint, location.href);
    url.searchParams.set('chapter', String(chapterIndex));
    url.searchParams.set('start', String(startParagraph));
    url.searchParams.set('voice', voice?.voiceName || edgeTtsVoices[0].voiceName);
    url.searchParams.set('pitch', String(state.pitch));
    const audio = new Audio(url.href);
    audio.preload = 'auto';
    audio.playsInline = true;
    audio.crossOrigin = 'anonymous';
    applyEdgeAudioControls(audio);
    return audio;
  };
  const updateEdgeChapterProgress = audio => {
    const utterance = state.utterance;
    const chapter = chapters[state.index];
    if (!utterance?.edgeChapter || utterance.audio !== audio || !chapter?.paragraphs?.length) return;
    const start = utterance.startParagraph;
    const paragraphs = chapter.paragraphs.slice(start);
    const lengths = paragraphs.map(text => Math.max(1, String(text || '').length));
    // Stream MP3 có duration thay đổi trong lúc tải. Dùng duration để quy đổi
    // sẽ làm con trỏ nhảy lùi khi trình duyệt nhận thêm dữ liệu; dùng một đồng
    // hồ đơn điệu với khoảng nghỉ ước tính giữa các đoạn thay vào đó.
    const speechCharsPerSecond = 13;
    const paragraphPauseSeconds = 0.8;
    let passed = 0;
    let paragraphOffset = 0;
    while (paragraphOffset < lengths.length - 1) {
      const paragraphSeconds = lengths[paragraphOffset] / speechCharsPerSecond + paragraphPauseSeconds;
      if (passed + paragraphSeconds > Math.max(0, audio.currentTime)) break;
      passed += paragraphSeconds;
      paragraphOffset += 1;
    }
    const nextParagraph = Math.min(chapter.paragraphs.length - 1, start + paragraphOffset);
    if (nextParagraph > state.paragraph) {
      state.paragraph = nextParagraph;
      state.chunkParagraph = -1;
      markReading(nextParagraph);
      nowReading(`Đang đọc đoạn ${nextParagraph + 1}/${chapter.paragraphs.length}`);
    }
  };
  const flushEdgeChapterProgress = () => {
    const audio = state.utterance?.edgeChapter ? state.utterance.audio : null;
    if (!audio) return;
    updateEdgeChapterProgress(audio);
    saveProgress(state.index, state.paragraph);
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushEdgeChapterProgress(); });
  window.addEventListener('pagehide', flushEdgeChapterProgress);
  const speakParagraph = () => {
    const chapter = chapters[state.index];
    if (!chapter || state.paragraph < 0) { state.utterance = null; state.paused = false; syncControls(); nowReading('\u0110\u00e3 d\u1eebng'); return; }
    if (state.paragraph >= chapter.paragraphs.length) {
      if (audioExport.recorder) { finishAudioExport(true); state.utterance = null; state.paused = false; syncControls(); nowReading('\u0110\u00e3 \u0111\u1ecdc xong'); status('\u0110\u00e3 \u0111\u1ecdc xong ch\u01b0\u01a1ng'); return; }
      if (state.autoNext && state.index < chapters.length - 1) { select(state.index + 1); state.paragraph = 0; state.chunkParagraph = -1; speakParagraph(); return; }
      state.utterance = null; state.paused = false; syncControls(); document.querySelectorAll('.content p.reading-now').forEach(p => p.classList.remove('reading-now')); nowReading('\u0110\u00e3 \u0111\u1ecdc xong'); status('\u0110\u00e3 \u0111\u1ecdc xong ch\u01b0\u01a1ng'); return;
    }
    if (state.chunkParagraph !== state.paragraph) {
      // TTS đọc thường dùng đoạn nhỏ để cuộn mượt. Khi xuất file, gộp nhiều
      // đoạn liên tiếp để giảm số lần gọi TTS và khoảng ngắt giữa các đoạn.
      const exportSegment = audioExport.recorder ? exportSpeech(chapter.paragraphs, state.paragraph) : null;
      const text = exportSegment?.text || chapter.paragraphs[state.paragraph];
      const chunkLimit = audioExport.recorder ? exportChunkLimit : 900;
      state.exportEndParagraph = exportSegment?.end || state.paragraph + 1;
      state.chunks = splitForSpeechSafe(text, chunkLimit);
      state.chunkParagraph = state.paragraph;
      state.chunkIndex = 0;
    }
    markReading(state.paragraph);
    nowReading(`\u0110ang \u0111\u1ecdc \u0111o\u1ea1n ${state.paragraph + 1}/${chapter.paragraphs.length}`);
    if (edgeTtsEnabled && !audioExport.recorder) {
      const token = ++state.speakToken;
      const startParagraph = state.paragraph;
      const audio = edgeChapterAudioFor(state.index, startParagraph, state.voice);
      const updateProgress = () => updateEdgeChapterProgress(audio);
      state.utterance = { edgeChapter:true, token, audio, startParagraph };
      state.paused = false;
      audio.addEventListener('timeupdate', updateProgress);
      audio.onended = () => {
        if (state.utterance?.audio !== audio || token !== state.speakToken) return;
        audio.removeEventListener('timeupdate', updateProgress);
        audio.edgeSource?.disconnect();
        state.paragraph = chapter.paragraphs.length - 1;
        markReading(state.paragraph);
        saveProgress(state.index, state.paragraph);
        if (state.autoNext && state.index < chapters.length - 1) {
          select(state.index + 1);
          state.paragraph = 0;
          state.chunkParagraph = -1;
          speakParagraph();
          return;
        }
        state.utterance = null;
        state.paused = false;
        syncControls();
        nowReading('Đã đọc xong');
        status('Đã đọc xong chương');
      };
      audio.onerror = () => {
        if (state.utterance?.audio !== audio) return;
        state.edgeFailed = true;
        state.paused = true;
        syncControls();
        status('Edge TTS tạm lỗi. Bấm Tiếp tục để thử lại đoạn này.');
      };
      audio.addEventListener('loadedmetadata', () => skipEdgeLeadSilence(audio), { once:true });
      syncControls();
      let playbackStarted = false;
      const startWhenReady = () => {
        if (playbackStarted || state.utterance?.audio !== audio) return;
        skipEdgeLeadSilence(audio);
        edgeAudioContext?.resume().catch(() => {});
        audio.play().then(() => {
          playbackStarted = true;
          audio.removeEventListener('canplay', startWhenReady);
          state.edgeFailed = false;
          state.paused = false;
          syncControls();
        }).catch(error => {
          if (error?.name === 'NotAllowedError') {
            state.edgeFailed = true;
            state.paused = true;
            syncControls();
            status('iOS chặn phát audio. Bấm Tiếp tục để cho phép Edge TTS.');
          }
        });
      };
      audio.addEventListener('canplay', startWhenReady);
      audio.load();
      startWhenReady();
      status(`Đang tải audio liên tục bằng ${voiceLabel(state.voice)}`);
      return;
    }
    if (edgeTtsEnabled) {
      const token = ++state.speakToken;
      const audio = takeEdgeAudio(state.chunks[state.chunkIndex], state.voice);
      state.utterance = { edge:true, token, audio };
      state.paused = false;
      const nextText = state.chunks[state.chunkIndex + 1];
      if (nextText) prepareEdgeAudio(nextText, state.voice);
      audio.onended = () => {
        if (state.utterance?.audio !== audio || token !== state.speakToken) return;
        audio.edgeSource?.disconnect();
        if (state.chunkIndex + 1 < state.chunks.length) { state.chunkIndex += 1; speakParagraph(); }
        else { state.paragraph = audioExport.recorder ? state.exportEndParagraph : state.paragraph + 1; state.chunkParagraph = -1; speakParagraph(); }
      };
      audio.onerror = () => { if (state.utterance?.audio !== audio) return; state.edgeFailed = true; state.paused = true; syncControls(); status('Edge TTS tạm lỗi. Bấm Tiếp tục để thử lại đoạn này.'); };
      syncControls();
      let playbackStarted = false;
      const startWhenReady = () => {
        if (playbackStarted || state.utterance?.audio !== audio) return;
        skipEdgeLeadSilence(audio);
        edgeAudioContext?.resume().catch(() => {});
        audio.play().then(() => {
          playbackStarted = true;
          audio.removeEventListener('canplay', startWhenReady);
          state.edgeFailed = false;
          state.paused = false;
          syncControls();
        }).catch(error => {
          if (error?.name === 'NotAllowedError') { state.edgeFailed = true; state.paused = true; syncControls(); status('iOS chặn phát audio. Bấm Tiếp tục để cho phép Edge TTS.'); }
        });
      };
      audio.addEventListener('canplay', startWhenReady);
      if (audio.readyState === 0) audio.load();
      startWhenReady();
      status(`Đang đọc bằng ${voiceLabel(state.voice)}`);
      return;
    }
    if (extensionTts) {
      const token = ++state.speakToken;
      // Khóa tạm requestId trong lúc request mới đang chờ phản hồi. Sự kiện
      // `end` của request cũ có thể về muộn sau khi ChromeOS đã chuyển đoạn.
      state.requestId = -1;
      state.utterance = { extension:true, token };
      syncControls();
      sendTtsMessage({ type:'TTS_SPEAK', text:state.chunks[state.chunkIndex], voiceName:state.voice?.voiceName, rate:Number($('rate').value), pitch:state.pitch, volume:state.volume }, response => {
        if (token !== state.speakToken) return;
        if (response?.ok === false) { status(response?.error || 'Kh\u00f4ng ph\u00e1t \u0111\u01b0\u1ee3c voice Chrome OS'); state.utterance = null; syncControls(); }
        else { state.requestId = response.requestId || 0; status(`\u0110ang \u0111\u1ecdc b\u1eb1ng ${response.voice || 'Chrome OS Vietnamese 2'}`); }
      });
      return;
    }
    const utterance = new SpeechSynthesisUtterance(state.chunks[state.chunkIndex]);
    utterance.lang = 'vi-VN'; if (state.voice) utterance.voice = state.voice; utterance.rate = Number($('rate').value); utterance.pitch = state.pitch; utterance.volume = state.volume;
    utterance.onboundary = () => markReading(state.paragraph);
    utterance.onend = () => { if (state.utterance !== utterance) return; if (state.chunkIndex + 1 < state.chunks.length) { state.chunkIndex += 1; speakParagraph(); } else { state.paragraph = audioExport.recorder ? state.exportEndParagraph : state.paragraph + 1; state.chunkParagraph = -1; speakParagraph(); } };
    utterance.onerror = event => { state.utterance = null; syncControls(); status(`TTS l\u1ed7i: ${event.error || 'kh\u00f4ng ph\u00e1t \u0111\u01b0\u1ee3c'}`); };
    state.utterance = utterance; state.paused = false; syncControls(); getSpeech().speak(utterance);
  };
  const speak = () => {
    if (!chapters[state.index]) return;
    const speech = getSpeech(); if (!extensionTts && !edgeTtsEnabled && !speech) { status('Tr\u00ecnh duy\u1ec7t kh\u00f4ng h\u1ed7 tr\u1ee3 Web Speech TTS'); return; }
    stop(); claimPlayback(); state.voice = findVoice(); state.paragraph = state.resumeChapter === state.index ? state.resumeParagraph : progressFor(state.index); state.chunkParagraph = -1; speakParagraph();
  };
  const stop = () => { if (audioExport.recorder) { audioExport.batch = null; finishAudioExport(false); } state.speakToken += 1; state.requestId = 0; state.utterance?.audio?.pause(); state.utterance?.audio?.removeAttribute('src'); state.utterance?.audio?.load(); state.utterance?.audio?.edgeSource?.disconnect(); edgePrefetch?.audio?.pause(); edgePrefetch?.audio?.edgeSource?.disconnect(); edgePrefetch = null; state.utterance = null; state.paused = false; state.edgeFailed = false; if (extensionTts) sendTtsMessage({ type:'TTS_CONTROL', action:'stop' }); else if (!edgeTtsEnabled) getSpeech()?.cancel(); state.paragraph = -1; state.chunkParagraph = -1; releasePlaybackOwner(); syncControls(); nowReading('\u0110\u00e3 d\u1eebng'); };
  const releasePlaybackOwner = () => {
    try {
      const owner = JSON.parse(localStorage.getItem(playbackStorageKey) || 'null');
      if (owner?.tabId === tabId) localStorage.removeItem(playbackStorageKey);
    } catch { /* B\u1ecf qua n\u1ebfu localStorage t\u1ea1m th\u1eddi kh\u00f4ng s\u1eb5n s\u00e0ng. */ }
  };
  const claimPlayback = () => {
    const owner = { tabId, at: Date.now() };
    try { localStorage.setItem(playbackStorageKey, JSON.stringify(owner)); } catch { /* Storage b\u1ecb ch\u1eb7n kh\u00f4ng ch\u1eb7n ph\u00e1t. */ }
    try { playbackChannel?.postMessage({ type:'claim', ...owner }); } catch { /* BroadcastChannel kh\u00f4ng c\u00f3, storage event v\u1eabn l\u00e0 fallback. */ }
  };
  const stopForOtherTab = () => {
    if (!state.utterance) return;
    state.speakToken += 1;
    state.requestId = 0;
    state.utterance.audio?.pause();
    state.utterance.audio?.removeAttribute('src');
    state.utterance.audio?.load();
    state.utterance.audio?.edgeSource?.disconnect();
    edgePrefetch?.audio?.pause();
    edgePrefetch?.audio?.edgeSource?.disconnect();
    edgePrefetch = null;
    state.utterance = null;
    state.paused = false;
    state.edgeFailed = false;
    if (extensionTts) sendTtsMessage({ type:'TTS_CONTROL', action:'stop' });
    else if (!edgeTtsEnabled) getSpeech()?.cancel();
    state.paragraph = -1;
    state.chunkParagraph = -1;
    syncControls();
    nowReading('\u0110\u00e3 d\u1eebng v\u00ec tab kh\u00e1c \u0111ang ph\u00e1t');
    status('\u0110\u00e3 d\u1eebng tab n\u00e0y: ch\u1ec9 gi\u1eef m\u1ed9t phi\u00ean TTS \u0111ang ph\u00e1t');
  };
  let playbackChannel = null;
  try {
    playbackChannel = new BroadcastChannel(playbackStorageKey);
    playbackChannel.addEventListener('message', event => { if (event.data?.type === 'claim' && event.data.tabId !== tabId) stopForOtherTab(); });
  } catch { /* Tr\u00ecnh duy\u1ec7t c\u0169 kh\u00f4ng h\u1ed7 tr\u1ee3 BroadcastChannel. */ }
  window.addEventListener('storage', event => {
    if (event.key !== playbackStorageKey || !event.newValue) return;
    try { const owner = JSON.parse(event.newValue); if (owner?.tabId && owner.tabId !== tabId) stopForOtherTab(); } catch { /* B\u1ecf qua owner h\u1ecfng. */ }
  });
  $('playButton').onclick = () => { testingVoice = false; speak(); };
  $('pauseButton').onclick = () => { if (!state.utterance) return; if (extensionTts) sendTtsMessage({ type:'TTS_CONTROL', action:'pause' }); else if (edgeTtsEnabled) { flushEdgeChapterProgress(); state.utterance.audio?.pause(); } else getSpeech()?.pause(); state.paused = true; syncControls(); status('\u0110\u00e3 t\u1ea1m d\u1eebng'); };
  $('resumeButton').onclick = () => { const speech = getSpeech(); claimPlayback(); if (edgeTtsEnabled && state.edgeFailed) { const resumeParagraph = Math.max(state.paragraph, state.resumeParagraph, progressFor(state.index), 0); state.utterance?.audio?.pause(); state.utterance?.audio?.removeAttribute('src'); state.utterance?.audio?.load(); state.utterance?.audio?.edgeSource?.disconnect(); state.edgeFailed = false; state.utterance = null; state.paused = false; state.speakToken += 1; state.paragraph = resumeParagraph; state.chunkParagraph = -1; speakParagraph(); return; } if (edgeTtsEnabled && state.utterance?.audio) { edgeAudioContext?.resume().catch(() => {}); state.utterance.audio.play().then(() => { state.paused = false; syncControls(); status('\u0110ang ti\u1ebfp t\u1ee5c'); }).catch(() => { state.edgeFailed = true; state.paused = true; syncControls(); status('Edge TTS ch\u01b0a s\u1eb5n s\u00e0ng. H\u00e3y b\u1ea5m Ti\u1ebfp t\u1ee5c l\u1ea1i.'); }); return; } if ((!extensionTts && !edgeTtsEnabled && speech?.paused) || (extensionTts && state.utterance && state.paused)) { if (extensionTts) sendTtsMessage({ type:'TTS_CONTROL', action:'resume' }); else speech.resume(); state.paused = false; syncControls(); status('\u0110ang ti\u1ebfp t\u1ee5c'); return; } state.paragraph = state.resumeChapter === state.index ? state.resumeParagraph : progressFor(state.index); state.chunkParagraph = -1; speakParagraph(); };
  $('stopButton').onclick = () => { testingVoice = false; stop(); };
  $('prevButton').onclick = () => select(Math.max(0, state.index - 1)); $('nextButton').onclick = () => select(Math.min(chapters.length - 1, state.index + 1));
  $('rate').value = savedSettings.rate ?? 1; $('rateValue').textContent = `${Number($('rate').value).toFixed(2)}\u00d7`;
  $('volume').value = state.volume; $('volumeValue').textContent = `${Math.round(state.volume * 100)}%`;
  $('pitch').value = state.pitch; $('pitchValue').textContent = state.pitch.toFixed(2);
  $('autoScroll').checked = state.autoScroll;
  $('autoNext').checked = state.autoNext;
  if (savedSettings.font) { $('font').value = savedSettings.font; document.documentElement.style.setProperty('--reader-font', savedSettings.font); }
  if (savedSettings.size) { $('size').value = savedSettings.size; $('sizeValue').textContent = `${savedSettings.size}px`; document.documentElement.style.setProperty('--reader-size', `${savedSettings.size}px`); }
  if (savedSettings.width) { $('width').value = savedSettings.width; $('widthValue').textContent = `${savedSettings.width}px`; document.querySelector('.reader').style.maxWidth = `${savedSettings.width}px`; }
  applyAlignment(savedSettings.align || 'left');
  $('rate').oninput = event => { const rate = Number(event.target.value); $('rateValue').textContent = `${rate.toFixed(2)}\u00d7`; if (edgeTtsEnabled) { if (state.utterance?.audio) state.utterance.audio.playbackRate = rate; if (edgePrefetch?.audio) edgePrefetch.audio.playbackRate = rate; } saveSettings({ rate }); };
  $('voice').onchange = event => { state.voice = state.voices[Number(event.target.value)] || null; edgePrefetch?.audio?.pause(); edgePrefetch = null; saveSettings({ voice:state.voice?.voiceName || state.voice?.name || '' }); status(state.voice ? `\u0110\u00e3 ch\u1ecdn: ${voiceLabel(state.voice)}` : 'Ch\u01b0a ch\u1ecdn voice'); };
  $('voiceTestButton').onclick = () => {
    const sample = `Xin chào. Đây là bản thử giọng đọc tiếng Việt của ${readerTitle}.`;
    const selected = findVoice();
    testingVoice = true;
    stop();
    if (extensionTts) {
      sendTtsMessage({ type:'TTS_SPEAK', text:sample, voiceName:selected?.voiceName, rate:Number($('rate').value), pitch:state.pitch, volume:state.volume }, response => {
        if (response?.ok === false) status(response?.error || 'Không phát được voice Chrome OS');
        else status(`Đang thử bằng ${response.voice || 'voice tiếng Việt'}`);
      });
      return;
    }
    if (edgeTtsEnabled) {
      const audio = edgeAudioFor(sample, selected);
      audio.onended = () => { testingVoice = false; status('Đã thử xong Edge TTS'); };
      audio.onerror = () => { testingVoice = false; status('Edge TTS không kết nối được'); };
      audio.play().catch(() => status('Hãy chạm nút thử giọng lại để cho phép phát audio'));
      status(`Đang thử bằng ${selected?.label || 'Edge TTS'}`);
      return;
    }
    const speech = getSpeech();
    if (!speech) { status('Trình duyệt không hỗ trợ Web Speech TTS'); return; }
    const utterance = new SpeechSynthesisUtterance(sample);
    utterance.lang = 'vi-VN'; utterance.voice = selected || null; utterance.rate = Number($('rate').value); utterance.pitch = state.pitch; utterance.volume = state.volume;
    utterance.onend = () => status('Đã thử xong voice');
    utterance.onerror = event => status(`TTS lỗi: ${event.error || 'không phát được'}`);
    speech.speak(utterance); status(`Đang thử bằng ${selected?.voiceName || selected?.name || 'voice tiếng Việt'}`);
  };
  $('volume').oninput = event => { state.volume = Number(event.target.value); $('volumeValue').textContent = `${Math.round(state.volume * 100)}%`; if (edgeTtsEnabled) { if (state.utterance?.audio) applyEdgeAudioControls(state.utterance.audio); if (edgePrefetch?.audio) applyEdgeAudioControls(edgePrefetch.audio); } saveSettings({ volume:state.volume }); };
  $('pitch').oninput = event => { state.pitch = Number(event.target.value); edgePrefetch?.audio?.pause(); edgePrefetch = null; $('pitchValue').textContent = state.pitch.toFixed(2); saveSettings({ pitch:state.pitch }); };
  $('autoScroll').onchange = event => { state.autoScroll = event.target.checked; saveSettings({ autoScroll:state.autoScroll }); };
  $('autoNext').onchange = event => { state.autoNext = event.target.checked; saveSettings({ autoNext:state.autoNext }); status(state.autoNext ? 'Đã bật đọc liền phần kế' : 'Đã tắt đọc liền phần kế'); };
  $('darkButton').onclick = () => { applyBackground(document.body.classList.contains('light') || document.body.classList.contains('white') ? 'night' : 'paper'); saveSettings({ background:$('background').value }); };
  $('exportAudioButton').onclick = () => void startAudioExport();
  $('exportAllAudioButton').onclick = () => void startAllAudioExport();
  if (savedSettings.background) applyBackground(savedSettings.background); else applyBackground('night');
  $('background').onchange = event => { applyBackground(event.target.value); saveSettings({ background:event.target.value }); }; $('font').onchange = event => { document.documentElement.style.setProperty('--reader-font', event.target.value); saveSettings({ font:event.target.value }); };
  $('size').oninput = event => { document.documentElement.style.setProperty('--reader-size', `${event.target.value}px`); $('sizeValue').textContent = `${event.target.value}px`; saveSettings({ size:event.target.value }); }; $('width').oninput = event => { document.querySelector('.reader').style.maxWidth = `${event.target.value}px`; $('widthValue').textContent = `${event.target.value}px`; saveSettings({ width:event.target.value }); };
  $('chapterSearch').oninput = event => filterList(event.target.value);
  document.querySelectorAll('[data-align]').forEach(button => { button.onclick = () => { applyAlignment(button.dataset.align); saveSettings({ align:button.dataset.align }); }; });
  document.addEventListener('keydown', event => {
    if (event.target.matches('input, select, textarea, button')) return;
    if (event.code === 'Space') { event.preventDefault(); if (state.utterance && !state.paused) $('pauseButton').click(); else $('resumeButton').click(); }
    if (event.key === 'ArrowLeft') $('prevButton').click();
    if (event.key === 'ArrowRight') $('nextButton').click();
  });
  $('voiceButton').onclick = async () => { await loadVoices(); if (edgeTtsEnabled) { status(`Edge TTS: ${state.voices.map(v => v.label).join(', ')}`); return; } const names = state.voices.map(v => v.voiceName || v.name || v.lang); const voice2 = state.voices.find(isVoice2); status(voice2 ? `\u0110\u00e3 t\u00ecm th\u1ea5y: ${voice2.voiceName || voice2.name}` : names.length ? `Kh\u00f4ng c\u00f3 Vietnamese 2. Voice hi\u1ec7n c\u00f3: ${names.join(', ')}` : 'Kh\u00f4ng t\u00ecm th\u1ea5y voice Vi\u1ec7t'); };
  if (!extensionTts && !edgeTtsEnabled && getSpeech()) getSpeech().onvoiceschanged = () => void loadVoices();
  const handleReadingEvent = message => { if (message.type !== 'TTS_EVENT' || !state.utterance || state.paragraph < 0 || state.requestId <= 0 || message.requestId !== state.requestId) return; if (message.event.type === 'word' || message.event.type === 'sentence') markReading(state.paragraph); if (message.event.type === 'end') { state.requestId = 0; if (state.chunkIndex + 1 < state.chunks.length) { state.chunkIndex += 1; speakParagraph(); } else { state.paragraph = audioExport.recorder ? state.exportEndParagraph : state.paragraph + 1; state.chunkParagraph = -1; speakParagraph(); } } if (message.event.type === 'error') { state.requestId = 0; state.utterance = null; state.paused = false; syncControls(); status(message.event.errorMessage || 'TTS l\u1ed7i'); } };
  if (directExtensionTts) chrome.runtime.onMessage.addListener(handleReadingEvent);
  if (!directExtensionTts) window.addEventListener('message', event => { if (event.data?.source === 'viet-docx-tts-web' && event.data?.event) handleReadingEvent(event.data.event); });
  renderList(); select(Math.min(state.resumeChapter, Math.max(0, chapters.length - 1)), true); syncControls(); void loadVoices();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}), { once:true });
})();
