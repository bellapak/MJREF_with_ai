// =====================================================
//  refboard v30 — app.js
//  모듈 구조 (단일 파일, 섹션 주석으로 구분):
//    1. CONSTANTS
//    2. STATE
//    3. UTILS
//    4. PERSISTENCE  (IndexedDB + localStorage 마이그레이션)
//    5. USB / File System Access API
//    6. TAB / VIEW / FILTER / SORT
//    7. CATEGORY SIDEBAR  (groups & cats)
//    8. VIDEO THUMBNAIL
//    9. BOARD RENDER
//   10. ITEMS  (add / delete / carousel / file)
//   11. MODAL
//   12. DRAG / DROP / PASTE
//   13. DETAIL PANEL
//   14. AI  (provider, call, analysis, batch)
//   15. AUTOSAVE INDICATOR
//   16. MOBILE SIDEBAR / TOAST
//   17. USB RECONNECT
//   18. INIT
// =====================================================

// ─── CONSTANTS ───
const CAT_COLORS=['#ff6b35','#ff3b8b','#7b5cfa','#3b9eff','#3bfa8a','#ffd23b','#ff5555','#00d4d4','#ffaa3b','#c8f060'];
const PROVIDER_HINTS={
  anthropic:'발급: console.anthropic.com/settings/keys',
  openai:'발급: platform.openai.com/api-keys',
  google:'발급: aistudio.google.com/app/apikey'
};

// ─── DEBOUNCE & AUTO-SAVE ───
function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};}
let _autoSaveEnabled=true;
// scheduleSave는 하단 AUTOSAVE INDICATOR 섹션에서 재정의됩니다
function scheduleSave(){saveData();}  // 초기 fallback (재정의 전 안전장치)

// ─── STATE ───
let groups=[]; // 대분류 [{id,name,color,collapsed}]
let categories=[
  {id:'cat1',name:'광고 소재',color:'#ff6b35',groupId:null},
  {id:'cat2',name:'인스타 피드',color:'#ff3b8b',groupId:null},
  {id:'cat3',name:'릴스 / 영상',color:'#7b5cfa',groupId:null},
  {id:'cat4',name:'타이포그래피',color:'#3b9eff',groupId:null},
  {id:'cat5',name:'색상 무드',color:'#ffd23b',groupId:null},
];
let items=[];
let currentFilter='all';
let currentCatFilter=null;
let currentSort='newest';
let currentView='grid';
let selectedId=null;
let pendingFile=null;
let newCatColorIdx=0;
let editingCatId=null;
let modalSelectedCats=[];
let selectedAiTargets=new Set();
let selectedAiOpts=new Set(['mood']);
let currentTab='board';
// ─── GOOGLE DRIVE STATE ───
let gdriveToken=null;          // OAuth2 access token
let gdriveTokenExpiry=0;       // expiry timestamp (ms)
let gdriveFolderId=null;       // refboard-assets/ 폴더 ID
let gdriveDataFileId=null;     // refboard-data.json 파일 ID
let aiGroupFilter='';
let aiCatFilter='';

// ─── UTILS ───
function genId(){return 'r'+Date.now()+Math.random().toString(36).slice(2,6);}
function fmtDate(ts){const d=new Date(ts);return d.getFullYear()+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+String(d.getDate()).padStart(2,'0');}
function getCat(id){return categories.find(c=>c.id===id)||{name:'미분류',color:'#555'};}
function getApiKey(provider){return localStorage.getItem('refboard_key_'+(provider||document.getElementById('ai-provider').value))||'';}

function collectModalMeta(){
  return {
    platform:document.getElementById('add-platform')?.value||'',
    brand:document.getElementById('add-brand')?.value.trim()||'',
    sourceType:document.getElementById('add-source-type')?.value||'manual',
    sourceUrl:document.getElementById('add-source-url')?.value.trim()||'',
    hook:document.getElementById('add-hook')?.value.trim()||'',
    cta:document.getElementById('add-cta')?.value.trim()||'',
    visualNotes:document.getElementById('add-visual-notes')?.value.trim()||'',
    contentNotes:document.getElementById('add-content-notes')?.value.trim()||''
  };
}
function buildAiContext(it){
  const lines=[];
  if(it.platform)lines.push(`플랫폼: ${it.platform}`);
  if(it.brand)lines.push(`브랜드: ${it.brand}`);
  if(it.sourceType)lines.push(`수집경로: ${it.sourceType}`);
  if(it.sourceUrl)lines.push(`원본링크: ${it.sourceUrl}`);
  if(it.hook)lines.push(`첫 훅/헤드라인: ${it.hook}`);
  if(it.caption)lines.push(`본문/캡션: ${it.caption}`);
  if(it.cta)lines.push(`CTA: ${it.cta}`);
  if(it.visualNotes)lines.push(`비주얼 분석 메모: ${it.visualNotes}`);
  if(it.contentNotes)lines.push(`콘텐츠 전략 메모: ${it.contentNotes}`);
  if(it.notes)lines.push(`운영 메모: ${it.notes}`);
  return lines.join(' | ');
}
function normalizeImportedItem(raw){
  const media=raw.media||{};
  const analysis=raw.analysis_input||{};
  const meta=raw.meta||{};
  const cats=Array.isArray(raw.catIds)?raw.catIds:(raw.category_ids||[]);
  const src=raw.src||media.src||media.url||raw.imageUrl||raw.image_url||raw.thumbnailUrl||raw.thumbnail_url||'';
  const type=raw.type||media.type||(String(src).match(/\.(mp4|webm|mov|ogg)(\?|$)/i)?'video':'image');
  return {
    id:raw.id||genId(),
    src,
    type,
    title:raw.title||meta.title||raw.brand||'가져온 레퍼런스',
    catIds:cats.length?cats:[categories[0]?.id].filter(Boolean),
    notes:raw.notes||analysis.notes||'',
    caption:raw.caption||analysis.caption||analysis.body||raw.description||'',
    platform:raw.platform||meta.platform||'',
    brand:raw.brand||meta.brand||'',
    sourceType:raw.sourceType||raw.source_type||meta.source_type||'make',
    sourceUrl:raw.sourceUrl||raw.source_url||meta.source_url||raw.url||'',
    hook:raw.hook||analysis.hook||analysis.headline||'',
    cta:raw.cta||analysis.cta||'',
    visualNotes:raw.visualNotes||raw.visual_notes||analysis.visual_notes||'',
    contentNotes:raw.contentNotes||raw.content_notes||analysis.content_notes||'',
    tags:raw.tags||analysis.tags||[],
    ts:raw.ts||raw.createdAt||raw.created_at?new Date(raw.ts||raw.createdAt||raw.created_at).getTime():Date.now(),
    aiAnalyzed:false,
    aiResult:'',
    assetPath:null
  };
}
function copyMakeJsonTemplate(){
  const sample={
    version:'refboard.make.v1',
    items:[{
      title:'브랜드명_캠페인명_소재명',
      type:'image',
      src:'https://image-or-video-url.jpg',
      catIds:['cat1'],
      platform:'instagram',
      brand:'브랜드명',
      sourceType:'snippit',
      sourceUrl:'https://original-post-url',
      caption:'원문 캡션/본문 전체',
      hook:'첫 화면 훅 또는 헤드라인',
      cta:'구매하기',
      visualNotes:'컬러, 구도, 자막, 제품 노출 방식',
      contentNotes:'타겟, 소구점, 감정, 테스트 가설',
      tags:['키치','후킹','비포애프터'],
      notes:'운영 메모',
      createdAt:new Date().toISOString()
    }]
  };
  navigator.clipboard.writeText(JSON.stringify(sample,null,2)).then(()=>showToast('Make JSON 구조 복사됨','success'));
}
async function importMakeJsonFile(e){
  const file=e.target.files&&e.target.files[0]; if(!file)return;
  try{
    const data=JSON.parse(await file.text());
    const rows=Array.isArray(data)?data:(data.items||[]);
    const imported=rows.map(normalizeImportedItem).filter(it=>it.src);
    items.push(...imported);
    scheduleSave();renderBoard();
    if(currentTab==='ai')refreshAiTab();
    showToast(`Make JSON ${imported.length}개 가져옴`,'success');
  }catch(err){showToast('JSON 가져오기 실패: '+err.message,'error');}
  e.target.value='';
}


// ─── PERSISTENCE (IndexedDB) ───
const DB_NAME='refboard_db';
const DB_VERSION=1;
const STORE_NAME='refboard_store';
let _db=null;

function openDB(){
  return new Promise((resolve,reject)=>{
    if(_db){resolve(_db);return;}
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=e=>{
      const db=e.target.result;
      if(!db.objectStoreNames.contains(STORE_NAME)){
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess=e=>{_db=e.target.result;resolve(_db);};
    req.onerror=e=>{reject(e.target.error);};
  });
}

async function saveData(){
  try{
    const db=await openDB();
    const tx=db.transaction(STORE_NAME,'readwrite');
    const store=tx.objectStore(STORE_NAME);
    store.put(JSON.stringify({groups,categories,items}),'refboard_data');
    await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=e=>rej(e.target.error);});
  }catch(e){
    console.error('IndexedDB 저장 실패',e);
    showToast('저장 실패: '+e.message,'error');
  }
}


async function loadData(){
  try{
    // 기존 localStorage 데이터 마이그레이션
    const legacy=localStorage.getItem('refboard_data');
    const db=await openDB();
    const tx=db.transaction(STORE_NAME,'readonly');
    const store=tx.objectStore(STORE_NAME);
    const req=store.get('refboard_data');
    const raw=await new Promise((res,rej)=>{req.onsuccess=e=>res(e.target.result);req.onerror=e=>rej(e.target.error);});

    let data=null;
    if(raw){data=JSON.parse(raw);}
    else if(legacy){
      data=JSON.parse(legacy);
      // 마이그레이션 후 localStorage 정리
      await saveData();
      localStorage.removeItem('refboard_data');
      showToast('기존 데이터를 대용량 저장소로 이전했어요 ✓','success');
    }
    if(!data)return;
    if(data.groups&&data.groups.length)groups=data.groups;
    if(data.categories&&data.categories.length)categories=data.categories.map(c=>({groupId:null,...c}));
    if(data.items&&data.items.length)items=data.items.map(it=>({...it,catIds:it.catIds||[it.catId].filter(Boolean)}));
  }catch(e){console.warn('데이터 불러오기 실패',e);}
}



// ─── GOOGLE DRIVE — SETUP & AUTH ───────────────────────────────────────────
// Client ID는 localStorage에 저장. 사용자가 직접 입력 (console.cloud.google.com).
// Scope: Drive 앱 전용 파일만 접근 (drive.file) — 다른 Drive 파일은 건드리지 않음.
const GDRIVE_SCOPE='https://www.googleapis.com/auth/drive.file';
const GDRIVE_FOLDER_NAME='refboard-assets';
const GDRIVE_JSON_NAME='refboard-data.json';

function getGdriveClientId(){
  return localStorage.getItem('gdrive_client_id')||'';
}
function saveGdriveClientId(id){
  localStorage.setItem('gdrive_client_id',id.trim());
}

function updateGdriveStatus(msg='',ok=false){
  const el=document.getElementById('gdrive-status');
  if(!el)return;
  el.textContent=msg;
  el.style.color=ok?'var(--green)':'var(--t3)';
}

function gdriveTokenValid(){
  return gdriveToken && Date.now()<gdriveTokenExpiry-60000;
}

// OAuth2 implicit grant — 팝업 없음, 탭 리다이렉트 방식
function gdriveSignIn(){
  const clientId=getGdriveClientId();
  if(!clientId){openGdriveSetup();return;}
  if(gdriveTokenValid()){showToast('이미 연결됐어요','success');return;}
  // google.accounts.oauth2 토큰 클라이언트 (implicit flow)
  if(!window.google){showToast('Google 라이브러리 로딩 중이에요. 잠시 후 다시 시도해주세요.','error');return;}
  const client=google.accounts.oauth2.initTokenClient({
    client_id:clientId,
    scope:GDRIVE_SCOPE,
    callback:(tokenResp)=>{
      if(tokenResp.error){
        showToast('Google 로그인 실패: '+tokenResp.error,'error');
        updateGdriveStatus('연결 실패',false);
        return;
      }
      gdriveToken=tokenResp.access_token;
      gdriveTokenExpiry=Date.now()+(tokenResp.expires_in||3600)*1000;
      localStorage.setItem('gdrive_token',gdriveToken);
      localStorage.setItem('gdrive_token_expiry',String(gdriveTokenExpiry));
      updateGdriveStatus('Drive 연결됨 ✓',true);
      showToast('Google Drive 연결됐어요','success');
    }
  });
  client.requestAccessToken();
}

// 앱 시작 시 저장된 토큰 복원 시도
function tryRestoreGdriveToken(){
  const tok=localStorage.getItem('gdrive_token');
  const exp=parseInt(localStorage.getItem('gdrive_token_expiry')||'0');
  if(tok && Date.now()<exp-60000){
    gdriveToken=tok;
    gdriveTokenExpiry=exp;
    updateGdriveStatus('Drive 연결됨 ✓',true);
    return true;
  }
  updateGdriveStatus('Drive 미연결',false);
  return false;
}

function requireGdriveToken(){
  if(!gdriveTokenValid())throw new Error('Google Drive에 먼저 연결해주세요. (상단 "Google 연결" 버튼)');
}

// ─── GOOGLE DRIVE — REST API 헬퍼 ──────────────────────────────────────────
async function driveRequest(method, path, params={}, body=null, isUpload=false){
  requireGdriveToken();
  let url='https://www.googleapis.com/';
  url += isUpload ? 'upload/drive/v3'+path : 'drive/v3'+path;
  const qs=new URLSearchParams(params).toString();
  if(qs) url+='?'+qs;
  const opts={method, headers:{Authorization:'Bearer '+gdriveToken}};
  if(body instanceof FormData){opts.body=body;}
  else if(body){opts.headers['Content-Type']='application/json';opts.body=JSON.stringify(body);}
  const resp=await fetch(url,opts);
  if(!resp.ok){
    const err=await resp.json().catch(()=>({error:{message:resp.statusText}}));
    throw new Error(err?.error?.message||resp.statusText);
  }
  // DELETE 등은 본문 없음
  const ct=resp.headers.get('Content-Type')||'';
  return ct.includes('json')?resp.json():resp.text();
}

