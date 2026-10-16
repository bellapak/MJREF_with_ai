/**
 * Cloudflare Worker: OpenAI 비밀 키는 Cloudflare secrets에만 저장.
 * GitHub Pages에 공개해도 프록시 남용을 막기 위해 별도 접근 코드 인증 필수.
 * 환경 변수 ALLOWED_ORIGIN은 실제 Pages Origin과 정확히 일치해야 함.
 */
const FACETS = {
 purpose:['광고','SNS 콘텐츠','상세페이지','랜딩페이지','패키지','브랜딩/BX','오프라인/VMD','UI/UX','굿즈','기타'],
 industry:['생활용품','뷰티/퍼스널케어','패션','식품/음료','리빙/인테리어','테크','문화/공연','기타'],
 benefit:['가격 할인','정액 할인','쿠폰','무료배송','증정품/GWP','1+1/번들','적립/포인트','멤버십','한정/선착순','체험/샘플','성능/효능','편의성','기타/없음'],
 color:['레드','오렌지','옐로','그린','민트','블루','퍼플','핑크','브라운','베이지','화이트','그레이','블랙','멀티컬러'],
 visual:['미니멀','맥시멀','레트로/빈티지','키치/위트','럭셔리','에디토리얼','실험적/초현실','일러스트','3D/CG','타이포그래피','포토그래픽'],
 layout:['중앙 정렬','좌우 분할','그리드','비대칭','콜라주','풀블리드','카드형','큰 타이포','여백 중심','정보 밀집'],
 composition:['정면','탑뷰/플랫레이','클로즈업','매크로','아이레벨','로우앵글','인물 중심','제품 단독','사용 장면'],
 subject:['제품','인물','캐릭터','타이포그래피','공간/인테리어','자연','소품','음식','패키지','UI 화면'],
 appeal:['문제 해결','기능/성능','가격/가치','사회적 증거','열망/라이프스타일','희소성/긴급성','호기심/반전','유머/밈','감성/스토리'],
 tone:['위트/유머','도발적','친근함','담백함','전문적','감성적','직설적','고급스러움','실험적'],
 cta:['구매 유도','탐색/더보기','가입/구독','참여/응모','저장/공유','방문/예약','CTA 없음'],
 season:['신제품 출시','시즌 세일','봄','여름','가을','겨울','설날','추석','발렌타인','크리스마스','블랙프라이데이','상시 운영'],
 motion:['영상 해당 없음','실사','모션그래픽','스톱모션','제품 데모','브이로그','인터뷰','애니메이션','텍스트 애니메이션','숏폼 트렌드']
};
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
const cors=(origin)=>({'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,X-Refboard-Access','Vary':'Origin','Cache-Control':'no-store'});
async function validCode(input,expected){
 if(!input||!expected)return false;
 const enc=new TextEncoder();const [a,b]=await Promise.all([crypto.subtle.digest('SHA-256',enc.encode(input)),crypto.subtle.digest('SHA-256',enc.encode(expected))]);
 const x=new Uint8Array(a),y=new Uint8Array(b);let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];return diff===0;
}
export default {async fetch(request,env){
 const origin=request.headers.get('Origin')||'';
 const allowed=(env.ALLOWED_ORIGIN||'').replace(/\/$/,'');
 if(!allowed||!origin||origin!==allowed)return json({error:'허용되지 않은 출처입니다.'},403);
 const headers=cors(allowed);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(new URL(request.url).pathname!=='/classify'||request.method!=='POST')return json({error:'Not found'},404,headers);
 if(!env.OPENAI_API_KEY||!env.REFBOARD_ACCESS_CODE)return json({error:'Worker 비밀 키 설정이 누락되었습니다.'},503,headers);
 if(!await validCode(request.headers.get('X-Refboard-Access'),env.REFBOARD_ACCESS_CODE))return json({error:'접근 코드가 올바르지 않습니다.'},401,headers);
 const claimed=Number(request.headers.get('content-length')||0);
 if(claimed>7_000_000)return json({error:'이미지 데이터 제한(7MB)을 초과했습니다.'},413,headers);
 let body;try{body=await request.json();}catch{return json({error:'요청 JSON이 올바르지 않습니다.'},400,headers);}
 const images=body?.images;
 if(!Array.isArray(images)||images.length<1||images.length>5)return json({error:'이미지 1~5장을 전송하세요.'},400,headers);
 if(images.some(v=>v?.type!=='image_url'||!/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v?.image_url?.url||'')||v.image_url.url.length>5_000_000))return json({error:'허용되지 않는 이미지 형식 또는 용량입니다.'},400,headers);
 if(JSON.stringify(body).length>7_000_000)return json({error:'요청 크기 제한을 초과했습니다.'},413,headers);
 const prompt='당신은 마케팅·디자인 레퍼런스 아카이브 분류기입니다. 첨부 이미지에 직접 보이는 근거로만 분류하세요. 광고 혜택·CTA·카피는 뚜렷하게 보일 때만 분류합니다. 각 키에는 다음 목록의 값만 최대 3개 선택해 배열로 반환합니다. 영상 프레임만 보고 움직임, 오디오 등을 추측하지 마세요. JSON 객체만 반환하세요. 선택지: '+JSON.stringify(FACETS);
 let openAiResponse;
 try{openAiResponse=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Authorization':`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:env.OPENAI_MODEL||'gpt-4.1-mini',temperature:0.1,response_format:{type:'json_object'},messages:[{role:'system',content:prompt},{role:'user',content:[{type:'text',text:'이 레퍼런스의 시각적 특징을 지정된 카테고리로만 분류하세요.'},...images]}],max_tokens:900})});}
 catch{return json({error:'AI 서버 연결에 실패했습니다.'},502,headers);}
 const result=await openAiResponse.json().catch(()=>({}));
 if(!openAiResponse.ok)return json({error:openAiResponse.status===429?'요청 제한에 도달했습니다.':'AI 요청에 실패했습니다.'},502,headers);
 let parsed;try{parsed=JSON.parse(result.choices?.[0]?.message?.content||'{}');}catch{return json({error:'AI 응답을 해석하지 못했습니다.'},502,headers);}
 const facets={};for(const [k,choices] of Object.entries(FACETS))facets[k]=Array.isArray(parsed[k])?[...new Set(parsed[k])].filter(x=>choices.includes(x)).slice(0,3):[];
 return json({facets},200,headers);
}};
