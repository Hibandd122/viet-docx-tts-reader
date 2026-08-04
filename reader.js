(() => {
  const chapters = window.CHAPTERS || [];
  const readerConfig = window.READER_CONFIG || {};
  const readerTitle = readerConfig.title || 'DOCX Reader';
  const storageKey = String(readerConfig.storageKey || readerTitle).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'docx-reader';
  const progressStorageKey = `docx-reader:${storageKey}:progress`;
  const settingsStorageKey = `docx-reader:${storageKey}:settings`;
  const $ = id => document.getElementById(id);
  document.title = `${readerTitle} · Trình đọc tiếng Việt`;
  document.querySelector('h1')?.replaceChildren(`${readerTitle} · Tiếng Việt`);
  const savedProgress = (() => { try { return JSON.parse(localStorage.getItem(progressStorageKey) || '{}'); } catch { return {}; } })();
  const savedSettings = (() => { try { return JSON.parse(localStorage.getItem(settingsStorageKey) || '{}'); } catch { return {}; } })();
  const chapterProgress = { ...(savedProgress.chapters || {}) };
  const progressFor = index => Math.max(0, Number(chapterProgress[index] ?? (Number(savedProgress.chapter) === index ? savedProgress.paragraph : 0)) || 0);
  const saveProgress = (chapter, paragraph) => { chapterProgress[chapter] = Math.max(0, Number(paragraph) || 0); localStorage.setItem(progressStorageKey, JSON.stringify({ chapter, paragraph:chapterProgress[chapter], chapters:chapterProgress })); };
  const settings = { ...savedSettings };
  const state = { index: 0, utterance: null, paused: false, speakToken: 0, requestId: 0, voice: null, voices: [], paragraph: -1, chunkIndex: 0, chunkParagraph: -1, chunks: [], volume: Number(savedSettings.volume ?? 1), pitch: Number(savedSettings.pitch ?? 1), autoScroll: savedSettings.autoScroll !== false, autoNext: savedSettings.autoNext === true, resumeChapter: Number(savedProgress.chapter) || 0, resumeParagraph: progressFor(Number(savedProgress.chapter) || 0) };
  const directExtensionTts = typeof chrome !== 'undefined' && !!chrome.runtime?.id;
  const bridgeExtensionId = 'eflagfifekpkhoiaeciaobdaiabpppbd';
  const webExtensionMessaging = !directExtensionTts && typeof chrome !== 'undefined' && typeof chrome.runtime?.sendMessage === 'function';
  const appleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const localWebSpeech = /^(localhost|127\.0\.0\.1|::1)$/i.test(location.hostname);
  const extensionTts = !appleMobile && !localWebSpeech && (directExtensionTts || webExtensionMessaging);
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
  const fontName = name => ({ Montserrat:'Montserrat Local', QuattrocentoSans:'Quattrocento Local', Arial:'Arial', 'Arial Unicode MS':'Arial Unicode MS', Cambria:'Cambria', Georgia:'Georgia', 'Liberation Serif':'Liberation Serif' }[name] || 'Montserrat Local');
  const renderRuns = block => block.runs?.length ? block.runs.map(run => `<span style="font-family:'${fontName(run.font)}';${run.bold ? 'font-weight:700;' : ''}${run.italic ? 'font-style:italic;' : ''}">${escapeHtml(run.text)}</span>`).join('') : escapeHtml(block.text);
  const splitForSpeechSafe = text => {
    const parts = [];
    let rest = text.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '').replace(/\s+/g, ' ').trim();
    while (rest.length > 900) {
      let cut = -1;
      for (const punctuation of ['.', '!', '?', '\u3002', '\uFF01', '\uFF1F']) cut = Math.max(cut, rest.lastIndexOf(punctuation, 900));
      if (cut < 400) cut = rest.lastIndexOf(' ', 900);
      if (cut < 1) cut = 900;
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
  const markReading = index => {
    document.querySelectorAll('.content p.reading-now, .content p.resume-point').forEach(p => p.classList.remove('reading-now', 'resume-point'));
    const paragraph = $('paragraph-' + index);
    paragraph?.classList.add('reading-now');
    if (state.autoScroll) paragraph?.scrollIntoView({ block:'center', behavior:'smooth' });
    updateProgress(index, chapters[state.index]?.paragraphs.length || 0);
    state.resumeChapter = state.index; state.resumeParagraph = index;
    saveProgress(state.index, index);
    updateListProgress(state.index);
  };
  const isVoice2 = v => /chrome\s*os\s*(?:vietnamese|ti\u1ebfng\s*vi\u1ec7t)\s*2/i.test(`${v.name || ''} ${v.voiceName || ''}`);
  const findVoice = () => state.voice || state.voices.find(isVoice2) || state.voices[0] || null;
  const loadVoices = async () => {
    if (extensionTts) state.voices = await new Promise(resolve => sendTtsMessage({ type:'GET_VOICES' }, response => resolve(response?.voices || [])));
    else { const speech = getSpeech(); const voices = speech ? speech.getVoices() : []; state.voices = voices.filter(v => /chrome\s*os\s*(?:vietnamese|ti\u1ebfng\s*vi\u1ec7t)|google\s*(?:vietnamese|ti\u1ebfng\s*vi\u1ec7t)|vietnamese|ti\u1ebfng\s*vi\u1ec7t/i.test(`${v.name || ''} ${v.voiceName || ''}`) || /^(vi|vie)([-_]|$)/i.test(v.lang || '')); }
    $('voice').innerHTML = state.voices.length ? state.voices.map((v, i) => `<option value="${i}">${escapeHtml(v.voiceName || v.name || v.lang)}</option>`).join('') : '<option value="">Không tìm thấy voice Việt</option>';
    const voiceHint = $('voiceHint');
    if (voiceHint) {
      if (localWebSpeech) {
        voiceHint.hidden = false;
        voiceHint.textContent = 'Localhost: đang dùng trực tiếp voice ChromeOS của trình duyệt.';
      } else if (extensionTts) {
        voiceHint.hidden = false;
        voiceHint.textContent = state.voices.length ? `Extension Chrome OS: ${state.voices.length} voice Việt khả dụng.` : 'Extension chưa trả về voice Chrome OS.';
      } else if (appleMobile) {
        voiceHint.hidden = false;
        voiceHint.textContent = 'iPhone/iPad: đang dùng voice tiếng Việt của iOS. ChromeOS Vietnamese chỉ có trên ChromeOS/Extension.';
      } else if (state.voices.length <= 1) {
        voiceHint.hidden = false;
        voiceHint.textContent = 'Web Vercel chỉ thấy voice trình duyệt (thường là Linh). Muốn dùng Chrome OS Vietnamese 1–5, hãy mở bản extension Chrome OS.';
      } else {
        voiceHint.hidden = true;
      }
    }
    state.voice = state.voices.find(v => (v.voiceName || v.name || '') === savedSettings.voice) || state.voices.find(isVoice2) || state.voices[0] || null;
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
  const finishAudioExport = save => {
    const recorder = audioExport.recorder;
    if (!recorder) return;
    const complete = () => {
      const batch = audioExport.batch;
      if (save && audioExport.chunks.length) {
        const blob = new Blob(audioExport.chunks, { type: recorder.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const name = String(audioExport.chapter?.title || `Phan-${state.index + 1}`).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
        link.href = url; link.download = `${String(state.index + 1).padStart(3, '0')}-${name || `Phan-${state.index + 1}`}.webm`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        status(`Đã lưu audio: ${link.download}`);
      }
      if (!batch) audioExport.source?.getTracks().forEach(track => track.stop());
      audioExport.recorder = null; if (!batch) audioExport.source = null; audioExport.chunks = []; audioExport.chapter = null;
      const button = $('exportAudioButton'); if (button) button.textContent = 'Xuất audio chương này';
      if (!batch) { const allButton = $('exportAllAudioButton'); if (allButton) allButton.textContent = 'Xuất tất cả audio'; }
      if (batch?.next) setTimeout(batch.next, 450);
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
    recorder.start(250);
    $('exportAudioButton').textContent = batch ? `Đang xuất ${index + 1}/${chapters.length}` : 'Dừng thu audio';
    state.voice = findVoice(); state.paragraph = 0; state.chunkParagraph = -1; speakParagraph();
  };
  const startAudioExport = async () => {
    if (audioExport.recorder) { audioExport.batch = null; finishAudioExport(false); return; }
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === 'undefined') { status('Trình duyệt không hỗ trợ thu audio tab'); return; }
    try {
      const source = await navigator.mediaDevices.getDisplayMedia({ video:true, audio:true });
      if (!source.getAudioTracks().length) { source.getTracks().forEach(track => track.stop()); status('Hãy bật Chia sẻ âm thanh tab khi chọn màn hình'); return; }
      recordAudioChapter(source, state.index);
      status('Đang đọc và thu audio chương này…');
    } catch (error) { status(error?.name === 'NotAllowedError' ? 'Bạn chưa cho phép chia sẻ audio tab' : `Không thể thu audio: ${error.message}`); }
  };
  const startAllAudioExport = async () => {
    if (audioExport.recorder || audioExport.batch) { audioExport.batch = null; finishAudioExport(false); return; }
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === 'undefined') { status('Trình duyệt không hỗ trợ thu audio tab'); return; }
    try {
      const source = await navigator.mediaDevices.getDisplayMedia({ video:true, audio:true });
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
    $('content').onclick = event => { const paragraph = event.target.closest('p[id^="paragraph-"]'); if (!paragraph) return; const selected = Number(paragraph.id.slice(10)); stop(); state.resumeChapter = state.index; state.resumeParagraph = selected; saveProgress(state.index, selected); markReading(selected); nowReading(`\u0110\u00e3 ch\u1ecdn \u0111o\u1ea1n ${selected + 1}/${chapter.paragraphs.length}`); status(`S\u1eb5n s\u00e0ng ti\u1ebfp t\u1ee5c t\u1eeb \u0111o\u1ea1n ${selected + 1}`); };
    document.querySelectorAll('.chapter-link').forEach((b, i) => { const active = i === index; b.classList.toggle('active', active); b.setAttribute('aria-current', active ? 'page' : 'false'); });
    status(`${chapter.paragraphs.length} \u0111o\u1ea1n \u00b7 s\u1eb5n s\u00e0ng \u0111\u1ecdc`);
    if (savedParagraph > 0) nowReading(`S\u1eb5n s\u00e0ng ti\u1ebfp t\u1ee5c t\u1eeb \u0111o\u1ea1n ${savedParagraph + 1}/${chapter.paragraphs.length}`);
    $('prevButton').disabled = index === 0; $('nextButton').disabled = index === chapters.length - 1;
  };
  const speakParagraph = () => {
    const chapter = chapters[state.index];
    if (!chapter || state.paragraph < 0) { state.utterance = null; state.paused = false; syncControls(); nowReading('\u0110\u00e3 d\u1eebng'); return; }
    if (state.paragraph >= chapter.paragraphs.length) {
      if (audioExport.recorder) { finishAudioExport(true); state.utterance = null; state.paused = false; syncControls(); nowReading('\u0110\u00e3 \u0111\u1ecdc xong'); status('\u0110\u00e3 \u0111\u1ecdc xong ch\u01b0\u01a1ng'); return; }
      if (state.autoNext && state.index < chapters.length - 1) { select(state.index + 1); state.paragraph = 0; state.chunkParagraph = -1; speakParagraph(); return; }
      state.utterance = null; state.paused = false; syncControls(); document.querySelectorAll('.content p.reading-now').forEach(p => p.classList.remove('reading-now')); nowReading('\u0110\u00e3 \u0111\u1ecdc xong'); status('\u0110\u00e3 \u0111\u1ecdc xong ch\u01b0\u01a1ng'); return;
    }
    if (state.chunkParagraph !== state.paragraph) { state.chunks = splitForSpeechSafe(chapter.paragraphs[state.paragraph]); state.chunkParagraph = state.paragraph; state.chunkIndex = 0; }
    markReading(state.paragraph);
    nowReading(`\u0110ang \u0111\u1ecdc \u0111o\u1ea1n ${state.paragraph + 1}/${chapter.paragraphs.length}`);
    if (extensionTts) {
      const token = ++state.speakToken;
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
    utterance.onend = () => { if (state.utterance !== utterance) return; if (state.chunkIndex + 1 < state.chunks.length) { state.chunkIndex += 1; speakParagraph(); } else { state.paragraph += 1; state.chunkParagraph = -1; speakParagraph(); } };
    utterance.onerror = event => { state.utterance = null; syncControls(); status(`TTS l\u1ed7i: ${event.error || 'kh\u00f4ng ph\u00e1t \u0111\u01b0\u1ee3c'}`); };
    state.utterance = utterance; state.paused = false; syncControls(); getSpeech().speak(utterance);
  };
  const speak = () => {
    if (!chapters[state.index]) return;
    const speech = getSpeech(); if (!extensionTts && !speech) { status('Tr\u00ecnh duy\u1ec7t kh\u00f4ng h\u1ed7 tr\u1ee3 Web Speech TTS'); return; }
    stop(); state.voice = findVoice(); state.paragraph = state.resumeChapter === state.index ? state.resumeParagraph : progressFor(state.index); state.chunkParagraph = -1; speakParagraph();
  };
  const stop = () => { if (audioExport.recorder) { audioExport.batch = null; finishAudioExport(false); } state.speakToken += 1; state.requestId = 0; state.utterance = null; state.paused = false; if (extensionTts) sendTtsMessage({ type:'TTS_CONTROL', action:'stop' }); else getSpeech()?.cancel(); state.paragraph = -1; state.chunkParagraph = -1; syncControls(); nowReading('\u0110\u00e3 d\u1eebng'); };
  $('playButton').onclick = () => { testingVoice = false; speak(); };
  $('pauseButton').onclick = () => { if (!state.utterance) return; if (extensionTts) sendTtsMessage({ type:'TTS_CONTROL', action:'pause' }); else getSpeech()?.pause(); state.paused = true; syncControls(); status('\u0110\u00e3 t\u1ea1m d\u1eebng'); };
  $('resumeButton').onclick = () => { const speech = getSpeech(); if ((!extensionTts && speech?.paused) || (extensionTts && state.utterance && state.paused)) { if (extensionTts) sendTtsMessage({ type:'TTS_CONTROL', action:'resume' }); else speech.resume(); state.paused = false; syncControls(); status('\u0110ang ti\u1ebfp t\u1ee5c'); return; } state.paragraph = state.resumeChapter === state.index ? state.resumeParagraph : progressFor(state.index); state.chunkParagraph = -1; speakParagraph(); };
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
  $('rate').oninput = event => { const rate = Number(event.target.value); $('rateValue').textContent = `${rate.toFixed(2)}\u00d7`; saveSettings({ rate }); };
  $('voice').onchange = event => { state.voice = state.voices[Number(event.target.value)] || null; saveSettings({ voice:state.voice?.voiceName || state.voice?.name || '' }); status(state.voice ? `\u0110\u00e3 ch\u1ecdn: ${state.voice.voiceName || state.voice.name}` : 'Ch\u01b0a ch\u1ecdn voice'); };
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
    const speech = getSpeech();
    if (!speech) { status('Trình duyệt không hỗ trợ Web Speech TTS'); return; }
    const utterance = new SpeechSynthesisUtterance(sample);
    utterance.lang = 'vi-VN'; utterance.voice = selected || null; utterance.rate = Number($('rate').value); utterance.pitch = state.pitch; utterance.volume = state.volume;
    utterance.onend = () => status('Đã thử xong voice');
    utterance.onerror = event => status(`TTS lỗi: ${event.error || 'không phát được'}`);
    speech.speak(utterance); status(`Đang thử bằng ${selected?.voiceName || selected?.name || 'voice tiếng Việt'}`);
  };
  $('volume').oninput = event => { state.volume = Number(event.target.value); $('volumeValue').textContent = `${Math.round(state.volume * 100)}%`; saveSettings({ volume:state.volume }); };
  $('pitch').oninput = event => { state.pitch = Number(event.target.value); $('pitchValue').textContent = state.pitch.toFixed(2); saveSettings({ pitch:state.pitch }); };
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
  $('voiceButton').onclick = async () => { await loadVoices(); const names = state.voices.map(v => v.voiceName || v.name || v.lang); const voice2 = state.voices.find(isVoice2); status(voice2 ? `\u0110\u00e3 t\u00ecm th\u1ea5y: ${voice2.voiceName || voice2.name}` : names.length ? `Kh\u00f4ng c\u00f3 Vietnamese 2. Voice hi\u1ec7n c\u00f3: ${names.join(', ')}` : 'Kh\u00f4ng t\u00ecm th\u1ea5y voice Vi\u1ec7t'); };
  if (!extensionTts && getSpeech()) getSpeech().onvoiceschanged = () => void loadVoices();
  const handleReadingEvent = message => { if (message.type !== 'TTS_EVENT' || !state.utterance || state.paragraph < 0 || (state.requestId && message.requestId !== state.requestId)) return; if (message.event.type === 'word' || message.event.type === 'sentence') markReading(state.paragraph); if (message.event.type === 'end') { if (state.chunkIndex + 1 < state.chunks.length) { state.chunkIndex += 1; speakParagraph(); } else { state.paragraph += 1; state.chunkParagraph = -1; speakParagraph(); } } if (message.event.type === 'error') { state.utterance = null; state.paused = false; syncControls(); status(message.event.errorMessage || 'TTS l\u1ed7i'); } };
  if (directExtensionTts) chrome.runtime.onMessage.addListener(handleReadingEvent);
  if (!directExtensionTts) window.addEventListener('message', event => { if (event.data?.source === 'viet-docx-tts-web' && event.data?.event) handleReadingEvent(event.data.event); });
  renderList(); select(Math.min(state.resumeChapter, Math.max(0, chapters.length - 1)), true); syncControls(); void loadVoices();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}), { once:true });
})();
