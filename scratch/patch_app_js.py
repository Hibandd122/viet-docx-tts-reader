with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add symbol cleaning helpers after getParagraphKey
old_get_key = """  function getParagraphKey(volId, chapIdx, pIdx, voice, rate, pitch) {
    const rStr = `${rate >= 1 ? '+' : ''}${Math.round((rate - 1) * 100)}%`;
    const pStr = `${pitch >= 1 ? '+' : ''}${Math.round((pitch - 1) * 50)}Hz`;
    return `${volId}:ch${chapIdx}:p${pIdx}:${voice}:${rStr}:${pStr}`;
  }"""

new_get_key = """  function getParagraphKey(volId, chapIdx, pIdx, voice, rate, pitch) {
    const rStr = `${rate >= 1 ? '+' : ''}${Math.round((rate - 1) * 100)}%`;
    const pStr = `${pitch >= 1 ? '+' : ''}${Math.round((pitch - 1) * 50)}Hz`;
    return `${volId}:ch${chapIdx}:p${pIdx}:${voice}:${rStr}:${pStr}`;
  }

  const DECORATIVE_SYMBOLS_REGEX = /[✧✦₊★☆♡♥♪♫✿❀❁❃❄❅❆❇❈❉❊❋▲▼◀▶◆◇■□●○◎✪✫✬✭✮✯✰※†‡~～〰=_*^#§•·\\\\/|<>🔖]/gu;

  function isSceneBreakDivider(text) {
    if (!text || typeof text !== 'string') return false;
    const trimmed = text.trim();
    if (!trimmed) return true;
    const stripped = trimmed.replace(DECORATIVE_SYMBOLS_REGEX, '').replace(/[\\s\\-\\.\\,\\:\\;\\"\\'\\(\\)\\[\\]\\{\\}\\/\\\\—–]/g, '');
    return stripped.length === 0;
  }

  function cleanTextForTTS(rawText) {
    if (!rawText || typeof rawText !== 'string') return '';
    let text = rawText
      .replace(/🔖/g, '')
      .replace(DECORATIVE_SYMBOLS_REGEX, ' ')
      .replace(/[\\—\\–]{2,}/g, ', ')
      .replace(/~{2,}/g, ', ')
      .replace(/\\.{4,}/g, '...')
      .replace(/\\s+/g, ' ')
      .trim();
    return text.replace(/^[\\,\\:\\;\\-\\–\\—\\s]+/, '').replace(/[\\-\\–\\—\\s]+$/, '');
  }

  function isSpeakableText(text) {
    if (!text || typeof text !== 'string') return false;
    const cleaned = cleanTextForTTS(text);
    return /[\\p{L}\\p{N}]/u.test(cleaned);
  }

  function getParagraphTtsText(paragraph) {
    if (!paragraph) return '';
    const raw = paragraph.dataset.ttsText || paragraph.textContent.replace(/🔖/g, '').trim();
    return cleanTextForTTS(raw);
  }"""

assert old_get_key in content, "old_get_key not found"
content = content.replace(old_get_key, new_get_key, 1)

# 2. Update loadChapter to render scene-break-divider with ornament
old_load_block = """        if (Array.isArray(block.runs) && block.runs.length > 0) {
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
        
        p.appendChild(bBtn);"""

new_load_block = """        const rawStoryText = Array.isArray(block.runs) && block.runs.length > 0
          ? block.runs.map(run => run.text || '').join('')
          : block.text || '';

        const isDivider = isSceneBreakDivider(rawStoryText);
        if (isDivider) {
          p.classList.add('scene-break-divider');
          const ornament = document.createElement('span');
          ornament.className = 'scene-break-ornament';
          ornament.textContent = rawStoryText.trim() || '✧ ₊ ✦ ₊ ✧';
          p.appendChild(ornament);
          p.dataset.ttsText = '';
          p.dataset.isDivider = 'true';
        } else {
          p.dataset.ttsText = rawStoryText;
          
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
        }"""

assert old_load_block in content, "old_load_block not found"
content = content.replace(old_load_block, new_load_block, 1)

# 3. Update playParagraph
old_play_check = """    const textToRead = activeEl ? activeEl.textContent.replace(/🔖/g, '').trim() : '';
    if (!textToRead) {
      if (pGen === playbackGeneration && cGen === chapterGeneration) {
        playParagraph(pIdx + 1);
      }
      return;
    }"""