// 파일 목록에서 이름으로 찾기
async function driveFindFile(name, parentId=null){
  let q=`name='${name}' and trashed=false`;
  if(parentId) q+=` and '${parentId}' in parents`;
  const res=await driveRequest('GET','/files',{q,fields:'files(id,name)',spaces:'drive'});
  return (res.files||[])[0]||null;
}

// JSON 파일 업로드 (없으면 create, 있으면 update)
async function driveUploadJson(name, obj, existingId=null){
  const content=JSON.stringify(obj,null,2);
  const blob=new Blob([content],{type:'application/json'});
  const meta={name};
  const form=new FormData();
  form.append('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}));
  form.append('file',blob);
  if(existingId){
    // PATCH update
    return driveRequest('PATCH',`/files/${existingId}`,{uploadType:'multipart'},{},false)
      .catch(()=>null)
      .then(()=>{
        // FormData 업데이트
        return fetch(
          `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`,
          {method:'PATCH',headers:{Authorization:'Bearer '+gdriveToken},body:form}
        ).then(r=>r.json());
      });
  }
  // POST create
  return fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {method:'POST',headers:{Authorization:'Bearer '+gdriveToken},body:form}
  ).then(r=>r.json());
}

// 바이너리 에셋 업로드 (data:URL → Blob)
async function driveUploadAsset(item, dataUrl, folderId){
  const blob=dataUrlToBlob(dataUrl);
  const ext=extFromMime(blob.type);
  const filename=`${item.id}_${safeFileBase(item.title)}.${ext}`;
  // 이미 올라간 파일이 있으면 재사용
  const existing=await driveFindFile(filename, folderId).catch(()=>null);
  if(existing) return existing.id;
  const meta={name:filename, parents:[folderId]};
  const form=new FormData();
  form.append('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}));
  form.append('file',blob);
  const res=await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {method:'POST',headers:{Authorization:'Bearer '+gdriveToken},body:form}
  ).then(r=>r.json());
  return res.id;
}

// Drive 파일 내용 다운로드 → text
async function driveDownloadText(fileId){
  requireGdriveToken();
  const resp=await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {headers:{Authorization:'Bearer '+gdriveToken}}
  );
  if(!resp.ok)throw new Error('파일 다운로드 실패: '+resp.statusText);
  return resp.text();
}

// 추천 방식: GAPI 라이브러리 사용
async function driveDownloadAsObjectUrl(fileId) {
  try {
    // GAPI 클라이언트를 사용하여 직접 다운로드
    const response = await gapi.client.drive.files.get({
      fileId: fileId,
      alt: 'media'
    });

    // response.body는 바이너리 데이터입니다.
    // 파일 타입(MimeType)에 따라 Blob 생성 시 타입을 지정해주세요.
    const blob = new Blob([response.body], { type: 'image/png' }); 
    return URL.createObjectURL(blob);
    
  } catch (err) {
    console.error("드라이브 에셋 로드 중 오류 발생:", err);
    throw new Error('에셋 다운로드 실패');
  }
}

// refboard-assets 폴더 ID 확보 (없으면 생성)
async function ensureAssetFolder(){
  if(gdriveFolderId) return gdriveFolderId;
  const existing=await driveFindFile(GDRIVE_FOLDER_NAME);
  if(existing){gdriveFolderId=existing.id;return gdriveFolderId;}
  const created=await driveRequest('POST','/files',{},{
    name:GDRIVE_FOLDER_NAME,
    mimeType:'application/vnd.google-apps.folder'
  });
  gdriveFolderId=created.id;
  return gdriveFolderId;
}

// ─── GOOGLE DRIVE — 저장 ───────────────────────────────────────────────────
async function saveToDrive(){
  try{
    requireGdriveToken();
    updateGdriveStatus('저장 중...',true);
    const folderId=await ensureAssetFolder();

    // 이미지/캐러셀 data:URL → Drive에 올리고 fileId 기록
    const serialized=[];
    for(const item of items){
      const plain={...item};
      delete plain.thumb; delete plain.frames;

      // src가 data:URL인 경우 Drive에 올림
      if(typeof plain.src==='string'&&plain.src.startsWith('data:')){
        const assetId=await driveUploadAsset(item,plain.src,folderId);
        plain.src=null;
        plain.driveAssetId=assetId;
      }
      // 캐러셀 images도 각각 올림
      if(Array.isArray(plain.images)){
        const uploadedIds=[];
        for(const src of plain.images){
          if(typeof src==='string'&&src.startsWith('data:')){
            const fakeItem={...item,id:item.id+'_c'+uploadedIds.length};
            uploadedIds.push(await driveUploadAsset(fakeItem,src,folderId));
          } else if(typeof src==='string'&&src.startsWith('blob:')){
            // blob → fetch → upload
            try{
              const r=await fetch(src); const b=await r.blob();
              const du=await blobToDataUrl(b);
              const fakeItem={...item,id:item.id+'_c'+uploadedIds.length};
              uploadedIds.push(await driveUploadAsset(fakeItem,du,folderId));
            }catch(e){uploadedIds.push(null);}
          } else {
            uploadedIds.push(null); // 원본 URL 유지
          }
        }
        plain.driveImageIds=uploadedIds;
        plain.images=plain.images.map((src,i)=>uploadedIds[i]?null:src);
      }
      // blob:URL도 변환
      if(typeof plain.src==='string'&&plain.src.startsWith('blob:')){
        try{
          const r=await fetch(plain.src);const b=await r.blob();
          const du=await blobToDataUrl(b);
          const assetId=await driveUploadAsset(item,du,folderId);
          plain.src=null; plain.driveAssetId=assetId;
        }catch(e){}
      }
      serialized.push(plain);
    }

    const exportData={groups,categories,items:serialized,savedAt:new Date().toISOString(),version:2};
    // refboard-data.json 존재 여부 확인
    if(!gdriveDataFileId){
      const f=await driveFindFile(GDRIVE_JSON_NAME);
      if(f) gdriveDataFileId=f.id;
    }
    const res=await driveUploadJson(GDRIVE_JSON_NAME,exportData,gdriveDataFileId||null);
    if(res&&res.id) gdriveDataFileId=res.id;

    updateGdriveStatus('Drive 저장 완료 ✓',true);
    showToast('Google Drive에 저장했어요','success');
  }catch(e){
    console.error(e);
    updateGdriveStatus('저장 실패',false);
    showToast(e.message||'Drive 저장 실패','error');
  }
}

// ─── GOOGLE DRIVE — 불러오기 ───────────────────────────────────────────────
async function loadFromDrive(){
  try{
    requireGdriveToken();
    updateGdriveStatus('불러오는 중...',true);

    // ── refboard-data.json 파일 ID 확보
    if(!gdriveDataFileId){
      const f=await driveFindFile(GDRIVE_JSON_NAME);
      if(!f)throw new Error('Drive에 저장된 데이터가 없어요. 먼저 "Drive 저장"을 해주세요.');
      gdriveDataFileId=f.id;
    }
    const text=await driveDownloadText(gdriveDataFileId);
    const data=JSON.parse(text);

    groups=data.groups||[];
    categories=(data.categories||[]).map(c=>({groupId:null,...c}));

    // ── assets 폴더 파일 목록을 한 번에 가져와서 이름→ID 맵 구성
    // (아이템마다 검색하면 너무 느리므로 일괄 조회)
    let assetFileMap={};  // { 파일명: fileId }
    try{
      const folderRes=await driveFindFile(GDRIVE_FOLDER_NAME);
      if(folderRes){
        gdriveFolderId=folderRes.id;
        let pageToken=null;
        do{
          const params={
            q:`'${gdriveFolderId}' in parents and trashed=false`,
            fields:'nextPageToken,files(id,name)',
            pageSize:1000,
            spaces:'drive'
          };
          if(pageToken)params.pageToken=pageToken;
          const res=await driveRequest('GET','/files',params);
          (res.files||[]).forEach(f=>{ assetFileMap[f.name]=f.id; });
          pageToken=res.nextPageToken||null;
        }while(pageToken);
      }
    }catch(e){ console.warn('assets 폴더 목록 조회 실패',e); }

    // ── 파일명 추출 헬퍼 (assetPath: "assets/파일명.mp4" → "파일명.mp4")
    function assetFilename(assetPath){
      if(!assetPath)return null;
      return assetPath.split('/').pop();
    }

    const loaded=[];
    for(const raw of (data.items||[])){
      const item={...raw};
      item.catIds=item.catIds||[item.catId].filter(Boolean);

      // blob:null/... 또는 null src 처리
      const srcInvalid=!item.src||item.src.startsWith('blob:');

      // ── 방법1: driveAssetId 로 직접 다운로드
      if(item.driveAssetId && srcInvalid){
        try{ item.src=await driveDownloadAsObjectUrl(item.driveAssetId); }
        catch(e){ console.warn('driveAssetId 복원 실패',e); item.src=''; }
      }

      // ── 방법2: assetPath 파일명으로 Drive assets 폴더에서 찾기
      if(srcInvalid && item.assetPath){
        const fname=assetFilename(item.assetPath);
        const fid=fname&&assetFileMap[fname];
        if(fid){
          try{ item.src=await driveDownloadAsObjectUrl(fid); }
          catch(e){ console.warn('assetPath 복원 실패',fname,e); item.src=''; }
        }
      }

      // ── 캐러셀 이미지 복원
      if(Array.isArray(item.images)&&item.images.length){
        const restored=[];
        for(let i=0;i<item.images.length;i++){
          const src=item.images[i];
          const srcOk=src&&!src.startsWith('blob:');
          if(srcOk){ restored.push(src); continue; }
          // driveImageIds 방식
          if(Array.isArray(item.driveImageIds)&&item.driveImageIds[i]){
            try{ restored.push(await driveDownloadAsObjectUrl(item.driveImageIds[i])); continue; }
            catch(e){}
          }
          // carouselAssetPaths 방식 (향후 대비)
          restored.push('');
        }
        item.images=restored;
        if(srcInvalid) item.src=restored.find(s=>s)||'';
      }

      // src가 있거나 assetPath라도 있으면 포함
      if(item.src||item.assetPath) loaded.push(item);
    }

    items=loaded;
    selectedId=null;
    await saveData();
    renderBoard();
    if(currentTab==='ai')refreshAiTab();
    updateGdriveStatus('Drive 불러오기 완료 ✓',true);
    showToast(`Drive 데이터 불러오기 완료 (${loaded.length}개)`,'success');
  }catch(e){
    console.error(e);
    updateGdriveStatus('불러오기 실패',false);
    showToast(e.message||'Drive 불러오기 실패','error');
  }
}

// ─── GOOGLE DRIVE — SETUP 모달 ─────────────────────────────────────────────
function openGdriveSetup(){
  const cur=getGdriveClientId();
  const id=prompt(
    'Google Cloud Console에서 발급한 OAuth 2.0 클라이언트 ID를 입력하세요.\n\n' +
    '발급: console.cloud.google.com → API 및 서비스 → 사용자 인증 정보 → OAuth 2.0 클라이언트 ID\n' +
    '※ 애플리케이션 유형: "웹 애플리케이션"\n' +
    '※ 승인된 JavaScript 원본: 이 앱의 URL (예: https://yourid.github.io)\n' +
    '※ 승인된 리디렉션 URI: 동일 URL\n',
    cur
  );
  if(id===null) return; // 취소
  if(!id.trim()){showToast('Client ID를 입력해주세요','error');return;}
  saveGdriveClientId(id);
  document.getElementById('gdrive-setup-banner').style.display='none';
  showToast('Client ID 저장됨. 이제 "Google 연결"을 눌러주세요','success');
}

