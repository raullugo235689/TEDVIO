import {defineConfig,devices} from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:['interactive-lab-sdk.spec.mjs'],timeout:15000,workers:1,
 reporter:[['line']],use:{baseURL:'http://127.0.0.1:4189',trace:'retain-on-failure'},
 projects:[{name:'desktop-chromium',use:{...devices['Desktop Chrome']}},{name:'iphone-webkit',use:{...devices['iPhone 15 Pro']}}],
 webServer:{command:'node tests/browser/interactive-lab-server.mjs',cwd:'../..',port:4189,reuseExistingServer:false,timeout:10000}});
