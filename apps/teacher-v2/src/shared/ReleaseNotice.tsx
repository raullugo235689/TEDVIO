import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { hasPendingAttendance } from '../core/useAttendanceDraftGuard';
import { hasPendingGradebook } from '../core/useGradebookDraftGuard';
import { hasPendingAcademicWork } from '../core/useAcademicDraft';
import '../styles/release-notice.css';
declare const __TEDVIO_BUILD_ID__: string;
const buildId=typeof __TEDVIO_BUILD_ID__==='string'?__TEDVIO_BUILD_ID__:'development';
export function ReleaseNotice() {
 const [available,setAvailable]=useState(false);
 const [message,setMessage]=useState('');
 const client=useQueryClient(); const auth=useAuth(); const {pathname}=useLocation();
 useEffect(()=>{
  let active=true; const controller=new AbortController();
  const check=async()=>{
   if(document.visibilityState==='hidden'||!navigator.onLine) return;
   try {
    const response=await fetch('/release.json',{cache:'no-store',signal:controller.signal});
    if(!response.ok) return;
    const value=await response.json();
    if(active&&typeof value.build_id==='string'&&value.build_id!==buildId) setAvailable(true);
   } catch { /* version checks never interrupt academic work */ }
  };
  const visibility=()=>void check();
  const preload=()=>{if(active){setAvailable(true);setMessage('Hay una versión nueva del módulo. Guarda tu trabajo antes de actualizar.');}};
  void check();window.addEventListener('online',visibility);navigator.serviceWorker?.addEventListener('controllerchange',visibility);
  document.addEventListener('visibilitychange',visibility);window.addEventListener('vite:preloadError',preload);
  return()=>{active=false;controller.abort();window.removeEventListener('online',visibility);navigator.serviceWorker?.removeEventListener('controllerchange',visibility);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('vite:preloadError',preload);};
 },[]);
 function update() {
  if(client.isMutating()||hasPendingAttendance(client,auth.user?.id)||hasPendingGradebook(client,auth.user?.id)||hasPendingAcademicWork(client,auth.user?.id)) {setMessage('Guarda la captura pendiente antes de actualizar.');return;}
  if(/^\/classroom\/[^/]+/.test(pathname)) {setMessage('Sal del control de Modo Clase antes de actualizar. La sesión no se cerrará automáticamente.');return;}
  window.location.reload();
 }
 return <div className={`release-notice${available?' has-update':''}`} aria-live="polite">
  <small title={`Compilación ${buildId}`}>TEDVIO · {buildId.slice(0,8)}</small>
  {available?<><span>{message||'Nueva versión disponible. Tu trabajo permanece abierto.'}</span><button type="button" className="button secondary compact" onClick={update}>Actualizar TEDVIO</button></>:null}
 </div>;
}
