const VERSION='2026.08.28.68.11';
const BUCKET='tedvio-media-v2';
const db=window.__TEDVIO_DB__;
const dayNames=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

function monthValue(){const input=document.querySelector('#tapMonth');if(input?.value)return input.value;const d=new Date(),o=d.getTimezoneOffset();return new Date(d.getTime()-o*60000).toISOString().slice(0,7)}
function monthBounds(value){const[y,m]=String(value).split('-').map(Number),start=`${y}-${String(m).padStart(2,'0')}-01`,endDate=new Date(y,m,0),end=`${y}-${String(m).padStart(2,'0')}-${String(endDate.getDate()).padStart(2,'0')}`;return{start,end,y,m}}
function dateMx(v){if(!v)return'—';const[y,m,d]=String(v).slice(0,10).split('-');return`${d}/${m}/${y}`}
function clean(v=''){return String(v??'').trim()}
function norm(v=''){return clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ')}
function fileSafe(v=''){return clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'_').replace(/^_+|_+$/g,'').slice(0,70)||'Grupo'}
function professorName(user){return clean(user?.user_metadata?.full_name||user?.user_metadata?.name||user?.user_metadata?.display_name||user?.email||'Profesor(a)')}
function mark(status){return status==='present'?'•':status==='late'?'R':status==='absent'?'/':status==='justified'?'J':''}
function countStatus(rows,status){return rows.filter(x=>x?.status===status).length}
function dayLabel(date){const d=new Date(`${date}T12:00:00`);return`${dayNames[d.getDay()]}\n${String(d.getDate()).padStart(2,'0')}`}

