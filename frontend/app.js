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
    ['matricular','Matricular','✓'], ['misnotas','Mis notas','✎'], ['mistareas','Mis tareas','❑'], ['docs','Mis documentos','⇩'],
  ],
  Profesor: [
    ['ingresarnotas','Ingresar notas','✎'], ['tareas','Tareas','❑'], ['reportes','Reportes','⇩'],
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

// ====== Transición direccional entre secciones (respeta prefers-reduced-motion) ======
const sinAnimacion=()=>!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
let animPendiente=null;
function indiceSeccion(key){return navItems().findIndex(([k])=>k===key);}
function animarSeccion(destino,origen){
  const vista=$('#view');
  clearTimeout(animPendiente);
  if(sinAnimacion()){render();return;}
  // Dirección según el orden de la sección en el menú del rol:
  // a una sección posterior sale hacia la izquierda y entra desde la derecha; a una anterior, al revés
  const adelante=indiceSeccion(destino)>=indiceSeccion(origen);
  const salida=adelante?'seccion-salida-izq':'seccion-salida-der';
  const entrada=adelante?'seccion-entrada-der':'seccion-entrada-izq';
  vista.classList.remove('seccion-salida-izq','seccion-salida-der','seccion-entrada-der','seccion-entrada-izq');
  vista.classList.add(salida);
  animPendiente=setTimeout(()=>{
    render();
    vista.classList.remove('seccion-salida-izq','seccion-salida-der');
    vista.classList.add(entrada);
  },220);
}
$('#view').addEventListener('animationend',e=>{
  if(e.animationName==='entrada-der'||e.animationName==='entrada-izq')$('#view').classList.remove('seccion-entrada-der','seccion-entrada-izq');
  if(e.animationName==='llegada-datos')e.target.classList.remove('llegada-datos');
});
// Aparición suave cuando los datos llegan de la API: sube 8 px y se desvanece en 250 ms
function animaLlegada(el){
  if(!el||sinAnimacion())return;
  el.classList.remove('llegada-datos');
  void el.offsetWidth;
  el.classList.add('llegada-datos');
}

// ====== Franja de indicadores y estados vacíos ======
function franja(items){
  return `<section class="franja" aria-label="Resumen de la sección">${items.map(i=>`<div class="indicador${i.clase?' '+i.clase:''}"><span>${esc(i.etiqueta)}</span><strong${i.id?` id="${i.id}"`:''}>${esc(i.valor)}</strong></div>`).join('')}</section>`;
}
function vacio(icono,titulo,frase){
  return `<div class="empty"><span class="empty-icono" aria-hidden="true">${icono}</span><h3>${esc(titulo)}</h3><p>${esc(frase)}</p></div>`;
}
// Catálogos relacionados que se muestran junto al actual (admin)
const REL_ADMIN={facultades:['programas','materias'],programas:['facultades','materias'],materias:['profesores','estudiantes'],profesores:['materias','estudiantes'],estudiantes:['programas','profesores'],periodos:['materias','estudiantes']};
function franjaAdmin(key){
  const m=modules[key];
  if(!m) return '';
  const items=[{etiqueta:m.title,valor:(data[key]||[]).length}];
  for(const k of REL_ADMIN[key]||[]) items.push({etiqueta:modules[k].title,valor:(data[k]||[]).length});
  return franja(items);
}
function pintaFranja(key){const zona=$('#franja-zone');if(zona&&current===key)zona.innerHTML=franjaAdmin(key);}
async function asegurarCatalogos(){
  if(CATALOGOS.some(k=>!data[k])) await refreshCatalogos();
}

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

// ====== Login (página independiente) ======
$('#toggle-clave').addEventListener('click',()=>{
  const input=$('#login-clave'), ver=input.type==='password';
  input.type=ver?'text':'password';
  const btn=$('#toggle-clave');
  btn.textContent=ver?'🙈':'👁';
  btn.setAttribute('aria-label',ver?'Ocultar clave':'Ver clave');
  btn.setAttribute('aria-pressed',String(ver));
  input.focus();
});
$('#login-form').addEventListener('submit', async e=>{
  e.preventDefault();$('#login-error').textContent='';
  const usuario=$('#login-usuario').value.trim(), clave=$('#login-clave').value;
  const btn=$('#login-btn');
  btn.disabled=true;btn.dataset.loading='1';btn.textContent='Iniciando sesión…';
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
  }finally{
    btn.disabled=false;delete btn.dataset.loading;btn.textContent='Iniciar sesión';
    $('#login-clave').value='';$('#toggle-clave').textContent='👁';$('#login-clave').type='password';
  }
});
// Nombre para el saludo: el de la API (catálogos) o el usuario si no hay nombre
function nombreDe(sesion){
  if(sesion.rol==='Estudiante'){
    const e=(data.estudiantes||[]).find(x=>x.id_estudiante===sesion.id_persona);
    if(e) return [e.nombre,e.apellidos].filter(Boolean).join(' ');
  }
  if(sesion.rol==='Profesor'){
    const p=(data.profesores||[]).find(x=>x.id_profesor===sesion.id_persona);
    if(p) return [p.nombre,p.apellidos].filter(Boolean).join(' ');
  }
  return sesion.usuario;
}
function saludo(){
  if(!SESION) return;
  $('#session-greeting').innerHTML=`Hola, <b>${esc(nombreDe(SESION))}</b> · ${esc(SESION.rol)}`;
}
async function completarNombre(){
  try{
    if(SESION.rol==='Estudiante') data.estudiantes=await api('/estudiantes/');
    else if(SESION.rol==='Profesor') data.profesores=await api('/profesores/');
    else return;
    saludo();
    if(current==='resumen')render();
  }catch(_){}
}
// Transición suave (fade 300 ms) entre login y aplicación
function crossfade(ocultar, mostrar){
  ocultar.forEach(el=>el.classList.add('fading'));
  setTimeout(()=>{
    ocultar.forEach(el=>{el.hidden=true;el.classList.remove('fading');});
    mostrar.forEach(el=>{el.hidden=false;el.classList.add('fading');});
    requestAnimationFrame(()=>requestAnimationFrame(()=>mostrar.forEach(el=>el.classList.remove('fading'))));
  },300);
}
function iniciarSesion(sesion){
  SESION=sesion;
  saludo();completarNombre();
  crossfade([$('#login-screen')],[$('#app-aside'),$('#app-workspace')]);
  $('#login-usuario').value='';$('#login-clave').value='';$('#login-error').textContent='';
  current='resumen';
  render();
}
$('#logout').onclick=()=>{
  SESION=null;data={};errors={};
  cierraLogoMenu();
  crossfade([$('#app-workspace'),$('#app-aside')],[$('#login-screen')]);
  $('#session-greeting').textContent='';
  $('#login-error').textContent='';location.hash='';
};

