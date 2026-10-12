import test from 'node:test';
import assert from 'node:assert/strict';
import { workflowContext, workflowLink, classShortcut } from '../src/core/workflow-navigation.ts';

test('context comes only from group routes, not session, exam or account ids', () => {
  assert.deepEqual(workflowContext('/attendance/g-1', '?date=2026-10-12'), { groupId: 'g-1', periodId: '' });
  assert.deepEqual(workflowContext('/students/g-1/s-1', ''), { groupId: 'g-1', periodId: '' });
  for (const path of ['/classroom/session-1', '/exams/exam-1', '/omr/exam-1', '/settings', '/attendance-joint/event-1'])
    assert.deepEqual(workflowContext(path, '?group=foreign&period=foreign'), { groupId: '', periodId: '' });
  assert.deepEqual(workflowContext('/groups/%E0%A4%A', ''), { groupId: '', periodId: '' });
});
test('hubs carry explicit group and period; no period is invented', () => {
  const context = workflowContext('/gradebook/g-1', '?period=p-1');
  assert.equal(workflowLink('/prepare', context), '/prepare?group=g-1&period=p-1');
  assert.equal(workflowLink('/evaluate', context), '/evaluate?group=g-1&period=p-1');
  assert.equal(workflowLink('/reports', context), '/reports/g-1?period=p-1');
  assert.equal(workflowLink('/gradebook', workflowContext('/prepare', '?group=g-1&period=p-1')), '/gradebook/g-1?period=p-1');
});
test('attendance, bank and new exam do not receive an unrelated period or date', () => {
  const context = { groupId: 'g-1', periodId: 'p-1' };
  assert.equal(workflowLink('/attendance', context), '/attendance/g-1');
  assert.equal(workflowLink('/attendance-justifications', context), '/attendance-justifications?group=g-1');
  assert.equal(workflowLink('/bank?launch=1', context), '/bank?launch=1&group=g-1');
  assert.equal(workflowLink('/exams/new', context), '/exams/new?group=g-1');
  assert.equal(workflowLink('/students', context), '/groups/g-1?tab=students');
});
test('multi-group, scanner, all groups and account remain independent', () => {
  for (const path of ['/', '/groups', '/attendance-joint', '/omr', '/settings', '/support', '/enarm-2027'])
    assert.equal(workflowLink(path, { groupId: 'g-1', periodId: 'p-1' }), path);
});
test('course sentinel cannot be passed to a report RPC as a period id', () => {
  assert.equal(workflowLink('/reports', { groupId: 'g-1', periodId: 'course' }), '/reports/g-1');
  assert.equal(workflowLink('/gradebook', { groupId: 'g-1', periodId: 'course' }), '/gradebook/g-1?period=course');
});
test('URL encoding preserves context without inserting query strings', () => {
  assert.equal(workflowLink('/attendance', { groupId: 'id?x=1', periodId: '' }), '/attendance/id%3Fx%3D1');
  assert.equal(workflowLink('/evaluate', { groupId: '', periodId: 'p-1' }), '/evaluate');
});
test('one live session resumes, multiple require selection, drafts never auto-start', () => {
  const sessions = [{ id: 'live-1', status: 'live', group_id: 'a' }, { id: 'draft-1', status: 'draft', group_id: 'b' }, { id: 'old', status: 'closed', group_id: 'a' }];
  assert.deepEqual(classShortcut(sessions), { label: 'Volver a la clase', to: '/classroom/live-1' });
  assert.deepEqual(classShortcut(sessions, 'b'), { label: 'Iniciar clase', to: '/classroom?group=b' });
  assert.deepEqual(classShortcut([...sessions, { id: 'live-2', status: 'live', group_id: 'b' }]), { label: 'Clases en curso', to: '/classroom' });
  assert.equal(classShortcut([{ id: 'demo', status: 'live', is_demo: true }]).label, 'Iniciar clase');
});
