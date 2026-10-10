import { supabase } from './supabase';
import type { EnarmArea } from './enarm2027-areas';
export type FlashcardRating = 'again' | 'hard' | 'good';
export interface EnarmFlashcard {
 id: string; area: EnarmArea; topic: string; subtopic: string;
 question: string; answer: string; explanation: string;
 source_file: string; source_page: number;
 references_json: Array<{title:string;url:string}>;
}
export interface FlashcardReview { card_id:string; stage:number; tries:number; due_at:string; }
export const flashcardsKey=(userId:string)=>['enarm2027-private-flashcards',userId] as const;
export async function fetchFlashcards(userId:string) {
 // Paginate rather than silently dropping cards when a collection grows.
 const cards:EnarmFlashcard[]=[]; const reviews:FlashcardReview[]=[];
 for(let offset=0;;offset+=500){
  const {data,error}=await supabase.from('tedvio_enarm2027_flashcards')
   .select('id,area,topic,subtopic,question,answer,explanation,source_file,source_page,references_json')
   .eq('user_id',userId).order('id').range(offset,offset+499);
  if(error)throw error; cards.push(...(data??[]) as EnarmFlashcard[]); if((data?.length??0)<500)break;
 }
 for(let offset=0;;offset+=500){
  const {data,error}=await supabase.from('tedvio_enarm2027_flashcard_reviews')
   .select('card_id,stage,tries,due_at').eq('user_id',userId).order('card_id').range(offset,offset+499);
  if(error)throw error; reviews.push(...(data??[]) as FlashcardReview[]); if((data?.length??0)<500)break;
 }
 return {cards,reviews};
}
export async function rateFlashcard(cardId:string,rating:FlashcardRating,eventId:string){
 const {data,error}=await supabase.rpc('tedvio_enarm2027_rate_flashcard',{p_card_id:cardId,p_rating:rating,p_event_id:eventId});
 if(error)throw error; return data as {stage:number;due_at:string};
}
