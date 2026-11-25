// Deploy for the owner only. doPost displays a preview; only the confirmation writes.
const NOTION_VERSION = '2025-09-03';
const NOTE_TYPES = ['수집함', '팝업 경험', '마케팅 사례', '아이디어'];

function doPost(e) {
  const card = validateCard_(JSON.parse(e.parameter.card));
  const template = HtmlService.createTemplateFromFile('Confirm');
  template.card = card;
  return template.evaluate().setTitle('MJREF → 노션');
}

function validateCard_(value) {
  if (!value || typeof value.id !== 'string' || !value.id.trim() || value.id.length > 250) {
    throw new Error('카드 ID를 확인해 주세요.');
  }
  const title = String(value.title || '제목 없음');
  const memo = String(value.memo || '');
  const link = String(value.link || '').trim();
  if (link && (!/^https?:\/\/[^\s]+$/i.test(link) || link.length > 2000)) {
    throw new Error('원본 링크에 2,000자 이하의 HTTP 또는 HTTPS 주소를 입력하세요.');
  }
  if (title.length > 30000 || memo.length > 30000) throw new Error('제목과 메모는 각각 3만 자까지 보낼 수 있어요.');
  return {id: value.id, title, memo, link};
}

function richText_(value) {
  const chars = Array.from(value);
  const chunks = [];
  for (let i = 0; i < chars.length; i += 1000) {
    chunks.push({type: 'text', text: {content: chars.slice(i, i + 1000).join('')}});
  }
  return chunks;
}

function notion_(path, method, body, token) {
  const response = UrlFetchApp.fetch('https://api.notion.com/v1/' + path, {
    method, contentType: 'application/json',
    headers: {Authorization: 'Bearer ' + token, 'Notion-Version': NOTION_VERSION},
    ...(body == null ? {} : {payload: JSON.stringify(body)}), muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('노션 저장 실패 (' + status + '). 자료함 연결 권한과 속성을 확인한 뒤 다시 시도하세요.');
  }
  return JSON.parse(response.getContentText());
}

function sendCard(raw, category) {
  const card = validateCard_(raw);
  if (!NOTE_TYPES.includes(category)) throw new Error('분류를 선택해 주세요.');
  const config = PropertiesService.getScriptProperties();
  const token = config.getProperty('NOTION_TOKEN');
  if (!token) throw new Error('Apps Script의 스크립트 속성에 NOTION_TOKEN을 등록해 주세요.');
  const source = config.getProperty('NOTION_DATA_SOURCE_ID');
  if (!source) throw new Error('NOTION_DATA_SOURCE_ID를 등록해 주세요.');
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const found = notion_('data_sources/' + encodeURIComponent(source) + '/query', 'post', {
      filter: {property: 'MJREF ID', rich_text: {equals: card.id}}, page_size: 2
    }, token).results;
    if (found.length > 1) throw new Error('같은 MJREF ID가 여러 건 있어요. 자료함에서 중복을 확인해 주세요.');
    const properties = {
      '제목': {title: richText_(card.title)}, '링크': {url: card.link || null},
      'MJREF ID': {rich_text: richText_(card.id)}
    };
    // The inbox is a view filtered to empty notes. Preserve a user's later
    // classification on repeat sends unless they explicitly select another tag.
    const tags = found[0]?.properties['노트']?.multi_select?.map(tag => tag.name) || [];
    if (category !== '수집함' && !tags.includes(category)) tags.push(category);
    if (!found.length || category !== '수집함') properties['노트'] = {multi_select: tags.map(name => ({name}))};
    const heading = {heading_3: {rich_text: richText_('본문')}, type: 'heading_3', object: 'block'};
    const paragraph = {paragraph: {rich_text: richText_(card.memo)}, type: 'paragraph', object: 'block'};
    if (found.length) updateMemo_(found[0].id, heading, paragraph, token);
    const page = found.length
      ? notion_('pages/' + found[0].id, 'patch', {properties}, token)
      : notion_('pages', 'post', {parent: {type: 'data_source_id', data_source_id: source}, properties, children: [heading, paragraph]}, token);
    return {url: page.url, result: found.length ? '기존 자료를 업데이트했어요.' : '노션에 저장했어요.'};
  } finally { lock.releaseLock(); }
}

function updateMemo_(pageId, heading, paragraph, token) {
  const path = 'blocks/' + pageId + '/children';
  const blocks = [];
  let cursor = '';
  do {
    const page = notion_(path + '?page_size=100' + (cursor ? '&start_cursor=' + encodeURIComponent(cursor) : ''), 'get', null, token);
    blocks.push(...page.results);
    cursor = page.next_cursor;
  } while (cursor);
  const index = blocks.findIndex(block => block.type === 'heading_3' &&
    block.heading_3.rich_text.map(part => part.plain_text).join('') === '본문');
  if (index < 0) {
    notion_(path, 'patch', {children: [heading, paragraph]}, token);
    return;
  }
  const memo = blocks[index + 1];
  if (memo && memo.type === 'paragraph') {
    notion_('blocks/' + memo.id, 'patch', {paragraph: paragraph.paragraph}, token);
  } else {
    notion_(path, 'patch', {after: blocks[index].id, children: [paragraph]}, token);
  }
}
