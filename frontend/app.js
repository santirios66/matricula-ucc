'use strict';
const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// ====== Sesión: única fuente de verdad, SOLO en memoria ======
let SESION = null;           // {usuario, rol, id_persona, clave} tras login válido
let data = {}, errors = {}, current = 'resumen', loading = false, saving = false;

const MENUS = {
  Administrador: [
    ['resumen','Resumen','◈'], ['facultades','Facultades','▦'], ['programas','Programas','▤'],
    ['materias','Materias','▥'], ['profesores','Profesores','♧'], ['estudiantes','Estudiantes','♙'],
    ['periodos','Periodos','⏱'], ['cuentas','Cuentas','👤'],
  ],
  Estudiante: [
    ['matricular','Matricular','✓'], ['misnotas','Mis notas','✎'], ['docs','Mis documentos','⇩'],
  ],
  Profesor: [
    ['ingresarnotas','Ingresar notas','✎'], ['reportes','Reportes','⇩'],
  ],
};

// ====== API ======
async function api(path, options = {}) {
  const controller = new AbortController(), timer = setTimeout(()=>controller.abort(),15000);
  try {
    const response = await fetch(window.API_BASE_URL.replace(/\/$/,'')+path,{...options,signal:controller.signal});
    const body = await response.json().catch(()=>null);
    if (!response.ok) {
      let message = body?.detail;
      if (Array.isArray(message)) message = message.map(e=>`${e.loc?.slice(1).join('.')}: ${e.msg}`).join(' · ');
      const error = new Error(typeof message === 'string' ? message : `Error ${response.status}. Revisa la terminal del backend y la conexión a PostgreSQL.`);
      error.status = response.status;
      throw error;
    }
    return body;
  } catch(error) {
    if(error.name==='AbortError') throw new Error('La API tardó demasiado. Revisa si el registro se guardó antes de volver a enviarlo.');
    if(error instanceof TypeError) throw new Error('No se pudo conectar con la API. Inicia el backend en localhost:8000.');
    throw error;
  } finally {clearTimeout(timer);}
}
function headersAuth(){
  if(!SESION) return {};
  return {'X-Usuario': SESION.usuario, 'X-Clave': SESION.clave};
}
async function apiAuth(path, options={}){
  return api(path, {...options, headers:{...headersAuth(), ...(options.headers||{})}});
}
function mensajeRol(error){
  return error.status===401 || error.status===403
    ? 'No tienes permiso para esta acción. Inicia sesión con la cuenta adecuada.'
    : error.message;
}
function notice(message, success=false){$('#notice').textContent=message;$('#notice').className=success?'success':'';$('#notice').hidden=!message;}

// ====== Catálogos usados por varios módulos ======
const CATALOGOS = ['facultades','programas','materias','profesores','estudiantes','periodos'];
async function refreshCatalogos(){
  await Promise.all(CATALOGOS.map(async key=>{
    try{const rows=await api(`/${key}/`);if(!Array.isArray(rows))throw new Error('La API devolvió una respuesta no válida.');data[key]=rows;delete errors[key];}
    catch(e){delete data[key];errors[key]=e.message;}
  }));
  const failed=CATALOGOS.filter(k=>errors[k]);
  $('#connection').textContent=failed.length?'● Conexión incompleta':'● Datos conectados';
  if(failed.length)notice(`${failed.join(', ')}: ${errors[failed[0]]}`);
}

