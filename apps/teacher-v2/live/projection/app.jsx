import React, {
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
let projectionClient;
let projectionClientPromise;
let qrRendererPromise;

async function getProjectionClient() {
  if (!configReady) throw new Error("TEDVIO no pudo cargar su configuración.");
  if (projectionClient) return projectionClient;
  if (!projectionClientPromise) {
    projectionClientPromise = import("@supabase/supabase-js")
      .then(({ createClient }) => {
        projectionClient = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY);
        return projectionClient;
      })
      .catch((error) => {
        projectionClientPromise = undefined;
        throw error;
      });
  }
  return projectionClientPromise;
}

function getQrRenderer() {
  if (!qrRendererPromise) {
    qrRendererPromise = import("qrcode")
      .then((module) => module.default || module)
      .catch((error) => {
        qrRendererPromise = undefined;
        throw error;
      });
  }
  return qrRendererPromise;
}
const typeLabel = {
  multiple_choice: "Opción múltiple",
  multiple_select: "Selección múltiple",
  true_false: "Verdadero / Falso",
  open_text: "Respuesta abierta",
  numeric: "Numérica",
  poll: "Encuesta",
  scale_5: "Escala 1–5",
  ordering: "Ordenamiento",
  hotspot: "Zona de imagen",
};

function useCode() {
  const initial = new URLSearchParams(location.search).get("code") || "";
  return useState(initial.trim());
}
async function loadProjection(client, code, previous = null) {
  const sb = client;
  const { data: meta, error: me } = await sb.rpc("v2_public_session_meta", {
    p_code: code,
  });
  if (me) throw me;
  const s = meta?.[0];
  if (!s) return null;
  const [countsResult, sessionResult, peopleResult] =
    await Promise.all([
      sb.rpc("v2_public_live_counts", { p_code: code }),
      sb
        .from("v2_sessions")
        .select("id,current_question_id,status,competitive,team_mode")
        .eq("id", s.session_id)
        .maybeSingle(),
      sb.rpc("v2_public_session_people", { p_code: code }),
    ]);
  if (sessionResult.error) throw sessionResult.error;
  const srow = sessionResult.data;
  if (!srow) return null;
  const issues = [];
  if (countsResult.error) issues.push("counts");
  if (peopleResult.error) issues.push("people");
  const counts = countsResult.error
    ? previous?.counts || { participant_count: 0, answered_count: 0 }
    : countsResult.data?.[0] || { participant_count: 0, answered_count: 0 };
  const people = peopleResult.error ? previous?.people || [] : peopleResult.data || [];
  let q = null,
    ranking = [],
    results = [];
  if (srow.current_question_id) {
    const questionResult = await sb
      .from("v2_questions")
      .select("*")
      .eq("id", srow.current_question_id)
      .maybeSingle();
    if (questionResult.error || !questionResult.data) {
      issues.push("question");
      q = previous?.q?.id === srow.current_question_id ? previous.q : null;
    } else q = questionResult.data;
    if (q?.status === "revealed") {
      const result = await sb.rpc("v2_public_question_results", {
        p_session_id: s.session_id,
        p_question_id: q.id,
      });
      if (result.error) {
        issues.push("results");
        results = previous?.q?.id === q.id ? previous.results || [] : [];
      } else results = result.data || [];
    }
  }
  const currentSession = { ...s, ...srow };
  if (currentSession.competitive) {
    const result = await sb.rpc("v2_public_ranking", { p_code: code });
    if (result.error) {
      issues.push("ranking");
      ranking = previous?.ranking || [];
    } else ranking = result.data || [];
  }
  const attemptedAt = new Date().toISOString();
  return {
    s: currentSession,
    counts,
    people,
    q,
    ranking,
    results,
    closed: srow.status === "closed",
    partial: issues,
    transitioning: Boolean(srow.current_question_id && !q),
    lastAttemptedAt: attemptedAt,
    lastSyncedAt: issues.length ? previous?.lastSyncedAt || null : attemptedAt,
  };
}
function remaining(q) {
  if (!q?.launched_at || q.status !== "live") return 0;
  return Math.max(
    0,
    Math.ceil(
      Number(q.timer_seconds || 30) -
        (Date.now() - new Date(q.launched_at).getTime()) / 1000,
    ),
  );
}
function logo() {
  return h("img", {
    className: "p2-logo",
    src: "../assets/tedvio_official_horizontal.svg",
    alt: "TEDVIO",
  });
}
function QR({ code }) {
  const ref = useRef(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    let cancelled = false;
    const canvas = ref.current;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setFailed(false);
    void getQrRenderer()
      .then((QRCode) => QRCode.toCanvas(canvas, `${location.origin}/student-v2/?code=${encodeURIComponent(code)}`, {
        width: 230,
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#0c2853", light: "#ffffff" },
      }))
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);
  return h(
    "div",
    { className: "p2-qr" },
    h("canvas", { ref, width: 230, height: 230, "aria-label": `Código QR de la sesión ${code}` }),
    failed ? h("span", { className: "p2-qr-fallback" }, `Código ${code}`) : null,
  );
}
function Ranking({ rows, teamMode }) {
  let arr = rows || [];
  if (teamMode) {
    const map = new Map();
    arr.forEach((r) => {
      const k = r.team || "Sin equipo",
        x = map.get(k) || { name: k, points: 0, correct: 0 };
      x.points += Number(r.points || 0);
      x.correct += Number(r.correct || 0);
      map.set(k, x);
    });
    arr = [...map.values()].sort((a, b) => b.points - a.points);
  }
  return h(
    "section",
    { className: "p2-ranking" },
    h("h2", null, teamMode ? "🏆 Equipos" : "🏆 Ranking"),
    arr.length
      ? arr
          .slice(0, 8)
          .map((r, i) =>
            h(
              "div",
              { className: "p2-rank", key: `${r.name}-${i}` },
              h("div", { className: "pos" }, i + 1),
              h(
                "div",
                null,
                h("b", null, r.name || "Alumno"),
                h(
                  "div",
                  { className: "p2-sub", style: { fontSize: "12px" } },
                  `${r.correct || 0} correctas`,
                ),
              ),
              h("strong", null, `${r.points || 0} pts`),
            ),
          )
      : h("p", { className: "p2-sub" }, "Aún no hay puntuación."),
  );
}
function Distribution({ q, rows }) {
  if (!q || q.status !== "revealed") return null;
  if (q.question_type === "open_text")
    return h(
      "div",
      { className: "p2-explain" },
      `${rows?.[0]?.total || rows.length || 0} respuestas abiertas registradas.`,
    );
  const counts = new Map(
    (rows || []).map((r) => [String(r.answer), Number(r.votes || 0)]),
  );
  const opts =
    q.question_type === "scale_5"
      ? ["1", "2", "3", "4", "5"]
      : Array.isArray(q.options)
        ? q.options.map(String)
        : [...counts.keys()];
  const total = Number(
    rows?.[0]?.total || [...counts.values()].reduce((a, b) => a + b, 0),
  );
  return h(
    "div",
    { className: "p2-bars" },
    opts.map((o, i) => {
      const n = counts.get(String(o)) || 0,
        p = total ? Math.round((n / total) * 100) : 0;
      return h(
        "div",
        { className: "p2-barline", key: `bar-${i}` },
        h("p", null, `${String.fromCharCode(65 + i)} · ${o}`),
        h("b", null, `${p}%`),
        h(
          "div",
          { className: "p2-track" },
          h("i", { style: { width: `${p}%` } }),
        ),
      );
    }),
  );
}
function Media({ q }) {
  if (!q?.media_url) return null;
  if (q.media_type === "image")
    return h(
      "div",
      { style: { position: "relative" } },
      h("img", {
        className: "p2-media",
        src: q.media_url,
        alt: "Recurso de la pregunta",
      }),
      q.question_type === "hotspot" &&
        q.status === "revealed" &&
        q.correct_answer?.x != null
        ? h("span", {
            style: {
              position: "absolute",
              left: `${Number(q.correct_answer.x)}%`,
              top: `${Number(q.correct_answer.y)}%`,
              width: "52px",
              height: "52px",
              transform: "translate(-50%,-50%)",
              border: "5px solid #28d17c",
              borderRadius: "999px",
              boxShadow: "0 0 0 8px rgba(40,209,124,.18)",
            },
          })
        : null,
    );
  if (q.media_type === "video")
    return h("video", {
      className: "p2-media",
      controls: true,
      src: q.media_url,
    });
  if (q.media_type === "audio")
    return h("audio", {
      controls: true,
      src: q.media_url,
      style: { width: "100%" },
    });
  return null;
}
function Options({ q }) {
  if (q.question_type === "open_text")
    return h("div", { className: "p2-option" }, "Respuesta abierta");
  if (q.question_type === "numeric")
    return h(
      "div",
      { className: `p2-option ${q.status === "revealed" ? "correct" : ""}` },
      q.status === "revealed"
        ? `Respuesta: ${q.correct_answer}`
        : "Respuesta numérica",
    );
  if (q.question_type === "hotspot")
    return h(
      "div",
      { className: `p2-option ${q.status === "revealed" ? "correct" : ""}` },
      q.status === "revealed"
        ? "La zona correcta está marcada en verde."
        : "Selecciona la zona correcta en la imagen.",
    );
  if (
    q.question_type === "ordering" &&
    q.status === "revealed" &&
    Array.isArray(q.correct_answer)
  )
    return h(
      "div",
      { className: "p2-options" },
      q.correct_answer.map((o, i) =>
        h(
          "div",
          { className: "p2-option correct", key: i },
          h("strong", null, i + 1),
          o,
        ),
      ),
    );
  const good = new Set(
    (Array.isArray(q.correct_answer) ? q.correct_answer : [q.correct_answer])
      .filter((x) => x != null)
      .map(String),
  );
  const opts = Array.isArray(q.options) ? q.options : [];
  return h(
    "div",
    { className: "p2-options" },
    opts.map((o, i) =>
      h(
        "div",
        {
          className: `p2-option ${q.status === "revealed" && good.has(String(o)) ? "correct" : ""}`,
          key: i,
        },
        h("strong", null, String.fromCharCode(65 + i)),
        o,
      ),
    ),
  );
}
function Entry({ code, setCode, onOpen, error }) {
  return h(
    "div",
    { className: "p2-app p2-scene p2-scene-entry" },
    h(
      "main",
      { className: "p2-main" },
      h(
        "form",
        {
          className: "p2-panel p2-entry",
          onSubmit: (event) => {
            event.preventDefault();
            onOpen();
          },
        },
        logo(),
        h("span", { className: "p2-kicker" }, "Projection 2.x"),
        h("h1", null, "Pantalla de proyección"),
        h("p", null, "Escribe el código de la sesión para abrir el modo aula."),
        h("input", {
          className: "p2-code-input",
          value: code,
          onChange: (e) =>
            setCode(e.target.value.replace(/\D/g, "").slice(0, 6)),
          inputMode: "numeric",
          maxLength: 6,
          placeholder: "000000",
          "aria-label": "Código de sesión",
          autoComplete: "one-time-code",
          autoFocus: true,
        }),
        error ? h("p", { style: { color: "#ff9b9b" }, role: "alert" }, error) : null,
        h(
          "button",
          { className: "p2-btn", type: "submit", disabled: code.length !== 6 },
          "Abrir proyección",
        ),
      ),
    ),
  );
}
function ConnectionChip({ state, label }) {
  const text =
    state === "connected"
      ? label || "En vivo"
      : state === "offline"
        ? "Sin conexión"
        : state === "connecting"
          ? "Conectando"
          : "Recuperando";
  return h(
    "span",
    { className: `p2-chip p2-connection ${state}`, role: "status", "aria-live": "polite" },
    h("span", { className: "p2-dot" }),
    text,
  );
}
function SyncNotice({ warning, lastSyncedAt }) {
  if (!warning) return null;
  const time = lastSyncedAt
    ? new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(lastSyncedAt))
    : "—";
  return h("div", { className: "p2-sync-notice", role: "status" }, `${warning} · Última actualización ${time}`);
}

