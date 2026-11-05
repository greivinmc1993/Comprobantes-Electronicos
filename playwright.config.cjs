'use strict';
const {defineConfig,devices}=require('@playwright/test');
module.exports=defineConfig({
 testDir:'./e2e',timeout:30000,expect:{timeout:8000},fullyParallel:false,
 forbidOnly:!!process.env.CI,retries:process.env.CI?1:0,workers:process.env.CI?1:undefined,
 reporter:process.env.CI?[['list'],['junit',{outputFile:'qa-results/playwright-junit.xml'}],['html',{open:'never'}]]:[['list'],['html',{open:'never'}]],
 use:{baseURL:'http://127.0.0.1:5173',trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'chromium-desktop',use:{...devices['Desktop Chrome']}},{name:'chromium-movil',use:{...devices['Desktop Chrome'],viewport:{width:390,height:844}}}],
 webServer:{command:'npm run dev:web',url:'http://127.0.0.1:5173',reuseExistingServer:!process.env.CI,timeout:120000}
});