// ─── UTILS (이전 USB에서 공용으로 유지) ────────────────────────────────────
function dataUrlToBlob(dataUrl){
  const [meta,data]=dataUrl.split(',');
  const mime=(meta.match(/data:([^;]+)/)||[])[1]||'application/octet-stream';
  const bin=atob(data);const len=bin.length;const arr=new Uint8Array(len);
  for(let i=0;i<len;i++)arr[i]=bin.charCodeAt(i);
  return new Blob([arr],{type:mime});
}
function blobToDataUrl(blob){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=reject;
    reader.readAsDataURL(blob);
  });
}
function extFromMime(mime=''){
  const m=mime.toLowerCase();
  if(m.includes('jpeg'))return 'jpg';if(m.includes('png'))return 'png';
  if(m.includes('gif'))return 'gif';if(m.includes('webp'))return 'webp';
  if(m.includes('svg'))return 'svg';if(m.includes('mp4'))return 'mp4';
  if(m.includes('webm'))return 'webm';if(m.includes('ogg'))return 'ogg';
  if(m.includes('quicktime'))return 'mov';return 'bin';
}
function safeFileBase(name='reference'){
  return String(name||'reference').replace(/[\/:*?"<>|]+/g,'_').replace(/\s+/g,' ').trim()||'reference';
}



// ─── TAB SWITCH ───
function toggleAiPanel(){
  const isOpen=document.getElementById('ai-tab').classList.contains('active');
  switchTab(isOpen?'board':'ai');
}

function switchTab(tab){
  currentTab=tab;
  const isAi = tab==='ai';
  // v27: AI는 오른쪽 접힘 버튼으로 열리는 슬라이드 아코디언 패널입니다.
  // 보드/사이드바/필터는 그대로 유지하고, AI 패널만 우측에서 들어오게 처리합니다.
  document.getElementById('tab-board').classList.toggle('active',!isAi);
  document.getElementById('tab-ai').classList.toggle('active',isAi);
  document.getElementById('board-wrap').style.display='block';
  document.getElementById('ai-tab').classList.toggle('active',isAi);
  document.body.classList.toggle('ai-panel-open',isAi);
  const handle=document.getElementById('ai-side-handle');
  if(handle){
    handle.title=isAi?'AI 분석 패널 닫기':'AI 분석 패널 열기';
    const mark=handle.querySelector('.handle-mark');
    if(mark) mark.textContent=isAi?'›':'‹';
  }
  const detail=document.getElementById('detail-panel');
  if(detail) detail.style.display=(!isAi && selectedId)?'flex':'none';
  const sidebar=document.getElementById('sidebar');
  if(sidebar) sidebar.style.display='flex';
  if(isAi){refreshAiTab();}
}

// ─── VIEW ───
function setView(v){
  currentView=v;
  document.getElementById('board').className=v==='grid'?'grid-view':'list-view';
  document.getElementById('grid-btn').classList.toggle('active',v==='grid');
  document.getElementById('list-btn').classList.toggle('active',v==='list');
}

// ─── FILTER / SORT ───
function setFilter(f,el){
  currentFilter=f;currentCatFilter=null;
  document.querySelectorAll('[data-filter]').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('[data-cat-id]').forEach(b=>b.classList.remove('active'));
  if(el)el.classList.add('active');
  renderBoard();
}
function setCatFilter(catId){
  currentCatFilter=catId;currentFilter='all';
  document.querySelectorAll('[data-filter]').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('[data-cat-id]').forEach(b=>b.classList.remove('active'));
  const btn=document.querySelector(`[data-cat-id="${catId}"]`);
  if(btn)btn.classList.add('active');
  renderBoard();
}
function setSort(s,el){
  currentSort=s;
  document.querySelectorAll('[data-sort]').forEach(b=>b.classList.remove('active'));
  if(el)el.classList.add('active');
  renderBoard();
}
function getFilteredItems(){
  let q=(document.getElementById('search-input').value||'').toLowerCase();
  let res=items.filter(it=>{
    const cats=it.catIds||[];
    if(currentFilter==='image'&&it.type!=='image')return false;
    if(currentFilter==='video'&&it.type!=='video')return false;
    if(currentFilter==='carousel'&&it.type!=='carousel')return false;
    if(currentFilter==='link'&&it.type!=='link')return false;
    if(currentCatFilter&&!cats.includes(currentCatFilter))return false;
    if(q&&!it.title.toLowerCase().includes(q))return false;
    return true;
  });
  if(currentSort==='newest')res.sort((a,b)=>b.ts-a.ts);
  else if(currentSort==='oldest')res.sort((a,b)=>a.ts-b.ts);
  else res.sort((a,b)=>a.title.localeCompare(b.title));
  return res;
}

// ─── CAT SIDEBAR ───
function makeCatRow(cat){
  const cnt=items.filter(i=>(i.catIds||[]).includes(cat.id)).length;
  const row=document.createElement('div');row.className='cat-row';
  const btn=document.createElement('button');
  btn.className='cat-filter-btn'+(currentCatFilter===cat.id?' active':'');
  btn.dataset.catId=cat.id;
  btn.innerHTML=`<span class="dot" style="background:${cat.color}"></span><span class="cat-name">${cat.name}</span><span class="cnt">${cnt}</span>`;
  btn.onclick=()=>setCatFilter(cat.id);
  const editBtn=document.createElement('button');
  editBtn.className='cat-edit-btn';editBtn.textContent='수정';editBtn.title='수정';
  editBtn.onclick=(e)=>{e.stopPropagation();toggleCatEditForm(cat.id,cat);};
  row.appendChild(btn);row.appendChild(editBtn);
  return row;
}
function renderCatList(){
  const list=document.getElementById('cat-list');
  list.innerHTML='';

  // 그룹별로 렌더
  groups.forEach(grp=>{
    const grpCats=categories.filter(c=>c.groupId===grp.id);
    const grpCnt=items.filter(i=>(i.catIds||[]).some(cid=>grpCats.find(c=>c.id===cid))).length;

    const block=document.createElement('div');block.className='group-block';

    // 헤더
    const hdr=document.createElement('div');hdr.className='group-header';
    const toggle=document.createElement('span');toggle.className='group-toggle'+(grp.collapsed?'':' open');toggle.textContent='›';
    const line=document.createElement('span');line.className='group-title-line';line.style.background=grp.color;
    const nameEl=document.createElement('span');nameEl.className='group-name';nameEl.style.color=grp.color;nameEl.textContent=grp.name;
    const cntEl=document.createElement('span');cntEl.className='group-cnt';cntEl.textContent=grpCnt;
    const editBtn=document.createElement('button');editBtn.className='group-edit-btn';editBtn.textContent='수정';editBtn.title='수정';
    editBtn.onclick=(e)=>{e.stopPropagation();toggleGroupEditForm(grp.id,grp);};
    hdr.appendChild(toggle);hdr.appendChild(line);hdr.appendChild(nameEl);hdr.appendChild(cntEl);hdr.appendChild(editBtn);

    // 접기/펼치기
    const children=document.createElement('div');children.className='group-children'+(grp.collapsed?' collapsed':'');
    hdr.onclick=(e)=>{
      if(e.target===editBtn||editBtn.contains(e.target))return;
      grp.collapsed=!grp.collapsed;
      toggle.className='group-toggle'+(grp.collapsed?'':' open');
      children.classList.toggle('collapsed',grp.collapsed);
      scheduleSave();
    };

    grpCats.forEach(cat=>{
      children.appendChild(makeCatRow(cat));
      const slot=document.createElement('div');slot.id='cat-edit-slot-'+cat.id;children.appendChild(slot);
    });

    // 이 그룹에 소분류 추가 버튼
    const addBtn=document.createElement('button');addBtn.className='add-cat-btn';addBtn.style.fontSize='10px';addBtn.style.padding='3px 8px';
    addBtn.textContent='+ 소분류 추가';
    addBtn.onclick=()=>showNewCatFormInGroup(grp.id);
    children.appendChild(addBtn);

    const grpSlot=document.createElement('div');grpSlot.id='group-edit-slot-'+grp.id;

    block.appendChild(hdr);block.appendChild(children);block.appendChild(grpSlot);
    list.appendChild(block);
  });

  // 그룹 없는 카테고리
  const ungrouped=categories.filter(c=>!c.groupId);
  if(ungrouped.length){
    const sec=document.createElement('div');sec.className='ungrouped-section';
    const lbl=document.createElement('div');lbl.style.cssText='font-size:9px;color:var(--t3);padding:4px 8px 2px;font-family:var(--fm);letter-spacing:.08em;';lbl.textContent='미분류';
    sec.appendChild(lbl);
    ungrouped.forEach(cat=>{
      sec.appendChild(makeCatRow(cat));
      const slot=document.createElement('div');slot.id='cat-edit-slot-'+cat.id;sec.appendChild(slot);
    });
    list.appendChild(sec);
  }
}
function toggleCatEditForm(catId,cat){
  if(editingCatId===catId){document.getElementById('cat-edit-slot-'+catId).innerHTML='';editingCatId=null;return;}
  if(editingCatId){const o=document.getElementById('cat-edit-slot-'+editingCatId);if(o)o.innerHTML='';}
  editingCatId=catId;
  const slot=document.getElementById('cat-edit-slot-'+catId);
  let selIdx=CAT_COLORS.indexOf(cat.color);if(selIdx<0)selIdx=0;
  const form=document.createElement('div');form.className='cat-edit-form';
  const groupOpts=groups.map(g=>`<option value="${g.id}"${cat.groupId===g.id?' selected':''}>${g.name}</option>`).join('');
  form.innerHTML=`
    <input id="cedit-name-${catId}" value="${cat.name}" maxlength="24" placeholder="소분류 이름">
    <select id="cedit-group-${catId}" style="background:var(--s3);border:1px solid var(--b3);color:var(--t1);font-family:var(--fn);font-size:12px;padding:6px 9px;border-radius:6px;outline:none;width:100%;">
      <option value=""${!cat.groupId?' selected':''}>그룹 없음 (미분류)</option>
      ${groupOpts}
    </select>
    <div class="color-swatch-row" id="cedit-colors-${catId}"></div>
    <div class="edit-actions">
      <button class="cedit-save" onclick="saveCatEdit('${catId}')">저장</button>
      <button class="cedit-delete" onclick="deleteCat('${catId}')">삭제</button>
      <button class="cedit-cancel" onclick="cancelCatEdit('${catId}')">취소</button>
    </div>`;
  slot.appendChild(form);
  const cr=document.getElementById('cedit-colors-'+catId);
  CAT_COLORS.forEach((c,i)=>{
    const sw=document.createElement('div');sw.className='color-swatch'+(i===selIdx?' selected':'');
    sw.style.background=c;sw.dataset.idx=i;
    sw.onclick=()=>{cr.querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('selected'));sw.classList.add('selected');};
    cr.appendChild(sw);
  });
}
function saveCatEdit(catId){
  const name=document.getElementById('cedit-name-'+catId).value.trim();
  if(!name){showToast('이름을 입력해주세요','error');return;}
  const sel=document.querySelector(`#cedit-colors-${catId} .color-swatch.selected`);
  const color=sel?CAT_COLORS[parseInt(sel.dataset.idx)]:getCat(catId).color;
  const groupId=document.getElementById('cedit-group-'+catId)?document.getElementById('cedit-group-'+catId).value||null:undefined;
  const cat=categories.find(c=>c.id===catId);
  if(cat){cat.name=name;cat.color=color;if(groupId!==undefined)cat.groupId=groupId;}
  editingCatId=null;scheduleSave();renderBoard();showToast('소분류 수정됨','success');
}
function cancelCatEdit(catId){const s=document.getElementById('cat-edit-slot-'+catId);if(s)s.innerHTML='';editingCatId=null;}
function deleteCat(catId){
  if(items.some(i=>(i.catIds||[]).includes(catId))){showToast('이 카테고리를 사용 중인 아이템이 있어요','error');return;}
  categories=categories.filter(c=>c.id!==catId);
  if(currentCatFilter===catId)currentCatFilter=null;
  editingCatId=null;scheduleSave();renderBoard();showToast('카테고리 삭제됨');
}
function showNewCatForm(){
  document.getElementById('new-cat-form').style.display='flex';
  document.getElementById('new-cat-name').focus();
  // 그룹 셀렉트 최신화
  const sel=document.getElementById('new-cat-group');
  sel.innerHTML='<option value="">그룹 없음 (미분류)</option>';
  groups.forEach(g=>{const opt=document.createElement('option');opt.value=g.id;opt.textContent=g.name;sel.appendChild(opt);});
  const cr=document.getElementById('new-cat-colors');cr.innerHTML='';newCatColorIdx=0;
  CAT_COLORS.forEach((col,i)=>{
    const sw=document.createElement('div');sw.className='color-swatch'+(i===0?' selected':'');
    sw.style.background=col;sw.dataset.idx=i;
    sw.onclick=()=>{cr.querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('selected'));sw.classList.add('selected');newCatColorIdx=i;};
    cr.appendChild(sw);
  });
}
function hideNewCatForm(){document.getElementById('new-cat-form').style.display='none';}
function saveNewCat(){
  const name=document.getElementById('new-cat-name').value.trim();
  if(!name){showToast('이름을 입력해주세요','error');return;}
  const groupId=document.getElementById('new-cat-group').value||null;
  const grp=groups.find(g=>g.id===groupId);
  const color=grp?grp.color:CAT_COLORS[newCatColorIdx];
  categories.push({id:'cat'+genId(),name,color,groupId});
  document.getElementById('new-cat-name').value='';hideNewCatForm();
  scheduleSave();renderBoard();showToast('소분류 추가: '+name,'success');
}

// ─── GROUP 관련 ───
let newGroupColorIdx=0;
function showNewGroupForm(){
  document.getElementById('new-group-form').style.display='flex';
  document.getElementById('new-group-name').focus();
  const cr=document.getElementById('new-group-colors');cr.innerHTML='';newGroupColorIdx=0;
  CAT_COLORS.forEach((col,i)=>{
    const sw=document.createElement('div');sw.className='color-swatch'+(i===0?' selected':'');
    sw.style.background=col;sw.dataset.idx=i;
    sw.onclick=()=>{cr.querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('selected'));sw.classList.add('selected');newGroupColorIdx=i;};
    cr.appendChild(sw);
  });
}
function hideNewGroupForm(){document.getElementById('new-group-form').style.display='none';}
function saveNewGroup(){
  const name=document.getElementById('new-group-name').value.trim();
  if(!name){showToast('이름을 입력해주세요','error');return;}
  groups.push({id:'grp'+genId(),name,color:CAT_COLORS[newGroupColorIdx],collapsed:false});
  document.getElementById('new-group-name').value='';hideNewGroupForm();
  scheduleSave();renderBoard();showToast('대분류 추가: '+name,'success');
}
function showNewCatFormInGroup(groupId){
  // 사이드바 소분류 추가 폼 열고 그룹 미리 선택
  showNewCatForm();
  const sel=document.getElementById('new-cat-group');
  if(sel)sel.value=groupId||'';
}
function toggleGroupEditForm(grpId,grp){
  const slot=document.getElementById('group-edit-slot-'+grpId);
  if(!slot)return;
  if(slot.innerHTML){slot.innerHTML='';return;}
  let selIdx=CAT_COLORS.indexOf(grp.color);if(selIdx<0)selIdx=0;
  const form=document.createElement('div');form.className='cat-edit-form';form.style.margin='4px 0';
  form.innerHTML=`
    <input id="gedit-name-${grpId}" value="${grp.name}" maxlength="20" placeholder="대분류 이름">
    <div class="color-swatch-row" id="gedit-colors-${grpId}"></div>
    <div class="edit-actions">
      <button class="cedit-save" onclick="saveGroupEdit('${grpId}')">저장</button>
      <button class="cedit-delete" onclick="deleteGroup('${grpId}')">삭제</button>
      <button class="cedit-cancel" onclick="cancelGroupEdit('${grpId}')">취소</button>
    </div>`;
  slot.appendChild(form);
  const cr=document.getElementById('gedit-colors-'+grpId);
  CAT_COLORS.forEach((col,i)=>{
    const sw=document.createElement('div');sw.className='color-swatch'+(i===selIdx?' selected':'');
    sw.style.background=col;sw.dataset.idx=i;
    sw.onclick=()=>{cr.querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('selected'));sw.classList.add('selected');};
    cr.appendChild(sw);
  });
}
function saveGroupEdit(grpId){
  const name=document.getElementById('gedit-name-'+grpId).value.trim();
  if(!name){showToast('이름을 입력해주세요','error');return;}
  const sel=document.querySelector(`#gedit-colors-${grpId} .color-swatch.selected`);
  const color=sel?CAT_COLORS[parseInt(sel.dataset.idx)]:groups.find(g=>g.id===grpId).color;
  const grp=groups.find(g=>g.id===grpId);
  if(grp){grp.name=name;grp.color=color;
    // 이 그룹의 소분류 색상도 동기화
    categories.filter(c=>c.groupId===grpId).forEach(c=>c.color=color);
  }
  document.getElementById('group-edit-slot-'+grpId).innerHTML='';
  scheduleSave();renderBoard();showToast('대분류 수정됨','success');
}
function cancelGroupEdit(grpId){const s=document.getElementById('group-edit-slot-'+grpId);if(s)s.innerHTML='';}
function deleteGroup(grpId){
  if(categories.some(c=>c.groupId===grpId)){showToast('소분류가 있어 삭제할 수 없어요. 소분류를 먼저 삭제해주세요.','error');return;}
  groups=groups.filter(g=>g.id!==grpId);
  scheduleSave();renderBoard();showToast('대분류 삭제됨');
}

