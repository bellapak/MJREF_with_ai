// =====================================================
// refboard v31 — app.js (Drive media fixed complete)
// - Google Drive JSON + image/video asset save/load
// - No gapi dependency: uses Google Identity Services + fetch
// =====================================================

const CAT_COLORS=['#ff6b35','#ff3b8b','#7b5cfa','#3b9eff','#3bfa8a','#ffd23b','#ff5555','#00d4d4','#ffaa3b','#c8f060'];
const PROVIDER_HINTS={anthropic:'발급: console.anthropic.com/settings/keys',openai:'발급: platform.openai.com/api-keys',google:'발급: aistudio.google.com/app/apikey'};
const DRIVE_SCOPE='https://www.googleapis.com/auth/drive';
const DRIVE_ROOT_FOLDER_NAME='refboard-assets';
const DRIVE_ASSET_FOLDER_NAME='assets';
const DRIVE_DATA_FILE_NAME='refboard-data.json';
const LS_KEY='refboard_v31_state';
const GDRIVE_CLIENT_ID_KEY='refboard_google_client_id';

let groups=[];
let categories=[];
let items=[];
let currentFilter='all';
let currentCatFilter=null;
let currentSort='newest';
let currentView='grid';
let selectedId=null;
let pendingFile=null;
let pendingCarouselFiles=[];
let modalMode='single';
let modalSelectedCats=[];
let gdriveToken=null;
let tokenClient=null;
let gdriveFolderId=null;
let gdriveAssetFolderId=null;
let gdriveDataFileId=null;
let aiSelectedIds=new Set();
let currentAiGroupFilter='';
let currentAiCatFilter='';
let renderTimer=null;
let boardRenderJob=0;
let objectUrlCache=new Map();
let state={items:[]};

const $=(id)=>document.getElementById(id);
const uid=(p='r')=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const esc=(s='')=>String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const first=(...v)=>v.find(x=>x!==undefined&&x!==null&&x!=='')||'';

function showToast(msg,type=''){
  const t=$('toast'); if(!t){console.log(msg);return;}
  t.textContent=msg; t.className='show '+type;
  setTimeout(()=>{t.className='';},2200);
}

function normalizeItem(raw={}){
  const type=raw.type || (String(raw.mimeType||raw.fileType||'').startsWith('video/')?'video':'image');
  return {
    id: raw.id || uid(),
    title: first(raw.title, raw.name, raw.filename, '제목없음'),
    type: type,
    src: raw.src || raw.url || raw.mediaUrl || '',
    driveFileId: raw.driveFileId || raw.fileId || '',
    mimeType: raw.mimeType || raw.fileType || '',
    thumbnailLink: raw.thumbnailLink || raw.thumbnail || '',
    fileName: raw.fileName || raw.filename || raw.name || '',
    catIds: Array.isArray(raw.catIds)?raw.catIds:[],
    platform: raw.platform || '', brand: raw.brand || '', sourceType: raw.sourceType || raw.source_type || '', sourceUrl: raw.sourceUrl || raw.source_url || '',
    caption: raw.caption || raw.description || raw.text || '', hook: raw.hook || raw.headline || '', cta: raw.cta || '',
    visualNotes: raw.visualNotes || raw.visual_notes || '', contentNotes: raw.contentNotes || raw.content_notes || '', notes: raw.notes || '',
    carousel: Array.isArray(raw.carousel)?raw.carousel:[],
    ts: raw.ts || raw.createdAt || Date.now()
  };
}
function syncState(){ state={groups,categories,items}; }
function saveLocal(){ syncState(); localStorage.setItem(LS_KEY, JSON.stringify(state)); updateAutosave('saved'); }
function loadLocal(){
  try{
    const raw=JSON.parse(localStorage.getItem(LS_KEY)||'{}');
    groups=Array.isArray(raw.groups)?raw.groups:[];
    categories=Array.isArray(raw.categories)?raw.categories:[];
    items=Array.isArray(raw.items)?raw.items.map(normalizeItem):[];
    state={groups,categories,items};
  }catch(e){ console.warn(e); }
}
function updateAutosave(mode){ const el=$('autosave-indicator'); if(el){el.style.color=mode==='saving'?'var(--orange)':'var(--green)'; el.title=mode==='saving'?'저장 중':'저장됨';}}
async function saveData(){ updateAutosave('saving'); saveLocal(); if(gdriveToken) await saveToDrive(true); }

