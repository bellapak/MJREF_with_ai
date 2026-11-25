// Private Apps Script deployment. Only the deployment address is stored here.
const notionEndpointKey = 'mjref_notion_webapp_url';

function configureNotionExport() {
  const previous = localStorage.getItem(notionEndpointKey) || '';
  const input = window.prompt('내 Google Apps Script 웹 앱 주소를 입력하세요 (/exec).', previous);
  if (!input) return '';
  const address = input.trim();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(address)) {
    showToast('script.google.com의 배포 주소(/exec)를 확인해 주세요.', 'error');
    return '';
  }
  localStorage.setItem(notionEndpointKey, address);
  return address;
}

function openNotionExport() {
  const card = items.find(item => item.id === selectedId);
  if (!card) return;
  const endpoint = localStorage.getItem(notionEndpointKey) || configureNotionExport();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint)) return;
  const payload = {
    id: card.id,
    title: ($('detail-edit-title')?.value ?? card.title ?? '').trim() || '제목 없음',
    link: ($('detail-edit-link')?.value ?? card.sourceUrl ?? '').trim(),
    memo: $('detail-edit-notes')?.value ?? card.notes ?? ''
  };
  if (!payload.link && card.driveFileId) {
    payload.link = 'https://drive.google.com/open?id=' + encodeURIComponent(card.driveFileId);
  }
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = endpoint;
  form.target = '_blank';
  form.rel = 'noopener';
  const data = document.createElement('input');
  data.type = 'hidden';
  data.name = 'card';
  data.value = JSON.stringify(payload);
  form.appendChild(data);
  document.body.appendChild(form);
  form.submit();
  form.remove();
}
