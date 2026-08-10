const THEME_KEY='dfm_color_theme';
const THEMES=[
  {id:'blue',name:'Modrá',colors:['#2d8cff','#07111f']},
  {id:'rose',name:'Růžová',colors:['#ff5ca8','#21101c']},
  {id:'violet',name:'Fialová',colors:['#a678ff','#120d24']},
  {id:'emerald',name:'Smaragdová',colors:['#31d9a0','#071b19']},
  {id:'sunset',name:'Západ slunce',colors:['#ff875c','#21120e']}
];

function applyTheme(id){
  const theme=THEMES.some(item=>item.id===id)?id:'blue';
  document.documentElement.dataset.dfmTheme=theme;
  localStorage.setItem(THEME_KEY,theme);
  document.querySelectorAll('.theme-choice').forEach(button=>{const active=button.dataset.theme===theme;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
}

function enhanceSettings(panel){
  if(!(panel instanceof HTMLElement)||panel.dataset.themeEnhanced==='1')return;
  panel.dataset.themeEnhanced='1';
  const about=panel.querySelector('.about-box'),section=document.createElement('section');
  section.className='theme-settings';
  const title=document.createElement('div');title.className='theme-settings-title';title.innerHTML='<div><small>Vzhled aplikace</small><strong>Barevný motiv</strong></div><span>🎨</span>';
  const choices=document.createElement('div');choices.className='theme-choices';
  THEMES.forEach(theme=>{const button=document.createElement('button');button.type='button';button.className='theme-choice';button.dataset.theme=theme.id;button.innerHTML=`<i style="--theme-primary:${theme.colors[0]};--theme-bg:${theme.colors[1]}"></i><span>${theme.name}</span><b>✓</b>`;button.addEventListener('click',()=>applyTheme(theme.id));choices.appendChild(button);});
  section.append(title,choices);about?.insertAdjacentElement('beforebegin',section)||panel.appendChild(section);applyTheme(localStorage.getItem(THEME_KEY)||'blue');
}

applyTheme(localStorage.getItem(THEME_KEY)||'blue');
const themeObserver=new MutationObserver(()=>document.querySelectorAll('.settings-panel').forEach(enhanceSettings));
function startThemeSwitcher(){themeObserver.observe(document.body,{childList:true,subtree:true});document.querySelectorAll('.settings-panel').forEach(enhanceSettings);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startThemeSwitcher,{once:true});else startThemeSwitcher();