// ─── Google Drive ───
function getGapiConfig(){ return {clientId:localStorage.getItem(GDRIVE_CLIENT_ID_KEY)||''}; }
function openGdriveSetup(){
  let modal=$('gdrive-setup-modal');
  if(!modal){
    modal=document.createElement('div'); modal.id='gdrive-setup-modal'; modal.className='modal-overlay';
    modal.innerHTML=`<div class="modal-box"><h3>Google Drive 설정</h3>
      <p style="font-size:12px;line-height:1.8;color:var(--t2);margin-bottom:14px;">Google Cloud OAuth 2.0 웹 클라이언트 ID를 입력하세요. 저장 후 Google 연결을 누르면 이미지·영상 파일까지 Drive에 저장/불러오기 됩니다.</p>
      <div class="form-row"><label class="form-label">OAuth Client ID</label><input class="form-input" id="gdrive-client-id-input" placeholder="000000.apps.googleusercontent.com"></div>
      <div class="modal-actions"><button class="btn-cancel" onclick="closeModal('gdrive-setup-modal')">취소</button><button class="btn-primary" onclick="saveGdriveSetup()">저장</button></div></div>`;
    document.body.appendChild(modal);
  }
  $('gdrive-client-id-input').value=getGapiConfig().clientId;
  modal.classList.add('open');
}
function saveGdriveSetup(){ const v=$('gdrive-client-id-input').value.trim(); if(!v){showToast('Client ID를 입력해주세요','error');return;} localStorage.setItem(GDRIVE_CLIENT_ID_KEY,v); closeModal('gdrive-setup-modal'); updateDriveUi(); showToast('Drive 설정 저장 완료','success'); }
function updateDriveUi(){ const connected=!!gdriveToken; const status=$('gdrive-status'); if(status) status.textContent=connected?'Drive 연결됨':'Drive 미연결'; const banner=$('gdrive-setup-banner'); if(banner) banner.style.display=getGapiConfig().clientId?'none':'inline-block'; const btn=$('gdrive-connect-btn'); if(btn) btn.textContent=connected?'Google 연결됨':'Google 연결'; }
async function ensureDriveToken(){
  if(gdriveToken) return gdriveToken;
  const {clientId}=getGapiConfig();
  if(!clientId){ openGdriveSetup(); throw new Error('Google OAuth Client ID가 없습니다.'); }
  if(!window.google?.accounts?.oauth2){ throw new Error('Google Identity Services 스크립트를 불러오지 못했습니다.'); }
  return await new Promise((resolve,reject)=>{
    tokenClient=google.accounts.oauth2.initTokenClient({
      client_id:clientId, scope:DRIVE_SCOPE,
      callback:(res)=>{ if(res.error) reject(res); else { gdriveToken=res.access_token; updateDriveUi(); resolve(gdriveToken); } }
    });
    tokenClient.requestAccessToken({prompt:'consent'});
  });
}
async function gdriveSignIn(){ try{ await ensureDriveToken(); await ensureDriveFolder(); showToast('Google Drive 연결 완료','success'); }catch(e){ console.error(e); showToast(e.message||'Drive 연결 실패','error'); } }
async function driveFetch(url,opts={}){ const token=await ensureDriveToken(); const res=await fetch(url,{...opts,headers:{Authorization:`Bearer ${token}`,...(opts.headers||{})}}); if(!res.ok){ const txt=await res.text().catch(()=>''); throw new Error(`Drive 요청 실패 ${res.status}: ${txt}`); } return res; }
async function findDriveFile(name,mimeType,parentId){
  const q=[`name='${name.replace(/'/g,"\\'")}'`,`trashed=false`]; if(mimeType) q.push(`mimeType='${mimeType}'`); if(parentId) q.push(`'${parentId}' in parents`);
  const url='https://www.googleapis.com/drive/v3/files?spaces=drive&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,mimeType,parents)&q='+encodeURIComponent(q.join(' and '));
  const json=await (await driveFetch(url)).json(); return json.files?.[0]||null;
}
async function listDriveFiles(parentId){
  const q=[`'${parentId}' in parents`,`trashed=false`].join(' and ');
  let files=[]; let pageToken='';
  do{
    const url='https://www.googleapis.com/drive/v3/files?spaces=drive&supportsAllDrives=true&includeItemsFromAllDrives=true&fields='+encodeURIComponent('nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,parents,thumbnailLink,webContentLink)')+'&pageSize=1000&q='+encodeURIComponent(q)+(pageToken?'&pageToken='+encodeURIComponent(pageToken):'');
    const json=await (await driveFetch(url)).json();
    files=files.concat(json.files||[]); pageToken=json.nextPageToken||'';
  }while(pageToken);
  return files;
}
async function listDriveFilesRecursive(parentId){
  const direct=await listDriveFiles(parentId);
  let all=[...direct];
  const folders=direct.filter(f=>f.mimeType==='application/vnd.google-apps.folder');
  for(const folder of folders){
    all=all.concat(await listDriveFilesRecursive(folder.id));
  }
  return all;
}
function isDriveMediaFile(f){ return /^image\//.test(f.mimeType||'') || /^video\//.test(f.mimeType||''); }
function cleanFileBase(name=''){ return String(name).replace(/\.[^.]+$/,'').trim().toLowerCase(); }
function fileToDriveItem(f){
  return normalizeItem({id:'d'+f.id,title:f.name,type:(f.mimeType||'').startsWith('video/')?'video':'image',driveFileId:f.id,mimeType:f.mimeType,fileName:f.name,thumbnailLink:f.thumbnailLink||'',ts:f.modifiedTime?Date.parse(f.modifiedTime):Date.now(),sourceType:'drive_assets'});
}
async function syncItemsWithDriveAssets(){
  const assetFolderId=await ensureAssetFolder();
  const files=(await listDriveFilesRecursive(assetFolderId)).filter(isDriveMediaFile);
  const byId=new Map(files.map(f=>[f.id,f]));
  const byName=new Map(files.map(f=>[cleanFileBase(f.name),f]));
  let linked=0, added=0;
  for(const it of items){
    if(it.driveFileId && byId.has(it.driveFileId)){ const f=byId.get(it.driveFileId); it.mimeType=it.mimeType||f.mimeType; it.fileName=it.fileName||f.name; it.thumbnailLink=it.thumbnailLink||f.thumbnailLink||''; continue; }
    const candidates=[it.fileName,it.title,(it.src||'').split('/').pop(),it.sourceUrl?.split('/').pop()].filter(Boolean).map(cleanFileBase);
    const hit=candidates.map(k=>byName.get(k)).find(Boolean);
    if(hit){ it.driveFileId=hit.id; it.mimeType=it.mimeType||hit.mimeType; it.fileName=it.fileName||hit.name; it.thumbnailLink=it.thumbnailLink||hit.thumbnailLink||''; if(!it.type || it.type==='link') it.type=hit.mimeType.startsWith('video/')?'video':'image'; linked++; }
    if(Array.isArray(it.carousel)){
      for(const slide of it.carousel){
        if(slide.driveFileId) continue;
        const sc=[slide.fileName,slide.title,(slide.src||'').split('/').pop()].filter(Boolean).map(cleanFileBase);
        const sh=sc.map(k=>byName.get(k)).find(Boolean);
        if(sh){ slide.driveFileId=sh.id; slide.mimeType=slide.mimeType||sh.mimeType; slide.fileName=slide.fileName||sh.name; slide.thumbnailLink=slide.thumbnailLink||sh.thumbnailLink||''; linked++; }
      }
    }
  }
  const existing=new Set(items.map(i=>i.driveFileId).filter(Boolean));
  files.forEach(f=>{ if(!existing.has(f.id)){ items.push(fileToDriveItem(f)); existing.add(f.id); added++; } });
  return {linked,added,total:files.length};
}
async function ensureDriveFolder(){
  if(gdriveFolderId) return gdriveFolderId;
  let folder=await findDriveFile(DRIVE_ROOT_FOLDER_NAME,'application/vnd.google-apps.folder');
  if(!folder){
    const meta={name:DRIVE_ROOT_FOLDER_NAME,mimeType:'application/vnd.google-apps.folder'};
    folder=await (await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id,name',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(meta)})).json();
  }
  gdriveFolderId=folder.id;
  const data=await findDriveFile(DRIVE_DATA_FILE_NAME,'application/json',gdriveFolderId); if(data) gdriveDataFileId=data.id;
  return gdriveFolderId;
}
async function ensureAssetFolder(){
  if(gdriveAssetFolderId) return gdriveAssetFolderId;
  const rootId=await ensureDriveFolder();
  let folder=await findDriveFile(DRIVE_ASSET_FOLDER_NAME,'application/vnd.google-apps.folder',rootId);
  if(!folder){
    const meta={name:DRIVE_ASSET_FOLDER_NAME,mimeType:'application/vnd.google-apps.folder',parents:[rootId]};
    folder=await (await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id,name',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(meta)})).json();
  }
  gdriveAssetFolderId=folder.id;
  return gdriveAssetFolderId;
}
async function uploadBlobToDrive(blob,name,mimeType,parentId=null){
  const folderId=parentId || await ensureAssetFolder();
  const metadata={name,parents:[folderId],mimeType};
  const boundary='-------refboard'+Date.now();
  const delimiter=`\r\n--${boundary}\r\n`; const close=`\r\n--${boundary}--`;
  const body=new Blob([delimiter,'Content-Type: application/json; charset=UTF-8\r\n\r\n',JSON.stringify(metadata),delimiter,`Content-Type: ${mimeType||'application/octet-stream'}\r\n\r\n`,blob,close],{type:`multipart/related; boundary=${boundary}`});
  const json=await (await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body})).json();
  return json;
}
async function uploadDataFile(){
  const folderId=await ensureDriveFolder(); syncState();
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  if(gdriveDataFileId){
    await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${gdriveDataFileId}?uploadType=media`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:blob});
  }else{
    const rootId=await ensureDriveFolder(); const f=await uploadBlobToDrive(blob,DRIVE_DATA_FILE_NAME,'application/json',rootId); gdriveDataFileId=f.id;
  }
}
async function saveToDrive(silent=false){
  try{
    await ensureDriveToken(); await ensureDriveFolder();
    await Promise.all(items.map(async it=>{
      if(it.driveFileId || !it._file) return;
      const f=await uploadBlobToDrive(it._file,it.fileName||it._file.name||`${it.id}`,it.mimeType||it._file.type||'application/octet-stream');
      it.driveFileId=f.id; it.mimeType=f.mimeType||it.mimeType; delete it._file;
      if(it.src?.startsWith('blob:')) it.src='';
    }));
    for(const it of items){
      if(Array.isArray(it.carousel)){
        for(const slide of it.carousel){
          if(!slide.driveFileId && slide._file){ const f=await uploadBlobToDrive(slide._file,slide.fileName||slide._file.name||`${slide.id}`,slide.mimeType||slide._file.type||'image/png'); slide.driveFileId=f.id; slide.mimeType=f.mimeType||slide.mimeType; delete slide._file; if(slide.src?.startsWith('blob:')) slide.src=''; }
        }
      }
    }
    await uploadDataFile(); saveLocal(); if(!silent) showToast('Drive 저장 완료','success'); renderBoard(); renderDetail();
  }catch(e){ console.error(e); if(!silent) showToast(e.message||'Drive 저장 실패','error'); }
}
async function loadFromDrive(){
  try{
    await ensureDriveToken(); await ensureDriveFolder(); await ensureAssetFolder();
    const f=await findDriveFile(DRIVE_DATA_FILE_NAME,'application/json',gdriveFolderId);
    if(f){
      gdriveDataFileId=f.id;
      const data=await (await driveFetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`)).json();
      groups=Array.isArray(data.groups)?data.groups:[];
      categories=Array.isArray(data.categories)?data.categories:[];
      items=Array.isArray(data.items)?data.items.map(normalizeItem):[];
    }else{
      groups=[]; categories=[]; items=[];
    }
    const sync=await syncItemsWithDriveAssets();
    saveLocal(); renderAll();
    showToast(`Drive 불러오기 완료 · 에셋 ${sync.total}개 / 연결 ${sync.linked}개 / 추가 ${sync.added}개`,'success');
  }catch(e){ console.error(e); showToast((e.message||'Drive 불러오기 실패')+' · Google 연결을 다시 눌러 권한을 재승인해주세요','error'); }
}
async function getDriveObjectURL(fileId,mimeType=''){
  if(!fileId) return '';
  if(objectUrlCache.has(fileId)) return objectUrlCache.get(fileId);
  const res=await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`);
  const blob=await res.blob();
  const url=URL.createObjectURL(blob.type?blob:new Blob([blob],{type:mimeType||'application/octet-stream'}));
  objectUrlCache.set(fileId,url); return url;
}
function bindDriveMedia(el,it,placeholder=''){
  if(!it){ if(placeholder) el.src=placeholder; return; }
  if(it.driveFileId){
    // 상세보기/원본 확인 때만 실제 파일 Blob을 가져옵니다.
    getDriveObjectURL(it.driveFileId,it.mimeType).then(u=>{ if(u) el.src=u; }).catch(e=>{ console.error('Drive media load failed', it, e); el.alt='Drive 미디어 로드 실패'; if(placeholder) el.src=placeholder; });
  }
  else if(it.src) el.src=it.src; else if(placeholder) el.src=placeholder;
}
function bindCardMedia(el,it,placeholder=''){
  if(!it){ if(placeholder) el.src=placeholder; return; }
  // 보드 카드에서는 대용량 원본을 받지 않고 Drive 썸네일만 먼저 사용합니다.
  // 이게 렌더링 속도를 가장 크게 개선합니다.
  if(it.driveFileId){
    if(it.thumbnailLink){ el.src=it.thumbnailLink; return; }
    if((it.mimeType||'').startsWith('image/')){
      el.src=`https://drive.google.com/thumbnail?id=${encodeURIComponent(it.driveFileId)}&sz=w360`;
      return;
    }
    if((it.mimeType||'').startsWith('video/')){
      el.removeAttribute('src');
      el.style.background='var(--s3)';
      return;
    }
  }
  if(it.src) el.src=it.src; else if(placeholder) el.src=placeholder;
}