async function ensurePdf(){if(window.jspdf?.jsPDF&&window.jspdf?.jsPDF?.API)return true;const api=window.__TEDVIO_PROGRESSIVE_BOOT68__;if(!api?.ensure)return false;await api.ensure('exports');return!!window.jspdf?.jsPDF}
async function loadBranding(uid,institutionName){
  const{data:memberships,error:me}=await db.from('tedvio_institution_memberships').select('institution_id,status').eq('user_id',uid).eq('status','active');if(me)return null;
  const ids=(memberships||[]).map(x=>x.institution_id);if(!ids.length)return null;
  const{data,error}=await db.from('tedvio_institutions').select('id,name,report_display_name,report_logo_path,report_title,report_approver_name,report_approver_title,report_approval_label,report_document_code').in('id',ids);if(error)return null;
  const target=norm(institutionName);return(data||[]).find(x=>norm(x.name)===target)||null;
}
async function loadInstitutionalData(){
  if(!db)throw new Error('El motor de datos de TEDVIO no está disponible.');
  const{data:{session}}=await db.auth.getSession(),user=session?.user;if(!user)throw new Error('Inicia sesión como profesor.');
  const groupId=sessionStorage.getItem('tedvio.currentGroupId');if(!groupId)throw new Error('Abre primero un grupo.');
  const month=monthValue(),bounds=monthBounds(month),uid=user.id;
  const[g,st,ats]=await Promise.all([
    db.from('v2_groups').select('*').eq('id',groupId).eq('teacher_id',uid).single(),
    db.from('v2_group_students').select('id,enrollment,full_name').eq('group_id',groupId).eq('teacher_id',uid).eq('active',true).order('full_name'),
    db.from('v2_attendance_sessions').select('id,attendance_date,status,created_at').eq('group_id',groupId).eq('teacher_id',uid).gte('attendance_date',bounds.start).lte('attendance_date',bounds.end).order('attendance_date',{ascending:true})
  ]);
  if(g.error)throw g.error;if(st.error)throw st.error;if(ats.error)throw ats.error;
  const attendance=ats.data||[],ids=attendance.map(x=>x.id);let records=[];
  if(ids.length){const r=await db.from('v2_attendance_records').select('attendance_session_id,student_id,status').in('attendance_session_id',ids).eq('teacher_id',uid);if(r.error)throw r.error;records=r.data||[]}
  let program=null,university=null;
  if(g.data?.program_id){const p=await db.from('v2_programs').select('*').eq('id',g.data.program_id).maybeSingle();if(!p.error)program=p.data||null;if(program?.university_id){const u=await db.from('v2_universities').select('*').eq('id',program.university_id).maybeSingle();if(!u.error)university=u.data||null}}
  const institutionName=clean(university?.name||g.data?.university||'INSTITUCIÓN ACADÉMICA'),branding=await loadBranding(uid,institutionName);
  return{user,group:g.data,students:st.data||[],attendance,records,program,university,branding,month,bounds};
}
function metaFrom(data){
  const g=data.group||{},p=data.program||{},u=data.university||{},b=data.branding||{};
  return{
    institution:clean(b.report_display_name||b.name||u.name||g.university||'INSTITUCIÓN ACADÉMICA').toUpperCase(),
    program:clean(p.name||g.program||g.section||'—').toUpperCase(),cycle:clean(g.term||g.school_cycle||g.cycle||'—'),
    subject:clean(g.subject||g.course_name||g.name||g.group_name||'—').toUpperCase(),group:clean(g.name||g.group_name||'—').toUpperCase(),
    professor:professorName(data.user).toUpperCase(),period:`De la fecha ${dateMx(data.bounds.start)} a la fecha ${dateMx(data.bounds.end)}`,
    reportTitle:clean(b.report_title||'REGISTRO DE ASISTENCIA Y EVALUACIÓN').toUpperCase(),logoPath:clean(b.report_logo_path),
    approverName:clean(b.report_approver_name).toUpperCase(),approverTitle:clean(b.report_approver_title),approvalLabel:clean(b.report_approval_label||'Vo. Bo.'),documentCode:clean(b.report_document_code)
  };
}
async function loadLogo(path){
  if(!path)return null;try{const url=db.storage.from(BUCKET).getPublicUrl(path).data?.publicUrl;if(!url)return null;const res=await fetch(url,{cache:'no-store'});if(!res.ok)return null;const blob=await res.blob();if(!['image/png','image/jpeg'].includes(blob.type))return null;const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsDataURL(blob)});const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=data});return{data,format:blob.type==='image/png'?'PNG':'JPEG',width:img.naturalWidth||1,height:img.naturalHeight||1}}catch(error){console.warn('TEDVIO report logo',error);return null}
}
function drawLogo(doc,meta){const box={x:10,y:8,w:20,h:19},asset=meta.logoAsset;if(asset){const ratio=Math.min(box.w/asset.width,box.h/asset.height),w=asset.width*ratio,h=asset.height*ratio,x=box.x+(box.w-w)/2,y=box.y+(box.h-h)/2;doc.addImage(asset.data,asset.format,x,y,w,h,undefined,'FAST');return}doc.setDrawColor(30,40,55);doc.setLineWidth(.25);doc.roundedRect(11,8,18,18,2,2);doc.setFont('helvetica','bold');doc.setFontSize(11);doc.text('T',20,19,{align:'center'});doc.setFont('helvetica','normal');doc.setFontSize(5.5);doc.text('TEDVIO',20,24,{align:'center'})}
function drawHeader(doc,meta,pageW){
  drawLogo(doc,meta);doc.setTextColor(18,27,43);doc.setFont('helvetica','bold');doc.setFontSize(13);doc.text(meta.institution,pageW/2,13,{align:'center',maxWidth:pageW-70});
  doc.setFontSize(9.5);doc.text(meta.reportTitle,pageW/2,20,{align:'center',maxWidth:pageW-60});doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text(meta.period,pageW/2,27,{align:'center'});
  doc.setFontSize(7.2);doc.setFont('helvetica','bold');doc.text('Ciclo:',11,35);doc.text('Sección:',pageW/2+4,35);doc.text('Asignatura:',11,41);doc.text('Grupo:',pageW/2+4,41);doc.text('Profesor:',11,47);
  doc.setFont('helvetica','normal');doc.text(meta.cycle,25,35);doc.text(meta.program,pageW/2+20,35,{maxWidth:pageW/2-31});doc.text(meta.subject,31,41,{maxWidth:pageW/2-42});doc.text(meta.group,pageW/2+18,41);doc.text(meta.professor,27,47,{maxWidth:pageW-38});
}
function buildRows(data,sessions){return data.students.map((student,index)=>{const sr=data.records.filter(r=>r.student_id===student.id),bySession=new Map(sr.map(r=>[r.attendance_session_id,r])),cells=sessions.map(s=>mark(bySession.get(s.id)?.status));return[String(index+1),clean(student.enrollment),clean(student.full_name),...cells,String(countStatus(sr,'present')),String(countStatus(sr,'late')),String(countStatus(sr,'absent')),String(countStatus(sr,'justified'))]})}
function columnStyles(sessionCount,orientation){const portrait=orientation==='portrait',styles={0:{cellWidth:7,halign:'center'},1:{cellWidth:18,halign:'center'},2:{cellWidth:portrait?51:60,halign:'left'}},dateWidth=portrait?3.6:Math.max(4.2,Math.min(6.4,120/Math.max(1,sessionCount)));for(let i=0;i<sessionCount;i++)styles[3+i]={cellWidth:dateWidth,halign:'center'};for(let i=0;i<4;i++)styles[3+sessionCount+i]={cellWidth:portrait?7:8,halign:'center',fontStyle:'bold'};return styles}
function drawClosing(doc,meta,finalY,pageW,pageH){
  let y=Math.max(finalY+8,60);if(y>pageH-58){doc.addPage();drawHeader(doc,meta,pageW);y=61}
  doc.setTextColor(20,28,40);doc.setFontSize(7.4);doc.setFont('helvetica','bold');doc.text('Simbología',11,y);doc.setFont('helvetica','normal');doc.setFontSize(7);doc.text('Asistencia: •     Retardo: R     Falta: /     Justificada: J',11,y+6);
  const bx=pageW-77;doc.setFont('helvetica','bold');doc.text('FECHA DE ENTREGA',bx+29,y,{align:'center'});doc.setFontSize(6.3);doc.text('DÍA',bx+8,y+6,{align:'center'});doc.text('MES',bx+29,y+6,{align:'center'});doc.text('AÑO',bx+52,y+6,{align:'center'});doc.setDrawColor(35,45,60);doc.rect(bx,y+8,16,8);doc.rect(bx+16,y+8,26,8);doc.rect(bx+42,y+8,20,8);
  const signY=pageH-24,leftCenter=(12+pageW/2-8)/2,rightCenter=(pageW/2+8+pageW-12)/2;doc.setLineWidth(.25);doc.line(12,signY-4,pageW/2-8,signY-4);doc.line(pageW/2+8,signY-4,pageW-12,signY-4);
  doc.setFont('helvetica','normal');doc.setFontSize(6.6);doc.text(meta.professor,leftCenter,signY,{align:'center',maxWidth:pageW/2-24});
  doc.setFont('helvetica','bold');doc.setFontSize(6.2);doc.text(meta.approvalLabel||'Vo. Bo.',rightCenter,signY-7,{align:'center'});doc.setFont('helvetica','normal');doc.setFontSize(6.5);doc.text(meta.approverName||'COORDINACIÓN ACADÉMICA',rightCenter,signY,{align:'center',maxWidth:pageW/2-26});if(meta.approverTitle)doc.text(meta.approverTitle,rightCenter,signY+4,{align:'center',maxWidth:pageW/2-26});
  doc.setFontSize(5.8);doc.setTextColor(105,112,122);doc.text(`Generado con TEDVIO · ${VERSION}`,11,pageH-7);if(meta.documentCode)doc.text(meta.documentCode,pageW-11,pageH-7,{align:'right'});else doc.text('Reporte institucional de asistencia',pageW-11,pageH-7,{align:'right'});
}
async function exportInstitutional(){
  if(window.TEDVIO_ENTITLEMENTS?.features?.exports===false){window.tv63OpenPlan?.();return}
  try{
    const ready=await ensurePdf();if(!ready)return alert('No se pudo preparar el generador PDF. Intenta nuevamente.');
    const data=await loadInstitutionalData();if(!data.attendance.length)return alert('No hay listas de asistencia creadas en el mes seleccionado.');
    const sessions=data.attendance.slice().sort((a,b)=>String(a.attendance_date).localeCompare(String(b.attendance_date))),meta=metaFrom(data);meta.logoAsset=await loadLogo(meta.logoPath);
    const orientation=sessions.length>20?'landscape':'portrait',{jsPDF}=window.jspdf,doc=new jsPDF({orientation,unit:'mm',format:'a4'}),pageW=doc.internal.pageSize.getWidth(),pageH=doc.internal.pageSize.getHeight(),head=[['Nro','Matrícula','Nombre del Alumno(a)',...sessions.map(s=>dayLabel(s.attendance_date)),'A','R','F','J']],body=buildRows(data,sessions),col=columnStyles(sessions.length,orientation);
    doc.autoTable({head,body,startY:52,margin:{top:52,left:10,right:10,bottom:14},theme:'grid',styles:{font:'helvetica',fontSize:orientation==='portrait'?5.2:6.1,cellPadding:1.05,textColor:[22,30,42],lineColor:[45,52,62],lineWidth:.12,valign:'middle',overflow:'linebreak'},headStyles:{fillColor:[232,236,241],textColor:[15,24,38],fontStyle:'bold',fontSize:orientation==='portrait'?4.8:5.8,halign:'center',valign:'middle',minCellHeight:8},alternateRowStyles:{fillColor:[247,248,250]},columnStyles:col,didDrawPage:()=>drawHeader(doc,meta,pageW)});
    drawClosing(doc,meta,doc.lastAutoTable?.finalY||55,pageW,pageH);const pages=doc.getNumberOfPages();for(let i=1;i<=pages;i++){doc.setPage(i);doc.setFontSize(5.5);doc.setTextColor(110,116,126);doc.text(`Página ${i} de ${pages}`,pageW-11,pageH-3.5,{align:'right'})}
    doc.save(`TEDVIO_Registro_Asistencia_${fileSafe(meta.group)}_${data.month}.pdf`);
  }catch(error){console.error('TEDVIO branded attendance report',error);alert(error?.message||'No se pudo generar el reporte institucional.')}
}
function decorate(){document.querySelectorAll('button[onclick*="tvAttExportPdf"]').forEach(b=>{b.textContent='Reporte institucional';b.title='Generar registro institucional de asistencia con identidad de la institución'})}
function install(){if(typeof window.tvAttExportPdf==='function'&&!window.tvAttExportPdf.__institutional6811){exportInstitutional.__institutional6811=true;window.tvAttExportPdf=exportInstitutional}if(typeof window.tvAttendanceProOpen==='function'&&!window.tvAttendanceProOpen.__institutional6811){const old=window.tvAttendanceProOpen,wrapped=async(...args)=>{const r=await old(...args);requestAnimationFrame(decorate);return r};wrapped.__institutional6811=true;window.tvAttendanceProOpen=wrapped}decorate()}
install();window.addEventListener('tedvio:theme',decorate);window.addEventListener('tedvio:institution-branding',decorate);window.__TEDVIO_ATTENDANCE_REPORT6811__={version:VERSION,export:exportInstitutional,decorate};