// ====== Logo de la barra lateral: clic en logo/texto = volver al inicio del rol; la flecha pequeña abre el menú rápido ======
(function(){
  const zona=$('.brand-zona'), btnViejo=$('#logo-menu-btn');
  if(!zona||!btnViejo) return;
  zona.innerHTML=`<button id="logo-inicio" class="brand" type="button" title="Volver al inicio">${btnViejo.innerHTML}</button><button id="logo-menu-btn" class="logo-flecha" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="logo-menu" aria-label="Abrir menú rápido del logo">▾</button><div id="logo-menu" role="menu" aria-label="Accesos rápidos" hidden></div>`;
})();
const logoBtn=$('#logo-menu-btn'), logoMenu=$('#logo-menu');
function cierraLogoMenu(){logoMenu.hidden=true;logoBtn.setAttribute('aria-expanded','false');}
$('#logo-inicio').addEventListener('click',()=>{cierraLogoMenu();go('resumen');});
logoBtn.addEventListener('click',()=>{
  if(!logoMenu.hidden){cierraLogoMenu();return;}
  logoMenu.innerHTML=navItems().map(([k,t,i])=>`<button type="button" role="menuitem" data-page="${k}"><span aria-hidden="true">${i}</span>${esc(t)}</button>`).join('');
  logoMenu.querySelectorAll('button').forEach(b=>b.onclick=()=>{cierraLogoMenu();go(b.dataset.page);});
  logoMenu.hidden=false;logoBtn.setAttribute('aria-expanded','true');
});
document.addEventListener('click',e=>{if(!logoMenu.hidden&&!e.target.closest('#logo-menu-btn')&&!e.target.closest('#logo-menu'))cierraLogoMenu();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!logoMenu.hidden)cierraLogoMenu();});
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
function go(key){
  if(!SESION) return;
  if(key===current){render();return;}
  const origen=current;
  current=key;location.hash=key;
  animarSeccion(key,origen);
}
function navItems(){return MENUS[SESION?.rol]||[['resumen','Resumen','◈']];}
function render(){
 if(!SESION) return;
 cierraLogoMenu();
 const titulo={resumen:'Resumen académico',matricular:'Matricular',misnotas:'Mis notas',mistareas:'Mis tareas',docs:'Mis documentos',ingresarnotas:'Ingresar notas',tareas:'Tareas',reportes:'Reportes',cuentas:'Cuentas'};
 $('#breadcrumb').textContent=titulo[current]||modules[current]?.title||'Resumen';
 $('#title').textContent=titulo[current]||modules[current]?.title||'Resumen académico';
  $('#subtitle').textContent={resumen:'Todo según tu rol: '+SESION.rol,matricular:'Arma tu carrito y confirma: total entre 6 y 19 créditos.',misnotas:'Tus calificaciones registradas.',mistareas:'Las tareas de tus materias: entrega a tiempo.',docs:'Descarga tus reportes en PDF.',ingresarnotas:'Califica a los estudiantes de tus materias.',tareas:'Crea tareas en tus materias y revisa quién entregó.',reportes:'Reporte de notas de tus estudiantes.',cuentas:'Crea cuentas y restablece claves.',periodos:'Ventanas de matrícula.'}[current]||modules[current]?.description||'';
 $('#nav').innerHTML=navItems().map(([k,t,i])=>`<button data-page="${k}" class="${k===current?'active':''}" ${k===current?'aria-current="page"':''}><span aria-hidden="true">${i}</span>${t}</button>`).join('');
 $('#nav').querySelectorAll('button').forEach(b=>b.onclick=()=>go(b.dataset.page));
 const vistas={resumen:vistaResumen,matricular:vistaMatricular,misnotas:vistaMisNotas,mistareas:vistaMisTareas,docs:vistaDocs,ingresarnotas:vistaIngresarNotas,tareas:vistaTareas,reportes:vistaReportes,cuentas:vistaCuentas};
 if(vistas[current]){vistas[current]();return;}
 vistaCatalogo();
}
function vistaResumen(){
 $('#refresh').hidden=false;
 if(SESION.rol==='Administrador'){
  // ====== Panel del admin: totales reales + matrículas del periodo activo ======
  // Periodo activo: el que cubre la fecha de hoy; si ninguno está vigente, el más reciente por fecha_fin
  const periodoActivo=()=>{
   const ps=data.periodos||[];
   if(!ps.length)return null;
   const hoy=new Date();
   const vigente=ps.find(p=>{const a=p.fecha_inicio?new Date(p.fecha_inicio+'T00:00:00'):null,b=p.fecha_fin?new Date(p.fecha_fin+'T23:59:59'):null;return a&&b&&hoy>=a&&hoy<=b;});
   return vigente||[...ps].sort((x,y)=>String(y.fecha_fin||'').localeCompare(String(x.fecha_fin||'')))[0];
  };
  // Agrupa GET /matriculas/ por id_materia en el cliente: solo cifras reales de la API
  const calcularPanel=matriculas=>{
   const p=periodoActivo();
   const delPeriodo=matriculas&&p?matriculas.filter(m=>m.periodo===p.periodo):null;
   const conteo={};
   if(delPeriodo)delPeriodo.forEach(m=>{conteo[m.id_materia]=(conteo[m.id_materia]||0)+1;});
   const base=(data.materias||[]).length
    ?data.materias.map(m=>({id:m.id_materia,nombre:m.nombre_curso,n:conteo[m.id_materia]||0}))
    :(delPeriodo?Object.keys(conteo).map(id=>({id,nombre:id,n:conteo[id]})):null);
   return {periodo:p?p.periodo:null,total:delPeriodo?delPeriodo.length:null,porMateria:base?[...base].sort((a,b)=>b.n-a.n||String(a.id).localeCompare(String(b.id))):null};
  };
  const graficoBarras=r=>{
   if(!r.porMateria)return vacio('⚠','Matrículas no disponibles','No se pudieron consultar las matrículas del periodo. Pulsa Actualizar para reintentar.');
   if(!r.porMateria.length)return vacio('▤','Sin matrículas en este periodo','Cuando los estudiantes se matriculen, aquí verás cuántos hay por materia.');
   const max=Math.max(1,...r.porMateria.map(x=>x.n));
   return `<div class="barras">${r.porMateria.map(x=>`<div class="barra-fila"><span class="barra-nombre">${esc(x.id)} · ${esc(x.nombre)}</span><span class="barra-pista"><span class="barra" data-ancho="${(x.n/max*100).toFixed(1)}" style="width:0%" role="img" aria-label="${esc(x.id)}: ${x.n} matrículas"></span></span><span class="barra-valor">${x.n}</span></div>`).join('')}</div>`;
  };
  const pinta=(r,tareas)=>{
   const subPeriodo=r&&r.periodo?`Periodo ${esc(r.periodo)}`:(r?'Sin periodo activo':'Cargando…');
   const totalEntregas=(tareas||[]).reduce((s,t)=>s+(t.entregas_recibidas||0),0);
   $('#view').innerHTML=`<section class="stats" aria-label="Totales">${Object.entries(modules).map(([k,m])=>`<button class="stat" data-page="${k}"><span>${m.icon} &nbsp; ${m.title}</span><strong>${loading?'…':data[k]?.length??'—'}</strong><span>Consultar registros →</span></button>`).join('')}<div class="stat"><span>▣ &nbsp; Matrículas</span><strong>${r?esc(r.total==null?'No disponible':String(r.total)):'…'}</strong><span>${esc(subPeriodo)}</span></div><div class="stat"><span>❑ &nbsp; Tareas</span><strong>${tareas?esc(String(tareas.length)):'…'}</strong><span>${tareas?`${totalEntregas} entregas recibidas`:'Consultando tareas…'}</span></div></section><section class="panel"><div class="panel-top"><div><h2>Matrículas por materia</h2><p>${r&&r.periodo?`Periodo ${esc(r.periodo)} · agrupadas por materia con datos de la API`:'Consultando matrículas…'}</p></div></div>${r?graficoBarras(r):vacio('⏳','Cargando matrículas','Consultamos las matrículas del periodo activo.')}</section><section class="panel"><div class="panel-top"><div><h2>Oferta académica</h2><p>Materias registradas y docentes asignados</p></div><button class="secondary" id="courses">Ver todas →</button></div>${data.materias?.length?table('materias',data.materias.slice(0,5)):vacio('▥','Aún no hay materias registradas','Registra la primera materia para armar la oferta académica.')}</section>`;
   $('#view').querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>go(b.dataset.page));
   $('#courses').onclick=()=>go('materias');
   requestAnimationFrame(()=>requestAnimationFrame(()=>{$('#view').querySelectorAll('.barra').forEach(b=>{b.style.width=`${b.dataset.ancho}%`;});}));
  };
  pinta();
  (async()=>{
   try{await asegurarCatalogos();}catch(_){}
   let matriculas=null,tareas=null;
   const resultados=await Promise.allSettled([apiAuth('/matriculas/'),apiAuth('/tareas/')]);
   matriculas=resultados[0].status==='fulfilled'?resultados[0].value:null;
   tareas=resultados[1].status==='fulfilled'?resultados[1].value:null;
   if(current==='resumen'&&SESION&&SESION.rol==='Administrador'){pinta(calcularPanel(matriculas),tareas);animaLlegada($('#view'));}
  })();
 } else if(SESION.rol==='Estudiante'){
  // Tarjeta "Mis tareas": cantidad de pendientes y fecha límite más cercana (se consulta aparte)
  $('#view').innerHTML=`<section class="stats stats-estudiante" id="stats-tareas" aria-label="Mis tareas"><div class="stat"><span>❑ &nbsp; Mis tareas</span><strong>…</strong><span>Consultando tus tareas…</span></div></section><section class="panel"><div class="panel-top"><div><h2>Bienvenido, ${esc(nombreDe(SESION))}</h2><p>Cédula ${esc(SESION.id_persona)} · rol ${esc(SESION.rol)}</p></div></div><div class="help"><article><h3>Matricular</h3><p>Arma tu carrito con las materias de tu facultad. Total entre 6 y 19 créditos.</p><button data-page="matricular">Ir a matricular →</button></article><article><h3>Mis tareas</h3><p>Revisa tus pendientes y sube tus entregas antes de la fecha límite.</p><button data-page="mistareas">Ver tareas →</button></article><article><h3>Mis notas</h3><p>Consulta tus calificaciones por materia y por actividad.</p><button data-page="misnotas">Ver notas →</button></article><article><h3>Mis documentos</h3><p>Recibo de matrícula y reporte de notas en PDF.</p><button data-page="docs">Descargar →</button></article></div></section>`;
  $('#view').querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>go(b.dataset.page));
  apiAuth('/tareas/').then(tareas=>{
   if(current!=='resumen'||!SESION||SESION.rol!=='Estudiante')return;
   const zona=$('#stats-tareas');if(!zona)return;
   zona.innerHTML=tarjetasTareasEst(tareas);
   zona.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>go(b.dataset.page));
   animaLlegada(zona);
  }).catch(()=>{
   const zona=$('#stats-tareas');
   if(zona)zona.innerHTML=`<div class="stat"><span>❑ &nbsp; Mis tareas</span><strong>—</strong><span>No se pudieron consultar tus tareas</span></div>`;
  });
 } else {
  // ====== Panel del profesor: 4 tarjetas de estadísticas de tareas (solo lectura) ======
  $('#view').innerHTML=`<section class="stats" id="stats-profe" aria-label="Estadísticas de tus tareas"><div class="stat"><span>⌕ &nbsp; Tareas por revisar</span><strong>…</strong><span>Con entregas sin calificar</span></div><div class="stat"><span>❑ &nbsp; Entregas recibidas</span><strong>…</strong><span>En todas tus tareas</span></div><div class="stat"><span>✎ &nbsp; Pendientes de calificar</span><strong>…</strong><span>Entregas sin nota</span></div><div class="stat"><span>⏱ &nbsp; Próxima fecha límite</span><strong class="stat-fecha">…</strong><span>La tarea que vence primero</span></div></section><section class="panel"><div class="panel-top"><div><h2>Bienvenido, ${esc(nombreDe(SESION))}</h2><p>Profesor · ID ${esc(SESION.id_persona)}</p></div></div><div class="help"><article><h3>Ingresar notas</h3><p>Elige una de tus materias y califica a sus estudiantes.</p><button data-page="ingresarnotas">Ingresar notas →</button></article><article><h3>Reportes</h3><p>PDF de notas de tus estudiantes.</p><button data-page="reportes">Ver reportes →</button></article></div></section>`;
  $('#view').querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>go(b.dataset.page));
  (async()=>{
   const zona=$('#stats-profe');
   if(!zona)return;
   const pon=(i,valor,texto)=>{const tarjeta=zona.children[i];if(!tarjeta)return;tarjeta.querySelector('strong').textContent=valor;if(texto!=null)tarjeta.querySelector('span:last-child').textContent=texto;};
   let tareas=null;
   try{tareas=await apiAuth('/tareas/');}catch(_){}
   if(current!=='resumen'||!SESION||SESION.rol!=='Profesor')return;
   if(!zona.isConnected)return;
   if(!tareas){
    zona.querySelectorAll('.stat strong').forEach(s=>s.textContent='No disponible');
    pon(3,'No disponible','No se pudieron consultar tus tareas');
    animaLlegada(zona);return;
   }
   if(!tareas.length){
    pon(0,'0','Aún no has creado tareas');pon(1,'0 de 0','Aún no has creado tareas');
    pon(2,'0','Aún no has creado tareas');pon(3,'—','Sin tareas por vencer');
    animaLlegada(zona);return;
   }
   // Detalle de entregas por tarea: cada consulta es independiente (un fallo no bloquea las demás)
   const resultados=await Promise.allSettled(tareas.map(t=>apiAuth(`/tareas/${t.id_tarea}/entregas`)));
   if(current!=='resumen'||!SESION||SESION.rol!=='Profesor')return;
   if(!zona.isConnected)return;
   const sinNotaTotal=resultados.reduce((s,r)=>r.status==='fulfilled'?s+(r.value.entregas||[]).filter(e=>e.calificacion==null).length:s,0);
   const conSinNota=resultados.filter(r=>r.status==='fulfilled'&&(r.value.entregas||[]).some(e=>e.calificacion==null)).length;
   const falloEntregas=resultados.some(r=>r.status!=='fulfilled');
   const recibidas=tareas.reduce((s,t)=>s+(t.entregas_recibidas||0),0);
   const matriculados=tareas.reduce((s,t)=>s+(t.matriculados||0),0);
   // Próxima fecha límite: la vigente más cercana entre todas las tareas del profesor
   const futura=tareas.map(t=>({t,d:new Date(t.fecha_limite)})).filter(x=>x.t.fecha_limite&&plazoVigente(x.t.fecha_limite)).sort((a,b)=>a.d-b.d)[0];
   const fechaCorta=d=>d.toLocaleDateString('es-CO',{day:'2-digit',month:'short'})+' · '+d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
   if(falloEntregas){pon(0,'No disponible',null);pon(2,'No disponible',null);}
   else{pon(0,String(conSinNota),null);pon(2,String(sinNotaTotal),null);}
   pon(1,`${recibidas} de ${matriculados}`,null);
   if(futura)pon(3,fechaCorta(futura.d),futura.t.titulo);
   else pon(3,'—','Sin tareas por vencer');
   animaLlegada(zona);
  })();
 }
}