// ─── UI/render ───
function renderAll(){ renderCategories(); renderBoard(); renderAiTargets(); updateDriveUi(); }
function debouncedRenderBoard(){ clearTimeout(renderTimer); renderTimer=setTimeout(renderBoard,120); }
function filteredItems(){
  let q=($('search-input')?.value||'').toLowerCase().trim(); let arr=[...items];
  if(currentFilter!=='all') arr=arr.filter(x=>x.type===currentFilter);
  if(currentCatFilter) arr=arr.filter(x=>x.catIds?.includes(currentCatFilter));
  if(q) arr=arr.filter(x=>[x.title,x.brand,x.caption,x.notes,x.hook,x.sourceUrl].join(' ').toLowerCase().includes(q));
  arr.sort((a,b)=>currentSort==='oldest'?a.ts-b.ts:currentSort==='title'?a.title.localeCompare(b.title,'ko'):b.ts-a.ts);
  return arr;
}
function renderBoard(){
  const board=$('board'); if(!board) return;
  const job=++boardRenderJob;
  board.className=currentView+'-view';
  board.innerHTML='';
  const arr=filteredItems();
  $('count-label') && ($('count-label').textContent=`${arr.length}개`);
  renderCounts();
  if(items.length===0){ board.appendChild(dropZoneNode()); return; }
  if(arr.length===0){ board.innerHTML='<div id="empty-state">검색 결과가 없어요<br><span style="font-size:11px;color:var(--t4)">다른 검색어나 필터를 사용해보세요</span></div>'; return; }

  // 한 번에 수백 개 DOM을 만들면 멈춤이 생겨서, 화면에 먼저 40개를 띄우고 나머지는 조각 렌더링합니다.
  const chunkSize=currentView==='list'?80:40;
  let idx=0;
  function paintChunk(){
    if(job!==boardRenderJob) return;
    const frag=document.createDocumentFragment();
    const end=Math.min(idx+chunkSize, arr.length);
    for(; idx<end; idx++) frag.appendChild(cardNode(arr[idx]));
    board.appendChild(frag);
    if(idx<arr.length) requestAnimationFrame(paintChunk);
  }
  paintChunk();
}
function dropZoneNode(){ const div=document.createElement('div'); div.id='drop-zone'; div.tabIndex=0; div.ondragover=onDragOver; div.ondragleave=onDragLeave; div.ondrop=onDrop; div.onclick=dzClick; div.onpaste=onDzPaste; div.innerHTML='<div class="dz-icon">＋</div>이미지 · 영상을 드래그하거나<br><span style="color:var(--accent)">클릭해서 파일 선택</span><br><span style="font-size:11px;color:var(--t4)">Ctrl+V 로 이미지 또는 URL 붙여넣기 가능</span>'; return div; }
function cardNode(it){
  const card=document.createElement('div'); card.className='ref-card'+(it.id===selectedId?' selected':''); card.onclick=()=>openDetail(it.id);
  const del=document.createElement('button'); del.className='card-delete'; del.textContent='×'; del.onclick=(e)=>{e.stopPropagation(); deleteItem(it.id);}; card.appendChild(del);
  let media;
  if(it.type==='video'){
    media=document.createElement('video'); media.className='card-media'; media.muted=true; media.playsInline=true; media.preload='none'; bindCardMedia(media,it); media.onmouseenter=async()=>{ if(!media.src && it.driveFileId){ try{ media.src=await getDriveObjectURL(it.driveFileId,it.mimeType); }catch(e){ console.error(e); } } media.play().catch(()=>{}); }; media.onmouseleave=()=>{media.pause(); if(media.currentTime) media.currentTime=0;};
  }else if(it.type==='carousel'){
    const firstSlide=it.carousel?.[0]||{}; media=document.createElement('img'); media.className='card-media'; media.loading='lazy'; bindCardMedia(media,firstSlide); media.alt=it.title;
  }else if(it.type==='link'){
    media=document.createElement('div'); media.className='card-video-thumb'; media.innerHTML='<div style="font-size:34px;color:var(--t3)">↗</div>';
  }else{
    media=document.createElement('img'); media.className='card-media'; media.loading='lazy'; bindCardMedia(media,it); media.alt=it.title;
  }
  card.appendChild(media);
  const info=document.createElement('div'); info.className='card-info';
  const tags=(it.catIds||[]).map(id=>categories.find(c=>c.id===id)).filter(Boolean).map(c=>`<span class="card-cat-tag" style="background:${c.color}22;color:${c.color}">${esc(c.name)}</span>`).join('');
  info.innerHTML=`<div class="card-title">${esc(it.title)}</div><div class="card-cats">${tags}</div><div class="card-date">${new Date(it.ts).toLocaleDateString('ko-KR')}</div>`;
  card.appendChild(info);
  const badge=document.createElement('div'); badge.className='card-type-badge'; badge.textContent=it.type==='video'?'VIDEO':it.type==='carousel'?'CAROUSEL':it.type==='link'?'LINK':'IMAGE'; card.appendChild(badge);
  return card;
}
function renderCounts(){
  const set=(id,n)=>{const el=$(id); if(el) el.textContent=n;};
  set('cnt-all',items.length); set('cnt-image',items.filter(i=>i.type==='image').length); set('cnt-video',items.filter(i=>i.type==='video').length); set('cnt-carousel',items.filter(i=>i.type==='carousel').length); set('cnt-link',items.filter(i=>i.type==='link').length);
}
function deleteItem(id){ if(!confirm('삭제할까요?')) return; items=items.filter(i=>i.id!==id); if(selectedId===id) closeDetail(); saveData(); renderAll(); }
function setFilter(f,btn){ currentFilter=f; currentCatFilter=null; document.querySelectorAll('.sb-btn[data-filter]').forEach(b=>b.classList.remove('active')); btn?.classList.add('active'); renderBoard(); }
function setSort(s,btn){ currentSort=s; document.querySelectorAll('.sb-btn[data-sort]').forEach(b=>b.classList.remove('active')); btn?.classList.add('active'); renderBoard(); }
function setView(v){ currentView=v; $('grid-btn')?.classList.toggle('active',v==='grid'); $('list-btn')?.classList.toggle('active',v==='list'); renderBoard(); }
function switchTab(tab){ $('tab-board')?.classList.toggle('active',tab==='board'); $('tab-ai')?.classList.toggle('active',tab==='ai'); $('board-wrap').style.display=tab==='board'?'block':'none'; $('ai-tab').classList.toggle('active',tab==='ai'); if(tab==='ai') renderAiTargets(); }
function toggleAiPanel(){ const active=$('ai-tab')?.classList.contains('active'); switchTab(active?'board':'ai'); }
function toggleMobileSidebar(){ $('sidebar')?.classList.add('mobile-open'); $('sidebar-overlay')?.classList.add('open'); }
function closeMobileSidebar(){ $('sidebar')?.classList.remove('mobile-open'); $('sidebar-overlay')?.classList.remove('open'); }

