import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shuffle,playable,award} from '../src/core/enarm-game-model.ts';
test('shuffle preserves choices and does not mutate the source',()=>{
 const options=['correct','wrong1','wrong2','wrong3'];const shuffled=shuffle(options,()=>0);
 assert.deepEqual(options,['correct','wrong1','wrong2','wrong3']);assert.deepEqual([...shuffled].sort(),[...options].sort());assert.notDeepEqual(options,shuffled);
});
test('only cards with three distinct authored distractors are playable',()=>{
 assert.equal(playable({answer:'A',quiz_distractors:['B','C','D']}),true);
 for(const quiz_distractors of [null,[],['B'],['A','B','C'],['B',' b ','C'],['','C','D']])assert.equal(playable({answer:'A',quiz_distractors}),false);
});
test('points reward accuracy and capped streaks, never speed',()=>{
 assert.equal(award(false,20),0);assert.equal(award(true,0),100);assert.equal(award(true,1),125);assert.equal(award(true,4),200);assert.equal(award(true,99),200);
});
