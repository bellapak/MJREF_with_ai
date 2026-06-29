// =====================================================
// refboard - app.js (Data Loss Fixed & Performance Optimized & Link UI Updated)
// =====================================================

const CAT_COLORS=['#ff6b35','#ff3b8b','#7b5cfa','#3b9eff','#3bfa8a','#ffd23b','#ff5555','#00d4d4','#ffaa3b','#c8f060'];
const PROVIDER_HINTS={anthropic:'발급: console.anthropic.com/settings/keys',openai:'발급: platform.openai.com/api-keys',google:'발급: aistudio.google.com/app/apikey'};
const DRIVE_SCOPE='https://www.googleapis.com/auth/drive';
const DRIVE_ROOT_FOLDER_NAME='refboard-assets';
const DRIVE_ASSET_FOLDER_NAME='assets';
const DRIVE_DATA_FILE_NAME='refboard-data.json';
const LS_KEY='refboard_v31_state';
const GDRIVE_CLIENT_ID_KEY='refboard_google_client_id';
const GDRIVE_TOKEN_STORE_KEY='refboard_google_access_token_v36';
const GDRIVE_TOKEN_EXP_KEY='refboard_google_access_token_exp_v36';
const GDRIVE_HAS_AUTH_KEY='refboard_google_has_auth_v36';
const DELETED_DRIVE_IDS_KEY='refboard_deleted_drive_ids_v34';

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
let objectBlobCache=new Map();
let objectUrlPromiseCache=new Map();
let thumbUrlPromiseCache=new Map();
let driveBlobPromiseCache=new Map();
let localBlobDbPromise=null;
let driveFetchActive=0;
let driveFetchQueue=[];
const DRIVE_FETCH_CONCURRENCY=16;
const CARD_THUMB_SIZE=220;
const PRIORITY_CARD_COUNT=40;
const DRIVE_THUMB_CACHE_PREFIX='drive-thumb:';
const LOCAL_MEDIA_DB_NAME='refboard-local-media-v1';
const LOCAL_MEDIA_STORE_NAME='media';
let state={items:[]};
const collapsedGroups = new Set(JSON.parse(localStorage.getItem('refboard_collapsed_groups')||'[]'));

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
    previewSrc: raw.previewSrc || '',
    driveFileId: raw.driveFileId || raw.fileId || '',
    mimeType: raw.mimeType || raw.fileType || '',
    thumbnailLink: raw.thumbnailLink || raw.thumbnail || '',
    fileName: raw.fileName || raw.filename || raw.name || '',
    localBlobKey: raw.localBlobKey || '',
    catIds: Array.isArray(raw.catIds)?raw.catIds:[],
    platform: raw.platform || '', brand: raw.brand || '', sourceType: raw.sourceType || raw.source_type || '', sourceUrl: raw.sourceUrl || raw.source_url || '',
    caption: raw.caption || raw.description || raw.text || '', hook: raw.hook || raw.headline || '', cta: raw.cta || '',
    visualNotes: raw.visualNotes || raw.visual_notes || '', contentNotes: raw.contentNotes || raw.content_notes || '', notes: raw.notes || '',
    carousel: Array.isArray(raw.carousel)?raw.carousel:[],
    ts: raw.ts || raw.createdAt || Date.now(),
    _file: raw._file
  };
}

function updateAutosave(mode){ const el=$('autosave-indicator'); if(el){el.style.color=mode==='saving'?'var(--orange)':'var(--green)'; el.title=mode==='saving'?'저장 중':'저장됨';}}
function loadLocal(){
  try{
    const raw=JSON.parse(localStorage.getItem(LS_KEY)||'{}');
    groups=Array.isArray(raw.groups)?raw.groups:[];
    categories=Array.isArray(raw.categories)?raw.categories:[];
    items=Array.isArray(raw.items)?raw.items.map(normalizeItem):[];
    state={groups,categories,items};
  }catch(e){ console.warn(e); }
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

function saveLocal(){ 
  localStorage.setItem(LS_KEY, JSON.stringify(makePersistableState())); 
  updateAutosave('saved'); 
}

async function saveData(){
  updateAutosave('saving');
  const localCachePromise=cachePendingLocalFiles().catch(console.warn);
  saveLocal();
  await localCachePromise;
  if(gdriveToken||restoreCachedDriveToken()) saveToDrive(true);
}

// ─── Google Drive Auth ───
function nowMs(){ return Date.now(); }
function getGapiConfig(){ return {clientId:localStorage.getItem(GDRIVE_CLIENT_ID_KEY)||''}; }

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
    if(token && exp>nowMs()+30000){ gdriveToken=token; return token; }
  }catch(e){ console.warn(e); }
  return '';
}

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

function saveGdriveSetup(){ 
  const v=$('gdrive-client-id-input').value.trim(); 
  if(!v){showToast('Client ID를 입력해주세요','error');return;} 
  localStorage.setItem(GDRIVE_CLIENT_ID_KEY,v); 
  closeModal('gdrive-setup-modal'); 
  updateDriveUi(); 
  showToast('Drive 설정 저장 완료','success'); 
}

function updateDriveUi(){
  const connected=!!gdriveToken;
  const status=$('gdrive-status'); if(status) status.textContent=connected?'Drive 연결됨':'Drive 미연결';
  const banner=$('gdrive-setup-banner'); if(banner) banner.style.display=getGapiConfig().clientId?'none':'inline-block';
  const btn=$('gdrive-connect-btn'); if(btn) btn.textContent=connected?'Google 연결됨':'Google 연결';
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
        if(res.error){ reject(new Error(res.error)); return; }
        cacheDriveToken(res.access_token,res.expires_in);
        resolve(res.access_token);
      },
      error_callback: (err) => { reject(new Error(err.type || 'Popup Closed or Blocked')); }
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
  try{ 
    return await requestDriveToken(forceConsent?'consent':(hasAuth?'':'consent')); 
  } catch(e){
    if(!forceConsent && hasAuth){ return await requestDriveToken('consent'); }
    throw e;
  }
}

async function gdriveSignIn(){
  try{ 
    await ensureDriveToken(true); 
    await ensureDriveFolder(); 
    await ensureAssetFolder(); 
    showToast('Google Drive 연결 완료','success'); 
  } catch(e){ 
    console.error(e); 
    showToast('Drive 연결 실패: 팝업 차단 해제 또는 API 설정을 확인하세요.','error'); 
  }
}

// ─── Drive API & Storage ───
async function driveFetch(url, opts={}, retryCount=0){ 
  const token=await ensureDriveToken(); 
  const res=await fetch(url,{...opts,headers:{Authorization:`Bearer ${token}`,...(opts.headers||{})}}); 
  
  if(!res.ok){ 
    if(res.status === 401 && retryCount === 0){
      console.warn('Drive Token expired (401). Retrying auth...');
      gdriveToken = null;
      sessionStorage.removeItem(GDRIVE_TOKEN_STORE_KEY);
      sessionStorage.removeItem(GDRIVE_TOKEN_EXP_KEY);
      localStorage.removeItem(GDRIVE_HAS_AUTH_KEY);
      updateDriveUi();
      return driveFetch(url, opts, 1);
    }
    const txt=await res.text().catch(()=>''); 
    throw new Error(`Drive 요청 실패 ${res.status}: ${txt}`); 
  } 
  return res; 
}

async function findDriveFile(name,mimeType,parentId){
  const q=[`name='${name.replace(/'/g,"\\'")}'`,`trashed=false`]; 
  if(mimeType) q.push(`mimeType='${mimeType}'`); 
  if(parentId) q.push(`'${parentId}' in parents`);
  const url='https://www.googleapis.com/drive/v3/files?spaces=drive&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,mimeType,parents)&q='+encodeURIComponent(q.join(' and '));
  const json=await (await driveFetch(url)).json(); 
  return json.files?.[0]||null;
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
  for(const folder of folders){ all=all.concat(await listDriveFilesRecursive(folder.id)); }
  return all;
}

