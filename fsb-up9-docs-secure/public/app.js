
const $ = selector => document.querySelector(selector);
const allowed = new Set(['B','STRONG','I','EM','U','OL','UL','LI','DIV','P','BR']);
$('#date').value = '2026-09-27';
function safeHtml(root) {
  const output = document.createElement('div');
  function copy(node, parent) {
    if (node.nodeType === Node.TEXT_NODE) { parent.appendChild(document.createTextNode(node.textContent)); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (!allowed.has(node.tagName)) { for (const child of node.childNodes) copy(child,parent); return; }
    const el = document.createElement(node.tagName.toLowerCase());
    parent.appendChild(el);
    for (const child of node.childNodes) copy(child,el);
  }
  for (const child of root.childNodes) copy(child,output);
  return output.innerHTML;
}
function countWords(node) { return (node.innerText.trim().match(/\S+/g) || []).length; }
function update() {
  const val = id => $(id).value;
  $('#pcode').textContent = val('#code');
  $('#pdate').textContent = val('#date') ? new Date(val('#date')+'T12:00:00').toLocaleDateString('ru-RU') : '';
  $('#ptype').textContent = ({'Постановление о привлечении к дисциплинарной ответственности':'ПОСТАНОВЛЕНИЕ','Заключение по результатам служебной проверки':'ЗАКЛЮЧЕНИЕ','Уведомление о проведении служебной проверки':'УВЕДОМЛЕНИЕ','Рапорт о нарушении требований внутреннего устава':'РАПОРТ'})[val('#template')] || val('#template').replace(' СК','').toUpperCase();
  $('#ptitle').textContent = val('#title');
  $('#pintro').innerHTML = safeHtml($('#intro'));
  $('#ppoints').innerHTML = safeHtml($('#decision'));
  $('#decisionCaption').textContent = val('#template').startsWith('Заключение') ? 'ВЫВОДЫ:' : 'ПОСТАНОВИЛ:';
  $('#decisionCaption').hidden = !$('#decision').innerText.trim();
  $('#decisionEditorLabel').textContent = val('#template').startsWith('Заключение') ? 'Выводы' : 'Постановил';
  $('#decisionEditorLabel').hidden = !$('#decision').innerText.trim();
  $('#pauthor').textContent = val('#author');
  $('#pposition').textContent = val('#position');
  $('#psignature').textContent = val('#signatureText');
  $('#breadcrumb').textContent = val('#title');
  $('#introCount').textContent = countWords($('#intro')) + ' слов';
  $('#pointsCount').textContent = countWords($('#decision')) + ' слов';
  scheduleDownload();
}
document.querySelectorAll('input,select,[contenteditable]').forEach(el => el.addEventListener('input',update));
let templates={};
async function loadTemplates(){
 const session=await fetch('/api/session',{credentials:'same-origin'});
 if(!session.ok){location.replace('/login');return}
 const {role}=await session.json();$('#roleBadge').textContent=role==='admin'?'Администратор':'Пользователь';
 $('#addTemplate').hidden=role!=='admin';$('#deleteTemplate').hidden=role!=='admin';
 const response=await fetch('/api/templates',{credentials:'same-origin'});
 if(!response.ok)throw new Error('Не удалось загрузить шаблоны');
 const list=await response.json();templates=Object.fromEntries(list.map(t=>[t.name,t]));
 $('#template').replaceChildren(...list.map(t=>new Option(t.name,t.name)));
 if(list.length)$('#template').dispatchEvent(new Event('change'));
}
function setParagraphs(element,value){element.replaceChildren();for(const line of value.split('\n')){const p=document.createElement('p');p.textContent=line||' ';element.appendChild(p)}}
function setPoints(element,value){element.replaceChildren();if(!value)return;const ol=document.createElement('ol');for(const line of value.split('\n')){if(!line.trim())continue;const li=document.createElement('li');li.textContent=line;ol.appendChild(li)}element.appendChild(ol)}
$('#addTemplate').onclick=async()=>{
 const name=prompt('Название нового шаблона:');if(!name?.trim())return;
 const data={name:name.trim(),title:$('#title').value,code:$('#code').value,date:$('#date').value,author:$('#author').value,position:$('#position').value,signature:$('#signatureText').value,intro:$('#intro').innerText,decision:[...$('#decision').querySelectorAll('li')].map(li=>li.innerText).join('\n')||$('#decision').innerText};
 const response=await fetch('/api/templates',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(data)});
 if(!response.ok){alert((await response.json()).error||'Ошибка сохранения');return}
 await loadTemplates();$('#template').value=data.name;$('#template').dispatchEvent(new Event('change'));
};
$('#deleteTemplate').onclick=async()=>{
 const name=$('#template').value;if(!confirm('Удалить шаблон «'+name+'»?'))return;
 const response=await fetch('/api/templates/'+encodeURIComponent(name),{method:'DELETE',credentials:'same-origin'});
 if(!response.ok){alert('Не удалось удалить шаблон');return}
 await loadTemplates();
};
$('#logout').onclick=async()=>{await fetch('/api/logout',{method:'POST',credentials:'same-origin'});location.replace('/login')};
document.querySelectorAll('[contenteditable]').forEach(el=>el.addEventListener('paste',e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'))}));
$('#template').addEventListener('change',()=>{
  const doc=templates[$('#template').value]; if(!doc) return;
  for(const key of ['title','code','date','author','position']) $('#'+key).value=doc[key];
  $('#signatureText').value=doc.signature;
  setParagraphs($('#intro'),doc.intro);
  setPoints($('#decision'),doc.decision);
  $('#clearSignature').click(); update();
});
$('#addPoint').onclick = () => {
  let list = $('#decision').querySelector('ol');
  if (!list) { list=document.createElement('ol'); $('#decision').appendChild(list); }
  const li=document.createElement('li'); li.appendChild(document.createElement('br')); list.appendChild(li);
  const range=document.createRange(); range.selectNodeContents(li); range.collapse(true);
  const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(range); $('#decision').focus(); update();
};
$('#resetIntro').onclick=()=>{ $('#intro').textContent=''; update(); };
$('#newDoc').onclick=()=>{
  if(!confirm('Очистить документ?')) return;
  ['title','code','author','position','signatureText'].forEach(id => $('#'+id).value='');
  $('#intro').textContent=''; $('#decision').innerHTML='<ol><li><br></li></ol>';
  $('#clearSignature').click(); update();
};
$('#printDoc').onclick=()=>window.print();
let downloadTimer;
function scheduleDownload(){
  const anchor=$('#downloadDoc'); anchor.removeAttribute('href');anchor.setAttribute('aria-disabled','true');anchor.textContent='Подготовка PNG…';
  clearTimeout(downloadTimer);downloadTimer=setTimeout(prepareDownload,250);
}
async function prepareDownload(){
  const button=$('#downloadDoc');
  try {
    const width=1240, margin=65, right=width-margin;
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
    let y=0;
    const font=(size,bold=false,italic=false)=>`${italic?'italic ':''}${bold?'bold ':''}${size}px "Times New Roman", serif`;
    function line(text,x,baseline,size=25,bold=false,color='#151515',italic=false){ctx.font=font(size,bold,italic);ctx.fillStyle=color;ctx.fillText(text,x,baseline)}
    function wrapped(text,x,maxWidth,size=25,bold=false,indent=0){
      ctx.font=font(size,bold);const words=text.trim().split(/\s+/),lines=[];let current='';
      for(const word of words){const candidate=current?current+' '+word:word;if(ctx.measureText(candidate).width>maxWidth-(lines.length?0:indent)&&current){lines.push(current);current=word}else current=candidate}
      if(current)lines.push(current);
      for(let i=0;i<lines.length;i++){line(lines[i],x+(i===0?indent:0),y,size,bold);y+=size*1.44}
      return lines.length;
    }
    function paragraph(text,bold=false){if(!text.trim())return;wrapped(text,margin,right-margin,25,bold);y+=18}
    function imageLoaded(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=src})}
    const emblem=await imageLoaded(document.querySelector('.seal-emblem').src);
    const paragraphs=[...$('#pintro').children].map(p=>({text:p.innerText,bold:p.querySelector('b,strong')!==null&&p.innerText.trim()===p.querySelector('b,strong')?.innerText.trim()}));
    // First measure content at the same font and width used for the final image.
    y=735;
    for(const p of paragraphs)paragraph(p.text,p.bold);
    if(!$('#decisionCaption').hidden){y+=12;paragraph($('#decisionCaption').textContent,true)}
    const items=[...$('#ppoints').querySelectorAll('li')].map(li=>li.innerText);
    for(let i=0;i<items.length;i++){wrapped((i+1)+'. '+items[i],margin+22,right-margin-22,25);y+=9}
    const footerY=Math.max(1640,y+55),height=footerY+160;
    canvas.width=width;canvas.height=height;
    ctx.fillStyle='#e6e6e5';ctx.fillRect(0,0,width,height);
    ctx.drawImage(emblem,margin,55,76,154);
    line('ФЕДЕРАЛЬНАЯ СЛУЖБА БЕЗОПАСНОСТИ',margin,242,25,true);
    line('Управление № 9 · Россия Онлайн',margin,272,24,true);
    ctx.strokeStyle='#888';ctx.lineWidth=1.5;ctx.strokeRect(890,85,285,105);
    line('ДЛЯ СВЕДЕНИЯ',908,119,20);line($('#ptype').textContent,908,145,20);line('Экз. № 1',908,171,20);
    ctx.beginPath();ctx.moveTo(margin,312);ctx.lineTo(right,312);ctx.moveTo(margin,420);ctx.lineTo(right,420);ctx.stroke();
    line('№ '+$('#pcode').textContent,margin,353,21);line('дата '+$('#pdate').textContent,margin,384,21);
    line('подпись ФСБ',right-140,353,20);line('место г. Москва',right-164,384,20);
    const docType=$('#ptype').textContent;const spacing=10;
    ctx.font=font(52,true);const titleWidth=[...docType].reduce((sum,char)=>sum+ctx.measureText(char).width+spacing,0)-spacing;let x=(width-titleWidth)/2;
    for(const char of docType){line(char,x,500,52,true);x+=ctx.measureText(char).width+spacing}
    ctx.font=font(29);line($('#ptitle').textContent,(width-ctx.measureText($('#ptitle').textContent).width)/2,555,29);
    y=735;
    for(const p of paragraphs)paragraph(p.text,p.bold);
    if(!$('#decisionCaption').hidden){y+=12;paragraph($('#decisionCaption').textContent,true)}
    for(let i=0;i<items.length;i++){wrapped((i+1)+'. '+items[i],margin+22,right-margin-22,25);y+=9}
    ctx.strokeStyle='#aaa';ctx.beginPath();ctx.moveTo(margin,footerY);ctx.lineTo(right,footerY);ctx.stroke();
    ctx.globalAlpha=.25;ctx.drawImage(emblem,margin,footerY+20,83,126);ctx.globalAlpha=1;
    const signature=$('#psignatureImage');
    if(!signature.hidden&&signature.src){const signImg=await imageLoaded(signature.src);ctx.drawImage(signImg,right-300,footerY+15,260,58)}
    else {ctx.textAlign='right';line($('#signatureText').value,right,footerY+78,36,false,'#576584',true);ctx.textAlign='left'}
    ctx.textAlign='right';line($('#pposition').textContent,right,footerY+113,20);line($('#pauthor').textContent,right,footerY+139,21,true);ctx.textAlign='left';
    const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!png)throw new Error('PNG не создан');
    const oldUrl=button.dataset.blobUrl;
    button.href=URL.createObjectURL(png);button.dataset.blobUrl=button.href;
    button.download=(docType.toLowerCase().replace(/[^а-яёa-z0-9]+/gi,'-')||'документ')+'.png';
    button.removeAttribute('aria-disabled');button.textContent='Скачать PNG';
    if(oldUrl)URL.revokeObjectURL(oldUrl);
  }catch(error){console.error(error);button.textContent='Ошибка подготовки PNG'}
}
function initSignature(){
  const canvas=$('#signaturePad'),ctx=canvas.getContext('2d'); let drawing=false,hasInk=false;
  function point(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height}}
  function sync(){const img=$('#psignatureImage');img.src=canvas.toDataURL('image/png');img.hidden=!hasInk;$('#psignature').hidden=hasInk}
  canvas.addEventListener('pointerdown',e=>{drawing=true;hasInk=true;canvas.setPointerCapture(e.pointerId);const p=point(e);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+.01,p.y+.01);ctx.strokeStyle='#3a4c78';ctx.lineWidth=2.5;ctx.lineCap='round';ctx.stroke();sync()});
  canvas.addEventListener('pointermove',e=>{if(!drawing)return;const p=point(e);ctx.lineTo(p.x,p.y);ctx.stroke();sync()});
  for(const event of ['pointerup','pointercancel'])canvas.addEventListener(event,()=>drawing=false);
  $('#clearSignature').onclick=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);hasInk=false;sync()};sync();
}
initSignature(); loadTemplates().catch(error=>{console.error(error);alert('Не удалось открыть шаблоны')});
