// The assembled classic site and studio use one published set of language and audio assets.
import {installSiteAccess} from './site-access.js';
function install(){
  const theme=document.querySelector('.themeChoice');
  if(theme)installSiteAccess(theme);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
else if(document.querySelector('.themeChoice'))install();
else document.addEventListener('DOMContentLoaded',install,{once:true});