// ─── VIDEO THUMBNAIL ───
function extractVideoThumb(src,callback){
  const video=document.createElement('video');
  video.crossOrigin='anonymous';
  video.muted=true;
  video.preload='metadata';
  video.playsInline=true;
  let done=false;
  function tryCapture(){
    if(done)return;
    if(video.readyState<2||video.videoWidth===0){return;}
    done=true;
    const canvas=document.createElement('canvas');
    canvas.width=320;canvas.height=320;
    const ctx=canvas.getContext('2d');
    const vw=video.videoWidth,vh=video.videoHeight;
    const scale=Math.max(320/vw,320/vh);
    const dw=vw*scale,dh=vh*scale;
    ctx.drawImage(video,-(dw-320)/2,-(dh-320)/2,dw,dh);
    const dataUrl=canvas.toDataURL('image/jpeg',0.7);
    video.src='';
    callback(dataUrl);
  }
  video.addEventListener('seeked',tryCapture);
  video.addEventListener('loadeddata',tryCapture);
  video.addEventListener('canplay',tryCapture);
  video.addEventListener('error',()=>{if(!done){done=true;callback(null);}});
  const timeout=setTimeout(()=>{if(!done){done=true;video.src='';callback(null);}},10000);
  video.addEventListener('seeked',()=>clearTimeout(timeout));
  video.src=src;
  video.load();
  video.addEventListener('loadedmetadata',()=>{
    video.currentTime=Math.min(1,video.duration*0.05||0);
  });
}

// 영상 아이템에 멀티프레임 사전 캡처 (분석 전 준비)
function prepareVideoFrames(item, onDone){
  if(item.frames&&item.frames.length>0){onDone();return;}
  captureVideoFrames(item.src, frames=>{
    if(frames.length){item.frames=frames;if(!item.thumb)item.thumb=frames[0];scheduleSave();}
    onDone();
  });
}
function renderVideoThumbInCard(it,container){
  const playOverlayHTML=`<div class="play-overlay" style="position:absolute;z-index:2;width:38px;height:38px;background:rgba(0,0,0,.55);border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid rgba(255,255,255,.6);top:50%;left:50%;transform:translate(-50%,-50%)"><div style="border-left:12px solid #fff;border-top:7px solid transparent;border-bottom:7px solid transparent;margin-left:3px;"></div></div>`;
  if(it.thumb){
    container.innerHTML=`<img src="${it.thumb}" style="width:100%;height:100%;object-fit:cover;border-radius:0">${playOverlayHTML}`;
  } else {
    // 썸네일 추출 중 — 로딩 표시
    container.innerHTML=`<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:var(--t3);font-size:10px;"><div style="width:24px;height:24px;border:2px solid var(--s4);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite;"></div><span>썸네일 추출 중...</span></div>${playOverlayHTML}`;
    extractVideoThumb(it.src,(dataUrl)=>{
      if(dataUrl){it.thumb=dataUrl;scheduleSave();renderVideoThumbInCard(it,container);}
      else{container.innerHTML=`<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--t3);font-size:10px;">미리보기 없음</div>${playOverlayHTML}`;}
    });
  }
}

// ─── BOARD RENDER ───
let _lastCatHash='';
function renderBoard(){
  document.getElementById('count-label').textContent=items.length+'개';
  document.getElementById('cnt-all').textContent=items.length;
  document.getElementById('cnt-image').textContent=items.filter(i=>i.type==='image').length;
  document.getElementById('cnt-video').textContent=items.filter(i=>i.type==='video').length;
  const carouselCnt=document.getElementById('cnt-carousel');if(carouselCnt)carouselCnt.textContent=items.filter(i=>i.type==='carousel').length;
  const linkCnt=document.getElementById('cnt-link');if(linkCnt)linkCnt.textContent=items.filter(i=>i.type==='link').length;
  // 카테고리 변경 시에만 사이드바 재렌더
  const catHash=JSON.stringify(categories)+JSON.stringify(groups)+currentCatFilter+currentFilter;
  if(catHash!==_lastCatHash){renderCatList();_lastCatHash=catHash;}

  const board=document.getElementById('board');
  board.querySelectorAll('.ref-card').forEach(e=>e.remove());
  const filtered=getFilteredItems();
  document.getElementById('empty-state').style.display=filtered.length===0&&items.length>0?'block':'none';

  const frag=document.createDocumentFragment();
  filtered.forEach(it=>{
    const catIds=it.catIds||[];
    const card=document.createElement('div');
    card.className='ref-card'+(selectedId===it.id?' selected':'');
    card.onclick=(e)=>{if(!e.target.classList.contains('card-delete'))openDetail(it.id);};

    const del=document.createElement('button');del.className='card-delete';del.textContent='×';
    del.onclick=(e)=>{e.stopPropagation();deleteItem(it.id);};

    let media;
    if(it.type==='image'){
      media=document.createElement('img');media.className='card-media';
      media.loading='lazy';
      media.src=it.src;media.alt=it.title;
    } else if(it.type==='carousel'){
      // 캐러셀 슬라이더
      media=document.createElement('div');media.className='card-media carousel-thumb';
      media.style.cssText='position:relative;overflow:hidden;background:var(--s3);cursor:pointer;';
      const imgs=it.images||[];
      let cidx=0;
      function renderCarouselThumb(){
        const src=imgs[cidx]||'';
        media.innerHTML='';
        const img=document.createElement('img');
        img.src=src;img.style.cssText='width:100%;height:100%;object-fit:cover;display:block;';
        media.appendChild(img);
        // 인디케이터 (도트)
        if(imgs.length>1){
          const dots=document.createElement('div');
          dots.style.cssText='position:absolute;bottom:6px;left:0;right:0;display:flex;justify-content:center;gap:4px;pointer-events:none;';
          imgs.forEach((_,di)=>{
            const d=document.createElement('div');
            d.style.cssText=`width:5px;height:5px;border-radius:50%;background:${di===cidx?'#fff':'rgba(255,255,255,0.4)'};transition:background .2s;`;
            dots.appendChild(d);
          });
          media.appendChild(dots);
          // 좌우 화살표
          const prev=document.createElement('button');
          prev.innerHTML='‹';prev.style.cssText='position:absolute;left:4px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.5);border:none;color:#fff;font-size:16px;line-height:1;padding:2px 7px;border-radius:6px;cursor:pointer;z-index:5;';
          prev.onclick=ev=>{ev.stopPropagation();cidx=(cidx-1+imgs.length)%imgs.length;renderCarouselThumb();};
          const next=document.createElement('button');
          next.innerHTML='›';next.style.cssText='position:absolute;right:4px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.5);border:none;color:#fff;font-size:16px;line-height:1;padding:2px 7px;border-radius:6px;cursor:pointer;z-index:5;';
          next.onclick=ev=>{ev.stopPropagation();cidx=(cidx+1)%imgs.length;renderCarouselThumb();};
          media.appendChild(prev);media.appendChild(next);
        }
        // 장수 뱃지
        const countBadge=document.createElement('div');
        countBadge.style.cssText='position:absolute;top:6px;left:6px;background:rgba(0,0,0,0.55);color:#fff;font-size:9px;font-weight:600;padding:2px 7px;border-radius:10px;backdrop-filter:blur(8px);pointer-events:none;';
        countBadge.textContent=`${cidx+1}/${imgs.length}`;
        media.appendChild(countBadge);
      }
      renderCarouselThumb();
    } else if(it.type==='link'){
      media=document.createElement('div');media.className='card-media';
      media.style.cssText='display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:var(--s3);';
      let host='';try{host=new URL(it.src).hostname.replace(/^www\./,'');}catch(e){host=it.src.substring(0,30);}
      const faviconUrl='https://www.google.com/s2/favicons?domain='+encodeURIComponent(it.src)+'&sz=64';
      media.innerHTML=`<img src="${faviconUrl}" style="width:40px;height:40px;border-radius:10px;object-fit:contain;" onerror="this.style.display='none'">`+
        `<span style="font-size:11px;color:rgba(235,235,245,0.5);font-weight:500;max-width:90%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${host}</span>`;
    } else {
      media=document.createElement('div');media.className='card-video-thumb';
      renderVideoThumbInCard(it,media);
    }

    const badge=document.createElement('div');badge.className='card-type-badge';
    badge.textContent=it.type==='image'?'이미지':it.type==='link'?'링크':it.type==='carousel'?'캐러셀':'영상';
    if(it.aiAnalyzed){const ab=document.createElement('div');ab.className='card-ai-badge';ab.textContent='✦ AI';card.appendChild(ab);}

    const info=document.createElement('div');info.className='card-info';
    const titleEl=document.createElement('div');titleEl.className='card-title';titleEl.textContent=it.title;
    const catsEl=document.createElement('div');catsEl.className='card-cats';
    catIds.forEach(cid=>{
      const cat=getCat(cid);
      const tag=document.createElement('span');tag.className='card-cat-tag';
      tag.style.cssText=`background:${cat.color}25;color:${cat.color};border:1px solid ${cat.color}50`;
      tag.textContent=cat.name;catsEl.appendChild(tag);
    });
    if(it.caption&&it.caption.trim()){
      const capTag=document.createElement('span');capTag.className='card-cat-tag';
      capTag.style.cssText='background:rgba(191,90,242,0.12);color:var(--accent3);border:1px solid rgba(191,90,242,0.3);font-size:8px;';
      capTag.textContent='본문있음';catsEl.appendChild(capTag);
    }
    const metaEl=document.createElement('div');metaEl.className='card-meta-line';
    if(it.brand){const m=document.createElement('span');m.className='card-meta-chip';m.textContent=it.brand;metaEl.appendChild(m);}
    if(it.platform){const m=document.createElement('span');m.className='card-meta-chip';m.textContent=it.platform;metaEl.appendChild(m);}
    if(it.hook){const m=document.createElement('span');m.className='card-meta-chip';m.textContent='⚡ '+it.hook;metaEl.appendChild(m);}
    const dateEl=document.createElement('div');dateEl.className='card-date';dateEl.textContent=fmtDate(it.ts);
    info.appendChild(titleEl);info.appendChild(catsEl);if(metaEl.children.length)info.appendChild(metaEl);info.appendChild(dateEl);
    card.appendChild(del);card.appendChild(media);card.appendChild(badge);card.appendChild(info);
    frag.appendChild(card);
  });
  board.appendChild(frag);
}

// ─── ITEMS ───
function addItem(src,type,title,catIds,notes='',ts=Date.now(),caption='',meta={}){
  const fallbackCat=categories.length?categories[0].id:'';
  const ids=Array.isArray(catIds)?catIds.filter(Boolean):[catIds||fallbackCat].filter(Boolean);
  const item={id:genId(),src,type,title,catIds:ids,notes,caption,ts,aiAnalyzed:false,aiResult:'',assetPath:null,...meta};
  items.push(item);
  if(type==='video'){extractVideoThumb(src,(dataUrl)=>{if(dataUrl){item.thumb=dataUrl;scheduleSave();renderBoard();}});}
  scheduleSave();renderBoard();
}
function deleteItem(id){
  items=items.filter(i=>i.id!==id);
  if(selectedId===id){selectedId=null;closeDetail();}
  scheduleSave();renderBoard();showToast('삭제됐어요');
}

