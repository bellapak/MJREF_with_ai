// =====================================================
// refboard - app.js (Data Loss Fixed & Performance Optimized & Link UI Updated)
// =====================================================


// MJREF 콘텐츠 영역 > 공통 분석 > 영역별 분석 > 비주얼 분석 (2026-10-23)
// 영역 태그는 한 레퍼런스에 여러 개 부여 가능. 영역 간 OR, 독립 필터 축 간 AND.
const CONTENT_AREAS=[
  {id:'ad',name:'광고·캠페인',short:'광고',code:'AD',desc:'광고 소재와 캠페인 설득 구조',keys:['strategy','journey','offer','cta']},
  {id:'brand',name:'브랜드·BX',short:'브랜드',code:'BX',desc:'브랜드 세계관과 자산',keys:['brandAsset','strategy','audienceRelation']},
  {id:'creator',name:'인플루언서',short:'인플루언서',code:'CR',desc:'크리에이터·협업·반응 분석',keys:['creatorType','partnership','creatorFormat','trustSignal','audienceResponse','audienceRelation']},
  {id:'social',name:'SNS·커뮤니티',short:'SNS',code:'SO',desc:'일상 게시물·팬덤·참여',keys:['socialMechanic','audienceResponse','narrative']},
  {id:'editorial',name:'정보·에디토리얼',short:'에디토리얼',code:'ED',desc:'아티클·교육·콘텐츠 큐레이션',keys:['editorialType','narrative']},
  {id:'commerce',name:'커머스·제품',short:'커머스',code:'CM',desc:'제품 소개·판매·리뷰',keys:['journey','offer','strategy']},
  {id:'space',name:'공간·경험',short:'공간',code:'SP',desc:'팝업·전시·오프라인 경험',keys:['experienceType','narrative']},
  {id:'culture',name:'문화·공연',short:'문화·공연',code:'CU',desc:'공연 콘텐츠·팬덤·굿즈',keys:['cultureFocus','audienceRelation','narrative']}
];
const AREA_VALUES=CONTENT_AREAS.map(x=>x.name);
const COMMON_FACET_KEYS=['objective','contentRole','contentFormat','tone','channel','industry'];
const STRATEGY_FACET_KEYS=['strategy','journey','offer']; // 기존 의미를 보존하는 호환 키
const VISUAL_FACET_KEYS=['color','visual'];
const SPECIALTY_FACET_KEYS=[...new Set(CONTENT_AREAS.flatMap(x=>x.keys))];
const PRIMARY_FACET_KEYS=['contentArea',...new Set([...COMMON_FACET_KEYS,...SPECIALTY_FACET_KEYS,...VISUAL_FACET_KEYS])];
const LEGACY_FACET_KEYS=['purpose','benefit','layout','composition','subject','appeal','season','motion'];
const PRIMARY_OPEN_KEYS=['objective','contentRole','creatorType','partnership','color'];
const activeAreaFilters=new Set();
const editorFacetDrafts={};
function specialtyKeysForAreas(areas){return [...new Set(CONTENT_AREAS.filter(a=>areas.includes(a.name)).flatMap(a=>a.keys))];}