// ====== Catálogo (solo admin) ======
async function vistaCatalogo(){
 const key=current, m=modules[key];
 if(!m){$('#view').innerHTML=vacio('◈','Pantalla no disponible','Vuelve al resumen y elige una sección del menú.');return;}
 $('#refresh').hidden=false;
 $('#view').innerHTML=`<div id="franja-zone"></div><section class="panel"><div class="panel-top"><div><h2>Directorio de ${m.title.toLowerCase()}</h2><p>Información registrada en el sistema académico</p></div><button id="new">+ Registrar ${m.singular}</button></div><div class="toolbar"><input id="search" type="search" aria-label="Buscar registros" placeholder="Buscar…"><span class="count" id="count"></span></div><div id="rows"></div></section>`;
 $('#new').onclick=openForm;$('#search').oninput=e=>renderRows(e.target.value);
 renderRows();
 await asegurarCatalogos();
 if(current!==key) return;
 pintaFranja(key);
 renderRows();
 animaLlegada($('#rows'));
}
function renderRows(query=''){
 const key=current, area=$('#rows');if(!area)return;
 if(errors[key]){area.innerHTML=vacio('⚠','No se pudieron cargar los datos','Pulsa Actualizar para reintentar la conexión con la API.');return;}
 if(!data[key]){area.innerHTML=vacio('⏳','Cargando registros','Un momento, consultamos los datos del sistema académico.');return;}
 const all=data[key], q=query.toLocaleLowerCase('es'), rows=all.filter(r=>modules[key].fields.some(f=>String(display(r,f)??'').toLocaleLowerCase('es').includes(q)));
 $('#count').textContent=`${rows.length} de ${all.length} registros`;
 area.innerHTML=rows.length?table(key,rows):(q?vacio('⌕','Sin coincidencias',`Ningún registro coincide con "${query}". Prueba con otro término.`):vacio('▦',`Todavía no hay ${modules[key].title.toLowerCase()}`,`Crea el primer ${modules[key].singular} con el botón "+ Registrar ${modules[key].singular}" para empezar.`));
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
 try{await apiAuth(`/${key}/`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});$('#dialog').close();await refreshCatalogos();pintaFranja(key);renderRows();if(!errors[key])notice('Registro guardado correctamente.',true);}
 catch(error){$('#form-error').textContent=mensajeRol(error);}
 finally{saving=false;$('#save').disabled=false;$('#save').textContent='Guardar registro';$('#cancel').disabled=false;$('#close').disabled=false;}
};
$('#dialog').addEventListener('cancel',e=>{if(saving)e.preventDefault();});$('#close').onclick=closeForm;$('#cancel').onclick=closeForm;

