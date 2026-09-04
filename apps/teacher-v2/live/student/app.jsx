import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { LiveSurfaceErrorBoundary } from "../shared/LiveSurfaceErrorBoundary.jsx";
import "./base.css";
import "./premium.css";

const h = React.createElement;
const cfg = window.TEDVIO_CONFIG || {};
const configReady = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_PUBLISHABLE_KEY);
let supabaseClient;
let supabaseClientPromise;
let studentLiveStage = "boot";

async function getSupabase() {
  if (!configReady) throw new Error("TEDVIO no pudo cargar su configuración.");
  if (supabaseClient) return supabaseClient;
  if (!supabaseClientPromise) {
    supabaseClientPromise = import("@supabase/supabase-js")
      .then(({ createClient }) => {
        supabaseClient = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY);
        return supabaseClient;
      })
      .catch((error) => {
        supabaseClientPromise = undefined;
        throw error;
      });
  }
  return supabaseClientPromise;
}
const STORAGE_KEY = "tedvio.student.v2.native";
const LEGACY_KEY = "tedvio_v2_student";
const OUTBOX_KEY = "tedvio.student.v2.outbox";
const RECOVERY_DB = "tedvio-live-recovery";
const RECOVERY_STORE = "state";
const DELETED_MARKER = "__tedvio_deleted__";
const memoryStorage = new Map();
let recoveryDbPromise;
let outboxMutex = Promise.resolve();

function readLocalValue(key) {
  try {
    const value = localStorage.getItem(key);
    if (value !== null) memoryStorage.set(key, value);
    return value ?? memoryStorage.get(key) ?? null;
  } catch {
    return memoryStorage.get(key) ?? null;
  }
}

function writeLocalValue(key, value) {
  const serialized = JSON.stringify(value);
  memoryStorage.set(key, serialized);
  try {
    localStorage.setItem(key, serialized);
    return true;
  } catch {
    return false;
  }
}

function removeLocalValue(key) {
  memoryStorage.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    // IndexedDB and the in-memory fallback remain available.
  }
}

function openRecoveryDb() {
  if (recoveryDbPromise) return recoveryDbPromise;
  if (!("indexedDB" in window)) return Promise.resolve(null);
  const attempt = new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) {
        if (value) value.close();
        return;
      }
      settled = true;
      window.clearTimeout(timeout);
      resolve(value);
    };
    const timeout = window.setTimeout(() => finish(null), 1_500);
    try {
      const request = indexedDB.open(RECOVERY_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(RECOVERY_STORE)) {
          request.result.createObjectStore(RECOVERY_STORE);
        }
      };
      request.onsuccess = () => finish(request.result);
      request.onerror = () => finish(null);
      request.onblocked = () => finish(null);
    } catch {
      finish(null);
    }
  });
  recoveryDbPromise = attempt.then((database) => {
    if (!database) recoveryDbPromise = undefined;
    return database;
  });
  return recoveryDbPromise;
}

function settleTransaction(setup, fallback, timeoutMs = 1_500) {
  return new Promise((resolve) => {
    let settled = false;
    let cancel = () => {};
    const finish = (value) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(value);
    };
    const timeout = window.setTimeout(() => {
      try { cancel(); } catch {}
      finish(fallback);
    }, timeoutMs);
    try {
      cancel = setup(finish) || cancel;
    } catch {
      finish(fallback);
    }
  });
}

async function readDurableValue(key) {
  const localValue = readLocalValue(key);
  if (localValue !== null) {
    try {
      const parsed = JSON.parse(localValue);
      if (parsed?.[DELETED_MARKER]) return null;
      return parsed;
    } catch {
      removeLocalValue(key);
    }
  }
  const db = await openRecoveryDb();
  if (!db) return null;
  return settleTransaction((finish) => {
      const transaction = db.transaction(RECOVERY_STORE, "readonly");
      const request = transaction.objectStore(RECOVERY_STORE).get(key);
      request.onsuccess = () => {
        const value = request.result ?? null;
        if (value !== null) writeLocalValue(key, value);
        finish(value?.[DELETED_MARKER] ? null : value);
      };
      request.onerror = () => finish(null);
      return () => transaction.abort();
  }, null);
}

async function writeDurableValue(key, value) {
  const localSaved = writeLocalValue(key, value);
  const db = await openRecoveryDb();
  if (!db) return localSaved ? "local" : "memory";
  const indexedSaved = await settleTransaction((finish) => {
      const transaction = db.transaction(RECOVERY_STORE, "readwrite");
      transaction.objectStore(RECOVERY_STORE).put(value, key);
      transaction.oncomplete = () => finish(true);
      transaction.onerror = () => finish(false);
      transaction.onabort = () => finish(false);
      return () => transaction.abort();
  }, false);
  return indexedSaved ? "indexeddb" : localSaved ? "local" : "memory";
}

async function removeDurableValue(key) {
  const tombstone = { [DELETED_MARKER]: true, deletedAt: new Date().toISOString() };
  writeLocalValue(key, tombstone);
  const db = await openRecoveryDb();
  if (!db) return;
  await settleTransaction((finish) => {
      const transaction = db.transaction(RECOVERY_STORE, "readwrite");
      transaction.objectStore(RECOVERY_STORE).put(tombstone, key);
      transaction.oncomplete = () => finish();
      transaction.onerror = () => finish();
      transaction.onabort = () => finish();
      return () => transaction.abort();
  });
}

