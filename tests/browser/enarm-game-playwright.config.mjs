import base from './phase6-playwright.config.mjs';
// Keep this second suite from removing the canonical run's screenshots/results.
export default {
  ...base,
  testMatch: ['phase6-enarm-game.spec.mjs'],
  outputDir: '../../test-results/enarm',
  reporter: [['line'], ['json', { outputFile: 'test-results/enarm-results.json' }]],
};