// ====== Estudiante: Matricular (carrito) ======
let carrito=new Set();
async function vistaMatricular(){
 $('#refresh').hidden=false;
 if(SESION.rol!=='Estudiante'){$('#view').innerHTML=vacio('🔒','No tienes permiso para esta acción','Inicia sesión con la cuenta de estudiante adecuada.');return;}
 $('#view').innerHTML=vacio('⏳','Cargando materias','Un momento, consultamos las materias de tu facultad.');
 try{
  const materias=await api(`/estudiantes/${encodeURIComponent(SESION.id_persona)}/materias-disponibles`);
  const opciones=materias.map(m=>`<label class="carrito-item"><input type="checkbox" value="${esc(m.id_materia)}" data-creditos="${m.creditos}"><span class="carrito-info"><span class="carrito-nombre">${esc(m.nombre_curso)}</span><span class="carrito-meta"><span class="chip">${esc(m.id_materia)}</span><span class="chip chip-creditos">${m.creditos} créditos</span><span class="chip">${m.cupos} cupos</span><span class="chip">${esc(m.horario||'Sin horario')}</span></span></span></label>`).join('');
  $('#view').innerHTML=`${franja([{etiqueta:'Materias disponibles',valor:materias.length},{etiqueta:'Créditos seleccionados',valor:'0 créditos',clase:'malo',id:'ind-creditos'}])}<section class="panel"><div class="panel-top"><div><h2>Materias de tu facultad</h2><p>Marca las que quieres matricular en el periodo 2026-2</p></div></div>${materias.length?`<div class="carrito">${opciones}</div>`:vacio('▥','Tu facultad no tiene materias disponibles','Cuando tu programa publique materias, aparecerán aquí para armar tu matrícula.')}<div class="panel-top"><div><h2 id="total-creditos">Total: 0 créditos</h2><p class="muted">Debe quedar entre 6 y 19</p></div><button id="confirmar-carrito" disabled>Matricular selección</button></div></section>`;
  const checkboxes=[...$('#view').querySelectorAll('.carrito-item input')];
  const total=()=>checkboxes.filter(c=>c.checked).reduce((s,c)=>s+Number(c.dataset.creditos),0);
  const pintaTotal=()=>{
   const t=total(), enRango=t>=6&&t<=19;
   const el=$('#total-creditos');el.textContent=`Total: ${t} créditos`;el.style.color=enRango?'#2E8B57':'#b02a37';
   const ind=$('#ind-creditos');if(ind){ind.textContent=`${t} créditos`;const caja=ind.closest('.indicador');caja.classList.toggle('ok',enRango);caja.classList.toggle('malo',!enRango);}
   $('#confirmar-carrito').disabled=!enRango;
  };
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
  animaLlegada($('#view'));
 }catch(error){$('#view').innerHTML=vacio('⚠','No se pudieron cargar las materias',mensajeRol(error));}
}

