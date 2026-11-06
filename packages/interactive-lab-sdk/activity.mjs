import { PROTOCOL, validateContext, sameContext, submission, validateAnswers, validateReceipt } from './protocol.mjs';

/** Called by a compatible activity. hostOrigin must be the explicit trusted host. */
export function connectActivity({ hostOrigin, targetWindow = window, timeoutMs = 15000 }) {
  const url = new URL(hostOrigin);
  if (url.origin !== hostOrigin || (url.protocol !== 'https:' && !['http://localhost', 'http://127.0.0.1'].some(prefix => hostOrigin === prefix || hostOrigin.startsWith(prefix + ':')))) {
    throw new Error('Define el origen HTTPS exacto de TEDVIO; no se admiten comodines.');
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { targetWindow.removeEventListener('message', connect); reject(new Error('No se recibió el contexto de TEDVIO.')); }, timeoutMs);
    function connect(event) {
      if (event.source !== targetWindow.parent || event.origin !== hostOrigin || event.data?.protocol !== PROTOCOL
        || event.data?.type !== 'connect' || event.ports?.length !== 1 || typeof event.data.nonce !== 'string'
        || !/^[0-9a-f-]{36}$/i.test(event.data.nonce)) return;
      let context;
      try { context = validateContext(event.data.context); } catch { return; }
      clearTimeout(timer); targetWindow.removeEventListener('message', connect);
      const port = event.ports[0], nonce = event.data.nonce;
      let answers = {}, request = null, pending = null, closed = false, finalReceipt = null;
      port.onmessage = event => {
        const data = event.data;
        if (!pending || data?.protocol !== PROTOCOL || data.nonce !== nonce || !sameContext(data.context, context) || data.requestId !== request?.requestId) return;
        if (data.type === 'receipt') {
          try { finalReceipt = validateReceipt(data.receipt, context, request.requestId); }
          catch { return; }
          clearTimeout(pending.timer); pending.resolve(finalReceipt); pending = null;
        } else if (data.type === 'error') {
          clearTimeout(pending.timer); pending.reject(new Error('No se confirmó la recepción; puedes reintentar.')); pending = null;
        }
      };
      port.start();
      resolve(Object.freeze({
        context,
        answer(questionId, value) {
          if (closed || request) throw new Error('No cambies las respuestas después de enviar; reintenta la misma entrega.');
          answers = validateAnswers({ ...answers, [questionId]: value });
        },
        complete() {
          if (closed) return Promise.reject(new Error('La actividad se cerró.'));
          if (finalReceipt) return Promise.resolve(finalReceipt);
          if (pending) return pending.promise;
          request ||= submission(context, crypto.randomUUID(), answers);
          let resolve, reject;
          const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
          const timer = setTimeout(() => { if (pending?.promise === promise) { pending = null; reject(new Error('La recepción sigue sin confirmarse. Reintenta sin cerrar la actividad.')); } }, timeoutMs);
          pending = { promise, resolve, reject, timer };
          port.postMessage(request); return promise;
        },
        close() {
          closed = true; port.close();
          if (pending) { clearTimeout(pending.timer); pending.reject(new Error('La actividad se cerró sin confirmación.')); pending = null; }
        }
      }));
    }
    targetWindow.addEventListener('message', connect);
  });
}