function isDriveMediaFile(f){ return /^image\//.test(f.mimeType||'') || /^video\//.test(f.mimeType||''); }
function cleanFileBase(name=''){ return String(name).replace(/\.[^.]+$/,'').trim().toLowerCase(); }

function fileToDriveItem(f){
  return normalizeItem({id:'d'+f.id,title:f.name,type:(f.mimeType||'').startsWith('video/')?'video':'image',driveFileId:f.id,mimeType:f.mimeType,fileName:f.name,thumbnailLink:f.thumbnailLink||'',ts:f.modifiedTime?Date.parse(f.modifiedTime):Date.now(),sourceType:'drive_assets'});
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
  const json=await (await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,thumbnailLink',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body})).json();
  return json;
}

async function uploadDataFile(){
  const folderId=await ensureDriveFolder();
  const safeState=makePersistableState();
  const blob=new Blob([JSON.stringify(safeState,null,2)],{type:'application/json'});
  if(gdriveDataFileId){
    await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${gdriveDataFileId}?uploadType=media`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:blob});
  }else{
    const f=await uploadBlobToDrive(blob,DRIVE_DATA_FILE_NAME,'application/json',folderId); gdriveDataFileId=f.id;
  }
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
    await uploadDataFile(); 
    saveLocal(); 
    if(!silent) showToast('Drive 저장 완료','success'); 
    
    const df = $('detail-fields');
    if(df && selectedId) {
       const currIt = items.find(i=>i.id===selectedId);
       if(currIt && currIt.driveFileId) {
          const els = df.querySelectorAll('.detail-val');
          if(els.length > 0 && els[els.length-1].previousSibling.textContent === 'DRIVE FILE ID') {
              els[els.length-1].textContent = currIt.driveFileId;
          }
       }
    }
  }catch(e){ console.error(e); if(!silent) showToast(e.message||'Drive 저장 실패','error'); }
}

async function syncItemsWithDriveAssets(){
  const assetFolderId=await ensureAssetFolder();
  const deleted=getDeletedDriveIds();
  const files=(await listDriveFilesRecursive(assetFolderId)).filter(f=>isDriveMediaFile(f) && !deleted.has(f.id));
  const byId=new Map(files.map(f=>[f.id,f]));
  const byName=new Map(files.map(f=>[cleanFileBase(f.name),f]));
  let linked=0, added=0;

  for(const it of items){
    if(it.driveFileId && deleted.has(it.driveFileId)) continue;
    if(it.driveFileId && byId.has(it.driveFileId)){
      const f=byId.get(it.driveFileId);
      it.mimeType=it.mimeType||f.mimeType; it.fileName=it.fileName||f.name; it.thumbnailLink=it.thumbnailLink||f.thumbnailLink||'';
    }else{
      const candidates=[it.fileName,it.title,(it.src||'').split('/').pop(),it.sourceUrl?.split('/').pop()].filter(Boolean).map(cleanFileBase);
      const hit=candidates.map(k=>byName.get(k)).find(Boolean);
      if(hit){
        it.driveFileId=hit.id; it.mimeType=it.mimeType||hit.mimeType; it.fileName=it.fileName||hit.name; it.thumbnailLink=it.thumbnailLink||hit.thumbnailLink||'';
        if(!it.type || it.type==='link') it.type=hit.mimeType.startsWith('video/')?'video':'image';
        linked++;
      }
    }
    if(Array.isArray(it.carousel)){
      for(const slide of it.carousel){
        if(slide.driveFileId && deleted.has(slide.driveFileId)) continue;
        if(slide.driveFileId && byId.has(slide.driveFileId)){
          const f=byId.get(slide.driveFileId);
          slide.mimeType=slide.mimeType||f.mimeType; slide.fileName=slide.fileName||f.name; slide.thumbnailLink=slide.thumbnailLink||f.thumbnailLink||'';
          continue;
        }
        const sc=[slide.fileName,slide.title,(slide.src||'').split('/').pop()].filter(Boolean).map(cleanFileBase);
        const sh=sc.map(k=>byName.get(k)).find(Boolean);
        if(sh){
          slide.driveFileId=sh.id; slide.mimeType=slide.mimeType||sh.mimeType; slide.fileName=slide.fileName||sh.name; slide.thumbnailLink=slide.thumbnailLink||sh.thumbnailLink||'';
          linked++;
        }
      }
    }
  }

  const existing=new Set();
  items.forEach(it=>{
    if(it.driveFileId) existing.add(it.driveFileId);
    if(Array.isArray(it.carousel)) it.carousel.forEach(s=>{ if(s.driveFileId) existing.add(s.driveFileId); });
  });
  files.forEach(f=>{
    if(!existing.has(f.id)){ items.push(fileToDriveItem(f)); existing.add(f.id); added++; }
  });
  buildCarouselGroupsFromLooseAssets();
  removeItemsThatAreCarouselSlides();
  return {linked,added,total:files.length};
}

async function loadFromDrive(){
  try{
    await ensureDriveToken(); await ensureDriveFolder(); await ensureAssetFolder();
    const f=await findDriveFile(DRIVE_DATA_FILE_NAME,'application/json',gdriveFolderId);
    const deleted=getDeletedDriveIds();
    if(f){
      gdriveDataFileId=f.id;
      const data=await (await driveFetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`)).json();
      groups=Array.isArray(data.groups)?data.groups:[];
      categories=Array.isArray(data.categories)?data.categories:[];
      items=Array.isArray(data.items)?data.items.map(normalizeItem):[];
    }else{ groups=[]; categories=[]; items=[]; }
    items=items.filter(it=>!collectDriveIdsFromItem(it).some(id=>deleted.has(id)));
    const sync=await syncItemsWithDriveAssets();
    normalizeCategoryGroups();
    saveLocal();
    renderAll();
    showToast(`Drive 불러오기 완료 · 에셋 ${sync.total}개 / 연결 ${sync.linked}개 / 추가 ${sync.added}개`,'success');
  }catch(e){ console.error(e); showToast((e.message||'Drive 불러오기 실패')+' · Google 연결을 다시 눌러 권한을 재승인해주세요','error'); }
}

// ─── Image Lazy Loading & Drive API Fetcher ───
function runDriveFetchQueue(){
  while(driveFetchActive<DRIVE_FETCH_CONCURRENCY && driveFetchQueue.length){
    const job=driveFetchQueue.shift();
    driveFetchActive++;
    job.task()
      .then(job.resolve)
      .catch(job.reject)
      .finally(()=>{ driveFetchActive--; runDriveFetchQueue(); });
  }
}

function enqueueDriveJob(task, priority=false){
  return new Promise((resolve,reject)=>{
    const job={task,resolve,reject};
    if(priority) driveFetchQueue.unshift(job);
    else driveFetchQueue.push(job);
    runDriveFetchQueue();
  });
}

