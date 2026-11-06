import { PROTOCOL, validateContext, parseSubmission, validateReceipt } from './protocol.mjs';

/**
 * Bind ONE known sandboxed iframe to ONE server-created attempt. Attach after load.
 * No access token, teacher session, answer key, names or enrollments are transferred.
 * submit is a trusted host callback; it must call the backend, never grade locally.
 * This bridge is not an HTML sanitizer or an approval to run arbitrary HTML.
 */
export function attachLabHost({ iframe, context, submit, MessageChannelClass = MessageChannel }) {
  const fixedContext = validateContext(context);
  const tokens = (iframe.getAttribute('sandbox') || '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length !== 1 || tokens[0] !== 'allow-scripts' || !iframe.contentWindow) {
    throw new Error('La actividad requiere un iframe aislado sin same-origin, formularios, ventanas ni navegación superior.');
  }
  const channel = new MessageChannelClass();
  const nonce = crypto.randomUUID();
  let disposed = false, busy = false, saved = null, savedRequest = null, savedAnswers = null;
  function dispose() {
    if (disposed) return;
    disposed = true; iframe.removeEventListener('load', dispose);
    channel.port1.onmessage = null; channel.port1.close();
  }
  // A document navigation invalidates the channel rather than reusing its authority.
  iframe.addEventListener('load', dispose);
  channel.port1.onmessage = async event => {
    if (disposed) return;
    let message;
    try { message = parseSubmission(event.data, fixedContext); } catch { return; }
    if (busy) return;
    const answers = JSON.stringify(message.answers);
    busy = true;
    try {
      if (saved && (message.requestId !== savedRequest || answers !== savedAnswers)) throw new Error('La entrega ya fue confirmada.');
      const receipt = saved || validateReceipt(await submit(message), fixedContext, message.requestId);
      saved = receipt; savedRequest = message.requestId; savedAnswers = answers;
      if (!disposed) channel.port1.postMessage({ protocol: PROTOCOL, type: 'receipt', nonce, context: fixedContext, requestId: message.requestId, receipt });
    } catch {
      if (!disposed) channel.port1.postMessage({ protocol: PROTOCOL, type: 'error', nonce, context: fixedContext,
        requestId: message.requestId, message: 'No se confirmó la recepción. Conserva las respuestas y reintenta.' });
    } finally { busy = false; }
  };
  channel.port1.start();
  // An allow-scripts-only sandbox has an opaque origin. '*' is necessary only for
  // this one-way, non-secret bootstrap to the EXACT captured contentWindow.
  // All inbound traffic uses the transferred port, not a global window listener.
  iframe.contentWindow.postMessage({ protocol: PROTOCOL, type: 'connect', nonce, context: fixedContext }, '*', [channel.port2]);
  return Object.freeze({ close: dispose });
}
