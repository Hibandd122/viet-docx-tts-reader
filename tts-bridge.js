(() => {
  const source = 'viet-docx-tts-web';
  window.addEventListener('message', event => {
    if (event.source !== window || event.data?.source !== source || event.data?.direction !== 'to-extension') return;
    try {
      chrome.runtime.sendMessage(event.data.message, response => {
        const error = chrome.runtime.lastError;
        window.postMessage({ source, direction: 'from-extension', id: event.data.id, response: error ? { ok:false, error:error.message } : response }, '*');
      });
    } catch (error) { window.postMessage({ source, direction: 'from-extension', id: event.data.id, response: { ok:false, error:error.message } }, '*'); }
  });
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'TTS_EVENT') window.postMessage({ source, direction: 'from-extension', event: message }, '*');
  });
})();