const FACETS={
  contentArea:AREA_VALUES,
  contentFormat:['이미지·포스터','캐러셀·슬라이드','숏폼 영상','롱폼 영상','라이브·스트리밍','텍스트·아티클','오디오·팟캐스트','웹·인터랙션','오프라인·공간','기타'],
  narrative:['강한 첫 장면','질문·문제 제시','문제→해결','전후 비교','과정·기록','경험·브이로그','반전·스토리','정보·리스트','시각 중심','기타'],
  creatorType:['일상·라이프스타일','뷰티·패션','리빙·홈케어','정보·전문가','리뷰·추천','엔터테인먼트·밈','아티스트·공연','캐릭터·버추얼','커뮤니티·취향','기타'],
  partnership:['자발적 언급','제품 제공·시딩','유료 협찬·광고','앰배서더','공동 제작','브랜드 콜라보','어필리에이트·추천 코드','브랜드 자체 크리에이터','협업 여부 미확인'],
  creatorFormat:['루틴·브이로그','언박싱·하울','실사용 리뷰','비교·추천','사용법·튜토리얼','챌린지·트렌드','정보·팁','스토리텔링','라이브·Q&A','현장·행사 기록','기타'],
  trustSignal:['실사용 과정 노출','구체적인 장단점 언급','장기 사용 맥락','전문성·근거 제시','광고·협찬 표시 확인','솔직한 경험담','댓글 질문 응답','검증 가능한 근거','확인 어려움'],
  audienceResponse:['공감·경험 공유','질문·문의','친구 태그·추천','저장·공유 언급','구매 의향 표현','비판·의심 반응','팬덤 대화','반응 정보 없음'],
  audienceRelation:['팬덤 형성','친근한 일상 교류','전문성 기반 신뢰','고객 교육','참여 유도','브랜드 커뮤니티','단방향 공지','기타'],
  socialMechanic:['일상 공유','질문·투표','댓글 참여','밈·트렌드 활용','챌린지·UGC','커뮤니티 대화','저장·공유 유도','시리즈 연재','기타'],
  brandAsset:['브랜드 메시지','브랜드 스토리','캐릭터·세계관','로고·비주얼 아이덴티티','브랜드 캠페인','브랜드 경험','커뮤니티·팬덤','브랜드 보이스','기타'],
  editorialType:['인터뷰','케이스 스터디','뉴스·이슈','정보 요약','교육·튜토리얼','비교·분석','스토리·에세이','큐레이션·추천','리포트·데이터','기타'],
  experienceType:['팝업·전시','오프라인 이벤트','매장·VMD','공간·건축','패키지·언박싱','체험·인터랙션','UI·디지털 경험','굿즈·피지컬','기타'],
  cultureFocus:['공연 포스터','티저·트레일러','캐스트·배우 콘텐츠','공연 리뷰','관객 참여·팬덤','굿즈·MD','프로그램북·인쇄물','현장·공간','문화 프로젝트','기타'],
  objective:['브랜드 인지도 확대','브랜드 이미지 구축','제품·서비스 소개','고객 관심·참여 유도','사이트·매장 유입','구매·전환 유도','재구매·고객 유지','팬덤·관계 형성'],
  strategy:['열망형','기술형','사회적 증거형','가격 인식형','문제 해결형','희소성·긴급성','호기심·반전','유머·밈','스토리텔링','세계관·캐릭터','참여·UGC'],
  journey:['인지','관심·탐색','비교·고려','구매·전환','사용·경험','재구매·추천'],
  offer:['가격 할인','정액 할인','쿠폰','무료배송','증정품/GWP','1+1/번들','적립/포인트','멤버십','한정/선착순','체험/샘플','성능/효능','편의성','기타/없음'],
  contentRole:['시선 끌기/후킹','브랜드 소개','제품 소개','교육·정보 제공','사용법·튜토리얼','비교·리뷰','후기·사회적 증거','참여·커뮤니티','프로모션 안내','전환·CTA','고객 관계 유지'],
  tone:['위트/유머','도발적','친근함','담백함','전문적','감성적','직설적','고급스러움','실험적'],
  channel:['인스타그램 피드','인스타그램 릴스','인스타그램 스토리','틱톡','유튜브','핀터레스트','자사몰·랜딩','배너·광고','이메일·CRM','오프라인·인쇄','패키지','기타'],
  industry:['생활용품','뷰티/퍼스널케어','패션','식품/음료','리빙/인테리어','테크','문화/공연','기타'],
  color:['레드','오렌지','옐로','그린','민트','블루','퍼플','핑크','브라운','베이지','화이트','그레이','블랙','멀티컬러'],
  visual:['미니멀','맥시멀','레트로/빈티지','키치/위트','럭셔리','에디토리얼','실험적/초현실','일러스트','3D/CG','타이포그래피','포토그래픽'],
  // Legacy classification keys: persisted and searchable, hidden from primary filter UI.
  purpose:['광고','SNS 콘텐츠','상세페이지','랜딩페이지','패키지','브랜딩/BX','오프라인/VMD','UI/UX','굿즈','기타'],
  benefit:['가격 할인','정액 할인','쿠폰','무료배송','증정품/GWP','1+1/번들','적립/포인트','멤버십','한정/선착순','체험/샘플','성능/효능','편의성','기타/없음'],
  layout:['중앙 정렬','좌우 분할','그리드','비대칭','콜라주','풀블리드','카드형','큰 타이포','여백 중심','정보 밀집'],
  composition:['정면','탑뷰/플랫레이','클로즈업','매크로','아이레벨','로우앵글','인물 중심','제품 단독','사용 장면'],
  subject:['제품','인물','캐릭터','타이포그래피','공간/인테리어','자연','소품','음식','패키지','UI 화면'],
  appeal:['문제 해결','기능/성능','가격/가치','사회적 증거','열망/라이프스타일','희소성/긴급성','호기심/반전','유머/밈','감성/스토리'],
  cta:['구매 유도','탐색/더보기','가입/구독','참여/응모','저장/공유','방문/예약','CTA 없음'],
  season:['신제품 출시','시즌 세일','봄','여름','가을','겨울','설날','추석','발렌타인','크리스마스','블랙프라이데이','상시 운영'],
  motion:['영상 해당 없음','실사','모션그래픽','스톱모션','제품 데모','브이로그','인터뷰','애니메이션','텍스트 애니메이션','숏폼 트렌드']
};
const FACET_NAMES={contentArea:'분석 분야',contentFormat:'콘텐츠 형식',narrative:'이야기 전개',creatorType:'크리에이터 유형',partnership:'브랜드 협업 관계',creatorFormat:'크리에이터 콘텐츠 형식',trustSignal:'신뢰·진정성 단서',audienceResponse:'관찰된 오디언스 반응',audienceRelation:'오디언스 관계',socialMechanic:'참여·확산 방식',brandAsset:'브랜드 자산·표현',editorialType:'에디토리얼 유형',experienceType:'공간·경험 유형',cultureFocus:'문화·공연 소재',objective:'활용 목적',strategy:'마케팅 전략',journey:'고객 여정',offer:'프로모션·혜택',contentRole:'콘텐츠 역할',tone:'표현 톤',channel:'적용 채널·매체',industry:'업종',color:'색상군',visual:'비주얼 스타일',purpose:'기존 용도',benefit:'기존 혜택',layout:'레이아웃',composition:'촬영·구도',subject:'주요 피사체',appeal:'기존 카피 소구',cta:'CTA 유형',season:'시즌·이벤트',motion:'영상 스타일'};
let facetFilters={};let classificationFilter='all';
// Never strip future AI values or unknown classification keys from saved records.
function cleanFacets(value){
  const result={};
  if(value&&typeof value==='object'&&!Array.isArray(value)){
    for(const [key,raw] of Object.entries(value)){
      if(key==='hex')continue;
      if(Array.isArray(raw))result[key]=[...new Set(raw.filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim()))];
    }
  }
  for(const key of Object.keys(FACETS))if(!Array.isArray(result[key]))result[key]=[];
  return result;
}
const COLOR_SWATCHES={'레드':'#EA4045','오렌지':'#F28B35','옐로':'#F2C84B','그린':'#4DAD69','민트':'#58C8B9','블루':'#3A85E8','퍼플':'#8755CB','핑크':'#ED80B3','브라운':'#986C4A','베이지':'#CBB99C','화이트':'#F5F5F5','그레이':'#95999F','블랙':'#202124','멀티컬러':'linear-gradient(120deg,#ef5050,#f3d453,#58bd8c,#487de9,#a25cdb)'};
const FACET_GROUPS={color:[['컬러 계열',['레드','오렌지','옐로','그린','민트','블루','퍼플','핑크']],['뉴트럴',['브라운','베이지','화이트','그레이','블랙']],['복합',['멀티컬러']]],visual:[['표현 분위기',['미니멀','맥시멀','레트로/빈티지','키치/위트','럭셔리','에디토리얼','실험적/초현실']],['비주얼 제작 방식',['일러스트','3D/CG','타이포그래피','포토그래픽']]]};
const FACET_DESCRIPTIONS={
 contentArea:'한 콘텐츠가 여러 분야에 속할 수 있습니다. 분석 분야를 선택하면 전용 태그가 나타납니다.',
 contentFormat:'실제로 보이는 발행·표현 형식',narrative:'콘텐츠 서사의 전개 구조',creatorType:'주로 다루는 관심사와 전문영역',partnership:'실제 확인 가능한 협업 방식만 선택',creatorFormat:'크리에이터가 사용한 콘텐츠 기법',trustSignal:'확인되는 근거만 체크하며 진정성을 단정하지 않습니다',audienceResponse:'댓글 등 실제 관찰한 반응만 기록합니다. 지표를 추정하지 않습니다',audienceRelation:'콘텐츠가 형성하는 관계',socialMechanic:'참여를 이끌어내는 구체적인 장치',brandAsset:'브랜드의 고유한 시각·언어 자산',editorialType:'콘텐츠가 정보를 전달하는 방식',experienceType:'공간에서 발생하는 경험 종류',cultureFocus:'공연·문화 분야의 주제',
 objective:'레퍼런스의 마케팅 활용 목표',strategy:'어떤 논리로 고객을 설득하는가',journey:'고객 행동의 어느 단계에 해당하는가',offer:'고객에게 제시되는 혜택',contentRole:'콘텐츠가 수행하는 구체적 역할',tone:'콘텐츠의 말투와 표현 성격',channel:'어떤 채널과 매체에 응용할 수 있는가',industry:'산업군별 레퍼런스',
 color:'시각적으로 눈에 띄는 주요 색상 · HEX는 별도 입력',visual:'표현 분위기와 제작 매체를 각각 선택할 수 있습니다.'
};
// Compatibility bridge: infer only directly-supported legacy tags. Original tags always remain intact.
const LEGACY_PURPOSE_AREA={'광고':'광고·캠페인','SNS 콘텐츠':'SNS·커뮤니티','상세페이지':'커머스·제품','랜딩페이지':'커머스·제품','패키지':'커머스·제품','브랜딩/BX':'브랜드·BX','오프라인/VMD':'공간·경험','UI/UX':'공간·경험','굿즈':'커머스·제품'};
const LEGACY_APPEAL_STRATEGIES={'문제 해결':'문제 해결형','기능/성능':'기술형','가격/가치':'가격 인식형','사회적 증거':'사회적 증거형','열망/라이프스타일':'열망형','희소성/긴급성':'희소성·긴급성','호기심/반전':'호기심·반전','유머/밈':'유머·밈','감성/스토리':'스토리텔링'};
function migrateDecisionFacets(facets){
  const f=cleanFacets(facets);
  if(!f.contentArea.length && f.purpose.length){f.contentArea=[...new Set(f.purpose.map(v=>LEGACY_PURPOSE_AREA[v]).filter(Boolean))];}
  if(!f.strategy.length){ f.strategy=[...new Set((f.appeal||[]).map(v=>LEGACY_APPEAL_STRATEGIES[v]).filter(Boolean))]; }
  if(!f.offer.length && f.benefit.length){ f.offer=[...f.benefit]; }
  if(!f.objective.length && f.purpose.includes('브랜딩/BX')){ f.objective=['브랜드 이미지 구축']; }
  return f;
}
function migrateDecisionFacetsOnItems(){
  let changed=0;
  items.forEach(it=>{
    const before=JSON.stringify(it.facets||{});
    const migrated=migrateDecisionFacets(it.facets);
    it.facets={...migrated,hex:it.facets?.hex||''};
    if(JSON.stringify(it.facets)!==before)changed++;
  });
  return changed;
}
function facetVisibleOptions(key,selected=[]){
  const options=FACETS[key]||[];
  // Values emitted by a different Apps Script taxonomy stay editable, not invisible.
  return [...options,...(selected||[]).filter(v=>!options.includes(v))];
}
function facetOptionHTML(key,v,checked,prefix){const swatch=key==='color'?`<i class="ref-swatch" style="background:${COLOR_SWATCHES[v]||'#888'}"></i>`:'';const onchange=key==='contentArea'?` onchange="updateDomainEditor('${prefix}')"`:'';return `<label class="facet-choice${key==='contentArea'?' area-choice':''}"><input type="checkbox" data-facet="${key}" data-prefix="${prefix}" value="${esc(v)}" ${checked?'checked':''}${onchange}><span>${swatch}${esc(v)}</span></label>`;}
function facetGroupContent(key,options,selected,prefix){
  if(!FACET_GROUPS[key])return `<div class="facet-chips">${options.map(v=>facetOptionHTML(key,v,selected.includes(v),prefix)).join('')}</div>`;
  const groups=FACET_GROUPS[key];
  const grouped=new Set(groups.flatMap(([,opts])=>opts));
  const unknown=options.filter(v=>!grouped.has(v));
  return groups.map(([name,subset])=>`<div class="facet-choice-group"><div class="facet-choice-group-title">${name}</div><div class="facet-chips">${subset.map(v=>facetOptionHTML(key,v,selected.includes(v),prefix)).join('')}</div></div>`).join('')+(unknown.length?`<div class="facet-choice-group"><div class="facet-choice-group-title">추가 태그</div><div class="facet-chips">${unknown.map(v=>facetOptionHTML(key,v,selected.includes(v),prefix)).join('')}</div></div>`:'');
}
function facetFieldsBlockHTML(keys,prefix,selected){return keys.map(key=>`<section class="facet-field"><div class="facet-heading">${FACET_NAMES[key]}</div>${FACET_DESCRIPTIONS[key]?`<div class="facet-description">${FACET_DESCRIPTIONS[key]}</div>`:''}${facetGroupContent(key,facetVisibleOptions(key,selected[key]),selected[key],prefix)}</section>`).join('');}
function renderSpecialtyEditorSections(prefix,facets){
  const keys=specialtyKeysForAreas(facets.contentArea||[]);
  if(!keys.length) return '<div class="facet-domain-hint">위에서 분석 분야를 고르면 광고·크리에이터·브랜드·문화 등 해당 분야의 전용 분석 태그가 나타납니다.</div>';
  return `<section class="facet-section specialized-facets"><div class="facet-section-title">분야별 심화 분석</div><div class="facet-section-description">선택한 분석 분야에 필요한 질문만 표시합니다. 해당 분야만으로 성과가 자동 추정되지는 않습니다.</div>${facetFieldsBlockHTML(keys,prefix,facets)}</section>`;
}
function facetFieldsHTML(prefix,values={}){
  const selected=cleanFacets(values);selected.hex=values?.hex||'';
  editorFacetDrafts[prefix]={...selected};
  const legacyCount=LEGACY_FACET_KEYS.reduce((sum,key)=>sum+(selected[key]?.length||0),0);
  return `<section class="facet-section domain-editor-section"><div class="facet-section-title">01. 콘텐츠 분석 분야 <small>복수 선택</small></div><div class="facet-section-description">광고, 브랜드, 인플루언서, SNS, 공연 등 최상위 분야를 먼저 분류합니다.</div><div class="editor-domain-grid">${facetGroupContent('contentArea',facetVisibleOptions('contentArea',selected.contentArea),selected.contentArea,prefix)}</div></section>`+
  `<section class="facet-section"><div class="facet-section-title">02. 공통 분석</div><div class="facet-section-description">모든 분야에서 공통으로 비교할 수 있는 기준</div>${facetFieldsBlockHTML(COMMON_FACET_KEYS,prefix,selected)}</section>`+
  `<div id="${prefix}-specialized-fields">${renderSpecialtyEditorSections(prefix,selected)}</div>`+
  `<section class="facet-section"><div class="facet-section-title">비주얼 분석</div>${facetFieldsBlockHTML(VISUAL_FACET_KEYS,prefix,selected)}</section>`+
  `<section class="facet-field"><div class="facet-heading">대표 색상 HEX</div><input class="detail-input" id="${prefix}-hex" placeholder="#3B82F6" value="${esc(values?.hex||'')}"></section>`+
  (legacyCount?`<div class="facet-legacy-hint">이전 분류 ${legacyCount}개를 호환 보존합니다. 보이지 않는 태그는 수정해도 삭제되지 않습니다.</div>`:'');
}
function readEditorSelections(prefix){
  const result={...cleanFacets(editorFacetDrafts[prefix]||{})};
  const keys=new Set([...document.querySelectorAll(`[data-prefix="${prefix}"][data-facet]`)].map(el=>el.dataset.facet));
  for(const key of keys){result[key]=[...document.querySelectorAll(`[data-prefix="${prefix}"][data-facet="${key}"]:checked`)].map(x=>x.value);}
  return result;
}
function updateDomainEditor(prefix){
  const selected=readEditorSelections(prefix);
  editorFacetDrafts[prefix]=selected;
  const target=$(prefix+'-specialized-fields');if(target)target.innerHTML=renderSpecialtyEditorSections(prefix,selected);
}
function readFacetFields(prefix,base={}){
  const result={...cleanFacets(base),...readEditorSelections(prefix)};
  result.hex=($(prefix+'-hex')?.value||'').trim().toUpperCase();
  if(result.hex&&!/^#[0-9A-F]{6}$/.test(result.hex)){showToast('대표 색상은 #RRGGBB 형식으로 입력하세요.','error');result.hex=base?.hex||'';}
  return result;
}
function renderFacetFilterCollection(rootId,keys){
  const root=$(rootId);if(!root)return;
  const openKeys=new Set([...root.querySelectorAll('details[open]')].map(d=>d.dataset.key));
  root.innerHTML=keys.map(key=>{
    const values=[...new Set([...FACETS[key],...items.flatMap(it=>it.facets?.[key]||[]).filter(v=>typeof v==='string')])];
    const groups=FACET_GROUPS[key]||[['',values]];
    const grouped=new Set(groups.flatMap(([,arr])=>arr));
    const extras=values.filter(v=>!grouped.has(v));
    const allGroups=[...groups,...(extras.length?[['추가 태그',extras]]:[])];
    return `<details class="facet-filter" data-key="${key}" ${(openKeys.has(key)||(!root.dataset.initialized&&PRIMARY_OPEN_KEYS.includes(key)))?'open':''}><summary>${FACET_NAMES[key]} <small id="facet-count-${key}"></small></summary>${FACET_DESCRIPTIONS[key]?`<div class="facet-filter-desc">${FACET_DESCRIPTIONS[key]}</div>`:''}${allGroups.map(([groupName,opts])=>`<div class="facet-filter-group">${groupName?`<div class="facet-filter-group-title">${groupName}</div>`:''}<div class="facet-filter-options">${opts.map(v=>`<label>${key==='color'?`<i class="ref-swatch" style="background:${COLOR_SWATCHES[v]||'#888'}"></i>`:''}<input type="checkbox" data-filter-facet="${key}" value="${esc(v)}" ${facetFilters[key]?.includes(v)?'checked':''}>${esc(v)}</label>`).join('')}</div></div>`).join('')}</details>`;
  }).join('');
  root.dataset.initialized='1';
  root.querySelectorAll('input').forEach(el=>el.onchange=()=>{const k=el.dataset.filterFacet;const set=new Set(facetFilters[k]||[]);el.checked?set.add(el.value):set.delete(el.value);facetFilters[k]=[...set];renderBoard();updateFacetFilterCounts();});
}
function renderAreaSelector(){
  const root=$('area-selector');if(!root)return;
  const allActive=activeAreaFilters.size===0;
  root.innerHTML=`<button type="button" class="area-nav-all${allActive?' is-active':''}" aria-pressed="${allActive}" onclick="clearAreaFilters()"><span>전체 분야</span><small>${items.length}</small></button>`+
    CONTENT_AREAS.map(a=>{const active=activeAreaFilters.has(a.name);const count=items.filter(it=>(it.facets?.contentArea||[]).includes(a.name)).length;
      return `<button type="button" class="area-nav-item${active?' is-active':''}" aria-pressed="${active}" onclick="toggleAreaFilter('${a.name}')" title="${esc(a.desc)}"><span class="area-nav-code">${a.code}</span><span class="area-nav-name">${esc(a.short)}</span><small>${count}</small></button>`;
    }).join('');
  const desc=$('area-selector-description');
  if(desc)desc.textContent=allActive?'공통 태그로 전체 탐색 · 분야를 선택하면 심화 필터 표시':`${[...activeAreaFilters].join(' + ')} 분석 중 · 선택한 분야끼리는 OR 검색`;
}
function clearAreaFilters(){activeAreaFilters.clear();renderAreaSelector();renderFacetFilters();renderBoard();}
function toggleAreaFilter(value){
  if(activeAreaFilters.has(value))activeAreaFilters.delete(value);else activeAreaFilters.add(value);
  renderAreaSelector();renderFacetFilters();renderBoard();
}
function visibleSpecialtyKeys(){
  if(activeAreaFilters.size===0)return [...new Set(SPECIALTY_FACET_KEYS.filter(key=>(facetFilters[key]||[]).length))];
  return [...new Set([...specialtyKeysForAreas([...activeAreaFilters]),...SPECIALTY_FACET_KEYS.filter(key=>(facetFilters[key]||[]).length)])];
}
function renderFacetFilters(){
  renderAreaSelector();
  renderFacetFilterCollection('common-facet-filters',COMMON_FACET_KEYS);
  const specialized=visibleSpecialtyKeys();
  const specialSection=$('specialty-filter-section');if(specialSection)specialSection.hidden=!specialized.length;
  renderFacetFilterCollection('specialty-facet-filters',specialized);
  renderFacetFilterCollection('visual-facet-filters',VISUAL_FACET_KEYS);
  updateFacetFilterCounts();
}
function updateFacetFilterCounts(){for(const key of PRIMARY_FACET_KEYS){const node=$('facet-count-'+key);if(node)node.textContent=facetFilters[key]?.length?`${facetFilters[key].length}개 선택`:'';}}
function resetFacetFilters(){facetFilters={};classificationFilter='all';activeAreaFilters.clear();if($('classification-filter'))$('classification-filter').value='all';renderFacetFilters();renderBoard();}
function expandAllFacetTrees(open){document.querySelectorAll('.facet-filter-tree details').forEach(d=>d.open=open);}
function clearNavigatorFilters(){
  facetFilters={};classificationFilter='all';currentFilter='all';currentCatFilter=null;activeAreaFilters.clear();
  const field=$('search-input');if(field)field.value='';
  if($('classification-filter'))$('classification-filter').value='all';
  document.querySelectorAll('.sb-btn[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter==='all'));
  renderFacetFilters();renderBoard();
}
function removeFacetChip(key,value){
  facetFilters[key]=(facetFilters[key]||[]).filter(v=>v!==value);
  renderFacetFilters();renderBoard();
}
function renderNavigatorChips(){
  const target=$('active-filter-chips');if(!target)return;
  target.replaceChildren();
  const add=(label,callback)=>{const b=document.createElement('button');b.type='button';b.className='active-filter-chip';b.textContent=label+' ×';b.addEventListener('click',callback);target.appendChild(b);};
  [...activeAreaFilters].forEach(v=>add('분야 · '+v,()=>toggleAreaFilter(v)));
  Object.entries(facetFilters).forEach(([k,vs])=>(vs||[]).forEach(v=>add(`${FACET_NAMES[k]||k} · ${v}`,()=>removeFacetChip(k,v))));
  if(currentFilter!=='all')add('유형 · '+({image:'이미지',video:'영상',carousel:'캐러셀',link:'링크'}[currentFilter]||currentFilter),()=>{currentFilter='all';document.querySelectorAll('.sb-btn[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter==='all'));renderBoard();});
  if(classificationFilter!=='all')add(classificationFilter==='classified'?'분류 완료':'미분류',()=>{classificationFilter='all';$('classification-filter').value='all';renderBoard();});
  const q=$('search-input')?.value.trim();if(q)add('검색 · '+q,()=>{$('search-input').value='';renderBoard();});
  const label=$('search-results-label');if(label)label.textContent=target.children.length?`${target.children.length}개 검색 조건 적용 중`:'전체 레퍼런스 탐색';
}
// 동일한 제목을 가진 별도 레퍼런스는 분류 태그만 공유합니다.
function normalizedReferenceTitle(title){const v=String(title||'').normalize('NFKC').replace(/\s+/g,' ').trim().toLocaleLowerCase();return (!v||['제목없음','untitled','image','붙여넣기 이미지'].includes(v))?'':v;}
function sameTitleReferences(title,excludeId){const key=normalizedReferenceTitle(title);return key?items.filter(it=>it.id!==excludeId&&normalizedReferenceTitle(it.title)===key):[];}
function isEmptyClassification(facets){return !Object.entries(facets||{}).some(([k,v])=>k!=='hex'&&Array.isArray(v)&&v.length>0)&&!facets?.hex;}
function matchingClassification(title,excludeId){return sameTitleReferences(title,excludeId).find(it=>!isEmptyClassification(it.facets))?.facets||null;}
function synchronizeTitleFacets(source){const duplicates=sameTitleReferences(source.title,source.id);for(const item of duplicates)item.facets={...cleanFacets(source.facets),hex:source.facets?.hex||''};return duplicates.length;}
function inheritTitleFacets(item){const existing=matchingClassification(item.title,item.id);if(existing&&isEmptyClassification(item.facets))item.facets={...cleanFacets(existing),hex:existing.hex||''};}
function isClassified(it){return Object.entries(it.facets||{}).some(([key,v])=>key!=='hex'&&Array.isArray(v)&&v.length>0);}
function legacyMemo(it){return [it.notes,it.visualNotes&&`[기존 비주얼 메모]\n${it.visualNotes}`,it.contentNotes&&`[기존 콘텐츠 메모]\n${it.contentNotes}`,it.caption&&`[기존 본문]\n${it.caption}`,it.imageCopy&&`[기존 이미지 카피]\n${it.imageCopy}`,it.hook&&`[기존 훅]\n${it.hook}`,it.cta&&`[기존 CTA]\n${it.cta}`].filter(Boolean).join('\n\n');}

const CAT_COLORS=['#ff6b35','#ff3b8b','#7b5cfa','#3b9eff','#3bfa8a','#ffd23b','#ff5555','#00d4d4','#ffaa3b','#c8f060'];
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
const MANUAL_DRIVE_DIRTY_KEY='refboard_manual_drive_pending_v1';

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
const DRIVE_FETCH_CONCURRENCY=6;
const CARD_THUMB_SIZE=192;
const PRIORITY_CARD_COUNT=12;
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

// 콘텐츠별 공개 성과 지표. 자동 수집/AI 추정이 아닌 사용자가 확인한 값만 기록합니다.
// null = 미입력, 0 = 실제 0회/0개. 이전 레퍼런스 데이터와도 호환됩니다.
function normalizeSocialCount(value){
  if(value === null || value === undefined || String(value).trim() === '') return null;
  const raw=String(value).replace(/,/g,'').trim();
  if(!/^\d+$/.test(raw)) return null;
  const n=Number(raw);
  return Number.isSafeInteger(n) && n>=0 ? n : null;
}
function normalizeSocialMetrics(raw={}){
  const source=raw && typeof raw==='object' && !Array.isArray(raw) ? raw : {};
  return {...source,
    views:normalizeSocialCount(source.views),
    likes:normalizeSocialCount(source.likes),
    comments:normalizeSocialCount(source.comments),
    recordedAt:typeof source.recordedAt==='string'?source.recordedAt:''
  };
}
function getItemSocialMetrics(raw={}){
  const source=raw.socialMetrics && typeof raw.socialMetrics==='object' ? raw.socialMetrics :
    (raw.engagement && typeof raw.engagement==='object'?raw.engagement:
    (raw.metrics && typeof raw.metrics==='object'?raw.metrics:{}));
  return normalizeSocialMetrics({
    ...source,
    views:source.views??raw.viewCount??raw.views??null,
    likes:source.likes??raw.likeCount??raw.likes??null,
    comments:source.comments??raw.commentCount??null
  });
}
function socialCountText(value){return value===null||value===undefined?'':Number(value).toLocaleString('ko-KR');}
function readSocialCount(id,label){
  const raw=$(id)?.value?.trim()??'';
  if(!raw)return null;
  if(!/^(?:\d{1,3}(?:,\d{3})+|\d+)$/.test(raw)){
    throw new Error(`${label}는 0 이상의 정수로 입력해 주세요. (예: 12,345)`);
  }
  const num=Number(raw.replace(/,/g,''));
  if(!Number.isSafeInteger(num)||num<0)throw new Error(`${label}가 입력 가능한 숫자 범위를 벗어났습니다.`);
  return num;
}
function collectSocialMetricInputs(prefix,existing={}){
  const previous=normalizeSocialMetrics(existing);
  const views=readSocialCount(`${prefix}-views`,'조회수');
  const likes=readSocialCount(`${prefix}-likes`,'좋아요 수');
  const comments=readSocialCount(`${prefix}-comments`,'댓글 수');
  const changed=previous.views!==views || previous.likes!==likes || previous.comments!==comments;
  return {...previous,views,likes,comments,
    recordedAt:changed?(views!==null||likes!==null||comments!==null?new Date().toISOString():''):previous.recordedAt
  };
}
function socialMetricInputsHTML(prefix,metrics={}){
  const m=normalizeSocialMetrics(metrics);
  const updated=m.recordedAt && !Number.isNaN(Date.parse(m.recordedAt))
    ? `<span class="social-metric-recorded">마지막 기록: ${esc(new Date(m.recordedAt).toLocaleString('ko-KR'))}</span>` : '';
  return `<section class="social-metric-editor" aria-label="콘텐츠 공개 성과 기록">
    <div class="social-metric-editor-heading">콘텐츠 반응 지표 <small>수동 기록</small></div>
    <div class="social-metric-input-grid">
      <div class="form-row"><label class="form-label" for="${prefix}-views">조회수</label><input type="text" inputmode="numeric" autocomplete="off" class="detail-input" id="${prefix}-views" value="${socialCountText(m.views)}" placeholder="예: 12,345" aria-label="조회수"></div>
      <div class="form-row"><label class="form-label" for="${prefix}-likes">좋아요 수</label><input type="text" inputmode="numeric" autocomplete="off" class="detail-input" id="${prefix}-likes" value="${socialCountText(m.likes)}" placeholder="예: 567" aria-label="좋아요 수"></div>
      <div class="form-row"><label class="form-label" for="${prefix}-comments">댓글 수</label><input type="text" inputmode="numeric" autocomplete="off" class="detail-input" id="${prefix}-comments" value="${socialCountText(m.comments)}" placeholder="예: 42" aria-label="댓글 수"></div>
    </div>
    <p class="social-metric-help">직접 확인한 숫자만 입력합니다. 빈칸은 미입력이며 0과 구분됩니다. API 호출 없이 저장됩니다.</p>${updated}
  </section>`;
}
function socialMetricCardHTML(it){
  const m=normalizeSocialMetrics(it.socialMetrics);
  if(m.views===null && m.likes===null && m.comments===null)return '';
  return `<div class="card-social-metrics" aria-label="직접 기록한 성과"><span>${m.views===null?'조회 —':'조회 '+socialCountText(m.views)}</span><span>${m.likes===null?'좋아요 —':'좋아요 '+socialCountText(m.likes)}</span><span>${m.comments===null?'댓글 —':'댓글 '+socialCountText(m.comments)}</span></div>`;
}

function normalizeItem(raw={}){
  let src=raw.src || raw.url || raw.mediaUrl || '';
  const sourceUrl=raw.sourceUrl || raw.source_url || '';
  let driveFileId=raw.driveFileId || raw.fileId || extractGoogleDriveFileId(src) || extractGoogleDriveFileId(sourceUrl) || '';
  let type=raw.type || (String(raw.mimeType||raw.fileType||'').startsWith('video/')?'video':'image');

  // sourceUrl에만 남은 이미지 주소와 Google Drive 공유 링크를 자동 복구합니다.
  if(!src && isDirectMediaUrl(sourceUrl)) src=sourceUrl;
  if(type!=='carousel' && type!=='video' && type!=='image' && type!=='link') type=guessType(src||sourceUrl);

  return {
    id: raw.id || uid(),
    title: first(raw.title, raw.name, raw.filename, '제목없음'),
    type,
    src,
    previewSrc: raw.previewSrc || '',
    driveFileId,
    mimeType: raw.mimeType || raw.fileType || '',
    thumbnailLink: raw.thumbnailLink || raw.thumbnail || '',
    fileName: raw.fileName || raw.filename || raw.name || fileNameFromUrl(src) || '',
    localBlobKey: raw.localBlobKey || '',
    catIds: Array.isArray(raw.catIds)?raw.catIds:[],
    facets: {...migrateDecisionFacets(raw.facets), hex: raw.facets?.hex || ''},
    memoMigrated: true,
    platform: raw.platform || '', brand: raw.brand || '', sourceType: raw.sourceType || raw.source_type || '', sourceUrl,
    caption: '', hook: '', cta: '',
    imageCopy: '',
    visualNotes: '', contentNotes: '', notes: raw.memoMigrated ? (raw.notes || '') : legacyMemo(raw),
    carousel: Array.isArray(raw.carousel)?raw.carousel.map(slide=>normalizeMediaRef(slide)):[],
    ts: raw.ts || raw.createdAt || Date.now(),
    _file: raw._file,
    videoAnalysis: raw.videoAnalysis && typeof raw.videoAnalysis==='object' ? normalizeVideoAnalysis(raw.videoAnalysis) : null,
    socialMetrics: getItemSocialMetrics(raw)
  };
}

// 영상 분석 상태만 JSON으로 저장합니다. 프레임 Blob은 IndexedDB에 별도 보관됩니다.
function normalizeVideoAnalysis(raw){
  const result=raw.result&&typeof raw.result==='object'?raw.result:null;
  return {mode:raw.mode==='full'?'full':'frames',status:['queued','done','error'].includes(raw.status)?raw.status:'queued',
    requestedAt:String(raw.requestedAt||''),analyzedAt:String(raw.analyzedAt||''),model:String(raw.model||''),
    frames:Array.isArray(raw.frames)?raw.frames.slice(0,6).map(f=>({timeSec:Number(f.timeSec)||0,localBlobKey:String(f.localBlobKey||''),driveFileId:String(f.driveFileId||''),fileName:String(f.fileName||'')})):[],
    result,usage:raw.usage&&typeof raw.usage==='object'?raw.usage:null,error:String(raw.error||''),
     tagging:raw.tagging&&typeof raw.tagging==='object'?{added:Number(raw.tagging.added)||0,total:Number(raw.tagging.total)||0,appliedAt:String(raw.tagging.appliedAt||'')}:null};
}

function normalizeMediaRef(raw={}){
  let src=raw.src || raw.url || raw.mediaUrl || '';
  const sourceUrl=raw.sourceUrl || raw.source_url || '';
  if(!src && isDirectMediaUrl(sourceUrl)) src=sourceUrl;
  return {
    ...raw,
    id:raw.id||uid('s'),
    src,
    sourceUrl,
    driveFileId:raw.driveFileId||raw.fileId||extractGoogleDriveFileId(src)||extractGoogleDriveFileId(sourceUrl)||'',
    fileName:raw.fileName||raw.filename||raw.name||fileNameFromUrl(src)||'',
    mimeType:raw.mimeType||raw.fileType||'',
    thumbnailLink:raw.thumbnailLink||raw.thumbnail||'',
    localBlobKey:raw.localBlobKey||''
  };
}

function isDirectMediaUrl(url=''){
  return /^(?:https?:|data:|blob:)/i.test(String(url)) && /\.(?:png|jpe?g|gif|webp|avif|svg|mp4|webm|mov|m4v)(?:[?#].*)?$/i.test(String(url));
}

function extractGoogleDriveFileId(url=''){
  const value=String(url||'');
  const patterns=[/\/d\/([a-zA-Z0-9_-]{20,})/,/[?&]id=([a-zA-Z0-9_-]{20,})/,/\/file\/d\/([a-zA-Z0-9_-]{20,})/];
  for(const pattern of patterns){ const match=value.match(pattern); if(match) return match[1]; }
  return '';
}

function fileNameFromUrl(url=''){
  if(!url) return '';
  try{
    const parsed=new URL(String(url),location.href);
    return decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop()||'').split('?')[0].split('#')[0];
  }catch(e){
    return decodeURIComponent(String(url).split(/[?#]/)[0].split('/').pop()||'');
  }
}

function hasMediaReference(media){
  return !!(media && (media._file || media.previewSrc || media.localBlobKey || media.driveFileId || media.src || isDirectMediaUrl(media.sourceUrl)));
}

function repairAndPruneMediaItems(){
  let linked=0, removed=0;
  const repaired=[];
  for(const raw of items){
    const it=normalizeItem(raw);
    if(!it.src && isDirectMediaUrl(it.sourceUrl)){ it.src=it.sourceUrl; linked++; }
    if(!it.driveFileId){
      const driveId=extractGoogleDriveFileId(it.src)||extractGoogleDriveFileId(it.sourceUrl);
      if(driveId){ it.driveFileId=driveId; linked++; }
    }

    if(it.type==='carousel'){
      const before=it.carousel.length;
      it.carousel=it.carousel.map(normalizeMediaRef).filter(hasMediaReference);
      removed+=before-it.carousel.length;
      if(!it.carousel.length){ removed++; continue; }
    }else if(it.type==='image' || it.type==='video'){
      if(!hasMediaReference(it)){ removed++; continue; }
    }else if(it.type==='link'){
      if(!it.sourceUrl && !it.src){ removed++; continue; }
      if(!it.sourceUrl && it.src) it.sourceUrl=it.src;
    }
    repaired.push(it);
  }
  items=repaired;
  state={groups,categories,items};
  return {linked,removed};
}

// 브라우저에는 자동 저장하지만, Google Drive에는 사용자가 버튼을 누를 때만 저장합니다.
function isManualDrivePending(){ return localStorage.getItem(MANUAL_DRIVE_DIRTY_KEY)==='1'; }
function setManualDrivePending(pending){
  if(pending) localStorage.setItem(MANUAL_DRIVE_DIRTY_KEY,'1');
  else localStorage.removeItem(MANUAL_DRIVE_DIRTY_KEY);
  updateDriveUi();
}
function updateAutosave(mode){
  const el=$('autosave-indicator');
  if(el){ el.style.color=mode==='saving'?'var(--orange)':'var(--green)'; el.title=mode==='saving'?'브라우저에 저장 중':'브라우저 로컬 저장 완료 (Google Drive는 수동 저장)'; }
}
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
    delete o._file; delete o.previewSrc; delete o._uploading;
    if(typeof o.src==='string' && o.src.startsWith('blob:')) o.src='';
    if(Array.isArray(o.carousel)) o.carousel=o.carousel.map(sl=>{ const s={...sl}; delete s._file; delete s.previewSrc; delete s._uploading; if(typeof s.src==='string' && s.src.startsWith('blob:')) s.src=''; return s; });
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
  setManualDrivePending(true); // 변경사항은 로컬에 보관하고, Drive 저장은 실행하지 않음
  await localCachePromise;
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
  const status=$('gdrive-status');
  if(status){
    const pending=isManualDrivePending();
    status.textContent=connected?(pending?'Drive 저장 필요':'Drive 연결됨 · 수동 저장'):(pending?'로컬 변경됨 · Drive 미연결':'Drive 미연결');
    status.title=pending?'변경사항은 브라우저에만 저장되어 있습니다. Drive 저장을 눌러 반영하세요.':'Google Drive 자동 저장이 꺼져 있습니다.';
    status.style.color=pending?'var(--orange)':'var(--t3)';
  }
  const saveBtn=$('gdrive-save-btn');
  if(saveBtn) saveBtn.title=isManualDrivePending()?'Drive에 저장되지 않은 로컬 변경사항이 있습니다. 클릭하면 저장합니다.':'Google Drive에 수동 저장';
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
    const url='https://www.googleapis.com/drive/v3/files?spaces=drive&supportsAllDrives=true&includeItemsFromAllDrives=true&fields='+encodeURIComponent('nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,parents,thumbnailLink,webContentLink,md5Checksum)')+'&pageSize=1000&q='+encodeURIComponent(q)+(pageToken?'&pageToken='+encodeURIComponent(pageToken):'');
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
function cleanFileBase(name=''){
  const base=fileNameFromUrl(String(name||'')).replace(/\.[^.]+$/,'');
  return base.normalize('NFKC').replace(/[\s_\-]+/g,' ').trim().toLowerCase();
}

function fileToDriveItem(f){
  return normalizeItem({id:'d'+f.id,title:f.name,type:(f.mimeType||'').startsWith('video/')?'video':'image',driveFileId:f.id,mimeType:f.mimeType,fileName:f.name,thumbnailLink:f.thumbnailLink||'',ts:f.modifiedTime?Date.parse(f.modifiedTime):Date.now(),sourceType:'drive_assets'});
}

let _ensureDriveFolderPromise=null;
async function ensureDriveFolder(){
  if(gdriveFolderId) return gdriveFolderId;
  if(_ensureDriveFolderPromise) return _ensureDriveFolderPromise; // 동시 호출 시 폴더가 2개 생기는 것 방지
  _ensureDriveFolderPromise=(async()=>{
    let folder=await findDriveFile(DRIVE_ROOT_FOLDER_NAME,'application/vnd.google-apps.folder');
    if(!folder){
      const meta={name:DRIVE_ROOT_FOLDER_NAME,mimeType:'application/vnd.google-apps.folder'};
      folder=await (await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id,name',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(meta)})).json();
    }
    gdriveFolderId=folder.id;
    const data=await findDriveFile(DRIVE_DATA_FILE_NAME,'application/json',gdriveFolderId); if(data) gdriveDataFileId=data.id;
    return gdriveFolderId;
  })();
  try{ return await _ensureDriveFolderPromise; } finally{ _ensureDriveFolderPromise=null; }
}

let _ensureAssetFolderPromise=null;
async function ensureAssetFolder(){
  if(gdriveAssetFolderId) return gdriveAssetFolderId;
  if(_ensureAssetFolderPromise) return _ensureAssetFolderPromise; // 동시 호출 시 폴더가 2개 생기는 것 방지
  _ensureAssetFolderPromise=(async()=>{
    const rootId=await ensureDriveFolder();
    let folder=await findDriveFile(DRIVE_ASSET_FOLDER_NAME,'application/vnd.google-apps.folder',rootId);
    if(!folder){
      const meta={name:DRIVE_ASSET_FOLDER_NAME,mimeType:'application/vnd.google-apps.folder',parents:[rootId]};
      folder=await (await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id,name',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(meta)})).json();
    }
    gdriveAssetFolderId=folder.id;
    return gdriveAssetFolderId;
  })();
  try{ return await _ensureAssetFolderPromise; } finally{ _ensureAssetFolderPromise=null; }
}

// Google Drive 공식 resumable 프로토콜: 5MB를 넘는 이미지도 4MB 청크로 전송.
// 업로드 중 통신이 끊기면 세션에 수신 범위를 조회한 뒤 이어서 보냅니다.
const DRIVE_UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
const DRIVE_UPLOAD_RETRY_LIMIT = 3;
const driveUploadDelay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getResumableUploadProgress(sessionUrl, size){
  const token=await ensureDriveToken();
  const res=await fetch(sessionUrl,{
    method:'PUT',
    headers:{Authorization:`Bearer ${token}`,'Content-Range':`bytes */${size}`}
  });
  if(res.ok) return {complete:await res.json()};
  if(res.status===308){
    const match=(res.headers.get('Range')||'').match(/bytes=0-(\d+)/);
    return {offset:match?Number(match[1])+1:0};
  }
  const detail=await res.text().catch(()=>'');
  throw new Error(`업로드 세션 확인 실패 (${res.status}): ${detail.slice(0,200)}`);
}

async function uploadBlobToDrive(blob,name,mimeType,parentId=null){
  if(!(blob instanceof Blob)) throw new Error(`${name}: 업로드할 원본 파일을 찾을 수 없습니다.`);
  const folderId=parentId || await ensureAssetFolder();
  const type=mimeType||blob.type||'application/octet-stream';
  const metadata={name,parents:[folderId],mimeType:type};

  const begin=await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,thumbnailLink',{
    method:'POST',
    headers:{'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Type':type,'X-Upload-Content-Length':String(blob.size)},
    body:JSON.stringify(metadata)
  });
  const session=begin.headers.get('Location');
  if(!session) throw new Error('Google Drive가 업로드 세션 주소를 제공하지 않았습니다. 브라우저의 네트워크/CORS 설정을 확인하세요.');

  let offset=0;
  while(offset<blob.size){
    const end=Math.min(offset+DRIVE_UPLOAD_CHUNK_BYTES,blob.size);
    let sent=false;
    for(let attempt=0;attempt<DRIVE_UPLOAD_RETRY_LIMIT && !sent;attempt++){
      try{
        const token=await ensureDriveToken();
        const res=await fetch(session,{
          method:'PUT',
          headers:{Authorization:`Bearer ${token}`,'Content-Type':type,'Content-Range':`bytes ${offset}-${end-1}/${blob.size}`},
          body:blob.slice(offset,end)
        });
        if(res.status===308){
          const match=(res.headers.get('Range')||'').match(/bytes=0-(\d+)/);
          offset=match?Number(match[1])+1:end;
          sent=true;
          continue;
        }
        if(res.ok){
          const uploaded=await res.json();
          if(!uploaded.id)throw new Error('Drive가 업로드 완료 파일 ID를 반환하지 않았습니다.');
          return uploaded;
        }
        const errorText=await res.text().catch(()=>'');
        if(![429,500,502,503,504].includes(res.status))
          throw new Error(`Drive 업로드 오류 ${res.status}: ${errorText.slice(0,200)}`);
        throw new Error(`일시적 Drive 업로드 오류 ${res.status}`);
      }catch(err){
        // 실패한 청크를 무조건 다시 보내지 않고 Drive에 수신 상태를 먼저 조회합니다.
        try{
          const progress=await getResumableUploadProgress(session,blob.size);
          if(progress.complete){
            if(!progress.complete.id)throw new Error('Drive 업로드 응답에 파일 ID가 없습니다.');
            return progress.complete;
          }
          offset=progress.offset;
          if(offset>=end){sent=true;continue;}
        }catch(checkErr){
          console.warn('Drive 업로드 복구 확인 실패:',checkErr);
          if(attempt===DRIVE_UPLOAD_RETRY_LIMIT-1)throw err;
        }
        if(attempt===DRIVE_UPLOAD_RETRY_LIMIT-1)throw err;
        await driveUploadDelay(650*(attempt+1));
      }
    }
  }
  // 308만 받고 끝난 드문 경우, 서버에서 완료 상태를 최종 확인합니다.
  const result=await getResumableUploadProgress(session,blob.size);
  if(result.complete?.id)return result.complete;
  throw new Error('Google Drive 업로드가 끝까지 확인되지 않았습니다. 저장을 다시 눌러주세요.');
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

// 새로고침 전후 모두 로컬 IndexedDB에서 원본 파일을 복구해 Drive에 저장합니다.
// 기존에 성공한 슬라이드는 재업로드하지 않으므로 부분 실패 뒤 재시도가 가능합니다.
let driveSaveBusy=false;
async function saveToDrive(silent=false){
  if(driveSaveBusy){if(!silent)showToast('Google Drive에 저장 중입니다.','');return false;}
  driveSaveBusy=true;
  let currentMedia='';
  let completed=0;
  try{
    await cachePendingLocalFiles();
    await ensureDriveToken();
    await ensureDriveFolder();

    const pending=[];
    items.forEach(it=>{
      if((it.type==='image'||it.type==='video')&&!it.driveFileId&&(it._file||it.localBlobKey))
        pending.push({media:it,label:it.title||it.fileName||'단일 파일'});
      if(it.type==='carousel'){
        (it.carousel||[]).forEach((slide,index)=>{
          if(!slide.driveFileId && (slide._file||slide.localBlobKey))
            pending.push({media:slide,label:`${it.title||'캐러셀'} (${index+1}/${it.carousel.length})`});
        });
      }
    });

    for(const {media,label} of pending){
      currentMedia=label;
      const blob=media._file||await getLocalBlob(media.localBlobKey);
      if(!blob)throw new Error(`${label}: 브라우저에 원본 파일이 없습니다. 이미지 원본을 다시 첨부해 주세요.`);
      const f=await uploadBlobToDrive(blob,media.fileName||label,media.mimeType||blob.type||'application/octet-stream');
      media.driveFileId=f.id;
      media.mimeType=f.mimeType||media.mimeType;
      media.thumbnailLink=f.thumbnailLink||media.thumbnailLink||'';
      delete media._file;
      completed++;
      // 부분 성공 상태를 즉시 로컬 저장하여 다음 재시도에서 중복 업로드 방지.
      saveLocal();
    }

    // 아직 원본이 업로드되지 않은 미디어가 있으면 JSON만 먼저 저장하지 않습니다.
    const missing=[];
    items.forEach(it=>{
      if((it.type==='image'||it.type==='video')&&it.localBlobKey&&!it.driveFileId)missing.push(it.title||it.fileName||it.id);
      if(it.type==='carousel') (it.carousel||[]).forEach(slide=>{
        if(slide.localBlobKey&&!slide.driveFileId)missing.push(slide.fileName||slide.id);
      });
    });
    if(missing.length)throw new Error(`업로드하지 못한 이미지 ${missing.length}개가 있습니다. (${missing[0]})`);

    currentMedia='레퍼런스 목록(JSON)';
    await uploadDataFile();
    // 매체 및 JSON이 Drive에 안전하게 업로드된 다음에만 삭제 예약을 처리합니다.
    const pendingDeleteIds=[...getDeletedDriveIds()];
    if(pendingDeleteIds.length){
      const results=await Promise.allSettled(pendingDeleteIds.map(deleteDriveFile));
      const failed=pendingDeleteIds.filter((_,i)=>results[i].status==='rejected');
      persistDeletedDriveIds(new Set(failed));
      if(failed.length){
        setManualDrivePending(true);
        if(!silent)showToast(`레퍼런스 저장 완료 · 삭제 예약 ${failed.length}개는 다음에 재시도됩니다.`,'error');
        return false;
      }
    }
    saveLocal();
    setManualDrivePending(false);
    if(!silent)showToast(`Google Drive 저장 완료${completed?` · 미디어 ${completed}개 업로드`:''}`,'success');
    return true;
  }catch(e){
    console.error('Google Drive 수동 저장 실패:',{step:currentMedia,completed,error:e});
    setManualDrivePending(true);
    const prefix=currentMedia?`${currentMedia} 저장 실패`: 'Drive 저장 실패';
    const msg=e instanceof TypeError && /fetch/i.test(e.message)?'네트워크 연결 또는 Google Drive 요청 차단을 확인해 주세요.':(e.message||'알 수 없는 오류');
    if(!silent)showToast(`${prefix}: ${msg}`,'error');
    return false;
  }finally{driveSaveBusy=false;}
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
      const candidates=[it.fileName,it.title,fileNameFromUrl(it.src),fileNameFromUrl(it.sourceUrl)].filter(Boolean).map(cleanFileBase);
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
        const sc=[slide.fileName,slide.title,fileNameFromUrl(slide.src),fileNameFromUrl(slide.sourceUrl)].filter(Boolean).map(cleanFileBase);
        const sh=sc.map(k=>byName.get(k)).find(Boolean);
        if(sh){
          slide.driveFileId=sh.id; slide.mimeType=slide.mimeType||sh.mimeType; slide.fileName=slide.fileName||sh.name; slide.thumbnailLink=slide.thumbnailLink||sh.thumbnailLink||'';
          linked++;
        }
      }
    }
  }

  // 📎 완전히 동일한 파일(MD5 체크섬 일치)을 가리키는 아이템이 이미 2개 이상 있으면 하나로 병합.
  // 예전 버전에서 업로드가 겹쳐 실행되어 같은 사진이 Drive에 2벌 저장된 경우를 자동으로 정리.
  // 태그(catIds)는 합쳐서 보존하고, 나머지 항목만 제거함.
  let merged=0;
  {
    const seenByMd5=new Map();
    const toRemove=new Set();
    items.forEach(it=>{
      const md5=byId.get(it.driveFileId)?.md5Checksum;
      if(!md5) return;
      const keeper=seenByMd5.get(md5);
      if(!keeper){ seenByMd5.set(md5,it); return; }
      const mergedCats=new Set([...(keeper.catIds||[]),...(it.catIds||[])]);
      keeper.catIds=[...mergedCats];
      if(!keeper.caption && it.caption) keeper.caption=it.caption;
      toRemove.add(it.id);
    });
    if(toRemove.size){ items=items.filter(it=>!toRemove.has(it.id)); merged=toRemove.size; }
  }

  const existing=new Set();
  const existingMd5=new Set();
  items.forEach(it=>{
    if(it.driveFileId){ existing.add(it.driveFileId); const f=byId.get(it.driveFileId); if(f?.md5Checksum) existingMd5.add(f.md5Checksum); }
    if(Array.isArray(it.carousel)) it.carousel.forEach(s=>{ if(s.driveFileId){ existing.add(s.driveFileId); const f=byId.get(s.driveFileId); if(f?.md5Checksum) existingMd5.add(f.md5Checksum); } });
  });
  files.forEach(f=>{
    if(existing.has(f.id)) return;
    // 파일 ID는 다르지만 이미 등록된 아이템과 내용이 완전히 같은 파일(중복 업로드된 사본)이면 새로 추가하지 않음.
    if(f.md5Checksum && existingMd5.has(f.md5Checksum)) return;
    items.push(fileToDriveItem(f)); existing.add(f.id); if(f.md5Checksum) existingMd5.add(f.md5Checksum); added++;
  });
  buildCarouselGroupsFromLooseAssets();
  removeItemsThatAreCarouselSlides();
  return {linked,added,merged,total:files.length};
}

async function loadFromDrive(){
  if(isManualDrivePending() && !confirm('Drive에 저장되지 않은 로컬 변경사항이 있습니다.\nDrive 데이터를 불러오면 로컬 변경사항이 사라질 수 있습니다. 계속할까요?')) return false;
  const previousPendingDeletes=getDeletedDriveIds();
  try{
    // 명시적으로 불러오기를 선택한 경우 로컬 삭제 예약은 임시 해제합니다.
    // 불러오기 실패 시 기존 삭제 예약을 복원합니다.
    persistDeletedDriveIds(new Set());
    await ensureDriveToken(); await ensureDriveFolder(); await ensureAssetFolder();
    const f=await findDriveFile(DRIVE_DATA_FILE_NAME,'application/json',gdriveFolderId);
    const deleted=new Set();
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
    ensureDefaultTaxonomy();
    saveLocal();
    persistDeletedDriveIds(new Set());
    setManualDrivePending(false);
    renderAll();
    showToast(`Drive 불러오기 완료 · 에셋 ${sync.total}개 / 연결 ${sync.linked}개 / 추가 ${sync.added}개${sync.merged?` / 중복 정리 ${sync.merged}개`:''}`,'success');
    return true;
  }catch(e){ console.error(e); persistDeletedDriveIds(previousPendingDeletes); showToast((e.message||'Drive 불러오기 실패')+' · Google 연결을 다시 눌러 권한을 재승인해주세요','error'); return false; }
}

// Google Apps Script performs analysis independently. This static site only imports its Drive results.
let aiSyncBusy=false;
function updateAiClassificationStats(){
  const el=$('ai-classification-stats'); if(!el)return;
  const total=items.length, classified=items.filter(isClassified).length;
  const eligible=items.filter(it=>(it.type==='image'&&!!it.driveFileId)||(it.type==='carousel'&&Array.isArray(it.carousel)&&it.carousel.some(s=>!!s.driveFileId)));
  const pending=eligible.filter(it=>!isClassified(it)).length;
  el.textContent=`전체 ${total}개 · 분류 완료 ${classified}개 · 분석 가능 미분류 ${pending}개`;
}
// The editor link is public routing information, never store an API key here.
const AI_SCRIPT_PROJECT_URL_KEY='refboard_apps_script_project_url';
function validateAiScriptProjectUrl(raw){
  try {
    const u=new URL(String(raw||'').trim());
    if(u.protocol!=='https:'||u.hostname!=='script.google.com')return '';
    if(!/^\/home\/projects\/[A-Za-z0-9_-]+(?:\/edit)?\/?$/.test(u.pathname))return '';
    return `https://script.google.com${u.pathname.replace(/\/$/,'')}${u.pathname.endsWith('/edit')?'':'/edit'}`;
  }catch(_){return '';}
}
function setAiScriptProjectUrl(){
  const prev=localStorage.getItem(AI_SCRIPT_PROJECT_URL_KEY)||'';
  const entered=window.prompt('Apps Script 프로젝트 편집기 주소를 붙여넣으세요.\n예: https://script.google.com/home/projects/프로젝트ID/edit\n(취소하면 변경하지 않습니다.)',prev);
  if(entered===null)return;
  if(!entered.trim()){
    localStorage.removeItem(AI_SCRIPT_PROJECT_URL_KEY);
    showToast('프로젝트 주소 연결을 해제했습니다.');return;
  }
  const url=validateAiScriptProjectUrl(entered);
  if(!url){showToast('Apps Script 편집기 URL 형식을 확인하세요.','error');return;}
  localStorage.setItem(AI_SCRIPT_PROJECT_URL_KEY,url);
  const msg=$('ai-sync-message');if(msg)msg.textContent='프로젝트 주소를 저장했습니다. Apps Script 열기 버튼으로 바로 이동할 수 있습니다.';
  showToast('Apps Script 프로젝트 연결 완료','success');
}
function openAiScriptConsole(){
  const url=localStorage.getItem(AI_SCRIPT_PROJECT_URL_KEY);
  if(!url||!validateAiScriptProjectUrl(url)){
    setAiScriptProjectUrl();
    const saved=localStorage.getItem(AI_SCRIPT_PROJECT_URL_KEY);
    if(!saved){return;}
    // A popup after prompt can be blocked; inform the user and allow a second click.
    const msg=$('ai-sync-message');if(msg)msg.textContent='프로젝트 주소 연결 완료. Apps Script 열기를 다시 누르면 편집기로 이동합니다.';
    return;
  }
  window.open(url,'_blank','noopener,noreferrer');
  const msg=$('ai-sync-message');if(msg)msg.textContent='Apps Script에서 classifyNextBatch를 실행하고, 완료 후 여기서 AI 분류 결과 반영을 누르세요.';
}
async function syncAiClassificationResults(){
  if(aiSyncBusy)return;
  if(!(gdriveToken||restoreCachedDriveToken())){
    const msg=$('ai-sync-message');if(msg)msg.textContent='먼저 상단 Google 연결 버튼으로 Drive 로그인한 후 다시 시도하세요.';
    showToast('먼저 Google Drive에 연결하세요.','error');return;
  }
  const before=new Map(items.map(it=>[it.id,JSON.stringify(it.facets||{})]));
  const button=$('ai-sync-button'), msg=$('ai-sync-message');
  aiSyncBusy=true;if(button){button.disabled=true;button.textContent='불러오는 중…';}
  if(msg)msg.textContent='Google Drive의 최신 분류 결과를 가져오는 중입니다. 이 작업은 GPT 분석을 실행하지 않습니다.';
  try{
    const ok=await loadFromDrive();
    if(!ok)throw new Error('Drive 불러오기에 실패했습니다.');
    const changed=items.filter(it=>before.has(it.id)&&before.get(it.id)!==JSON.stringify(it.facets||{})).length;
    const newlyClassified=items.filter(it=>before.has(it.id)&&before.get(it.id)===JSON.stringify({})&&isClassified(it)).length;
    updateAiClassificationStats();
    if(msg)msg.textContent=`최신 결과 반영 완료 · 분류 태그 변경 ${changed}개${newlyClassified?` · 신규 분류 ${newlyClassified}개`:''}. 변경이 없다면 Apps Script에서 분류 저장이 완료되었는지 확인하세요.`;
  }catch(err){if(msg)msg.textContent=err.message||'분류 결과 반영 중 오류가 발생했습니다.';}
  finally{aiSyncBusy=false;if(button){button.disabled=false;button.textContent='↻ AI 분류 결과 반영';}}
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
      if(isMissingDriveFileError(err)) handleUnrecoverableMediaError(img);
      else setMediaLoadError(img);
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
}, { rootMargin: '320px', threshold: 0.01 });

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
        } : () => handleUnrecoverableMediaError(img);
        img.onload = () => setMediaLoaded(img);
        img.src = lazySrc;
      }
    }
  });
}, { rootMargin: '240px', threshold: 0.01 });