// ─── Categories ───
function renderCategories(){
  const list=$('cat-list'); if(!list) return; list.innerHTML='';
  categories.forEach(c=>{
    const row=document.createElement('div'); row.className='cat-row';
    const cnt=items.filter(i=>i.catIds?.includes(c.id)).length;
    row.innerHTML=`<button class="cat-filter-btn ${currentCatFilter===c.id?'active':''}"><span class="dot" style="background:${c.color}"></span><span class="cat-name">${esc(c.name)}</span><span class="cnt">${cnt}</span></button><button class="cat-edit-btn">×</button>`;
    row.querySelector('.cat-filter-btn').onclick=()=>{ currentCatFilter=c.id; currentFilter='all'; document.querySelectorAll('.sb-btn[data-filter]').forEach(b=>b.classList.remove('active')); document.querySelector('.sb-btn[data-filter="all"]')?.classList.add('active'); renderCategories(); renderBoard(); };
    row.querySelector('.cat-edit-btn').onclick=()=>{ if(confirm('카테고리를 삭제할까요?')){ categories=categories.filter(x=>x.id!==c.id); items.forEach(i=>i.catIds=(i.catIds||[]).filter(id=>id!==c.id)); saveData(); renderAll(); }};
    list.appendChild(row);
  });
  renderModalCats(); renderDetailCatOptions(); renderAiFilters();
}
function showNewCatForm(){ $('new-cat-form').style.display='block'; renderColorSwatches('new-cat-colors'); }
function hideNewCatForm(){ $('new-cat-form').style.display='none'; }
function saveNewCat(){ const name=$('new-cat-name').value.trim(); if(!name)return; categories.push({id:uid('c'),name,color:CAT_COLORS[categories.length%CAT_COLORS.length]}); $('new-cat-name').value=''; hideNewCatForm(); saveData(); renderAll(); }
function showNewGroupForm(){ $('new-group-form').style.display='block'; renderColorSwatches('new-group-colors'); }
function hideNewGroupForm(){ $('new-group-form').style.display='none'; }
function saveNewGroup(){ const name=$('new-group-name').value.trim(); if(!name)return; groups.push({id:uid('g'),name,color:CAT_COLORS[groups.length%CAT_COLORS.length]}); $('new-group-name').value=''; hideNewGroupForm(); saveData(); renderAll(); }
function renderColorSwatches(id){ const el=$(id); if(!el)return; el.innerHTML=CAT_COLORS.map(c=>`<span class="color-swatch" style="background:${c}"></span>`).join(''); }
function renderModalCats(){ const el=$('modal-cat-options'); if(!el)return; el.innerHTML=categories.map(c=>`<span class="mcat-chip ${modalSelectedCats.includes(c.id)?'selected':''}" data-id="${c.id}" style="${modalSelectedCats.includes(c.id)?`background:${c.color};`:''}">${esc(c.name)}</span>`).join('')||'<span style="font-size:11px;color:var(--t3)">카테고리 없음</span>'; el.querySelectorAll('.mcat-chip').forEach(ch=>ch.onclick=()=>{const id=ch.dataset.id; modalSelectedCats=modalSelectedCats.includes(id)?modalSelectedCats.filter(x=>x!==id):[...modalSelectedCats,id]; renderModalCats();}); }

// ─── Add/import ───
function openAddModal(){ pendingFile=null; pendingCarouselFiles=[]; modalSelectedCats=[]; $('modal-file-name').textContent=''; $('add-title').value=''; ['add-url','add-brand','add-source-url','add-caption','add-hook','add-cta','add-visual-notes','add-content-notes','add-notes'].forEach(id=>{if($(id))$(id).value='';}); renderModalCats(); switchModalTab('single'); $('add-modal')?.classList.add('open'); }
function closeModal(id){ $(id)?.classList.remove('open'); }
function switchModalTab(mode){ modalMode=mode; $('modal-single-section').style.display=mode==='single'?'block':'none'; $('modal-carousel-section').style.display=mode==='carousel'?'block':'none'; $('modal-tab-single').style.background=mode==='single'?'var(--accent)':'none'; $('modal-tab-single').style.color=mode==='single'?'#fff':'var(--t2)'; $('modal-tab-carousel').style.background=mode==='carousel'?'var(--accent)':'none'; $('modal-tab-carousel').style.color=mode==='carousel'?'#fff':'var(--t2)'; }
function fileToItem(file, extra={}){ const isVideo=file.type.startsWith('video/'); return normalizeItem({...extra,id:uid(),title:extra.title||file.name,type:isVideo?'video':'image',src:URL.createObjectURL(file),mimeType:file.type,fileName:file.name,ts:Date.now(),_file:file}); }
function handleModalFile(e){ pendingFile=e.target.files?.[0]||null; $('modal-file-name').textContent=pendingFile?pendingFile.name:''; if(pendingFile&&!$('add-title').value) $('add-title').value=pendingFile.name; }
function handleCarouselFiles(e){ pendingCarouselFiles=[...(e.target.files||[])]; const list=$('carousel-preview-list'); list.innerHTML=''; pendingCarouselFiles.forEach(f=>{const img=document.createElement('img'); img.src=URL.createObjectURL(f); img.style.cssText='width:64px;height:64px;object-fit:cover;border-radius:8px'; list.appendChild(img);}); $('carousel-count-label').textContent=`${pendingCarouselFiles.length}개 선택됨`; }
async function saveFromModal(){
  const base={title:$('add-title').value.trim()||'제목없음',catIds:[...modalSelectedCats],platform:$('add-platform').value,brand:$('add-brand').value,sourceType:$('add-source-type').value,sourceUrl:$('add-source-url').value,caption:$('add-caption').value,hook:$('add-hook').value,cta:$('add-cta').value,visualNotes:$('add-visual-notes').value,contentNotes:$('add-content-notes').value,notes:$('add-notes').value,ts:Date.now()};
  const url=$('add-url').value.trim();
  if(modalMode==='carousel'){
    if(!pendingCarouselFiles.length){showToast('캐러셀 이미지를 선택해주세요','error');return;}
    const slides=pendingCarouselFiles.map(f=>({id:uid('s'),src:URL.createObjectURL(f),mimeType:f.type,fileName:f.name,_file:f}));
    items.push(normalizeItem({...base,type:'carousel',carousel:slides}));
  }else if(pendingFile){ items.push(fileToItem(pendingFile,base)); }
  else if(url){ items.push(normalizeItem({...base,src:url,type:guessType(url)})); }
  else { showToast('파일 또는 URL을 입력해주세요','error'); return; }
  closeModal('add-modal'); await saveData(); renderAll();
}
function guessType(url){ const u=url.toLowerCase(); if(/\.(mp4|webm|mov|m4v)(\?|$)/.test(u))return'video'; if(/^https?:/.test(u)&&!/\.(png|jpe?g|gif|webp|svg)(\?|$)/.test(u))return'link'; return'image'; }
function addFromUrl(){ saveFromModal(); }
function handleFileInput(e){ [...(e.target.files||[])].forEach(f=>items.push(fileToItem(f,{catIds:[...modalSelectedCats]}))); saveData(); renderAll(); e.target.value=''; }
function onDragOver(e){ e.preventDefault(); e.currentTarget.classList.add('dragover'); }
function onDragLeave(){ $('drop-zone')?.classList.remove('dragover'); }
function onDrop(e){ e.preventDefault(); $('drop-zone')?.classList.remove('dragover'); [...(e.dataTransfer.files||[])].forEach(f=>items.push(fileToItem(f))); saveData(); renderAll(); }
function dzClick(e){ if(e.target.id!=='paste-btn') $('file-input')?.click(); }
function onDzPaste(e){ handlePaste(e.clipboardData); }
async function tryClipboardPaste(e){ e.stopPropagation(); try{ const data=await navigator.clipboard.readText(); if(data) addUrlItem(data); }catch(err){ showToast('브라우저 보안상 Ctrl+V로 붙여넣어주세요','error'); } }
function handlePaste(cd){ for(const item of cd.items||[]){ if(item.kind==='file'){ const f=item.getAsFile(); if(f) items.push(fileToItem(f)); } else if(item.kind==='string'){ item.getAsString(s=>{ if(/^https?:/.test(s.trim())){ addUrlItem(s.trim()); }}); } } saveData(); renderAll(); }
function addUrlItem(url){ items.push(normalizeItem({id:uid(),title:url.split('/').pop()||'URL 레퍼런스',src:url,type:guessType(url),ts:Date.now()})); saveData(); renderAll(); }
function copyMakeJsonTemplate(){ navigator.clipboard?.writeText(JSON.stringify([{title:'예시',type:'image',url:'https://...',caption:'캡션',brand:'브랜드'}],null,2)); showToast('JSON 구조 복사 완료','success'); }
function importMakeJsonFile(e){ const f=e.target.files?.[0]; if(!f)return; const r=new FileReader(); r.onload=()=>{ try{ const data=JSON.parse(r.result); const arr=Array.isArray(data)?data:(data.items||[]); items.push(...arr.map(normalizeItem)); saveData(); renderAll(); showToast('JSON 가져오기 완료','success'); }catch(err){showToast('JSON 형식 오류','error');} }; r.readAsText(f); }

// ─── Detail ───
function openDetail(id){ selectedId=id; renderBoard(); renderDetail(); $('detail-panel')?.classList.add('open'); }
function closeDetail(){ selectedId=null; $('detail-panel')?.classList.remove('open'); renderBoard(); }
function renderDetail(){ const it=items.find(i=>i.id===selectedId); if(!it)return; const m=$('detail-media'); if(!m)return; m.innerHTML=''; let el; if(it.type==='video'){el=document.createElement('video'); el.controls=true; bindDriveMedia(el,it);} else if(it.type==='carousel'){el=document.createElement('div'); (it.carousel||[]).forEach(s=>{const img=document.createElement('img'); img.style.marginBottom='8px'; bindDriveMedia(img,s); el.appendChild(img);});} else if(it.type==='link'){el=document.createElement('a'); el.href=it.src||it.sourceUrl; el.target='_blank'; el.textContent='원본 링크 열기';} else {el=document.createElement('img'); bindDriveMedia(el,it);} m.appendChild(el); renderDetailCatOptions(); const f=$('detail-fields'); f.innerHTML=`<div class="detail-field"><div class="detail-key">TITLE</div><div class="detail-val">${esc(it.title)}</div></div><div class="detail-field"><div class="detail-key">BRAND</div><div class="detail-val">${esc(it.brand||'-')}</div></div><div class="detail-field"><div class="detail-key">CAPTION</div><div class="detail-val">${esc(it.caption||'-')}</div></div><div class="detail-field"><div class="detail-key">DRIVE FILE ID</div><div class="detail-val">${esc(it.driveFileId||'-')}</div></div>`; }
function renderDetailCatOptions(){ const it=items.find(i=>i.id===selectedId); const el=$('detail-cat-options'); if(!el||!it)return; el.innerHTML=categories.map(c=>`<span class="cat-option-chip ${(it.catIds||[]).includes(c.id)?'selected':''}" data-id="${c.id}" style="${(it.catIds||[]).includes(c.id)?`background:${c.color};`:''}">${esc(c.name)}</span>`).join(''); el.querySelectorAll('.cat-option-chip').forEach(ch=>ch.onclick=()=>{const id=ch.dataset.id; it.catIds=it.catIds.includes(id)?it.catIds.filter(x=>x!==id):[...it.catIds,id]; saveData(); renderAll(); renderDetail();}); }

