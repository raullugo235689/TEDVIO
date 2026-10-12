import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllPages,createRefreshQueue,batchedPagedResult } from '../src/core/data-pages.ts';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('pagination returns every row beyond API default page limit in stable order',async()=>{
 const records=Array.from({length:2101},(_,id)=>({id})),calls=[];
 const all=await fetchAllPages(async(from,to)=>{calls.push([from,to]);return {data:records.slice(from,to+1),error:null};});
 assert.deepEqual(all,records);assert.equal(calls.length,5);assert.deepEqual(calls[1],[500,999]);
});
test('a page failure or safety limit never returns a misleading partial report',async()=>{
 await assert.rejects(()=>fetchAllPages(async from=>from?{data:null,error:{message:'Network failed'}}:{data:Array(500).fill(1),error:null}),/Network/);
 await assert.rejects(()=>fetchAllPages(async()=>({data:Array(500).fill(1),error:null}),500,700),/historial/);
});
for(const participants of [35,100]) test(`a burst of ${participants} events is grouped without cancelling reads`,async()=>{
 let calls=0;const queue=createRefreshQueue(async()=>{calls++;},5);
 for(let i=0;i<participants;i++)queue.request();
 await wait(35);queue.dispose();assert.equal(calls,1);
});
test('an event received during a read schedules one final reconciliation',async()=>{
 let calls=0,finish;const queue=createRefreshQueue(async()=>{calls++;if(calls===1)await new Promise(resolve=>{finish=resolve;});},5);
 queue.request();await wait(20);for(let i=0;i<100;i++)queue.request();finish();await wait(35);queue.dispose();assert.equal(calls,2);
});
test('unmount cancels queued work and cannot create future refreshes',async()=>{
 let calls=0;const queue=createRefreshQueue(async()=>{calls++;},5);queue.request();queue.dispose();queue.request();await wait(20);assert.equal(calls,0);
});

test('batched reports keep URL identifiers bounded and do not repeat an id',async()=>{
 const ids=Array.from({length:225},(_,i)=>String(i)),batches=[];
 const result=await batchedPagedResult([...ids,ids[0]],batch=>({range:async()=>{batches.push(batch);return {data:batch,error:null};}}));
 assert.deepEqual(result.data,ids);assert.deepEqual(batches.map(x=>x.length),[100,100,25]);
});
test('invalid page bounds are rejected before starting any query',async()=>{
 await assert.rejects(()=>fetchAllPages(()=>{throw new Error('must not run');},0),/positivos/);
});
