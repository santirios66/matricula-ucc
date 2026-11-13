'use strict';
const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// [clave, etiqueta, tipo, límite o mínimo, catálogo relacionado, opcional]
const modules = {
 estudiantes:{title:'Estudiantes',singular:'estudiante',icon:'♙',description:'Consulta y registra los estudiantes de la comunidad universitaria.',fields:[['id_estudiante','Cédula','text',20],['nombre','Nombres','text',60],['apellidos','Apellidos','text',60],['correo','Correo electrónico','email',100],['telefono','Teléfono','tel',20,null,true],['semestre','Semestre','number',1],['id_programa','Programa','select',null,'programas']]},
 profesores:{title:'Profesores',singular:'profesor',icon:'♧',description:'Organiza el equipo docente y sus datos de identificación.',fields:[['id_profesor','ID del profesor','text',20],['nombre','Nombres','text',60],['apellidos','Apellidos','text',60]]},
 facultades:{title:'Facultades',singular:'facultad',icon:'▦',description:'Administra las facultades que organizan la oferta académica.',fields:[['id_facultad','Código','text',10],['nombre_facultad','Nombre de la facultad','text',100]]},
 programas:{title:'Programas',singular:'programa',icon:'▤',description:'Conecta cada programa académico con su facultad.',fields:[['id_programa','Código','text',10],['nombre_programa','Nombre del programa','text',100],['id_facultad','Facultad','select',null,'facultades']]},
 materias:{title:'Materias',singular:'materia',icon:'▥',description:'Gestiona la oferta de cursos, sus horarios y profesores.',fields:[['id_materia','Código','text',10],['nombre_curso','Nombre del curso','text',100],['creditos','Créditos','number',1],['cupos','Cupos','number',0],['id_facultad','Facultad','select',null,'facultades'],['horario','Horario','text',100,null,true],['id_profesor','Profesor','select',null,'profesores']]}
};
let data = {}, errors = {}, current = 'resumen', loading = false, editing = null, saving = false;
async function api(path, options = {}) {
 const controller = new AbortController(), timer = setTimeout(()=>controller.abort(),15000);
 try {
  const response = await fetch(window.API_BASE_URL.replace(/\/$/,'')+path,{...options,signal:controller.signal});
  const body = await response.json().catch(()=>null);
  if (!response.ok) {
   let message = body?.detail;
   if (Array.isArray(message)) message = message.map(e=>`${e.loc?.slice(1).join('.')}: ${e.msg}`).join(' · ');
   throw new Error(typeof message === 'string' ? message : `Error ${response.status}. Revisa la terminal del backend y la conexión a PostgreSQL.`);
  }
  return body;
 } catch(error) {
  if(error.name==='AbortError') throw new Error('La API tardó demasiado. Revisa si el registro se guardó antes de volver a enviarlo.');
  if(error instanceof TypeError) throw new Error('No se pudo conectar con la API. Inicia el backend en localhost:8000 y abre este portal en http://localhost:5173.');
  throw error;
 } finally {clearTimeout(timer);}
}
function notice(message, success=false){$('#notice').textContent=message;$('#notice').className=success?'success':'';$('#notice').hidden=!message;}
async function refresh(){
 if(loading)return; loading=true;$('#refresh').disabled=true;notice('');render();
 await Promise.all(Object.keys(modules).map(async key=>{
  try{const rows=await api(`/${key}/`);if(!Array.isArray(rows))throw new Error('La API devolvió una respuesta no válida.');data[key]=rows;delete errors[key];}
  catch(e){delete data[key];errors[key]=e.message;}
 }));
 loading=false;$('#refresh').disabled=false;
 const failed=Object.keys(errors);$('#connection').textContent=failed.length?'● Conexión incompleta':'● Datos conectados';
 if(failed.length)notice(`${failed.map(k=>modules[k].title).join(', ')}: ${errors[failed[0]]}`);
 render();
}
function go(key){current=key;location.hash=key;render();}
function relatedLabel(key,id){
 const m=modules[key], row=(data[key]||[]).find(r=>r[m.fields[0][0]]===id);
 return row ? `${id} · ${row.nombre_facultad||row.nombre_programa||[row.nombre,row.apellidos].filter(Boolean).join(' ')}` : id;
}
function display(row,field){return field[4]?relatedLabel(field[4],row[field[0]]):row[field[0]];}
function table(key,rows){const m=modules[key];return `<div class="table-wrap"><table><thead><tr>${m.fields.map(f=>`<th scope="col">${esc(f[1])}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${m.fields.map((f,i)=>`<td>${i===0?`<span class="id">${esc(row[f[0]])}</span>`:esc(display(row,f)??'—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
function renderRows(query=''){
 const key=current, area=$('#rows');if(!area)return;
 if(loading){area.innerHTML='<div class="empty">Cargando registros…</div>';return;}
 if(errors[key]){area.innerHTML='<div class="empty">No se pudieron cargar los datos. Pulsa Actualizar para reintentar.</div>';return;}
 const all=data[key]||[], q=query.toLocaleLowerCase('es'), rows=all.filter(r=>modules[key].fields.some(f=>String(display(r,f)??'').toLocaleLowerCase('es').includes(q)));
 $('#count').textContent=`${rows.length} de ${all.length} registros`;
 area.innerHTML=rows.length?table(key,rows):`<div class="empty">${q?'No hay coincidencias con tu búsqueda.':'Todavía no hay registros. Crea el primero para empezar.'}</div>`;
}
function render(){
 $('#breadcrumb').textContent=current==='resumen'?'Resumen':modules[current].title;
 $('#title').textContent=current==='resumen'?'Resumen académico':modules[current].title;
 $('#subtitle').textContent=current==='resumen'?'Toda tu comunidad académica, en un solo lugar.':modules[current].description;
 $('#nav').innerHTML=[['resumen','Resumen','◈'],...Object.entries(modules).map(([k,m])=>[k,m.title,m.icon])].map(([k,t,i])=>`<button data-page="${k}" class="${k===current?'active':''}" ${k===current?'aria-current="page"':''}><span aria-hidden="true">${i}</span>${t}</button>`).join('');
 $('#nav').querySelectorAll('button').forEach(b=>b.onclick=()=>go(b.dataset.page));
 if(current==='resumen'){
  $('#view').innerHTML=`<section class="hero"><div><p class="eyebrow">TU CAMPUS, MEJOR ORGANIZADO</p><h2>La información que conecta<br>a tu comunidad.</h2><p>Consulta la oferta académica y mantén al día los registros de estudiantes y profesores.</p></div><button id="hero-action">Ver estudiantes →</button></section><section class="stats" aria-label="Totales">${Object.entries(modules).map(([k,m])=>`<button class="stat" data-page="${k}"><span>${m.icon} &nbsp; ${m.title}</span><strong>${loading?'…':data[k]?.length??'—'}</strong><span>Consultar registros →</span></button>`).join('')}</section><section class="panel"><div class="panel-top"><div><h2>Oferta académica</h2><p>Materias registradas y docentes asignados</p></div><button class="secondary" id="courses">Ver todas →</button></div>${loading?'<div class="empty">Cargando oferta académica…</div>':data.materias?.length?table('materias',data.materias.slice(0,5)):'<div class="empty">'+(errors.materias?'La oferta académica no está disponible. Revisa la conexión.':'Aún no hay materias registradas.')+'</div>'}</section><section class="help"><article><h3>Un registro conectado</h3><p>Empieza por las facultades y profesores. Después registra programas, materias y estudiantes.</p></article><article><h3>Alcance del portal</h3><p>Consulta y registro académico. Matrículas, notas, cuentas y reportes PDF pertenecen a la aplicación de escritorio.</p></article></section>`;
  $('#hero-action').onclick=()=>go('estudiantes');$('#courses').onclick=()=>go('materias');$('#view').querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>go(b.dataset.page));
 }else{
  const m=modules[current];$('#view').innerHTML=`<section class="panel"><div class="panel-top"><div><h2>Directorio de ${m.title.toLowerCase()}</h2><p>Información registrada en el sistema académico</p></div><button id="new" ${loading?'disabled':''}>+ Registrar ${m.singular}</button></div><div class="toolbar"><input id="search" type="search" aria-label="Buscar registros" placeholder="Buscar por código, nombre u otros datos…"><span class="count" id="count"></span></div><div id="rows"></div></section>`;
  $('#new').onclick=openForm;$('#search').oninput=e=>renderRows(e.target.value);renderRows();
 }
}
function openForm(){
 const m=modules[current];editing=current;$('#form').reset();$('#form-error').textContent='';$('#dialog-title').textContent=`Registrar ${m.singular}`;
 $('#fields').innerHTML=m.fields.map(([key,label,type,limit,source,optional])=>{
  let control;
  if(type==='select'){
   const rows=data[source]||[],id=modules[source].fields[0][0];control=`<select name="${key}" id="field-${key}" required><option value="">${rows.length?'Selecciona una opción':`Primero registra ${modules[source].title.toLowerCase()}`}</option>${rows.map(r=>`<option value="${esc(r[id])}">${esc(relatedLabel(source,r[id]))}</option>`).join('')}</select>`;
  }else control=`<input id="field-${key}" name="${key}" type="${type}" ${optional?'':'required'} ${type==='number'?`min="${limit}" max="2147483647" step="1"`:`maxlength="${limit}"`} ${key==='cupos'?'value="20"':''}>`;
  return `<div><label for="field-${key}">${label}${optional?' (opcional)':' *'}</label>${control}</div>`;
 }).join('');
 const missing=m.fields.filter(f=>f[4]&&(!data[f[4]]?.length||errors[f[4]]));
 $('#save').disabled=!!missing.length;
 if(missing.length)$('#form-error').textContent='Carga o registra primero: '+missing.map(f=>modules[f[4]].title).join(', ')+'.';
 $('#dialog').showModal();
}
function closeForm(){if(!saving)$('#dialog').close();}
$('#form').onsubmit=async e=>{
 e.preventDefault();if(saving)return;
 const key=editing,payload={}, values=new FormData(e.target);$('#form-error').textContent='';
 for(const [name,label,type,, ,optional] of modules[key].fields){
  const raw=String(values.get(name)||'').trim();
  if(!optional&&!raw){$('#form-error').textContent=`Completa el campo ${label}.`;return;}
  payload[name]=type==='number'?Number(raw):(raw||null);
 }
 saving=true;$('#save').disabled=true;$('#save').textContent='Guardando…';$('#cancel').disabled=true;$('#close').disabled=true;
 try{await api(`/${key}/`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});$('#dialog').close();await refresh();if(!Object.keys(errors).length)notice('Registro guardado correctamente.',true);else notice('Registro guardado. No se pudo actualizar todo el directorio; pulsa Actualizar.');}
 catch(error){$('#form-error').textContent=error.message;}
 finally{saving=false;$('#save').disabled=false;$('#save').textContent='Guardar registro';$('#cancel').disabled=false;$('#close').disabled=false;}
};
$('#dialog').addEventListener('cancel',e=>{if(saving)e.preventDefault();});$('#close').onclick=closeForm;$('#cancel').onclick=closeForm;$('#refresh').onclick=refresh;
window.addEventListener('hashchange',()=>{const hash=location.hash.slice(1);current=modules[hash]?hash:'resumen';render();});
current=modules[location.hash.slice(1)]?location.hash.slice(1):'resumen';refresh();