function markMediaElement(el,ownerId,mediaId=''){
  if(!el) return;
  el.dataset.ownerId=ownerId||'';
  el.dataset.mediaId=mediaId||'';
}

// 드라이브에 실제로 존재하지 않는 미디어는 자동 삭제하지 않고,
// 카드에 경고 배지를 띄워 사용자가 직접 확인 후 삭제하도록 합니다.
function handleUnrecoverableMediaError(el){
  setMediaLoadError(el);
  showMissingMediaWarning(el);
}

function showMissingMediaWarning(el){
  if(!el) return;
  const ownerId=el.dataset?.ownerId||'';
  if(!ownerId) return;
  const mediaId=el.dataset?.mediaId||'';
  const host=el.closest('.ref-card') || el.closest('#detail-media') || el.parentElement;
  if(!host || host.querySelector(`.media-missing-warning[data-media-id="${mediaId}"]`)) return;

  const warn=document.createElement('div');
  warn.className='media-missing-warning';
  warn.dataset.mediaId=mediaId;
  warn.innerHTML=`<span>⚠ Drive에서 파일을 찾을 수 없어요</span><button type="button">삭제</button>`;
  warn.querySelector('button').onclick=(e)=>{ e.stopPropagation(); removeMissingMedia(ownerId,mediaId); };
  host.style.position = host.style.position || 'relative';
  host.appendChild(warn);
}

