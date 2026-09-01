import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "https://esm.sh/react@19.2.0";
import { createRoot } from "https://esm.sh/react-dom@19.2.0/client";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.4";

const h = React.createElement;
const cfg = window.TEDVIO_CONFIG || {};
const supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY);
const STORAGE_KEY = "tedvio.student.v2.native";
const LEGACY_KEY = "tedvio_v2_student";
const OUTBOX_KEY = "tedvio.student.v2.outbox";

function queryCode() {
  const direct = new URLSearchParams(location.search).get("code");
  if (direct) return direct.trim().toUpperCase();
  const hash = location.hash.replace(/^#(?:join\?)?/, "");
  return new URLSearchParams(hash).get("code")?.trim().toUpperCase() || "";
}

function readStoredStudent(expectedCode = "") {
  for (const key of [STORAGE_KEY, LEGACY_KEY]) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      if (
        value?.sessionId &&
        value?.participantId &&
        (!expectedCode || value.code === expectedCode)
      )
        return value;
    } catch {}
  }
  return null;
}

function saveStudent(student) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(student));
}

function clearStudent() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_KEY);
  localStorage.removeItem(OUTBOX_KEY);
}

function readOutbox() {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY) || "null");
  } catch {
    return null;
  }
}

function saveOutbox(value) {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(value));
}
function clearOutbox() {
  localStorage.removeItem(OUTBOX_KEY);
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

async function recordHealth(student, eventType, latencyMs = null, details = {}) {
  if (!student?.sessionId || !student?.participantId || !navigator.onLine) return;
  await supabase.rpc("v2_record_session_health", {
    p_session_id: student.sessionId,
    p_participant_id: student.participantId,
    p_event_type: eventType,
    p_latency_ms: latencyMs == null ? null : Math.max(0, Math.round(latencyMs)),
    p_details: { surface: "student-v2", ...details },
  });
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

function secondsLeft(question) {
  if (!question?.launched_at || question.status !== "live") return 0;
  const elapsed =
    (Date.now() - new Date(question.launched_at).getTime()) / 1000;
  return Math.max(0, Math.ceil(Number(question.timer_seconds || 30) - elapsed));
}

async function fetchWorkspace(student) {
  const { data: session, error: sessionError } = await supabase
    .from("v2_sessions")
    .select(
      "id,code,title,status,current_question_id,competitive,team_mode,started_at,closed_at",
    )
    .eq("id", student.sessionId)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!session) throw new Error("SESSION_NOT_FOUND");

  const { data: questions, error: questionError } = await supabase
    .from("v2_questions")
    .select(
      "id,position,prompt,question_type,options,media_url,media_type,timer_seconds,status,launched_at,closed_at",
    )
    .eq("session_id", session.id)
    .order("position");
  if (questionError) throw questionError;

  const current =
    (questions || []).find((q) => q.id === session.current_question_id) || null;
  let own = null;
  if (current) {
    const { data } = await supabase.rpc("v2_student_answer_result", {
      p_question_id: current.id,
      p_participant_id: student.participantId,
    });
    own = data?.[0] || null;
  }
  return { session, questions: questions || [], current, own };
}

async function fetchReveal(student, session, question) {
  const [own, feedback, rank, group, correct] = await Promise.all([
    supabase.rpc("v2_student_answer_result", {
      p_question_id: question.id,
      p_participant_id: student.participantId,
    }),
    supabase.rpc("v2_student_answer_feedback", {
      p_question_id: question.id,
      p_participant_id: student.participantId,
    }),
    supabase.rpc("v2_student_feedback", {
      p_session_id: session.id,
      p_participant_id: student.participantId,
    }),
    supabase.rpc("v2_public_question_results", {
      p_session_id: session.id,
      p_question_id: question.id,
    }),
    supabase
      .from("v2_questions")
      .select("correct_answer")
      .eq("id", question.id)
      .maybeSingle(),
  ]);
  return {
    own: own.data?.[0] || null,
    explanation: feedback.data?.[0]?.explanation || "",
    rank: rank.data?.[0] || null,
    group: group.data || [],
    correctAnswer: correct.data?.correct_answer ?? null,
  };
}

function Header({ session, connection }) {
  const healthy = connection === "connected";
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
        { className: healthy ? "net ok" : "net bad" },
        healthy
          ? "Conectado"
          : connection === "offline"
            ? "Sin conexión"
            : "Reconectando",
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

function Question({ question, questionCount, own, submitting, onSubmit }) {
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
          onClick: () => onSubmit(selected),
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
        h("span", null, question.question_type.replaceAll("_", " ")),
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
  const counts = new Map(
    (reveal.group || []).map((row) => [
      String(row.answer),
      Number(row.votes || 0),
    ]),
  );
  const total = Number(
    reveal.group?.[0]?.total || [...counts.values()].reduce((a, b) => a + b, 0),
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
  const [workspace, setWorkspace] = useState(null);
  const [reveal, setReveal] = useState(null);
  const [rank, setRank] = useState(null);
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [connection, setConnection] = useState(
    navigator.onLine ? "connecting" : "offline",
  );
  const [answered, setAnswered] = useState(0);
  const currentIdRef = useRef(null);
  const submitLockRef = useRef(false);
  const realtimeStatusRef = useRef("");
  const wasOfflineRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!student) return;
    try {
      let next = await fetchWorkspace(student);
      const pending = readOutbox();
      if (
        pending &&
        pending.sessionId === student.sessionId &&
        pending.participantId === student.participantId
      ) {
        if (
          next.current?.id === pending.questionId &&
          next.current.status === "live" &&
          !next.own &&
          navigator.onLine
        ) {
          void recordHealth(student, "response_queued", null, { question_id: pending.questionId });
          const { error: retryError } = await supabase.rpc(
            "v2_submit_response",
            {
              p_question_id: pending.questionId,
              p_participant_id: pending.participantId,
              p_answer: pending.answer,
            },
          );
          if (!retryError || isDuplicate(retryError)) {
            clearOutbox();
            next = await fetchWorkspace(student);
            setAnswered((value) => value + (retryError ? 0 : 1));
            void recordHealth(student, "response_recovered", null, { question_id: pending.questionId });
          }
        } else if (
          next.own ||
          next.current?.id !== pending.questionId ||
          next.current?.status !== "live"
        ) {
          clearOutbox();
        }
      }
      setWorkspace(next);
      currentIdRef.current = next.current?.id || null;
      if (next.session.status === "closed") {
        const { data } = await supabase.rpc("v2_student_feedback", {
          p_session_id: next.session.id,
          p_participant_id: student.participantId,
        });
        setRank(data?.[0] || null);
        setReveal(null);
      } else if (next.current?.status === "revealed") {
        setReveal(await fetchReveal(student, next.session, next.current));
      } else {
        setReveal(null);
      }
      setError("");
    } catch (e) {
      if (String(e?.message || e).includes("SESSION_NOT_FOUND")) {
        clearStudent();
        setStudent(null);
        setWorkspace(null);
        setError("La sesión ya no está disponible.");
      } else setError(friendly(e));
    }
  }, [student]);

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
    if (!student) return;
    void refresh();
    const interval = setInterval(refresh, 4000);
    const channel = supabase
      .channel(`student-v2-${student.sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "v2_sessions",
          filter: `id=eq.${student.sessionId}`,
        },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "v2_questions",
          filter: `session_id=eq.${student.sessionId}`,
        },
        () => void refresh(),
      )
      .subscribe((status) => {
        if (realtimeStatusRef.current === status) return;
        realtimeStatusRef.current = status;
        if (!navigator.onLine) setConnection("offline");
        else if (status === "SUBSCRIBED") {
          setConnection("connected");
          void recordHealth(student, "client_connected");
        } else {
          setConnection("reconnecting");
          void recordHealth(student, "client_reconnecting", null, { reason: status });
        }
      });
    return () => {
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [student, refresh]);

  const onJoin = async ({ code, name, matricula, team }) => {
    setBusy(true);
    setError("");
    try {
      const { data, error: joinError } = await supabase.rpc(
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
      saveStudent(next);
      setStudent(next);
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
    const pending = {
      sessionId: student.sessionId,
      participantId: student.participantId,
      questionId: workspace.current.id,
      answer,
      createdAt: new Date().toISOString(),
    };
    saveOutbox(pending);
    const submittedAt = performance.now();
    try {
      const { error: submitError } = await supabase.rpc("v2_submit_response", {
        p_question_id: workspace.current.id,
        p_participant_id: student.participantId,
        p_answer: answer,
      });
      if (submitError && !isDuplicate(submitError)) throw submitError;
      clearOutbox();
      if (!submitError) setAnswered((n) => n + 1);
      void recordHealth(student, "response_confirmed", performance.now() - submittedAt, { question_id: workspace.current.id });
      await refresh();
    } catch (e) {
      if (isRetryable(e)) {
        setError(
          "Respuesta guardada en este dispositivo. La enviaremos al recuperar la conexión.",
        );
      } else {
        clearOutbox();
        setError(friendly(e));
        void recordHealth(student, "response_failed", performance.now() - submittedAt, { question_id: workspace.current.id, reason: friendly(e) });
        await refresh();
      }
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  const leave = () => {
    clearStudent();
    setStudent(null);
    setWorkspace(null);
    setReveal(null);
    setRank(null);
    setError("");
    history.replaceState({}, "", location.pathname);
  };

  if (!student)
    return h(JoinScreen, { initialCode: queryCode(), busy, error, onJoin });
  if (!workspace)
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

  const { session, current, questions, own } = workspace;
  let body;
  if (session.status === "closed")
    body = h(Finished, { student, rank, onLeave: leave });
  else if (!current) body = h(Waiting, { student, session, answered });
  else if (current.status === "revealed" && reveal)
    body = h(Result, { reveal, question: current, session });
  else
    body = h(Question, {
      question: current,
      questionCount: questions.length,
      own,
      submitting,
      onSubmit: submit,
    });

  return h(
    "div",
    { className: "app-shell" },
    h(Header, { session, connection: online ? connection : "offline" }),
    h(
      "main",
      { className: "main" },
      error ? h("div", { className: "error-box floating" }, error) : null,
      body,
      h(
        "button",
        { className: "leave-link", onClick: leave },
        "Salir de la sesión",
      ),
    ),
  );
}

createRoot(document.getElementById("studentApp")).render(h(App));