// ─── CAROUSEL HELPERS ───
function addCarouselItem(images,title,catIds,notes,caption,meta={}){
  const fallbackCat=categories.length?categories[0].id:'';
  const ids=Array.isArray(catIds)?catIds.filter(Boolean):[catIds||fallbackCat].filter(Boolean);
  // src는 첫 번째 이미지로 (호환성 유지)
  const item={id:genId(),src:images[0]||'',type:'carousel',images,title,catIds:ids,notes,caption,ts:Date.now(),aiAnalyzed:false,aiResult:'',assetPath:null,...meta};
  items.push(item);
  scheduleSave();renderBoard();
}
function downloadCarouselAll(id){
  const it=items.find(i=>i.id===id);if(!it||!it.images)return;
  it.images.forEach((src,i)=>{
    const link=document.createElement('a');
    link.href=src;
    const safe=(it.title||'carousel').replace(/[\\/:*?"<>|]+/g,'_').trim();
    link.download=`${safe}_${i+1}.png`;
    link.target='_blank';link.rel='noopener';
    document.body.appendChild(link);link.click();document.body.removeChild(link);
  });
  showToast(`${it.images.length}장 다운로드 시작됨`,'success');
}
function handleFileInput(e){Array.from(e.target.files).forEach(f=>processFile(f));e.target.value='';}
function processFile(file,title,catIds,notes,caption,meta={}){
  const type=file.type.startsWith('video')?'video':'image';
  const reader=new FileReader();
  reader.onload=ev=>{
    const t=title||file.name.replace(/\.[^.]+$/,'');
    addItem(ev.target.result,type,t,catIds||[categories[0].id],notes||'',Date.now(),caption||'',meta);
    showToast(t+' 추가됨','success');
  };
  reader.readAsDataURL(file);
}
function handleModalFile(e){
  pendingFile=e.target.files[0];
  if(pendingFile)document.getElementById('modal-file-name').textContent='✓ '+pendingFile.name;
}

// ─── MODAL CAT CHIPS ───
function renderModalCatChips(){
  const wrap=document.getElementById('modal-cat-options');
  wrap.innerHTML='';
  categories.forEach(cat=>{
    const chip=document.createElement('div');chip.className='mcat-chip';
    if(modalSelectedCats.includes(cat.id)){chip.classList.add('selected');chip.style.background=cat.color+'44';chip.style.borderColor=cat.color;chip.style.color='#fff';}
    chip.textContent=cat.name;
    chip.onclick=()=>{
      if(modalSelectedCats.includes(cat.id)){modalSelectedCats=modalSelectedCats.filter(id=>id!==cat.id);chip.classList.remove('selected');chip.style.background='';chip.style.borderColor='';chip.style.color='';}
      else{modalSelectedCats.push(cat.id);chip.classList.add('selected');chip.style.background=cat.color+'44';chip.style.borderColor=cat.color;chip.style.color='#fff';}
    };
    wrap.appendChild(chip);
  });
}

// ─── MODAL ───
let _modalTab='single';
let _carouselFiles=[]; // {dataUrl, name}[]

function switchModalTab(tab){
  _modalTab=tab;
  const single=document.getElementById('modal-single-section');
  const carousel=document.getElementById('modal-carousel-section');
  const tabSingle=document.getElementById('modal-tab-single');
  const tabCarousel=document.getElementById('modal-tab-carousel');
  if(tab==='single'){
    single.style.display='';carousel.style.display='none';
    tabSingle.style.background='var(--accent)';tabSingle.style.color='#fff';
    tabCarousel.style.background='none';tabCarousel.style.color='rgba(235,235,245,0.5)';
  } else {
    single.style.display='none';carousel.style.display='';
    tabCarousel.style.background='var(--orange)';tabCarousel.style.color='#fff';
    tabSingle.style.background='none';tabSingle.style.color='rgba(235,235,245,0.5)';
  }
}

function handleCarouselFiles(e){
  const files=Array.from(e.target.files);
  if(!files.length)return;
  const readers=[];
  files.forEach(file=>{
    readers.push(new Promise(res=>{
      const r=new FileReader();
      r.onload=ev=>res({dataUrl:ev.target.result,name:file.name});
      r.readAsDataURL(file);
    }));
  });
  Promise.all(readers).then(results=>{
    _carouselFiles=[..._carouselFiles,...results];
    renderCarouselPreview();
  });
  e.target.value='';
}

function renderCarouselPreview(){
  const list=document.getElementById('carousel-preview-list');
  const label=document.getElementById('carousel-count-label');
  if(!list)return;
  list.innerHTML='';
  _carouselFiles.forEach((f,i)=>{
    const wrap=document.createElement('div');wrap.style.cssText='position:relative;width:70px;height:70px;flex-shrink:0;';
    const img=document.createElement('img');img.src=f.dataUrl;img.style.cssText='width:70px;height:70px;object-fit:cover;border-radius:8px;border:1px solid var(--glass-border);';
    const del=document.createElement('button');
    del.textContent='×';del.style.cssText='position:absolute;top:-6px;right:-6px;width:18px;height:18px;background:var(--red);border:none;color:#fff;border-radius:50%;font-size:11px;font-weight:700;cursor:pointer;line-height:1;padding:0;display:flex;align-items:center;justify-content:center;';
    del.onclick=()=>{_carouselFiles.splice(i,1);renderCarouselPreview();};
    // 순서 번호
    const num=document.createElement('div');num.textContent=i+1;num.style.cssText='position:absolute;bottom:3px;left:3px;background:rgba(0,0,0,0.6);color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;';
    wrap.appendChild(img);wrap.appendChild(del);wrap.appendChild(num);
    list.appendChild(wrap);
  });
  if(label)label.textContent=_carouselFiles.length>0?`${_carouselFiles.length}장 선택됨`:'';
}
function openAddModal(){
  modalSelectedCats=[categories[0]?categories[0].id:''];
  _carouselFiles=[];
  _modalTab='single';
  switchModalTab('single');
  document.getElementById('add-modal').classList.add('open');
  document.getElementById('add-title').value='';
  document.getElementById('add-url').value='';
  document.getElementById('add-notes').value='';
  document.getElementById('add-caption').value='';
  ['add-brand','add-source-url','add-hook','add-cta','add-visual-notes','add-content-notes'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const ap=document.getElementById('add-platform');if(ap)ap.value='instagram';
  const ast=document.getElementById('add-source-type');if(ast)ast.value='snippit';
  document.getElementById('modal-file-name').textContent='';
  const cprev=document.getElementById('carousel-preview-list');if(cprev)cprev.innerHTML='';
  const clabel=document.getElementById('carousel-count-label');if(clabel)clabel.textContent='';
  pendingFile=null;renderModalCatChips();
}
function closeModal(id){document.getElementById(id).classList.remove('open');pendingFile=null;}
function addFromUrl(){
  const url=document.getElementById('add-url').value.trim();if(!url)return;
  const ext=url.split('?')[0].split('.').pop().toLowerCase();
  let type='image';
  if(['mp4','webm','ogg','mov'].includes(ext))type='video';
  else if(!['jpg','jpeg','png','gif','webp','svg','avif','bmp'].includes(ext)){
    // 웹사이트 URL — 링크 타입으로 저장
    type='link';
  }
  const title=document.getElementById('add-title').value.trim()||(() => {
    try{return new URL(url).hostname.replace(/^www\./,'');}catch(e){return url.split('/').pop().replace(/\?.*$/,'')||'제목없음';}
  })();
  const notes=document.getElementById('add-notes').value.trim();
  const caption=document.getElementById('add-caption').value.trim();
  const meta=collectModalMeta();
  if(!meta.sourceUrl)meta.sourceUrl=url;
  addItem(url,type,title,modalSelectedCats.length?modalSelectedCats:[categories[0].id],notes,Date.now(),caption,meta);
  closeModal('add-modal');showToast('URL 추가됨','success');
}
function saveFromModal(){
  const title=document.getElementById('add-title').value.trim();
  const notes=document.getElementById('add-notes').value.trim();
  const caption=document.getElementById('add-caption').value.trim();
  const meta=collectModalMeta();
  const cats=modalSelectedCats.length?modalSelectedCats:[categories[0].id];
  if(_modalTab==='carousel'){
    if(_carouselFiles.length<2){showToast('캐러셀은 이미지를 2장 이상 선택해주세요','error');return;}
    const t=title||'캐러셀 '+new Date().toLocaleTimeString();
    addCarouselItem(_carouselFiles.map(f=>f.dataUrl),t,cats,notes,caption,meta);
    closeModal('add-modal');showToast('캐러셀 추가됨 ('+_carouselFiles.length+'장)','success');
  } else {
    if(pendingFile){processFile(pendingFile,title,cats,notes,caption,meta);closeModal('add-modal');}
    else{const url=document.getElementById('add-url').value.trim();if(url)addFromUrl();else showToast('파일 또는 URL을 입력해주세요','error');}
  }
}

// ─── DRAG DROP PASTE ───
function onDragOver(e){e.preventDefault();document.getElementById('drop-zone').classList.add('dragover');}
function onDragLeave(){document.getElementById('drop-zone').classList.remove('dragover');}
function onDrop(e){
  e.preventDefault();document.getElementById('drop-zone').classList.remove('dragover');
  Array.from(e.dataTransfer.files).forEach(f=>processFile(f));
  const url=e.dataTransfer.getData('text/uri-list')||e.dataTransfer.getData('text/plain');
  if(url&&url.startsWith('http')&&e.dataTransfer.files.length===0){
    const ext=url.split('?')[0].split('.').pop().toLowerCase();
    let type='image';
    if(['mp4','webm','mov'].some(x=>url.includes('.'+x)))type='video';
    else if(!['jpg','jpeg','png','gif','webp','svg','avif'].includes(ext))type='link';
    let title=url.split('/').pop()||'드롭됨';
    try{const u=new URL(url);if(type==='link')title=u.hostname.replace(/^www\./,'');}catch(e){}
    addItem(url,type,title,[categories[0]?.id||''],'');showToast('드롭 추가됨','success');
  }
}

// 드롭존 클릭 — 버튼 클릭은 파일선택 안 열리게
function dzClick(e){
  if(e.target.id==='paste-btn'||e.target.closest('#paste-btn'))return;
  document.getElementById('file-input').click();
}

// 드롭존 자체에 포커스된 상태에서 Ctrl+V 붙여넣기
function onDzPaste(e){
  e.preventDefault();
  handlePasteData(e.clipboardData);
}

// 클립보드 API 버튼 (NAS/HTTP 환경 대응)
async function tryClipboardPaste(e){
  e.stopPropagation();
  // 방법1: Clipboard API (HTTPS 또는 권한 허용된 경우)
  if(navigator.clipboard&&navigator.clipboard.read){
    try{
      const items=await navigator.clipboard.read();
      let found=false;
      for(const ci of items){
        for(const type of ci.types){
          if(type.startsWith('image/')){
            const blob=await ci.getType(type);
            const file=new File([blob],'붙여넣기_'+new Date().toLocaleTimeString()+'.png',{type});
            processFile(file,'붙여넣기 '+new Date().toLocaleTimeString(),[categories[0]?.id||'']);
            showToast('클립보드 이미지 추가됨','success');
            found=true;break;
          }
        }
        if(found)break;
      }
      if(!found)showToast('클립보드에 이미지가 없어요','error');
      return;
    }catch(err){
      console.warn('Clipboard API 실패, hidden paste proxy 방식으로 폴백',err);
    }
  }
  // 방법2: NAS/HTTP 환경 — 숨겨진 contenteditable에 포커스 후 Ctrl+V 유도
  // hidden paste proxy가 붙여넣기 이벤트를 가로채서 처리
  const proxy=document.getElementById('paste-proxy');
  if(proxy){
    proxy.focus();
    showToast('Ctrl+V 를 눌러주세요 (붙여넣기 대기 중...)', '');
  }
}

// 공통 paste 데이터 처리
function handlePasteData(clipboardData){
  if(!clipboardData)return false;
  const its=clipboardData.items;
  let handled=false;
  for(const item of its){
    if(item.type.startsWith('image/')){
      const f=item.getAsFile();
      if(f){processFile(f,'붙여넣기 '+new Date().toLocaleTimeString(),[categories[0]?.id||'']);handled=true;}
    }
  }
  if(!handled){
    const text=(clipboardData.getData('text/plain')||'').trim();
    if(text&&(text.startsWith('http')||text.startsWith('https'))){
      const ext=text.split('?')[0].split('.').pop().toLowerCase();
      let type='image';
      if(['mp4','webm','mov','ogg'].some(x=>text.includes('.'+x)))type='video';
      else if(!['jpg','jpeg','png','gif','webp','svg','avif','bmp'].includes(ext))type='link';
      let title=text.split('/').pop()||'붙여넣기';
      try{const u=new URL(text);if(type==='link')title=u.hostname.replace(/^www\./,'');}catch(e){}
      addItem(text,type,title,[categories[0]?.id||''],'');
      showToast(type==='link'?'웹사이트 URL 추가됨':'URL 붙여넣기됨','success');
      handled=true;
    }
  }
  return handled;
}

document.addEventListener('paste',e=>{
  // 텍스트 입력 중에는 기본 붙여넣기 동작 유지
  const tag=(document.activeElement||{}).tagName||'';
  const isInput=tag==='INPUT'||tag==='TEXTAREA'||(document.activeElement||{}).isContentEditable;
  // paste-proxy는 우리가 제어하는 contenteditable이므로 통과
  if(isInput && document.activeElement?.id !== 'paste-proxy') return;
  e.preventDefault();
  // paste-proxy에 잘못 삽입된 텍스트/노드 정리
  const proxy=document.getElementById('paste-proxy');
  if(proxy) setTimeout(()=>{proxy.innerHTML='';},0);
  handlePasteData(e.clipboardData);
});

// ─── DETAIL PANEL ───
function escapeHtml(str=''){
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
function getDownloadFilename(it){
  const raw=(it.title||'reference').trim()||'reference';
  const safe=raw.replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,' ').trim();
  if(it.type==='video')return safe+'.mp4';
  if(it.src.startsWith('data:')){
    const mt=it.src.split(';')[0].split(':')[1]||'';
    const ext=(mt.split('/')[1]||'png').replace('jpeg','jpg');
    return safe+'.'+ext;
  }
  const clean=it.src.split('?')[0].split('#')[0];
  const ext=(clean.split('.').pop()||'png').toLowerCase();
  return /^(png|jpg|jpeg|gif|webp|svg)$/i.test(ext)?safe+'.'+ext.replace('jpeg','jpg'):safe+'.png';
}
function saveDetailTitle(id){
  const it=items.find(i=>i.id===id);if(!it)return;
  const input=document.getElementById('detail-title-input');if(!input)return;
  const nextTitle=input.value.trim();
  if(!nextTitle){showToast('제목을 입력해주세요','error');input.focus();return;}
  it.title=nextTitle;
  scheduleSave();
  openDetail(id);
  renderBoard();
  showToast('제목이 수정됐어요','success');
}
function saveDetailCaption(id){
  const it=items.find(i=>i.id===id);if(!it)return;
  const input=document.getElementById('detail-caption-input');if(!input)return;
  it.caption=input.value.trim();
  scheduleSave();
  showToast('본문이 저장됐어요 ✓','success');
}
function saveDetailMeta(id){
  const it=items.find(i=>i.id===id);if(!it)return;
  const map={brand:'detail-brand-input',platform:'detail-platform-input',sourceUrl:'detail-source-url-input',hook:'detail-hook-input',cta:'detail-cta-input',sourceType:'detail-source-type-input',visualNotes:'detail-visual-notes-input',contentNotes:'detail-content-notes-input'};
  Object.entries(map).forEach(([k,elId])=>{const el=document.getElementById(elId);if(el)it[k]=el.value.trim();});
  scheduleSave();renderBoard();showToast('세부 분석값 저장됨','success');
}
function handleDetailTitleKeydown(e,id){
  if(e.key==='Enter')saveDetailTitle(id);
}
function downloadReference(id){
  const it=items.find(i=>i.id===id);if(!it)return;
  const link=document.createElement('a');
  link.href=it.src;
  link.download=getDownloadFilename(it);
  link.target='_blank';
  link.rel='noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast((it.type==='image'?'이미지':'파일')+' 다운로드를 시작했어요','success');
}
function openDetail(id){
  selectedId=id;
  const it=items.find(i=>i.id===id);if(!it)return;
  if(currentTab!=='board')return;
  document.getElementById('detail-panel').style.display='flex';
  const media=document.getElementById('detail-media');
  if(it.type==='image')media.innerHTML=`<img src="${it.src}" alt="${escapeHtml(it.title)}">`;
  else if(it.type==='carousel'){
    // 캐러셀 상세 뷰어
    const imgs=it.images||[];let cidx=0;
    function renderDetailCarousel(){
      media.innerHTML='';
      const wrap=document.createElement('div');wrap.style.cssText='position:relative;background:var(--s3);border-radius:10px;overflow:hidden;';
      const img=document.createElement('img');img.src=imgs[cidx]||'';img.style.cssText='width:100%;max-height:200px;object-fit:contain;display:block;';
      wrap.appendChild(img);
      if(imgs.length>1){
        const prev=document.createElement('button');prev.innerHTML='‹';prev.style.cssText='position:absolute;left:4px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.55);border:none;color:#fff;font-size:20px;line-height:1;padding:2px 8px;border-radius:7px;cursor:pointer;';
        prev.onclick=()=>{cidx=(cidx-1+imgs.length)%imgs.length;renderDetailCarousel();};
        const next=document.createElement('button');next.innerHTML='›';next.style.cssText='position:absolute;right:4px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.55);border:none;color:#fff;font-size:20px;line-height:1;padding:2px 8px;border-radius:7px;cursor:pointer;';
        next.onclick=()=>{cidx=(cidx+1)%imgs.length;renderDetailCarousel();};
        const cnt=document.createElement('div');cnt.style.cssText='position:absolute;bottom:6px;left:0;right:0;text-align:center;font-size:10px;color:#fff;font-weight:600;text-shadow:0 1px 4px rgba(0,0,0,0.7);';
        cnt.textContent=`${cidx+1} / ${imgs.length}`;
        wrap.appendChild(prev);wrap.appendChild(next);wrap.appendChild(cnt);
      }
      media.appendChild(wrap);
      // 썸네일 스트립
      if(imgs.length>1){
        const strip=document.createElement('div');strip.style.cssText='display:flex;gap:4px;margin-top:6px;overflow-x:auto;padding:2px 0;';
        imgs.forEach((src,i)=>{
          const t=document.createElement('img');t.src=src;
          t.style.cssText=`width:44px;height:44px;object-fit:cover;border-radius:6px;cursor:pointer;flex-shrink:0;border:2px solid ${i===cidx?'var(--accent)':'transparent'};transition:border .15s;`;
          t.onclick=()=>{cidx=i;renderDetailCarousel();};
          strip.appendChild(t);
        });
        media.appendChild(strip);
      }
    }
    renderDetailCarousel();
  }
  else if(it.type==='link'){
    let host='';try{host=new URL(it.src).hostname.replace(/^www\./,'');}catch(e){host=it.src.substring(0,40);}
    const faviconUrl='https://www.google.com/s2/favicons?domain='+encodeURIComponent(it.src)+'&sz=64';
    media.innerHTML=`<div style="background:var(--s3);border-radius:10px;padding:24px;display:flex;flex-direction:column;align-items:center;gap:10px;"><img src="${faviconUrl}" style="width:48px;height:48px;border-radius:12px;object-fit:contain;" onerror="this.style.display='none'"><div style="font-size:13px;font-weight:600;color:var(--t1);">${host}</div><a href="${escapeHtml(it.src)}" target="_blank" rel="noopener" style="font-size:11px;color:var(--accent);word-break:break-all;text-decoration:none;opacity:.8;">${escapeHtml(it.src.substring(0,60))}${it.src.length>60?'…':''}</a></div>`;
  }
  else media.innerHTML=`<video src="${it.src}" controls style="width:100%;border-radius:10px;max-height:180px;"></video>`;

  // cat multi picker
  const catOpts=document.getElementById('detail-cat-options');
  catOpts.innerHTML='';
  const chipWrap=document.createElement('div');chipWrap.style.cssText='display:flex;flex-wrap:wrap;gap:5px;';
  categories.forEach(cat=>{
    const chip=document.createElement('div');chip.className='cat-option-chip';
    const sel=(it.catIds||[]).includes(cat.id);
    if(sel){chip.classList.add('selected');chip.style.background=cat.color+'44';chip.style.borderColor=cat.color;chip.style.color='#fff';}
    chip.textContent=cat.name;
    chip.onclick=()=>{
      const idx=(it.catIds||[]).indexOf(cat.id);
      if(idx>-1){it.catIds.splice(idx,1);chip.classList.remove('selected');chip.style.background='';chip.style.borderColor='';chip.style.color='';}
      else{if(!it.catIds)it.catIds=[];it.catIds.push(cat.id);chip.classList.add('selected');chip.style.background=cat.color+'44';chip.style.borderColor=cat.color;chip.style.color='#fff';}
      scheduleSave();renderBoard();
    };
    chipWrap.appendChild(chip);
  });
  catOpts.appendChild(chipWrap);

  document.getElementById('detail-fields').innerHTML=`
    <div class="detail-field">
      <div class="detail-key">제목</div>
      <input id="detail-title-input" class="detail-input" value="${escapeHtml(it.title)}" maxlength="120" onkeydown="handleDetailTitleKeydown(event,'${it.id}')">
      <div class="detail-actions" style="margin-top:8px;">
        <button class="detail-btn primary" onclick="saveDetailTitle('${it.id}')">제목 저장</button>
        ${it.type==='image'?`<button class="detail-btn" onclick="downloadReference('${it.id}')">이미지 다운로드</button>`:''}
        ${it.type==='carousel'?`<button class="detail-btn" onclick="downloadCarouselAll('${it.id}')">전체 다운로드 (${(it.images||[]).length}장)</button>`:''}
        ${it.type==='link'?`<button class="detail-btn" onclick="window.open('${escapeHtml(it.src)}','_blank','noopener')">웹사이트 열기 ↗</button>`:''}
      </div>
      <div class="detail-helper">상세 패널에서 제목을 바로 수정할 수 있어요.</div>
    </div>
    <div class="detail-field" style="margin-top:12px;">
      <div class="detail-key" style="display:flex;align-items:center;gap:6px;">
        📝 본문 / 캡션
        <span style="font-size:9px;background:rgba(191,90,242,0.2);color:var(--accent3);padding:1px 6px;border-radius:4px;font-weight:600;">AI 분석 포함</span>
      </div>
      <textarea id="detail-caption-input" class="detail-input" rows="4" style="margin-top:5px;resize:vertical;" placeholder="광고 카피, 인스타 본문, 해시태그, 후킹 문구 등을 입력하면 AI 분석에 활용됩니다...">${escapeHtml(it.caption||'')}</textarea>
      <button class="detail-btn primary" style="margin-top:6px;width:100%" onclick="saveDetailCaption('${it.id}')">본문 저장</button>
    </div>

    <div class="detail-field" style="margin-top:12px;">
      <div class="detail-key">세부 분석 입력값</div>
      <div class="detail-subgrid">
        <input id="detail-brand-input" class="detail-input detail-mini-input" placeholder="브랜드" value="${escapeHtml(it.brand||'')}">
        <input id="detail-platform-input" class="detail-input detail-mini-input" placeholder="플랫폼" value="${escapeHtml(it.platform||'')}">
        <input id="detail-source-url-input" class="detail-input detail-mini-input" placeholder="원본 링크" value="${escapeHtml(it.sourceUrl||'')}">
        <input id="detail-hook-input" class="detail-input detail-mini-input" placeholder="첫 훅 / 헤드라인" value="${escapeHtml(it.hook||'')}">
        <input id="detail-cta-input" class="detail-input detail-mini-input" placeholder="CTA" value="${escapeHtml(it.cta||'')}">
        <input id="detail-source-type-input" class="detail-input detail-mini-input" placeholder="수집경로" value="${escapeHtml(it.sourceType||'')}">
      </div>
      <textarea id="detail-visual-notes-input" class="detail-input" rows="3" style="margin-top:7px;resize:vertical;" placeholder="비주얼 분석 메모">${escapeHtml(it.visualNotes||'')}</textarea>
      <textarea id="detail-content-notes-input" class="detail-input" rows="3" style="margin-top:7px;resize:vertical;" placeholder="콘텐츠 전략 메모">${escapeHtml(it.contentNotes||'')}</textarea>
      <button class="detail-btn primary" style="margin-top:6px;width:100%" onclick="saveDetailMeta('${it.id}')">세부 분석값 저장</button>
    </div>

    <div class="detail-field" style="margin-top:9px"><div class="detail-key">타입</div><div class="detail-val">${it.type==='image'?'이미지':it.type==='link'?'웹사이트 링크':'영상'}</div></div>
    <div class="detail-field" style="margin-top:9px"><div class="detail-key">날짜</div><div class="detail-val">${fmtDate(it.ts)}</div></div>
    ${it.notes?`<div class="detail-field" style="margin-top:9px"><div class="detail-key">메모</div><div class="detail-val">${escapeHtml(it.notes)}</div></div>`:''}
    ${it.aiResult?`<div class="detail-field" style="margin-top:9px"><div class="detail-key">AI 분석</div><div class="detail-val" style="background:var(--s2);border-radius:7px;padding:8px;font-size:11px;color:var(--t2);line-height:1.8;white-space:pre-wrap;">${escapeHtml(it.aiResult)}</div></div>`:''}
  `;
  renderBoard();
}
function closeDetail(){selectedId=null;document.getElementById('detail-panel').style.display='none';renderBoard();}

// ─── AI PROVIDER ───
function onProviderChange(){
  const provider=document.getElementById('ai-provider').value;
  document.getElementById('ai-apikey-input').value=getApiKey(provider)||'';
  document.getElementById('api-key-hint').textContent=PROVIDER_HINTS[provider]||'';
  const saved=!!getApiKey(provider);
  const status=document.getElementById('api-key-status');
  status.style.display=saved?'block':'none';
}
function saveApiKey(){
  const provider=document.getElementById('ai-provider').value;
  const key=document.getElementById('ai-apikey-input').value.trim();
  if(!key){showToast('API 키를 입력해주세요','error');return;}
  localStorage.setItem('refboard_key_'+provider,key);
  document.getElementById('api-key-status').style.display='block';
  showToast(provider+' API 키 저장됨','success');
}


function getAiFilteredItems(){
  return items.filter(it=>{
    const ids=it.catIds||[];
    if(aiGroupFilter){
      const hasGroup=ids.some(cid=>{
        const cat=categories.find(c=>c.id===cid);
        return cat && cat.groupId===aiGroupFilter;
      });
      if(!hasGroup)return false;
    }
    if(aiCatFilter && !ids.includes(aiCatFilter))return false;
    return true;
  });
}

function populateAiFilterControls(){
  const groupSel=document.getElementById('ai-group-filter');
  const catSel=document.getElementById('ai-cat-filter');
  if(!groupSel || !catSel)return;

  groupSel.innerHTML='<option value="">전체 대분류</option>';
  groups.forEach(grp=>{
    const opt=document.createElement('option');
    opt.value=grp.id;
    opt.textContent=grp.name;
    if(aiGroupFilter===grp.id)opt.selected=true;
    groupSel.appendChild(opt);
  });

  const visibleCats=categories.filter(cat=>!aiGroupFilter || cat.groupId===aiGroupFilter);
  catSel.innerHTML='<option value="">전체 소분류</option>';
  visibleCats.forEach(cat=>{
    const opt=document.createElement('option');
    opt.value=cat.id;
    opt.textContent=cat.name;
    if(aiCatFilter===cat.id)opt.selected=true;
    catSel.appendChild(opt);
  });

  if(aiCatFilter && !visibleCats.some(cat=>cat.id===aiCatFilter)){
    aiCatFilter='';
    catSel.value='';
  }
}

function updateAiFilterMeta(filteredItems){
  const meta=document.getElementById('ai-filter-meta');
  if(!meta)return;
  const groupName=aiGroupFilter ? (groups.find(g=>g.id===aiGroupFilter)||{}).name : '전체 대분류';
  const catName=aiCatFilter ? getCat(aiCatFilter).name : '전체 소분류';
  meta.textContent=`현재 필터: ${groupName} / ${catName} · ${filteredItems.length}개 표시 중`;
}

function onAiGroupFilterChange(){
  aiGroupFilter=document.getElementById('ai-group-filter').value||'';
  const cat=document.getElementById('ai-cat-filter');
  const currentCatValue=cat ? cat.value : '';
  if(currentCatValue){
    const selectedCat=categories.find(c=>c.id===currentCatValue);
    if(!selectedCat || (aiGroupFilter && selectedCat.groupId!==aiGroupFilter)) aiCatFilter='';
    else aiCatFilter=currentCatValue;
  } else {
    aiCatFilter='';
  }
  refreshAiTab();
}

function onAiCatFilterChange(){
  aiCatFilter=document.getElementById('ai-cat-filter').value||'';
  refreshAiTab();
}

function selectAllVisibleAiTargets(){
  getAiFilteredItems().forEach(it=>selectedAiTargets.add(it.id));
  refreshAiTab();
}

function clearVisibleAiTargets(){
  getAiFilteredItems().forEach(it=>selectedAiTargets.delete(it.id));
  refreshAiTab();
}

// ─── AI TAB REFRESH ───
function refreshAiTab(){
  const imgCnt=items.filter(i=>i.type==='image').length;
  const vidCnt=items.filter(i=>i.type==='video').length;
  document.getElementById('board-img-cnt').textContent=imgCnt;
  document.getElementById('board-vid-cnt').textContent=vidCnt;

  populateAiFilterControls();
  const filteredItems=getAiFilteredItems();
  updateAiFilterMeta(filteredItems);

  const selector=document.getElementById('ai-target-selector');
  selector.innerHTML='';
  if(filteredItems.length===0){
    selector.innerHTML='<div class="ai-target-empty">선택한 대분류/소분류에 해당하는 레퍼런스가 없어요.</div>';
  } else {
    filteredItems.forEach(it=>{
      const card=document.createElement('div');
      card.className='ai-target-card'+(selectedAiTargets.has(it.id)?' selected':'');
      if(it.type==='image'){
        const img=document.createElement('img');img.src=it.src;img.alt=it.title;card.appendChild(img);
      } else if(it.type==='carousel'){
        const img=document.createElement('img');img.src=(it.images&&it.images[0])||it.src;img.alt=it.title;
        img.style.cssText='width:100%;height:60px;object-fit:cover;border-radius:5px;';card.appendChild(img);
        const badge=document.createElement('div');badge.style.cssText='font-size:9px;color:var(--orange);font-weight:600;text-align:center;margin-bottom:1px;';badge.textContent='🎠 '+((it.images||[]).length)+'장';card.appendChild(badge);
      } else {
        if(it.thumb){const img=document.createElement('img');img.src=it.thumb;img.style.cssText='width:100%;height:60px;object-fit:cover;border-radius:5px;';card.appendChild(img);}
        else{const ph=document.createElement('div');ph.style.cssText='width:100%;height:60px;background:var(--s3);border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--t3)';ph.textContent='›';card.appendChild(ph);}
      }
      const title=document.createElement('div');title.className='atc-title';title.textContent=it.title;card.appendChild(title);
      card.onclick=()=>{
        if(selectedAiTargets.has(it.id))selectedAiTargets.delete(it.id);
        else selectedAiTargets.add(it.id);
        card.classList.toggle('selected');
      };
      selector.appendChild(card);
    });
  }

  document.querySelectorAll('.ai-opt-btn').forEach(btn=>{
    btn.classList.toggle('selected',selectedAiOpts.has(btn.dataset.opt));
    btn.onclick=()=>{
      const opt=btn.dataset.opt;
      if(selectedAiOpts.has(opt))selectedAiOpts.delete(opt);
      else selectedAiOpts.add(opt);
      btn.classList.toggle('selected');
    };
  });
  onProviderChange();
}

// ─── AI CALL ───
async function callAI(provider,messages,system){
  const key=getApiKey(provider);
  if(!key)throw new Error('API 키가 없어요. AI 설정에서 키를 입력해주세요.');
  if(provider==='anthropic'){
    const resp=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-calls':'true'},
      body:JSON.stringify({model:'claude-opus-4-5',max_tokens:1500,system,messages})
    });
    const data=await resp.json();
    if(data.error)throw new Error(data.error.message);
    return data.content[0].text;
  } else if(provider==='openai'){
    const msgs=[{role:'system',content:system},...messages.map(m=>({role:m.role,content:m.content}))];
    const resp=await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
      body:JSON.stringify({model:'gpt-4o',max_tokens:1500,messages:msgs})
    });
    const data=await resp.json();
    if(data.error)throw new Error(data.error.message);
    return data.choices[0].message.content;
  } else if(provider==='google'){
    const parts=[];
    for(const m of messages){
      if(Array.isArray(m.content)){
        for(const c of m.content){
          if(c.type==='text')parts.push({text:c.text});
          else if(c.type==='image'&&c.source.type==='base64')parts.push({inlineData:{mimeType:c.source.media_type,data:c.source.data}});
          else if(c.type==='image'&&c.source.type==='url')parts.push({text:'[이미지 URL: '+c.source.url+']'});
        }
      } else parts.push({text:m.content});
    }
   const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
    contents: [{ role: 'user', parts }],
    systemInstruction: { parts: [{ text: system }] }
    })
  });
    const data=await resp.json();
    if(data.error)throw new Error(data.error.message);
    return data.candidates[0].content.parts[0].text;
  }
  throw new Error('지원하지 않는 provider');
}

