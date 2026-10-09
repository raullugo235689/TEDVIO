import React, { useMemo, useRef, useState } from "react";
import { buildImageLabelingAnswer } from "../../src/core/visual-question";

const h = React.createElement;

/** One-label-per-zone activity with direct-touch alternative to dragging.
 * All points are relative to the image's intrinsic rendered box.
 */
export function ImageLabelingAnswer({ layout, imageUrl, labels, submitting, onSubmit }) {
  const [assignments, setAssignments] = useState({});
  const [selectedLabel, setSelectedLabel] = useState("");
  const [dragging, setDragging] = useState(null);
  const [imageError, setImageError] = useState(false);
  const drag = useRef(null);

  const result = useMemo(
    () => buildImageLabelingAnswer(assignments, layout, labels),
    [assignments, layout, labels],
  );
  const completed = Object.keys(assignments).length;
  function putLabel(zoneId, label) {
    if (!label || !labels.includes(label) || submitting) return;
    setAssignments((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([, value]) => value !== label));
      next[zoneId] = label;
      return next;
    });
    setSelectedLabel("");
  }
  function clickZone(zoneId) {
    if (submitting) return;
    if (selectedLabel) {
      putLabel(zoneId, selectedLabel);
    } else {
      // Clear a previously assigned location with a second tap.
      setAssignments((current) => {
        const next = { ...current };
        delete next[zoneId];
        return next;
      });
    }
  }
  function startDrag(event, label) {
    if (submitting) return;
    drag.current = { id: event.pointerId, label, x: event.clientX, y: event.clientY };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
  }
  function moveDrag(event) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - current.x, event.clientY - current.y);
    if (distance > 8) setDragging({ label: current.label, x: event.clientX, y: event.clientY });
  }
  function stopDrag(event) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    drag.current = null;
    const moved = Math.hypot(event.clientX - current.x, event.clientY - current.y) > 12;
    const dropZone = moved && document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-visual-zone]");
    if (dropZone) putLabel(dropZone.getAttribute("data-visual-zone"), current.label);
    else setSelectedLabel(current.label);
    setDragging(null);
  }

  return h("div", { className: "visual5-student", "data-visual-mode": "image_labeling" },
    h("div", { className: "visual5-student-top" },
      h("strong", null, "Ubica las estructuras anatómicas"),
      h("span", { role: "status", "aria-live": "polite" }, `${completed} de ${layout.targets.length} ubicadas`),
    ),
    h("p", { className: "visual5-student-hint" },
      "Arrastra cada nombre hacia su punto numerado. También puedes tocar una etiqueta y luego su ubicación."),
    h("div", { className: "visual5-student-figure" },
      !imageError
        ? h("div", { className: "visual5-student-picture" },
            h("img", { src: imageUrl, alt: "Esquema anatómico para identificar estructuras",
              draggable: false, onError: () => setImageError(true) }),
            ...layout.targets.map((target, index) =>
              h("button", {
                type: "button", key: target.id, "data-visual-zone": target.id,
                className: `visual5-drop-zone${assignments[target.id] ? " filled" : ""}${selectedLabel ? " awaiting" : ""}`,
                style: { left: `${target.x}%`, top: `${target.y}%` },
                disabled: submitting,
                "aria-label": `Zona ${index + 1}${assignments[target.id] ? `: ${assignments[target.id]}` : ", sin etiqueta"}`,
                onClick: () => clickZone(target.id),
              }, h("b", null, index + 1), assignments[target.id]
                ? h("span", { className: "visual5-drop-answer" }, assignments[target.id])
                : null),
            ),
          )
        : h("div", { className: "visual5-student-image-error", role: "alert" },
            "No se pudo mostrar la imagen. Avisa al docente antes de responder."),
    ),
    h("div", { className: "visual5-student-bank", "aria-label": "Etiquetas disponibles" },
      ...labels.map((label, index) => {
        const applied = Object.values(assignments).includes(label);
        return h("button", {
          type: "button", key: `${label}-${index}`,
          className: `visual5-label-chip${selectedLabel === label ? " selected" : ""}${applied ? " assigned" : ""}`,
          disabled: submitting,
          "aria-pressed": selectedLabel === label,
          onPointerDown: (event) => startDrag(event, label),
          onPointerMove: moveDrag,
          onPointerUp: stopDrag,
          onPointerCancel: () => { drag.current = null; setDragging(null); },
          onClick: (event) => { if (event.detail === 0) setSelectedLabel(label); },
        }, h("span", { "aria-hidden": true }, "⠿"), label);
      }),
    ),
    dragging ? h("div", { className: "visual5-drag-ghost",
      "aria-hidden": true, style: { left: dragging.x + 12, top: dragging.y + 12 } }, dragging.label) : null,
    selectedLabel ? h("p", { className: "visual5-student-selected", role: "status" },
      `Etiqueta seleccionada: ${selectedLabel}. Toca una zona en el dibujo.`) : null,
    h("button", { type: "button", className: "primary-btn visual5-submit",
      disabled: submitting || !result || imageError,
      onClick: () => result && onSubmit(result) },
      submitting ? "Enviando…" : `Enviar etiquetado (${completed}/${layout.targets.length})`),
    h("small", { className: "visual5-student-footer" }, "Puedes cambiar cualquier etiqueta antes de enviar. Cada respuesta se registra una sola vez."),
  );
}
