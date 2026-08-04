(() => {
  const source = 'viet-docx-tts-web';
  window.addEventListener('message', event => {
    if (event.source !== window || event.data?.source !== source || event.data?.direction !== 'to-extension') return;
    chrome.runtime.sendMessage(event.data.message, response => {
      window.postMessage({ source, direction: 'from-extension', id: event.data.id, response }, '*');
    });
  });
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'TTS_EVENT') window.postMessage({ source, direction: 'from-extension', event: message }, '*');
  });
})();