// ====== Estudiante: Mis notas ======
async function vistaMisNotas(){
 $('#refresh').hidden=false;
 $('#view').innerHTML=vacio('⏳','Cargando notas','Un momento, consultamos tus calificaciones.');
 try{
  const notas=await apiAuth('/notas/');
  if(!notas.length){$('#view').innerHTML=vacio('✎','Aún no tienes notas registradas','Cuando tus profesores registren calificaciones, las verás aquí.');animaLlegada($('#view'));return;}
  const conDefinitiva=notas.filter(n=>n.definitiva!=null);
  const promedio=conDefinitiva.length?(conDefinitiva.reduce((s,n)=>s+Number(n.definitiva),0)/conDefinitiva.length).toFixed(2):'—';
  const filas=notas.map(n=>`<tr><td><span class="id">${esc(n.id_nota)}</span></td><td>${esc(n.id_materia)}</td><td>${n.nota1??'—'}</td><td>${n.nota2??'—'}</td><td>${n.nota3??'—'}</td><td><b>${n.definitiva??'—'}</b></td><td>${esc(n.estado||'Sin notas')}</td></tr>`).join('');
  // Actividades por materia: la API repite la lista en cada nota de la misma
  // materia (una por matrícula), así que se muestra una sola vez por materia.
  const porMateria={};
  notas.forEach(n=>{if(Array.isArray(n.actividades)&&n.actividades.length&&!porMateria[n.id_materia])porMateria[n.id_materia]=n.actividades;});
  const totalActividades=Object.values(porMateria).reduce((s,lista)=>s+lista.length,0);
  const seccionActividades=totalActividades?`<section class="panel"><div class="panel-top"><div><h2>Calificaciones por actividad</h2><p>Talleres, quizzes, exámenes y trabajos que ya calificaron tus profesores</p></div></div><div class="lista-actividades">${Object.entries(porMateria).map(([materia,actividades])=>actividades.map(a=>`<article class="actividad-item"><div><strong>${esc(a.titulo)}</strong><span class="tarea-meta"><span class="chip">${esc(materia)}</span>${chipTipo(a.tipo)}<span class="chip">Calificada: ${esc(formatFecha(a.subida_en))}</span></span></div><span class="chip chip-calif">Nota: ${Number(a.calificacion).toFixed(1)}</span></article>`).join('')).join('')}</div></section>`:'';
  $('#view').innerHTML=`${franja([{etiqueta:'Materias con nota',valor:notas.length},{etiqueta:'Actividades calificadas',valor:totalActividades},{etiqueta:'Promedio de definitivas',valor:promedio}])}<section class="panel"><div class="table-wrap"><table><thead><tr><th>ID</th><th>Materia</th><th>N1</th><th>N2</th><th>N3</th><th>Definitiva</th><th>Estado</th></tr></thead><tbody>${filas}</tbody></table></div></section>${seccionActividades}`;
  animaLlegada($('#view'));
 }catch(error){$('#view').innerHTML=vacio('⚠','No se pudieron cargar tus notas',mensajeRol(error));}
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
 if(SESION.rol!=='Profesor'){$('#view').innerHTML=vacio('🔒','No tienes permiso para esta acción','Inicia sesión con la cuenta de profesor adecuada.');return;}
 $('#view').innerHTML=vacio('⏳','Cargando materias','Un momento, consultamos tus materias asignadas.');
 try{
  await refreshCatalogos();
  const mias=(data.materias||[]).filter(m=>m.id_profesor===SESION.id_persona);
  if(!mias.length){$('#view').innerHTML=vacio('♧','No tienes materias asignadas','Cuando te asignen materias podrás registrar notas aquí.');return;}
  const matriculas=await apiAuth('/matriculas/');
  const idsMias=new Set(mias.map(m=>m.id_materia));
  const estudiantesTotal=matriculas.filter(m=>idsMias.has(m.id_materia)).length;
  const opciones=mias.map(m=>`<option value="${esc(m.id_materia)}">${esc(m.id_materia)} · ${esc(m.nombre_curso)}</option>`).join('');
  $('#view').innerHTML=`${franja([{etiqueta:'Materias asignadas',valor:mias.length},{etiqueta:'Estudiantes matriculados',valor:estudiantesTotal}])}<section class="panel"><div class="panel-top"><div><h2>Elige una de tus materias</h2><p>Solo puedes calificar las tuyas</p></div></div><div class="fields"><div><label for="sel-materia">Materia</label><select id="sel-materia">${opciones}</select></div></div><div id="estudiantes-notas"></div></section>`;
  animaLlegada($('#view'));
  const pintar=()=>{
   const idMateria=$('#sel-materia').value;
   const deLaMateria=matriculas.filter(m=>m.id_materia===idMateria);
   $('#estudiantes-notas').innerHTML=deLaMateria.length?`<div class="table-wrap"><table><thead><tr><th>Estudiante</th><th>Nota 1</th><th>Nota 2</th><th>Nota 3</th><th></th></tr></thead><tbody>${deLaMateria.map(m=>`<tr><td>${esc(m.cedula)}</td><td><input type="number" step="0.1" min="0" max="5" id="n1-${esc(m.id_matricula)}"></td><td><input type="number" step="0.1" min="0" max="5" id="n2-${esc(m.id_matricula)}"></td><td><input type="number" step="0.1" min="0" max="5" id="n3-${esc(m.id_matricula)}"></td><td><button class="guardar-nota" data-id="${esc(m.id_matricula)}">Guardar</button></td></tr>`).join('')}</tbody></table></div>`:vacio('♙','No hay estudiantes matriculados en esta materia','Cuando un estudiante la matricule, aparecerá aquí para calificarlo.');
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
 }catch(error){$('#view').innerHTML=vacio('⚠','No se pudieron cargar tus materias',mensajeRol(error));}
}

// ====== Profesor: Reportes ======
function vistaReportes(){
 $('#refresh').hidden=false;
 $('#view').innerHTML=`<section class="panel"><div class="panel-top"><div><h2>Reporte de notas de tus estudiantes</h2><p>Escribe la cédula de un estudiante matriculado en tus materias</p></div></div><div class="fields"><div><label for="cedula-reporte">Cédula</label><input id="cedula-reporte" type="text" placeholder="1001"></div></div><div class="ayuda-reportes"><article><h3>Reporte de notas</h3><p>Boletín con las calificaciones del estudiante en tus materias.</p><button id="pdf-notas-prof">Descargar notas ⇩</button></article></div></section>`;
 const cedula=()=>encodeURIComponent(($('#cedula-reporte').value||'').trim());
 $('#pdf-notas-prof').onclick=()=>{const c=cedula();if(c)descargarPDF(`/pdf/notas/${c}`,`Reporte_Notas_${c}.pdf`);};
}

// ====== Tareas: helpers compartidos ======
const ARCHIVO_MAX = 20 * 1024 * 1024; // 20 MB
const EXT_ARCHIVO = ['pdf', 'mp4', 'webm'];
function validaArchivo(archivo){
  // Validación en el navegador ANTES de enviar; la API vuelve a validar en el servidor
  if(!archivo) return 'Elige un archivo.';
  const ext = (archivo.name.split('.').pop() || '').toLowerCase();
  if(!EXT_ARCHIVO.includes(ext)) return `Tipo no permitido: solo PDF, MP4 o WebM (recibido .${ext || 'sin extensión'}).`;
  if(archivo.size > ARCHIVO_MAX) return `El archivo supera el máximo de 20 MB (${(archivo.size / 1048576).toFixed(1)} MB).`;
  return '';
}
function formatFecha(valor){
  if(!valor) return '—';
  const d = new Date(valor);
  return isNaN(d.getTime()) ? String(valor) : d.toLocaleString('es-CO', {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'});
}
const plazoVigente = fechaLimite => !!fechaLimite && new Date(fechaLimite) >= new Date();

// ====== Tipos de actividad (V5) y calificaciones ======
// 'examen' y 'quiz' se califican directamente: el archivo de la entrega es opcional
const TIPOS_TAREA = [['taller','Taller'],['quiz','Quiz'],['examen','Examen'],['trabajo','Trabajo']];
const TIPOS_SIN_ARCHIVO = ['examen','quiz'];
const nombreTipo = tipo => (TIPOS_TAREA.find(([k])=>k===tipo)||[tipo||'taller','Taller'])[1];
const chipTipo = tipo => `<span class="chip chip-tipo chip-tipo-${esc(tipo||'taller')}">${esc(nombreTipo(tipo))}</span>`;
const chipNota = calificacion => calificacion==null?'':`<span class="chip chip-calif">Nota: ${Number(calificacion).toFixed(1)}</span>`;
function validaCalificacion(valor){
  if(valor===''||valor==null) return 'Escribe la calificación (0.0 a 5.0).';
  const nota=Number(valor);
  if(Number.isNaN(nota)||nota<0||nota>5) return 'La calificación debe estar entre 0.0 y 5.0.';
  return '';
}
function tarjetasTareasEst(tareas){
  // Tarjeta "Mis tareas" del Resumen: pendientes + fecha límite más cercana, o "Estás al día"
  const pendientes=(tareas||[]).filter(t=>t.estado_entrega==='Pendiente');
  const masCercana=pendientes.map(t=>t.fecha_limite).filter(Boolean).sort()[0];
  return `<button class="stat" data-page="mistareas"><span>❑ &nbsp; Mis tareas</span><strong>${pendientes.length?`${pendientes.length} pendiente${pendientes.length===1?'':'s'}`:'Estás al día ✓'}</strong><span>${pendientes.length?`Próxima fecha límite: ${esc(formatFecha(masCercana))}`:'No tienes tareas pendientes'}</span></button>`;
}

// ====== Profesor: Tareas (crear + revisar entregas) ======
async function vistaTareas(){
 $('#refresh').hidden=false;
 if(SESION.rol!=='Profesor'){$('#view').innerHTML=vacio('🔒','No tienes permiso para esta acción','Inicia sesión con la cuenta de profesor adecuada.');return;}
 $('#view').innerHTML=vacio('⏳','Cargando tareas','Un momento, consultamos tus materias y tareas.');
 try{
  await refreshCatalogos();
  const mias=(data.materias||[]).filter(m=>m.id_profesor===SESION.id_persona);
  if(!mias.length){$('#view').innerHTML=vacio('❑','No tienes materias asignadas','Cuando te asignen materias podrás crear tareas aquí.');return;}
  const tareas=await apiAuth('/tareas/');
  const opciones=mias.map(m=>`<option value="${esc(m.id_materia)}">${esc(m.id_materia)} · ${esc(m.nombre_curso)}</option>`).join('');
  $('#view').innerHTML=`${franja([{etiqueta:'Tareas creadas',valor:tareas.length},{etiqueta:'Materias asignadas',valor:mias.length}])}<section class="panel"><div class="panel-top"><div><h2>Nueva tarea</h2><p>El tipo y los campos con * son obligatorios. Archivo de apoyo opcional: PDF, MP4 o WebM, máximo 20 MB</p></div></div><form id="form-tarea"><div class="fields"><div><label for="t-materia">Materia *</label><select id="t-materia" required>${opciones}</select></div><div><label for="t-tipo">Tipo de actividad *</label><select id="t-tipo" required>${TIPOS_TAREA.map(([valor,texto])=>`<option value="${valor}">${texto}</option>`).join('')}</select></div><div><label for="t-limite">Fecha y hora límite *</label><input id="t-limite" type="datetime-local" required></div><div class="campo-ancho"><label for="t-titulo">Título *</label><input id="t-titulo" type="text" maxlength="120" required placeholder="Taller 1 - Programación en Java"></div><div class="campo-ancho" id="t-archivo-campo"><label for="t-archivo">Archivo de apoyo (opcional)</label><input id="t-archivo" type="file" accept=".pdf,.mp4,.webm"><p class="error-archivo" id="t-archivo-error" role="alert"></p></div><div class="campo-ancho" id="t-sin-archivo-aviso" hidden><p class="ayuda-tipo">Esta actividad se califica directamente</p></div><div class="campo-ancho"><label for="t-desc">Descripción *</label><textarea id="t-desc" rows="3" required placeholder="Instrucciones, entregables y formato esperado"></textarea></div></div><p id="t-error" role="alert"></p><div class="form-actions"><button type="submit" id="t-crear">Crear tarea</button></div></form></section><section class="panel"><div class="panel-top"><div><h2>Tareas de tus materias</h2><p>Pulsa "Ver entregas" para ver quién entregó y quién no</p></div></div><div id="lista-tareas" class="lista-tareas"></div></section>`;
  animaLlegada($('#view'));
  $('#t-archivo').onchange=e=>{const msg=validaArchivo(e.target.files[0]);$('#t-archivo-error').textContent=msg;if(msg)e.target.value='';};
  // En examen y quiz la actividad se califica directamente: se oculta el archivo de apoyo
  const aplicarTipo=()=>{
   const sinArchivo=TIPOS_SIN_ARCHIVO.includes($('#t-tipo').value);
   $('#t-archivo-campo').hidden=sinArchivo;
   $('#t-sin-archivo-aviso').hidden=!sinArchivo;
   if(sinArchivo){$('#t-archivo').value='';$('#t-archivo-error').textContent='';}
  };
  $('#t-tipo').onchange=aplicarTipo;aplicarTipo();
  $('#form-tarea').onsubmit=async e=>{
   e.preventDefault();
   $('#t-error').textContent='';
   const tipo=$('#t-tipo').value,sinArchivo=TIPOS_SIN_ARCHIVO.includes(tipo);
   const archivo=sinArchivo?null:$('#t-archivo').files[0];
   if(archivo){const msgArchivo=validaArchivo(archivo);if(msgArchivo){$('#t-archivo-error').textContent=msgArchivo;return;}}
   const btn=$('#t-crear');btn.disabled=true;btn.textContent='Creando tarea…';
   try{
    const fd=new FormData();
    fd.append('id_materia',$('#t-materia').value.trim());
    fd.append('titulo',$('#t-titulo').value.trim());
    fd.append('descripcion',$('#t-desc').value.trim());
    fd.append('fecha_limite',$('#t-limite').value);
    fd.append('tipo',tipo);
    if(archivo)fd.append('archivo',archivo);
    const creada=await apiAuth('/tareas/',{method:'POST',body:fd});
    notice(`Tarea creada: ${creada.titulo} (${creada.id_tarea}).`,true);
    await vistaTareas();
   }catch(error){$('#t-error').textContent=mensajeRol(error);btn.disabled=false;btn.textContent='Crear tarea';}
  };
  const pintarLista=()=>{
   const zona=$('#lista-tareas');
   if(!tareas.length){zona.innerHTML=vacio('❑','Aún no has creado tareas','Crea la primera con el formulario "Nueva tarea" de arriba.');return;}
   zona.innerHTML=tareas.map(t=>`<article class="tarea-item" data-id="${esc(t.id_tarea)}"><div class="tarea-cab"><div class="tarea-titulo"><strong>${esc(t.titulo)}</strong><span class="tarea-meta">${chipTipo(t.tipo)}<span class="chip">${esc(t.id_materia)}</span><span class="chip">${esc(t.materia||'')}</span><span class="chip">Límite: ${esc(formatFecha(t.fecha_limite))}</span>${t.tiene_apoyo?'<span class="chip">⇩ Con archivo de apoyo</span>':''}</span></div><div class="tarea-lado"><span class="chip chip-entregas">${t.entregas_recibidas??0} de ${t.matriculados??0} entregaron</span><button class="secondary ver-entregas" data-id="${esc(t.id_tarea)}" data-tipo="${esc(t.tipo||'taller')}">Ver entregas ▾</button></div></div><div class="tarea-detail" id="detalle-${esc(t.id_tarea)}" hidden></div></article>`).join('');
   zona.querySelectorAll('.ver-entregas').forEach(b=>b.onclick=()=>verEntregas(b.dataset.id,b,b.dataset.tipo||'taller'));
  };
  pintarLista();
  animaLlegada($('#lista-tareas'));
 }catch(error){$('#view').innerHTML=vacio('⚠','No se pudieron cargar tus tareas',mensajeRol(error));}
}
async function verEntregas(idTarea, boton, tipo='taller'){
 const caja=$(`#detalle-${idTarea}`);
 if(!caja){return;}
 if(!caja.hidden){caja.hidden=true;boton.textContent='Ver entregas ▾';return;}
 boton.disabled=true;boton.textContent='Cargando entregas…';
 const directo=TIPOS_SIN_ARCHIVO.includes(tipo);
 // Pinta la lista de entregas desde la API; se reutiliza para refrescar tras guardar una calificación
 const pinta=async()=>{
  const res=await apiAuth(`/tareas/${idTarea}/entregas`);
  const entregas=res.entregas||[], sin=res.no_entregaron||[], sinCal=res.sin_calificacion||[];
  const filas=entregas.map(e=>`<tr><td><span class="id">${esc(e.cedula)}</span></td><td>${esc(e.nombre)}</td><td>${esc(formatFecha(e.subida_en))}</td><td>${esc(e.comentario||'—')}</td><td>${e.con_archivo?`<button class="secondary descargar-entrega" data-tarea="${esc(idTarea)}" data-id="${esc(e.id_entrega)}" data-cedula="${esc(e.cedula)}">Descargar ⇩</button>`:'<span class="chip chip-sin-archivo">Sin archivo · calificada directamente</span>'}</td><td class="celda-calif"><input type="number" class="input-calif" min="0" max="5" step="0.1" value="${e.calificacion??''}" placeholder="—" aria-label="Calificación de ${esc(e.cedula)}"><button class="guardar-calif" data-id="${esc(e.id_entrega)}" data-cedula="${esc(e.cedula)}">Guardar</button></td></tr>`).join('');
  const filasSin=sin.map(e=>`<li><span class="id">${esc(e.cedula)}</span> ${esc(e.nombre)}${directo?`<span class="calif-directa"><input type="number" class="input-calif" min="0" max="5" step="0.1" placeholder="0.0 – 5.0" aria-label="Calificación directa para ${esc(e.cedula)}"><button class="guardar-calif-directa" data-cedula="${esc(e.cedula)}">Calificar</button></span>`:''}</li>`).join('');
  caja.innerHTML=`<h3>Entregas recibidas (${entregas.length})${sinCal.length?` <span class="chip chip-sin-calif">${sinCal.length} sin calificación</span>`:''}</h3>${entregas.length?`<div class="table-wrap"><table><thead><tr><th>Cédula</th><th>Estudiante</th><th>Subida</th><th>Comentario</th><th>Archivo</th><th>Calificación (0.0 a 5.0)</th></tr></thead><tbody>${filas}</tbody></table></div>`:vacio('⇧','Sin entregas todavía',directo?'Los estudiantes no suben archivo en esta actividad: registra su calificación en la lista de abajo.':'Cuando los estudiantes suban su archivo, aparecerá aquí con botón de descarga.')}<h3>No han entregado (${sin.length})</h3>${sin.length?`<ul class="lista-no-entrega">${filasSin}</ul>`:vacio('✓','Todos entregaron','Los estudiantes matriculados de esta materia ya subieron su entrega.')}`;
  caja.querySelectorAll('.descargar-entrega').forEach(b=>b.onclick=()=>descargarPDF(`/tareas/${b.dataset.tarea}/entregas/${b.dataset.id}/archivo`,`Entrega_${b.dataset.cedula}_${b.dataset.id}.pdf`));
  caja.querySelectorAll('.guardar-calif').forEach(b=>b.onclick=async()=>{
   const input=b.closest('td').querySelector('.input-calif');
   const msg=validaCalificacion(input.value);
   if(msg){notice(msg);return;}
   b.disabled=true;b.textContent='Guardando…';
   try{
    const res=await apiAuth(`/tareas/${idTarea}/entregas/${b.dataset.id}/calificacion`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({calificacion:Number(input.value)})});
    notice(`Calificación guardada: ${res.calificacion} para ${b.dataset.cedula}.`,true);
    await pinta();animaLlegada(caja);
   }catch(error){notice(mensajeRol(error));b.disabled=false;b.textContent='Guardar';}
  });
  caja.querySelectorAll('.guardar-calif-directa').forEach(b=>b.onclick=async()=>{
   const input=b.closest('li').querySelector('.input-calif');
   const msg=validaCalificacion(input.value);
   if(msg){notice(msg);return;}
   b.disabled=true;b.textContent='Guardando…';
   try{
    const res=await apiAuth(`/tareas/${idTarea}/calificaciones`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cedula:b.dataset.cedula,calificacion:Number(input.value)})});
    notice(`Calificación registrada: ${res.calificacion} para ${b.dataset.cedula}.`,true);
    await pinta();animaLlegada(caja);
   }catch(error){notice(mensajeRol(error));b.disabled=false;b.textContent='Calificar';}
  });
 };
 try{await pinta();animaLlegada(caja);caja.hidden=false;boton.textContent='Ocultar entregas ▴';}
 catch(error){caja.innerHTML=vacio('⚠','No se pudieron cargar las entregas',mensajeRol(error));caja.hidden=false;boton.textContent='Reintentar ▾';}
 finally{boton.disabled=false;}
}