new_play_check = """    const textToRead = getParagraphTtsText(activeEl);
    if (!textToRead || !isSpeakableText(textToRead)) {
      // Scene break or empty paragraph: briefly highlight and smoothly step to next paragraph
      if (pGen === playbackGeneration && cGen === chapterGeneration) {
        setTimeout(() => {
          if (pGen === playbackGeneration && cGen === chapterGeneration && state.isPlaying && !state.isPaused) {
            playParagraph(pIdx + 1);
          }
        }, 350);
      }
      return;
    }"""

assert old_play_check in content, "old_play_check not found"
content = content.replace(old_play_check, new_play_check, 1)

# 4. Update playWebSpeechTTS
old_webspeech = """  function playWebSpeechTTS(text, pIdx, pGen, cGen) {
    if (!('speechSynthesis' in window)) {
      showToast('Trình duyệt không hỗ trợ Web Speech API');
      stopPlayback();
      return;
    }
    try { window.speechSynthesis.cancel(); } catch {}
    
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = state.rate;
    utter.pitch = state.pitch;
    utter.volume = state.isMuted ? 0 : state.volume;
    utter.lang = 'vi-VN';
    
    utter.onstart = () => {
      if (pGen !== playbackGeneration || cGen !== chapterGeneration) {
        try { window.speechSynthesis.cancel(); } catch {}
        return;
      }
      updatePlayPauseButtonUI(true, false);
    };
    utter.onend = () => {
      if (pGen !== playbackGeneration || cGen !== chapterGeneration) return;
      playParagraph(pIdx + 1);
    };
    utter.onerror = (err) => {
      if (pGen !== playbackGeneration || cGen !== chapterGeneration) return;
      console.warn('WebSpeech utterance error:', err);
      playParagraph(pIdx + 1);
    };
    utter.onpause = () => {
      if (pGen !== playbackGeneration || cGen !== chapterGeneration) return;
      state.isPaused = true;
      updatePlayPauseButtonUI(false, false);
    };
    utter.onresume = () => {
      if (pGen !== playbackGeneration || cGen !== chapterGeneration) return;
      state.isPaused = false;
      updatePlayPauseButtonUI(true, false);
    };
    
    window.speechSynthesis.speak(utter);
  }"""

new_webspeech = """  function playWebSpeechTTS(text, pIdx, pGen, cGen) {
    if (!('speechSynthesis' in window)) {
      showToast('Trình duyệt không hỗ trợ Web Speech API');
      stopPlayback();
      return;
    }
    try { window.speechSynthesis.cancel(); } catch {}
    
    const cleanedText = cleanTextForTTS(text);
    if (!isSpeakableText(cleanedText)) {
      if (pGen === playbackGeneration && cGen === chapterGeneration) {
        setTimeout(() => {
          if (pGen === playbackGeneration && cGen === chapterGeneration && state.isPlaying && !state.isPaused) {
            playParagraph(pIdx + 1);
          }
        }, 350);
      }
      return;
    }

    const utter = new SpeechSynthesisUtterance(cleanedText);
    utter.rate = state.rate;
    utter.pitch = state.pitch;
    utter.volume = state.isMuted ? 0 : state.volume;
    utter.lang = 'vi-VN';

    let hasEnded = false;
    const wordCount = cleanedText.split(/\\s+/).length;
    const estimatedDurationMs = Math.max(3000, (wordCount / (2.5 * state.rate)) * 1000 + 4000);
    const watchdog = setTimeout(() => {
      if (!hasEnded && pGen === playbackGeneration && cGen === chapterGeneration) {
        hasEnded = true;
        try { window.speechSynthesis.cancel(); } catch {}
        playParagraph(pIdx + 1);
      }
    }, estimatedDurationMs);
    
    utter.onstart = () => {
      if (pGen !== playbackGeneration || cGen !== chapterGeneration) {
        clearTimeout(watchdog);
        try { window.speechSynthesis.cancel(); } catch {}
        return;
      }
      updatePlayPauseButtonUI(true, false);
    };
    utter.onend = () => {
      if (hasEnded) return;
      hasEnded = true;
      clearTimeout(watchdog);
      if (pGen !== playbackGeneration || cGen !== chapterGeneration) return;
      playParagraph(pIdx + 1);
    };
    utter.onerror = (err) => {
      if (hasEnded) return;
      hasEnded = true;
      clearTimeout(watchdog);
      if (pGen !== playbackGeneration || cGen !== chapterGeneration) return;
      console.warn('WebSpeech utterance error:', err);
      playParagraph(pIdx + 1);
    };
    utter.onpause = () => {
      if (pGen !== playbackGeneration || cGen !== chapterGeneration) return;
      state.isPaused = true;
      updatePlayPauseButtonUI(false, false);
    };
    utter.onresume = () => {
      if (pGen !== playbackGeneration || cGen !== chapterGeneration) return;
      state.isPaused = false;
      updatePlayPauseButtonUI(true, false);
    };
    
    window.speechSynthesis.speak(utter);
  }"""