function removeMissingMedia(ownerId,mediaId){
  const it=items.find(x=>x.id===ownerId);
  if(!it) return;
  if(!confirm('Drive 원본을 찾을 수 없는 파일이에요. 이 항목을 삭제할까요?')) return;

  if(it.type==='carousel' && mediaId){
    it.carousel=(it.carousel||[]).filter(sl=>sl.id!==mediaId);
    if(!it.carousel.length) items=items.filter(x=>x.id!==ownerId);
  }else{
    items=items.filter(x=>x.id!==ownerId);
  }
  if(selectedId && !items.some(x=>x.id===selectedId)){ selectedId=null; $('detail-panel')?.classList.remove('open'); }
  saveLocal();
  renderAll();
  if(selectedId) renderDetail();
  showToast('삭제 완료','success');
}

function isMissingDriveFileError(err){
  return /(?:요청 실패|request failed)\s*(?:404|410)|\b(?:404|410)\b/i.test(String(err?.message||err||''));
}

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
  catch(e){ console.warn('Drive delete failed:', fileId, e); throw e; }
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
  const msg=ids.length?`삭제할까요?\nDrive 파일 ${ids.length}개는 다음 수동 'Drive 저장' 시 삭제됩니다.`:'삭제할까요?';
  if(!confirm(msg)) return;
  rememberDeletedDriveIds(ids);
  items=items.filter(i=>i.id!==id);
  if(selectedId===id) closeDetail();
  saveLocal(); setManualDrivePending(true); renderAll();
  showToast('로컬 삭제 완료 · Drive에는 수동 저장 시 반영됩니다','success');
}

