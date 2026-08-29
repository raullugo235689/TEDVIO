import{defineConfig,devices}from'@playwright/test';
export default defineConfig({
  testDir:'.',
  testMatch:'v76-2-quality-core.spec.mjs',
  timeout:30000,
  expect:{timeout:5000},
  fullyParallel:false,
  workers:1,
  reporter:'line',
  use:{
    baseURL:'http://127.0.0.1:4173',
    trace:'retain-on-failure',
    screenshot:'only-on-failure'
  },
  projects:[
    {name:'desktop-chromium',use:{...devices['Desktop Chrome']}},
    {name:'mobile-chromium',use:{viewport:{width:390,height:844},isMobile:true,hasTouch:true}}
  ],
  webServer:{
    command:'python3 -m http.server 4173 --bind 127.0.0.1',
    cwd:'../..',
    port:4173,
    reuseExistingServer:true,
    timeout:10000
  }
});
