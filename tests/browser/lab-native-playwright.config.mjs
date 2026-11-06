import {defineConfig,devices} from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'lab-native.spec.mjs',timeout:120000,globalTimeout:600000,expect:{timeout:15000},workers:1,fullyParallel:false,retries:0,
 reporter:[['line'],['json',{outputFile:'test-results/lab-native-results.json'}]],
 use:{baseURL:'http://127.0.0.1:4174',serviceWorkers:'block',trace:'off',screenshot:'off'},
 projects:[{name:'desktop-chromium',use:{...devices['Desktop Chrome']}},{name:'iphone-webkit',use:{...devices['iPhone 15 Pro']}}],
 webServer:{command:'node tests/browser/phase6-server.mjs',cwd:'../..',port:4174,reuseExistingServer:!process.env.CI,timeout:15000}});