// 모아둔 레퍼런스 전체 삭제: 로컬에서만 즉시 삭제하며, Drive 정리는 수동 저장 시점에 실행됩니다.
async function deleteAllItems(){
  if(!items.length){ showToast('삭제할 레퍼런스가 없어요','error'); return; }
  const count=items.length;
  if(!confirm(`정말 전체 ${count}개 레퍼런스를 모두 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`)) return;

  const allDriveIds=[];
  items.forEach(it=>allDriveIds.push(...collectDriveIdsFromItem(it)));
  rememberDeletedDriveIds(allDriveIds);

  items=[];
  selectedId=null;
  $('detail-panel')?.classList.remove('open');
  saveLocal();
  setManualDrivePending(true);
  renderAll();
  showToast('로컬 전체 삭제 완료 · Drive에는 수동 저장 시 반영됩니다','success');
}

// ─── Media Binding (Lazy Loaded) ───
function bindRemoteCardMedia(el,it,placeholder='',priority=false){
  if(it.src && !it.driveFileId){
    if(priority){
      el.classList.add('media-loading');
      el.onerror = () => handleUnrecoverableMediaError(el);
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
  else handleUnrecoverableMediaError(el);
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
      .then(u=>{
        if(!u){ handleUnrecoverableMediaError(el); return; }
        el.onerror=()=>handleUnrecoverableMediaError(el);
        el.onload=()=>setMediaLoaded(el);
        el.src=u;
      })
      .catch(e=>{
        console.error(e);
        if(isMissingDriveFileError(e)) handleUnrecoverableMediaError(el);
        else if(placeholder) el.src=placeholder;
        else setMediaLoadError(el);
      })
      .finally(()=>el.classList.remove('media-loading'));
  } else if(it.src){
    el.onerror=()=>handleUnrecoverableMediaError(el);
    el.onload=()=>setMediaLoaded(el);
    el.src=it.src;
  } else if(placeholder) el.src=placeholder;
  else handleUnrecoverableMediaError(el);
}

// ─── UI & Rendering ───
function renderAll(){
  renderFacetFilters();
  renderBoard();
  updateDriveUi();
  updateAiClassificationStats();
}
function debouncedRenderBoard(){ clearTimeout(renderTimer); renderTimer=setTimeout(renderBoard,120); }
function filteredItems(){
  let q=($('search-input')?.value||'').toLowerCase().trim(); let arr=[...items];
  if(activeAreaFilters.size)arr=arr.filter(it=>(it.facets?.contentArea||[]).some(v=>activeAreaFilters.has(v)));
  if(currentFilter!=='all') arr=arr.filter(x=>x.type===currentFilter);
  if(currentCatFilter) arr=arr.filter(x=>x.catIds?.includes(currentCatFilter));
  if(q) arr=arr.filter(x=>[x.title,x.brand,x.caption,x.notes,x.hook,x.imageCopy,x.sourceUrl,Object.values(x.facets||{}).flat().join(' ')].join(' ').toLowerCase().includes(q));
  for(const [key,values] of Object.entries(facetFilters)){if(values.length)arr=arr.filter(x=>values.some(v=>(x.facets?.[key]||[]).includes(v)));}
  if(classificationFilter==='classified')arr=arr.filter(isClassified);
  if(classificationFilter==='unclassified')arr=arr.filter(x=>!isClassified(x));
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
function switchTab(tab){ $('board-wrap').style.display='block'; }

function toggleMobileSidebar(){ $('sidebar')?.classList.add('mobile-open'); $('sidebar-overlay')?.classList.add('open'); }
function closeMobileSidebar(){ $('sidebar')?.classList.remove('mobile-open'); $('sidebar-overlay')?.classList.remove('open'); }

function dropZoneNode(){ 
  const div=document.createElement('div'); div.id='drop-zone'; div.tabIndex=0; 
  div.ondragover=onDragOver; div.ondragleave=onDragLeave; div.ondrop=onDrop; div.onclick=dzClick; div.onpaste=onDzPaste; 
  div.innerHTML='<div class="dz-icon">＋</div>이미지 · 영상을 드래그하거나<br><span style="color:var(--accent)">클릭해서 파일 선택</span><br><span style="font-size:11px;color:var(--t3)">이미지 여러 장 → 캐러셀 1개로 등록</span><br><span style="font-size:11px;color:var(--t4)">Ctrl+V 로 이미지 또는 URL 붙여넣기 가능</span><br><button id="paste-btn" onclick="tryClipboardPaste(event)" style="margin-top:8px;background:rgba(10,132,255,0.15);border:1px solid rgba(10,132,255,0.35);color:var(--accent);font-family:var(--fn);font-size:11px;font-weight:500;padding:5px 14px;border-radius:8px;cursor:pointer;transition:all .15s;" onmouseover="this.style.background=\'rgba(10,132,255,0.25)\'" onmouseout="this.style.background=\'rgba(10,132,255,0.15)\'">클립보드에서 붙여넣기</button>'; 
  return div; 
}

function pasteBarNode(){
  const div=document.createElement('div'); div.id='paste-bar'; div.className='paste-bar';
  div.innerHTML=`<div><strong>붙여넣기 / 빠른 추가</strong><span>이미지 2장 이상 함께 추가 → 캐러셀 1개 · 파일 선택 / 드래그 앤 드롭</span></div><div class="paste-actions"><button type="button" id="paste-read-btn">클립보드 읽기</button><button type="button" id="paste-upload-btn">파일 선택</button></div>`;
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
    it.title=newTitle; inheritTitleFacets(it); if(!isEmptyClassification(it.facets))synchronizeTitleFacets(it); restore(newTitle); saveData(); renderBoard();
  };
  input.onkeydown=(e)=>{
    if(e.key==='Enter'){e.preventDefault();save();}
    if(e.key==='Escape'){saved=true; if(editBtn){editBtn.style.display='';editBtn.onclick=(e2)=>{e2.stopPropagation();startInlineTitleEdit(id,titleEl);};} input.replaceWith(titleEl);}
  };
  input.onblur=save;
  input.onclick=(e)=>e.stopPropagation();
}

function cardNode(it,index=0){
  const isPriority = currentView==='list' ? index < 8 : index < PRIORITY_CARD_COUNT;
  const card=document.createElement('div');
  card.className='ref-card'+(it.id===selectedId?' selected':'');
  card.dataset.itemId=String(it.id);
  card.onclick=()=>openDetail(it.id);
  const del=document.createElement('button'); del.className='card-delete'; del.textContent='×'; del.onclick=(e)=>{e.stopPropagation(); deleteItem(it.id);}; card.appendChild(del);
  if(isDownloadableItem(it)){
    const dl=document.createElement('button');
    dl.className='card-download'; dl.textContent='↓'; dl.title='다운로드';
    dl.onclick=(e)=>{e.stopPropagation(); downloadItemMedia(it.id);};
    card.appendChild(dl);
  }
  
  let media = null;
  if(it.type==='video'){
    media=document.createElement('video'); media.className='card-media'; media.muted=true; media.playsInline=true; media.preload='none'; markMediaElement(media,it.id,it.id); bindCardMedia(media,it,'',isPriority); 
    media.onmouseenter=async()=>{ if(!media.src && it.driveFileId){ try{ media.src=await getDriveObjectURL(it.driveFileId,it.mimeType); }catch(e){} } media.play().catch(()=>{}); }; 
    media.onmouseleave=()=>{media.pause(); if(media.currentTime) media.currentTime=0;};
  }else if(it.type==='carousel'){
    const firstSlide=it.carousel?.[0]||{}; media=document.createElement('img'); media.className='card-media'; markMediaElement(media,it.id,firstSlide.id||''); tuneCardImageElement(media,isPriority); bindCardMedia(media,firstSlide,'',isPriority); media.alt=it.title;
  }else if(it.type==='link'){
    // 링크 타입의 경우 썸네일 칸을 아예 생성하지 않음
  }else{
    media=document.createElement('img'); media.className='card-media'; markMediaElement(media,it.id,it.id); tuneCardImageElement(media,isPriority); bindCardMedia(media,it,'',isPriority); media.alt=it.title;
  }
  
  if(media) { card.appendChild(media); }

  const info=document.createElement('div'); info.className='card-info';
  const tags=PRIMARY_FACET_KEYS.flatMap(k=>(it.facets?.[k]||[]).slice(0,2).map(v=>`<span class="card-cat-tag">${esc(v)}</span>`)).slice(0,5).join('');
  info.innerHTML=`<div class="card-title-wrap"><div class="card-title">${esc(it.title)}</div><button class="card-title-edit-btn" title="제목 수정">✎</button></div><div class="card-cats">${tags}</div>${socialMetricCardHTML(it)}<div class="card-date">${new Date(it.ts).toLocaleDateString('ko-KR')}</div>`;
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
  renderNavigatorChips();
  
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
  
  const chunkSize=currentView==='list'?40:20; 
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

// ─── 기본 대분류/소분류 태그 체계 (광고/콘텐츠/비주얼/UX/UI/카피) ───
const TAXONOMY_MIGRATION_KEY='refboard_taxonomy_migration_v1';
const DEFAULT_GROUPS=[
  {id:'g-ad',name:'광고',color:'#ff6b35'},
  {id:'g-content',name:'콘텐츠',color:'#00d4d4'},
  {id:'g-visual',name:'비주얼',color:'#7b5cfa'},
  {id:'g-ux',name:'UX',color:'#3bfa8a'},
  {id:'g-ui',name:'UI',color:'#3b9eff'},
  {id:'g-copy',name:'카피',color:'#ff3b8b'}
];
const DEFAULT_CATEGORIES=[
  // 광고
  {id:'c-ad-meta',name:'Meta 광고',groupId:'g-ad',color:'#ff6b35',legacy:['Meta 광고','메타광고']},
  {id:'c-ad-shopping',name:'쇼핑/검색광고',groupId:'g-ad',color:'#ff8b5c',legacy:['쇼핑광고','쇼핑/검색광고','네이버쇼핑/검색광고/기타']},
  {id:'c-ad-youtube',name:'유튜브 광고',groupId:'g-ad',color:'#ffaa3b',legacy:['YouTube 광고','유튜브광고']},
  {id:'c-ad-tiktok',name:'틱톡 광고',groupId:'g-ad',color:'#ff5555',legacy:['TikTok 광고','Tiktok 광고']},
  {id:'c-ad-promo',name:'할인/프로모션',groupId:'g-ad',color:'#ffd23b',legacy:['할인','할인소구','프로모션','기획전/프로모션','캠페인/프로모션']},
  // 콘텐츠
  {id:'c-ct-insta',name:'인스타/릴스',groupId:'g-content',color:'#00d4d4',legacy:['인스타그램','Reels/숏폼','릴스/숏폼영상','숏폼']},
  {id:'c-ct-youtube',name:'유튜브 콘텐츠',groupId:'g-content',color:'#3bd4c4',legacy:['YouTube 콘텐츠','유튜브콘텐츠']},
  {id:'c-ct-blog',name:'블로그/아티클',groupId:'g-content',color:'#3bfae0',legacy:['Blog/아티클','블로그/아티클']},
  {id:'c-ct-meme',name:'밈·유머',groupId:'g-content',color:'#8be8e8',legacy:['밈/유머코드','밈']},
  {id:'c-ct-review',name:'리뷰/UGC',groupId:'g-content',color:'#5cdada',legacy:['리뷰','리뷰/UGC','후기']},
  {id:'c-ct-collab',name:'협찬/바이럴',groupId:'g-content',color:'#20b8b8',legacy:['협찬','협찬/인플루언서','바이럴','바이럴/참여형','콜라보']},
  {id:'c-ct-season',name:'시즌/기념일',groupId:'g-content',color:'#00a0a0',legacy:['시즌','시즌/기념일']},
  // 비주얼
  {id:'c-vs-mood',name:'무드/레이아웃',groupId:'g-visual',color:'#7b5cfa',legacy:['비주얼','무드/비주얼','레이아웃']},
  {id:'c-vs-shoot',name:'촬영/연출',groupId:'g-visual',color:'#9b7cfa',legacy:['촬영/구도','촬영/연출','촬영연출','파인/일몰','소품/배경','상황/분위기','상황/무드']},
  {id:'c-vs-cut',name:'제품·라이프스타일컷',groupId:'g-visual',color:'#a88bfa',legacy:['제품컷','사용컷','라이프스타일컷','디테일컷']},
  {id:'c-vs-new',name:'신제품/패키지',groupId:'g-visual',color:'#6b4cd8',legacy:['신제품','신제품/패키지']},
  // UX
  {id:'c-ux-page',name:'랜딩/상세페이지',groupId:'g-ux',color:'#3bfa8a',legacy:['웹사이트 페이지','웹사이트 구조','랜딩페이지','랜딩 페이지','상세페이지','PDP/상세페이지']},
  {id:'c-ux-event',name:'이벤트/쿠폰',groupId:'g-ux',color:'#6bfa9b',legacy:['이벤트프로모션','이벤트 프로모션','이벤트 페이지','쿠폰']},
  {id:'c-ux-offline',name:'오프라인/공간',groupId:'g-ux',color:'#20d466',legacy:['팝업','팝업스토어','오프라인팝업','오프라인/공간','매장진열','부스/전시','포토존','VMD']},
  // UI
  {id:'c-ui-banner',name:'배너/팝업 UI',groupId:'g-ui',color:'#3b9eff',legacy:['쿠폰/혜택 UI']},
  {id:'c-ui-button',name:'버튼/CTA UI',groupId:'g-ui',color:'#6bb8ff',legacy:[]},
  // 카피
  {id:'c-cp-headline',name:'헤드라인/훅',groupId:'g-copy',color:'#ff3b8b',legacy:[]},
  {id:'c-cp-body',name:'바디카피',groupId:'g-copy',color:'#ff6ba8',legacy:['카피','카피/문구']},
  {id:'c-cp-cta',name:'CTA 문구',groupId:'g-copy',color:'#ff8bc0',legacy:[]},
  {id:'c-cp-hashtag',name:'해시태그',groupId:'g-copy',color:'#ffabd0',legacy:[]},
  {id:'c-cp-legal',name:'법적고지/공지문구',groupId:'g-copy',color:'#d81e6b',legacy:[]}
];
// 기존에 세분화되어 있던 카테고리를 새 대분류 체계로 1회 통합 마이그레이션.
// - groups/categories가 비어 있으면 기본 세트를 그대로 시드.
// - 기존 카테고리가 있으면: 새 그룹/카테고리를 추가하고, 옛 이름과 일치하는 카테고리는
//   해당 소분류로 아이템을 재배정한 뒤 옛 카테고리를 제거. 매칭되지 않는 커스텀 카테고리는 그대로 둠.
// - 한 번만 실행되도록 localStorage 플래그로 관리(이후 사용자가 기본 태그를 지워도 되살아나지 않음).
function ensureDefaultTaxonomy(){
  try{
    if(localStorage.getItem(TAXONOMY_MIGRATION_KEY)) return false;
    const existingGroupNames=new Set(groups.map(g=>normalizeCatPickerName(g.name||'')));
    DEFAULT_GROUPS.forEach(dg=>{
      if(groups.some(g=>g.id===dg.id)) return;
      if(existingGroupNames.has(normalizeCatPickerName(dg.name))) return;
      groups.push({id:dg.id,name:dg.name,color:dg.color});
    });
    const existingCatNames=new Set(categories.map(c=>normalizeCatPickerName(c.name||'')));
    DEFAULT_CATEGORIES.forEach(dc=>{
      if(categories.some(c=>c.id===dc.id)) return;
      if(existingCatNames.has(normalizeCatPickerName(dc.name))) return;
      categories.push({id:dc.id,name:dc.name,color:dc.color,groupId:dc.groupId});
    });
    const legacyMap=new Map();
    DEFAULT_CATEGORIES.forEach(dc=>{ (dc.legacy||[]).forEach(name=>legacyMap.set(normalizeCatPickerName(name),dc.id)); });
    const toRemove=new Set();
    categories.forEach(c=>{
      if(DEFAULT_CATEGORIES.some(dc=>dc.id===c.id)) return; // 방금 새로 만든 기본 카테고리는 건너뜀
      const targetId=legacyMap.get(normalizeCatPickerName(c.name||''));
      if(!targetId || targetId===c.id) return;
      items.forEach(it=>{
        if(!Array.isArray(it.catIds) || !it.catIds.includes(c.id)) return;
        const merged=new Set(it.catIds.map(id=>id===c.id?targetId:id));
        it.catIds=[...merged];
      });
      toRemove.add(c.id);
    });
    if(toRemove.size) categories=categories.filter(c=>!toRemove.has(c.id));
    normalizeCategoryGroups();
    localStorage.setItem(TAXONOMY_MIGRATION_KEY,'1');
    return true;
  }catch(e){ console.warn('태그 체계 마이그레이션 실패:', e); return false; }
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
function openAddModal(){ pendingFile=null; pendingCarouselFiles=[]; modalSelectedCats=[]; if($('modal-file-name')) $('modal-file-name').textContent=''; if($('add-title')) $('add-title').value=''; ['add-url','add-brand','add-source-url','add-notes','add-views','add-likes','add-comments'].forEach(id=>{if($(id))$(id).value='';}); renderModalCats();if($('modal-facets'))$('modal-facets').innerHTML=facetFieldsHTML('add',{}); switchModalTab('single'); $('add-modal')?.classList.add('open'); }
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
    catIds:Array.isArray(extra.catIds)?extra.catIds:[], facets:{...cleanFacets(extra.facets),hex:extra.facets?.hex||''}, platform:extra.platform||'', brand:extra.brand||'', sourceType:extra.sourceType||'paste', sourceUrl:extra.sourceUrl||'',
    caption:extra.caption||'', hook:extra.hook||'', cta:extra.cta||'', imageCopy:extra.imageCopy||'', visualNotes:extra.visualNotes||'', contentNotes:extra.contentNotes||'', notes:extra.notes||'',
    carousel:Array.isArray(extra.carousel)?extra.carousel:[], ts:extra.ts||Date.now(), _file:file,
    socialMetrics:normalizeSocialMetrics(extra.socialMetrics)
  };
  inheritTitleFacets(item);
  saveLocalBlob(localBlobKey,file,{fileName:item.fileName,mimeType:item.mimeType}).catch(console.warn);
  return item;
}

function handleModalFile(e){ pendingFile=e.target.files?.[0]||null; $('modal-file-name').textContent=pendingFile?pendingFile.name:''; if(pendingFile&&!$('add-title').value) $('add-title').value=pendingFile.name; }
function handleCarouselFiles(e){ pendingCarouselFiles=[...(e.target.files||[])]; const list=$('carousel-preview-list'); list.innerHTML=''; pendingCarouselFiles.forEach(f=>{const img=document.createElement('img'); img.src=URL.createObjectURL(f); img.style.cssText='width:64px;height:64px;object-fit:cover;border-radius:8px'; list.appendChild(img);}); $('carousel-count-label').textContent=`${pendingCarouselFiles.length}개 선택됨`; }

async function saveFromModal(){
  let socialMetrics;
  try{socialMetrics=collectSocialMetricInputs('add');}catch(error){showToast(error.message,'error');return;}
  const base={socialMetrics,title:$('add-title').value.trim()||'제목없음',catIds:[...modalSelectedCats],platform:$('add-platform').value,brand:$('add-brand').value,sourceType:$('add-source-type').value,sourceUrl:$('add-source-url').value,notes:$('add-notes').value,facets:readFacetFields('add'),ts:Date.now()};
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
  const created=items[items.length-1];if(created){inheritTitleFacets(created);if(!isEmptyClassification(created.facets))synchronizeTitleFacets(created);}
  closeModal('add-modal'); await saveData(); renderAll();
}

function guessType(url){ const u=url.toLowerCase(); if(/\.(mp4|webm|mov|m4v)(\?|$)/.test(u))return'video'; if(/^https?:/.test(u)&&!/\.(png|jpe?g|gif|webp|svg)(\?|$)/.test(u))return'link'; return'image'; }
function addFromUrl(){ saveFromModal(); }
// 빠른 추가에서는 이미지 여러 장을 자동으로 하나의 캐러셀로 묶습니다.
// 파일명 자연 정렬(1,2,10)로 슬라이드 순서를 일관되게 유지합니다.
// 개별 파일의 _file / localBlobKey는 기존 업로드 및 로컬 복원 로직과 동일하게 보존합니다.
function quickCarouselFromFiles(imageFiles, sourceType='quick_add'){
  const sorted=[...imageFiles].sort((a,b)=>(a.name||'').localeCompare(b.name||'', 'ko', {numeric:true,sensitivity:'base'}));
  const slides=sorted.map((file,index)=>{
    const id=uid('s');
    const localBlobKey=`slide:${id}`;
    const previewSrc=URL.createObjectURL(file);
    const fileName=file.name||`image_${index+1}.png`;
    return {id,src:previewSrc,previewSrc,driveFileId:'',mimeType:file.type||'image/png',fileName,localBlobKey,_file:file};
  });
  const firstName=sorted[0].name||'이미지';
  const baseName=firstName.replace(/\.[^.]+$/,'').replace(/(?:[\s_-]+(?:\d{1,3}|slide[\s_-]*\d+))$/i,'').trim()||firstName.replace(/\.[^.]+$/,'');
  return normalizeItem({
    id:uid('car'),title:`${baseName} 외 ${sorted.length-1}장`,type:'carousel',
    carousel:slides,sourceType,ts:Date.now()
  });
}

async function addQuickFiles(inputFiles, sourceType='quick_add'){
  const all=[...(inputFiles||[])];
  const images=all.filter(f=>(f.type||'').startsWith('image/'));
  const videos=all.filter(f=>(f.type||'').startsWith('video/'));
  const ignored=all.length-images.length-videos.length;
  if(!images.length&&!videos.length){showToast('이미지 또는 영상 파일만 추가할 수 있습니다.','error');return {carousel:0,single:0,ignored};}

  let carousel=0;
  if(images.length>=2){
    items.push(quickCarouselFromFiles(images,sourceType));
    carousel=1;
  }else if(images.length===1){
    items.push(fileToItem(images[0],{sourceType}));
  }
  // 캐러셀은 이미지로만 구성합니다. 함께 드롭된 동영상은 개별 카드로 저장합니다.
  videos.forEach(file=>items.push(fileToItem(file,{sourceType})));
  await saveData();
  renderAll();
  const single=(images.length===1?1:0)+videos.length;
  const summary=[carousel?`이미지 ${images.length}장 → 캐러셀 1개`:'',single?`단일 파일 ${single}개`:'',ignored?`지원하지 않는 파일 ${ignored}개 제외`:''].filter(Boolean).join(' · ');
  showToast(`${summary} 추가 완료 · Drive 저장은 수동입니다.`, 'success');
  return {carousel,single,ignored};
}

async function handleFileInput(e){
  const files=[...(e.target.files||[])];
  e.target.value=''; // 같은 파일도 다시 선택 가능
  if(files.length)await addQuickFiles(files,'quick_upload');
}
function onDragOver(e){ e.preventDefault(); if(e.dataTransfer) e.dataTransfer.dropEffect='copy'; e.currentTarget.classList.add('dragover'); }
function onDragLeave(){ $('drop-zone')?.classList.remove('dragover'); $('paste-bar')?.classList.remove('dragover'); }
async function onDrop(e){
  e.preventDefault();
  $('drop-zone')?.classList.remove('dragover'); $('paste-bar')?.classList.remove('dragover');
  const files=[...(e.dataTransfer?.files||[])];
  if(files.length)await addQuickFiles(files,'quick_drop');
}
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
    markMediaElement(media,it.id,s.id||'');
    bindDriveMedia(media,s); wrap.appendChild(media);
    const cap=document.createElement('div'); cap.className='carousel-detail-caption'; cap.textContent=`${idx+1}. ${s.fileName||s.title||'slide'}`;
    wrap.appendChild(cap); grid.appendChild(wrap);
  });
}