function parseDataUrl(src){
  const mt=(src.split(';')[0].split(':')[1]||'image/jpeg');
  const d=(src.split(',')[1]||'');
  return {mediaType:mt,data:d,dataUrl:src};
}


async function normalizeImageSource(src, fallbackMime='image/jpeg'){
  if(!src)return null;
  if(src.startsWith('data:'))return parseDataUrl(src);

  // blob: URL은 현재 브라우저 내부에서만 유효합니다.
  // 외부 AI API는 blob:null/... 주소를 다운로드할 수 없으므로 분석 직전에 base64(data URL)로 변환합니다.
  if(src.startsWith('blob:')){
    try{
      const resp=await fetch(src);
      if(!resp.ok)throw new Error('blob fetch failed');
      const blob=await resp.blob();
      const dataUrl=await blobToDataUrl(blob);
      return parseDataUrl(dataUrl);
    }catch(e){
      console.warn('blob URL 변환 실패',src,e);
      return null;
    }
  }

  // 일반 웹 URL은 그대로 전달합니다.
  return {url:src,mediaType:fallbackMime,data:null,dataUrl:null};
}

function imagePayloadFromNormalized(normalized,provider){
  if(!normalized)return null;

  if(normalized.data){
    if(provider==='anthropic')return {type:'image',source:{type:'base64',media_type:normalized.mediaType,data:normalized.data}};
    if(provider==='openai')return {type:'image_url',image_url:{url:normalized.dataUrl}};
    return {type:'image',source:{type:'base64',media_type:normalized.mediaType,data:normalized.data}};
  }

  if(normalized.url){
    if(provider==='anthropic')return {type:'image',source:{type:'url',url:normalized.url}};
    if(provider==='openai')return {type:'image_url',image_url:{url:normalized.url}};
    return {type:'image',source:{type:'url',url:normalized.url}};
  }
  return null;
}

