import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ENARM_AREAS } from '../../core/enarm2027-areas';
import { fetchFlashcards, flashcardsKey, rateFlashcard, type EnarmFlashcard, type FlashcardRating } from '../../core/enarm2027-flashcards';
import { ErrorPanel, LoadingScreen } from '../../shared/components';

function Card({card,onSaved}:{card:EnarmFlashcard;onSaved:(due:string)=>void}){
 const [revealed,setRevealed]=useState(false);
 const event=useRef<{id:string;rating:FlashcardRating}|null>(null);
 const locked=useRef(false);
 const save=useMutation({mutationFn:async(rating:FlashcardRating)=>{
  if(!event.current)event.current={id:crypto.randomUUID(),rating};
  return rateFlashcard(card.id,event.current.rating,event.current.id);
 },onSuccess:result=>onSaved(result.due_at),onSettled:()=>{locked.current=false;}});
 const rate=(rating:FlashcardRating)=>{if(locked.current)return;locked.current=true;save.mutate(rating);};
 return <article className="enarm-surface enarm-flashcard">
  <span className="enarm-eyebrow">{card.topic} · {card.subtopic}</span>
  <h2>{card.question}</h2>
  {!revealed?<><p>Responde de memoria antes de consultar la explicación.</p><button type="button" className="enarm-primary" onClick={()=>setRevealed(true)}>Mostrar respuesta</button></>:<>
   <div className="enarm-flashcard-answer"><h3>Respuesta</h3><p>{card.answer}</p>{card.explanation&&<p>{card.explanation}</p>}</div>
   <p className="enarm-flashcard-source">Material de origen: {card.source_file} · página {card.source_page}. Redacción de estudio adaptada.</p>
   {card.references_json.length>0&&<details><summary>Referencias para contrastar el contenido</summary><ul>{card.references_json.filter(r=>/^https:\/\//i.test(r.url)).map(r=><li key={r.url}><a href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</a></li>)}</ul></details>}
   <h3>¿Cuánto recordaste?</h3><p>Autoevaluación de memoria; no modifica tu porcentaje de aciertos en casos clínicos.</p>
   {save.isError?<div role="alert"><p>No se guardó la confirmación. Reintenta la misma valoración sin duplicar el repaso.</p><button type="button" className="enarm-primary" disabled={save.isPending} onClick={()=>rate(event.current!.rating)}>Reintentar guardado</button></div>:<div className="enarm-flashcard-actions">
    <button type="button" className="enarm-secondary" disabled={save.isPending} onClick={()=>rate('again')}>No la recordé · 1 día</button>
    <button type="button" className="enarm-secondary" disabled={save.isPending} onClick={()=>rate('hard')}>Con dificultad · 2 días</button>
    <button type="button" className="enarm-primary" disabled={save.isPending} onClick={()=>rate('good')}>La recordé</button>
   </div>}
   {save.isPending&&<p role="status">Guardando repaso…</p>}
  </>}
 </article>;
}
export function EnarmFlashcards({userId}:{userId:string}){
 const client=useQueryClient();
 const query=useQuery({queryKey:flashcardsKey(userId),queryFn:()=>fetchFlashcards(userId),staleTime:20_000,retry:1});
 const [area,setArea]=useState(''); const [topic,setTopic]=useState(''); const [subtopic,setSubtopic]=useState('');
 const [search,setSearch]=useState(''); const [dueOnly,setDueOnly]=useState(true);
 const [done,setDone]=useState<string[]>([]); const [notice,setNotice]=useState('');
 const [sessionTime,setSessionTime]=useState(()=>Date.now());
 const cards=query.data?.cards??[];
 const reviewMap=useMemo(()=>new Map((query.data?.reviews??[]).map(r=>[r.card_id,r])),[query.data?.reviews]);
 const topics=[...new Set(cards.filter(c=>!area||c.area===area).map(c=>c.topic))].sort();
 const subtopics=[...new Set(cards.filter(c=>(!area||c.area===area)&&(!topic||c.topic===topic)).map(c=>c.subtopic))].sort();
 const due=(id:string)=>!reviewMap.has(id)||Date.parse(reviewMap.get(id)!.due_at)<=sessionTime;
 const matches=cards.filter(c=>(!area||c.area===area)&&(!topic||c.topic===topic)&&(!subtopic||c.subtopic===subtopic)&&(!dueOnly||due(c.id))&&`${c.question} ${c.topic} ${c.subtopic}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')));
 const remaining=matches.filter(c=>!done.includes(c.id));
 const current=remaining[0];
 if(query.isLoading)return <LoadingScreen label="Abriendo tus tarjetas privadas…"/>;
 if(query.isError)return <ErrorPanel title="No pude cargar tus tarjetas" detail="Vuelve a intentarlo. Tus repasos guardados se conservan." onRetry={()=>query.refetch()}/>;
 return <div className="enarm-flashcards">
  <section className="enarm-surface"><span className="enarm-eyebrow">COLECCIÓN PRIVADA</span><h2>Mis flashcards</h2><p>{cards.length} tarjetas · {cards.filter(c=>due(c.id)).length} nuevas o pendientes · {done.length} repasadas en esta sesión</p>
   <div className="enarm-flashcard-filters">
    <label>Especialidad<select value={area} onChange={e=>{setArea(e.target.value);setTopic('');setSubtopic('');}}><option value="">Todas</option>{ENARM_AREAS.filter(a=>cards.some(c=>c.area===a.key)).map(a=><option key={a.key} value={a.key}>{a.label}</option>)}</select></label>
    <label>Tema<select value={topic} onChange={e=>{setTopic(e.target.value);setSubtopic('');}}><option value="">Todos</option>{topics.map(t=><option key={t}>{t}</option>)}</select></label>
    <label>Subtema<select value={subtopic} onChange={e=>setSubtopic(e.target.value)}><option value="">Todos</option>{subtopics.map(t=><option key={t}>{t}</option>)}</select></label>
    <label>Buscar<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Concepto o pregunta"/></label>
   </div>
   <label className="enarm-flashcard-toggle"><input type="checkbox" checked={dueOnly} onChange={e=>setDueOnly(e.target.checked)}/> Solo tarjetas nuevas o pendientes</label>
  </section>
  <p role="status">{notice}</p>
  {current?<Card key={current.id} card={current} onSaved={dueAt=>{
   setDone(prev=>[...prev,current.id]);setNotice(`Repaso guardado. Próxima revisión: ${new Date(dueAt).toLocaleDateString('es-MX')}.`);
   void client.invalidateQueries({queryKey:flashcardsKey(userId)});
  }}/>:<section className="enarm-surface"><h2>{cards.length?'No quedan tarjetas en esta selección':'Tu colección está lista para recibir tarjetas'}</h2><p>{cards.length?'Cambia los filtros o desactiva «Solo tarjetas nuevas o pendientes» para estudiar otras tarjetas.':'Las tarjetas importadas a tu cuenta aparecerán aquí, organizadas por especialidad, tema y subtema.'}</p>{done.length>0&&<button type="button" className="enarm-secondary" onClick={()=>{setDone([]);setSessionTime(Date.now());setNotice('Nueva sesión iniciada.');}}>Comenzar otra sesión</button>}</section>}
  <p>Repaso personal con intervalos progresivos. Contrasta las decisiones clínicas con la guía citada y su contexto; este material no es un banco oficial del ENARM.</p>
 </div>;
}