// ====== Login ======
$('#login-form').addEventListener('submit', async e=>{
  e.preventDefault();$('#login-error').textContent='';
  const usuario=$('#login-usuario').value.trim(), clave=$('#login-clave').value;
  $('#login-btn').disabled=true;
  try{
    const sesion=await api('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({usuario,clave})});
    if(sesion.debe_cambiar_clave){
      SESION={usuario:sesion.usuario,rol:sesion.rol,id_persona:sesion.id_persona,clave};
      $('#cambio-clave').showModal();
      return;
    }
    iniciarSesion({usuario:sesion.usuario,rol:sesion.rol,id_persona:sesion.id_persona,clave});
  }catch(error){
    $('#login-error').textContent = error.status===401
      ? 'Usuario o contraseña incorrectos'
      : error.message;
  }finally{$('#login-btn').disabled=false;$('#login-clave').value='';}
});
function iniciarSesion(sesion){
  SESION=sesion;
  $('#login-screen').hidden=true;$('#app-aside').hidden=false;$('#app-workspace').hidden=false;
  $('#session-info').textContent=`Sesión: ${sesion.usuario} (${sesion.rol})`;
  $('#login-usuario').value='';$('#login-clave').value='';
  current='resumen';
  render();
}
$('#logout').onclick=()=>{
  SESION=null;data={};errors={};
  $('#login-screen').hidden=false;$('#app-aside').hidden=true;$('#app-workspace').hidden=true;
  $('#login-error').textContent='';location.hash='';
};
// Cualquier clic en menús/botones sin sesión: aviso y no cambia de pantalla
document.addEventListener('click',e=>{
  if(SESION) return;
  const t=e.target.closest('button, nav a, [data-page]');
  if(t && !t.closest('#login-form')){e.preventDefault();$('#login-error')&&($('#login-error').textContent='');notice('Inicia sesión para continuar');}
},true);

// Cambio obligatorio de clave
$('#cambio-form').addEventListener('submit',async e=>{
  e.preventDefault();$('#cambio-error').textContent='';
  const nueva=$('#clave-nueva').value, confirma=$('#clave-confirma').value;
  if(nueva.length<8){$('#cambio-error').textContent='La clave nueva debe tener al menos 8 caracteres.';return;}
  if(nueva!==confirma){$('#cambio-error').textContent='Las dos claves no coinciden.';return;}
  if(nueva===SESION.clave){$('#cambio-error').textContent='La clave nueva debe ser distinta de la actual.';return;}
  try{
    await api('/auth/cambiar-clave',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({usuario:SESION.usuario,clave_actual:SESION.clave,clave_nueva:nueva})});
    SESION.clave=nueva;
    $('#cambio-clave').close();
    $('#clave-nueva').value='';$('#clave-confirma').value='';
    iniciarSesion({...SESION});
    notice('Clave actualizada. Bienvenido.',true);
  }catch(error){$('#cambio-error').textContent=error.message;}
});