// ====== Estudiante: Mis tareas (estado + subir entrega) ======
async function vistaMisTareas(){
 $('#refresh').hidden=false;
 if(SESION.rol!=='Estudiante'){$('#view').innerHTML=vacio('🔒','No tienes permiso para esta acción','Inicia sesión con la cuenta de estudiante adecuada.');return;}
 $('#view').innerHTML=vacio('⏳','Cargando tareas','Un momento, consultamos las tareas de tus materias.');
 try{
  const tareas=await apiAuth('/tareas/');
  const conteo={Entregado:0,Pendiente:0,'No entregó':0};
  tareas.forEach(t=>{if(t.estado_entrega in conteo)conteo[t.estado_entrega]++;});
  $('#view').innerHTML=`${franja([{etiqueta:'Tareas',valor:tareas.length},{etiqueta:'Entregadas',valor:conteo.Entregado},{etiqueta:'Pendientes',valor:conteo.Pendiente},{etiqueta:'No entregó',valor:conteo['No entregó']}])}<section class="panel"><div class="panel-top"><div><h2>Tareas de tus materias</h2><p>Sube tu archivo antes de la fecha límite: PDF, MP4 o WebM, máximo 20 MB. En exámenes y quizzes el archivo es opcional</p></div></div><div id="lista-mis-tareas" class="lista-tareas"></div></section>`;
  const zona=$('#lista-mis-tareas');
  if(!tareas.length){zona.innerHTML=vacio('❑','No hay tareas en tus materias','Cuando tus profesores publiquen tareas, aparecerán aquí con su fecha límite.');animaLlegada($('#view'));return;}
  zona.innerHTML=tareas.map(t=>{
   const vigente=plazoVigente(t.fecha_limite);
   const claseEstado=t.estado_entrega==='Entregado'?'estado-entregado':t.estado_entrega==='Pendiente'?'estado-pendiente':'estado-no-entrego';
   const sinArchivo=TIPOS_SIN_ARCHIVO.includes(t.tipo||'taller');
   return `<article class="tarea-item" data-id="${esc(t.id_tarea)}"><div class="tarea-cab"><div class="tarea-titulo"><strong>${esc(t.titulo)}</strong><span class="tarea-meta">${chipTipo(t.tipo)}<span class="chip">${esc(t.id_materia)}</span><span class="chip">${esc(t.materia||'')}</span><span class="chip">Límite: ${esc(formatFecha(t.fecha_limite))}</span>${t.tiene_apoyo?`<button type="button" class="chip descarga-apoyo" data-id="${esc(t.id_tarea)}">⇩ Descargar apoyo</button>`:''}</span></div><div class="tarea-lado"><span class="chip ${claseEstado}">${esc(t.estado_entrega)}${t.estado_entrega==='Entregado'&&t.fecha_entrega?` · ${esc(formatFecha(t.fecha_entrega))}`:''}</span>${chipNota(t.calificacion)}${vigente?`<button type="button" class="subir-entrega" data-id="${esc(t.id_tarea)}">Subir entrega ⇧</button>`:''}</div></div>${vigente?`<form class="form-entrega" id="form-entrega-${esc(t.id_tarea)}" data-tipo="${esc(t.tipo||'taller')}" hidden><div class="fields"><div><label for="archivo-${esc(t.id_tarea)}">Tu archivo (PDF, MP4 o WebM, máx. 20 MB)${sinArchivo?' (opcional)':' *'}</label><input id="archivo-${esc(t.id_tarea)}" type="file" accept=".pdf,.mp4,.webm" ${sinArchivo?'':'required'}>${sinArchivo?'<p class="ayuda-tipo">Esta actividad se califica directamente</p>':''}<p class="error-archivo" role="alert"></p></div><div><label for="comentario-${esc(t.id_tarea)}">Comentario para el profesor (opcional)</label><input id="comentario-${esc(t.id_tarea)}" type="text" maxlength="300" placeholder="Ej. Adjunto el taller con capturas"></div></div><div class="form-actions"><button type="submit">Enviar entrega</button></div></form>`:''}</article>`;
  }).join('');
  zona.querySelectorAll('.descarga-apoyo').forEach(b=>b.onclick=()=>descargarPDF(`/tareas/${b.dataset.id}/apoyo`,`Apoyo_${b.dataset.id}.pdf`));
  zona.querySelectorAll('.subir-entrega').forEach(b=>b.onclick=()=>{
   const form=$(`#form-entrega-${b.dataset.id}`);
   form.hidden=!form.hidden;
   b.textContent=form.hidden?'Subir entrega ⇧':'Cerrar entrega ⇕';
   if(!form.hidden)form.querySelector('input[type=file]').focus();
  });
  zona.querySelectorAll('.form-entrega').forEach(form=>{
   const id=form.id.replace('form-entrega-','');
   const tipo=form.dataset.tipo||'taller', sinArchivo=TIPOS_SIN_ARCHIVO.includes(tipo);
   const input=$(`#archivo-${id}`), comentario=$(`#comentario-${id}`), err=form.querySelector('.error-archivo');
   input.onchange=e=>{if(!e.target.files[0]){err.textContent='';return;}const msg=validaArchivo(e.target.files[0]);err.textContent=msg;if(msg)e.target.value='';};
   form.onsubmit=async e=>{
    e.preventDefault();
    err.textContent='';
    const archivo=input.files[0];
    if(archivo){const msg=validaArchivo(archivo);if(msg){err.textContent=msg;return;}}
    else if(!sinArchivo){err.textContent=`El archivo es obligatorio para actividades de tipo ${nombreTipo(tipo).toLowerCase()}.`;return;}
    const btn=form.querySelector('button[type=submit]');
    btn.disabled=true;btn.textContent='Subiendo…';
    try{
     const fd=new FormData();
     if(archivo)fd.append('archivo',archivo);
     const texto=(comentario.value||'').trim();
     if(texto)fd.append('comentario',texto);
     await apiAuth(`/tareas/${id}/entregas`,{method:'POST',body:fd});
     notice('Entrega registrada correctamente. Tu estado ahora es "Entregado".',true);
     await vistaMisTareas();
    }catch(error){notice(mensajeRol(error));btn.disabled=false;btn.textContent='Enviar entrega';}
   };
  });
  animaLlegada($('#view'));
 }catch(error){$('#view').innerHTML=vacio('⚠','No se pudieron cargar tus tareas',mensajeRol(error));}
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

// ====== Botón flotante: alternar tema claro/oscuro (estado solo en memoria, sin localStorage/cookies) ======
let temaOscuro=false;
const btnTema=document.createElement('button');
btnTema.id='btn-tema';btnTema.type='button';
btnTema.setAttribute('aria-pressed','false');
btnTema.title='Cambiar a tema oscuro';
btnTema.innerHTML='<span aria-hidden="true">🌙</span><span class="tema-texto">&nbsp;Oscuro</span>';
btnTema.addEventListener('click',()=>{
  temaOscuro=!temaOscuro;
  document.body.classList.toggle('tema-oscuro',temaOscuro);
  btnTema.setAttribute('aria-pressed',String(temaOscuro));
  btnTema.innerHTML=`<span aria-hidden="true">${temaOscuro?'☀':'🌙'}</span><span class="tema-texto">&nbsp;${temaOscuro?'Claro':'Oscuro'}</span>`;
  btnTema.title=temaOscuro?'Estás en tema oscuro: pulsa para volver al claro':'Estás en tema claro: pulsa para ir al oscuro';
});
$('#app-workspace').appendChild(btnTema);

// ====== Refresh y navegación ======
$('#refresh').onclick=async()=>{if(loading)return;loading=true;$('#refresh').disabled=true;notice('');await refreshCatalogos();loading=false;$('#refresh').disabled=false;render();};
window.addEventListener('hashchange',()=>{const hash=location.hash.slice(1);const valido=navItems().some(([k])=>k===hash);const destino=valido?hash:'resumen';if(SESION&&destino!==current){const origen=current;current=destino;animarSeccion(destino,origen);}});
current='resumen';