async function buildImageContent(it,provider){
  // 캐러셀: 여러 이미지를 배열로 반환
  if(it.type==='carousel'){
    const results=[];
    for(const src of (it.images||[it.src])){
      const normalized=await normalizeImageSource(src);
      const payload=imagePayloadFromNormalized(normalized,provider);
      if(payload)results.push(payload);
    }
    return results;
  }

  if(it.type==='image'){
    const normalized=await normalizeImageSource(it.src);
    const payload=imagePayloadFromNormalized(normalized,provider);
    return payload?[payload]:[];
  }

  if(it.type==='video'){
    // 저장된 멀티프레임 사용, 없으면 썸네일 폴백
    const frames=it.frames&&it.frames.length>0?it.frames:(it.thumb?[it.thumb]:[]);
    if(!frames.length)return [];
    const results=[];
    for(const f of frames){
      const normalized=await normalizeImageSource(f,'image/jpeg');
      const payload=imagePayloadFromNormalized(normalized,provider);
      if(payload)results.push(payload);
    }
    return results;
  }
  return [];
}

// 영상에서 여러 프레임 캡처 (0%, 20%, 40%, 60%, 80% 지점)
function captureVideoFrames(src, callback){
  const FRAME_TIMES=[0.05,0.2,0.4,0.6,0.8]; // 비율
  const video=document.createElement('video');
  video.muted=true;video.preload='auto';video.playsInline=true;video.crossOrigin='anonymous';
  const frames=[];
  let currentIdx=0;
  let ready=false;

  function captureFrame(){
    const canvas=document.createElement('canvas');
    canvas.width=480;canvas.height=270;
    const ctx=canvas.getContext('2d');
    const vw=video.videoWidth,vh=video.videoHeight;
    const scale=Math.min(480/vw,270/vh);
    const dw=vw*scale,dh=vh*scale;
    ctx.fillStyle='#000';ctx.fillRect(0,0,480,270);
    ctx.drawImage(video,(480-dw)/2,(270-dh)/2,dw,dh);
    return canvas.toDataURL('image/jpeg',0.75);
  }

  video.addEventListener('loadedmetadata',()=>{
    ready=true;
    seekNext();
  });
  video.addEventListener('seeked',()=>{
    if(!ready)return;
    try{frames.push(captureFrame());}catch(e){}
    currentIdx++;
    if(currentIdx<FRAME_TIMES.length)seekNext();
    else{video.src='';callback(frames);}
  });
  video.addEventListener('error',()=>{
    if(frames.length)callback(frames);
    else callback([]);
  });
  setTimeout(()=>{if(frames.length<FRAME_TIMES.length){video.src='';callback(frames.length?frames:[]);}},15000);

  function seekNext(){
    video.currentTime=video.duration*FRAME_TIMES[currentIdx]||0.1;
  }
  video.src=src;
  video.load();
}

// 영상에서 텍스트(자막/카피) 추출 — 프레임 캡처 후 AI에 OCR 요청
async function extractVideoText(it, provider){
  if(!it.src)return null;
  // 이미 추출된 텍스트가 있으면 재사용
  if(it.extractedText)return it.extractedText;

  return new Promise(resolve=>{
    const frames=it.frames&&it.frames.length>0?it.frames:(it.thumb?[it.thumb]:[]);
    if(!frames.length){resolve(null);return;}

    const key=getApiKey(provider);
    if(!key){resolve(null);return;}

    const imgContents=frames.slice(0,3).map(f=>{
      const d=f.split(',')[1];
      if(provider==='anthropic')return {type:'image',source:{type:'base64',media_type:'image/jpeg',data:d}};
      return {type:'image_url',image_url:{url:f}};
    });
    imgContents.push({type:'text',text:'이 영상 프레임들에 보이는 모든 텍스트(자막, 카피, 브랜드명, 해시태그 등)를 순서대로 추출해주세요. 텍스트만 간결하게 나열해주세요. 없으면 "텍스트 없음"이라고만 답하세요.'});

    const system='당신은 이미지에서 텍스트를 추출하는 OCR 전문가입니다. 보이는 텍스트를 정확하게 추출하세요.';
    callAI(provider,[{role:'user',content:imgContents}],system)
      .then(text=>{
        it.extractedText=text;
        scheduleSave();
        resolve(text);
      })
      .catch(()=>resolve(null));
  });
}

function buildAnalysisSystem(opts, hasVideo, itemsWithNotes, extractedTexts, itemsWithCaption){
  const notesBlock = itemsWithNotes.length
    ? '\n\n[레퍼런스별 메모/카피 기록]\n' + itemsWithNotes.map(it=>`"${it.title}": ${it.notes}`).join('\n')
    : '';
  const captionBlock = itemsWithCaption && itemsWithCaption.length
    ? '\n\n[레퍼런스별 실제 광고 본문 / 캡션]\n' + itemsWithCaption.map(it=>`"${it.title}" 본문: ${it.caption}`).join('\n')
    : '';
  const textBlock = extractedTexts && extractedTexts.length
    ? '\n\n[영상에서 추출한 자막/텍스트]\n' + extractedTexts.map(t=>`"${t.title}": ${t.text}`).join('\n')
    : '';

  let prompt = `당신은 10년 경력의 메타광고 및 퍼포먼스 마케팅 전략가입니다.
아래 레퍼런스를 분석할 때 반드시 지켜야 할 원칙:
1. 각 레퍼런스를 제목 기준으로 명확히 구분해서 작성
2. "좋다" "나쁘다" 같은 평가 대신 "왜 효과적인가"를 구체적으로 설명
3. 실제 광고 실무에 바로 적용 가능한 액션 아이템 포함
4. 수치나 구체적 근거를 들어 설명${captionBlock}${notesBlock}${textBlock}\n\n`;

  if(opts.has('mood')){
    prompt += `무드 & 색상 분석
- 주조색/보조색/포인트색을 구체적 색상명(예: 오프화이트 #F5F0E8)으로 명시
- 이 색 조합이 어떤 감정 반응을 유발하는지, 타겟 심리와의 연결
- 유사 브랜드 사례와 비교한 포지셔닝
- 실제로 적용할 수 있는 색상 조합 가이드 제안\n\n`;
  }
  if(opts.has('layout')){
    prompt += `📐 레이아웃 & 구도 분석
- 시선 이동 경로를 F패턴/Z패턴/대각선 등으로 분류
- 텍스트:이미지 비율, 여백 활용의 의도
- 스크롤 멈춤 유발 요소 (패턴 방해 요소, 시각적 긴장감)
- 모바일 화면에서의 최적화 여부\n\n`;
  }
  if(opts.has('copy')){
    prompt += `✍️ 카피 분석 & 신규 카피 도출
- 보이는 카피 또는 메모된 카피의 문장 구조 분류 (AIDA/PAS/4U 프레임워크 기준)
- 감정 트리거 키워드와 작동 원리 (공포/희망/호기심/사회적 증거 등)
- 타겟 페르소나의 내면 대화와 카피가 어떻게 연결되는지
- 위 분석을 바탕으로 신규 카피 도출:
  * 훅 카피 3개 (15자 이내, 스크롤 멈춤 목적)
  * 본문 카피 2개 (공감→문제제기→해결→CTA 구조)
  * CTA 문구 3개 (클릭률 최적화)\n\n`;
  }
  if(opts.has('strategy')){
    prompt += `📱 메타/인스타 광고 전략
- 추천 광고 포맷 (피드/릴스/스토리/컬렉션) 및 이유
- 타겟 오디언스 설정 제안 (인구통계 + 관심사 + 행동 기반)
- 입찰 전략 및 예산 배분 제안
- A/B 테스트 우선 변수 3가지
- 예상 KPI 및 성과 기준점\n\n`;
  }
  if(opts.has('storyboard')){
    prompt += `🎬 스토리보드 분석
- 각 프레임별 핵심 장면과 전달 메시지 (시간대 추정 포함)
- 장면 전환 방식과 리듬감
- 감정 곡선 (도입→갈등→해소→CTA) 분석
- 시청 유지율을 높이는 구성 요소와 개선 포인트\n\n`;
  }
  if(opts.has('script')){
    prompt += `💬 자막/텍스트 분석
- 추출된 텍스트를 장면 순서대로 재구성
- 텍스트 노출 타이밍과 화면 배치 전략 분석
- 음소거 시청 환경에서의 자막 효과성 평가
- 자막 개선안 및 대안 문구 제안\n\n`;
  }
  if(opts.has('hook')){
    prompt += `훅 포인트 분석 (첫 3초)
- 첫 프레임에서 시선을 잡는 요소 (움직임/색상/텍스트/인물 등)
- 3초 안에 전달되는 핵심 메시지와 호기심 유발 방식
- 이탈률을 낮추는 구체적 장치 분석
- 더 강력한 훅을 만들기 위한 구체적 개선안 3가지
- 참고할 수 있는 훅 카피 아이디어 5개\n\n`;
  }
  if(opts.has('abtest')){
    prompt += `마케팅 A/B 테스트 분석
- 각 레퍼런스에서 우선 테스트할 변수 3~5개를 선정 (썸네일/첫 3초/헤드라인/본문 길이/CTA/제품 노출 방식/자막 속도/색상 대비 등)
- 변수별로 A안(현재 구조 유지) / B안(변형안) 가설을 구체적으로 제시
- 어떤 지표를 봐야 하는지 명확히 제안 (CTR, Hook Rate, 3초 시청률, CPC, 상세 유입률, 전환율 등)
- 테스트 우선순위를 상/중/하로 구분하고 그 이유를 설명
- 실제 집행자가 바로 써먹을 수 있도록 '무엇을 어떻게 바꿀지' 한 줄 실행안 포함
- 출력 형식은 반드시 각 레퍼런스마다 아래처럼 정리:
  ### [레퍼런스 제목]
  - 핵심 테스트 포인트:
  - A안:
  - B안:
  - 확인할 지표:
  - 우선순위:
  - 실행 메모:\n\n`;
  }

  prompt += hasVideo
    ? `\n[영상 분석 주의사항]\n여러 프레임이 제공됩니다. 프레임 순서(1번=초반, 마지막=후반)를 고려해 영상 흐름을 파악하세요. 자막/텍스트가 추출되었다면 이를 반드시 카피 분석에 반영하세요.\n`
    : '';

  return prompt;
}