function findBoardCardById(id){
  const safeId=String(id||'');
  return [...document.querySelectorAll('#board .ref-card')]
    .find(card=>card.dataset.itemId===safeId)||null;
}

function openDetail(id){
  const boardWrap=$('board-wrap');
  const clickedCard=findBoardCardById(id);
  const anchorTop=clickedCard?.getBoundingClientRect().top ?? null;
  const fallbackScrollTop=boardWrap?.scrollTop ?? 0;

  selectedId=id;

  // 클릭한 카드 DOM을 유지해 사용자가 보고 있던 위치가 사라지지 않게 합니다.
  document.querySelectorAll('#board .ref-card.selected')
    .forEach(card=>card.classList.remove('selected'));
  clickedCard?.classList.add('selected');

  renderDetail();
  $('detail-panel')?.classList.add('open');

  // 패널이 열리며 카드 열 수가 바뀌어도 선택한 카드가 같은 화면 높이에 남도록 보정합니다.
  if(boardWrap && clickedCard && anchorTop!==null){
    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        const afterTop=clickedCard.getBoundingClientRect().top;
        boardWrap.scrollTop += (afterTop-anchorTop);
      });
    });
  }else if(boardWrap){
    boardWrap.scrollTop=fallbackScrollTop;
  }
}

function closeDetail(){
  const boardWrap=$('board-wrap');
  const currentCard=selectedId ? findBoardCardById(selectedId) : null;
  const anchorTop=currentCard?.getBoundingClientRect().top ?? null;
  const fallbackScrollTop=boardWrap?.scrollTop ?? 0;

  selectedId=null;
  $('detail-panel')?.classList.remove('open');
  currentCard?.classList.remove('selected');

  if(boardWrap && currentCard && anchorTop!==null){
    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        const afterTop=currentCard.getBoundingClientRect().top;
        boardWrap.scrollTop += (afterTop-anchorTop);
      });
    });
  }else if(boardWrap){
    boardWrap.scrollTop=fallbackScrollTop;
  }
}
function renderDetailCatOptions(){ const it=items.find(i=>i.id===selectedId); const el=$('detail-cat-options'); if(!el||!it)return; if(!Array.isArray(it.catIds)) it.catIds=[]; el.innerHTML=buildGroupedDetailCategoryPickerHtml(it.catIds); el.querySelectorAll('.cat-option-chip').forEach(ch=>ch.onclick=()=>{const id=ch.dataset.id; it.catIds=it.catIds.includes(id)?it.catIds.filter(x=>x!==id):[...it.catIds,id]; saveData(); renderAll(); renderDetail();}); }

