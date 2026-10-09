import { useEffect, useState, type MouseEvent } from 'react';
import { supabase } from '../../core/supabase';
import { useAuth } from '../auth/AuthProvider';
import {
  MAX_IMAGE_LABELS, MIN_IMAGE_LABELS, appendImageLabel, removeImageLabel,
  repositionImageLabel, type ImageLabelingLayout,
} from '../../core/visual-question';

interface Props {
  layout: ImageLabelingLayout;
  labels: string[];
  mediaUrl: string;
  onChange: (layout: ImageLabelingLayout, labels: string[]) => void;
  onMediaUrlChange: (url: string) => void;
}

/** Teacher authoring surface: coordinates are visible, but the key is private. */
export function VisualLabelingEditor({ layout, labels, mediaUrl, onChange, onMediaUrlChange }: Props) {
  const auth = useAuth();
  const [active, setActive] = useState(0);
  const [imageBroken, setImageBroken] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  useEffect(() => { setImageBroken(false); }, [mediaUrl]);
  const url = mediaUrl.trim();
  const ready = /^https:\/\//i.test(url) && !imageBroken;

  async function uploadImage(file?: File) {
    if (!file || uploading) return;
    setUploadError('');
    const extensions: Record<string,string> = {
      'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
    };
    const extension = extensions[file.type];
    if (!extension) { setUploadError('Selecciona una imagen PNG, JPG, WebP o GIF.'); return; }
    if (!file.size || file.size > 8 * 1024 * 1024) {
      setUploadError('La imagen debe pesar entre 1 byte y 8 MB.');
      return;
    }
    if (!auth.user) { setUploadError('Inicia sesión como docente para subir imágenes.'); return; }
    setUploading(true);
    try {
      const path = `${auth.user.id}/visual5/${crypto.randomUUID()}.${extension}`;
      const bucket = supabase.storage.from('tedvio-media-v2');
      const { error } = await bucket.upload(path, file, {
        contentType: file.type, upsert: false, cacheControl: '3600',
      });
      if (error) throw error;
      const { data } = bucket.getPublicUrl(path);
      if (!data.publicUrl.startsWith('https://')) throw new Error('La dirección de la imagen no es segura.');
      onMediaUrlChange(data.publicUrl);
    } catch (reason) {
      setUploadError(reason instanceof Error ? reason.message : 'No se pudo subir la imagen.');
    } finally {
      setUploading(false);
    }
  }

  function reposition(event: MouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const x = Math.round(((event.clientX - bounds.left) / bounds.width) * 10000) / 100;
    const y = Math.round(((event.clientY - bounds.top) / bounds.height) * 10000) / 100;
    onChange(repositionImageLabel(layout, active, x, y), labels);
  }

  function changeName(index: number, value: string) {
    const next = [...labels];
    next[index] = value;
    onChange(layout, next);
  }

  return (
    <section className="visual5-editor" aria-label="Editor de etiquetado anatómico">
      <header className="visual5-editor-heading">
        <div><span className="eyebrow">CLASSROOM VISUAL 5.0</span>
          <h3>Etiqueta las estructuras de la imagen</h3>
          <p>Escribe los nombres en el orden de las zonas numeradas. Selecciona una zona y toca la imagen para colocarla.</p>
        </div>
        <span className="visual5-editor-count">{layout.targets.length} zonas</span>
      </header>
      <div className="visual5-upload-row">
        <label className="visual5-upload-button">
          {uploading ? 'Subiendo imagen…' : 'Subir dibujo desde mi dispositivo'}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif"
            aria-label="Subir imagen anatómica" disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              void uploadImage(file);
            }} />
        </label>
        <span>PNG, JPG, WebP o GIF · máximo 8 MB</span>
        {uploadError ? <p role="alert" className="visual5-upload-error">{uploadError}</p> : null}
      </div>
      <div className="visual5-editor-layout">
        <div className="visual5-editor-figure">
          {ready ? (
            <div className="visual5-editor-image" onClick={reposition}
              role="group" aria-label="Imagen anatómica para colocar zonas">
              <img src={url} alt="Vista previa de anatomía para colocar las zonas" onError={() => setImageBroken(true)}
                onLoad={() => setImageBroken(false)} draggable={false}/>
              {layout.targets.map((target, index) => (
                <button key={target.id} type="button" aria-label={`Elegir zona ${index + 1}`}
                  aria-pressed={active === index}
                  className={`visual5-editor-pin${active === index ? ' selected' : ''}`}
                  style={{ left: `${target.x}%`, top: `${target.y}%` }}
                  onClick={(event) => { event.stopPropagation(); setActive(index); }}
                >{index + 1}</button>
              ))}
            </div>
          ) : (
            <div className="visual5-editor-empty" role="status">
              <span aria-hidden="true">▧</span>
              <b>{imageBroken ? 'No se pudo cargar la imagen' : 'Agrega la URL HTTPS de una imagen'}</b>
              <p>En «Recurso multimedia» selecciona Imagen y pega la URL pública. Las zonas aparecerán aquí.</p>
            </div>
          )}
          <p className="visual5-editor-hint">Zona seleccionada: <strong>{active + 1}</strong> · Toca la ubicación exacta en el dibujo.</p>
        </div>
        <div className="visual5-editor-fields">
          <div className="visual5-editor-label-title">
            <h4>Clave del docente</h4>
            <p>Los alumnos verán estas etiquetas mezcladas, nunca en el orden correcto.</p>
          </div>
          {layout.targets.map((target, index) => (
            <div className={`visual5-editor-label${active === index ? ' selected' : ''}`} key={target.id}>
              <button className="visual5-editor-number" type="button" aria-label={`Seleccionar zona ${index + 1}`}
                aria-pressed={active === index} onClick={() => setActive(index)}>{index + 1}</button>
              <label>
                <span>Nombre de estructura {index + 1}</span>
                <input aria-label={`Nombre de estructura ${index + 1}`} value={labels[index] || ''}
                  maxLength={100} placeholder={index === 0 ? 'Ej. hueso frontal' : 'Ej. hueso parietal'}
                  onChange={(event) => changeName(index, event.target.value)} />
              </label>
              <button className="visual5-editor-delete" type="button" aria-label={`Quitar zona ${index + 1}`}
                disabled={layout.targets.length <= MIN_IMAGE_LABELS}
                onClick={() => {
                  const next = removeImageLabel(layout, index);
                  onChange(next, labels.filter((_, i) => i !== index));
                  setActive(Math.min(active, next.targets.length - 1));
                }}>×</button>
              <div className="visual5-editor-coordinates">
                <label>X <input type="number" aria-label={`X de zona ${index + 1}`} min={3} max={97} step="any"
                  value={target.x} onChange={(event) => onChange(repositionImageLabel(layout, index, Number(event.target.value), target.y), labels)}/></label>
                <label>Y <input type="number" aria-label={`Y de zona ${index + 1}`} min={3} max={97} step="any"
                  value={target.y} onChange={(event) => onChange(repositionImageLabel(layout, index, target.x, Number(event.target.value)), labels)}/></label>
              </div>
            </div>
          ))}
          <button className="button secondary visual5-add-zone" type="button"
            disabled={layout.targets.length >= MAX_IMAGE_LABELS}
            onClick={() => {
              const next = appendImageLabel(layout);
              onChange(next, [...labels, '']);
              setActive(next.targets.length - 1);
            }}>＋ Agregar zona anatómica</button>
        </div>
      </div>
      <p className="visual5-editor-security">La clave queda en el banco privado de TEDVIO; solo se revelará al finalizar la actividad.</p>
    </section>
  );
}
