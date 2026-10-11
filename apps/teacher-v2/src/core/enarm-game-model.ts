export function shuffle<T>(items:readonly T[],random:()=>number=Math.random):T[]{
 const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j]!,result[i]!];}return result;
}
export function playable(card:{answer:string;quiz_distractors?:string[]|null}){
 const options=[card.answer,...(card.quiz_distractors??[])];
 return options.length===4&&options.every(x=>typeof x==='string'&&x.trim().length>0)&&new Set(options.map(x=>x.trim().toLocaleLowerCase())).size===4;
}
export function award(correct:boolean,streak:number){return correct?100+Math.min(Math.max(streak,0),4)*25:0;}