// ─── AI placeholders ───
function renderAiFilters(){ const gf=$('ai-group-filter'), cf=$('ai-cat-filter'); if(gf) gf.innerHTML='<option value="">전체 대분류</option>'+groups.map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join(''); if(cf) cf.innerHTML='<option value="">전체 소분류</option>'+categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join(''); }
function onAiGroupFilterChange(){ currentAiGroupFilter=$('ai-group-filter').value; renderAiTargets(); }
function onAiCatFilterChange(){ currentAiCatFilter=$('ai-cat-filter').value; renderAiTargets(); }
function renderAiTargets(){ const el=$('ai-target-selector'); if(!el)return; let arr=[...items]; if(currentAiCatFilter) arr=arr.filter(i=>i.catIds?.includes(currentAiCatFilter)); $('board-img-cnt')&&($('board-img-cnt').textContent=items.filter(i=>i.type==='image'||i.type==='carousel').length); $('board-vid-cnt')&&($('board-vid-cnt').textContent=items.filter(i=>i.type==='video').length); $('ai-filter-meta')&&($('ai-filter-meta').textContent=`${arr.length}개 레퍼런스 표시 중`); el.innerHTML=''; if(!arr.length){el.innerHTML='<div class="ai-target-empty">표시할 레퍼런스가 없습니다</div>';return;} arr.forEach(it=>{ const c=document.createElement('div'); c.className='ai-target-card '+(aiSelectedIds.has(it.id)?'selected':''); c.onclick=()=>{aiSelectedIds.has(it.id)?aiSelectedIds.delete(it.id):aiSelectedIds.add(it.id); renderAiTargets();}; const img=document.createElement(it.type==='video'?'video':'img'); if(it.type==='video') img.muted=true; bindDriveMedia(img,it.type==='carousel'?(it.carousel?.[0]||{}):it); c.appendChild(img); c.insertAdjacentHTML('beforeend',`<div class="atc-title">${esc(it.title)}</div>`); el.appendChild(c); }); }
function selectAllVisibleAiTargets(){ filteredItems().forEach(i=>aiSelectedIds.add(i.id)); renderAiTargets(); }
function clearVisibleAiTargets(){ filteredItems().forEach(i=>aiSelectedIds.delete(i.id)); renderAiTargets(); }
function saveApiKey(){ const p=$('ai-provider')?.value||'google'; const v=$('ai-apikey-input')?.value||''; localStorage.setItem('refboard_ai_'+p,v); $('api-key-status').style.display='block'; showToast('AI 키 저장 완료','success'); }
function onProviderChange(){ const p=$('ai-provider')?.value||'google'; if($('ai-apikey-input')) $('ai-apikey-input').value=localStorage.getItem('refboard_ai_'+p)||''; if($('api-key-hint')) $('api-key-hint').textContent=PROVIDER_HINTS[p]||''; }
function runSingleAnalysis(){ const res=$('ai-single-result'); if(!res)return; const chosen=[...aiSelectedIds].map(id=>items.find(i=>i.id===id)).filter(Boolean); res.classList.add('open'); res.innerHTML=`선택된 ${chosen.length}개 레퍼런스 기준으로 분석할 수 있습니다.<br>현재 완성본은 Drive 미디어 저장/불러오기 안정화에 초점을 맞춘 버전입니다.`; }
function runBatchAnalysis(){ const res=$('ai-batch-result'); if(!res)return; res.classList.add('open'); res.innerHTML=`전체 ${items.length}개 레퍼런스가 수집되어 있습니다.`; }

// init
window.addEventListener('DOMContentLoaded',()=>{ loadLocal(); renderAll(); onProviderChange(); updateDriveUi(); document.addEventListener('paste',e=>{ if(document.activeElement?.tagName==='INPUT'||document.activeElement?.tagName==='TEXTAREA') return; handlePaste(e.clipboardData); }); });

// =====================================================
// v34 patch — grouped category dropdown + reliable paste UI
// =====================================================
const collapsedGroups = new Set(JSON.parse(localStorage.getItem('refboard_collapsed_groups')||'[]'));
function persistCollapsedGroups(){ localStorage.setItem('refboard_collapsed_groups', JSON.stringify([...collapsedGroups])); }
function getCategoryGroupId(c){ return c.groupId || c.parentId || c.group || ''; }
function setCategoryGroupId(c, groupId){ c.groupId = groupId || ''; delete c.parentId; delete c.group; }
function groupByCategories(){
  const map = new Map();
  groups.forEach(g=>map.set(g.id, []));
  const ungrouped=[];
  categories.forEach(c=>{
    const gid=getCategoryGroupId(c);
    if(gid && map.has(gid)) map.get(gid).push(c); else ungrouped.push(c);
  });
  return {map, ungrouped};
}
function categoryRowNode(c){
  const row=document.createElement('div'); row.className='cat-row';
  const cnt=items.filter(i=>i.catIds?.includes(c.id)).length;
  row.innerHTML=`<button class="cat-filter-btn ${currentCatFilter===c.id?'active':''}"><span class="dot" style="background:${c.color}"></span><span class="cat-name">${esc(c.name)}</span><span class="cnt">${cnt}</span></button><button class="cat-edit-btn" title="카테고리 삭제">×</button>`;
  row.querySelector('.cat-filter-btn').onclick=()=>{
    currentCatFilter=c.id; currentFilter='all';
    document.querySelectorAll('.sb-btn[data-filter]').forEach(b=>b.classList.remove('active'));
    document.querySelector('.sb-btn[data-filter="all"]')?.classList.add('active');
    renderCategories(); renderBoard();
  };
  row.querySelector('.cat-edit-btn').onclick=(e)=>{
    e.stopPropagation();
    if(confirm('소분류를 삭제할까요?')){
      categories=categories.filter(x=>x.id!==c.id);
      items.forEach(i=>i.catIds=(i.catIds||[]).filter(id=>id!==c.id));
      saveData(); renderAll();
    }
  };
  return row;
}
function renderCategories(){
  const list=$('cat-list'); if(!list) return; list.innerHTML='';
  const {map, ungrouped}=groupByCategories();

  groups.forEach(g=>{
    const cats=map.get(g.id)||[];
    const open=!collapsedGroups.has(g.id);
    const block=document.createElement('div'); block.className='group-block';
    const cnt=cats.reduce((sum,c)=>sum+items.filter(i=>i.catIds?.includes(c.id)).length,0);
    block.innerHTML=`<div class="group-header" data-gid="${g.id}">
      <span class="group-toggle ${open?'open':''}">▶</span>
      <span class="group-title-line" style="background:${g.color||'var(--accent)'}"></span>
      <span class="group-name" style="color:${g.color||'var(--t1)'}">${esc(g.name)}</span>
      <span class="group-cnt">${cnt}</span>
      <button class="group-edit-btn" title="대분류 삭제">×</button>
    </div>`;
    const children=document.createElement('div'); children.className='group-children'+(open?'':' collapsed');
    if(cats.length){ cats.forEach(c=>children.appendChild(categoryRowNode(c))); }
    else { children.innerHTML='<div style="font-size:11px;color:var(--t4);padding:6px 10px;">소분류 없음</div>'; }
    block.appendChild(children);
    block.querySelector('.group-header').onclick=(e)=>{
      if(e.target.classList.contains('group-edit-btn')) return;
      collapsedGroups.has(g.id)?collapsedGroups.delete(g.id):collapsedGroups.add(g.id);
      persistCollapsedGroups(); renderCategories();
    };
    block.querySelector('.group-edit-btn').onclick=(e)=>{
      e.stopPropagation();
      if(confirm('대분류를 삭제할까요? 소분류는 그룹 없음으로 이동합니다.')){
        groups=groups.filter(x=>x.id!==g.id);
        categories.forEach(c=>{ if(getCategoryGroupId(c)===g.id) setCategoryGroupId(c,''); });
        saveData(); renderAll();
      }
    };
    list.appendChild(block);
  });

  if(ungrouped.length){
    const sec=document.createElement('div'); sec.className='ungrouped-section';
    sec.innerHTML='<div class="sb-section" style="padding-top:8px;">그룹 없음</div>';
    ungrouped.forEach(c=>sec.appendChild(categoryRowNode(c)));
    list.appendChild(sec);
  }
  renderNewCatGroupOptions(); renderModalCats(); renderDetailCatOptions(); renderAiFilters();
}
function renderNewCatGroupOptions(){
  const sel=$('new-cat-group'); if(!sel) return;
  const cur=sel.value||'';
  sel.innerHTML='<option value="">그룹 없음</option>'+groups.map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join('');
  sel.value=cur;
}
function showNewCatForm(){ $('new-cat-form').style.display='block'; renderNewCatGroupOptions(); renderColorSwatches('new-cat-colors'); }
function saveNewCat(){
  const name=$('new-cat-name').value.trim(); if(!name)return;
  const groupId=$('new-cat-group')?.value||'';
  categories.push({id:uid('c'),name,color:CAT_COLORS[categories.length%CAT_COLORS.length],groupId});
  $('new-cat-name').value=''; if($('new-cat-group')) $('new-cat-group').value='';
  hideNewCatForm(); saveData(); renderAll();
}
function showNewGroupForm(){ $('new-group-form').style.display='block'; renderColorSwatches('new-group-colors'); }
function saveNewGroup(){
  const name=$('new-group-name').value.trim(); if(!name)return;
  const g={id:uid('g'),name,color:CAT_COLORS[groups.length%CAT_COLORS.length]};
  groups.push(g); collapsedGroups.delete(g.id); persistCollapsedGroups();
  $('new-group-name').value=''; hideNewGroupForm(); saveData(); renderAll();
}
function renderAiFilters(){
  const gf=$('ai-group-filter'), cf=$('ai-cat-filter');
  if(gf) gf.innerHTML='<option value="">전체 대분류</option>'+groups.map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join('');
  if(cf){
    let cats=categories;
    if(currentAiGroupFilter) cats=cats.filter(c=>getCategoryGroupId(c)===currentAiGroupFilter);
    cf.innerHTML='<option value="">전체 소분류</option>'+cats.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  }
}
function onAiGroupFilterChange(){ currentAiGroupFilter=$('ai-group-filter').value; currentAiCatFilter=''; if($('ai-cat-filter')) $('ai-cat-filter').value=''; renderAiFilters(); renderAiTargets(); }
function renderAiTargets(){
  const el=$('ai-target-selector'); if(!el)return;
  let arr=[...items];
  if(currentAiGroupFilter){
    const catIds=categories.filter(c=>getCategoryGroupId(c)===currentAiGroupFilter).map(c=>c.id);
    arr=arr.filter(i=>(i.catIds||[]).some(id=>catIds.includes(id)));
  }
  if(currentAiCatFilter) arr=arr.filter(i=>i.catIds?.includes(currentAiCatFilter));
  $('board-img-cnt')&&($('board-img-cnt').textContent=items.filter(i=>i.type==='image'||i.type==='carousel').length);
  $('board-vid-cnt')&&($('board-vid-cnt').textContent=items.filter(i=>i.type==='video').length);
  $('ai-filter-meta')&&($('ai-filter-meta').textContent=`${arr.length}개 레퍼런스 표시 중`);
  el.innerHTML='';
  if(!arr.length){el.innerHTML='<div class="ai-target-empty">표시할 레퍼런스가 없습니다</div>';return;}
  arr.forEach(it=>{
    const c=document.createElement('div'); c.className='ai-target-card '+(aiSelectedIds.has(it.id)?'selected':'');
    c.onclick=()=>{aiSelectedIds.has(it.id)?aiSelectedIds.delete(it.id):aiSelectedIds.add(it.id); renderAiTargets();};
    const img=document.createElement(it.type==='video'?'video':'img'); if(it.type==='video') img.muted=true;
    bindCardMedia(img,it.type==='carousel'?(it.carousel?.[0]||{}):it);
    c.appendChild(img); c.insertAdjacentHTML('beforeend',`<div class="atc-title">${esc(it.title)}</div>`); el.appendChild(c);
  });
}

