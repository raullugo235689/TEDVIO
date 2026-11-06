import {connectActivity} from './sdk/activity.mjs';
// Configure this reviewed constant; never trust a parent origin supplied by an attacker.
const HOST_ORIGIN = 'https://tu-tedvio.example';
const form=document.querySelector('form'),button=form.querySelector('button'),status=document.querySelector('#status');
let api,submitted=false;
connectActivity({hostOrigin:HOST_ORIGIN}).then(connection=>{api=connection;button.disabled=false;button.textContent='Enviar';status.textContent='Actividad conectada.';})
.catch(()=>{status.textContent='No se conectó a TEDVIO. Abre la asignación desde su enlace autorizado.';});
form.addEventListener('submit',async event=>{
 event.preventDefault();if(!api)return;
 if(!submitted){const fields=new FormData(form);api.answer('q1',fields.get('q1'));api.answer('q2',Number(fields.get('q2')));submitted=true;form.querySelectorAll('input').forEach(input=>{input.disabled=true;});}
 button.disabled=true;status.textContent='Enviando…';
 try{const receipt=await api.complete();status.textContent=`Recepción confirmada · ${receipt.status==='provisional'?'Pendiente de revisión':'Resultado recibido'}.`;button.textContent='Enviado';}
 catch{status.textContent='Recepción sin confirmar. Reintenta la misma entrega.';button.textContent='Reintentar';button.disabled=false;}
});
