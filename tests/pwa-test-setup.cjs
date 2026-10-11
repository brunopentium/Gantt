// Existing app tests opt out of the new install question in their isolated browser.
const {chromium}=require('playwright');
const launch=chromium.launch.bind(chromium);
chromium.launch=async(...args)=>{
 const browser=await launch(...args),newContext=browser.newContext.bind(browser);
 browser.newContext=async(...args)=>{
  const context=await newContext(...args);
  if(process.env.TEST_PWA!=='1')await context.addInitScript(()=>{try{localStorage.setItem('pf_pwa_install_choice_v1','no')}catch{}});
  return context;
 };
 return browser;
};