assert old_webspeech in content, "old_webspeech not found"
content = content.replace(old_webspeech, new_webspeech, 1)

# 5. Update preloadNextParagraphs
old_preload = """  function preloadNextParagraphs(currentIdx, count = 5, cGen = chapterGeneration) {
    const preloadGen = preloadGeneration;
    const pEls = $$('#content p');
    for (let i = 1; i <= count; i++) {
      const targetIdx = currentIdx + i;
      if (targetIdx >= pEls.length) break;
      if (cGen !== chapterGeneration) break;

      const cacheKey = getParagraphKey(state.volumeId, state.chapterIndex, targetIdx, state.voice, state.rate, state.pitch);
      if (state.preloadedUrls[cacheKey] || state.audioPreloadPromises[cacheKey]) continue;

      const p = $(`para-${targetIdx}`);
      if (!p) continue;
      const text = p.textContent.replace(/🔖/g, '').trim();
      if (!text) continue;

      const preloadVolumeId = state.volumeId;
      const preloadChapterIndex = state.chapterIndex;
      const ctrl = new AbortController();
      preloadAbortControllers.set(cacheKey, ctrl);

      const rateStr = `${state.rate >= 1 ? '+' : ''}${Math.round((state.rate - 1) * 100)}%`;
      const pitchStr = `${state.pitch >= 1 ? '+' : ''}${Math.round((state.pitch - 1) * 50)}Hz`;
      const url = `${serverBaseUrl}/api/tts?voice=${encodeURIComponent(state.voice)}&rate=${encodeURIComponent(rateStr)}&pitch=${encodeURIComponent(pitchStr)}&text=${encodeURIComponent(text)}`;"""

new_preload = """  function preloadNextParagraphs(currentIdx, count = 5, cGen = chapterGeneration) {
    const preloadGen = preloadGeneration;
    const pEls = $$('#content p');
    let preloadedCount = 0;
    for (let i = 1; i <= count * 2 && preloadedCount < count; i++) {
      const targetIdx = currentIdx + i;
      if (targetIdx >= pEls.length) break;
      if (cGen !== chapterGeneration) break;

      const p = $(`para-${targetIdx}`);
      if (!p) continue;
      const raw = getParagraphTtsText(p);
      if (!raw || !isSpeakableText(raw)) continue;

      const cacheKey = getParagraphKey(state.volumeId, state.chapterIndex, targetIdx, state.voice, state.rate, state.pitch);
      if (state.preloadedUrls[cacheKey] || state.audioPreloadPromises[cacheKey]) {
        preloadedCount++;
        continue;
      }

      preloadedCount++;
      const preloadVolumeId = state.volumeId;
      const preloadChapterIndex = state.chapterIndex;
      const ctrl = new AbortController();
      preloadAbortControllers.set(cacheKey, ctrl);

      const rateStr = `${state.rate >= 1 ? '+' : ''}${Math.round((state.rate - 1) * 100)}%`;
      const pitchStr = `${state.pitch >= 1 ? '+' : ''}${Math.round((state.pitch - 1) * 50)}Hz`;
      const url = `${serverBaseUrl}/api/tts?voice=${encodeURIComponent(state.voice)}&rate=${encodeURIComponent(rateStr)}&pitch=${encodeURIComponent(pitchStr)}&text=${encodeURIComponent(raw)}`;"""

assert old_preload in content, "old_preload not found"
content = content.replace(old_preload, new_preload, 1)

# 6. Update module.exports to export helpers for tests
old_exports = """  // Export for testing purposes if in Node environment
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      getParagraphKey,
      getBookStats,
      nextPlaybackGeneration,
      nextChapterGeneration,
      createManagedObjectUrl,
      revokeManagedObjectUrl,
      managedObjectUrls,
      MAX_CACHE_BYTES
    };
  }"""

new_exports = """  // Export for testing purposes if in Node environment
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      getParagraphKey,
      isSceneBreakDivider,
      cleanTextForTTS,
      isSpeakableText,
      getBookStats,
      nextPlaybackGeneration,
      nextChapterGeneration,
      createManagedObjectUrl,
      revokeManagedObjectUrl,
      managedObjectUrls,
      MAX_CACHE_BYTES
    };
  }"""

assert old_exports in content, "old_exports not found"
content = content.replace(old_exports, new_exports, 1)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Successfully patched app.js")
