export function createGroupsModule(sb){
  const state={groups:[],selected:null,sessions:[]};
  const makeCode=()=>String(Math.floor(100000+Math.random()*900000));
  async function load(){const {data,error}=await sb.from('groups').select('*').order('created_at',{ascending:false});if(error)throw error;state.groups=data||[];return state.groups;}
  async function create({name,subject,section}){if(!name?.trim())throw new Error('El nombre del grupo es obligatorio');let result,error;for(let i=0;i<5;i++){({data:result,error}=await sb.from('groups').insert({name:name.trim(),subject:subject?.trim()||null,section:section?.trim()||null,permanent_code:makeCode()}).select().single());if(!error)break;}if(error)throw error;await load();return result;}
  async function select(id){state.selected=state.groups.find(g=>g.id===id)||null;if(!state.selected)throw new Error('Grupo no encontrado');const {data,error}=await sb.from('sessions').select('id,title,status,code,created_at,closed_at').eq('group_id',id).order('created_at',{ascending:false});if(error)throw error;state.sessions=data||[];return state.selected;}
  async function createSession(){if(!state.selected)throw new Error('Selecciona un grupo');let result,error;for(let i=0;i<5;i++){({data:result,error}=await sb.from('sessions').insert({group_id:state.selected.id,code:makeCode(),title:`${state.selected.name} · Sesión`,status:'draft'}).select().single());if(!error)break;}if(error)throw error;return result;}
  return {state,load,create,select,createSession};
}