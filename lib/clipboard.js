/**
 * Robust, cross-browser clipboard utility.
 * 
 * Safely copies text to the system clipboard and handles edge cases:
 * 1. Document is not currently focused (e.g. user interacted with DevTools, another app, or transient activation expired after async fetch).
 * 2. Modern Async Clipboard API fails or throws NotAllowedError.
 * 3. Fallback to hidden textarea with document.execCommand('copy').
 * 4. Never throws unhandled exceptions to calling components.
 * 
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} - Resolves to true if copying succeeded, false otherwise
 */
export async function copyToClipboard(text) {
  if (typeof window === 'undefined' || text === null || text === undefined) {
    return false;
  }

  const strText = String(text);

  // 1. If document is focused and modern Async Clipboard API is available, try it first
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      // Only invoke navigator.clipboard if the document has focus to avoid NotAllowedError: Document is not focused
      if (typeof document !== 'undefined' && typeof document.hasFocus === 'function' && document.hasFocus()) {
        await navigator.clipboard.writeText(strText);
        return true;
      }
    } catch (err) {
      console.warn('Async Clipboard API threw an error, trying execCommand fallback:', err?.message || err);
    }
  }

  // 2. Fallback: Hidden textarea with document.execCommand('copy')
  if (typeof document !== 'undefined') {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = strText;
      // Position offscreen to avoid screen flicker or scroll jumps
      textArea.style.position = 'fixed';
      textArea.style.top = '-9999px';
      textArea.style.left = '-9999px';
      textArea.style.opacity = '0';
      textArea.style.pointerEvents = 'none';
      textArea.setAttribute('readonly', '');
      textArea.setAttribute('tabindex', '-1');
      textArea.setAttribute('aria-hidden', 'true');

      document.body.appendChild(textArea);
      textArea.focus({ preventScroll: true });
      textArea.select();
      textArea.setSelectionRange(0, strText.length);

      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);

      if (successful) {
        return true;
      }
    } catch (fallbackErr) {
      console.warn('execCommand fallback failed:', fallbackErr?.message || fallbackErr);
    }

    // 3. Last-ditch attempt: focus window and retry navigator.clipboard
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        if (typeof window !== 'undefined' && typeof window.focus === 'function') {
          window.focus();
        }
        await navigator.clipboard.writeText(strText);
        return true;
      } catch (lastErr) {
        console.warn('Final clipboard write attempt failed:', lastErr?.message || lastErr);
      }
    }
  }

  return false;
}