async function fetchDriveMediaBlobRaw(fileId,mimeType=''){
  const res=await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`);
  const blob=await res.blob();
  return blob.type ? blob : new Blob([blob],{type:mimeType||'application/octet-stream'});
}

async function getDriveBlob(fileId,mimeType='',priority=false){
  if(!fileId) return null;
  if(objectBlobCache.has(fileId)) return objectBlobCache.get(fileId);
  if(driveBlobPromiseCache.has(fileId)) return driveBlobPromiseCache.get(fileId);
  const promise=enqueueDriveJob(async()=>{
    const blob=await fetchDriveMediaBlobRaw(fileId,mimeType);
    objectBlobCache.set(fileId,blob);
    return blob;
  }, priority).finally(()=>driveBlobPromiseCache.delete(fileId));
  driveBlobPromiseCache.set(fileId,promise);
  return promise;
}

async function getDriveObjectURL(fileId,mimeType='',priority=false){
  if(!fileId) return '';
  const cacheKey='drive:'+fileId;
  if(objectUrlCache.has(cacheKey)) return objectUrlCache.get(cacheKey);
  if(objectUrlPromiseCache.has(cacheKey)) return objectUrlPromiseCache.get(cacheKey);
  const promise=getDriveBlob(fileId,mimeType,priority).then(blob=>{
    if(!blob) return '';
    const url=URL.createObjectURL(blob);
    objectUrlCache.set(cacheKey,url);
    return url;
  }).finally(()=>objectUrlPromiseCache.delete(cacheKey));
  objectUrlPromiseCache.set(cacheKey,promise);
  return promise;
}


function optimizeDriveThumbnailLink(thumbnailLink='', size=CARD_THUMB_SIZE){
  if(!thumbnailLink) return '';
  let url=String(thumbnailLink);
  // Google Drive thumbnailLink often ends with =s220. Force a small card-sized image.
  if(/[?&]sz=/.test(url)) return url.replace(/([?&]sz=)w?\d+/,'$1w'+size);
  if(/=s\d+(-c)?(?:$|&)/.test(url)) return url.replace(/=s\d+(-c)?/, '=s'+size);
  if(/=w\d+/.test(url)) return url.replace(/=w\d+/, '=w'+size);
  return url + (url.includes('=') ? '' : '=s'+size);
}

function setMediaLoaded(el){
  if(!el) return;
  el.classList.remove('media-loading');
  el.classList.add('media-ready');
}

function setMediaLoadError(el){
  if(!el) return;
  el.classList.remove('media-loading');
  el.classList.add('media-error');
}

function tuneCardImageElement(img, priority=false){
  if(!img) return;
  img.loading = priority ? 'eager' : 'lazy';
  img.decoding = 'async';
  img.fetchPriority = priority ? 'high' : 'low';
  img.width = CARD_THUMB_SIZE;
  img.height = CARD_THUMB_SIZE;
  img.sizes = '(max-width: 720px) 42vw, 150px';
  img.onload = () => setMediaLoaded(img);
  img.onerror = () => setMediaLoadError(img);
}

async function getPersistedDriveThumbURL(fileId){
  if(!fileId) return '';
  return await getLocalBlobObjectURL(DRIVE_THUMB_CACHE_PREFIX + fileId);
}

async function getDriveThumbnailObjectURL(fileId,mimeType='',thumbnailLink='',priority=false){
  if(!fileId) return '';
  const cacheKey='thumb:'+fileId+':s'+CARD_THUMB_SIZE;
  if(objectUrlCache.has(cacheKey)) return objectUrlCache.get(cacheKey);
  if(thumbUrlPromiseCache.has(cacheKey)) return thumbUrlPromiseCache.get(cacheKey);

  const promise=(async()=>{
    // 1) 이전 세션에서 저장된 작은 썸네일부터 확인 → 재접속 시 즉시 표시
    const persisted=await getPersistedDriveThumbURL(fileId);
    if(persisted){
      objectUrlCache.set(cacheKey,persisted);
      return persisted;
    }

    // 2) Drive thumbnailLink를 카드 크기에 맞게 축소해서 요청
    return enqueueDriveJob(async()=>{
      const smallThumb=optimizeDriveThumbnailLink(thumbnailLink, CARD_THUMB_SIZE);
      if(smallThumb){
        try{
          const token=await ensureDriveToken();
          const res=await fetch(smallThumb,{headers:{Authorization:`Bearer ${token}`}});
          if(res.ok){
            const blob=await res.blob();
            if(blob && blob.size){
              const url=URL.createObjectURL(blob);
              objectUrlCache.set(cacheKey,url);
              // 다음에 켰을 때 바로 보이도록 작은 썸네일만 IndexedDB에 저장
              saveLocalBlob(DRIVE_THUMB_CACHE_PREFIX + fileId, blob, {fileId, mimeType, thumbSize:CARD_THUMB_SIZE}).catch(()=>{});
              return url;
            }
          }
        }catch(e){
          console.warn('Drive thumbnail fallback to media:', e);
        }
      }

      // 3) 썸네일이 없는 예외 케이스만 원본으로 fallback
      const blob=await fetchDriveMediaBlobRaw(fileId,mimeType);
      objectBlobCache.set(fileId,blob);
      const url=URL.createObjectURL(blob);
      objectUrlCache.set(cacheKey,url);
      objectUrlCache.set('drive:'+fileId,url);
      return url;
    }, priority);
  })().finally(()=>thumbUrlPromiseCache.delete(cacheKey));

  thumbUrlPromiseCache.set(cacheKey,promise);
  return promise;
}

function loadDriveImageElement(img, priority=false){
  const fileId = img?.dataset?.driveId;
  if(!fileId) return Promise.resolve('');
  img.classList.add('media-loading');
  return getDriveThumbnailObjectURL(fileId, img.dataset.mimeType || '', img.dataset.driveThumb || '', priority)
    .then(url => {
      if(url && img.src !== url) img.src = url;
      return url;
    })
    .catch(err => {
      console.warn('Drive image load failed:', err);
      setMediaLoadError(img);
      return '';
    })
    .finally(()=>img.classList.remove('media-loading'));
}

function openLocalBlobDb(){
  if(!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB를 사용할 수 없습니다.'));
  if(localBlobDbPromise) return localBlobDbPromise;
  localBlobDbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(LOCAL_MEDIA_DB_NAME,1);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(LOCAL_MEDIA_STORE_NAME)) db.createObjectStore(LOCAL_MEDIA_STORE_NAME,{keyPath:'key'});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
  return localBlobDbPromise;
}

async function saveLocalBlob(key,blob,meta={}){
  if(!key||!blob) return;
  try{
    const db=await openLocalBlobDb();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(LOCAL_MEDIA_STORE_NAME,'readwrite');
      tx.objectStore(LOCAL_MEDIA_STORE_NAME).put({key,blob,meta,ts:Date.now()});
      tx.oncomplete=resolve;
      tx.onerror=()=>reject(tx.error);
    });
  }catch(e){ console.warn('로컬 미디어 캐시 저장 실패:', e); }
}

async function getLocalBlob(key){
  if(!key) return null;
  try{
    const db=await openLocalBlobDb();
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(LOCAL_MEDIA_STORE_NAME,'readonly');
      const req=tx.objectStore(LOCAL_MEDIA_STORE_NAME).get(key);
      req.onsuccess=()=>resolve(req.result?.blob||null);
      req.onerror=()=>reject(req.error);
    });
  }catch(e){ console.warn('로컬 미디어 캐시 읽기 실패:', e); return null; }
}

async function getLocalBlobObjectURL(key){
  const cacheKey='local:'+key;
  if(objectUrlCache.has(cacheKey)) return objectUrlCache.get(cacheKey);
  const blob=await getLocalBlob(key);
  if(!blob) return '';
  const url=URL.createObjectURL(blob);
  objectUrlCache.set(cacheKey,url);
  return url;
}

function cachePendingLocalFiles(){
  const jobs=[];
  const collect=(media)=>{
    if(media?._file && media.localBlobKey) jobs.push(saveLocalBlob(media.localBlobKey,media._file,{fileName:media.fileName||media.title||'',mimeType:media.mimeType||media._file.type||''}));
  };
  items.forEach(it=>{
    collect(it);
    if(Array.isArray(it.carousel)) it.carousel.forEach(collect);
  });
  return Promise.allSettled(jobs);
}

const driveImageObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach(entry => {
    if(entry.isIntersecting){
      const img = entry.target;
      if(img?.dataset?.driveId){
        observer.unobserve(img);
        loadDriveImageElement(img, false);
      }
    }
  });
}, { rootMargin: '600px', threshold: 0.01 });

// 외부 URL 이미지용 lazy observer — src 세팅 자체를 뷰포트 진입 시점까지 지연
const srcLazyObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach(entry => {
    if(entry.isIntersecting){
      const img = entry.target;
      const lazySrc = img.dataset.lazySrc;
      const lazyFallbackId = img.dataset.lazyFallbackId;
      const lazyFallbackMime = img.dataset.lazyFallbackMime;
      const lazyFallbackThumb = img.dataset.lazyFallbackThumb || '';
      if(lazySrc){
        observer.unobserve(img);
        img.classList.add('media-loading');
        img.onerror = lazyFallbackId ? () => {
          img.onerror = null;
          img.dataset.driveId = lazyFallbackId;
          img.dataset.mimeType = lazyFallbackMime || '';
          img.dataset.driveThumb = lazyFallbackThumb;
          loadDriveImageElement(img, false);
        } : () => setMediaLoadError(img);
        img.onload = () => setMediaLoaded(img);
        img.src = lazySrc;
      }
    }
  });
}, { rootMargin: '600px', threshold: 0.01 });

// ─── Delete & Sync Logic ───
function getDeletedDriveIds(){ try{return new Set(JSON.parse(localStorage.getItem(DELETED_DRIVE_IDS_KEY)||'[]'));} catch(e){return new Set();} }
function persistDeletedDriveIds(set){localStorage.setItem(DELETED_DRIVE_IDS_KEY,JSON.stringify([...set]));}
function rememberDeletedDriveIds(ids=[]){ const set=getDeletedDriveIds(); ids.filter(Boolean).forEach(id=>set.add(id)); persistDeletedDriveIds(set); }
function collectDriveIdsFromItem(it){
  const ids=[];
  if(it?.driveFileId) ids.push(it.driveFileId);
  if(Array.isArray(it?.carousel)) it.carousel.forEach(s=>{if(s?.driveFileId) ids.push(s.driveFileId);});
  return [...new Set(ids)];
}
async function deleteDriveFile(fileId){
  if(!fileId) return;
  try{ await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,{method:'DELETE'}); }
  catch(e){ console.warn('Drive delete skipped/failed:', fileId, e); }
}
function removeItemsThatAreCarouselSlides(){
  const slideIds=new Set(); const slideNames=new Set();
  items.forEach(it=>{
    if(it.type==='carousel' && Array.isArray(it.carousel)){
      it.carousel.forEach(s=>{ if(s.driveFileId) slideIds.add(s.driveFileId); if(s.fileName) slideNames.add(cleanFileBase(s.fileName)); if(s.title) slideNames.add(cleanFileBase(s.title)); });
    }
  });
  items=items.filter(it=>{
    if(it.type==='carousel') return true;
    if(it.driveFileId && slideIds.has(it.driveFileId)) return false;
    const n=cleanFileBase(it.fileName||it.title||'');
    if(n && slideNames.has(n)) return false;
    return true;
  });
}

// 💡 데이터 누락 해결: 첫 번째 슬라이드의 텍스트 정보를 마스터 카드에 상속합니다.
function buildCarouselGroupsFromLooseAssets(){
  const candidates=items.filter(it=>it.sourceType==='drive_assets' && it.type!=='carousel' && /^image\//.test(it.mimeType||''));
  const groupsByPrefix=new Map();
  for(const it of candidates){
    const name=(it.fileName||it.title||'').trim();
    const base=name.replace(/\.[^.]+$/,'');
    const m=base.match(/^(.*?)(?:[_\-\s]?)(\d{1,3})$/);
    if(!m) continue;
    const prefix=m[1].replace(/[_\-\s]+$/,'').toLowerCase();
    if(!prefix || !/carousel|캐러셀|slide|슬라이드/.test(prefix)) continue;
    if(!groupsByPrefix.has(prefix)) groupsByPrefix.set(prefix,[]);
    groupsByPrefix.get(prefix).push({...it,_sortNo:Number(m[2])});
  }
  for(const [prefix,arr] of groupsByPrefix.entries()){
    if(arr.length<2) continue;
    arr.sort((a,b)=>(a._sortNo||0)-(b._sortNo||0));
    const exists=items.some(it=>it.type==='carousel' && Array.isArray(it.carousel) && arr.some(a=>it.carousel.some(s=>s.driveFileId===a.driveFileId)));
    if(exists) continue;

    // 데이터 복원을 위해 첫 번째 이미지를 기준으로 삼습니다.
    const first = arr[0];

    const slides=arr.map(a=>({ 
      id:uid('s'), title:a.title, type:'image', src:a.src||'', previewSrc:a.previewSrc||'', 
      driveFileId:a.driveFileId||'', mimeType:a.mimeType||'', thumbnailLink:a.thumbnailLink||'', 
      fileName:a.fileName||a.title||'',
      caption:a.caption||'', hook:a.hook||'', brand:a.brand||'', cta:a.cta||'',
      visualNotes:a.visualNotes||'', contentNotes:a.contentNotes||'', notes:a.notes||'' 
    }));
    
    items.push(normalizeItem({ 
      id:uid('car'), 
      title:`${first.fileName?.replace(/[_\-\s]?\d{1,3}\.[^.]+$/,'')||'캐러셀'} 외 ${arr.length-1}개`, 
      type:'carousel', 
      carousel:slides, 
      sourceType:'drive_assets_carousel', 
      ts:Math.max(...arr.map(a=>a.ts||Date.now())),
      // 💡 여기서 기존의 카테고리, 캡션, 메모 데이터를 모두 살려냅니다.
      catIds: first.catIds||[],
      brand: first.brand||'',
      caption: first.caption||'',
      hook: first.hook||'',
      cta: first.cta||'',
      visualNotes: first.visualNotes||'',
      contentNotes: first.contentNotes||'',
      notes: first.notes||''
    }));
  }
  removeItemsThatAreCarouselSlides();
}

async function deleteItem(id){
  const it=items.find(i=>i.id===id);
  if(!it) return;
  const ids=collectDriveIdsFromItem(it);
  const msg=ids.length?`삭제할까요?\nDrive 파일 ${ids.length}개도 함께 삭제됩니다.`:'삭제할까요?';
  if(!confirm(msg)) return;
  rememberDeletedDriveIds(ids);
  items=items.filter(i=>i.id!==id);
  if(selectedId===id) closeDetail();
  saveLocal(); renderAll();
  if(gdriveToken||restoreCachedDriveToken()){
    await ensureDriveToken().catch(()=>null);
    await Promise.all(ids.map(deleteDriveFile));
    await uploadDataFile().catch(console.warn);
  }
  showToast('삭제 완료','success');
}

// ─── Media Binding (Lazy Loaded) ───
function bindRemoteCardMedia(el,it,placeholder='',priority=false){
  if(it.src && !it.driveFileId){
    if(priority){
      el.classList.add('media-loading');
      el.onerror = () => setMediaLoadError(el);
      el.onload = () => setMediaLoaded(el);
      el.src = it.src;
    }else{
      el.dataset.lazySrc = it.src;
      srcLazyObserver.observe(el);
    }
    return;
  }

  if(it.driveFileId){
    if((it.mimeType||'').startsWith('video/')){
      el.removeAttribute('src');
      el.preload='none';
      el.style.background='var(--s3)';
      return;
    }

    if((it.mimeType||'').startsWith('image/') || it.type==='image' || !it.mimeType){
      el.dataset.driveId = it.driveFileId;
      el.dataset.mimeType = it.mimeType || '';
      el.dataset.driveThumb = it.thumbnailLink || '';
      if(priority) loadDriveImageElement(el, true);
      else driveImageObserver.observe(el);
      return;
    }
  }

  if(placeholder) el.src=placeholder;
}

function bindCardMedia(el,it,placeholder='',priority=false){
  if(!it){ if(placeholder) el.src=placeholder; return; }
  if(it.previewSrc){ el.src=it.previewSrc; setMediaLoaded(el); return; }
  if(it.src && String(it.src).startsWith('blob:')){ el.src=it.src; setMediaLoaded(el); return; }

  if(it.localBlobKey){
    el.classList.add('media-loading');
    getLocalBlobObjectURL(it.localBlobKey)
      .then(url=>{ if(url){ el.src=url; setMediaLoaded(el); } else bindRemoteCardMedia(el,it,placeholder,priority); })
      .catch(()=>bindRemoteCardMedia(el,it,placeholder,priority));
    return;
  }

  bindRemoteCardMedia(el,it,placeholder,priority);
}

function bindDriveMedia(el,it,placeholder=''){
  if(!it){ if(placeholder) el.src=placeholder; return; }
  if(it.previewSrc){ el.src=it.previewSrc; return; }
  if(it.src && String(it.src).startsWith('blob:')){ el.src=it.src; return; }
  if(it.localBlobKey){
    getLocalBlobObjectURL(it.localBlobKey)
      .then(url=>{ if(url) el.src=url; else bindDriveMediaRemote(el,it,placeholder); })
      .catch(()=>bindDriveMediaRemote(el,it,placeholder));
    return;
  }
  bindDriveMediaRemote(el,it,placeholder);
}

function bindDriveMediaRemote(el,it,placeholder=''){
  if(it.driveFileId){
    el.classList.add('media-loading');
    getDriveObjectURL(it.driveFileId,it.mimeType,true)
      .then(u=>{ if(u) el.src=u; })
      .catch(e=>{ console.error(e); if(placeholder) el.src=placeholder; })
      .finally(()=>el.classList.remove('media-loading'));
  } else if(it.src) el.src=it.src;
  else if(placeholder) el.src=placeholder;
}

// ─── UI & Rendering ───
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

function renderCounts(){
  const set=(id,n)=>{const el=$(id); if(el) el.textContent=n;};
  set('cnt-all',items.length); set('cnt-image',items.filter(i=>i.type==='image').length); set('cnt-video',items.filter(i=>i.type==='video').length); set('cnt-carousel',items.filter(i=>i.type==='carousel').length); set('cnt-link',items.filter(i=>i.type==='link').length);
}

function setFilter(f,btn){ currentFilter=f; currentCatFilter=null; document.querySelectorAll('.sb-btn[data-filter]').forEach(b=>b.classList.remove('active')); btn?.classList.add('active'); renderBoard(); }
function setSort(s,btn){ currentSort=s; document.querySelectorAll('.sb-btn[data-sort]').forEach(b=>b.classList.remove('active')); btn?.classList.add('active'); renderBoard(); }
function setView(v){ currentView=v; $('grid-btn')?.classList.toggle('active',v==='grid'); $('list-btn')?.classList.toggle('active',v==='list'); renderBoard(); }
function switchTab(tab){ $('tab-board')?.classList.toggle('active',tab==='board'); $('tab-ai')?.classList.toggle('active',tab==='ai'); $('board-wrap').style.display=tab==='board'?'block':'none'; $('ai-tab').classList.toggle('active',tab==='ai'); if(tab==='ai') renderAiTargets(); }
function toggleAiPanel(){ const active=$('ai-tab')?.classList.contains('active'); switchTab(active?'board':'ai'); }
function toggleMobileSidebar(){ $('sidebar')?.classList.add('mobile-open'); $('sidebar-overlay')?.classList.add('open'); }
function closeMobileSidebar(){ $('sidebar')?.classList.remove('mobile-open'); $('sidebar-overlay')?.classList.remove('open'); }

function dropZoneNode(){ 
  const div=document.createElement('div'); div.id='drop-zone'; div.tabIndex=0; 
  div.ondragover=onDragOver; div.ondragleave=onDragLeave; div.ondrop=onDrop; div.onclick=dzClick; div.onpaste=onDzPaste; 
  div.innerHTML='<div class="dz-icon">＋</div>이미지 · 영상을 드래그하거나<br><span style="color:var(--accent)">클릭해서 파일 선택</span><br><span style="font-size:11px;color:var(--t4)">Ctrl+V 로 이미지 또는 URL 붙여넣기 가능</span><br><button id="paste-btn" onclick="tryClipboardPaste(event)" style="margin-top:8px;background:rgba(10,132,255,0.15);border:1px solid rgba(10,132,255,0.35);color:var(--accent);font-family:var(--fn);font-size:11px;font-weight:500;padding:5px 14px;border-radius:8px;cursor:pointer;transition:all .15s;" onmouseover="this.style.background=\'rgba(10,132,255,0.25)\'" onmouseout="this.style.background=\'rgba(10,132,255,0.15)\'">클립보드에서 붙여넣기</button>'; 
  return div; 
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

// ─── Inline Title Edit ───
function startInlineTitleEdit(id, titleEl){
  const it=items.find(i=>i.id===id); if(!it) return;
  const wrap=titleEl.parentElement;
  const editBtn=wrap?.querySelector('.card-title-edit-btn');
  if(editBtn) editBtn.style.display='none';
  const input=document.createElement('input');
  input.className='card-title-input';
  input.value=it.title;
  titleEl.replaceWith(input);
  input.focus(); input.select();
  let saved=false;
  const restore=(newTitle)=>{
    const newEl=document.createElement('div'); newEl.className='card-title'; newEl.textContent=newTitle||it.title;
    input.replaceWith(newEl);
    if(editBtn){ editBtn.style.display=''; editBtn.onclick=(e)=>{e.stopPropagation();startInlineTitleEdit(id,newEl);}; }
    if(selectedId===id && $('detail-edit-title')) $('detail-edit-title').value=newEl.textContent;
  };
  const save=()=>{
    if(saved) return; saved=true;
    const newTitle=input.value.trim()||'제목없음';
    it.title=newTitle; restore(newTitle); saveData();
  };
  input.onkeydown=(e)=>{
    if(e.key==='Enter'){e.preventDefault();save();}
    if(e.key==='Escape'){saved=true; if(editBtn){editBtn.style.display='';editBtn.onclick=(e2)=>{e2.stopPropagation();startInlineTitleEdit(id,titleEl);};} input.replaceWith(titleEl);}
  };
  input.onblur=save;
  input.onclick=(e)=>e.stopPropagation();
}

function cardNode(it,index=0){
  const isPriority = currentView==='list' ? index < 14 : index < PRIORITY_CARD_COUNT;
  const card=document.createElement('div'); card.className='ref-card'+(it.id===selectedId?' selected':''); card.onclick=()=>openDetail(it.id);
  const del=document.createElement('button'); del.className='card-delete'; del.textContent='×'; del.onclick=(e)=>{e.stopPropagation(); deleteItem(it.id);}; card.appendChild(del);
  if(isDownloadableItem(it)){
    const dl=document.createElement('button');
    dl.className='card-download'; dl.textContent='↓'; dl.title='다운로드';
    dl.onclick=(e)=>{e.stopPropagation(); downloadItemMedia(it.id);};
    card.appendChild(dl);
  }
  
  let media = null;
  if(it.type==='video'){
    media=document.createElement('video'); media.className='card-media'; media.muted=true; media.playsInline=true; media.preload='none'; bindCardMedia(media,it,'',isPriority); 
    media.onmouseenter=async()=>{ if(!media.src && it.driveFileId){ try{ media.src=await getDriveObjectURL(it.driveFileId,it.mimeType); }catch(e){} } media.play().catch(()=>{}); }; 
    media.onmouseleave=()=>{media.pause(); if(media.currentTime) media.currentTime=0;};
  }else if(it.type==='carousel'){
    const firstSlide=it.carousel?.[0]||{}; media=document.createElement('img'); media.className='card-media'; tuneCardImageElement(media,isPriority); bindCardMedia(media,firstSlide,'',isPriority); media.alt=it.title;
  }else if(it.type==='link'){
    // 링크 타입의 경우 썸네일 칸을 아예 생성하지 않음
  }else{
    media=document.createElement('img'); media.className='card-media'; tuneCardImageElement(media,isPriority); bindCardMedia(media,it,'',isPriority); media.alt=it.title;
  }
  
  if(media) { card.appendChild(media); }

  const info=document.createElement('div'); info.className='card-info';
  const tags=(it.catIds||[]).map(id=>categories.find(c=>c.id===id)).filter(Boolean).map(c=>`<span class="card-cat-tag" style="background:${c.color}22;color:${c.color}">${esc(c.name)}</span>`).join('');
  info.innerHTML=`<div class="card-title-wrap"><div class="card-title">${esc(it.title)}</div><button class="card-title-edit-btn" title="제목 수정">✎</button></div><div class="card-cats">${tags}</div><div class="card-date">${new Date(it.ts).toLocaleDateString('ko-KR')}</div>`;
  const titleEl=info.querySelector('.card-title');
  const editBtn=info.querySelector('.card-title-edit-btn');
  editBtn.onclick=(e)=>{ e.stopPropagation(); startInlineTitleEdit(it.id,titleEl); };
  card.appendChild(info);
  
  const badge=document.createElement('div'); badge.className='card-type-badge'; 
  badge.textContent=it.type==='video'?'VIDEO':it.type==='carousel'?`CAROUSEL · ${(it.carousel||[]).length}`:it.type==='link'?'LINK':'IMAGE'; 
  card.appendChild(badge);
  return card;
}

// 렌더링 최적화
function renderBoard(){
  const board=$('board'); if(!board) return;
  const job=++boardRenderJob;
  
  const arr=filteredItems();
  $('count-label') && ($('count-label').textContent=`${arr.length}개`);
  renderCounts();
  
  const frag = document.createDocumentFragment();
  frag.appendChild(pasteBarNode());
  
  if(items.length===0){ 
    frag.appendChild(dropZoneNode()); 
    board.innerHTML=''; 
    board.className=currentView+'-view'; 
    board.appendChild(frag); 
    return; 
  }
  if(arr.length===0){ 
    const empty = document.createElement('div');
    empty.id = 'empty-state';
    empty.innerHTML = '검색 결과가 없어요<br><span style="font-size:11px;color:var(--t4)">다른 검색어나 필터를 사용해보세요</span>';
    frag.appendChild(empty);
    board.innerHTML=''; 
    board.className=currentView+'-view'; 
    board.appendChild(frag);
    return; 
  }
  
  const chunkSize=currentView==='list'?60:28; 
  let idx=0;
  const end=Math.min(idx+chunkSize, arr.length);
  for(; idx<end; idx++) frag.appendChild(cardNode(arr[idx], idx));
  
  board.innerHTML='';
  board.className=currentView+'-view';
  board.appendChild(frag);
  
  function paintRemaining(){
    if(job!==boardRenderJob) return;
    if(idx>=arr.length) return;
    const subFrag=document.createDocumentFragment();
    const subEnd=Math.min(idx+chunkSize, arr.length);
    for(; idx<subEnd; idx++) subFrag.appendChild(cardNode(arr[idx], idx));
    board.appendChild(subFrag);
    if(idx<arr.length) requestAnimationFrame(paintRemaining);
  }
  if(idx<arr.length) requestAnimationFrame(paintRemaining);
}

// ─── Categories ───
function persistCollapsedGroups(){ localStorage.setItem('refboard_collapsed_groups', JSON.stringify([...collapsedGroups])); }
function getCategoryGroupId(c){ return c?.groupId || c?.parentId || c?.group || ''; }
function setCategoryGroupId(c, groupId){ c.groupId=groupId||''; delete c.parentId; delete c.group; }
function normalizeCategoryGroups(){
  const groupIds=new Set(groups.map(g=>g.id));
  categories=categories.map(c=>{
    const next={...c};
    let gid=next.groupId || next.parentId || next.group || '';
    if(gid && !groupIds.has(gid)){ const byName=groups.find(g=>g.name===gid || g.title===gid); gid=byName?byName.id:''; }
    next.groupId=gid||''; delete next.parentId; delete next.group;
    return next;
  });
}
function groupByCategories(){
  normalizeCategoryGroups();
  const map=new Map(); groups.forEach(g=>map.set(g.id,[]));
  const ungrouped=[];
  categories.forEach(c=>{ const gid=getCategoryGroupId(c); if(gid && map.has(gid)) map.get(gid).push(c); else ungrouped.push(c); });
  return {map,ungrouped};
}

// ─── Category / Group Inline Edit ───
function _buildInlineEditForm(name, color, onSave, onCancel){
  const form=document.createElement('div'); form.className='cat-edit-form inline-cat-edit-form';
  form.innerHTML=`<input class="ief-name" value="${esc(name)}" maxlength="24" placeholder="이름"><div class="color-swatch-row ief-colors">${CAT_COLORS.map(c=>`<span class="color-swatch${color===c?' selected':''}" style="background:${c}" data-color="${c}"></span>`).join('')}</div><div class="edit-actions"><button class="cedit-save">저장</button><button class="cedit-cancel">취소</button></div>`;
  let sel=color;
  form.querySelectorAll('.ief-colors .color-swatch').forEach(sw=>sw.onclick=()=>{ form.querySelectorAll('.ief-colors .color-swatch').forEach(s=>s.classList.remove('selected')); sw.classList.add('selected'); sel=sw.dataset.color; });
  form.querySelector('.cedit-save').onclick=()=>{ const n=form.querySelector('.ief-name').value.trim(); if(!n) return; onSave(n,sel); };
  form.querySelector('.cedit-cancel').onclick=()=>{ form.remove(); onCancel&&onCancel(); };
  form.querySelector('.ief-name').addEventListener('keydown',e=>{ if(e.key==='Enter'){form.querySelector('.cedit-save').click();} if(e.key==='Escape'){form.remove(); onCancel&&onCancel();} });
  return form;
}

function showGroupEditInline(gid, triggerEl){
  document.querySelectorAll('.inline-cat-edit-form').forEach(el=>el.remove());
  const g=groups.find(x=>x.id===gid); if(!g) return;
  const form=_buildInlineEditForm(g.name, g.color||CAT_COLORS[0], (n,col)=>{ g.name=n; g.color=col; form.remove(); saveData(); renderAll(); }, null);
  form.dataset.for=gid;
  triggerEl.closest('.group-header').insertAdjacentElement('afterend', form);
  form.querySelector('.ief-name').focus(); form.querySelector('.ief-name').select();
}

function showCatEditInline(cid, triggerEl){
  document.querySelectorAll('.inline-cat-edit-form').forEach(el=>el.remove());
  const c=categories.find(x=>x.id===cid); if(!c) return;
  const form=_buildInlineEditForm(c.name, c.color||CAT_COLORS[0], (n,col)=>{ c.name=n; c.color=col; form.remove(); saveData(); renderAll(); }, null);
  form.dataset.for=cid;
  triggerEl.closest('.cat-row').insertAdjacentElement('afterend', form);
  form.querySelector('.ief-name').focus(); form.querySelector('.ief-name').select();
}

function categoryRowNode(c){
  const row=document.createElement('div'); row.className='cat-row';
  const cnt=items.filter(i=>i.catIds?.includes(c.id)).length;
  row.innerHTML=`<button class="cat-filter-btn ${currentCatFilter===c.id?'active':''}"><span class="dot" style="background:${c.color}"></span><span class="cat-name">${esc(c.name)}</span><span class="cnt">${cnt}</span></button><button class="cat-rename-btn" title="이름·색상 수정">✎</button><button class="cat-edit-btn" title="소분류 삭제">×</button>`;
  row.querySelector('.cat-filter-btn').onclick=()=>{ currentCatFilter=c.id; currentFilter='all'; document.querySelectorAll('.sb-btn[data-filter]').forEach(b=>b.classList.remove('active')); document.querySelector('.sb-btn[data-filter="all"]')?.classList.add('active'); renderCategories(); renderBoard(); };
  row.querySelector('.cat-rename-btn').onclick=(e)=>{ e.stopPropagation(); showCatEditInline(c.id, e.currentTarget); };
  row.querySelector('.cat-edit-btn').onclick=(e)=>{ e.stopPropagation(); if(confirm('소분류를 삭제할까요?')){ categories=categories.filter(x=>x.id!==c.id); items.forEach(i=>i.catIds=(i.catIds||[]).filter(id=>id!==c.id)); saveData(); renderAll(); } };
  return row;
}

function renderCategories(){
  const list=$('cat-list'); if(!list) return; list.innerHTML='';
  const {map,ungrouped}=groupByCategories();
  
  groups.forEach(g=>{
    const cats=map.get(g.id)||[]; const open=!collapsedGroups.has(g.id);
    const block=document.createElement('div'); block.className='group-block';
    const cnt=cats.reduce((sum,c)=>sum+items.filter(i=>i.catIds?.includes(c.id)).length,0);
    block.innerHTML=`<div class="group-header" data-gid="${g.id}"><span class="group-toggle ${open?'open':''}">▶</span><span class="group-title-line" style="background:${g.color||'var(--accent)'}"></span><span class="group-name" style="color:${g.color||'var(--t1)'}">${esc(g.name)}</span><span class="group-cnt">${cnt}</span><button class="group-rename-btn" title="이름·색상 수정">✎</button><button class="group-edit-btn" title="대분류 삭제">×</button></div>`;
    const children=document.createElement('div'); children.className='group-children'+(open?'':' collapsed');
    if(cats.length) cats.forEach(c=>children.appendChild(categoryRowNode(c))); else children.innerHTML='<div style="font-size:11px;color:var(--t4);padding:6px 10px;">소분류 없음</div>';
    block.appendChild(children);
    block.querySelector('.group-header').onclick=(e)=>{ if(e.target.classList.contains('group-edit-btn')||e.target.classList.contains('group-rename-btn')) return; collapsedGroups.has(g.id)?collapsedGroups.delete(g.id):collapsedGroups.add(g.id); persistCollapsedGroups(); renderCategories(); };
    block.querySelector('.group-rename-btn').onclick=(e)=>{ e.stopPropagation(); showGroupEditInline(g.id, e.currentTarget); };
    block.querySelector('.group-edit-btn').onclick=(e)=>{ e.stopPropagation(); if(confirm('대분류를 삭제할까요? 소분류는 그룹 없음으로 이동합니다.')){ groups=groups.filter(x=>x.id!==g.id); categories.forEach(c=>{ if(getCategoryGroupId(c)===g.id) setCategoryGroupId(c,''); }); saveData(); renderAll(); } };
    list.appendChild(block);
  });
  if(ungrouped.length){ const sec=document.createElement('div'); sec.className='ungrouped-section'; sec.innerHTML='<div class="sb-section" style="padding-top:8px;">그룹 없음</div>'; ungrouped.forEach(c=>sec.appendChild(categoryRowNode(c))); list.appendChild(sec); }
  
  renderNewCatGroupOptions(); renderModalCats(); renderDetailCatOptions(); renderAiFilters();
}

function renderColorSwatches(id){ const el=$(id); if(!el)return; el.innerHTML=CAT_COLORS.map(c=>`<span class="color-swatch" style="background:${c}"></span>`).join(''); }
function renderNewCatGroupOptions(){
  const sel=$('new-cat-group'); if(!sel) return;
  const cur=sel.value||'';
  sel.innerHTML='<option value="">그룹 없음</option>'+groups.map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join('');
  if([...sel.options].some(o=>o.value===cur)) sel.value=cur;
}
function showNewCatForm(){ $('new-cat-form').style.display='block'; renderNewCatGroupOptions(); renderColorSwatches('new-cat-colors'); }
function hideNewCatForm(){ $('new-cat-form').style.display='none'; }
function saveNewCat(){
  const name=$('new-cat-name').value.trim(); if(!name)return;
  const groupId=$('new-cat-group')?.value||'';
  categories.push({id:uid('c'),name,color:CAT_COLORS[categories.length%CAT_COLORS.length],groupId});
  $('new-cat-name').value=''; if($('new-cat-group')) $('new-cat-group').value='';
  hideNewCatForm(); normalizeCategoryGroups(); saveData(); renderAll();
}

function showNewGroupForm(){ $('new-group-form').style.display='block'; renderColorSwatches('new-group-colors'); }
function hideNewGroupForm(){ $('new-group-form').style.display='none'; }
function saveNewGroup(){
  const name=$('new-group-name').value.trim(); if(!name)return;
  const g={id:uid('g'),name,color:CAT_COLORS[groups.length%CAT_COLORS.length]};
  groups.push(g); collapsedGroups.delete(g.id); persistCollapsedGroups();
  $('new-group-name').value=''; hideNewGroupForm(); saveData(); renderAll();
}


function normalizeCatPickerName(name=''){
  return String(name).replace(/\s+/g,'').replace(/[·_\-]/g,'/').toLowerCase();
}
const CATEGORY_PICKER_FALLBACK_GROUPS=[
  {key:'format',name:'형식',color:'#3b9eff',cats:['이미지','영상','캐러셀','슬라이드/캐러셀','링크','아티클/링크']},
  {key:'ad',name:'광고/퍼포먼스',color:'#ff6b35',cats:['Meta 광고','메타광고','YouTube 광고','유튜브광고','쇼핑광고','쇼핑/검색광고','네이버쇼핑/검색광고/기타','TikTok 광고','Tiktok 광고','할인','할인소구']},
  {key:'content',name:'SNS/콘텐츠',color:'#00d4d4',cats:['인스타그램','Reels/숏폼','릴스/숏폼영상','숏폼','Blog/아티클','블로그/아티클','YouTube 콘텐츠','유튜브콘텐츠','밈/유머코드','밈','리뷰','리뷰/UGC']},
  {key:'commerce',name:'웹/커머스 UX',color:'#c8f060',cats:['웹사이트 페이지','웹사이트 구조','랜딩페이지','랜딩 페이지','상세페이지','PDP/상세페이지','이벤트프로모션','이벤트 프로모션','이벤트 페이지','쿠폰','쿠폰/혜택 UI']},
  {key:'campaign',name:'캠페인/프로모션',color:'#ffd23b',cats:['캠페인/프로모션','프로모션','기획전/프로모션','콜라보','바이럴','바이럴/참여형','시즌','시즌/기념일','협찬','협찬/인플루언서','후기']},
  {key:'visual',name:'비주얼 레퍼런스',color:'#7b5cfa',cats:['비주얼','무드/비주얼','레이아웃','카피','카피/문구','신제품','신제품/패키지']},
  {key:'shooting',name:'촬영/연출',color:'#ffaa3b',cats:['촬영/구도','촬영/연출','촬영연출','파인/일몰','소품/배경','상황/분위기','상황/무드','제품컷','사용컷','라이프스타일컷','디테일컷']},
  {key:'offline',name:'오프라인/공간',color:'#00d4d4',cats:['팝업','팝업스토어','오프라인팝업','오프라인/공간','매장진열','부스/전시','포토존','VMD']}
];
function findFallbackPickerGroup(cat){
  const key=normalizeCatPickerName(cat?.name||'');
  return CATEGORY_PICKER_FALLBACK_GROUPS.find(g=>g.cats.map(normalizeCatPickerName).includes(key))||null;
}
function getActualGroupByFallbackName(fg){
  const fgName=normalizeCatPickerName(fg.name);
  return groups.find(g=>normalizeCatPickerName(g.name||'')===fgName || normalizeCatPickerName(g.name||'').includes(fgName.split('/')[0]))||null;
}
function buildGroupedDetailCategoryPickerHtml(selectedIds=[]){
  if(!categories.length) return '<span style="font-size:11px;color:var(--t3)">카테고리 없음</span>';
  const selected=new Set(Array.isArray(selectedIds)?selectedIds:[]);
  const chip=(c)=>`<span class="cat-option-chip ${selected.has(c.id)?'selected':''}" data-id="${c.id}" style="${selected.has(c.id)?`background:${c.color};`:''}">${esc(c.name)}</span>`;
  const {map,ungrouped}=groupByCategories();
  const sections=[];
  groups.forEach(g=>{
    const cats=map.get(g.id)||[];
    if(!cats.length) return;
    sections.push(`<div class="cat-picker-group"><div class="cat-picker-group-title"><span class="cat-picker-group-line" style="background:${g.color||'var(--accent)'}"></span>${esc(g.name)}</div><div class="cat-picker-chip-row">${cats.map(chip).join('')}</div></div>`);
  });
  const fallbackBuckets=new Map();
  const ungroupedLeft=[];
  ungrouped.forEach(c=>{
    const fg=findFallbackPickerGroup(c);
    if(!fg){ ungroupedLeft.push(c); return; }
    if(!fallbackBuckets.has(fg.key)) fallbackBuckets.set(fg.key,{group:fg,cats:[]});
    fallbackBuckets.get(fg.key).cats.push(c);
  });
  CATEGORY_PICKER_FALLBACK_GROUPS.forEach(fg=>{
    const bucket=fallbackBuckets.get(fg.key);
    if(!bucket||!bucket.cats.length) return;
    const actual=getActualGroupByFallbackName(fg);
    const title=actual?.name||fg.name;
    const color=actual?.color||fg.color||'var(--accent)';
    sections.push(`<div class="cat-picker-group"><div class="cat-picker-group-title"><span class="cat-picker-group-line" style="background:${color}"></span>${esc(title)}</div><div class="cat-picker-chip-row">${bucket.cats.map(chip).join('')}</div></div>`);
  });
  if(ungroupedLeft.length){
    sections.push(`<div class="cat-picker-group"><div class="cat-picker-group-title"><span class="cat-picker-group-line" style="background:var(--t3)"></span>그룹 없음</div><div class="cat-picker-chip-row">${ungroupedLeft.map(chip).join('')}</div></div>`);
  }
  return sections.join('')||'<span style="font-size:11px;color:var(--t3)">카테고리 없음</span>';
}

// ─── Modal & File Handling ───
function renderModalCats(){ const el=$('modal-cat-options'); if(!el)return; el.innerHTML=categories.map(c=>`<span class="mcat-chip ${modalSelectedCats.includes(c.id)?'selected':''}" data-id="${c.id}" style="${modalSelectedCats.includes(c.id)?`background:${c.color};`:''}">${esc(c.name)}</span>`).join('')||'<span style="font-size:11px;color:var(--t3)">카테고리 없음</span>'; el.querySelectorAll('.mcat-chip').forEach(ch=>ch.onclick=()=>{const id=ch.dataset.id; modalSelectedCats=modalSelectedCats.includes(id)?modalSelectedCats.filter(x=>x!==id):[...modalSelectedCats,id]; renderModalCats();}); }
function openAddModal(){ pendingFile=null; pendingCarouselFiles=[]; modalSelectedCats=[]; if($('modal-file-name')) $('modal-file-name').textContent=''; if($('add-title')) $('add-title').value=''; ['add-url','add-brand','add-source-url','add-caption','add-hook','add-cta','add-visual-notes','add-content-notes','add-notes'].forEach(id=>{if($(id))$(id).value='';}); renderModalCats(); switchModalTab('single'); $('add-modal')?.classList.add('open'); }
function closeModal(id){ $(id)?.classList.remove('open'); }
function switchModalTab(mode){ modalMode=mode; $('modal-single-section').style.display=mode==='single'?'block':'none'; $('modal-carousel-section').style.display=mode==='carousel'?'block':'none'; $('modal-tab-single').style.background=mode==='single'?'var(--accent)':'none'; $('modal-tab-single').style.color=mode==='single'?'#fff':'var(--t2)'; $('modal-tab-carousel').style.background=mode==='carousel'?'var(--accent)':'none'; $('modal-tab-carousel').style.color=mode==='carousel'?'#fff':'var(--t2)'; }

function fileToItem(file, extra={}){
  const isVideo=(file.type||'').startsWith('video/');
  const previewSrc=URL.createObjectURL(file);
  const id=uid();
  const localBlobKey=extra.localBlobKey||`item:${id}`;
  const item={
    id, title: extra.title||file.name||'붙여넣기 이미지', type: isVideo?'video':'image', src: previewSrc, previewSrc,
    driveFileId:'', mimeType:file.type||'image/png', fileName:file.name||`paste_${Date.now()}.png`, localBlobKey,
    catIds:Array.isArray(extra.catIds)?extra.catIds:[], platform:extra.platform||'', brand:extra.brand||'', sourceType:extra.sourceType||'paste', sourceUrl:extra.sourceUrl||'',
    caption:extra.caption||'', hook:extra.hook||'', cta:extra.cta||'', visualNotes:extra.visualNotes||'', contentNotes:extra.contentNotes||'', notes:extra.notes||'',
    carousel:Array.isArray(extra.carousel)?extra.carousel:[], ts:extra.ts||Date.now(), _file:file
  };
  saveLocalBlob(localBlobKey,file,{fileName:item.fileName,mimeType:item.mimeType}).catch(console.warn);
  return item;
}

function handleModalFile(e){ pendingFile=e.target.files?.[0]||null; $('modal-file-name').textContent=pendingFile?pendingFile.name:''; if(pendingFile&&!$('add-title').value) $('add-title').value=pendingFile.name; }
function handleCarouselFiles(e){ pendingCarouselFiles=[...(e.target.files||[])]; const list=$('carousel-preview-list'); list.innerHTML=''; pendingCarouselFiles.forEach(f=>{const img=document.createElement('img'); img.src=URL.createObjectURL(f); img.style.cssText='width:64px;height:64px;object-fit:cover;border-radius:8px'; list.appendChild(img);}); $('carousel-count-label').textContent=`${pendingCarouselFiles.length}개 선택됨`; }

async function saveFromModal(){
  const base={title:$('add-title').value.trim()||'제목없음',catIds:[...modalSelectedCats],platform:$('add-platform').value,brand:$('add-brand').value,sourceType:$('add-source-type').value,sourceUrl:$('add-source-url').value,caption:$('add-caption').value,hook:$('add-hook').value,cta:$('add-cta').value,visualNotes:$('add-visual-notes').value,contentNotes:$('add-content-notes').value,notes:$('add-notes').value,ts:Date.now()};
  const url=$('add-url').value.trim();
  if(modalMode==='carousel'){
    if(!pendingCarouselFiles.length){showToast('캐러셀 이미지를 선택해주세요','error');return;}
    const slides=pendingCarouselFiles.map(f=>{
      const sid=uid('s');
      const localBlobKey=`slide:${sid}`;
      saveLocalBlob(localBlobKey,f,{fileName:f.name,mimeType:f.type}).catch(console.warn);
      return {id:sid,src:URL.createObjectURL(f),previewSrc:URL.createObjectURL(f),mimeType:f.type,fileName:f.name,localBlobKey,_file:f};
    });
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
function onDragLeave(){ $('drop-zone')?.classList.remove('dragover'); $('paste-bar')?.classList.remove('dragover'); }
function onDrop(e){ e.preventDefault(); $('drop-zone')?.classList.remove('dragover'); $('paste-bar')?.classList.remove('dragover'); [...(e.dataTransfer.files||[])].forEach(f=>items.push(fileToItem(f))); saveData(); renderAll(); }
function dzClick(e){ if(e.target.id!=='paste-btn' && e.target.id!=='paste-upload-btn') $('file-input')?.click(); }
function onDzPaste(e){ handlePaste(e.clipboardData); }

// ─── Paste Logic ───
async function addPastedFiles(files){
  const arr=[...files].filter(f=>/^image\//.test(f.type||'') || /^video\//.test(f.type||''));
  if(!arr.length) return 0;
  arr.forEach((f,i)=>{
    const safeName=f.name&&f.name!=='image.png'?f.name:`paste_${Date.now()}_${i}.${((f.type||'image/png').split('/')[1]||'png').replace('jpeg','jpg')}`;
    const file=f.name?f:new File([f],safeName,{type:f.type||'image/png'});
    items.unshift(fileToItem(file,{title:safeName,sourceType:'paste'}));
  });
  saveData(); renderAll();
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
  Promise.all(stringJobs).then(()=>{ if(added){ saveData(); renderAll(); showToast(`${added}개 붙여넣기 완료`,'success'); } });
}

async function tryClipboardPaste(e){ 
  e?.stopPropagation(); 
  await readClipboardNow(e); 
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
      if(added){ saveData(); renderAll(); showToast(`${added}개 붙여넣기 완료`,'success'); return; }
    }
    const text=await navigator.clipboard.readText();
    if(/^https?:\/\//.test(text.trim())){ addUrlItem(text.trim()); showToast('URL 붙여넣기 완료','success'); return; }
    showToast('클립보드에서 이미지나 URL을 찾지 못했어요','error');
  }catch(err){ console.error(err); showToast('브라우저 권한상 Ctrl+V를 눌러 붙여넣어주세요','error'); }
}

async function addUrlItem(url){ items.push(normalizeItem({id:uid(),title:url.split('/').pop()||'URL 레퍼런스',src:url,type:guessType(url),ts:Date.now()})); await saveData(); renderAll(); }
function copyMakeJsonTemplate(){ navigator.clipboard?.writeText(JSON.stringify([{title:'예시',type:'image',url:'https://...',caption:'캡션',brand:'브랜드'}],null,2)); showToast('JSON 구조 복사 완료','success'); }
function importMakeJsonFile(e){ const f=e.target.files?.[0]; if(!f)return; const r=new FileReader(); r.onload=()=>{ try{ const data=JSON.parse(r.result); const arr=Array.isArray(data)?data:(data.items||[]); items.push(...arr.map(normalizeItem)); saveData(); renderAll(); showToast('JSON 가져오기 완료','success'); }catch(err){showToast('JSON 형식 오류','error');} }; r.readAsText(f); }
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

// ─── Download Helpers ───
function isDownloadableItem(it){
  if(!it) return false;
  if(it.type==='image'||it.type==='video') return true;
  if(it.type==='carousel') return Array.isArray(it.carousel) && it.carousel.length>0;
  return false;
}

function safeFileName(name='refboard-media'){
  return String(name||'refboard-media').replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,' ').trim().slice(0,120)||'refboard-media';
}

function extFromMime(mime='',fallback='png'){
  const m=String(mime||'').toLowerCase();
  if(m.includes('jpeg')) return 'jpg';
  if(m.includes('png')) return 'png';
  if(m.includes('webp')) return 'webp';
  if(m.includes('gif')) return 'gif';
  if(m.includes('svg')) return 'svg';
  if(m.includes('mp4')) return 'mp4';
  if(m.includes('webm')) return 'webm';
  if(m.includes('quicktime')) return 'mov';
  return fallback;
}

function ensureFileExt(name,media){
  const current=safeFileName(name||media.fileName||media.title||'refboard-media');
  if(/\.[a-z0-9]{2,5}$/i.test(current)) return current;
  return `${current}.${extFromMime(media.mimeType,media.type==='video'?'mp4':'png')}`;
}

async function blobFromMedia(media){
  if(!media) return null;
  if(media._file) return media._file;
  if(media.localBlobKey){
    const local=await getLocalBlob(media.localBlobKey);
    if(local) return local;
  }
  if(media.driveFileId) return await getDriveBlob(media.driveFileId,media.mimeType);
  if(media.src && String(media.src).startsWith('blob:')) return await (await fetch(media.src)).blob();
  if(media.src && String(media.src).startsWith('data:')) return await (await fetch(media.src)).blob();
  if(media.src && /^https?:\/\//.test(media.src)){
    try{
      const res=await fetch(media.src,{mode:'cors'});
      if(res.ok) return await res.blob();
    }catch(e){ console.warn('외부 URL blob 다운로드 실패:', e); }
  }
  return null;
}

function triggerDownload(blobOrUrl,filename){
  const a=document.createElement('a');
  let href=blobOrUrl;
  if(blobOrUrl instanceof Blob) href=URL.createObjectURL(blobOrUrl);
  a.href=href;
  a.download=filename;
  a.rel='noopener';
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{
    a.remove();
    if(blobOrUrl instanceof Blob) URL.revokeObjectURL(href);
  },700);
}

async function downloadMediaTarget(media,filename){
  const name=ensureFileExt(filename,media);
  const blob=await blobFromMedia(media);
  if(blob){ triggerDownload(blob,name); return true; }
  if(media?.src){
    triggerDownload(media.src,name);
    return true;
  }
  return false;
}

async function downloadItemMedia(id){
  const it=items.find(i=>i.id===id);
  if(!it){ showToast('다운로드할 항목을 찾지 못했어요','error'); return; }
  try{
    if(it.type==='carousel'){
      const slides=(it.carousel||[]).filter(Boolean);
      if(!slides.length){ showToast('다운로드할 캐러셀 이미지가 없어요','error'); return; }
      let done=0;
      for(let idx=0; idx<slides.length; idx++){
        const s=slides[idx];
        const base=`${safeFileName(it.title||'carousel')}_${String(idx+1).padStart(2,'0')}_${safeFileName(s.fileName||s.title||'slide')}`;
        if(await downloadMediaTarget(s,base)) done++;
      }
      showToast(`${done}개 다운로드 시작`,'success');
      return;
    }
    const ok=await downloadMediaTarget(it,it.fileName||it.title||'refboard-media');
    showToast(ok?'다운로드 시작':'다운로드할 미디어가 없어요',ok?'success':'error');
  }catch(e){ console.error(e); showToast('다운로드 실패: Drive 연결 또는 외부 URL 권한을 확인해주세요','error'); }
}

// ─── Detail View ───
function carouselThumbStrip(it){
  if(!Array.isArray(it.carousel)||!it.carousel.length) return '<div class="detail-helper">캐러셀 슬라이드가 없습니다.</div>';
  return `<div class="detail-section-title">CAROUSEL ITEMS · ${it.carousel.length}개</div><div class="carousel-detail-grid" id="carousel-detail-grid"></div>`;
}
function mountCarouselDetailMedia(it){
  const grid=$('carousel-detail-grid'); if(!grid || !Array.isArray(it.carousel)) return;
  grid.innerHTML='';
  it.carousel.forEach((s,idx)=>{
    const wrap=document.createElement('div'); wrap.className='carousel-detail-item';
    const media=document.createElement((s.mimeType||'').startsWith('video/')?'video':'img');
    if(media.tagName==='VIDEO') media.controls=true;
    bindDriveMedia(media,s); wrap.appendChild(media);
    const cap=document.createElement('div'); cap.className='carousel-detail-caption'; cap.textContent=`${idx+1}. ${s.fileName||s.title||'slide'}`;
    wrap.appendChild(cap); grid.appendChild(wrap);
  });
}

function openDetail(id){ selectedId=id; renderBoard(); renderDetail(); $('detail-panel')?.classList.add('open'); }
function closeDetail(){ selectedId=null; $('detail-panel')?.classList.remove('open'); renderBoard(); }
function renderDetailCatOptions(){ const it=items.find(i=>i.id===selectedId); const el=$('detail-cat-options'); if(!el||!it)return; if(!Array.isArray(it.catIds)) it.catIds=[]; el.innerHTML=buildGroupedDetailCategoryPickerHtml(it.catIds); el.querySelectorAll('.cat-option-chip').forEach(ch=>ch.onclick=()=>{const id=ch.dataset.id; it.catIds=it.catIds.includes(id)?it.catIds.filter(x=>x!==id):[...it.catIds,id]; saveData(); renderAll(); renderDetail();}); }

function renderDetail(){
  const it=items.find(i=>i.id===selectedId); if(!it)return;
  const m=$('detail-media'); if(!m)return; m.innerHTML='';
  let el;
  if(it.type==='video'){ el=document.createElement('video'); el.controls=true; bindDriveMedia(el,it); m.appendChild(el); }
  else if(it.type==='carousel'){ const first=it.carousel?.[0]; if(first){ el=document.createElement((first.mimeType||'').startsWith('video/')?'video':'img'); if(el.tagName==='VIDEO') el.controls=true; bindDriveMedia(el,first); m.appendChild(el); } }
  else if(it.type==='link'){ /* 미디어 영역 무시 */ }
  else{ el=document.createElement('img'); bindDriveMedia(el,it); m.appendChild(el); }
  
  renderDetailCatOptions();
  const f=$('detail-fields'); if(!f) return;
  f.innerHTML=`
    ${it.type==='carousel'?carouselThumbStrip(it):''}
    <div class="detail-section-title">수정</div>
    <div class="form-row"><label class="form-label">제목</label><input class="detail-input" id="detail-edit-title" value="${esc(it.title||'')}"></div>
    <div class="form-row"><label class="form-label">브랜드</label><input class="detail-input" id="detail-edit-brand" value="${esc(it.brand||'')}"></div>
    <div class="form-row"><label class="form-label">게시물 본문</label><textarea class="detail-input" id="detail-edit-caption" rows="5" placeholder="인스타그램/광고 게시물 본문을 입력하세요">${esc(it.caption||'')}</textarea></div>
    <div class="form-row"><label class="form-label">훅 / 첫 문장</label><input class="detail-input" id="detail-edit-hook" value="${esc(it.hook||'')}"></div>
    <div class="form-row"><label class="form-label">CTA</label><input class="detail-input" id="detail-edit-cta" value="${esc(it.cta||'')}"></div>
    <div class="form-row"><label class="form-label">비주얼 메모</label><textarea class="detail-input" id="detail-edit-visual" rows="3">${esc(it.visualNotes||'')}</textarea></div>
    <div class="form-row"><label class="form-label">콘텐츠 메모</label><textarea class="detail-input" id="detail-edit-content" rows="3">${esc(it.contentNotes||'')}</textarea></div>
    
    <div class="form-row">
      <label class="form-label">링크 첨부</label>
      <div style="display:flex;gap:6px;">
        <input class="detail-input" style="flex:1;" id="detail-edit-link" value="${esc(it.sourceUrl || (it.type==='link'?it.src:'') || '')}" placeholder="https:// URL 입력">
        <button class="detail-btn" style="flex-shrink:0;white-space:nowrap;" onclick="const url=document.getElementById('detail-edit-link').value; if(url) window.open(url, '_blank')">바로가기</button>
      </div>
    </div>

    <div class="form-row"><label class="form-label">일반 메모</label><textarea class="detail-input" id="detail-edit-notes" rows="3">${esc(it.notes||'')}</textarea></div>
    <div class="detail-actions">
      <button class="detail-btn primary" onclick="saveDetailEdits()">수정 저장</button>
      ${isDownloadableItem(it)?'<button class="detail-btn" onclick="downloadItemMedia(selectedId)">다운로드</button>':''}
      <button class="detail-btn" onclick="renderDetail()">되돌리기</button>
      <button class="detail-btn" style="color:var(--red)" onclick="deleteItem(selectedId)">삭제</button>
    </div>
    <hr class="detail-divider">
    <div class="detail-field"><div class="detail-key">TYPE</div><div class="detail-val">${esc(it.type||'-')}</div></div>
    <div class="detail-field"><div class="detail-key">DRIVE FILE ID</div><div class="detail-val">${esc(it.driveFileId||'-')}</div></div>
  `;
  mountCarouselDetailMedia(it);
  // 제목 입력 필드에서 엔터 → 저장
  const titleInp=$('detail-edit-title');
  if(titleInp) titleInp.addEventListener('keydown',e=>{ if(e.key==='Enter'){e.preventDefault();saveDetailEdits();} });
}

function saveDetailEdits(){
  const it=items.find(i=>i.id===selectedId); if(!it)return;
  it.title=$('detail-edit-title')?.value.trim()||'제목없음';
  it.brand=$('detail-edit-brand')?.value.trim()||'';
  it.caption=$('detail-edit-caption')?.value||'';
  it.hook=$('detail-edit-hook')?.value||'';
  it.cta=$('detail-edit-cta')?.value||'';
  it.visualNotes=$('detail-edit-visual')?.value||'';
  it.contentNotes=$('detail-edit-content')?.value||'';
  
  it.sourceUrl=$('detail-edit-link')?.value||'';
  if(it.type === 'link' && it.sourceUrl) { 
    it.src = it.sourceUrl; 
  }

  it.notes=$('detail-edit-notes')?.value||'';
  saveData(); renderBoard(); renderAiTargets(); renderDetail();
  showToast('수정 저장 완료','success');
}

// ─── AI Tools ───
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
function onAiCatFilterChange(){ currentAiCatFilter=$('ai-cat-filter').value; renderAiTargets(); }
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

function selectAllVisibleAiTargets(){ filteredItems().forEach(i=>aiSelectedIds.add(i.id)); renderAiTargets(); }
function clearVisibleAiTargets(){ filteredItems().forEach(i=>aiSelectedIds.delete(i.id)); renderAiTargets(); }
function saveApiKey(){ const p=$('ai-provider')?.value||'google'; const v=$('ai-apikey-input')?.value||''; localStorage.setItem('refboard_ai_'+p,v); $('api-key-status').style.display='block'; showToast('AI 키 저장 완료','success'); }
function onProviderChange(){ const p=$('ai-provider')?.value||'google'; if($('ai-apikey-input')) $('ai-apikey-input').value=localStorage.getItem('refboard_ai_'+p)||''; if($('api-key-hint')) $('api-key-hint').textContent=PROVIDER_HINTS[p]||''; }
function runSingleAnalysis(){ const res=$('ai-single-result'); if(!res)return; const chosen=[...aiSelectedIds].map(id=>items.find(i=>i.id===id)).filter(Boolean); res.classList.add('open'); res.innerHTML=`선택된 ${chosen.length}개 레퍼런스 기준으로 분석할 수 있습니다.<br>현재 완성본은 Drive 미디어 저장/불러오기 안정화에 초점을 맞춘 버전입니다.`; }
function runBatchAnalysis(){ const res=$('ai-batch-result'); if(!res)return; res.classList.add('open'); res.innerHTML=`전체 ${items.length}개 레퍼런스가 수집되어 있습니다.`; }

// ─── Initialization ───
window.addEventListener('DOMContentLoaded',()=>{
  try{ restoreCachedDriveToken(); }catch(e){ console.warn(e); }
  loadLocal(); 
  normalizeCategoryGroups();
  installReliablePasteListener();
  
  removeItemsThatAreCarouselSlides();
  
  renderAll(); 
  onProviderChange(); 
  updateDriveUi();
});