// ====== Definición de módulos de catálogo (solo admin los ve) ======
const modules = {
 estudiantes:{title:'Estudiantes',singular:'estudiante',icon:'♙',description:'Consulta y registra los estudiantes de la comunidad universitaria.',fields:[['id_estudiante','Cédula','text',20],['nombre','Nombres','text',60],['apellidos','Apellidos','text',60],['correo','Correo electrónico','email',100],['telefono','Teléfono','tel',20,null,true],['semestre','Semestre','number',1],['id_programa','Programa','select',null,'programas']]},
 profesores:{title:'Profesores',singular:'profesor',icon:'♧',description:'Organiza el equipo docente y sus datos de identificación.',fields:[['id_profesor','ID del profesor','text',20],['nombre','Nombres','text',60],['apellidos','Apellidos','text',60]]},
 facultades:{title:'Facultades',singular:'facultad',icon:'▦',description:'Administra las facultades que organizan la oferta académica.',fields:[['id_facultad','Código','text',10],['nombre_facultad','Nombre de la facultad','text',100]]},
 programas:{title:'Programas',singular:'programa',icon:'▤',description:'Conecta cada programa académico con su facultad.',fields:[['id_programa','Código','text',10],['nombre_programa','Nombre del programa','text',100],['id_facultad','Facultad','select',null,'facultades']]},
 materias:{title:'Materias',singular:'materia',icon:'▥',description:'Gestiona la oferta de cursos, sus horarios y profesores.',fields:[['id_materia','Código','text',10],['nombre_curso','Nombre del curso','text',100],['creditos','Créditos','number',1],['cupos','Cupos','number',0],['id_facultad','Facultad','select',null,'facultades'],['horario','Horario','text',100,null,true],['id_profesor','Profesor','select',null,'profesores']]},
 periodos:{title:'Periodos',singular:'periodo',icon:'⏱',description:'Ventanas de fechas en las que se puede matricular.',fields:[['periodo','Periodo (ej. 2026-2)','text',10],['fecha_inicio','Fecha inicio (YYYY-MM-DD)','date',null],['fecha_fin','Fecha fin (YYYY-MM-DD)','date',null]]},
};
function relatedLabel(key,id){
 const m=modules[key], row=(data[key]||[]).find(r=>r[m.fields[0][0]]===id);
 return row ? `${id} · ${row.nombre_facultad||row.nombre_programa||row.nombre_curso||[row.nombre,row.apellidos].filter(Boolean).join(' ')}` : id;
}
function display(row,field){return field[4]?relatedLabel(field[4],row[field[0]]):row[field[0]];}
function table(key,rows){const m=modules[key];return `<div class="table-wrap"><table><thead><tr>${m.fields.map(f=>`<th scope="col">${esc(f[1])}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${m.fields.map((f,i)=>`<td>${i===0?`<span class="id">${esc(row[f[0]])}</span>`:esc(display(row,f)??'—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}

// ====== Render principal ======
function go(key){current=key;location.hash=key;render();}
function navItems(){return MENUS[SESION?.rol]||[['resumen','Resumen','◈']];}
function render(){
 if(!SESION) return;
 const titulo={resumen:'Resumen académico',matricular:'Matricular',misnotas:'Mis notas',docs:'Mis documentos',ingresarnotas:'Ingresar notas',reportes:'Reportes',cuentas:'Cuentas'};
 $('#breadcrumb').textContent=titulo[current]||modules[current]?.title||'Resumen';
 $('#title').textContent=titulo[current]||modules[current]?.title||'Resumen académico';
 $('#subtitle').textContent={resumen:'Todo según tu rol: '+SESION.rol,matricular:'Arma tu carrito y confirma: total entre 6 y 19 créditos.',misnotas:'Tus calificaciones registradas.',docs:'Descarga tus reportes en PDF.',ingresarnotas:'Califica a los estudiantes de tus materias.',reportes:'PDF de tus estudiantes.',cuentas:'Crea cuentas y restablece claves.',periodos:'Ventanas de matrícula.'}[current]||modules[current]?.description||'';
 $('#nav').innerHTML=navItems().map(([k,t,i])=>`<button data-page="${k}" class="${k===current?'active':''}" ${k===current?'aria-current="page"':''}><span aria-hidden="true">${i}</span>${t}</button>`).join('');
 $('#nav').querySelectorAll('button').forEach(b=>b.onclick=()=>go(b.dataset.page));
 const vistas={resumen:vistaResumen,matricular:vistaMatricular,misnotas:vistaMisNotas,docs:vistaDocs,ingresarnotas:vistaIngresarNotas,reportes:vistaReportes,cuentas:vistaCuentas};
 if(vistas[current]){vistas[current]();return;}
 vistaCatalogo();
}
function vistaResumen(){
 $('#refresh').hidden=false;
 if(SESION.rol==='Administrador'){
  $('#view').innerHTML=`<section class="stats" aria-label="Totales">${Object.entries(modules).map(([k,m])=>`<button class="stat" data-page="${k}"><span>${m.icon} &nbsp; ${m.title}</span><strong>${loading?'…':data[k]?.length??'—'}</strong><span>Consultar registros →</span></button>`).join('')}</section><section class="panel"><div class="panel-top"><div><h2>Oferta académica</h2><p>Materias registradas y docentes asignados</p></div><button class="secondary" id="courses">Ver todas →</button></div>${data.materias?.length?table('materias',data.materias.slice(0,5)):'<div class="empty">Aún no hay materias registradas.</div>'}</section>`;
  $('#view').querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>go(b.dataset.page));
  $('#courses').onclick=()=>go('materias');
 } else if(SESION.rol==='Estudiante'){
  $('#view').innerHTML=`<section class="panel"><div class="panel-top"><div><h2>Bienvenido, ${esc(SESION.usuario)}</h2><p>Cédula ${esc(SESION.id_persona)} · rol ${esc(SESION.rol)}</p></div></div><div class="help"><article><h3>Matricular</h3><p>Arma tu carrito con las materias de tu facultad. Total entre 6 y 19 créditos.</p><button data-page="matricular">Ir a matricular →</button></article><article><h3>Mis notas</h3><p>Consulta tus calificaciones.</p><button data-page="misnotas">Ver notas →</button></article><article><h3>Mis documentos</h3><p>Recibo de matrícula y reporte de notas en PDF.</p><button data-page="docs">Descargar →</button></article></div></section>`;
  $('#view').querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>go(b.dataset.page));
 } else {
  $('#view').innerHTML=`<section class="panel"><div class="panel-top"><div><h2>Bienvenido, ${esc(SESION.usuario)}</h2><p>Profesor · ID ${esc(SESION.id_persona)}</p></div></div><div class="help"><article><h3>Ingresar notas</h3><p>Elige una de tus materias y califica a sus estudiantes.</p><button data-page="ingresarnotas">Ingresar notas →</button></article><article><h3>Reportes</h3><p>PDF de notas de tus estudiantes.</p><button data-page="reportes">Ver reportes →</button></article></div></section>`;
  $('#view').querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>go(b.dataset.page));
 }
}

// ====== Catálogo (solo admin) ======
function vistaCatalogo(){
 const key=current, m=modules[key];
 if(!m){$('#view').innerHTML='<div class="empty">Pantalla no disponible.</div>';return;}
 $('#refresh').hidden=false;
 $('#view').innerHTML=`<section class="panel"><div class="panel-top"><div><h2>Directorio de ${m.title.toLowerCase()}</h2><p>Información registrada en el sistema académico</p></div><button id="new">+ Registrar ${m.singular}</button></div><div class="toolbar"><input id="search" type="search" aria-label="Buscar registros" placeholder="Buscar…"><span class="count" id="count"></span></div><div id="rows"></div></section>`;
 $('#new').onclick=openForm;$('#search').oninput=e=>renderRows(e.target.value);renderRows();
}
function renderRows(query=''){
 const key=current, area=$('#rows');if(!area)return;
 if(loading){area.innerHTML='<div class="empty">Cargando registros…</div>';return;}
 if(errors[key]){area.innerHTML='<div class="empty">No se pudieron cargar los datos. Pulsa Actualizar para reintentar.</div>';return;}
 const all=data[key]||[], q=query.toLocaleLowerCase('es'), rows=all.filter(r=>modules[key].fields.some(f=>String(display(r,f)??'').toLocaleLowerCase('es').includes(q)));
 $('#count').textContent=`${rows.length} de ${all.length} registros`;
 area.innerHTML=rows.length?table(key,rows):`<div class="empty">${q?'No hay coincidencias con tu búsqueda.':'Todavía no hay registros. Crea el primero para empezar.'}</div>`;
}
function openForm(){
 const m=modules[current];$('#form').reset();$('#form-error').textContent='';$('#dialog-title').textContent=`Registrar ${m.singular}`;$('#dialog-eyebrow').textContent='NUEVO REGISTRO';$('#dialog-hint').textContent='Completa los datos. Los campos con * son obligatorios.';
 $('#fields').innerHTML=m.fields.map(([key,label,type,limit,source,optional])=>{
  let control;
  if(type==='select'){
   const rows=data[source]||[],id=modules[source].fields[0][0];control=`<select name="${key}" id="field-${key}" required><option value="">${rows.length?'Selecciona una opción':`Primero registra ${modules[source].title.toLowerCase()}`}</option>${rows.map(r=>`<option value="${esc(r[id])}">${esc(relatedLabel(source,r[id]))}</option>`).join('')}</select>`;
  }else control=`<input id="field-${key}" name="${key}" type="${type}" ${optional?'':'required'} ${type==='number'?`min="${limit}" max="2147483647" step="1"`:`maxlength="${limit||10}"`} ${key==='cupos'?'value="20"':''}>`;
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
 const key=current,payload={}, values=new FormData(e.target);$('#form-error').textContent='';
 for(const [name,label,type,, ,optional] of modules[key].fields){
  const raw=String(values.get(name)||'').trim();
  if(!optional&&!raw){$('#form-error').textContent=`Completa el campo ${label}.`;return;}
  payload[name]=type==='number'?Number(raw):(raw||null);
 }
 saving=true;$('#save').disabled=true;$('#save').textContent='Guardando…';$('#cancel').disabled=true;$('#close').disabled=true;
 try{await apiAuth(`/${key}/`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});$('#dialog').close();await refreshCatalogos();if(!errors[key])notice('Registro guardado correctamente.',true);}
 catch(error){$('#form-error').textContent=mensajeRol(error);}
 finally{saving=false;$('#save').disabled=false;$('#save').textContent='Guardar registro';$('#cancel').disabled=false;$('#close').disabled=false;}
};
$('#dialog').addEventListener('cancel',e=>{if(saving)e.preventDefault();});$('#close').onclick=closeForm;$('#cancel').onclick=closeForm;

// ====== Estudiante: Matricular (carrito) ======
let carrito=new Set();
async function vistaMatricular(){
 $('#refresh').hidden=false;
 if(SESION.rol!=='Estudiante'){$('#view').innerHTML='<div class="empty">No tienes permiso para esta acción.</div>';return;}
 $('#view').innerHTML='<div class="empty">Cargando materias disponibles…</div>';
 try{
  const materias=await api(`/estudiantes/${encodeURIComponent(SESION.id_persona)}/materias-disponibles`);
  const opciones=materias.map(m=>`<label class="carrito-item"><input type="checkbox" value="${esc(m.id_materia)}" data-creditos="${m.creditos}"> <b>${esc(m.id_materia)}</b> · ${esc(m.nombre_curso)} <span class="muted">${m.creditos} créditos · cupos ${m.cupos} · ${esc(m.horario||'sin horario')}</span></label>`).join('');
  $('#view').innerHTML=`<section class="panel"><div class="panel-top"><div><h2>Materias de tu facultad</h2><p>Marca las que quieres matricular en el periodo 2026-2</p></div></div>${materias.length?`<div class="carrito">${opciones}</div>`:'<div class="empty">Tu facultad todavía no tiene materias.</div>'}<div class="panel-top"><div><h2 id="total-creditos">Total: 0 créditos</h2><p class="muted">Debe quedar entre 6 y 19</p></div><button id="confirmar-carrito" disabled>Matricular selección</button></div></section>`;
  const checkboxes=[...$('#view').querySelectorAll('.carrito-item input')];
  const total=()=>checkboxes.filter(c=>c.checked).reduce((s,c)=>s+Number(c.dataset.creditos),0);
  const pintaTotal=()=>{const t=total();const el=$('#total-creditos');el.textContent=`Total: ${t} créditos`;el.style.color=(t>=6&&t<=19)?'#2E8B57':'#b02a37';$('#confirmar-carrito').disabled=!(t>=6&&t<=19);};
  checkboxes.forEach(c=>c.onchange=()=>{c.checked?carrito.add(c.value):carrito.delete(c.value);pintaTotal();});
  $('#confirmar-carrito').onclick=async()=>{
   const seleccion=checkboxes.filter(c=>c.checked).map(c=>c.value);
   try{
    const res=await apiAuth('/matriculas/lote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cedula:SESION.id_persona,periodo:'2026-2',id_materias:seleccion})});
    notice(`Matrícula confirmada: ${res.matriculas.length} materias, ${res.total_creditos} créditos.`,true);
    carrito.clear();await vistaMatricular();
   }catch(error){notice(mensajeRol(error));}
  };
  pintaTotal();
 }catch(error){$('#view').innerHTML=`<div class="empty">${esc(mensajeRol(error))}</div>`;}
}

// ====== Estudiante: Mis notas ======
async function vistaMisNotas(){
 $('#refresh').hidden=false;
 $('#view').innerHTML='<div class="empty">Cargando…</div>';
 try{
  const notas=await apiAuth('/notas/');
  const propias=notas.filter(n=>true);
  if(!propias.length){$('#view').innerHTML='<div class="empty">Aún no tienes notas registradas.</div>';return;}
  const filas=propias.map(n=>`<tr><td><span class="id">${esc(n.id_nota)}</span></td><td>${esc(n.id_materia)}</td><td>${n.nota1??'—'}</td><td>${n.nota2??'—'}</td><td>${n.nota3??'—'}</td><td><b>${n.definitiva??'—'}</b></td><td>${esc(n.estado||'Sin notas')}</td></tr>`).join('');
  $('#view').innerHTML=`<section class="panel"><div class="table-wrap"><table><thead><tr><th>ID</th><th>Materia</th><th>N1</th><th>N2</th><th>N3</th><th>Definitiva</th><th>Estado</th></tr></thead><tbody>${filas}</tbody></table></div></section>`;
 }catch(error){$('#view').innerHTML=`<div class="empty">${esc(mensajeRol(error))}</div>`;}
}

// ====== Descarga de PDF con credenciales ======
async function descargarPDF(url,nombre){
 try{
  const response=await fetch(window.API_BASE_URL.replace(/\/$/,'')+url,{headers:headersAuth()});
  if(!response.ok){
   let detail='';try{detail=(await response.json())?.detail||'';}catch(_){}
   notice(response.status===403?'No tienes permiso para esta acción.':(detail||`Error ${response.status}`));return;
  }
  const blob=await response.blob();const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=nombre;a.click();URL.revokeObjectURL(a.href);
  notice(`Descargado ${nombre}`,true);
 }catch(error){notice(error.message);}
}
function vistaDocs(){
 $('#refresh').hidden=true;
 const cedula=encodeURIComponent(SESION.id_persona);
 $('#view').innerHTML=`<section class="panel"><div class="help"><article><h3>Recibo de matrícula</h3><p>Radicado, periodo, fecha y total de créditos.</p><button id="pdf-matricula">Descargar recibo ⇩</button></article><article><h3>Reporte de notas</h3><p>Boletín con todas tus materias.</p><button id="pdf-notas">Descargar notas ⇩</button></article></div></section>`;
 $('#pdf-matricula').onclick=()=>descargarPDF(`/pdf/matricula/${cedula}`,`Recibo_Matricula_${SESION.id_persona}.pdf`);
 $('#pdf-notas').onclick=()=>descargarPDF(`/pdf/notas/${cedula}`,`Reporte_Notas_${SESION.id_persona}.pdf`);
}

// ====== Profesor: Ingresar notas ======
async function vistaIngresarNotas(){
 $('#refresh').hidden=false;
 if(SESION.rol!=='Profesor'){$('#view').innerHTML='<div class="empty">No tienes permiso para esta acción.</div>';return;}
 $('#view').innerHTML='<div class="empty">Cargando tus materias…</div>';
 try{
  await refreshCatalogos();
  const mias=(data.materias||[]).filter(m=>m.id_profesor===SESION.id_persona);
  if(!mias.length){$('#view').innerHTML='<div class="empty">No tienes materias asignadas.</div>';return;}
  const matriculas=await apiAuth('/matriculas/');
  const opciones=mias.map(m=>`<option value="${esc(m.id_materia)}">${esc(m.id_materia)} · ${esc(m.nombre_curso)}</option>`).join('');
  $('#view').innerHTML=`<section class="panel"><div class="panel-top"><div><h2>Elige una de tus materias</h2><p>Solo puedes calificar las tuyas</p></div></div><div class="fields"><div><label for="sel-materia">Materia</label><select id="sel-materia">${opciones}</select></div></div><div id="estudiantes-notas"></div></section>`;
  const pintar=()=>{
   const idMateria=$('#sel-materia').value;
   const deLaMateria=matriculas.filter(m=>m.id_materia===idMateria);
   $('#estudiantes-notas').innerHTML=deLaMateria.length?`<div class="table-wrap"><table><thead><tr><th>Estudiante</th><th>Nota 1</th><th>Nota 2</th><th>Nota 3</th><th></th></tr></thead><tbody>${deLaMateria.map(m=>`<tr><td>${esc(m.cedula)}</td><td><input type="number" step="0.1" min="0" max="5" id="n1-${esc(m.id_matricula)}"></td><td><input type="number" step="0.1" min="0" max="5" id="n2-${esc(m.id_matricula)}"></td><td><input type="number" step="0.1" min="0" max="5" id="n3-${esc(m.id_matricula)}"></td><td><button class="guardar-nota" data-id="${esc(m.id_matricula)}">Guardar</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No hay estudiantes matriculados en esta materia.</div>';
   $('#estudiantes-notas').querySelectorAll('.guardar-nota').forEach(b=>b.onclick=async()=>{
    const id=b.dataset.id,n1=parseFloat($(`#n1-${id}`).value),n2=parseFloat($(`#n2-${id}`).value),n3=parseFloat($(`#n3-${id}`).value);
    if([n1,n2,n3].some(n=>Number.isNaN(n)||n<0||n>5)){notice('Las tres notas deben estar entre 0.0 y 5.0');return;}
    try{
     const res=await apiAuth('/notas/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id_matricula:id,nota1:n1,nota2:n2,nota3:n3})});
     notice(`Nota guardada: definitiva ${res.definitiva} · ${res.estado}`,true);
     b.disabled=true;b.textContent='Guardada ✓';
    }catch(error){notice(mensajeRol(error));}
   });
  };
  $('#sel-materia').onchange=pintar;pintar();
 }catch(error){$('#view').innerHTML=`<div class="empty">${esc(mensajeRol(error))}</div>`;}
}

// ====== Profesor: Reportes ======
function vistaReportes(){
 $('#refresh').hidden=false;
 $('#view').innerHTML=`<section class="panel"><div class="panel-top"><div><h2>PDF de tus estudiantes</h2><p>Escribe la cédula de un estudiante matriculado en tus materias</p></div></div><div class="fields"><div><label for="cedula-reporte">Cédula</label><input id="cedula-reporte" type="text" placeholder="1001"></div></div><div class="help"><article><h3>Reporte de notas</h3><button id="pdf-notas-prof">Descargar notas ⇩</button></article><article><h3>Recibo de matrícula</h3><button id="pdf-matricula-prof">Descargar recibo ⇩</button></article></div></section>`;
 const cedula=()=>encodeURIComponent(($('#cedula-reporte').value||'').trim());
 $('#pdf-notas-prof').onclick=()=>{const c=cedula();if(c)descargarPDF(`/pdf/notas/${c}`,`Reporte_Notas_${c}.pdf`);};
 $('#pdf-matricula-prof').onclick=()=>{const c=cedula();if(c)descargarPDF(`/pdf/matricula/${c}`,`Recibo_Matricula_${c}.pdf`);};
}

// ====== Admin: Cuentas ======
function vistaCuentas(){
 $('#refresh').hidden=true;
 $('#view').innerHTML=`<section class="panel"><div class="panel-top"><div><h2>Cuentas de usuario</h2><p>Crear cuentas y restablecer claves (solo administrador)</p></div></div><div class="help"><article><h3>Cuenta de estudiante</h3><p>Usa la cédula registrada en Estudiantes.</p><div class="fields"><div><label for="id-est-cuenta">Cédula</label><input id="id-est-cuenta" type="text" placeholder="1002"></div></div><button id="crear-est">Crear cuenta estudiante</button></article><article><h3>Cuenta de profesor</h3><p>Usa el ID registrado en Profesores.</p><div class="fields"><div><label for="id-prof-cuenta">ID del profesor</label><input id="id-prof-cuenta" type="text" placeholder="PR04"></div></div><button id="crear-prof">Crear cuenta profesor</button></article><article><h3>Restablecer clave</h3><p>Genera una clave temporal para cualquier usuario.</p><div class="fields"><div><label for="usuario-reset">Usuario</label><input id="usuario-reset" type="text" placeholder="1001"></div></div><button id="reset-clave">Restablecer clave</button></article></div></section>`;
 const apiCuenta=(url,campo,valor,nombre)=>{
  apiAuth(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({[campo]:valor})})
   .then(res=>notice(`Cuenta ${res.usuario}: clave temporal ${res.clave_temporal} — entrégala al ${nombre} y pídele cambiarla al primer ingreso.`,true))
   .catch(error=>notice(mensajeRol(error)));
 };
 $('#crear-est').onclick=()=>{const v=($('#id-est-cuenta').value||'').trim();if(v)apiCuenta('/auth/crear-cuenta-estudiante','id_estudiante',v,'estudiante');};
 $('#crear-prof').onclick=()=>{const v=($('#id-prof-cuenta').value||'').trim();if(v)apiCuenta('/auth/crear-cuenta-profesor','id_profesor',v,'profesor');};
 $('#reset-clave').onclick=()=>{
  const objetivo=($('#usuario-reset').value||'').trim();if(!objetivo)return;
  apiAuth('/auth/restablecer-clave',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({usuario_admin:SESION.usuario,clave_admin:SESION.clave,usuario_objetivo:objetivo})})
   .then(res=>notice(`Clave temporal de ${res.usuario}: ${res.clave_temporal}`,true))
   .catch(error=>notice(mensajeRol(error)));
 };
}

// ====== Refresh y navegación ======
$('#refresh').onclick=async()=>{if(loading)return;loading=true;$('#refresh').disabled=true;notice('');await refreshCatalogos();loading=false;$('#refresh').disabled=false;render();};
window.addEventListener('hashchange',()=>{const hash=location.hash.slice(1);const valido=navItems().some(([k])=>k===hash);current=valido?hash:'resumen';if(SESION)render();});
current='resumen';