function renderDetail(){
  const it=items.find(i=>i.id===selectedId); if(!it)return;
  const m=$('detail-media'); if(!m)return; m.innerHTML='';
  let el;
  if(it.type==='video'){ el=document.createElement('video'); el.controls=true; markMediaElement(el,it.id,it.id); bindDriveMedia(el,it); m.appendChild(el); }
  else if(it.type==='carousel'){ const first=it.carousel?.[0]; if(first){ el=document.createElement((first.mimeType||'').startsWith('video/')?'video':'img'); if(el.tagName==='VIDEO') el.controls=true; markMediaElement(el,it.id,first.id||''); bindDriveMedia(el,first); m.appendChild(el); } }
  else if(it.type==='link'){ /* 미디어 영역 무시 */ }
  else{ el=document.createElement('img'); markMediaElement(el,it.id,it.id); bindDriveMedia(el,it); m.appendChild(el); }
  
  renderDetailCatOptions();
  const f=$('detail-fields'); if(!f) return;
  f.innerHTML=`
    ${it.type==='carousel'?carouselThumbStrip(it):''}
    <div class="detail-section-title">수정</div>
    <div class="form-row"><label class="form-label">제목</label><input class="detail-input" id="detail-edit-title" value="${esc(it.title||'')}"></div>
    <div class="form-row"><label class="form-label">브랜드</label><input class="detail-input" id="detail-edit-brand" value="${esc(it.brand||'')}"></div>
    ${socialMetricInputsHTML('detail',it.socialMetrics)}
    ${it.type==='video'?'<p class="detail-helper">영상은 아래 콘텐츠 분석 분야 및 태그를 직접 선택한 뒤 <b>수정 저장</b>을 눌러주세요.</p>':''}
    <div class="facet-editor">${facetFieldsHTML('detail',it.facets)}</div>
    <div class="form-row"><label class="form-label">원본 링크</label><input class="detail-input" id="detail-edit-link" value="${esc(it.sourceUrl||(it.type==='link'?it.src:'')||'')}" placeholder="https://"><button class="detail-btn" onclick="const u=$('detail-edit-link').value;if(/^https?:\/\//i.test(u))window.open(u,'_blank','noopener')">원본 열기</button></div>
    <div class="form-row"><label class="form-label">기타 메모</label><textarea class="detail-input" id="detail-edit-notes" rows="5">${esc(it.notes||'')}</textarea></div>
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
  let socialMetrics;
  try{socialMetrics=collectSocialMetricInputs('detail',it.socialMetrics);}catch(error){showToast(error.message,'error');return;}
  it.socialMetrics=socialMetrics;
  it.title=$('detail-edit-title')?.value.trim()||'제목없음';
  it.brand=$('detail-edit-brand')?.value.trim()||'';
  it.facets=readFacetFields('detail',it.facets);
  synchronizeTitleFacets(it);
  it.sourceUrl=$('detail-edit-link')?.value||'';
  if(it.type==='link' && it.sourceUrl) it.src=it.sourceUrl;
  if((it.type==='image'||it.type==='video') && !it.src && isDirectMediaUrl(it.sourceUrl)) it.src=it.sourceUrl;
  if(!it.driveFileId) it.driveFileId=extractGoogleDriveFileId(it.src)||extractGoogleDriveFileId(it.sourceUrl)||'';

  it.notes=$('detail-edit-notes')?.value||'';
  saveData(); renderBoard(); renderDetail();
  showToast('수정 저장 완료','success');
}



// GitHub Pages 단독 배포: 모든 분류는 브라우저에서 수동으로 저장합니다.
// 기존 브라우저에 남아 있을 수 있는 AI 연동 키만 삭제합니다.
function clearLegacyBrowserApiKeys(){
  ['refboard_openai_classification_key','refboard_api_key_openai','refboard_openai_key','refboard_classification_gateway_url'].forEach(k=>localStorage.removeItem(k));
}

// ─── Initialization ───
window.addEventListener('DOMContentLoaded',()=>{
  let cachedToken='';
  try{ cachedToken=restoreCachedDriveToken(); }catch(e){ console.warn(e); }
  clearLegacyBrowserApiKeys();
  loadLocal();
  normalizeCategoryGroups();
  const taxonomyMigrated=ensureDefaultTaxonomy();
  installReliablePasteListener();
  removeItemsThatAreCarouselSlides();
  const repaired=repairAndPruneMediaItems();
  if(repaired.linked||repaired.removed||taxonomyMigrated) saveLocal();

  // 과거 레퍼런스 중 동일 제목이고 분류가 비어 있는 항목만 채움
  let filledFromTitles=0;
  items.forEach(it=>{if(isEmptyClassification(it.facets)){const existing=matchingClassification(it.title,it.id);if(existing){inheritTitleFacets(it);filledFromTitles++;}}});
  if(filledFromTitles)saveLocal();
  renderFacetFilters();
  renderAll();
  document.addEventListener('keydown',event=>{
    const tag=event.target?.tagName?.toLowerCase();
    if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!['input','textarea','select'].includes(tag)){
      event.preventDefault();$('search-input')?.focus();
    }
    if(event.key==='Escape'&&document.activeElement?.id==='search-input')document.activeElement.blur();
  });

  updateDriveUi();

  // 캐시된 Drive 권한이 있으면 누락된 이미지 연결을 자동 복구합니다.
  if(cachedToken){
    requestAnimationFrame(()=>{
      syncItemsWithDriveAssets()
        .then(sync=>{
          const cleaned=repairAndPruneMediaItems();
          if(sync.linked||sync.added||sync.merged||cleaned.linked||cleaned.removed){ saveLocal(); renderAll(); }
        })
        .catch(err=>console.warn('Drive 미디어 자동 연결 생략:',err));
    });
  }
});