function queryCode() {
  const direct = new URLSearchParams(location.search).get("code");
  if (direct) return direct.trim().toUpperCase();
  const hash = location.hash.replace(/^#(?:join\?)?/, "");
  return new URLSearchParams(hash).get("code")?.trim().toUpperCase() || "";
}

function safeText(value, fallback = "") {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function normalizeStoredStudent(value) {
  if (!value || typeof value !== "object") return null;
  const sessionId = safeText(value.sessionId);
  const participantId = safeText(value.participantId);
  if (!sessionId || !participantId) return null;
  return {
    sessionId,
    participantId,
    name: safeText(value.name, "Alumno"),
    team: safeText(value.team),
    matricula: safeText(value.matricula),
    code: safeText(value.code).trim().toUpperCase(),
  };
}

const QUESTION_TYPES = new Set([
  "multiple_choice", "multiple_select", "true_false", "open_text",
  "numeric", "poll", "scale_5", "ordering", "hotspot",
]);

function normalizeQuestion(value) {
  if (!value || typeof value !== "object" || !safeText(value.id)) return null;
  const questionType = safeText(value.question_type);
  const status = safeText(value.status, "queued");
  const timer = Number(value.timer_seconds);
  return {
    ...value,
    id: safeText(value.id),
    prompt: safeText(value.prompt, "Pregunta sin texto"),
    question_type: QUESTION_TYPES.has(questionType) ? questionType : "unsupported",
    options: Array.isArray(value.options)
      ? value.options.map((option) => safeText(option)).filter(Boolean)
      : [],
    media_url: safeText(value.media_url) || null,
    media_type: safeText(value.media_type) || null,
    status: ["queued", "live", "closed", "revealed"].includes(status) ? status : "queued",
    position: Math.max(1, Number(value.position) || 1),
    timer_seconds: Number.isFinite(timer) ? Math.max(5, Math.min(600, timer)) : 30,
    launched_at: safeText(value.launched_at) || null,
  };
}

function normalizeSession(value) {
  if (!value || typeof value !== "object" || !safeText(value.id)) return null;
  const status = safeText(value.status, "draft");
  return {
    ...value,
    id: safeText(value.id),
    code: safeText(value.code),
    title: safeText(value.title, "TEDVIO"),
    status: ["draft", "live", "closed"].includes(status) ? status : "draft",
    current_question_id: safeText(value.current_question_id) || null,
    competitive: value.competitive === true,
    team_mode: value.team_mode === true,
  };
}

function readStoredStudent(expectedCode = "") {
  for (const key of [STORAGE_KEY, LEGACY_KEY]) {
    try {
      const value = normalizeStoredStudent(JSON.parse(readLocalValue(key) || "null"));
      if (value && (!expectedCode || value.code === expectedCode)) return value;
    } catch {}
  }
  return null;
}

async function recoverStoredStudent(expectedCode = "") {
  const immediate = readStoredStudent(expectedCode);
  if (immediate) return immediate;
  for (const key of [STORAGE_KEY, LEGACY_KEY]) {
    const value = normalizeStoredStudent(await readDurableValue(key));
    if (value && (!expectedCode || value.code === expectedCode)) return value;
  }
  return null;
}

function saveStudent(student) {
  return withOutboxLock(() => writeDurableValue(STORAGE_KEY, student));
}

async function clearStudent(target) {
  if (!target?.sessionId || !target?.participantId) return;
  await withOutboxLock(async () => {
    for (const key of [STORAGE_KEY, LEGACY_KEY]) {
      const stored = await readDurableValue(key);
      if (stored?.sessionId === target.sessionId && stored?.participantId === target.participantId) {
        await removeDurableValue(key);
      }
    }
    const outbox = await readOutboxUnsafe();
    const items = outbox.items.filter((item) =>
      item.sessionId !== target.sessionId || item.participantId !== target.participantId,
    );
    if (items.length) await writeDurableValue(OUTBOX_KEY, { version: 2, items });
    else await removeDurableValue(OUTBOX_KEY);
  });
}

function normalizeOutbox(value) {
  const rawItems = Array.isArray(value?.items)
    ? value.items
    : value?.questionId
      ? [value]
      : [];
  const items = rawItems
    .filter((item) => item?.sessionId && item?.participantId && item?.questionId)
    .map((item) => ({
      ...item,
      requestId: item.requestId || createRequestId(),
      createdAt: item.createdAt || new Date().toISOString(),
      status: "pending",
    }))
    .slice(-20);
  return { version: 2, items };
}

async function readOutboxUnsafe() {
  const stored = await readDurableValue(OUTBOX_KEY);
  const normalized = normalizeOutbox(stored);
  if (stored && JSON.stringify(stored) !== JSON.stringify(normalized)) {
    await writeDurableValue(OUTBOX_KEY, normalized);
  }
  return normalized;
}

function withOutboxLock(operation) {
  if (globalThis.navigator?.locks?.request) {
    return globalThis.navigator.locks.request("tedvio-student-state", { mode: "exclusive" }, operation);
  }
  const result = outboxMutex.then(operation, operation);
  outboxMutex = result.then(() => undefined, () => undefined);
  return result;
}

function readOutbox() {
  return withOutboxLock(readOutboxUnsafe);
}

async function getOrCreateOutboxEntry(entry) {
  return withOutboxLock(async () => {
    const outbox = await readOutboxUnsafe();
    const existing = outbox.items.find((item) =>
      item.sessionId === entry.sessionId
      && item.participantId === entry.participantId
      && item.questionId === entry.questionId,
    );
    if (existing) return { entry: existing, storage: "existing" };
    const items = outbox.items.filter((item) =>
      item.requestId !== entry.requestId
      && !(item.participantId === entry.participantId && item.questionId === entry.questionId),
    );
    items.push(entry);
    const storage = await writeDurableValue(OUTBOX_KEY, { version: 2, items: items.slice(-20) });
    return { entry, storage };
  });
}

async function clearOutbox(requestId) {
  if (!requestId) return false;
  return withOutboxLock(async () => {
    const outbox = await readOutboxUnsafe();
    const items = outbox.items.filter((item) => item.requestId !== requestId);
    if (items.length) await writeDurableValue(OUTBOX_KEY, { version: 2, items });
    else await removeDurableValue(OUTBOX_KEY);
    return true;
  });
}
function isDuplicate(error) {
  return /duplicate/i.test(String(error?.message || error || ""));
}
function isRetryable(error) {
  return (
    !navigator.onLine ||
    /fetch|network|timeout|connection/i.test(
      String(error?.message || error || ""),
    )
  );
}

function createRequestId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function submitWithReceipt(pending) {
  const client = await getSupabase();
  const { data, error } = await client.rpc("v2_submit_response_v2", {
    p_question_id: pending.questionId,
    p_participant_id: pending.participantId,
    p_answer: pending.answer,
    p_request_id: pending.requestId,
  });
  if (error) throw error;
  const allowedStatuses = new Set(["recorded", "replayed", "already_recorded"]);
  if (
    data?.receipt_version !== 1
    || !data.confirmed
    || !allowedStatuses.has(data.status)
    || data.request_id !== pending.requestId
    || data.question_id !== pending.questionId
    || !data.response_id
    || !data.submitted_at
  ) {
    throw new Error("RESPONSE_RECEIPT_INVALID");
  }
  return data;
}

async function fetchAnswerReceipt(pending) {
  const client = await getSupabase();
  const { data, error } = await client.rpc("v2_student_answer_result", {
    p_question_id: pending.questionId,
    p_participant_id: pending.participantId,
  });
  if (error) throw error;
  return data?.[0] || null;
}

async function recordHealth(student, eventType, latencyMs = null, details = {}) {
  if (!configReady || !student?.sessionId || !student?.participantId || !navigator.onLine) return;
  try {
    const client = await getSupabase();
    await client.rpc("v2_record_session_health", {
      p_session_id: student.sessionId,
      p_participant_id: student.participantId,
      p_event_type: eventType,
      p_latency_ms: latencyMs == null ? null : Math.max(0, Math.round(latencyMs)),
      p_details: { surface: "student-v2", ...details },
    });
  } catch {
    // La telemetría nunca debe interrumpir la experiencia del alumno.
  }
}

function friendly(error) {
  const message = String(
    error?.message || error || "No se pudo completar la operación.",
  );
  if (/QUESTION_EXPIRED/i.test(message))
    return "El tiempo para responder terminó.";
  if (/QUESTION_NOT_LIVE/i.test(message))
    return "La pregunta ya no acepta respuestas.";
  if (/duplicate/i.test(message)) return "Tu respuesta ya estaba registrada.";
  if (/session/i.test(message) && /not|invalid|closed/i.test(message))
    return "La sesión no está disponible.";
  return message;
}

function classifyRenderError(error) {
  const message = String(error?.message || error || "");
  if (/replaceAll/i.test(message)) return "unsupported_string_api";
  if (/object.*react child|react child.*object/i.test(message)) return "invalid_render_value";
  const reactCode = message.match(/Minified React error #(\d+)/i)?.[1];
  return reactCode ? `react_${reactCode}` : "render_failed";
}

function liveBuildId() {
  const script = Array.from(document.scripts).find((item) => /\/assets\/app-[^/]+\.js/.test(item.src));
  return script?.src.match(/app-([^/]+)\.js/)?.[1] || "unknown";
}

function reportStudentFatal({ reference, reason }) {
  const student = readStoredStudent(queryCode());
  if (!student) return;
  void recordHealth(student, "client_render_failed", null, {
    reference,
    reason,
    build: liveBuildId(),
    stage: studentLiveStage,
  });
}

function secondsLeft(question) {
  if (!question?.launched_at || question.status !== "live") return 0;
  const elapsed =
    (Date.now() - new Date(question.launched_at).getTime()) / 1000;
  return Math.max(0, Math.ceil(Number(question.timer_seconds || 30) - elapsed));
}

async function fetchWorkspace(student) {
  const client = await getSupabase();
  const { data: session, error: sessionError } = await client
    .from("v2_sessions")
    .select(
      "id,code,title,status,current_question_id,competitive,team_mode,started_at,closed_at",
    )
    .eq("id", student.sessionId)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!session) throw new Error("SESSION_NOT_FOUND");

  const { data: questions, error: questionError } = await client
    .from("v2_questions")
    .select(
      "id,position,prompt,question_type,options,media_url,media_type,timer_seconds,status,launched_at,closed_at",
    )
    .eq("session_id", session.id)
    .order("position");
  if (questionError) throw questionError;

  const safeSession = normalizeSession(session);
  if (!safeSession) throw new Error("SESSION_INVALID");
  const safeQuestions = (Array.isArray(questions) ? questions : [])
    .map(normalizeQuestion)
    .filter(Boolean);
  const current =
    safeQuestions.find((q) => q.id === safeSession.current_question_id) || null;
  let own = null;
  if (current) {
    const { data, error } = await client.rpc("v2_student_answer_result", {
      p_question_id: current.id,
      p_participant_id: student.participantId,
    });
    if (error) throw error;
    own = data?.[0] || null;
  }
  return { session: safeSession, questions: safeQuestions, current, own };
}

async function fetchReveal(student, session, question) {
  const client = await getSupabase();
  const [own, feedback, rank, group, correct] = await Promise.all([
    client.rpc("v2_student_answer_result", {
      p_question_id: question.id,
      p_participant_id: student.participantId,
    }),
    client.rpc("v2_student_answer_feedback", {
      p_question_id: question.id,
      p_participant_id: student.participantId,
    }),
    client.rpc("v2_student_feedback", {
      p_session_id: session.id,
      p_participant_id: student.participantId,
    }),
    client.rpc("v2_public_question_results", {
      p_session_id: session.id,
      p_question_id: question.id,
    }),
    client
      .from("v2_questions")
      .select("correct_answer")
      .eq("id", question.id)
      .maybeSingle(),
  ]);
  const firstError = [own.error, feedback.error, rank.error, group.error, correct.error].find(Boolean);
  if (firstError) throw firstError;
  return {
    questionId: question.id,
    own: own.data?.[0] || null,
    explanation: feedback.data?.[0]?.explanation || "",
    rank: rank.data?.[0] || null,
    group: group.data || [],
    correctAnswer: correct.data?.correct_answer ?? null,
  };
}

function Header({ session, connection }) {
  const healthy = connection === "connected";
  const tone = healthy ? "ok" : connection === "offline" ? "bad" : "pending";
  const connectionText = healthy
    ? "En vivo"
    : connection === "offline"
      ? "Sin conexión"
      : connection === "connecting"
        ? "Conectando"
        : "Recuperando";
  return h(
    "header",
    { className: "topbar" },
    h("img", {
      src: "../assets/tedvio_official_horizontal.svg",
      alt: "TEDVIO",
      className: "brand",
    }),
    h(
      "div",
      { className: "top-meta" },
      h(
        "span",
        { className: `net ${tone}`, role: "status", "aria-live": "polite" },
        connectionText,
      ),
      session?.code
        ? h("span", { className: "code-pill" }, session.code)
        : null,
    ),
  );
}

function JoinScreen({ initialCode, busy, error, onJoin }) {
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState("");
  const [matricula, setMatricula] = useState("");
  const [team, setTeam] = useState("");
  return h(
    "main",
    { className: "entry-shell" },
    h(
      "section",
      { className: "entry-card" },
      h("img", {
        src: "../assets/tedvio_official_horizontal.svg",
        alt: "TEDVIO",
        className: "entry-logo",
      }),
      h("span", { className: "eyebrow" }, "CLASE EN VIVO"),
      h("h1", null, "Entra a tu sesión"),
      h(
        "p",
        { className: "lead" },
        "Escribe el código que aparece en pantalla y tus datos de identificación.",
      ),
      h(
        "form",
        {
          onSubmit: (e) => {
            e.preventDefault();
            onJoin({ code, name, matricula, team });
          },
        },
        h(
          "label",
          null,
          "Código de clase",
          h("input", {
            value: code,
            onChange: (e) =>
              setCode(e.target.value.toUpperCase().replace(/\s/g, "")),
            placeholder: "ABC123",
            maxLength: 12,
            autoCapitalize: "characters",
            autoComplete: "one-time-code",
            spellCheck: false,
            required: true,
          }),
        ),
        h(
          "label",
          null,
          "Nombre",
          h("input", {
            value: name,
            onChange: (e) => setName(e.target.value),
            placeholder: "Tu nombre completo",
            maxLength: 100,
            autoComplete: "name",
            required: true,
          }),
        ),
        h(
          "label",
          null,
          "Matrícula",
          h("input", {
            value: matricula,
            onChange: (e) => setMatricula(e.target.value),
            placeholder: "Opcional",
            maxLength: 40,
            inputMode: "numeric",
          }),
        ),
        h(
          "label",
          null,
          "Equipo",
          h("input", {
            value: team,
            onChange: (e) => setTeam(e.target.value),
            placeholder: "Opcional",
            maxLength: 50,
          }),
        ),
        error ? h("div", { className: "error-box" }, error) : null,
        h(
          "button",
          {
            className: "primary-btn",
            disabled: busy || !code.trim() || !name.trim(),
            type: "submit",
          },
          busy ? "Entrando…" : "Entrar a clase",
        ),
      ),
      h(
        "small",
        { className: "privacy" },
        "Tu respuesta se registra únicamente dentro de la sesión académica activa.",
      ),
    ),
  );
}

function Waiting({ student, session, answered }) {
  return h(
    "section",
    { className: "state-card center" },
    h("div", { className: "pulse" }, h("i")),
    h("span", { className: "eyebrow" }, "SESIÓN ACTIVA"),
    h("h1", null, "Estás dentro."),
    h("p", null, "Espera a que tu profesor lance la siguiente pregunta."),
    h(
      "div",
      { className: "identity" },
      h("strong", null, student.name || "Alumno"),
      h(
        "span",
        null,
        `${session.title || "TEDVIO"}${student.team ? ` · ${student.team}` : ""}`,
      ),
    ),
    h(
      "div",
      { className: "mini-grid" },
      h(
        "div",
        null,
        h("span", null, "Respuestas"),
        h("b", null, String(answered)),
      ),
      h(
        "div",
        null,
        h("span", null, "Código"),
        h("b", null, session.code || "—"),
      ),
    ),
  );
}

function Media({ question }) {
  if (!question.media_url || question.question_type === "hotspot") return null;
  if (question.media_type === "audio")
    return h("audio", {
      controls: true,
      src: question.media_url,
      className: "media audio",
    });
  if (question.media_type === "video")
    return h("video", {
      controls: true,
      src: question.media_url,
      className: "media",
    });
  return h("img", {
    src: question.media_url,
    alt: "Recurso de la pregunta",
    className: "media",
  });
}

function Question({ question, questionCount, own, pending, submitting, onSubmit }) {
  const options = Array.isArray(question.options)
    ? question.options.map(String)
    : [];
  const [selected, setSelected] = useState([]);
  const [text, setText] = useState("");
  const [number, setNumber] = useState("");
  const [order, setOrder] = useState([]);
  const [hotspot, setHotspot] = useState(null);
  const [remaining, setRemaining] = useState(() => secondsLeft(question));
  useEffect(() => {
    setSelected([]);
    setText("");
    setNumber("");
    setOrder([]);
    setHotspot(null);
  }, [question.id]);
  useEffect(() => {
    const timer = setInterval(() => setRemaining(secondsLeft(question)), 500);
    return () => clearInterval(timer);
  }, [question]);

  if (own) {
    return h(
      "section",
      { className: "state-card center" },
      h("div", { className: "success-mark" }, "✓"),
      h("span", { className: "eyebrow" }, "RESPUESTA REGISTRADA"),
      h("h1", null, "Listo."),
      h(
        "p",
        null,
        "Tu respuesta quedó guardada. Espera a que el profesor muestre el resultado.",
      ),
      );
  }
  if (pending) {
    return h(
      "section",
      { className: "state-card center" },
      h("div", { className: "muted-mark" }, "↻"),
      h("span", { className: "eyebrow" }, "RESPUESTA PROTEGIDA"),
      h("h1", null, "Pendiente de sincronizar"),
      h(
        "p",
        null,
        "TEDVIO conserva tu respuesta y volverá a enviarla automáticamente. Mantén esta pantalla abierta.",
      ),
    );
  }
  if (question.status !== "live" || remaining <= 0) {
    return h(
      "section",
      { className: "state-card center" },
      h("div", { className: "muted-mark" }, "⌛"),
      h("h1", null, "Respuestas cerradas"),
      h("p", null, "Espera a que el profesor continúe la sesión."),
    );
  }

  let answerControl = null;
  if (
    ["multiple_choice", "true_false", "poll"].includes(question.question_type)
  ) {
    answerControl = h(
      "div",
      { className: "options" },
      ...options.map((opt, i) =>
        h(
          "button",
          {
            key: opt,
            className: "option",
            disabled: submitting,
            onClick: () => onSubmit(opt),
          },
          h("span", null, String.fromCharCode(65 + i)),
          h("b", null, opt),
        ),
      ),
    );
  } else if (question.question_type === "multiple_select") {
    answerControl = h(
      React.Fragment,
      null,
      h(
        "div",
        { className: "options" },
        ...options.map((opt, i) => {
          const active = selected.includes(opt);
          return h(
            "button",
            {
              key: opt,
              className: `option${active ? " selected" : ""}`,
              onClick: () =>
                setSelected((cur) =>
                  active ? cur.filter((x) => x !== opt) : [...cur, opt],
                ),
            },
            h("span", null, active ? "✓" : String.fromCharCode(65 + i)),
            h("b", null, opt),
          );
        }),
      ),
      h(
        "button",
        {
          className: "primary-btn",
          disabled: submitting || !selected.length,
          onClick: () => onSubmit([...selected].sort()),
        },
        submitting ? "Enviando…" : "Enviar selección",
      ),
    );
  } else if (question.question_type === "scale_5") {
    answerControl = h(
      "div",
      { className: "scale" },
      ...["1", "2", "3", "4", "5"].map((v) =>
        h("button", { key: v, onClick: () => onSubmit(v) }, v),
      ),
    );
  } else if (question.question_type === "open_text") {
    answerControl = h(
      React.Fragment,
      null,
      h("textarea", {
        className: "text-input",
        rows: 6,
        maxLength: 1200,
        value: text,
        onChange: (e) => setText(e.target.value),
        placeholder: "Escribe tu respuesta",
      }),
      h(
        "button",
        {
          className: "primary-btn",
          disabled: submitting || !text.trim(),
          onClick: () => onSubmit(text.trim()),
        },
        "Enviar respuesta",
      ),
    );
  } else if (question.question_type === "numeric") {
    answerControl = h(
      React.Fragment,
      null,
      h("input", {
        className: "text-input",
        type: "number",
        step: "any",
        inputMode: "decimal",
        value: number,
        onChange: (e) => setNumber(e.target.value),
        placeholder: "Escribe tu respuesta",
      }),
      h(
        "button",
        {
          className: "primary-btn",
          disabled: submitting || number === "",
          onClick: () => onSubmit(Number(number)),
        },
        "Enviar respuesta",
      ),
    );
  } else if (question.question_type === "ordering") {
    const remainingOptions = options.filter((opt) => !order.includes(opt));
    answerControl = h(
      React.Fragment,
      null,
      h("p", { className: "hint" }, "Toca los elementos en el orden correcto."),
      h(
        "div",
        { className: "order-picked" },
        order.length
          ? order.map((opt, i) =>
              h(
                "button",
                {
                  key: `${opt}-${i}`,
                  onClick: () =>
                    setOrder((cur) => cur.filter((_, idx) => idx !== i)),
                },
                h("span", null, i + 1),
                opt,
              ),
            )
          : h("div", null, "Selecciona el primer elemento"),
      ),
      h(
        "div",
        { className: "options compact" },
        ...remainingOptions.map((opt) =>
          h(
            "button",
            {
              className: "option",
              key: opt,
              onClick: () => setOrder((cur) => [...cur, opt]),
            },
            h("span", null, "+"),
            h("b", null, opt),
          ),
        ),
      ),
      h(
        "button",
        {
          className: "primary-btn",
          disabled: submitting || order.length !== options.length,
          onClick: () => onSubmit(order),
        },
        "Enviar orden",
      ),
    );
  } else if (question.question_type === "hotspot" && question.media_url) {
    answerControl = h(
      React.Fragment,
      null,
      h("p", { className: "hint" }, "Toca la zona que consideres correcta."),
      h(
        "div",
        {
          className: "hotspot",
          onClick: (e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setHotspot({
              x: +(((e.clientX - r.left) / r.width) * 100).toFixed(2),
              y: +(((e.clientY - r.top) / r.height) * 100).toFixed(2),
            });
          },
        },
        h("img", { src: question.media_url, alt: "Imagen de la pregunta" }),
        hotspot
          ? h("i", { style: { left: `${hotspot.x}%`, top: `${hotspot.y}%` } })
          : null,
      ),
      h(
        "button",
        {
          className: "primary-btn",
          disabled: submitting || !hotspot,
          onClick: () => onSubmit(hotspot),
        },
        "Enviar ubicación",
      ),
    );
  } else {
    answerControl = h(
      "div",
      { className: "error-box" },
      "Este reactivo necesita actualizarse. Espera a que el docente continúe.",
    );
  }

  const pct = Math.max(
    0,
    Math.min(
      100,
      (remaining / Math.max(1, Number(question.timer_seconds || 30))) * 100,
    ),
  );
  return h(
    React.Fragment,
    null,
    h(
      "div",
      { className: "progress" },
      h(
        "div",
        null,
        h(
          "span",
          null,
          `Pregunta ${question.position} de ${Math.max(questionCount, question.position || 1)}`,
        ),
        h("b", null, `${remaining} s`),
      ),
      h("i", null, h("b", { style: { width: `${pct}%` } })),
    ),
    h(
      "section",
      { className: "question-card" },
      h(
        "div",
        { className: "chips" },
        h("span", null, safeText(question.question_type, "reactivo").replace(/_/g, " ")),
        h("span", { className: "live" }, "Respondiendo"),
      ),
      h("h1", null, question.prompt),
      h(Media, { question }),
      h("div", { className: "answer-area" }, answerControl),
      h("p", { className: "secure" }, "Tu respuesta se registra una sola vez."),
    ),
  );
}

function Result({ reveal, question, session }) {
  const own = reveal.own;
  const correct = own?.is_correct;
  const tone =
    correct === true ? "good" : correct === false ? "bad" : "neutral";
  const options = Array.isArray(question.options)
    ? question.options.map(String)
    : [];
  const group = Array.isArray(reveal.group) ? reveal.group : [];
  const counts = new Map(
    group.map((row) => [
      String(row.answer),
      Number(row.votes || 0),
    ]),
  );
  const total = Number(
    group[0]?.total || [...counts.values()].reduce((a, b) => a + b, 0),
  );
  return h(
    "section",
    { className: "result-card" },
    h(
      "div",
      { className: `personal ${tone}` },
      h(
        "div",
        { className: "result-icon" },
        correct === true ? "✓" : correct === false ? "×" : "•",
      ),
      h("span", { className: "eyebrow" }, "RESULTADO"),
      h(
        "h1",
        null,
        correct === true
          ? "Correcto"
          : correct === false
            ? "Revisa esta respuesta"
            : "Respuesta registrada",
      ),
      session.competitive
        ? h(
            "div",
            { className: "result-stats" },
            h(
              "div",
              null,
              h("span", null, "Puntos"),
              h("b", null, own?.points ?? "—"),
            ),
            h(
              "div",
              null,
              h("span", null, "Posición"),
              h("b", null, reveal.rank?.rank ? `#${reveal.rank.rank}` : "—"),
            ),
            session.team_mode
              ? h(
                  "div",
                  null,
                  h("span", null, "Equipo"),
                  h(
                    "b",
                    null,
                    reveal.rank?.team_rank ? `#${reveal.rank.team_rank}` : "—",
                  ),
                )
              : null,
          )
        : null,
    ),
    reveal.correctAnswer != null
      ? h(
          "div",
          { className: "correct-box" },
          h("span", null, "Respuesta de referencia"),
          h(
            "b",
            null,
            Array.isArray(reveal.correctAnswer)
              ? reveal.correctAnswer.join(" · ")
              : typeof reveal.correctAnswer === "object"
                ? "Zona indicada por el docente"
                : String(reveal.correctAnswer),
          ),
        )
      : null,
    options.length
      ? h(
          "div",
          { className: "group-results" },
          h("h2", null, "Resultados del grupo"),
          ...options.map((opt, i) => {
            const n = counts.get(opt) || 0;
            const p = total ? Math.round((n / total) * 100) : 0;
            return h(
              "div",
              { className: "bar-row", key: opt },
              h(
                "p",
                null,
                h("span", null, `${String.fromCharCode(65 + i)} · ${opt}`),
                h("b", null, `${p}%`),
              ),
              h("i", null, h("b", { style: { width: `${p}%` } })),
            );
          }),
        )
      : null,
    reveal.explanation
      ? h(
          "div",
          { className: "explanation" },
          h("b", null, "Explicación"),
          h("p", null, reveal.explanation),
        )
      : null,
  );
}

function Finished({ student, rank, onLeave }) {
  return h(
    "section",
    { className: "state-card center" },
    h("div", { className: "finish-mark" }, "✓"),
    h("span", { className: "eyebrow" }, "SESIÓN FINALIZADA"),
    h("h1", null, "Clase completada"),
    h("p", null, `Gracias por participar, ${student.name || "alumno"}.`),
    h(
      "div",
      { className: "mini-grid final" },
      h(
        "div",
        null,
        h("span", null, "Respondidas"),
        h("b", null, rank?.answered_count ?? "—"),
      ),
      h(
        "div",
        null,
        h("span", null, "Correctas"),
        h("b", null, rank?.correct_count ?? "—"),
      ),
      h(
        "div",
        null,
        h("span", null, "Puntos"),
        h("b", null, rank?.total_points ?? "—"),
      ),
      h(
        "div",
        null,
        h("span", null, "Posición"),
        h("b", null, rank?.rank ? `#${rank.rank}` : "—"),
      ),
    ),
    h(
      "button",
      { className: "secondary-btn", onClick: onLeave },
      "Entrar a otra sesión",
    ),
  );
}

function App() {
  const [student, setStudent] = useState(() => readStoredStudent(queryCode()));
  const [storageReady, setStorageReady] = useState(() => Boolean(readStoredStudent(queryCode())));
  const [workspace, setWorkspace] = useState(null);
  const [reveal, setReveal] = useState(null);
  const [rank, setRank] = useState(null);
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [connection, setConnection] = useState(
    navigator.onLine ? "connecting" : "offline",
  );
  const [answered, setAnswered] = useState(0);
  const [pendingQuestionIds, setPendingQuestionIds] = useState(() => new Set());
  const currentIdRef = useRef(null);
  const submitLockRef = useRef(false);
  const realtimeStatusRef = useRef("");
  const wasOfflineRef = useRef(false);
  const refreshPromiseRef = useRef(null);
  const refreshOwnerKeyRef = useRef("");
  const refreshQueuedRef = useRef("");
  const latestRefreshRef = useRef(null);
  const activeStudentKeyRef = useRef("");
  const sessionMissingRef = useRef(0);

  activeStudentKeyRef.current = student
    ? `${student.sessionId}:${student.participantId}`
    : "";

  useEffect(() => {
    realtimeStatusRef.current = "";
    sessionMissingRef.current = 0;
  }, [student?.sessionId, student?.participantId]);

  useEffect(() => {
    let active = true;
    if (student) {
      setStorageReady(true);
      return () => { active = false; };
    }
    void recoverStoredStudent(queryCode()).then((recovered) => {
      if (!active) return;
      if (recovered) setStudent(recovered);
      setStorageReady(true);
    });
    return () => { active = false; };
  }, []);

  const confirmQuestionLocally = useCallback((studentKey, questionId, confirmation) => {
    if (
      activeStudentKeyRef.current !== studentKey
      || !questionId
      || !confirmation?.submitted_at
    ) return;
    setWorkspace((current) => {
      if (
        activeStudentKeyRef.current !== studentKey
        || current?.current?.id !== questionId
        || current.own?.submitted_at
      ) return current;
      return {
        ...current,
        own: {
          answer: null,
          is_correct: null,
          points: 0,
          streak: 0,
          submitted_at: confirmation.submitted_at,
        },
      };
    });
  }, []);

  const refresh = useCallback(() => {
    if (!student || !configReady) return Promise.resolve(false);
    const studentKey = `${student.sessionId}:${student.participantId}`;
    if (refreshPromiseRef.current) {
      refreshQueuedRef.current = studentKey;
      if (refreshOwnerKeyRef.current === studentKey) return refreshPromiseRef.current;
      return refreshPromiseRef.current.then(() => {
        if (activeStudentKeyRef.current !== studentKey) return false;
        return latestRefreshRef.current?.() || false;
      });
    }
    const task = (async () => {
      try {
      let next = await fetchWorkspace(student);
      if (activeStudentKeyRef.current !== studentKey) return false;
      sessionMissingRef.current = 0;
      const outbox = await readOutbox();
      const pendingItems = outbox.items.filter(
        (item) => item.sessionId === student.sessionId
          && item.participantId === student.participantId,
      );
      let recoveredAny = false;
      for (const pending of pendingItems) {
        if (!navigator.onLine || activeStudentKeyRef.current !== studentKey) break;
        try {
          void recordHealth(student, "response_queued", null, { question_id: pending.questionId });
          const receipt = await submitWithReceipt(pending);
          if (activeStudentKeyRef.current !== studentKey) return false;
          confirmQuestionLocally(studentKey, pending.questionId, receipt);
          await clearOutbox(pending.requestId);
          if (activeStudentKeyRef.current !== studentKey) return false;
          recoveredAny = true;
          if (receipt.status === "already_recorded") {
            setNotice({ tone: "info", message: "TEDVIO conservó la primera respuesta registrada para esta pregunta." });
          } else {
            setNotice({ tone: "success", message: "Respuesta recuperada y confirmada por TEDVIO." });
          }
          void recordHealth(student, "response_recovered", null, {
            question_id: pending.questionId,
            receipt_status: receipt.status,
          });
        } catch (pendingError) {
          if (isRetryable(pendingError)) break;
          let storedReceipt = null;
          let receiptCheckFailed = false;
          try {
            storedReceipt = await fetchAnswerReceipt(pending);
          } catch {
            receiptCheckFailed = true;
          }
          if (activeStudentKeyRef.current !== studentKey) return false;
          if (storedReceipt?.submitted_at) {
            confirmQuestionLocally(studentKey, pending.questionId, storedReceipt);
            await clearOutbox(pending.requestId);
            if (activeStudentKeyRef.current !== studentKey) return false;
            recoveredAny = true;
            setNotice({ tone: "success", message: "La respuesta ya estaba confirmada en la clase." });
          } else if (!receiptCheckFailed && /QUESTION_(?:NOT_LIVE|EXPIRED)/i.test(String(pendingError?.message || pendingError))) {
            await clearOutbox(pending.requestId);
            if (activeStudentKeyRef.current !== studentKey) return false;
            setNotice({ tone: "warning", message: "Una respuesta pendiente venció antes de poder enviarse." });
          }
        }
      }
      if (recoveredAny) next = await fetchWorkspace(student);
      if (activeStudentKeyRef.current !== studentKey) return false;
      const remainingOutbox = await readOutbox();
      if (activeStudentKeyRef.current !== studentKey) return false;
      setPendingQuestionIds(new Set(
        remainingOutbox.items
          .filter((item) => item.sessionId === student.sessionId && item.participantId === student.participantId)
          .map((item) => item.questionId),
      ));
      setWorkspace((current) => {
        if (activeStudentKeyRef.current !== studentKey) return current;
        if (
          current?.current?.id === next.current?.id
          && current.own?.submitted_at
          && !next.own?.submitted_at
        ) return { ...next, own: current.own };
        return next;
      });
      currentIdRef.current = next.current?.id || null;
      if (next.session.status === "closed") {
        const client = await getSupabase();
        const { data, error: feedbackError } = await client.rpc("v2_student_feedback", {
          p_session_id: next.session.id,
          p_participant_id: student.participantId,
        });
        if (feedbackError) throw feedbackError;
        if (activeStudentKeyRef.current !== studentKey) return false;
        setRank(data?.[0] || null);
        setReveal(null);
      } else if (next.current?.status === "revealed") {
        const nextReveal = await fetchReveal(student, next.session, next.current);
        if (activeStudentKeyRef.current !== studentKey) return false;
        setReveal(nextReveal);
      } else {
        setReveal(null);
      }
      setError("");
      return true;
      } catch (e) {
      if (activeStudentKeyRef.current !== studentKey) return false;
      if (String(e?.message || e).includes("SESSION_NOT_FOUND")) {
        sessionMissingRef.current += 1;
        if (sessionMissingRef.current < 3) {
          setError("Verificando si la sesión continúa disponible…");
        } else {
          await clearStudent(student);
          if (activeStudentKeyRef.current !== studentKey) return false;
          setStudent(null);
          setWorkspace(null);
          setPendingQuestionIds(new Set());
          setError("La sesión ya no está disponible.");
        }
      } else {
        sessionMissingRef.current = 0;
        setError(friendly(e));
      }
      return false;
      } finally {
        if (refreshPromiseRef.current === task) {
          refreshPromiseRef.current = null;
          refreshOwnerKeyRef.current = "";
          const queuedKey = refreshQueuedRef.current;
          refreshQueuedRef.current = "";
          if (queuedKey === studentKey && activeStudentKeyRef.current === queuedKey) {
            window.setTimeout(() => void latestRefreshRef.current?.(), 0);
          }
        }
      }
    })();
    refreshPromiseRef.current = task;
    refreshOwnerKeyRef.current = studentKey;
    return task;
  }, [student, confirmQuestionLocally]);
  latestRefreshRef.current = refresh;

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      setConnection("reconnecting");
      if (wasOfflineRef.current && student) {
        wasOfflineRef.current = false;
        void recordHealth(student, "client_offline", null, { reason: "recovered_after_offline" });
      }
      void refresh();
    };
    const onOffline = () => {
      wasOfflineRef.current = true;
      setOnline(false);
      setConnection("offline");
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    addEventListener("online", onOnline);
    addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      removeEventListener("online", onOnline);
      removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  useEffect(() => {
    if (!student || !configReady) return;
    let disposed = false;
    let realtimeClient = null;
    let channel = null;
    let pollTimer = 0;
    let eventTimer = 0;
    let fetchFailures = 0;
    let recoveryStep = 0;
    realtimeStatusRef.current = "";

    const schedulePoll = () => {
      window.clearTimeout(pollTimer);
      if (disposed || !navigator.onLine || document.visibilityState !== "visible") return;
      const recovering = [2_000, 4_000, 8_000, 15_000, 30_000];
      const base = realtimeStatusRef.current === "SUBSCRIBED"
        ? 30_000
        : recovering[Math.min(recoveryStep, recovering.length - 1)];
      const jittered = Math.round(base * (0.9 + Math.random() * 0.2));
      pollTimer = window.setTimeout(async () => {
        if (realtimeStatusRef.current !== "SUBSCRIBED") {
          recoveryStep = Math.min(recoveryStep + 1, recovering.length - 1);
        }
        const ok = await refresh();
        fetchFailures = ok ? 0 : Math.min(fetchFailures + 1, recovering.length - 1);
        schedulePoll();
      }, jittered);
    };

    const requestSync = (delay = 220) => {
      if (
        eventTimer
        || disposed
        || !navigator.onLine
        || document.visibilityState !== "visible"
      ) return;
      eventTimer = window.setTimeout(async () => {
        eventTimer = 0;
        const ok = await refresh();
        fetchFailures = ok ? 0 : Math.min(fetchFailures + 1, 4);
        schedulePoll();
      }, delay);
    };

    const resumePolling = () => {
      if (navigator.onLine && document.visibilityState === "visible") schedulePoll();
    };
    const pausePolling = () => {
      window.clearTimeout(pollTimer);
      window.clearTimeout(eventTimer);
      eventTimer = 0;
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") resumePolling();
      else pausePolling();
    };

    addEventListener("online", resumePolling);
    addEventListener("offline", pausePolling);
    document.addEventListener("visibilitychange", handleVisibility);

    void getSupabase()
      .then((client) => {
        if (disposed) return;
        realtimeClient = client;
        channel = client
          .channel(`student-v2-${student.sessionId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "v2_sessions",
              filter: `id=eq.${student.sessionId}`,
            },
            () => requestSync(),
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "v2_questions",
              filter: `session_id=eq.${student.sessionId}`,
            },
            () => requestSync(),
          )
          .subscribe((status) => {
            if (disposed || realtimeStatusRef.current === status) return;
            realtimeStatusRef.current = status;
            if (!navigator.onLine) setConnection("offline");
            else if (status === "SUBSCRIBED") {
              setConnection("connected");
              fetchFailures = 0;
              recoveryStep = 0;
              void recordHealth(student, "client_connected");
            } else {
              setConnection("reconnecting");
              fetchFailures = Math.min(fetchFailures + 1, 4);
              recoveryStep = Math.min(recoveryStep + 1, 4);
              void recordHealth(student, "client_reconnecting", null, { reason: status });
            }
            schedulePoll();
          });
        requestSync(0);
        schedulePoll();
      })
      .catch(() => {
        if (!disposed) {
          setConnection(navigator.onLine ? "reconnecting" : "offline");
          schedulePoll();
        }
      });
    return () => {
      disposed = true;
      window.clearTimeout(pollTimer);
      window.clearTimeout(eventTimer);
      removeEventListener("online", resumePolling);
      removeEventListener("offline", pausePolling);
      document.removeEventListener("visibilitychange", handleVisibility);
      realtimeStatusRef.current = "";
      if (realtimeClient && channel) void realtimeClient.removeChannel(channel);
    };
  }, [student, refresh]);

  const onJoin = async ({ code, name, matricula, team }) => {
    setBusy(true);
    setError("");
    setNotice(null);
    try {
      const client = await getSupabase();
      const { data, error: joinError } = await client.rpc(
        "v2_join_session_v3",
        {
          p_code: code.trim().toUpperCase(),
          p_name: name.trim(),
          p_matricula: matricula.trim() || null,
          p_team: team.trim() || null,
        },
      );
      if (joinError) throw joinError;
      const row = data?.[0];
      if (!row?.session_id || !row?.participant_id)
        throw new Error("No pudimos entrar a esa sesión.");
      const next = {
        sessionId: row.session_id,
        participantId: row.participant_id,
        name: row.display_name || name.trim(),
        team: row.team_name || team.trim(),
        matricula: matricula.trim(),
        code: code.trim().toUpperCase(),
      };
      await saveStudent(next);
      setStudent(next);
      setStorageReady(true);
      setWorkspace(null);
      setReveal(null);
      setRank(null);
      setPendingQuestionIds(new Set());
      setAnswered(0);
      void recordHealth(next, "client_connected");
      history.replaceState(
        {},
        "",
        `${location.pathname}?code=${encodeURIComponent(next.code)}`,
      );
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (answer) => {
    if (!workspace?.current || !student || submitting || submitLockRef.current)
      return;
    submitLockRef.current = true;
    setSubmitting(true);
    setError("");
    setNotice(null);
    const freshPending = {
      sessionId: student.sessionId,
      participantId: student.participantId,
      questionId: workspace.current.id,
      answer,
      requestId: createRequestId(),
      createdAt: new Date().toISOString(),
      status: "pending",
    };
    let pending = freshPending;
    const studentKey = `${student.sessionId}:${student.participantId}`;
    const submittedAt = performance.now();
    let recoveryStorage = "memory";
    try {
      const queued = await getOrCreateOutboxEntry(freshPending);
      pending = queued.entry;
      recoveryStorage = queued.storage;
      setPendingQuestionIds((current) => new Set(current).add(pending.questionId));
      const receipt = await submitWithReceipt(pending);
      confirmQuestionLocally(studentKey, pending.questionId, receipt);
      await clearOutbox(pending.requestId);
      if (activeStudentKeyRef.current !== studentKey) return;
      setPendingQuestionIds((current) => {
        const next = new Set(current);
        next.delete(pending.questionId);
        return next;
      });
      if (receipt.status === "recorded") setAnswered((n) => n + 1);
      setNotice({
        tone: receipt.status === "already_recorded" ? "info" : "success",
        message: receipt.status === "already_recorded"
          ? "Ya existía una respuesta; TEDVIO conservó la primera registrada."
          : "Respuesta confirmada por TEDVIO.",
      });
      void recordHealth(student, "response_confirmed", performance.now() - submittedAt, {
        question_id: workspace.current.id,
        receipt_status: receipt.status,
        recovery_storage: recoveryStorage,
      });
      await refresh();
    } catch (e) {
      let storedReceipt = null;
      let receiptCheckFailed = false;
      if (navigator.onLine && configReady) {
        try {
          storedReceipt = await fetchAnswerReceipt(pending);
        } catch {
          receiptCheckFailed = true;
        }
      } else receiptCheckFailed = true;
      if (activeStudentKeyRef.current !== studentKey) return;
      if (storedReceipt?.submitted_at) {
        confirmQuestionLocally(studentKey, pending.questionId, storedReceipt);
        await clearOutbox(pending.requestId);
        if (activeStudentKeyRef.current !== studentKey) return;
        setPendingQuestionIds((current) => {
          const next = new Set(current);
          next.delete(pending.questionId);
          return next;
        });
        setNotice({ tone: "success", message: "Respuesta confirmada por TEDVIO." });
        void recordHealth(student, "response_recovered", performance.now() - submittedAt, {
          question_id: pending.questionId,
          receipt_status: "confirmed_by_reconciliation",
        });
      } else if (!receiptCheckFailed && /QUESTION_(?:NOT_LIVE|EXPIRED)/i.test(String(e?.message || e))) {
        await clearOutbox(pending.requestId);
        if (activeStudentKeyRef.current !== studentKey) return;
        setPendingQuestionIds((current) => {
          const next = new Set(current);
          next.delete(pending.questionId);
          return next;
        });
        setNotice({ tone: "warning", message: "El tiempo terminó antes de que TEDVIO pudiera registrar esta respuesta." });
      } else if (isRetryable(e) || receiptCheckFailed) {
        setNotice({
          tone: "warning",
          message: recoveryStorage === "memory"
            ? "Respuesta pendiente · mantén esta pantalla abierta para que TEDVIO vuelva a enviarla."
            : "Respuesta guardada · pendiente de sincronizar cuando vuelva la conexión.",
        });
        void recordHealth(student, "response_queued", performance.now() - submittedAt, {
          question_id: pending.questionId,
          recovery_storage: recoveryStorage,
        });
      } else {
        setError(friendly(e));
        setNotice({ tone: "warning", message: "Conservamos la respuesta pendiente para verificarla nuevamente." });
        void recordHealth(student, "response_failed", performance.now() - submittedAt, { question_id: pending.questionId, reason: friendly(e) });
      }
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  const leave = async () => {
    if (submitting) return;
    await clearStudent(student);
    setStudent(null);
    setWorkspace(null);
    setReveal(null);
    setRank(null);
    setPendingQuestionIds(new Set());
    setError("");
    setNotice(null);
    history.replaceState({}, "", location.pathname);
  };

  if (!storageReady) {
    studentLiveStage = "boot";
    return h(
      "div",
      { className: "app-shell" },
      h("main", { className: "main" }, h("section", { className: "state-card center" },
        h("div", { className: "pulse" }, h("i")),
        h("h1", null, "Recuperando tu clase…"),
      )),
    );
  }

  if (!configReady)
    return h(
      "div",
      { className: "app-shell" },
      h("main", { className: "main" }, h("section", { className: "state-card center" },
        h("div", { className: "muted-mark" }, "!"),
        h("h1", null, "No pudimos iniciar TEDVIO"),
        h("p", null, "Actualiza la página. Si continúa, avisa al docente para revisar la conexión."),
      )),
    );

  if (!student) {
    studentLiveStage = "join";
    return h(JoinScreen, { initialCode: queryCode(), busy, error, onJoin });
  }
  if (!workspace) {
    studentLiveStage = "boot";
    return h(
      "div",
      { className: "app-shell" },
      h(Header, { session: null, connection: online ? connection : "offline" }),
      h(
        "main",
        { className: "main" },
        h(
          "section",
          { className: "state-card center" },
          h("div", { className: "pulse" }, h("i")),
          h("h1", null, "Conectando con tu clase…"),
          error ? h("div", { className: "error-box" }, error) : null,
        ),
      ),
    );
  }

  const { session, current, questions, own } = workspace;
  let body;
  if (session.status === "closed") {
    studentLiveStage = "finished";
    body = h(Finished, { student, rank, onLeave: leave });
  } else if (!current) {
    studentLiveStage = "lobby";
    body = h(Waiting, { student, session, answered });
  } else if (current.status === "revealed" && reveal?.questionId === current.id) {
    studentLiveStage = "result";
    body = h(Result, { reveal, question: current, session });
  } else {
    studentLiveStage = "question";
    body = h(Question, {
      key: current.id,
      question: current,
      questionCount: questions.length,
      own,
      pending: pendingQuestionIds.has(current.id),
      submitting,
      onSubmit: submit,
    });
  }

  return h(
    "div",
    { className: "app-shell" },
    h(Header, { session, connection: online ? connection : "offline" }),
    h(
      "main",
      { className: "main" },
      error ? h("div", { className: "error-box floating" }, error) : null,
      notice ? h("div", { className: `notice-box ${notice.tone} floating`, role: "status", "aria-live": "polite" }, notice.message) : null,
      body,
      h(
        "button",
        { className: "leave-link", onClick: leave, disabled: submitting },
        "Salir de la sesión",
      ),
    ),
  );
}

const studentRoot = document.getElementById("studentApp");
if (!studentRoot) throw new Error("TEDVIO no encontró la superficie del alumno.");
createRoot(studentRoot).render(
  h(
    LiveSurfaceErrorBoundary,
    {
      surface: "student-v2",
      homeHref: "/student-v2/",
      classifyError: classifyRenderError,
      onFatal: reportStudentFatal,
    },
    h(App),
  ),
);