function Lobby({ x, code, connection, warning }) {
  return h(
    "div",
    { className: "p2-app p2-scene p2-scene-lobby" },
    h(
      "header",
      { className: "p2-top" },
      logo(),
      h(ConnectionChip, { state: connection, label: "Sala activa" }),
    ),
    h(
      "main",
      { className: "p2-main" },
      h(SyncNotice, { warning, lastSyncedAt: x.lastSyncedAt }),
      h(
        "section",
        { className: "p2-panel p2-lobby" },
        h(
          "div",
          { className: "p2-lobby-primary" },
          h("span", { className: "p2-kicker" }, x.s.university || "TEDVIO"),
          h("h1", null, x.s.title || "Clase en vivo"),
          h(
            "p",
            { className: "p2-sub" },
            [x.s.educational_program, x.s.group_name]
              .filter(Boolean)
              .join(" · "),
          ),
          h("div", { className: "p2-big-code" }, code),
          h(
            "p",
            { className: "p2-sub" },
            "Escanea el QR o entra a TEDVIO con este código.",
          ),
          h(
            "div",
            { className: "p2-people" },
            (x.people || [])
              .slice(0, 30)
              .map((p, i) =>
                h("span", { className: "p2-person", key: i }, p.display_name),
              ),
          ),
        ),
        h(
          "aside",
          { className: "p2-qr-card" },
          h(QR, { code }),
          h(
            "div",
            { className: "p2-connected" },
            `${x.people.length} conectados`,
          ),
          h(
            "div",
            { style: { marginTop: "6px", color: "#6380a8" } },
            "Listos para comenzar",
          ),
        ),
      ),
    ),
  );
}
function Live({ x, code, tick, connection, warning }) {
  const q = x.q;
  const rem = remaining(q);
  const pct = Math.max(
    0,
    Math.min(100, (rem / Math.max(1, Number(q.timer_seconds || 30))) * 100),
  );
  void tick;
  return h(
    "div",
    { className: `p2-app p2-scene p2-scene-${q.status === "revealed" ? "result" : "question"}` },
    h(
      "header",
      { className: "p2-top" },
      logo(),
      h(
        "div",
        { className: "p2-top-actions" },
        h(ConnectionChip, { state: connection }),
        h("span", { className: "p2-chip" }, `Código ${code}`),
      ),
    ),
    h(
      "main",
      { className: "p2-main" },
      h(SyncNotice, { warning, lastSyncedAt: x.lastSyncedAt }),
      h(
        "div",
        { className: "p2-live" },
        h(
          "section",
          { className: "p2-panel p2-question" },
          h(
            "div",
            null,
            h(
              "span",
              { className: "p2-kicker" },
              `Pregunta ${q.position} · ${typeLabel[q.question_type] || q.question_type}`,
            ),
            h("h1", null, q.prompt),
          ),
          h(Media, { q }),
          h(Options, { q }),
          q.status === "revealed" && q.explanation
            ? h(
                "div",
                { className: "p2-explain" },
                h("b", null, "Explicación"),
                h("div", { style: { marginTop: "6px" } }, q.explanation),
              )
            : null,
          q.status === "revealed"
            ? h(Distribution, { q, rows: x.results })
            : null,
        ),
        h(
          "aside",
          { className: "p2-side" },
          h(
            "section",
            { className: "p2-metric" },
            h("span", null, q.status === "live" ? "Tiempo" : "Estado"),
            h("b", null, q.status === "live" ? `${rem} s` : "Resultado"),
            h(
              "div",
              { className: "p2-timerbar" },
              h("i", {
                style: { width: q.status === "live" ? `${pct}%` : "100%" },
              }),
            ),
          ),
          h(
            "section",
            { className: "p2-metric" },
            h("span", null, "Respuestas"),
            h(
              "b",
              null,
              `${x.counts.answered_count || 0}/${x.counts.participant_count || 0}`,
            ),
          ),
          x.s.competitive
            ? h(Ranking, { rows: x.ranking, teamMode: x.s.team_mode })
            : h(
                "section",
                { className: "p2-metric" },
                h("span", null, "Modo"),
                h("b", { style: { fontSize: "30px" } }, "Participativo"),
              ),
        ),
      ),
    ),
  );
}
function Status({ title, text, onReset }) {
  return h(
    "div",
    { className: "p2-app p2-scene p2-scene-status" },
    h(
      "main",
      { className: "p2-main" },
      h(
        "section",
        { className: "p2-panel p2-status" },
        logo(),
        h("span", { className: "p2-kicker" }, "Projection 2.x"),
        h("h1", null, title),
        h("p", null, text),
        onReset
          ? h(
              "button",
              { className: "p2-btn", onClick: onReset },
              "Abrir otra sesión",
            )
          : null,
      ),
    ),
  );
}
function App() {
  const [code, setCode] = useCode(),
    [active, setActive] = useState(code.length === 6),
    [state, setState] = useState(null),
    [error, setError] = useState(""),
    [warning, setWarning] = useState(""),
    [tick, setTick] = useState(0),
    [connection, setConnection] = useState(
      navigator.onLine ? "connecting" : "offline",
    );
  useEffect(() => {
    if (!active || !configReady) return;
    let disposed = false,
      client = null,
      channel = null,
      channelKey = "",
      syncing = false,
      queued = false,
      pollTimer = 0,
      eventTimer = 0,
      fetchFailures = 0,
      recoveryStep = 0,
      missingCount = 0,
      realtimeReady = false,
      lastState = null;
    let sync, requestSync;
    const schedulePoll = () => {
      window.clearTimeout(pollTimer);
      if (disposed || !navigator.onLine || document.visibilityState !== "visible") return;
      const recovery = [2_000, 4_000, 8_000, 15_000, 30_000];
      const base = realtimeReady ? 18_000 : recovery[Math.min(recoveryStep, recovery.length - 1)];
      pollTimer = window.setTimeout(() => {
        if (!realtimeReady) recoveryStep = Math.min(recoveryStep + 1, recovery.length - 1);
        requestSync(0);
      }, Math.round(base * (0.9 + Math.random() * 0.2)));
    };
    const connect = (x) => {
      const nextKey = `${x.s.session_id}:${x.s.current_question_id || "lobby"}`;
      if (!client || channelKey === nextKey) return;
      if (channel) void client.removeChannel(channel);
      channelKey = nextKey;
      setConnection(navigator.onLine ? "connecting" : "offline");
      const ownedChannel = client
        .channel(`projection-v2-${nextKey}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "v2_sessions",
            filter: `id=eq.${x.s.session_id}`,
          },
          () => requestSync(240),
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "v2_questions",
            filter: `session_id=eq.${x.s.session_id}`,
          },
          () => requestSync(240),
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "v2_participants",
            filter: `session_id=eq.${x.s.session_id}`,
          },
          () => requestSync(240),
        );
      channel = ownedChannel;
      if (x.s.current_question_id)
        ownedChannel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "v2_responses",
            filter: `question_id=eq.${x.s.current_question_id}`,
          },
          () => requestSync(240),
        );
      ownedChannel.subscribe((status) => {
        if (disposed || channel !== ownedChannel) return;
        realtimeReady = status === "SUBSCRIBED";
        if (realtimeReady) {
          fetchFailures = 0;
          recoveryStep = 0;
        } else {
          recoveryStep = Math.min(recoveryStep + 1, 4);
          if (["CLOSED", "CHANNEL_ERROR", "TIMED_OUT"].includes(status)) {
            channelKey = "";
          }
        }
        setConnection(
          !navigator.onLine ? "offline" : realtimeReady ? "connected" : "reconnecting",
        );
        schedulePoll();
      });
    };
    sync = async () => {
      if (syncing) {
        queued = true;
        return;
      }
      syncing = true;
      try {
        client ||= await getProjectionClient();
        const x = await loadProjection(client, code, lastState);
        if (disposed) return;
        if (!x) {
          missingCount += 1;
          if (lastState) {
            setWarning("Verificando la sesión sin descartar la última pantalla válida");
          } else if (missingCount >= 3) {
            setError("Código no encontrado.");
            setState(null);
          } else {
            setWarning("Verificando la sesión sin descartar la información anterior");
          }
          return;
        }
        missingCount = 0;
        fetchFailures = 0;
        lastState = x;
        setError("");
        setWarning(x.partial.length ? "Datos parciales: TEDVIO conserva el último estado válido" : "");
        setState(x);
        connect(x);
      } catch (e) {
        if (!disposed) {
          fetchFailures = Math.min(fetchFailures + 1, 4);
          recoveryStep = Math.min(recoveryStep + 1, 4);
          setConnection(navigator.onLine ? "reconnecting" : "offline");
          if (lastState) setWarning("Reconectando sin borrar la pantalla de la clase");
          else setError("Reconectando con la sesión…");
        }
      } finally {
        syncing = false;
        if (queued && !disposed) {
          queued = false;
          requestSync(0);
        } else schedulePoll();
      }
    };
    requestSync = (delay = 240) => {
      if (
        eventTimer
        || disposed
        || !navigator.onLine
        || document.visibilityState !== "visible"
      ) return;
      eventTimer = window.setTimeout(() => {
        eventTimer = 0;
        void sync();
      }, delay);
    };
    const onOnline = () => {
        setConnection("reconnecting");
        requestSync(0);
      },
      onOffline = () => {
        window.clearTimeout(pollTimer);
        window.clearTimeout(eventTimer);
        eventTimer = 0;
        setConnection("offline");
        if (lastState) setWarning("Sin internet: mostrando la última información recibida");
      },
      onVisibility = () => {
        if (document.visibilityState === "visible") requestSync(0);
        else {
          window.clearTimeout(pollTimer);
          window.clearTimeout(eventTimer);
          eventTimer = 0;
        }
      };
    addEventListener("online", onOnline);
    addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);
    requestSync(0);
    const clock = setInterval(() => setTick((v) => v + 1), 500);
    return () => {
      disposed = true;
      window.clearTimeout(pollTimer);
      window.clearTimeout(eventTimer);
      clearInterval(clock);
      removeEventListener("online", onOnline);
      removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
      if (client && channel) void client.removeChannel(channel);
    };
  }, [active, code]);
  const open = () => {
    if (code.length !== 6) return;
    history.replaceState(null, "", `?code=${code}`);
    setActive(true);
  };
  const reset = () => {
    history.replaceState(null, "", "./");
    setState(null);
    setError("");
    setWarning("");
    setCode("");
    setActive(false);
  };
  if (!configReady)
    return h(Status, {
      title: "No pudimos iniciar TEDVIO",
      text: "Actualiza la página. Si continúa, revisa la conexión antes de proyectar.",
    });
  if (!active) return h(Entry, { code, setCode, onOpen: open, error });
  if (error && !state)
    return h(Status, { title: "Reconectando…", text: error, onReset: reset });
  if (state?.closed)
    return h(Status, {
      title: "Sesión finalizada",
      text: state.s?.title || "La clase terminó.",
      onReset: reset,
    });
  if (!state)
    return h(Status, {
      title: "Conectando…",
      text: "Preparando la pantalla del aula.",
    });
  if (state.transitioning)
    return h(Status, {
      title: "Preparando la siguiente pregunta…",
      text: "Conservamos la sesión mientras llega el nuevo contenido.",
    });
  if (!state.q) return h(Lobby, { key: `lobby:${state.s.id}`, x: state, code, connection, warning });
  return h(Live, {
    key: `${state.q.id}:${state.q.status}`,
    x: state,
    code,
    tick,
    connection,
    warning,
  });
}

const projectionRoot = document.getElementById("projectionApp");
if (!projectionRoot) throw new Error("TEDVIO no encontró la superficie de proyección.");
createRoot(projectionRoot).render(
  h(
    LiveSurfaceErrorBoundary,
    { surface: "projection-v2", homeHref: "/projection-v2/" },
    h(App),
  ),
);