function renderMarkdown(text){
  return text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/^### (.+)$/gm,'<h4 style="font-size:12px;font-weight:700;color:var(--t1);margin:12px 0 4px;font-family:var(--fm);">$1</h4>')
    .replace(/^## (.+)$/gm,'<h4 style="font-size:13px;font-weight:700;color:var(--accent3);margin:16px 0 6px;padding-bottom:4px;border-bottom:1px solid var(--b2);font-family:var(--fm);">$1</h4>')
    .replace(/^# (.+)$/gm,'<h4 style="font-size:14px;font-weight:700;color:var(--t1);margin:18px 0 8px;font-family:var(--fm);">$1</h4>')
    .replace(/\*\*(.+?)\*\*/g,'<strong style="color:var(--t1);">$1</strong>')
    .replace(/`([^`]+)`/g,'<code style="background:var(--s3);padding:1px 5px;border-radius:3px;font-size:11px;color:var(--accent);">$1</code>')
    .replace(/^[-•*] (.+)$/gm,'<li style="margin:3px 0;color:var(--t2);line-height:1.8;">$1</li>')
    .replace(/(<li[^>]*>.*?<\/li>\n?)+/gs, s=>`<ul style="padding-left:16px;margin:4px 0 10px;">${s}</ul>`)
    .replace(/^\d+\. (.+)$/gm,'<li style="margin:3px 0;color:var(--t2);line-height:1.8;">$1</li>')
    .replace(/\n{2,}/g,'\n')
    .split('\n').map(l=>l.startsWith('<')?l:`<p style="margin:0 0 6px;color:var(--t2);line-height:1.9;">${l}</p>`).join('\n')
    .replace(/<p[^>]*>\s*<\/p>/g,'');
}

async function runSingleAnalysis(){
  if(selectedAiTargets.size===0){showToast('분석할 레퍼런스를 선택해주세요','error');return;}
  if(selectedAiOpts.size===0){showToast('분석 유형을 하나 이상 선택해주세요','error');return;}
  const provider=document.getElementById('ai-provider').value;
  const btn=document.getElementById('ai-run-btn');
  const result=document.getElementById('ai-single-result');
  const selectedItems=items.filter(i=>selectedAiTargets.has(i.id));
  const videoItems=selectedItems.filter(i=>i.type==='video');
  const hasVideo=videoItems.length>0;
  btn.disabled=true;
  result.classList.add('open');

  // Step 1: 영상 멀티프레임 캡처
  if(hasVideo){
    let prepared=0;
    result.innerHTML=`<div class="ai-loading"><div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div><span style="margin-left:8px">영상 프레임 분석 준비 중... (${videoItems.length}개)</span></div>`;
    btn.textContent='준비 중...';
    await new Promise(resolve=>{
      if(!videoItems.length){resolve();return;}
      videoItems.forEach(it=>prepareVideoFrames(it,()=>{
        prepared++;
        result.innerHTML=`<div class="ai-loading"><div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div><span style="margin-left:8px">프레임 캡처 중... ${prepared}/${videoItems.length}</span></div>`;
        if(prepared===videoItems.length)resolve();
      }));
    });
  }

  // Step 2: 영상 자막/텍스트 OCR 추출
  let extractedTexts=[];
  if(hasVideo&&(selectedAiOpts.has('copy')||selectedAiOpts.has('script')||selectedAiOpts.has('hook')||selectedAiOpts.has('abtest'))){
    result.innerHTML='<div class="ai-loading"><div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div><span style="margin-left:8px">영상 자막/텍스트 추출 중...</span></div>';
    for(const it of videoItems){
      const text=await extractVideoText(it,provider);
      if(text&&text!=='텍스트 없음')extractedTexts.push({title:it.title,text});
    }
  }

  // Step 3: 본 분석
  result.innerHTML='<div class="ai-loading"><div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div><span style="margin-left:8px">AI 심층 분석 중... (1~2분 소요될 수 있어요)</span></div>';
  btn.textContent='분석 중...';

  try{
    const itemsWithNotes=selectedItems.filter(i=>i.notes&&i.notes.trim());
    const itemsWithCaption=selectedItems.filter(i=>i.caption&&i.caption.trim());
    const system=buildAnalysisSystem(selectedAiOpts,hasVideo,itemsWithNotes,extractedTexts,itemsWithCaption);
    const contentArr=[];
    for(const it of selectedItems){
      const cats=(it.catIds||[]).map(id=>getCat(id).name).join(', ')||'미분류';
      const noteStr=it.notes?` | 메모: "${it.notes.trim()}"`:'';
      const captionStr=it.caption?` | 본문캡션: "${it.caption.trim()}"` :'';
      const aiContextStr=buildAiContext(it)?` | 세부입력: "${buildAiContext(it)}"`:'';
      const frameCount=it.frames?it.frames.length:0;
      const frameStr=it.type==='video'?` | 캡처 프레임: ${frameCount}장`:it.type==='carousel'?` | 캐러셀 ${(it.images||[]).length}장`:'';
      contentArr.push({type:'text',text:`\n--- [${it.type==='image'?'🖼 이미지':it.type==='carousel'?'🎠 캐러셀':'🎬 영상'}: "${it.title}" | 카테고리: ${cats}${captionStr}${noteStr}${aiContextStr}${frameStr}] ---`});
      (await buildImageContent(it,provider)).forEach(img=>contentArr.push(img));
    }
    contentArr.push({type:'text',text:'\n위 레퍼런스들을 각각 제목 기준으로 구분해서 심층 분석해주세요.'});
    let messages;
    if(provider==='openai'){messages=[{role:'user',content:contentArr.map(c=>c.type==='text'?{type:'text',text:c.text}:c)}];}
    else{messages=[{role:'user',content:contentArr}];}
    const text=await callAI(provider,messages,system);
    result.innerHTML=renderMarkdown(text);
    const copyBtn=document.createElement('button');
    copyBtn.style.cssText='margin-top:12px;background:var(--s3);border:1px solid var(--b2);color:var(--t2);font-family:var(--fn);font-size:11px;padding:6px 14px;border-radius:6px;cursor:pointer;';
    copyBtn.textContent='📋 결과 복사';
    copyBtn.onclick=()=>{navigator.clipboard.writeText(text).then(()=>showToast('복사됨','success'));};
    result.appendChild(copyBtn);
    selectedItems.forEach(it=>{it.aiResult=text;it.aiAnalyzed=true;});
    scheduleSave();renderBoard();showToast('분석 완료 ✓','success');
  }catch(err){
    result.innerHTML=`<p style="color:#ff7070;font-size:12px;">분석 중 오류: ${err.message}</p>`;
    showToast('분석 실패','error');
  }
  btn.disabled=false;btn.textContent='✦ 분석 시작';
}

async function runBatchAnalysis(){
  const imgItems=items.filter(i=>i.type==='image');
  if(imgItems.length===0){showToast('이미지가 없어요','error');return;}
  const provider=document.getElementById('ai-provider').value;
  const btn=document.getElementById('ai-batch-run-btn');
  const result=document.getElementById('ai-batch-result');
  btn.disabled=true;btn.textContent='분석 중...';
  result.innerHTML='<div class="ai-loading"><div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div><span style="margin-left:8px">전체 보드 분석 중...</span></div>';
  result.classList.add('open');
  try{
    const system=`당신은 10년 경력의 메타광고 퍼포먼스 마케터입니다. 수집된 레퍼런스 보드 전체를 종합 분석하여 아래 항목을 한국어로 작성하세요. 단순한 요약이 아니라, 실제 캠페인 전략 보고서 수준으로 깊이 있게 작성하세요.

## 🎯 전체 무드 & 방향성
- 레퍼런스 전체를 관통하는 핵심 감성 키워드 3~5개
- 이 방향성이 어떤 타겟 페르소나에게 유효한지
- 경쟁사 대비 차별화 포인트

## 📊 공통 디자인 패턴 & 법칙
- 반복적으로 나타나는 시각 요소 (색상/폰트/구도/여백)
- 이 패턴들이 공통적으로 노리는 심리적 효과
- 패턴에서 벗어난 아웃라이어가 있다면 그 의도

## 🎨 색상 & 톤앤매너 가이드
- 주요 색상 팔레트 (구체적 색상명 포함)
- 권장 색상 조합과 금기 조합
- 계절/시기별 적용 가이드

## ✍️ 카피 패턴 & 언어 전략
- 공통 카피 구조와 프레임워크 (AIDA/PAS 등)
- 자주 등장하는 키워드와 그 심리적 트리거
- 타겟 페르소나의 내면 대화 (Pain Point & Desire)
- 즉시 활용 가능한 카피 템플릿 5개

## 💡 콘텐츠 전략 제안
- 단기 (1개월): 즉시 실행 가능한 액션 3가지
- 중기 (3개월): 테스트 & 최적화 방향
- 장기 (6개월): 브랜드 포지셔닝 전략

## 📱 메타/인스타 광고 실행 가이드
- 포맷별 추천 (피드/릴스/스토리/컬렉션) 및 우선순위
- 타겟 오디언스 설정 상세 가이드
- 예산 배분 제안 (테스트 예산 기준)
- A/B 테스트 우선 변수 Top 5

## ⚡ 훅 & 카피 아이디어
- 훅 카피 5개 (각각 사용 목적 명시)
- 광고 시나리오 2개 (짧은 버전 15초 / 긴 버전 30초)
- 시즌/이벤트 변형 아이디어

실무에서 내일 당장 사용할 수 있는 구체성으로 작성하세요.`;
    const contentArr=[];
    for(const it of imgItems.slice(0,5)){const imgC=await buildImageContent(it,provider);if(imgC&&imgC.length)contentArr.push(...imgC);}
    const cats=[...new Set(items.flatMap(i=>i.catIds||[]).map(id=>getCat(id).name))];
    const captionsBlock=items.filter(i=>buildAiContext(i)).map(i=>`"${i.title}": ${buildAiContext(i)}`).join('\n');
    const captionSection=captionsBlock?`\n\n[레퍼런스 본문/캡션 데이터]\n${captionsBlock}\n`:'';
    contentArr.push({type:'text',text:`총 ${items.length}개 레퍼런스 (이미지 ${imgItems.length}개) 수집됨.\n카테고리: ${cats.join(', ')}${captionSection}\n\n전체 보드를 종합 분석해주세요.`});
    let messages;
    if(provider==='openai'){messages=[{role:'user',content:contentArr.map(c=>c.type==='text'?{type:'text',text:c.text}:c)}];}
    else{messages=[{role:'user',content:contentArr}];}
    const text=await callAI(provider,messages,system);
    result.innerHTML=renderMarkdown(text);
    const copyBtn=document.createElement('button');
    copyBtn.style.cssText='margin-top:12px;background:var(--s3);border:1px solid var(--b2);color:var(--t2);font-family:var(--fn);font-size:11px;padding:6px 14px;border-radius:6px;cursor:pointer;';
    copyBtn.textContent='📋 결과 복사';
    copyBtn.onclick=()=>{navigator.clipboard.writeText(text).then(()=>showToast('복사됨','success'));};
    result.appendChild(copyBtn);
    showToast('전체 분석 완료','success');
  }catch(err){result.textContent='분석 중 오류:\n'+err.message;showToast('분석 실패','error');}
  btn.disabled=false;btn.textContent='✦ 다시 분석';
}

// ─── AUTOSAVE INDICATOR ───
function setAutosaveIndicator(state){
  const el=document.getElementById('autosave-indicator');
  if(!el)return;
  if(state==='saving'){el.style.color='var(--yellow)';el.title='저장 중...';}
  else if(state==='saved'){el.style.color='var(--green)';el.title='자동저장 완료';setTimeout(()=>{el.style.color='var(--t3)';el.title='자동저장 대기';},2000);}
  else{el.style.color='var(--t3)';el.title='자동저장 대기';}
}
const _origSaveData=saveData;
async function saveDataWithIndicator(){
  setAutosaveIndicator('saving');
  await _origSaveData();
  setAutosaveIndicator('saved');
}
const _debouncedSaveWithIndicator=debounce(()=>saveDataWithIndicator(),1500);
function scheduleSave(){if(_autoSaveEnabled)_debouncedSaveWithIndicator();}

// ─── MOBILE SIDEBAR ───
function toggleMobileSidebar(){
  const sb=document.getElementById('sidebar');
  const ov=document.getElementById('sidebar-overlay');
  sb.classList.toggle('mobile-open');
  ov.classList.toggle('open');
}
function closeMobileSidebar(){
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}

// ─── TOAST ───
function showToast(msg,type=''){
  const t=document.getElementById('toast');t.textContent=msg;
  t.className=(type?type+' ':'')+' show';
  clearTimeout(t._t);t._t=setTimeout(()=>{t.className='';},2500);
}

// ─── INIT 수정 제안 ───
async function initApp() {
  try {
    // 1. GAPI 로드 확인
    await new Promise((resolve) => {
      gapi.load('client:auth2', resolve);
    });
    
    // 2. Client 초기화 (API_KEY 및 CLIENT_ID 필요)
    await gapi.client.init({
      apiKey: 'YOUR_API_KEY',
      clientId: 'YOUR_CLIENT_ID',
      discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"],
      scope: 'https://www.googleapis.com/auth/drive.file'
    });

    // 3. 데이터 로드
    await loadData();
    console.log("앱 초기화 및 데이터 로드 완료");
  } catch (e) {
    console.error("초기화 실패:", e);
  }
}

// 실행
initApp();
