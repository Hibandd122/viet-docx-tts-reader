const isVietnamese = voice =>
  /(?:chrome\s*os|google)\s*(?:vietnamese|ti\u1ebfng\s*vi\u1ec7t)/i.test(`${voice.voiceName || ''} ${voice.name || ''}`) ||
  /^(vi|vie)([-_]|$)/i.test(voice.lang || '');

const isVietnamese2 = voice =>
  /chrome\s*os\s*(?:vietnamese|ti\u1ebfng\s*vi\u1ec7t)\s*2/i.test(`${voice.voiceName || ''} ${voice.name || ''}`);

let requestId = 0;
let currentSpeech = null;

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
});

function speakWithChromeTts(payload, sendResponse) {
  chrome.tts.getVoices(voices => {
    const available = voices.filter(isVietnamese);
    const voice = available.find(v => v.voiceName === payload.voiceName) || available.find(isVietnamese2) || available[0];

    if (!voice) {
      sendResponse({ ok: false, error: 'Kh\u00f4ng t\u00ecm th\u1ea5y voice Chrome OS Vietnamese' });
      return;
    }

    const currentRequestId = ++requestId;
    currentSpeech = {
      text: payload.text,
      lang: 'vi-VN',
      voiceName: voice.voiceName,
      rate: payload.rate,
      pitch: payload.pitch ?? 1,
      volume: payload.volume ?? 1
    };

    chrome.tts.stop();
    chrome.tts.speak(currentSpeech.text, {
      lang: currentSpeech.lang,
      voiceName: currentSpeech.voiceName,
      rate: currentSpeech.rate,
      pitch: currentSpeech.pitch,
      volume: currentSpeech.volume,
      enqueue: false,
      onEvent: event => chrome.runtime.sendMessage({ type: 'TTS_EVENT', requestId: currentRequestId, event })
    });

    sendResponse({ ok: true, voice: voice.voiceName, requestId: currentRequestId });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_VOICES') {
    chrome.tts.getVoices(voices => sendResponse({ voices: voices.filter(isVietnamese) }));
    return true;
  }

  if (message.type === 'TTS_SPEAK') {
    speakWithChromeTts(message, sendResponse);
    return true;
  }

  if (message.type === 'TTS_CONTROL') {
    if (message.action === 'pause') chrome.tts.pause();
    if (message.action === 'resume') chrome.tts.resume();
    if (message.action === 'stop') {
      requestId += 1;
      currentSpeech = null;
      chrome.tts.stop();
    }
    if (message.action === 'volume' && currentSpeech) {
      currentSpeech.volume = message.volume ?? currentSpeech.volume;
      chrome.tts.stop();
      chrome.tts.speak(currentSpeech.text, {
        lang: currentSpeech.lang,
        voiceName: currentSpeech.voiceName,
        rate: currentSpeech.rate,
        pitch: currentSpeech.pitch,
        volume: currentSpeech.volume,
        enqueue: false,
        onEvent: event => chrome.runtime.sendMessage({ type: 'TTS_EVENT', requestId, event })
      });
    }
    sendResponse({ ok: true });
    return true;
  }

  return false;
});