function pasteBarNode(){
  const div=document.createElement('div'); div.id='paste-bar'; div.className='paste-bar';
  div.innerHTML=`<div><strong>붙여넣기 / 빠른 추가</strong><span>Ctrl+V로 이미지·URL 추가, 드래그 앤 드롭 또는 클릭 업로드</span></div><div class="paste-actions"><button type="button" id="paste-read-btn">클립보드 읽기</button><button type="button" id="paste-upload-btn">파일 선택</button></div>`;
  div.ondragover=onDragOver; div.ondragleave=onDragLeave; div.ondrop=onDrop;
  div.onclick=(e)=>{ if(e.target.id==='paste-upload-btn') $('file-input')?.click(); };
  setTimeout(()=>{
    $('paste-read-btn')?.addEventListener('click', readClipboardNow);
    $('paste-upload-btn')?.addEventListener('click', ()=>$('file-input')?.click());
  },0);
  return div;
}
function renderBoard(){
  const board=$('board'); if(!board) return;
  const job=++boardRenderJob;
  board.className=currentView+'-view';
  board.innerHTML='';
  const arr=filteredItems();
  $('count-label') && ($('count-label').textContent=`${arr.length}개`);
  renderCounts();
  board.appendChild(pasteBarNode());
  if(items.length===0){ board.appendChild(dropZoneNode()); return; }
  if(arr.length===0){ board.insertAdjacentHTML('beforeend','<div id="empty-state">검색 결과가 없어요<br><span style="font-size:11px;color:var(--t4)">다른 검색어나 필터를 사용해보세요</span></div>'); return; }
  const chunkSize=currentView==='list'?80:40;
  let idx=0;
  function paintChunk(){
    if(job!==boardRenderJob) return;
    const frag=document.createDocumentFragment();
    const end=Math.min(idx+chunkSize, arr.length);
    for(; idx<end; idx++) frag.appendChild(cardNode(arr[idx]));
    board.appendChild(frag);
    if(idx<arr.length) requestAnimationFrame(paintChunk);
  }
  paintChunk();
}
async function readClipboardNow(e){
  e?.stopPropagation?.();
  try{
    if(navigator.clipboard?.read){
      const entries=await navigator.clipboard.read();
      let added=0;
      for(const entry of entries){
        for(const type of entry.types){
          if(type.startsWith('image/')){
            const blob=await entry.getType(type);
            const ext=(type.split('/')[1]||'png').replace('jpeg','jpg');
            const file=new File([blob],`paste_${Date.now()}_${added}.${ext}`,{type});
            items.push(fileToItem(file)); added++;
          }else if(type==='text/plain'){
            const text=await (await entry.getType(type)).text();
            const url=text.trim();
            if(/^https?:\/\//.test(url)){ items.push(normalizeItem({id:uid(),title:url.split('/').pop()||'URL 레퍼런스',src:url,type:guessType(url),ts:Date.now()})); added++; }
          }
        }
      }
      if(added){ await saveData(); renderAll(); showToast(`${added}개 붙여넣기 완료`,'success'); return; }
    }
    const text=await navigator.clipboard.readText();
    if(/^https?:\/\//.test(text.trim())){ await addUrlItem(text.trim()); showToast('URL 붙여넣기 완료','success'); return; }
    showToast('클립보드에서 이미지나 URL을 찾지 못했어요','error');
  }catch(err){ console.error(err); showToast('브라우저 권한상 Ctrl+V를 눌러 붙여넣어주세요','error'); }
}
function handlePaste(cd){
  if(!cd) return;
  let fileAdded=0, urlAdded=0;
  const stringJobs=[];
  for(const item of cd.items||[]){
    if(item.kind==='file'){
      const f=item.getAsFile();
      if(f && (f.type.startsWith('image/') || f.type.startsWith('video/'))){ items.push(fileToItem(f)); fileAdded++; }
    }else if(item.kind==='string' && item.type==='text/plain'){
      stringJobs.push(new Promise(resolve=>item.getAsString(s=>{
        const url=(s||'').trim();
        if(/^https?:\/\//.test(url)){ items.push(normalizeItem({id:uid(),title:url.split('/').pop()||'URL 레퍼런스',src:url,type:guessType(url),ts:Date.now()})); urlAdded++; }
        resolve();
      })));
    }
  }
  Promise.all(stringJobs).then(()=>{
    if(fileAdded||urlAdded){ saveData(); renderAll(); showToast(`${fileAdded+urlAdded}개 붙여넣기 완료`,'success'); }
  });
}
function installReliablePasteListener(){
  if(window.__refboardPasteInstalled) return;
  window.__refboardPasteInstalled=true;
  document.addEventListener('paste',(e)=>{
    const tag=document.activeElement?.tagName?.toLowerCase();
    const editable=document.activeElement?.isContentEditable;
    if(tag==='input'||tag==='textarea'||editable) return;
    e.preventDefault();
    handlePaste(e.clipboardData);
  },true);
}
window.addEventListener('DOMContentLoaded',()=>{ installReliablePasteListener(); renderCategories(); renderBoard(); });

/* =====================================================
   v36 PATCH — paste preview, persistent Google session, strict group/subcategory
   ===================================================== */
const GDRIVE_TOKEN_STORE_KEY='refboard_google_access_token_v36';
const GDRIVE_TOKEN_EXP_KEY='refboard_google_access_token_exp_v36';
const GDRIVE_HAS_AUTH_KEY='refboard_google_has_auth_v36';

function nowMs(){ return Date.now(); }
function cacheDriveToken(token,expiresIn){
  if(!token) return;
  const exp=nowMs()+Math.max(0,Number(expiresIn||3600)-90)*1000;
  gdriveToken=token;
  try{
    sessionStorage.setItem(GDRIVE_TOKEN_STORE_KEY,token);
    sessionStorage.setItem(GDRIVE_TOKEN_EXP_KEY,String(exp));
    localStorage.setItem(GDRIVE_HAS_AUTH_KEY,'1');
  }catch(e){ console.warn(e); }
  updateDriveUi();
}
function restoreCachedDriveToken(){
  try{
    const token=sessionStorage.getItem(GDRIVE_TOKEN_STORE_KEY)||'';
    const exp=Number(sessionStorage.getItem(GDRIVE_TOKEN_EXP_KEY)||0);
    if(token && exp>nowMs()+30000){ gdriveToken=token; updateDriveUi(); return token; }
  }catch(e){ console.warn(e); }
  return '';
}
async function requestDriveToken(promptMode=''){
  const {clientId}=getGapiConfig();
  if(!clientId){ openGdriveSetup(); throw new Error('Google OAuth Client ID가 없습니다.'); }
  if(!window.google?.accounts?.oauth2){ throw new Error('Google Identity Services 스크립트를 불러오지 못했습니다.'); }
  return await new Promise((resolve,reject)=>{
    tokenClient=google.accounts.oauth2.initTokenClient({
      client_id:clientId,
      scope:DRIVE_SCOPE,
      callback:(res)=>{
        if(res.error){ reject(res); return; }
        cacheDriveToken(res.access_token,res.expires_in);
        resolve(res.access_token);
      }
    });
    tokenClient.requestAccessToken({prompt:promptMode});
  });
}
async function ensureDriveToken(forceConsent=false){
  if(!forceConsent){
    if(gdriveToken) return gdriveToken;
    const cached=restoreCachedDriveToken();
    if(cached) return cached;
  }
  const hasAuth=localStorage.getItem(GDRIVE_HAS_AUTH_KEY)==='1';
  try{ return await requestDriveToken(forceConsent?'consent':(hasAuth?'':'consent')); }
  catch(e){
    if(!forceConsent && hasAuth){ return await requestDriveToken('consent'); }
    throw e;
  }
}
async function gdriveSignIn(){
  try{ await ensureDriveToken(true); await ensureDriveFolder(); await ensureAssetFolder(); showToast('Google Drive 연결 완료','success'); }
  catch(e){ console.error(e); showToast(e.message||'Drive 연결 실패','error'); }
}
function updateDriveUi(){
  const connected=!!(gdriveToken||restoreCachedDriveToken());
  const status=$('gdrive-status'); if(status) status.textContent=connected?'Drive 연결됨':'Drive 미연결';
  const banner=$('gdrive-setup-banner'); if(banner) banner.style.display=getGapiConfig().clientId?'none':'inline-block';
  const btn=$('gdrive-connect-btn'); if(btn) btn.textContent=connected?'Google 연결됨':'Google 연결';
}

function fileToItem(file, extra={}){
  const isVideo=(file.type||'').startsWith('video/');
  const previewSrc=URL.createObjectURL(file);
  return {
    id: uid(),
    title: extra.title||file.name||'붙여넣기 이미지',
    type: isVideo?'video':'image',
    src: previewSrc,
    previewSrc,
    driveFileId:'',
    mimeType:file.type||'image/png',
    fileName:file.name||`paste_${Date.now()}.png`,
    catIds:Array.isArray(extra.catIds)?extra.catIds:[],
    platform:extra.platform||'', brand:extra.brand||'', sourceType:extra.sourceType||'paste', sourceUrl:extra.sourceUrl||'',
    caption:extra.caption||'', hook:extra.hook||'', cta:extra.cta||'', visualNotes:extra.visualNotes||'', contentNotes:extra.contentNotes||'', notes:extra.notes||'',
    carousel:Array.isArray(extra.carousel)?extra.carousel:[],
    ts:extra.ts||Date.now(),
    _file:file
  };
}
function bindCardMedia(el,it,placeholder=''){
  if(!it){ if(placeholder) el.src=placeholder; return; }
  if(it.previewSrc){ el.src=it.previewSrc; return; }
  if(it.src && String(it.src).startsWith('blob:')){ el.src=it.src; return; }
  if(it.src && !it.driveFileId){ el.src=it.src; return; }
  if(it.driveFileId){
    if(it.thumbnailLink){ el.src=it.thumbnailLink; return; }
    if((it.mimeType||'').startsWith('image/')){
      if(placeholder) el.src=placeholder;
      getDriveObjectURL(it.driveFileId,it.mimeType).then(u=>{ if(u) el.src=u; }).catch(e=>{ console.error('Drive card image failed',e); if(placeholder) el.src=placeholder; });
      return;
    }
    if((it.mimeType||'').startsWith('video/')){ el.removeAttribute('src'); el.style.background='var(--s3)'; return; }
  }
  if(placeholder) el.src=placeholder;
}
function bindDriveMedia(el,it,placeholder=''){
  if(!it){ if(placeholder) el.src=placeholder; return; }
  if(it.previewSrc){ el.src=it.previewSrc; return; }
  if(it.src && String(it.src).startsWith('blob:')){ el.src=it.src; return; }
  if(it.driveFileId){ getDriveObjectURL(it.driveFileId,it.mimeType).then(u=>{ if(u) el.src=u; }).catch(e=>{ console.error('Drive media load failed',e); if(placeholder) el.src=placeholder; }); }
  else if(it.src) el.src=it.src;
  else if(placeholder) el.src=placeholder;
}
function makePersistableState(){
  const cleanItem=(it)=>{
    const o={...it};
    delete o._file; delete o.previewSrc;
    if(typeof o.src==='string' && o.src.startsWith('blob:')) o.src='';
    if(Array.isArray(o.carousel)) o.carousel=o.carousel.map(sl=>{ const s={...sl}; delete s._file; delete s.previewSrc; if(typeof s.src==='string' && s.src.startsWith('blob:')) s.src=''; return s; });
    return o;
  };
  normalizeCategoryGroups();
  return {groups,categories,items:items.map(cleanItem)};
}
async function saveToDrive(silent=false){
  try{
    await ensureDriveToken(); await ensureDriveFolder();
    await Promise.all(items.map(async it=>{
      if(!it.driveFileId && it._file){
        const f=await uploadBlobToDrive(it._file,it.fileName||it._file.name||`${it.id}`,it.mimeType||it._file.type||'application/octet-stream');
        it.driveFileId=f.id; it.mimeType=f.mimeType||it.mimeType; it.thumbnailLink=f.thumbnailLink||it.thumbnailLink||'';
        delete it._file;
      }
      if(Array.isArray(it.carousel)){
        for(const slide of it.carousel){
          if(!slide.driveFileId && slide._file){
            const f=await uploadBlobToDrive(slide._file,slide.fileName||slide._file.name||`${slide.id}`,slide.mimeType||slide._file.type||'image/png');
            slide.driveFileId=f.id; slide.mimeType=f.mimeType||slide.mimeType; slide.thumbnailLink=f.thumbnailLink||slide.thumbnailLink||'';
            delete slide._file;
          }
        }
      }
    }));
    await uploadDataFile(); saveLocal(); if(!silent) showToast('Drive 저장 완료','success'); renderBoard(); renderDetail();
  }catch(e){ console.error(e); if(!silent) showToast(e.message||'Drive 저장 실패','error'); }
}
async function saveData(){
  updateAutosave('saving');
  saveLocal();
  // 화면 먼저 보여주고 Drive 업로드는 뒤에서 처리합니다.
  if(gdriveToken||restoreCachedDriveToken()) saveToDrive(true);
}

function normalizeCategoryGroups(){
  const groupIds=new Set(groups.map(g=>g.id));
  categories=categories.map(c=>{
    const next={...c};
    let gid=next.groupId || next.parentId || next.group || '';
    if(gid && !groupIds.has(gid)){
      const byName=groups.find(g=>g.name===gid || g.title===gid);
      gid=byName?byName.id:'';
    }
    next.groupId=gid||'';
    delete next.parentId; delete next.group;
    return next;
  });
}
function getCategoryGroupId(c){ return c?.groupId || c?.parentId || c?.group || ''; }
function setCategoryGroupId(c, groupId){ c.groupId=groupId||''; delete c.parentId; delete c.group; }
function groupByCategories(){
  normalizeCategoryGroups();
  const map=new Map(); groups.forEach(g=>map.set(g.id,[]));
  const ungrouped=[];
  categories.forEach(c=>{ const gid=getCategoryGroupId(c); if(gid && map.has(gid)) map.get(gid).push(c); else ungrouped.push(c); });
  return {map,ungrouped};
}
function categoryRowNode(c){
  const row=document.createElement('div'); row.className='cat-row';
  const cnt=items.filter(i=>i.catIds?.includes(c.id)).length;
  row.innerHTML=`<button class="cat-filter-btn ${currentCatFilter===c.id?'active':''}"><span class="dot" style="background:${c.color}"></span><span class="cat-name">${esc(c.name)}</span><span class="cnt">${cnt}</span></button><button class="cat-edit-btn" title="소분류 삭제">×</button>`;
  row.querySelector('.cat-filter-btn').onclick=()=>{ currentCatFilter=c.id; currentFilter='all'; document.querySelectorAll('.sb-btn[data-filter]').forEach(b=>b.classList.remove('active')); document.querySelector('.sb-btn[data-filter="all"]')?.classList.add('active'); renderCategories(); renderBoard(); };
  row.querySelector('.cat-edit-btn').onclick=(e)=>{ e.stopPropagation(); if(confirm('소분류를 삭제할까요?')){ categories=categories.filter(x=>x.id!==c.id); items.forEach(i=>i.catIds=(i.catIds||[]).filter(id=>id!==c.id)); saveData(); renderAll(); } };
  return row;
}
function renderCategories(){
  const list=$('cat-list'); if(!list) return; list.innerHTML='';
  const {map,ungrouped}=groupByCategories();
  groups.forEach(g=>{
    const cats=map.get(g.id)||[];
    const open=!collapsedGroups.has(g.id);
    const block=document.createElement('div'); block.className='group-block';
    const cnt=cats.reduce((sum,c)=>sum+items.filter(i=>i.catIds?.includes(c.id)).length,0);
    block.innerHTML=`<div class="group-header" data-gid="${g.id}"><span class="group-toggle ${open?'open':''}">▶</span><span class="group-title-line" style="background:${g.color||'var(--accent)'}"></span><span class="group-name" style="color:${g.color||'var(--t1)'}">${esc(g.name)}</span><span class="group-cnt">${cnt}</span><button class="group-edit-btn" title="대분류 삭제">×</button></div>`;
    const children=document.createElement('div'); children.className='group-children'+(open?'':' collapsed');
    if(cats.length) cats.forEach(c=>children.appendChild(categoryRowNode(c))); else children.innerHTML='<div style="font-size:11px;color:var(--t4);padding:6px 10px;">소분류 없음</div>';
    block.appendChild(children);
    block.querySelector('.group-header').onclick=(e)=>{ if(e.target.classList.contains('group-edit-btn')) return; collapsedGroups.has(g.id)?collapsedGroups.delete(g.id):collapsedGroups.add(g.id); persistCollapsedGroups(); renderCategories(); };
    block.querySelector('.group-edit-btn').onclick=(e)=>{ e.stopPropagation(); if(confirm('대분류를 삭제할까요? 소분류는 그룹 없음으로 이동합니다.')){ groups=groups.filter(x=>x.id!==g.id); categories.forEach(c=>{ if(getCategoryGroupId(c)===g.id) setCategoryGroupId(c,''); }); saveData(); renderAll(); } };
    list.appendChild(block);
  });
  if(ungrouped.length){ const sec=document.createElement('div'); sec.className='ungrouped-section'; sec.innerHTML='<div class="sb-section" style="padding-top:8px;">그룹 없음</div>'; ungrouped.forEach(c=>sec.appendChild(categoryRowNode(c))); list.appendChild(sec); }
  renderNewCatGroupOptions(); renderModalCats(); renderDetailCatOptions(); renderAiFilters();
}
function renderNewCatGroupOptions(){
  const sel=$('new-cat-group'); if(!sel) return;
  const cur=sel.value||'';
  sel.innerHTML='<option value="">그룹 없음</option>'+groups.map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join('');
  if([...sel.options].some(o=>o.value===cur)) sel.value=cur;
}
function showNewCatForm(){ $('new-cat-form').style.display='block'; renderNewCatGroupOptions(); renderColorSwatches('new-cat-colors'); }
function saveNewCat(){
  const name=$('new-cat-name').value.trim(); if(!name)return;
  const groupId=$('new-cat-group')?.value||'';
  categories.push({id:uid('c'),name,color:CAT_COLORS[categories.length%CAT_COLORS.length],groupId});
  $('new-cat-name').value=''; if($('new-cat-group')) $('new-cat-group').value='';
  hideNewCatForm(); normalizeCategoryGroups(); saveData(); renderAll();
}
function saveNewGroup(){
  const name=$('new-group-name').value.trim(); if(!name)return;
  const g={id:uid('g'),name,color:CAT_COLORS[groups.length%CAT_COLORS.length]};
  groups.push(g); collapsedGroups.delete(g.id); persistCollapsedGroups();
  $('new-group-name').value=''; hideNewGroupForm(); saveData(); renderAll();
}

async function addPastedFiles(files){
  const arr=[...files].filter(f=>/^image\//.test(f.type||'') || /^video\//.test(f.type||''));
  if(!arr.length) return 0;
  arr.forEach((f,i)=>{
    const safeName=f.name&&f.name!=='image.png'?f.name:`paste_${Date.now()}_${i}.${((f.type||'image/png').split('/')[1]||'png').replace('jpeg','jpg')}`;
    const file=f.name?f:new File([f],safeName,{type:f.type||'image/png'});
    items.unshift(fileToItem(file,{title:safeName,sourceType:'paste'}));
  });
  saveLocal(); renderAll();
  saveData();
  return arr.length;
}
function handlePaste(cd){
  if(!cd) return;
  let added=0;
  const files=[...(cd.files||[])].filter(f=>/^image\//.test(f.type||'') || /^video\//.test(f.type||''));
  if(files.length){ addPastedFiles(files).then(n=>{ if(n) showToast(`${n}개 붙여넣기 완료`,'success'); }); return; }
  const stringJobs=[];
  for(const item of cd.items||[]){
    if(item.kind==='file'){
      const f=item.getAsFile();
      if(f && (/^image\//.test(f.type||'') || /^video\//.test(f.type||''))){ items.unshift(fileToItem(f,{sourceType:'paste'})); added++; }
    }else if(item.kind==='string' && item.type==='text/plain'){
      stringJobs.push(new Promise(resolve=>item.getAsString(s=>{ const url=(s||'').trim(); if(/^https?:\/\//.test(url)){ items.unshift(normalizeItem({id:uid(),title:url.split('/').pop()||'URL 레퍼런스',src:url,type:guessType(url),sourceType:'paste_url',ts:Date.now()})); added++; } resolve(); })));
    }
  }
  Promise.all(stringJobs).then(()=>{ if(added){ saveLocal(); renderAll(); saveData(); showToast(`${added}개 붙여넣기 완료`,'success'); } });
}
async function readClipboardNow(e){
  e?.stopPropagation?.();
  try{
    if(navigator.clipboard?.read){
      const entries=await navigator.clipboard.read();
      let added=0;
      for(const entry of entries){
        for(const type of entry.types){
          if(type.startsWith('image/')){
            const blob=await entry.getType(type);
            const ext=(type.split('/')[1]||'png').replace('jpeg','jpg');
            const file=new File([blob],`paste_${Date.now()}_${added}.${ext}`,{type});
            items.unshift(fileToItem(file,{sourceType:'paste'})); added++;
          }else if(type==='text/plain'){
            const text=await (await entry.getType(type)).text(); const url=text.trim();
            if(/^https?:\/\//.test(url)){ items.unshift(normalizeItem({id:uid(),title:url.split('/').pop()||'URL 레퍼런스',src:url,type:guessType(url),sourceType:'paste_url',ts:Date.now()})); added++; }
          }
        }
      }
      if(added){ saveLocal(); renderAll(); saveData(); showToast(`${added}개 붙여넣기 완료`,'success'); return; }
    }
    const text=await navigator.clipboard.readText();
    if(/^https?:\/\//.test(text.trim())){ await addUrlItem(text.trim()); showToast('URL 붙여넣기 완료','success'); return; }
    showToast('클립보드에서 이미지나 URL을 찾지 못했어요','error');
  }catch(err){ console.error(err); showToast('브라우저 권한상 Ctrl+V를 눌러 붙여넣어주세요','error'); }
}
function installReliablePasteListener(){
  if(window.__refboardPasteInstalled) return;
  window.__refboardPasteInstalled=true;
  document.addEventListener('paste',(e)=>{
    const tag=document.activeElement?.tagName?.toLowerCase();
    const editable=document.activeElement?.isContentEditable;
    if(tag==='input'||tag==='textarea'||editable) return;
    e.preventDefault(); handlePaste(e.clipboardData);
  },true);
}

window.addEventListener('DOMContentLoaded',()=>{
  restoreCachedDriveToken();
  normalizeCategoryGroups();
  installReliablePasteListener();
  renderCategories(); renderBoard(); updateDriveUi();
});
