import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchFlashcards, flashcardsKey, rateFlashcard, type EnarmFlashcard } from '../../core/enarm2027-flashcards';
import { award, playable, shuffle } from '../../core/enarm-game-model';
import { ENARM_AREAS } from '../../core/enarm2027-areas';
import { ErrorPanel, LoadingScreen } from '../../shared/components';
import { EnarmFlashcardLibrary } from './EnarmFlashcards';

type RoundItem={card:EnarmFlashcard;options:string[]};
type Result={card:EnarmFlashcard;correct:boolean;points:number};
function makeRound(cards:EnarmFlashcard[],size:number):RoundItem[]{
 return shuffle(cards.filter(playable)).slice(0,size).map(card=>({card,options:shuffle([card.answer,...card.quiz_distractors!])}));
}
function Question({item,seconds,streak,onNext,last}:{item:RoundItem;seconds:number;streak:number;onNext:(r:Result)=>void;last:boolean}){
 const [choice,setChoice]=useState<number|null|undefined>(undefined);
 const [remaining,setRemaining]=useState(seconds);
 const answered=useRef(false);const advanced=useRef(false);const requestId=useRef(crypto.randomUUID());
 const heading=useRef<HTMLHeadingElement>(null);
 const correct=choice!==undefined&&choice!==null&&item.options[choice]===item.card.answer;
 const points=award(correct,streak);
 const save=useMutation({mutationFn:(ok:boolean)=>rateFlashcard(item.card.id,ok?'good':'again',requestId.current)});
 const submitRef=useRef<(index:number|null)=>void>(()=>{});
 const submit=(index:number|null)=>{if(answered.current)return;answered.current=true;setChoice(index);save.mutate(index!==null&&item.options[index]===item.card.answer);};
 submitRef.current=submit;
 useEffect(()=>{heading.current?.focus();if(!seconds)return;const deadline=Date.now()+seconds*1000;
  let timer:number;const tick=()=>{if(answered.current)return;const left=Math.max(0,Math.ceil((deadline-Date.now())/1000));setRemaining(left);if(left===0)submitRef.current(null);else timer=window.setTimeout(tick,250);};
  timer=window.setTimeout(tick,250);return()=>window.clearTimeout(timer);
 },[seconds]);
 return <section className="enarm-game-question">
  <div className="enarm-game-topic"><span>{item.card.topic}</span>{seconds>0&&<span className={remaining<=10?'game-clock urgent':'game-clock'} aria-label={`${remaining} segundos restantes`}>◷ {remaining}s</span>}</div>
  {seconds>0&&<div className="game-timer-track" aria-hidden="true"><i style={{width:`${remaining/seconds*100}%`}}/></div>}
  <h2 ref={heading} tabIndex={-1}>{item.card.question}</h2>
  <div className="enarm-game-options" aria-label="Opciones de respuesta">
   {item.options.map((option,index)=>{
    const revealed=choice!==undefined;const right=option===item.card.answer;
    return <button type="button" key={option} disabled={revealed} className={`game-option color-${index}${revealed?(right?' correct':choice===index?' incorrect':' faded'):''}`} onClick={()=>submit(index)}>
     <span className="game-option-letter" aria-hidden="true">{['▲','◆','●','■'][index]}</span><span><small>{['A','B','C','D'][index]}</small>{option}</span>{revealed&&right&&<b aria-label="Respuesta correcta">✓</b>}{revealed&&choice===index&&!right&&<b aria-label="Respuesta incorrecta">×</b>}
    </button>;
   })}
  </div>
  {choice!==undefined&&<div className={`game-feedback ${correct?'is-correct':'is-wrong'}`}>
   <h3 role="status">{correct?`¡Correcto! +${points} puntos`:choice===null?'Se terminó el tiempo. Vamos a repasarla.':'Esta va al repaso. Ya tienes una pista más.'}</h3>
   {!correct&&<p><strong>Respuesta:</strong> {item.card.answer}</p>}
   <p>{item.card.explanation}</p>
   <details><summary>Fuente y contexto</summary><p>{item.card.source_file} · página {item.card.source_page}. Material educativo adaptado.</p>{item.card.references_json.filter(r=>/^https:\/\//i.test(r.url)).map(r=><p key={r.url}><a href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</a></p>)}</details>
   {save.isError?<div role="alert"><p>No se confirmó el guardado. Tu respuesta sigue aquí.</p><button type="button" className="game-cta" onClick={()=>save.mutate(correct)}>Reintentar guardado</button></div>:<button type="button" className="game-cta" disabled={!save.isSuccess} onClick={()=>{if(advanced.current)return;advanced.current=true;onNext({card:item.card,correct,points});}}>{save.isPending?'Guardando…':last?'Ver mi resultado':'Siguiente pregunta →'}</button>}
  </div>}
 </section>;
}
function Round({items,seconds,onExit,onRetry}:{items:RoundItem[];seconds:number;onExit:()=>void;onRetry:(cards:EnarmFlashcard[])=>void}){
 const [results,setResults]=useState<Result[]>([]);const [confirmExit,setConfirmExit]=useState(false);
 const score=results.reduce((n,r)=>n+r.points,0);let streak=0,best=0;for(const r of results){streak=r.correct?streak+1:0;best=Math.max(best,streak);}
 const current=items[results.length];const wrong=results.filter(r=>!r.correct).map(r=>r.card);
 if(!current)return <section className="enarm-game-finish"><span className="game-trophy" aria-hidden="true">✦</span><span className="enarm-eyebrow">RONDA COMPLETADA</span><h2>{wrong.length?'Cada ronda te hace más preciso.':'¡Ronda perfecta!'}</h2><strong className="game-final-score">{score}<small> puntos</small></strong><div className="game-results"><span><b>{results.length-wrong.length}/{results.length}</b>Aciertos</span><span><b>{best}</b>Mejor racha</span><span><b>{wrong.length}</b>Para reforzar</span></div><p>Tus repasos quedaron guardados. Los puntos pertenecen a esta ronda; no son un puntaje ENARM.</p>{wrong.length>0&&<button type="button" className="game-cta" onClick={()=>onRetry(wrong)}>Volver a intentar mis errores</button>}<button type="button" className="game-back" onClick={onExit}>Elegir otra ronda</button></section>;
 return <div className="enarm-game-round"><div className="game-hud"><button type="button" className="game-back" onClick={()=>setConfirmExit(v=>!v)}>← Salir</button><span>{results.length+1} / {items.length}</span><strong>{score} pts</strong><span aria-label={`Racha de ${streak} aciertos`}>⚡ {streak}</span></div><progress max={items.length} value={results.length} aria-label="Progreso de la ronda"/>{confirmExit&&<div className="game-exit-prompt" role="alert"><p>Se conservarán los repasos guardados, pero terminará esta ronda.</p><button type="button" onClick={onExit}>Terminar ronda</button><button type="button" onClick={()=>setConfirmExit(false)}>Seguir jugando</button></div>}<Question key={current.card.id} item={current} seconds={seconds} streak={streak} last={results.length+1===items.length} onNext={r=>setResults(prev=>[...prev,r])}/></div>;
}
export function EnarmFlashcards({userId}:{userId:string}){
 const client=useQueryClient();const query=useQuery({queryKey:flashcardsKey(userId),queryFn:()=>fetchFlashcards(userId),staleTime:20000,retry:1});
 const [library,setLibrary]=useState(false);const [area,setArea]=useState('');const [topic,setTopic]=useState('');const [dueOnly,setDueOnly]=useState(false);const [seconds,setSeconds]=useState(0);const [size,setSize]=useState(10);
 const [round,setRound]=useState<{id:string;items:RoundItem[];seconds:number}|null>(null);
 const cards=query.data?.cards??[];const now=Date.now();const reviews=new Map((query.data?.reviews??[]).map(r=>[r.card_id,r]));
 const selected=cards.filter(c=>(!area||c.area===area)&&(!topic||c.topic===topic)&&(!dueOnly||!reviews.has(c.id)||Date.parse(reviews.get(c.id)!.due_at)<=now));
 const playableCards=selected.filter(playable);const topics=[...new Set(cards.filter(c=>!area||c.area===area).map(c=>c.topic))].sort();
 const start=(pool:EnarmFlashcard[],count=size)=>{const items=makeRound(pool,count);if(items.length)setRound({id:crypto.randomUUID(),items,seconds});};
 const exit=()=>{setRound(null);void client.invalidateQueries({queryKey:flashcardsKey(userId)});};
 if(round)return <div className="enarm-game"><Round key={round.id} items={round.items} seconds={round.seconds} onExit={exit} onRetry={pool=>start(pool,pool.length)}/></div>;
 if(library)return <><button type="button" className="game-back" onClick={()=>{setLibrary(false);void client.invalidateQueries({queryKey:flashcardsKey(userId)});}}>← Volver al juego</button><EnarmFlashcardLibrary userId={userId}/></>;
 if(query.isLoading)return <LoadingScreen label="Preparando tu próxima ronda…"/>;
 if(query.isError)return <ErrorPanel title="No pude abrir tus tarjetas" detail="Tus datos están guardados. Intenta de nuevo." onRetry={()=>query.refetch()}/>;
 return <div className="enarm-game"><section className="enarm-game-lobby"><div className="game-lobby-top"><span className="enarm-eyebrow">TU RETO PERSONAL · ENARM 2027</span><span className="game-private">Solo tú</span></div><span className="game-spark" aria-hidden="true">✦</span><h2>Menos leer.<br/><em>Más acertar.</em></h2><p>Elige, descubre y vuelve a intentarlo.<br/>Una pregunta. Cuatro opciones. Tu siguiente acierto.</p><div className="game-lobby-stats"><span><b>{playableCards.length}</b> preguntas disponibles</span><span><b>{Math.min(size,playableCards.length)}</b> por ronda</span></div><button type="button" className="game-cta game-start" disabled={!playableCards.length} onClick={()=>start(playableCards)}>▶ Empezar ronda</button>{!playableCards.length&&<p>No hay preguntas de juego con esta selección. Cambia los filtros o abre tu biblioteca.</p>}<details className="game-settings"><summary>Personalizar ronda <span>{topic||'Todos los temas'} · {seconds?`${seconds}s`:'Sin reloj'}</span></summary><div className="game-settings-grid"><label>Especialidad<select value={area} onChange={e=>{setArea(e.target.value);setTopic('');}}><option value="">Todas</option>{ENARM_AREAS.filter(a=>cards.some(c=>c.area===a.key)).map(a=><option key={a.key} value={a.key}>{a.label}</option>)}</select></label><label>Tema<select value={topic} onChange={e=>setTopic(e.target.value)}><option value="">Todos</option>{topics.map(t=><option key={t}>{t}</option>)}</select></label><label>Preguntas<select value={size} onChange={e=>setSize(Number(e.target.value))}><option value={5}>5 · Ronda rápida</option><option value={10}>10 · Ronda clásica</option><option value={20}>20 · Ronda larga</option></select></label><label>Tiempo por pregunta<select value={seconds} onChange={e=>setSeconds(Number(e.target.value))}><option value={0}>Sin reloj</option><option value={30}>30 segundos</option><option value={60}>60 segundos</option></select></label></div><label className="enarm-flashcard-toggle"><input type="checkbox" checked={dueOnly} onChange={e=>setDueOnly(e.target.checked)}/> Solo nuevas o pendientes</label></details><button type="button" className="game-back" onClick={()=>setLibrary(true)}>Consultar mis {cards.length} tarjetas y fuentes →</button><p className="game-fineprint">Puntos por aciertos y rachas, no por rapidez. Tu colección sigue siendo privada.</p></section></div>;
}
