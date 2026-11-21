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
    ['matricular','Matricular','✓'], ['registro','Registro académico','◫'], ['misnotas','Mis notas','✎'], ['mistareas','Mis tareas','❑'], ['docs','Mis documentos','⇩'],
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
  SESION=null;data={};errors={};planDe=null;
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
 programas:{title:'Programas',singular:'programa',icon:'▤',description:'Conecta cada programa académico con su facultad.',fields:[['id_programa','Código','text',10],['nombre_programa','Nombre del programa','text',100],['id_facultad','Facultad','select',null,'facultades']],formOrder:['id_facultad','id_programa','nombre_programa']},
 materias:{title:'Materias',singular:'materia',icon:'▥',description:'Gestiona la oferta de cursos, sus horarios y profesores.',fields:[
    ['id_materia','Código','text',10],
    ['nombre_curso','Nombre del curso','text',100],
    ['creditos','Créditos','number',1],
    ['cupos','Cupos','number',0],
    ['id_facultad','Facultad','select',null,'facultades'],
    ['dia','Día','select',null,null,true],
    ['hora_inicio','Hora inicio','select',null,null,true],
    ['hora_fin','Hora fin','select',null,null,true],
    ['horario','Horario','text',100,null,true],
    ['id_profesor','Profesor','select',null,'profesores']]},
 periodos:{title:'Periodos',singular:'periodo',icon:'⏱',description:'Ventanas de fechas en las que se puede matricular.',fields:[['periodo','Periodo (ej. 2026-2)','text',10],['fecha_inicio','Fecha inicio (YYYY-MM-DD)','date',null],['fecha_fin','Fecha fin (YYYY-MM-DD)','date',null]]},
};
function relatedLabel(key,id){
 const m=modules[key], row=(data[key]||[]).find(r=>r[m.fields[0][0]]===id);
 return row ? `${id} · ${row.nombre_facultad||row.nombre_programa||row.nombre_curso||[row.nombre,row.apellidos].filter(Boolean).join(' ')}` : id;
}
function display(row,field){return field[4]?relatedLabel(field[4],row[field[0]]):row[field[0]];}
function horarioTexto(row){
 const hi=String(row.hora_inicio||'').slice(0,5),hf=String(row.hora_fin||'').slice(0,5);
 if(row.dia&&hi&&hf)return `<span class="chip-horario">${esc(row.dia)} ${hi}–${hf}</span>`;
 if(row.horario)return `<span class="chip-horario chip-horario-texto">${esc(row.horario)}</span>`;
 return '<span class="sin-horario">—</span>';
}
function cabeceraTabla(key,campos){
 const esMaterias=key==='materias',conPlan=key==='programas';
 return `<tr>${campos.map(f=>`<th scope="col">${esc(f[1])}</th>`).join('')}${esMaterias?'<th scope="col">Horario</th>':''}${conPlan?'<th scope="col">Plan de estudios</th>':''}${esMaterias?'<th scope="col">Acciones</th>':''}</tr>`;
}
function celdasFila(key,row,campos){
 const esMaterias=key==='materias',conPlan=key==='programas';
 const horario=esMaterias?`<td>${horarioTexto(row)}</td>`:'';
 const plan=conPlan?`<td><button type="button" class="secondary btn-plan" data-id="${esc(row.id_programa)}">Plan de estudios</button></td>`:'';
 const acciones=esMaterias?`<td class="acciones"><button type="button" class="btn-icono btn-editar" data-id="${esc(row.id_materia)}" title="Editar ${esc(row.nombre_curso)}" aria-label="Editar ${esc(row.nombre_curso)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button><button type="button" class="btn-icono btn-icono-peligro btn-eliminar" data-id="${esc(row.id_materia)}" data-nombre="${esc(row.nombre_curso)}" title="Eliminar ${esc(row.nombre_curso)}" aria-label="Eliminar ${esc(row.nombre_curso)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 15H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button></td>`:'';
 return `<tr>${campos.map((f,i)=>`<td>${i===0?`<span class="id">${esc(row[f[0]])}</span>`:esc(display(row,f)??'—')}</td>`).join('')}${horario}${plan}${acciones}</tr>`;
}
function table(key,rows){
 const m=modules[key],esMaterias=key==='materias';
 const campos=esMaterias?m.fields.filter(f=>!['dia','hora_inicio','hora_fin','horario'].includes(f[0])):m.fields;
 return `<div class="table-wrap"><table><thead>${cabeceraTabla(key,campos)}</thead><tbody>${rows.map(row=>celdasFila(key,row,campos)).join('')}</tbody></table></div>`;
}
// Programas: una tabla con un encabezado por facultad y sus programas debajo.
function tableProgramas(rows){
 const campos=modules.programas.fields.filter(f=>f[0]!=='id_facultad');
 const grupos=new Map();
 rows.forEach(row=>{const id=row.id_facultad||'';if(!grupos.has(id))grupos.set(id,[]);grupos.get(id).push(row);});
 const facultades=data.facultades||[];
 const bloques=[...grupos.entries()].sort(([a],[b])=>String(a).localeCompare(String(b),'es')).map(([id,filas])=>{
  const f=facultades.find(x=>x.id_facultad===id);
  const nombre=f?.nombre_facultad||'Sin facultad';
  const titulo=/^facultad\b/i.test(nombre)?nombre:`Facultad de ${nombre}`;
  return `<tbody class="grupo-facultad"><tr class="grupo-facultad-fila"><th colspan="${campos.length+1}" scope="colgroup"><div class="grupo-contenido"><span class="grupo-icono" aria-hidden="true">▦</span><span class="grupo-titulo">${esc(titulo)}</span><span class="grupo-codigo">· ${esc(id)}</span><span class="grupo-cuenta">${filas.length} ${filas.length===1?'programa':'programas'}</span></div></th></tr>${filas.map(row=>celdasFila('programas',row,campos)).join('')}</tbody>`;
 }).join('');
 return `<div class="table-wrap"><table class="tabla-programas"><thead>${cabeceraTabla('programas',campos)}</thead>${bloques}</table></div>`;
}

// ====== Render principal ======
function go(key){
  if(!SESION) return;
  planDe=null; // reabrir Programas siempre muestra la lista, no un plan abierto
  if(key===current){render();return;}
  const origen=current;
  current=key;location.hash=key;
  animarSeccion(key,origen);
}
function navItems(){return MENUS[SESION?.rol]||[['resumen','Resumen','◈']];}
function render(){
 if(!SESION) return;
 cierraLogoMenu();
 const titulo={resumen:'Resumen académico',matricular:'Matricular',registro:'Registro académico',misnotas:'Mis notas',mistareas:'Mis tareas',docs:'Mis documentos',ingresarnotas:'Ingresar notas',tareas:'Tareas',reportes:'Reportes',cuentas:'Cuentas'};
 $('#breadcrumb').textContent=titulo[current]||modules[current]?.title||'Resumen';
 $('#title').textContent=titulo[current]||modules[current]?.title||'Resumen académico';
  $('#subtitle').textContent={resumen:'Todo según tu rol: '+SESION.rol,matricular:'Arma tu carrito y confirma: total entre 6 y 19 créditos.',registro:'Tus materias, calificaciones y promedios por periodo.',misnotas:'Tus calificaciones registradas.',mistareas:'Las tareas de tus materias: entrega a tiempo.',docs:'Descarga tus reportes en PDF.',ingresarnotas:'Califica a los estudiantes de tus materias.',tareas:'Crea tareas en tus materias y revisa quién entregó.',reportes:'Reporte de notas de tus estudiantes.',cuentas:'Crea cuentas y restablece claves.',periodos:'Ventanas de matrícula.'}[current]||modules[current]?.description||'';
 $('#nav').innerHTML=navItems().map(([k,t,i])=>`<button data-page="${k}" class="${k===current?'active':''}" ${k===current?'aria-current="page"':''}><span aria-hidden="true">${i}</span>${t}</button>`).join('');
 $('#nav').querySelectorAll('button').forEach(b=>b.onclick=()=>go(b.dataset.page));
 const vistas={resumen:vistaResumen,matricular:vistaMatricular,registro:vistaRegistroAcademico,misnotas:vistaMisNotas,mistareas:vistaMisTareas,docs:vistaDocs,ingresarnotas:vistaIngresarNotas,tareas:vistaTareas,reportes:vistaReportes,cuentas:vistaCuentas};
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
// Plan de estudios abierto (drill-down dentro de Programas; estado solo en memoria)
let planDe=null;
// Materia en edición (null = crear nueva)
let editandoMateria=null;
async function vistaCatalogo(){
 const key=current, m=modules[key];
 if(!m){$('#view').innerHTML=vacio('◈','Pantalla no disponible','Vuelve al resumen y elige una sección del menú.');return;}
 if(key==='programas'&&planDe){vistaPlanPrograma(planDe);return;}
 $('#refresh').hidden=false;
 const conFiltro=key==='programas'||key==='materias';
 $('#view').innerHTML=`<div id="franja-zone"></div><section class="panel"><div class="panel-top"><div><h2>Directorio de ${m.title.toLowerCase()}</h2><p>Información registrada en el sistema académico</p></div><button id="new">+ Registrar ${m.singular}</button></div><div class="toolbar"><input id="search" type="search" aria-label="Buscar registros" placeholder="Buscar…">${conFiltro?`<label class="filtro-facultad" for="filtro-facultad"><span>Facultad</span><select id="filtro-facultad" aria-label="Filtrar por facultad"><option value="">Todas las facultades</option></select></label>`:''}<span class="count" id="count"></span></div><div id="rows"></div></section>`;
 $('#new').onclick=()=>openForm();
 $('#search').oninput=e=>renderRows(e.target.value);
 if(conFiltro)$('#filtro-facultad').onchange=()=>renderRows();
 renderRows();
 await asegurarCatalogos();
 if(current!==key) return;
 pintaFranja(key);
 renderRows();
 animaLlegada($('#rows'));
}
// Rellena el filtro con las facultades cargadas, conservando la opción elegida.
function pintarFiltroFacultad(){
 const sel=$('#filtro-facultad');if(!sel)return;
 const actual=sel.value;
 const opciones=(data.facultades||[]).slice().sort((a,b)=>String(a.id_facultad).localeCompare(String(b.id_facultad),'es')).map(f=>`<option value="${esc(f.id_facultad)}">${esc(f.id_facultad)} · ${esc(f.nombre_facultad)}</option>`).join('');
 sel.innerHTML=`<option value="">Todas las facultades</option>${opciones}`;
 if(actual&&[...sel.options].some(o=>o.value===actual))sel.value=actual;
}
function renderRows(query){
 const key=current, area=$('#rows');if(!area)return;
 if(query===undefined)query=$('#search')?.value??'';
 if(errors[key]){area.innerHTML=vacio('⚠','No se pudieron cargar los datos','Pulsa Actualizar para reintentar la conexión con la API.');return;}
 if(!data[key]){area.innerHTML=vacio('⏳','Cargando registros','Un momento, consultamos los datos del sistema académico.');return;}
 pintarFiltroFacultad();
 const all=data[key], q=String(query).toLocaleLowerCase('es');
 const fac=$('#filtro-facultad')?.value||'';
 const rows=all.filter(r=>{
  const coincide=modules[key].fields.some(f=>String(display(r,f)??'').toLocaleLowerCase('es').includes(q));
  return coincide&&(!fac||String(r.id_facultad||'')===fac);
 });
 $('#count').textContent=`${rows.length} de ${all.length} registros`;
 const detalle=q&&fac?`la búsqueda "${query}" en la facultad elegida`:fac?'la facultad elegida':`la búsqueda "${query}"`;
 area.innerHTML=rows.length?(key==='programas'?tableProgramas(rows):table(key,rows)):((q||fac)?vacio('⌕','Sin coincidencias',`Ningún registro coincide con ${detalle}. Prueba con otro filtro.`):vacio('▦',`Todavía no hay ${modules[key].title.toLowerCase()}`,`Crea el primer ${modules[key].singular} con el botón "+ Registrar ${modules[key].singular}" para empezar.`));
 area.querySelectorAll('.btn-plan').forEach(b=>b.onclick=()=>{planDe=b.dataset.id;vistaPlanPrograma(b.dataset.id);});
  area.querySelectorAll('.btn-editar').forEach(b=>b.onclick=async()=>{
    try{
      if(current!=='materias'){await go('materias');}
      openForm(b.dataset.id);
    }catch(error){notice(error.message);}
  });
  area.querySelectorAll('.btn-eliminar').forEach(b=>b.onclick=async()=>{
    if(!confirm(`¿Eliminar '${b.dataset.nombre}'?`))return;
    try{
      await apiAuth(`/materias/${encodeURIComponent(b.dataset.id)}`,{method:'DELETE'});
      notice(`Materia ${b.dataset.id} eliminada.`,true);
      await refreshCatalogos();
      renderRows();
    }catch(error){notice(error.message);}
  });
}
// Selector visual de horario para materias: día con botones, horas tipo reloj,
// atajos de rangos comunes y una barra que muestra el horario elegido.
function bloqueHorario(fila){
 const dia=fila?.dia||'';
 const hi=String(fila?.hora_inicio||'').slice(0,5);
 const hf=String(fila?.hora_fin||'').slice(0,5);
 const legado=fila?.horario||'';
 const dias=[['Lunes','Lun'],['Martes','Mar'],['Miércoles','Mié'],['Jueves','Jue'],['Viernes','Vie'],['Sábado','Sáb'],['Domingo','Dom']];
 const atajos=[['06:00','08:00'],['08:00','10:00'],['10:00','12:00'],['14:00','16:00'],['16:00','18:00'],['18:00','20:00']];
 return `<div class="horario-card" id="horario-card">
  <input type="hidden" name="dia" id="field-dia" value="${esc(dia)}">
  <input type="hidden" name="hora_inicio" id="field-hora_inicio" value="${esc(hi)}">
  <input type="hidden" name="hora_fin" id="field-hora_fin" value="${esc(hf)}">
  <input type="hidden" name="horario" value="${esc(legado)}">
  <div class="horario-card-top">
   <div><h3>Horario de la materia</h3><p>Elige el día y las horas. Es opcional.</p></div>
   <button type="button" class="horario-limpiar" id="horario-limpiar">Limpiar</button>
  </div>
  <div class="horario-dias" role="group" aria-label="Día de la semana">
   ${dias.map(([d,c])=>`<button type="button" class="dia-chip${dia===d?' activo':''}" data-dia="${d}" aria-pressed="${dia===d?'true':'false'}" title="${d}">${c}</button>`).join('')}
  </div>
  <div class="horario-horas">
   <label class="hora-campo" for="time-inicio"><span class="hora-etiqueta">Hora inicio</span><input type="time" id="time-inicio" step="1800" value="${hi}" aria-label="Hora de inicio"></label>
   <span class="hora-flecha" aria-hidden="true">→</span>
   <label class="hora-campo" for="time-fin"><span class="hora-etiqueta">Hora fin</span><input type="time" id="time-fin" step="1800" value="${hf}" aria-label="Hora de fin"></label>
  </div>
  <div class="horario-atajos"><span>Atajos</span>${atajos.map(([a,b])=>`<button type="button" class="atajo-hora" data-inicio="${a}" data-fin="${b}">${a}–${b}</button>`).join('')}</div>
  <div class="horario-previa" id="horario-previa">
   <div class="horario-previa-texto" id="horario-texto">Sin horario asignado (opcional)</div>
   <div class="horario-linea"><div class="horario-rango" id="horario-rango"></div></div>
   <div class="horario-escala" aria-hidden="true"><span>06:00</span><span>10:00</span><span>14:00</span><span>18:00</span><span>22:00</span></div>
  </div>
 </div>`;
}
function conectarHorario(){
 const card=$('#horario-card');if(!card)return;
 const hDia=$('#field-dia'),hIni=$('#field-hora_inicio'),hFin=$('#field-hora_fin');
 const tIni=$('#time-inicio'),tFin=$('#time-fin');
 const botones=[...card.querySelectorAll('.dia-chip')];
 const texto=$('#horario-texto'),rango=$('#horario-rango');
 const pintar=()=>{
  botones.forEach(b=>{const on=b.dataset.dia===hDia.value;b.classList.toggle('activo',on);b.setAttribute('aria-pressed',on?'true':'false');});
  const [hi,mi]=hIni.value.split(':').map(Number),[hf,mf]=hFin.value.split(':').map(Number);
  const tieneHoras=hIni.value&&hFin.value;
  const completo=hDia.value&&tieneHoras;
  card.classList.toggle('con-horario',!!completo);
  if(!hDia.value){texto.textContent=tieneHoras?'Elige un día para el horario':'Sin horario asignado (opcional)';rango.style.display='none';return;}
  if(!tieneHoras){texto.textContent='Completa la hora de inicio y de fin';rango.style.display='none';return;}
  const minutos=hi*60+mi,fin=hf*60+mf,dur=(fin-minutos)/60;
  texto.innerHTML=`<strong>${esc(hDia.value)}</strong> · ${hIni.value} a ${hFin.value}${dur>0?` <span class="horario-dur">${dur} h</span>`:''}`;
  const iniPct=Math.max(0,Math.min(100,(minutos-360)/960*100));
  const finPct=Math.max(0,Math.min(100,(fin-360)/960*100));
  rango.style.display='block';rango.style.left=iniPct+'%';rango.style.width=Math.max(0,finPct-iniPct)+'%';
 };
 botones.forEach(b=>b.onclick=()=>{
  const nuevo=hDia.value===b.dataset.dia?'':b.dataset.dia;
  hDia.value=nuevo;
  if(nuevo&&!hIni.value&&!hFin.value){tIni.value='08:00';tFin.value='10:00';hIni.value='08:00';hFin.value='10:00';}
  pintar();
 });
 tIni.oninput=()=>{hIni.value=tIni.value;pintar();};
 tFin.oninput=()=>{hFin.value=tFin.value;pintar();};
 card.querySelectorAll('.atajo-hora').forEach(b=>b.onclick=()=>{
  tIni.value=b.dataset.inicio;tFin.value=b.dataset.fin;
  hIni.value=b.dataset.inicio;hFin.value=b.dataset.fin;
  pintar();
 });
 $('#horario-limpiar').onclick=()=>{
  hDia.value='';hIni.value='';hFin.value='';tIni.value='';tFin.value='';
  pintar();
 };
 pintar();
}
function openForm(idMateria){
 const m=modules[current];$('#form').reset();$('#form-error').textContent='';
 editandoMateria=idMateria||null;let fila=null;
 if(editandoMateria){
  $('#dialog-title').textContent=`Editar ${m.singular}`;
  $('#dialog-eyebrow').textContent='EDITAR REGISTRO';
  $('#dialog-hint').textContent='Modifica los campos que quieras cambiar y guarda.';
  fila=(data[current]||[]).find(r=>r[m.fields[0][0]]===editandoMateria);
 }else{
  $('#dialog-title').textContent=`Registrar ${m.singular}`;
  $('#dialog-eyebrow').textContent='NUEVO REGISTRO';
  $('#dialog-hint').textContent='Completa los datos. Los campos con * son obligatorios.';
 }
 const esMaterias=current==='materias';
 const camposHorario=['dia','hora_inicio','hora_fin','horario'];
 // En Programas la facultad va primero: es la decisión que ordena el resto.
 const camposFormulario=m.formOrder?m.formOrder.map(k=>m.fields.find(f=>f[0]===k)).filter(Boolean):m.fields;
 $('#fields').innerHTML=camposFormulario.map(([key,label,type,limit,source,optional])=>{
  if(esMaterias&&camposHorario.includes(key))return '';
  let control;
  if(type==='select'){
   const val=fila?fila[key]:'';
   const rows=data[source]||[],id=modules[source].fields[0][0];
   control=`<select name="${key}" id="field-${key}" required><option value="">${rows.length?'Selecciona una opción':`Primero registra ${modules[source].title.toLowerCase()}`}</option>${rows.map(r=>`<option value="${esc(r[id])}"${val===r[id]?' selected':''}>${esc(relatedLabel(source,r[id]))}</option>`).join('')}</select>`;
  }else {
   const baseVal=fila?(fila[key]??''):(key==='cupos'?20:'');
   const readonly=key==='id_materia'&&editandoMateria?'readonly':'';
   control=`<input id="field-${key}" name="${key}" type="${type}" value="${esc(baseVal)}" ${optional?'':'required'} ${readonly} ${type==='number'?`min="${limit}" max="2147483647" step="1"`:`maxlength="${limit||10}"`}>`;
  }
  return `<div><label for="field-${key}">${label}${optional?' (opcional)':' *'}</label>${control}</div>`;
 }).join('')+(esMaterias?bloqueHorario(fila):'');
 if(esMaterias)conectarHorario();
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
 if(key==='materias'){
  const algo=payload.dia||payload.hora_inicio||payload.hora_fin;
  const completo=payload.dia&&payload.hora_inicio&&payload.hora_fin;
  if(algo&&!completo){$('#form-error').textContent='Completa el día, la hora de inicio y la hora de fin, o deja el horario vacío.';return;}
  if(completo&&payload.hora_fin<=payload.hora_inicio){$('#form-error').textContent='La hora de fin debe ser mayor que la hora de inicio.';return;}
 }
 saving=true;$('#save').disabled=true;$('#save').textContent='Guardando…';$('#cancel').disabled=true;$('#close').disabled=true;
 const metodo=editandoMateria?'PUT':'POST';
  const ruta=editandoMateria?`/${key}/${encodeURIComponent(editandoMateria)}` : `/${key}/`;
  try{await apiAuth(ruta,{method:metodo,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});$('#dialog').close();editandoMateria=null;await refreshCatalogos();pintaFranja(key);renderRows();if(!errors[key])notice(`Registro ${metodo==='PUT'?'actualizado':'guardado'} correctamente.`,true);}
 catch(error){$('#form-error').textContent=mensajeRol(error);}
 finally{saving=false;$('#save').disabled=false;$('#save').textContent='Guardar registro';$('#cancel').disabled=false;$('#close').disabled=false;}
};
$('#dialog').addEventListener('cancel',e=>{if(saving)e.preventDefault();});$('#close').onclick=closeForm;$('#cancel').onclick=closeForm;

// ====== Admin: Plan de estudios de un programa (se abre desde Programas) ======
// Usa los endpoints de la Parte 6A: GET/POST /programas/{id}/plan y
// PUT/DELETE /programas/{id}/plan/{id_materia} (solo Administrador).
// Los cambios de plan no afectan matrículas, notas ni tareas ya guardadas.
const SEMESTRES=[1,2,3,4,5,6,7,8,9,10];
async function vistaPlanPrograma(idPrograma){
 $('#refresh').hidden=false;
 $('#view').innerHTML=vacio('⏳','Cargando plan de estudios','Un momento, consultamos las materias del programa.');
 try{
  await asegurarCatalogos();
  if(current!=='programas'||planDe!==idPrograma)return;
  const programa=(data.programas||[]).find(p=>p.id_programa===idPrograma);
  const nombrePrograma=programa?programa.nombre_programa:idPrograma;
  const plan=await apiAuth(`/programas/${encodeURIComponent(idPrograma)}/plan`);
  if(current!=='programas'||planDe!==idPrograma)return;
  const enPlan=new Set(plan.map(f=>f.id_materia));
  const hayMaterias=Array.isArray(data.materias);
  const fuera=hayMaterias?(data.materias||[]).filter(m=>!enPlan.has(m.id_materia)):[];
  const obligatorias=plan.filter(f=>f.obligatoria).length;
  const recarga=()=>vistaPlanPrograma(idPrograma);
  const rutaMateria=id=>`/programas/${encodeURIComponent(idPrograma)}/plan/${encodeURIComponent(id)}`;
  const item=f=>`<article class="plan-item" data-id="${esc(f.id_materia)}"><div class="plan-info"><strong>${esc(f.nombre_curso)}</strong><span class="tarea-meta"><span class="chip">${esc(f.id_materia)}</span><span class="chip chip-creditos">${f.creditos} créditos</span><span class="chip ${f.obligatoria?'chip-obligatoria':'chip-electiva'}">${f.obligatoria?'Obligatoria':'Electiva'}</span></span></div><div class="plan-acciones"><label class="plan-semestre-label">Semestre <select class="plan-semestre" data-id="${esc(f.id_materia)}" aria-label="Semestre de ${esc(f.nombre_curso)}">${SEMESTRES.map(n=>`<option value="${n}"${n===f.semestre?' selected':''}>${n}</option>`).join('')}</select></label><button type="button" class="secondary plan-tipo" data-id="${esc(f.id_materia)}" data-obligatoria="${f.obligatoria?'true':'false'}">${f.obligatoria?'Hacer electiva':'Hacer obligatoria'}</button><button type="button" class="secondary plan-quitar" data-id="${esc(f.id_materia)}" data-nombre="${esc(f.nombre_curso)}">Quitar ✕</button></div></article>`;
  // Agrupadas por semestre (1 a 10): solo los semestres que tienen materias
  const grupos=SEMESTRES.map(n=>({n,filas:plan.filter(f=>f.semestre===n)})).filter(g=>g.filas.length);
  const lista=plan.length?grupos.map(g=>`<section class="plan-grupo"><h3>Semestre ${g.n}<span class="count">· ${g.filas.length} ${g.filas.length===1?'materia':'materias'}</span></h3>${g.filas.map(item).join('')}</section>`).join(''):vacio('▤','Este programa aún no tiene materias en su plan','Agrega la primera con el formulario "Agregar materia al plan" de abajo.');
  const facultadInicial=programa?.id_facultad||'';
  const facultades=data.facultades||[];
  const facultadElegida=facultades.some(f=>f.id_facultad===facultadInicial)?facultadInicial:(facultades[0]?.id_facultad||facultadInicial);
  const opcionesFacultad=facultades.length
   ?facultades.map(f=>`<option value="${esc(f.id_facultad)}"${f.id_facultad===facultadElegida?' selected':''}>${esc(relatedLabel('facultades',f.id_facultad))}</option>`).join('')
   :`<option value="${esc(facultadInicial)}">${esc(facultadInicial||'Sin facultades registradas')}</option>`;
  const opcionesMateria=idFacultad=>fuera.filter(m=>m.id_facultad===idFacultad).map(m=>`<option value="${esc(m.id_materia)}">${esc(m.id_materia)} · ${esc(m.nombre_curso)}</option>`).join('');
  const opciones=opcionesMateria(facultadElegida);
  const sinMaterias=!opciones;
  const formulario=hayMaterias
   ?(fuera.length?`<div class="fields"><div><label for="plan-facultad">Facultad *</label><select id="plan-facultad" required>${opcionesFacultad}</select></div><div><label for="plan-materia">Materia *</label><select id="plan-materia" required>${opciones||'<option value="">No hay materias disponibles en esta facultad</option>'}</select><p class="ayuda-plan" id="plan-sin-materias"${sinMaterias?'':' hidden'}>Todas las materias de esta facultad ya están en el plan.</p></div><div><label for="plan-semestre-nuevo">Semestre *</label><select id="plan-semestre-nuevo" required>${SEMESTRES.map(n=>`<option value="${n}">${n}</option>`).join('')}</select></div><div><label for="plan-tipo-nuevo">Tipo</label><select id="plan-tipo-nuevo"><option value="true">Obligatoria</option><option value="false">Electiva</option></select></div></div><p id="plan-error" role="alert"></p><div class="form-actions"><button type="submit" id="plan-agregar"${sinMaterias?' disabled':''}>Agregar al plan</button></div>`
   :vacio('▥','Todas las materias registradas ya están en el plan','Registra materias nuevas en la sección Materias para poder agregarlas aquí.'))
   :vacio('⚠','No se pudieron cargar las materias','Pulsa Actualizar para reintentar la conexión con la API.');
  $('#view').innerHTML=`${franja([{etiqueta:'Materias en el plan',valor:plan.length},{etiqueta:'Obligatorias',valor:obligatorias},{etiqueta:'Electivas',valor:plan.length-obligatorias}])}<section class="panel"><div class="panel-top"><div><h2>Plan de estudios · ${esc(nombrePrograma)} (${esc(idPrograma)})</h2><p>Materias agrupadas por semestre. Quitar una materia no afecta las matrículas, notas ni tareas ya guardadas</p></div><button type="button" class="secondary" id="volver-programas">← Volver a Programas</button></div><div class="lista-plan" id="lista-plan">${lista}</div></section><section class="panel"><div class="panel-top"><div><h2>Agregar materia al plan</h2><p>Elige la facultad y solo verás sus materias que aún no están en este plan</p></div></div><form id="form-plan-add" ${hayMaterias&&fuera.length?'':'hidden'}>${formulario}</form></section>`;
  $('#volver-programas').onclick=()=>{planDe=null;vistaCatalogo();};
  // Quitar del plan: si la API responde 409, el mensaje se muestra tal cual
  // (dice qué materia del mismo plan depende de ella como requisito)
  $('#view').querySelectorAll('.plan-quitar').forEach(b=>b.onclick=async()=>{
   b.disabled=true;b.textContent='Quitando…';
   try{
    await apiAuth(rutaMateria(b.dataset.id),{method:'DELETE'});
    notice(`La materia ${b.dataset.id} (${b.dataset.nombre}) salió del plan.`,true);
    await recarga();
   }catch(error){notice(error.message);b.disabled=false;b.textContent='Quitar ✕';}
  });
  // Cambiar semestre (PUT): al terminar se recarga el plan con la nueva agrupación
  $('#view').querySelectorAll('.plan-semestre').forEach(s=>s.onchange=async()=>{
   const id=s.dataset.id,nuevo=Number(s.value);
   try{
    await apiAuth(rutaMateria(id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({semestre:nuevo})});
    notice(`Semestre de ${id} actualizado a ${nuevo}.`,true);
    await recarga();
   }catch(error){notice(error.message);await recarga();}
  });
  // Cambiar obligatoria ↔ electiva (PUT)
  $('#view').querySelectorAll('.plan-tipo').forEach(b=>b.onclick=async()=>{
   const id=b.dataset.id,nueva=b.dataset.obligatoria!=='true';
   b.disabled=true;
   try{
    await apiAuth(rutaMateria(id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({obligatoria:nueva})});
    notice(`${id} ahora es ${nueva?'obligatoria':'electiva'}.`,true);
    await recarga();
   }catch(error){notice(error.message);b.disabled=false;}
  });
  // La facultad elegida filtra las materias que todavía pueden entrar al plan
  const selectorFacultad=$('#plan-facultad');
  if(selectorFacultad)selectorFacultad.onchange=()=>{
   const lista=fuera.filter(m=>m.id_facultad===selectorFacultad.value);
   const selectorMateria=$('#plan-materia');
   selectorMateria.innerHTML=lista.length?opcionesMateria(selectorFacultad.value):'<option value="">No hay materias disponibles en esta facultad</option>';
   const aviso=$('#plan-sin-materias');if(aviso)aviso.hidden=lista.length>0;
   const btn=$('#plan-agregar');if(btn)btn.disabled=!lista.length;
   const err=$('#plan-error');if(err)err.textContent='';
  };
  // Agregar materia al plan (POST): el 409 de duplicada muestra el mensaje pedido
  $('#form-plan-add').onsubmit=async e=>{
   e.preventDefault();
   const err=$('#plan-error');err.textContent='';
   const idMateria=$('#plan-materia')?.value, semestre=Number($('#plan-semestre-nuevo')?.value);
   const obligatoria=$('#plan-tipo-nuevo')?.value==='true';
   if(!idMateria||!semestre)return;
   const btn=$('#plan-agregar');btn.disabled=true;btn.textContent='Agregando…';
   try{
    await apiAuth(`/programas/${encodeURIComponent(idPrograma)}/plan`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id_materia:idMateria,semestre,obligatoria})});
    notice(`Materia ${idMateria} agregada al plan de ${nombrePrograma}.`,true);
    await recarga();
   }catch(error){err.textContent=error.status===409?'Esa materia ya está en el plan':error.message;btn.disabled=false;btn.textContent='Agregar al plan';}
  };
  animaLlegada($('#view'));
 }catch(error){$('#view').innerHTML=vacio('⚠','No se pudo cargar el plan de estudios',error.message);}
}

// ====== Estudiante: Matricular (tablero por semestre + lista) ======
// El tablero es la vista por defecto; la lista conserva el carrito de siempre.
let carrito=new Set();
let vistaMaterias='tablero';
let periodoGuardada=null; // periodo elegido en "Mi matrícula del periodo" (solo en memoria)
function formatoHorario(m){
 if(m.dia&&m.hora_inicio&&m.hora_fin)return `${m.dia} ${String(m.hora_inicio).slice(0,5)}–${String(m.hora_fin).slice(0,5)}`;
 return 'Sin horario';
}
function hayCruceHorario(a,b){
 return !!(a&&b&&a.dia&&b.dia&&a.hora_inicio&&a.hora_fin&&b.hora_inicio&&b.hora_fin&&a.dia===b.dia&&String(a.hora_inicio).slice(0,5)<String(b.hora_fin).slice(0,5)&&String(b.hora_inicio).slice(0,5)<String(a.hora_fin).slice(0,5));
}
// materias-disponibles entrega requisitos_faltantes como
// [{id_materia, nombre_curso}]; se muestran nombre y código del requisito.
function nombreRequisito(r){
 if(typeof r==='string')return r;
 const nombre=r?.nombre_requisito||r?.nombre_curso;
 const id=r?.id_requisito||r?.id_materia;
 if(nombre&&id)return `${nombre} (${id})`;
 return nombre||id||'';
}
function requisitosFaltantes(m){
 const directos=Array.isArray(m.requisitos_faltantes)?m.requisitos_faltantes:[];
 const nombres=directos.map(nombreRequisito).filter(Boolean);
 if(nombres.length)return nombres;
 if(m.requisito_faltante)return [String(m.requisito_faltante)];
 if(Array.isArray(m.requisitos))return m.requisitos.filter(r=>r&&(r.aprobada===false||r.cumplido===false)).map(nombreRequisito).filter(Boolean);
 return [];
}
function estadoMateria(m){
 const faltan=requisitosFaltantes(m);
 if(m.estado==='Aprobada')return {clase:'aprobada',texto:'Aprobada',faltan};
 if(m.estado==='Matriculada')return {clase:'matriculada',texto:'Matriculada',faltan};
 if(m.bloqueada===true||/bloquead/i.test(String(m.estado||''))||faltan.length)return {clase:'bloqueada',texto:'Bloqueada por requisito',faltan};
 return {clase:'disponible',texto:m.estado||'Disponible',faltan};
}
function esMateriaBloqueada(m){return estadoMateria(m).clase==='bloqueada';}
function avisoBloqueo(m){
 const faltan=requisitosFaltantes(m);
 notice(`'${m.nombre_curso}' está bloqueada por requisito${faltan.length?`: falta ${faltan.join(', ')}`:''}.`);
}
async function vistaMatricular(){
 $('#refresh').hidden=false;
 if(SESION.rol!=='Estudiante'){$('#view').innerHTML=vacio('🔒','No tienes permiso para esta acción','Inicia sesión con la cuenta de estudiante adecuada.');return;}
 $('#view').innerHTML=vacio('⏳','Cargando materias','Un momento, consultamos el plan de estudios de tu programa.');
 try{
  const [materias,periodos]=await Promise.all([
   api(`/estudiantes/${encodeURIComponent(SESION.id_persona)}/materias-disponibles`),
   api('/periodos/'),
  ]);
  const porId=new Map(materias.map(m=>[m.id_materia,m]));
  const hoy=new Date();
  const periodoAbierto=(periodos||[]).find(p=>{
   const ini=p.fecha_inicio?new Date(p.fecha_inicio+'T00:00:00'):null;
   const fin=p.fecha_fin?new Date(p.fecha_fin+'T23:59:59'):null;
   return ini&&fin&&hoy>=ini&&hoy<=fin;
  });
  const periodoMatricula=periodoAbierto?periodoAbierto.periodo:null;
  carrito=new Set([...carrito].filter(id=>porId.has(id)&&!esMateriaBloqueada(porId.get(id))));
  const semestreDe=m=>{const n=Number(m.semestre);return Number.isFinite(n)?n:0;};
  const semestres=[...new Set(materias.map(semestreDe))].sort((a,b)=>a-b);
  const tarjeta=m=>{
   const ev=estadoMateria(m),bloq=ev.clase==='bloqueada',enCarrito=!bloq&&carrito.has(m.id_materia),faltan=ev.faltan.join(', ');
   const etiqueta=`${m.id_materia} ${m.nombre_curso}, ${m.creditos} créditos, ${m.obligatoria?'obligatoria':'electiva'}, ${ev.texto}${bloq&&faltan?`. Falta ${faltan}`:''}. ${bloq?'No se puede agregar al carrito.':(enCarrito?'En el carrito':'Presiona Enter o espacio para agregar al carrito')}`;
   return `<article class="materia-card estado-${ev.clase}${enCarrito?' en-carrito':''}${bloq?' bloqueada':''}" data-id="${esc(m.id_materia)}" data-bloqueada="${bloq?'true':'false'}" draggable="${bloq?'false':'true'}" tabindex="0" role="button" aria-pressed="${enCarrito?'true':'false'}" aria-disabled="${bloq?'true':'false'}" aria-label="${esc(etiqueta)}">
    <div class="materia-card-top"><span class="chip chip-codigo">${esc(m.id_materia)}</span>${bloq?'<span class="materia-card-candado" title="Materia bloqueada por requisito" aria-hidden="true">🔒 Bloqueada</span>':''}<span class="materia-card-creditos">${esc(m.creditos)} créditos</span><span class="materia-card-marca" aria-hidden="true">${enCarrito?'✓':''}</span></div>
    <strong class="materia-card-nombre">${esc(m.nombre_curso)}</strong>
    <div class="materia-card-datos">
     <div class="materia-dato"><span class="materia-dato-et">Tipo</span><span class="materia-dato-val ${m.obligatoria?'dato-obligatoria':'dato-electiva'}">${m.obligatoria?'Obligatoria':'Electiva'}</span></div>
     <div class="materia-dato"><span class="materia-dato-et">Horario</span><span class="materia-dato-val">${esc(formatoHorario(m))}</span></div>
    </div>
    <div class="materia-card-pie">
     <div class="materia-card-estado"><span class="estado-punto" aria-hidden="true"></span><span>${esc(ev.texto)}</span>${bloq&&faltan?`<span class="requisito-falta">Falta: ${esc(faltan)}</span>`:''}</div>
     <span class="materia-card-cta" aria-hidden="true">${bloq?'🔒 Bloqueada':(enCarrito?'✓ En carrito':'+ Agregar')}</span>
    </div>
   </article>`;
  };
  const itemLista=m=>{
   const ev=estadoMateria(m),bloq=ev.clase==='bloqueada',enCarrito=!bloq&&carrito.has(m.id_materia),faltan=ev.faltan.join(', ');
   return `<label class="carrito-item${bloq?' bloqueada':''}"${bloq?' title="Materia bloqueada por requisito"':''}><input type="checkbox" value="${esc(m.id_materia)}" data-creditos="${esc(m.creditos)}"${enCarrito?' checked':''}${bloq?' disabled aria-disabled="true"':''}><span class="carrito-info"><span class="carrito-nombre">${esc(m.nombre_curso)}</span><span class="carrito-meta"><span class="chip">${esc(m.id_materia)}</span><span class="chip chip-creditos">${esc(m.creditos)} créditos</span><span class="chip">${esc(m.cupos)} cupos</span><span class="chip">${esc(formatoHorario(m))}</span><span class="chip chip-semestre">Semestre ${esc(m.semestre)}</span><span class="chip ${m.obligatoria?'chip-obligatoria':'chip-electiva'}">${m.obligatoria?'Obligatoria':'Electiva'}</span><span class="chip chip-estado-${ev.clase}">${bloq?'🔒 ':''}${esc(ev.texto)}</span>${bloq?`<span class="requisito-falta">Falta: ${esc(faltan||'requisito')}</span>`:''}</span></span></label>`;
  };
  const tablero=semestres.map(n=>{
   const lista=materias.filter(m=>semestreDe(m)===n);
   return `<section class="tablero-columna"><header class="tablero-columna-cab"><h3>${n?`Semestre ${n}`:'Sin semestre'}</h3><span class="count">${lista.length} ${lista.length===1?'materia':'materias'}</span></header><div class="tablero-cards">${lista.map(tarjeta).join('')}</div></section>`;
  }).join('');
  const opciones=materias.map(itemLista).join('');
  // Periodos para "Mi matrícula del periodo": de más reciente a más antiguo
  const periodosGuardada=[...(periodos||[])].sort((a,b)=>String(b.fecha_inicio||'').localeCompare(String(a.fecha_inicio||''))||clavePeriodo(b.periodo)-clavePeriodo(a.periodo));
  if(!periodoGuardada||!periodosGuardada.some(p=>p.periodo===periodoGuardada))periodoGuardada=(periodoMatricula&&periodosGuardada.some(p=>p.periodo===periodoMatricula))?periodoMatricula:(periodosGuardada[0]?.periodo||null);
  const opcionesGuardada=periodosGuardada.map(p=>`<option value="${esc(p.periodo)}"${p.periodo===periodoGuardada?' selected':''}>${esc(p.periodo)}</option>`).join('');
  $('#view').innerHTML=`${franja([{etiqueta:'Materias disponibles',valor:materias.length},{etiqueta:'Créditos seleccionados',valor:'0 créditos',clase:'malo',id:'ind-creditos'}])}<section class="panel matricula-guardada" id="matricula-guardada"><div class="panel-top matricula-guardada-top"><div><h2>Mi matrícula del periodo</h2><p id="matricula-guardada-sub">Consultando tu matrícula guardada...</p></div>${opcionesGuardada?`<label class="selector-periodo" for="matricula-periodo"><span>Periodo</span><select id="matricula-periodo" aria-label="Periodo de la matrícula guardada">${opcionesGuardada}</select></label>`:''}</div><div class="matricula-guardada-cuerpo" id="matricula-guardada-cuerpo">${vacio('⏳','Cargando tu matrícula','Un momento, consultamos las materias registradas en el periodo.')}</div></section><section class="panel matricular-panel"><div class="panel-top matricular-top"><div><h2>Materias de tu plan de estudios</h2><p>${materias.length?'Elige por semestre en el tablero. Arrastra una tarjeta a "Tu carrito" o haz clic en ella.':'Materias del plan de tu programa.'}</p></div>${materias.length?`<div class="vista-switch" role="group" aria-label="Vista de materias"><button type="button" data-vista="tablero" class="${vistaMaterias==='tablero'?'activo':''}" aria-pressed="${vistaMaterias==='tablero'}">▦ Tablero</button><button type="button" data-vista="lista" class="${vistaMaterias==='lista'?'activo':''}" aria-pressed="${vistaMaterias==='lista'}">☰ Lista</button></div>`:''}</div>${materias.length?`<div class="matricular-cuerpo"><div class="vista-tablero" id="vista-tablero"${vistaMaterias==='tablero'?'':' hidden'}><div class="tablero-wrap"><div class="tablero-columnas">${tablero}</div><aside class="carrito-zona" id="carrito-zona" aria-label="Tu carrito"><div class="carrito-zona-cab"><h3>Tu carrito</h3><span class="carrito-cuenta" id="carrito-cuenta">0</span></div><div class="carrito-zona-lista" id="carrito-zona-lista"></div><p class="carrito-pista">Entre 6 y 19 créditos en total para confirmar.</p></aside></div></div><div class="vista-lista" id="vista-lista"${vistaMaterias==='lista'?'':' hidden'}><div class="carrito">${opciones}</div></div></div>`:vacio('▥','Tu programa aún no tiene plan de estudios cargado','Cuando tu programa cargue su plan de estudios, las materias aparecerán aquí para armar tu matrícula.')}<div class="panel-top matricular-pie"><div><h2 id="total-creditos">Total: 0 créditos</h2><p class="muted" id="periodo-matricula">${periodoMatricula?`Periodo ${esc(periodoMatricula)} · entre 6 y 19 créditos`:'No hay un periodo de matrícula abierto'}</p></div><button id="confirmar-carrito" disabled>Matricular selección</button></div></section>`;
  const selGuardada=$('#matricula-periodo');
  if(selGuardada)selGuardada.onchange=e=>{periodoGuardada=e.target.value;pintaMatriculaGuardada(materias,periodos,periodoMatricula);};
  const seleccionadas=()=>materias.filter(m=>carrito.has(m.id_materia));
  const total=()=>seleccionadas().reduce((s,m)=>s+Number(m.creditos||0),0);
  const pintaTotal=()=>{
   const t=total(),enRango=t>=6&&t<=19;
   const el=$('#total-creditos');if(el){el.textContent=`Total: ${t} créditos`;el.style.color=enRango?'#2E8B57':'#b02a37';}
   const ind=$('#ind-creditos');if(ind){ind.textContent=`${t} créditos`;const caja=ind.closest('.indicador');if(caja){caja.classList.toggle('ok',enRango);caja.classList.toggle('malo',!enRango);}}
   const btn=$('#confirmar-carrito');if(btn)btn.disabled=!enRango||!periodoMatricula;
  };
  const pintaCarrito=()=>{
   const lista=$('#carrito-zona-lista'),cuenta=$('#carrito-cuenta');
   if(!lista)return;
   const elegidas=seleccionadas();
   if(cuenta)cuenta.textContent=String(elegidas.length);
   lista.innerHTML=elegidas.length?elegidas.map(m=>`<div class="carrito-mini"><div class="carrito-mini-info"><span class="chip">${esc(m.id_materia)}</span><strong>${esc(m.nombre_curso)}</strong><span class="carrito-mini-meta">${esc(m.creditos)} créditos · ${esc(formatoHorario(m))}</span></div><button type="button" class="carrito-quitar" data-quitar="${esc(m.id_materia)}" aria-label="Quitar ${esc(m.nombre_curso)} del carrito" title="Quitar">✕</button></div>`).join(''):'<div class="carrito-vacio"><strong>Aún no has agregado materias</strong><span>Haz clic en una tarjeta o arrástrala hasta aquí.</span></div>';
   lista.querySelectorAll('[data-quitar]').forEach(b=>b.onclick=e=>{e.stopPropagation();carrito.delete(b.dataset.quitar);sincronizar();});
  };
  const actualizarCruces=()=>{
   const dentro=seleccionadas();
   document.querySelectorAll('.materia-card').forEach(card=>{
    const m=porId.get(card.dataset.id);if(!m)return;
    card.classList.toggle('cruce',dentro.some(x=>x.id_materia!==m.id_materia&&hayCruceHorario(x,m)));
   });
   document.querySelectorAll('.carrito-item').forEach(label=>{
    const m=porId.get(label.querySelector('input')?.value);if(!m)return;
    label.classList.toggle('cruce',dentro.some(x=>x.id_materia!==m.id_materia&&hayCruceHorario(x,m)));
   });
  };
  const sincronizar=()=>{
   document.querySelectorAll('.carrito-item input').forEach(c=>{c.checked=!c.disabled&&carrito.has(c.value);});
   document.querySelectorAll('.materia-card').forEach(card=>{
    const m=porId.get(card.dataset.id);if(!m)return;
    const bloq=esMateriaBloqueada(m),on=!bloq&&carrito.has(card.dataset.id);
    card.classList.toggle('en-carrito',on);
    card.setAttribute('aria-pressed',on?'true':'false');
    const marca=card.querySelector('.materia-card-marca');
    if(marca)marca.textContent=on?'✓':'';
    const cta=card.querySelector('.materia-card-cta');
    if(cta)cta.textContent=bloq?'🔒 Bloqueada':(on?'✓ En carrito':'+ Agregar');
   });
   actualizarCruces();
   pintaCarrito();
   pintaTotal();
  };
  const alternar=id=>{
   const m=porId.get(id);if(!m)return;
   if(esMateriaBloqueada(m)){avisoBloqueo(m);return;}
   if(carrito.has(id))carrito.delete(id);else carrito.add(id);
   sincronizar();
  };
  document.querySelectorAll('.carrito-item input').forEach(c=>c.onchange=()=>{
   const m=porId.get(c.value);
   if(!m||esMateriaBloqueada(m)){c.checked=false;if(m)avisoBloqueo(m);return;}
   if(c.checked)carrito.add(c.value);else carrito.delete(c.value);
   sincronizar();
  });
  document.querySelectorAll('.materia-card').forEach(card=>{
   card.onclick=()=>alternar(card.dataset.id);
   card.onkeydown=e=>{
    if(e.key==='Enter'||e.key===' '||e.key==='Spacebar'){e.preventDefault();alternar(card.dataset.id);}
   };
   card.ondragstart=e=>{
    const m=porId.get(card.dataset.id);
    if(!m||esMateriaBloqueada(m)){e.preventDefault();return;}
    e.dataTransfer.setData('text/plain',card.dataset.id);
    e.dataTransfer.effectAllowed='copy';
    card.classList.add('arrastrando');
    const zona=$('#carrito-zona');if(zona)zona.classList.add('drop-preparado');
   };
   card.ondragend=()=>{
    card.classList.remove('arrastrando');
    const zona=$('#carrito-zona');if(zona)zona.classList.remove('drop-preparado','drop-activo');
   };
  });
  const zona=$('#carrito-zona');
  if(zona){
   zona.ondragover=e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';zona.classList.add('drop-activo');};
   zona.ondragleave=()=>zona.classList.remove('drop-activo');
   zona.ondrop=e=>{
    e.preventDefault();zona.classList.remove('drop-activo');
    const id=e.dataTransfer.getData('text/plain'),m=porId.get(id);
    if(!m)return;
    if(esMateriaBloqueada(m)){avisoBloqueo(m);return;}
    if(carrito.has(id)){notice('Esa materia ya está en tu carrito.');return;}
    carrito.add(id);sincronizar();
    notice(`${m.nombre_curso} agregada al carrito.`,true);
   };
  }
  const botonesVista=[...document.querySelectorAll('.vista-switch [data-vista]')];
  const aplicarVista=(animar=true)=>{
   botonesVista.forEach(b=>{const on=b.dataset.vista===vistaMaterias;b.classList.toggle('activo',on);b.setAttribute('aria-pressed',on?'true':'false');});
   const tablaEl=$('#vista-tablero'),listaEl=$('#vista-lista');
   if(tablaEl)tablaEl.hidden=vistaMaterias!=='tablero';
   if(listaEl)listaEl.hidden=vistaMaterias!=='lista';
   if(animar)animaLlegada(vistaMaterias==='tablero'?tablaEl:listaEl);
  };
  botonesVista.forEach(b=>b.onclick=()=>{vistaMaterias=b.dataset.vista;aplicarVista();});
  $('#confirmar-carrito').onclick=async()=>{
   const seleccion=seleccionadas();
   const bloqueadas=seleccion.filter(esMateriaBloqueada);
   if(bloqueadas.length){
    bloqueadas.forEach(m=>carrito.delete(m.id_materia));
    sincronizar();
    notice(`Quita las materias bloqueadas por requisito: ${bloqueadas.map(m=>m.nombre_curso).join(', ')}.`);
    return;
   }
   if(!periodoMatricula){notice('No hay un periodo de matrícula abierto en este momento.');return;}
   // 7C: detectar cruce de horario antes de enviar (misma regla del backend)
   const conHorario=seleccion.filter(m=>m.dia&&m.hora_inicio&&m.hora_fin);
   for(let i=0;i<conHorario.length;i++){
    for(let j=i+1;j<conHorario.length;j++){
     const a=conHorario[i],b=conHorario[j];
     if(hayCruceHorario(a,b)){
      notice(`Cruce de horario: '${a.nombre_curso}' (${a.id_materia}) y '${b.nombre_curso}' (${b.id_materia}) el ${a.dia}. Quita una para continuar.`);
      return;
     }
    }
   }
   try{
    const res=await apiAuth('/matriculas/lote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cedula:SESION.id_persona,periodo:periodoMatricula,id_materias:seleccion.map(m=>m.id_materia)})});
    notice(`Matrícula confirmada: ${res.matriculas.length} materias, ${res.total_creditos} créditos.`,true);
    carrito.clear();await vistaMatricular();
   }catch(error){notice(mensajeRol(error));}
  };
  sincronizar();
  aplicarVista(false);
  pintaMatriculaGuardada(materias,periodos,periodoMatricula);
  animaLlegada($('#view'));
 }catch(error){$('#view').innerHTML=vacio('⚠','No se pudieron cargar las materias',mensajeRol(error));}
}

// ====== Estudiante: Mi matrícula del periodo (guardada, editable solo antes de fecha_inicio) ======
async function pintaMatriculaGuardada(materias,periodos,periodoMatricula){
 const cuerpo=$('#matricula-guardada-cuerpo');if(!cuerpo)return;
 const sub=$('#matricula-guardada-sub');
 const ordenados=[...(periodos||[])].sort((a,b)=>String(b.fecha_inicio||'').localeCompare(String(a.fecha_inicio||''))||clavePeriodo(b.periodo)-clavePeriodo(a.periodo));
 if(!ordenados.length){
  if(sub)sub.textContent='No hay periodos configurados.';
  cuerpo.innerHTML=vacio('⏱','No hay periodos configurados','Cuando el administrador cree periodos, aquí verás tu matrícula guardada.');
  animaLlegada(cuerpo);return;
 }
 if(!periodoGuardada||!ordenados.some(p=>p.periodo===periodoGuardada))periodoGuardada=(periodoMatricula&&ordenados.some(p=>p.periodo===periodoMatricula))?periodoMatricula:ordenados[0].periodo;
 const seleccionado=periodoGuardada;
 const sel=$('#matricula-periodo');if(sel&&sel.value!==seleccionado)sel.value=seleccionado;
 cuerpo.innerHTML=vacio('⏳','Cargando tu matrícula','Un momento, consultamos las materias registradas en el periodo.');
 let datos=null;
 try{datos=await apiAuth(`/estudiantes/${encodeURIComponent(SESION.id_persona)}/matriculas?periodo=${encodeURIComponent(seleccionado)}`);}
 catch(error){
  if(current!=='matricular')return;
  cuerpo.innerHTML=vacio('⚠','No se pudo cargar tu matrícula',mensajeRol(error));
  animaLlegada(cuerpo);return;
 }
 if(current!=='matricular'||!SESION||periodoGuardada!==seleccionado)return;
 const meta=ordenados.find(p=>p.periodo===seleccionado)||{};
 const hoy=new Date();
 const empieza=meta.fecha_inicio?new Date(meta.fecha_inicio+'T00:00:00'):null;
 const termina=meta.fecha_fin?new Date(meta.fecha_fin+'T23:59:59'):null;
 const noEmpezado=!!(empieza&&hoy<empieza);
 const terminado=!!(termina&&hoy>termina);
 const guardadas=datos.materias||[];
 const totalCreditos=guardadas.reduce((s,m)=>s+Number(m.creditos||0),0);
 if(sub)sub.textContent=guardadas.length?`${guardadas.length} ${guardadas.length===1?'materia registrada':'materias registradas'} · ${totalCreditos} créditos${noEmpezado?' · el periodo aún no comienza: puedes editarla':(terminado?' · periodo terminado, solo lectura':' · periodo en curso, solo lectura')}`:'Sin matrícula en este periodo.';
 if(!guardadas.length){
  cuerpo.innerHTML=vacio('▤','No tienes matrícula registrada en este periodo','Cuando confirmes una matrícula en este periodo, la verás aquí.');
  animaLlegada(cuerpo);return;
 }
 const idsGuardadas=guardadas.map(m=>m.id_materia);
 const anchor=guardadas[0].id_matricula;
 const claseEstado=e=>e==='Aprobada'?'estado-aprobada':e==='Reprobada'?'estado-reprobada':e==='Sin nota'?'estado-sin-nota':'estado-cursando';
 const tarjeta=m=>`<article class="materia-card ${claseEstado(m.estado)}"><div class="materia-card-top"><span class="chip chip-codigo">${esc(m.id_materia)}</span><span class="materia-card-creditos">${esc(m.creditos)} créditos</span></div><strong class="materia-card-nombre">${esc(m.nombre_curso)}</strong><div class="materia-card-pie"><div class="materia-card-estado"><span class="estado-punto" aria-hidden="true"></span><span>${esc(m.estado||'—')}</span></div>${noEmpezado?`<button type="button" class="btn-quitar-materia" data-id="${esc(m.id_materia)}" data-nombre="${esc(m.nombre_curso)}">Quitar</button>`:`<span class="materia-card-cta" aria-hidden="true">Solo lectura</span>`}</div></article>`;
 const agregables=(materias||[]).filter(m=>!idsGuardadas.includes(m.id_materia)&&estadoMateria(m).clase!=='bloqueada');
 const opcionesAgregar=agregables.map(m=>`<option value="${esc(m.id_materia)}">${esc(m.id_materia)} · ${esc(m.nombre_curso)} (${esc(m.creditos)} créditos)</option>`).join('');
 const acciones=noEmpezado?`<div class="matricula-guardada-acciones"><label class="selector-periodo" for="agregar-materia"><span>Agregar materia</span><select id="agregar-materia" aria-label="Materia para agregar"${opcionesAgregar?'':' disabled'}>${opcionesAgregar||'<option value="">No quedan materias del plan por agregar</option>'}</select></label><button type="button" class="btn-agregar-materia" id="btn-agregar-materia"${opcionesAgregar?'':' disabled'}>Agregar</button><button type="button" class="btn-eliminar-matricula" id="btn-eliminar-matricula">Eliminar matrícula</button><p class="matricula-guardada-pista">Los cambios reemplazan tu matrícula guardada y se aplican porque el periodo aún no comienza.</p></div>`:'';
 cuerpo.innerHTML=`<div class="matricula-guardada-cards">${guardadas.map(tarjeta).join('')}</div>${acciones}`;
 const guardarMaterias=async(nuevasIds,mensajeOk)=>{
  try{
   const res=await apiAuth(`/matriculas/${encodeURIComponent(anchor)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id_materias:nuevasIds})});
   notice(`${mensajeOk}: ${res.materias.length} ${res.materias.length===1?'materia':'materias'}, ${res.total_creditos} créditos.`,true);
   await vistaMatricular();
  }catch(error){notice(error.status===409?error.message:mensajeRol(error));}
 };
 cuerpo.querySelectorAll('.btn-quitar-materia').forEach(b=>b.onclick=()=>guardarMaterias(idsGuardadas.filter(id=>id!==b.dataset.id),`'${b.dataset.nombre}' quitada`));
 const btnAgregar=$('#btn-agregar-materia');
 if(btnAgregar&&!btnAgregar.disabled)btnAgregar.onclick=()=>{
  const id=$('#agregar-materia')?.value;
  if(!id){notice('Elige una materia para agregar.');return;}
  guardarMaterias([...idsGuardadas,id],'Materia agregada');
 };
 const btnEliminar=$('#btn-eliminar-matricula');
 if(btnEliminar)btnEliminar.onclick=async()=>{
  btnEliminar.disabled=true;btnEliminar.textContent='Eliminando…';
  try{
   for(const m of guardadas)await apiAuth(`/matriculas/${encodeURIComponent(m.id_matricula)}`,{method:'DELETE'});
   notice('Matrícula eliminada del periodo.',true);
   await vistaMatricular();
  }catch(error){
   notice(error.status===409?error.message:mensajeRol(error));
   await vistaMatricular();
  }
 };
 animaLlegada(cuerpo);
}

// ====== Estudiante: Mis notas ======
let filtroNotaMateria='',filtroNotaPeriodo=''; // filtros solo en memoria
async function vistaMisNotas(){
 $('#refresh').hidden=false;
 $('#view').innerHTML=vacio('⏳','Cargando notas','Un momento, consultamos tus calificaciones.');
 try{
  const [notas,matriculas,materias]=await Promise.all([apiAuth('/notas/'),apiAuth('/matriculas/'),api('/materias/')]);
  if(current!=='misnotas')return;
  if(!notas.length){$('#view').innerHTML=vacio('✎','Aún no tienes notas registradas','Cuando tus profesores registren calificaciones, las verás aquí.');animaLlegada($('#view'));return;}
  const nombreMateria=id=>{const m=(materias||[]).find(x=>x.id_materia===id);return m?m.nombre_curso:id;};
  // El periodo de cada nota sale de su matrícula (GET /matriculas/ del propio estudiante)
  const periodoDe=idMatricula=>{const m=(matriculas||[]).find(x=>x.id_matricula===idMatricula);return m?m.periodo:null;};
  const conPeriodo=notas.map(n=>({...n,periodo:periodoDe(n.id_matricula)}));
  const materiasNotas=[...new Set(conPeriodo.map(n=>n.id_materia))].sort((a,b)=>String(a).localeCompare(String(b),'es'));
  const periodosNotas=[...new Set(conPeriodo.map(n=>n.periodo).filter(Boolean))].sort((a,b)=>clavePeriodo(b)-clavePeriodo(a));
  if(filtroNotaMateria&&!materiasNotas.includes(filtroNotaMateria))filtroNotaMateria='';
  if(filtroNotaPeriodo&&!periodosNotas.includes(filtroNotaPeriodo))filtroNotaPeriodo='';
  const opcionesMateria=`<option value="">Todas</option>${materiasNotas.map(m=>`<option value="${esc(m)}"${m===filtroNotaMateria?' selected':''}>${esc(m)} · ${esc(nombreMateria(m))}</option>`).join('')}`;
  const opcionesPeriodo=`<option value="">Todos</option>${periodosNotas.map(p=>`<option value="${esc(p)}"${p===filtroNotaPeriodo?' selected':''}>${esc(p)}</option>`).join('')}`;
  $('#view').innerHTML=`${franja([{etiqueta:'Materias con nota',valor:conPeriodo.length,id:'ind-nota-materias'},{etiqueta:'Actividades calificadas',valor:0,id:'ind-nota-actividades'},{etiqueta:'Promedio de definitivas',valor:'—',id:'ind-nota-promedio'}])}<section class="panel"><div class="filtros-vista"><label class="filtro-facultad" for="filtro-nota-materia"><span>Materia</span><select id="filtro-nota-materia" aria-label="Filtrar notas por materia">${opcionesMateria}</select></label><label class="filtro-facultad" for="filtro-nota-periodo"><span>Periodo</span><select id="filtro-nota-periodo" aria-label="Filtrar notas por periodo">${opcionesPeriodo}</select></label></div><div class="table-wrap"><table><thead><tr><th>ID</th><th>Materia</th><th>N1</th><th>N2</th><th>N3</th><th>Definitiva</th><th>Estado</th></tr></thead><tbody id="tabla-notas"></tbody></table></div></section><section class="panel"><div class="panel-top"><div><h2>Calificaciones por actividad</h2><p>Talleres, quizzes, exámenes y trabajos que ya calificaron tus profesores</p></div></div><div id="actividades-notas"></div></section>`;
  const aplicar=()=>{
   const selM=$('#filtro-nota-materia'),selP=$('#filtro-nota-periodo');
   if(selM)filtroNotaMateria=selM.value;
   if(selP)filtroNotaPeriodo=selP.value;
   const filtradas=conPeriodo.filter(n=>(!filtroNotaMateria||n.id_materia===filtroNotaMateria)&&(!filtroNotaPeriodo||n.periodo===filtroNotaPeriodo));
   const conDefinitiva=filtradas.filter(n=>n.definitiva!=null);
   const promedio=conDefinitiva.length?(conDefinitiva.reduce((s,n)=>s+Number(n.definitiva),0)/conDefinitiva.length).toFixed(2):'—';
   // Actividades por materia: la API repite la lista en cada nota de la misma
   // materia (una por matrícula), así que se toma una sola vez por materia.
   const porMateria={};
   filtradas.forEach(n=>{if(!porMateria[n.id_materia])porMateria[n.id_materia]=Array.isArray(n.actividades)?n.actividades:[];});
   const totalActividades=Object.values(porMateria).reduce((s,lista)=>s+lista.length,0);
   $('#ind-nota-materias').textContent=String(filtradas.length);
   $('#ind-nota-actividades').textContent=String(totalActividades);
   $('#ind-nota-promedio').textContent=promedio;
   $('#tabla-notas').innerHTML=filtradas.length?filtradas.map(n=>`<tr><td>${n.id_nota==null?'—':`<span class="id">${esc(n.id_nota)}</span>`}</td><td>${esc(n.id_materia)}${n.calculada?' <span class="chip chip-calculada">Calculada</span>':''}</td><td>${n.nota1??'—'}</td><td>${n.nota2??'—'}</td><td>${n.nota3??'—'}</td><td><b>${n.definitiva??'—'}</b></td><td>${esc(n.estado||'Sin notas')}</td></tr>`).join(''):`<tr><td colspan="7" class="sin-datos">Sin notas en esta selección. Cambia la materia o el periodo.</td></tr>`;
   $('#actividades-notas').innerHTML=Object.keys(porMateria).length?Object.entries(porMateria).map(([materia,actividades])=>`<section class="grupo-vista"><h3>${esc(materia)} · ${esc(nombreMateria(materia))}<span class="count">${actividades.length} ${actividades.length===1?'actividad calificada':'actividades calificadas'}</span></h3>${actividades.length?`<div class="actividades-grupo-lista">${actividades.map(a=>`<article class="actividad-item"><div><strong>${esc(a.titulo)}</strong><span class="tarea-meta"><span class="chip">${esc(materia)}</span>${chipTipo(a.tipo)}<span class="chip">Calificada: ${esc(formatFecha(a.subida_en))}</span></span></div><span class="chip chip-calif">Nota: ${Number(a.calificacion).toFixed(1)}</span></article>`).join('')}</div>`:'<p class="sin-actividades">Sin actividades calificadas en esta selección</p>'}</section>`).join(''):vacio('⌕','Sin notas en esta selección','Cambia la materia o el periodo para ver tus actividades.');
  };
  $('#filtro-nota-materia').onchange=aplicar;
  $('#filtro-nota-periodo').onchange=aplicar;
  aplicar();
  animaLlegada($('#view'));
 }catch(error){$('#view').innerHTML=vacio('⚠','No se pudieron cargar tus notas',mensajeRol(error));}
}

// ====== Estudiante: Registro académico por periodo (solo lectura) ======
let periodoRegistro=null; // estado solo en memoria
const clavePeriodo=p=>{const m=String(p??'').match(/(\d{4})\D*(\d+)/);return m?Number(m[1])*100+Number(m[2]):0;};
function notaRegistro(valor){
 const n=Number(valor);
 return valor==null||valor===''||Number.isNaN(n)?null:n;
}
function formatoNotaRegistro(valor,decimales){
 const n=notaRegistro(valor);
 return n==null?'—':n.toFixed(decimales);
}
function estadoRegistroAcademico(materia,periodoAbierto){
 if(periodoAbierto)return 'Cursando';
 const nota=notaRegistro(materia.nota_final??materia.calificacion);
 if(nota==null)return 'Sin nota';
 return nota>=3?'Aprobada':'Reprobada';
}
function chipEstadoRegistro(estado){
 const clase=estado==='Aprobada'?'estado-aprobada':estado==='Reprobada'?'estado-reprobada':estado==='Sin nota'?'estado-sin-nota':'estado-cursando';
 return `<span class="chip ${clase}">${esc(estado)}</span>`;
}
function filaRegistroAcademico(materia,periodoAbierto){
 const estado=estadoRegistroAcademico(materia,periodoAbierto);
 return `<tr><td><span class="id">${esc(materia.id_materia)}</span></td><td>${esc(materia.nombre_curso)}</td><td>${esc(materia.creditos)}</td><td>${formatoNotaRegistro(materia.calificacion,1)}</td><td>${formatoNotaRegistro(materia.nota_final,3)}</td><td>${chipEstadoRegistro(estado)}</td></tr>`;
}
function tarjetasRegistroAcademico(datos){
 const acumulado=notaRegistro(datos.promedio_acumulado);
 const situacion=acumulado==null?'—':(acumulado>=3?'Normal':'En riesgo');
 const clase=acumulado==null?'':(acumulado>=3?'ok':'malo');
 return `<section class="stats stats-registro" aria-label="Resumen del periodo"><div class="stat"><span>Promedio Semestre</span><strong>${formatoNotaRegistro(datos.promedio_semestre,2)}</strong><span>Ponderado por créditos</span></div><div class="stat"><span>Promedio Acumulado</span><strong>${formatoNotaRegistro(datos.promedio_acumulado,2)}</strong><span>Histórico del estudiante</span></div><div class="stat${clase?' '+clase:''}"><span>Situación Académica</span><strong>${esc(situacion)}</strong><span>${acumulado==null?'Sin promedio acumulado':'Umbral: 3.0'}</span></div></section>`;
}
async function vistaRegistroAcademico(){
 $('#refresh').hidden=false;
 if(SESION.rol!=='Estudiante'){$('#view').innerHTML=vacio('◫','No tienes permiso para esta acción','Inicia sesión con la cuenta de estudiante adecuada.');return;}
 $('#view').innerHTML=vacio('⏳','Cargando registro académico','Un momento, consultamos tus periodos, materias y promedios.');
 try{
  const [matriculas,periodos]=await Promise.all([apiAuth('/matriculas/'),api('/periodos/')]);
  if(current!=='registro')return;
  const conMatricula=new Set((matriculas||[]).map(m=>m.periodo).filter(Boolean));
  const porCodigo=new Map((periodos||[]).map(p=>[p.periodo,p]));
  // Se listan todos los periodos con matrículas; los que no están configurados
  // se muestran con un aviso en lugar de consultar un historial que fallaría.
  const disponibles=[...conMatricula].map(periodo=>{
   const meta=porCodigo.get(periodo);
   return {periodo,fecha_inicio:meta?.fecha_inicio||'',configurado:!!meta};
  }).sort((a,b)=>{
   const fa=a.fecha_inicio?String(a.fecha_inicio):'',fb=b.fecha_inicio?String(b.fecha_inicio):'';
   if(fa&&fb)return fb.localeCompare(fa);
   if(fa)return -1;
   if(fb)return 1;
   return clavePeriodo(b.periodo)-clavePeriodo(a.periodo);
  });
  if(!disponibles.length){
   $('#view').innerHTML=`<section class="panel"><div class="panel-top"><div><h2>Registro académico</h2><p>Consulta por periodo tus materias, calificaciones y promedios.</p></div></div>${vacio('▤','Aún no tienes materias registradas en este periodo','Cuando registres tu matrícula, aquí verás el detalle por periodo.')}</section>`;
   animaLlegada($('#view'));return;
  }
  if(!periodoRegistro||!disponibles.some(p=>p.periodo===periodoRegistro))periodoRegistro=disponibles[0].periodo;
  const seleccionado=periodoRegistro;
  const opcion=disponibles.find(p=>p.periodo===seleccionado);
  const opciones=disponibles.map(p=>`<option value="${esc(p.periodo)}"${p.periodo===seleccionado?' selected':''}>${esc(p.periodo)}</option>`).join('');
  if(!opcion?.configurado){
   $('#view').innerHTML=`<section class="registro-top"><div><p class="eyebrow">PERIODO ACADÉMICO</p><h2>${esc(seleccionado)}</h2><p>Periodo no configurado en el sistema.</p></div><label class="registro-select" for="registro-periodo"><span>Periodo</span><select id="registro-periodo">${opciones}</select></label></section>${tarjetasRegistroAcademico({promedio_semestre:null,promedio_acumulado:null})}<section class="panel"><div class="panel-top"><div><h2>Historial no disponible</h2><p>No se puede consultar este periodo.</p></div></div>${vacio('⚠','Periodo no configurado',`El periodo ${seleccionado} tiene matrículas, pero no está registrado en la configuración de periodos. No se puede consultar el historial.`)}</section>`;
   $('#registro-periodo').onchange=e=>{periodoRegistro=e.target.value;vistaRegistroAcademico();};
   animaLlegada($('#view'));return;
  }
  const datos=await apiAuth(`/estudiantes/${encodeURIComponent(SESION.id_persona)}/matriculas?periodo=${encodeURIComponent(seleccionado)}`);
  if(current!=='registro'||periodoRegistro!==seleccionado)return;
  const materias=datos.materias||[];
  const filas=materias.map(m=>filaRegistroAcademico(m,datos.periodo_abierto)).join('');
  const detallePeriodo=datos.periodo_abierto?'Periodo en curso: las materias figuran como Cursando.':'Periodo cerrado: el estado depende de la nota final.';
  $('#view').innerHTML=`<section class="registro-top"><div><p class="eyebrow">PERIODO ACADÉMICO</p><h2>${esc(datos.periodo)}</h2><p>${esc(detallePeriodo)}</p></div><label class="registro-select" for="registro-periodo"><span>Periodo</span><select id="registro-periodo">${opciones}</select></label></section>${tarjetasRegistroAcademico(datos)}<section class="panel"><div class="panel-top"><div><h2>Materias del periodo</h2><p>${materias.length} ${materias.length===1?'materia registrada':'materias registradas'} · vista de solo lectura</p></div></div>${materias.length?`<div class="table-wrap"><table class="tabla-registro"><thead><tr><th>ID Curso</th><th>Descripción</th><th>Créditos</th><th>Calif</th><th>Notas</th><th>Estado</th></tr></thead><tbody>${filas}</tbody></table></div>`:vacio('▤','Aún no tienes materias registradas en este periodo','Cuando registres tu matrícula, aquí verás el detalle de este periodo.')}</section>`;
  $('#registro-periodo').onchange=e=>{periodoRegistro=e.target.value;vistaRegistroAcademico();};
  animaLlegada($('#view'));
 }catch(error){
  if(current!=='registro')return;
  $('#view').innerHTML=vacio('⚠','No se pudo cargar el registro académico',mensajeRol(error));
  animaLlegada($('#view'));
 }
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
  const pintar=async()=>{
   const idMateria=$('#sel-materia').value;
   const deLaMateria=matriculas.filter(m=>m.id_materia===idMateria);
   // Sugerencia de N1/N2/N3 calculados desde las tareas con momento (V6):
   // es informativa y no cambia lo que el profesor escriba.
   let sugerencias={};
   try{sugerencias=Object.fromEntries((await apiAuth(`/notas/sugerencias/${encodeURIComponent(idMateria)}`)).map(s=>[s.cedula,s]));}catch(_){}
   const sugerido=(cedula,campo)=>{const v=sugerencias[cedula]?.[campo];return `<span class="sugerido">Sugerido: ${v==null?'—':Number(v).toFixed(2)}</span>`;};
   $('#estudiantes-notas').innerHTML=deLaMateria.length?`<div class="table-wrap"><table><thead><tr><th>Estudiante</th><th>Nota 1</th><th>Nota 2</th><th>Nota 3</th><th></th></tr></thead><tbody>${deLaMateria.map(m=>`<tr><td>${esc(m.cedula)}</td><td><input type="number" step="0.1" min="0" max="5" id="n1-${esc(m.id_matricula)}">${sugerido(m.cedula,'nota1')}</td><td><input type="number" step="0.1" min="0" max="5" id="n2-${esc(m.id_matricula)}">${sugerido(m.cedula,'nota2')}</td><td><input type="number" step="0.1" min="0" max="5" id="n3-${esc(m.id_matricula)}">${sugerido(m.cedula,'nota3')}</td><td><button class="guardar-nota" data-id="${esc(m.id_matricula)}">Guardar</button></td></tr>`).join('')}</tbody></table></div>`:vacio('♙','No hay estudiantes matriculados en esta materia','Cuando un estudiante la matricule, aparecerá aquí para calificarlo.');
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
  $('#view').innerHTML=`${franja([{etiqueta:'Tareas creadas',valor:tareas.length},{etiqueta:'Materias asignadas',valor:mias.length}])}<section class="panel"><div class="panel-top"><div><h2>Nueva tarea</h2><p>El tipo y los campos con * son obligatorios. Archivo de apoyo opcional: PDF, MP4 o WebM, máximo 20 MB</p></div></div><form id="form-tarea"><div class="fields"><div><label for="t-materia">Materia *</label><select id="t-materia" required>${opciones}</select></div><div><label for="t-tipo">Tipo de actividad *</label><select id="t-tipo" required>${TIPOS_TAREA.map(([valor,texto])=>`<option value="${valor}">${texto}</option>`).join('')}</select></div><div><label for="t-momento">Momento *</label><select id="t-momento" required>${[1,2,3].map(n=>`<option value="${n}">Momento ${n}</option>`).join('')}</select></div><div><label for="t-limite">Fecha y hora límite *</label><input id="t-limite" type="datetime-local" required></div><div class="campo-ancho"><label for="t-titulo">Título *</label><input id="t-titulo" type="text" maxlength="120" required placeholder="Taller 1 - Programación en Java"></div><div class="campo-ancho" id="t-archivo-campo"><label for="t-archivo">Archivo de apoyo (opcional)</label><input id="t-archivo" type="file" accept=".pdf,.mp4,.webm"><p class="error-archivo" id="t-archivo-error" role="alert"></p></div><div class="campo-ancho" id="t-sin-archivo-aviso" hidden><p class="ayuda-tipo">Esta actividad se califica directamente</p></div><div class="campo-ancho"><label for="t-desc">Descripción *</label><textarea id="t-desc" rows="3" required placeholder="Instrucciones, entregables y formato esperado"></textarea></div></div><p id="t-error" role="alert"></p><div class="form-actions"><button type="submit" id="t-crear">Crear tarea</button></div></form></section><section class="panel"><div class="panel-top"><div><h2>Tareas de tus materias</h2><p>Pulsa "Ver entregas" para ver quién entregó y quién no</p></div></div><div id="lista-tareas" class="lista-tareas"></div></section>`;
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
    fd.append('momento',$('#t-momento').value);
    if(archivo)fd.append('archivo',archivo);
    const creada=await apiAuth('/tareas/',{method:'POST',body:fd});
    notice(`Tarea creada: ${creada.titulo} (${creada.id_tarea}).`,true);
    await vistaTareas();
   }catch(error){$('#t-error').textContent=mensajeRol(error);btn.disabled=false;btn.textContent='Crear tarea';}
  };
  const pintarLista=()=>{
   const zona=$('#lista-tareas');
   if(!tareas.length){zona.innerHTML=vacio('❑','Aún no has creado tareas','Crea la primera con el formulario "Nueva tarea" de arriba.');return;}
   zona.innerHTML=tareas.map(t=>`<article class="tarea-item" data-id="${esc(t.id_tarea)}"><div class="tarea-cab"><div class="tarea-titulo"><strong>${esc(t.titulo)}</strong><span class="tarea-meta">${chipTipo(t.tipo)}${t.momento?`<span class="chip chip-momento">Momento ${t.momento}</span>`:''}<span class="chip">${esc(t.id_materia)}</span><span class="chip">${esc(t.materia||'')}</span><span class="chip">Límite: ${esc(formatFecha(t.fecha_limite))}</span>${t.tiene_apoyo?'<span class="chip">⇩ Con archivo de apoyo</span>':''}</span></div><div class="tarea-lado"><span class="chip chip-entregas">${t.entregas_recibidas??0} de ${t.matriculados??0} entregaron</span><button class="secondary ver-entregas" data-id="${esc(t.id_tarea)}" data-tipo="${esc(t.tipo||'taller')}">Ver entregas ▾</button></div></div><div class="tarea-detail" id="detalle-${esc(t.id_tarea)}" hidden></div></article>`).join('');
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
let filtroTareaMateria='',filtroTareaPeriodo=''; // filtros solo en memoria
async function vistaMisTareas(){
 $('#refresh').hidden=false;
 if(SESION.rol!=='Estudiante'){$('#view').innerHTML=vacio('🔒','No tienes permiso para esta acción','Inicia sesión con la cuenta de estudiante adecuada.');return;}
 $('#view').innerHTML=vacio('⏳','Cargando tareas','Un momento, consultamos las tareas de tus materias.');
 try{
  const [tareas,matriculas,periodos]=await Promise.all([apiAuth('/tareas/'),apiAuth('/matriculas/'),api('/periodos/')]);
  if(current!=='mistareas')return;
  if(!tareas.length){
   $('#view').innerHTML=`${franja([{etiqueta:'Tareas',valor:0},{etiqueta:'Entregadas',valor:0},{etiqueta:'Pendientes',valor:0},{etiqueta:'No entregó',valor:0}])}<section class="panel">${vacio('❑','No hay tareas en tus materias','Cuando tus profesores publiquen tareas, aparecerán aquí con su fecha límite.')}</section>`;
   animaLlegada($('#view'));return;
  }
  // Las tareas del endpoint son de las matrículas activas en periodos abiertos:
  // el periodo de cada tarea sale de esa matrícula (GET /matriculas/ propio).
  const hoy=new Date();
  const abiertos=new Set((periodos||[]).filter(p=>{const a=p.fecha_inicio?new Date(p.fecha_inicio+'T00:00:00'):null,b=p.fecha_fin?new Date(p.fecha_fin+'T23:59:59'):null;return a&&b&&hoy>=a&&hoy<=b;}).map(p=>p.periodo));
  const periodoMateria={};
  (matriculas||[]).forEach(m=>{if(m.estado==='Activa'&&abiertos.has(m.periodo))periodoMateria[m.id_materia]=m.periodo;});
  const conPeriodo=tareas.map(t=>({...t,periodo:periodoMateria[t.id_materia]||null}));
  const materiasTarea=[...new Set(conPeriodo.map(t=>t.id_materia))].sort((a,b)=>String(a).localeCompare(String(b),'es'));
  const periodosTarea=[...new Set(conPeriodo.map(t=>t.periodo).filter(Boolean))].sort((a,b)=>clavePeriodo(b)-clavePeriodo(a));
  if(filtroTareaMateria&&!materiasTarea.includes(filtroTareaMateria))filtroTareaMateria='';
  if(filtroTareaPeriodo&&!periodosTarea.includes(filtroTareaPeriodo))filtroTareaPeriodo='';
  const nombreDe=id=>{const t=conPeriodo.find(x=>x.id_materia===id);return t?(t.materia||id):id;};
  const opcionesMateria=`<option value="">Todas</option>${materiasTarea.map(m=>`<option value="${esc(m)}"${m===filtroTareaMateria?' selected':''}>${esc(m)} · ${esc(nombreDe(m))}</option>`).join('')}`;
  const opcionesPeriodo=`<option value="">Todos</option>${periodosTarea.map(p=>`<option value="${esc(p)}"${p===filtroTareaPeriodo?' selected':''}>${esc(p)}</option>`).join('')}`;
  $('#view').innerHTML=`${franja([{etiqueta:'Tareas',valor:tareas.length,id:'ind-tarea-total'},{etiqueta:'Entregadas',valor:0,id:'ind-tarea-entregadas'},{etiqueta:'Pendientes',valor:0,id:'ind-tarea-pendientes'},{etiqueta:'No entregó',valor:0,id:'ind-tarea-noentrego'}])}<section class="panel"><div class="panel-top"><div><h2>Tareas de tus materias</h2><p>Sube tu archivo antes de la fecha límite: PDF, MP4 o WebM, máximo 20 MB. En exámenes y quizzes el archivo es opcional</p></div></div><div class="filtros-vista"><label class="filtro-facultad" for="filtro-tarea-materia"><span>Materia</span><select id="filtro-tarea-materia" aria-label="Filtrar tareas por materia">${opcionesMateria}</select></label><label class="filtro-facultad" for="filtro-tarea-periodo"><span>Periodo</span><select id="filtro-tarea-periodo" aria-label="Filtrar tareas por periodo">${opcionesPeriodo}</select></label></div><div id="lista-mis-tareas" class="lista-tareas"></div></section>`;
  const itemMisTareas=t=>{
   const vigente=plazoVigente(t.fecha_limite);
   const claseEstado=t.estado_entrega==='Entregado'?'estado-entregado':t.estado_entrega==='Pendiente'?'estado-pendiente':'estado-no-entrego';
   const sinArchivo=TIPOS_SIN_ARCHIVO.includes(t.tipo||'taller');
   return `<article class="tarea-item" data-id="${esc(t.id_tarea)}"><div class="tarea-cab"><div class="tarea-titulo"><strong>${esc(t.titulo)}</strong><span class="tarea-meta">${chipTipo(t.tipo)}${t.momento?`<span class="chip chip-momento">Momento ${t.momento}</span>`:''}<span class="chip">${esc(t.id_materia)}</span><span class="chip">${esc(t.materia||'')}</span><span class="chip">Límite: ${esc(formatFecha(t.fecha_limite))}</span>${t.tiene_apoyo?`<button type="button" class="chip descarga-apoyo" data-id="${esc(t.id_tarea)}">⇩ Descargar apoyo</button>`:''}</span></div><div class="tarea-lado"><span class="chip ${claseEstado}">${esc(t.estado_entrega)}${t.estado_entrega==='Entregado'&&t.fecha_entrega?` · ${esc(formatFecha(t.fecha_entrega))}`:''}</span>${chipNota(t.calificacion)}${vigente?`<button type="button" class="subir-entrega" data-id="${esc(t.id_tarea)}">Subir entrega ⇧</button>`:''}</div></div>${vigente?`<form class="form-entrega" id="form-entrega-${esc(t.id_tarea)}" data-tipo="${esc(t.tipo||'taller')}" hidden><div class="fields"><div><label for="archivo-${esc(t.id_tarea)}">Tu archivo (PDF, MP4 o WebM, máx. 20 MB)${sinArchivo?' (opcional)':' *'}</label><input id="archivo-${esc(t.id_tarea)}" type="file" accept=".pdf,.mp4,.webm" ${sinArchivo?'':'required'}>${sinArchivo?'<p class="ayuda-tipo">Esta actividad se califica directamente</p>':''}<p class="error-archivo" role="alert"></p></div><div><label for="comentario-${esc(t.id_tarea)}">Comentario para el profesor (opcional)</label><input id="comentario-${esc(t.id_tarea)}" type="text" maxlength="300" placeholder="Ej. Adjunto el taller con capturas"></div></div><div class="form-actions"><button type="submit">Enviar entrega</button></div></form>`:''}</article>`;
  };
  const wireMisTareas=zona=>{
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
  };
  const aplicar=()=>{
   const selM=$('#filtro-tarea-materia'),selP=$('#filtro-tarea-periodo');
   if(selM)filtroTareaMateria=selM.value;
   if(selP)filtroTareaPeriodo=selP.value;
   const filtradas=conPeriodo.filter(t=>(!filtroTareaMateria||t.id_materia===filtroTareaMateria)&&(!filtroTareaPeriodo||t.periodo===filtroTareaPeriodo));
   const conteo={Entregado:0,Pendiente:0,'No entregó':0};
   filtradas.forEach(t=>{if(t.estado_entrega in conteo)conteo[t.estado_entrega]++;});
   $('#ind-tarea-total').textContent=String(filtradas.length);
   $('#ind-tarea-entregadas').textContent=String(conteo.Entregado);
   $('#ind-tarea-pendientes').textContent=String(conteo.Pendiente);
   $('#ind-tarea-noentrego').textContent=String(conteo['No entregó']);
   const zona=$('#lista-mis-tareas');
   if(!filtradas.length){zona.innerHTML=vacio('⌕','No hay tareas en esta selección','Cambia la materia o el periodo.');return;}
   // Con "Todas" la lista se agrupa por materia; con una materia, queda su único grupo.
   const grupos={};
   filtradas.forEach(t=>{(grupos[t.id_materia]??=[]).push(t);});
   zona.innerHTML=Object.keys(grupos).sort((a,b)=>String(a).localeCompare(String(b),'es')).map(m=>`<section class="grupo-vista"><h3>${esc(m)} · ${esc(nombreDe(m))}<span class="count">${grupos[m].length} ${grupos[m].length===1?'tarea':'tareas'}</span></h3>${grupos[m].map(itemMisTareas).join('')}</section>`).join('');
   wireMisTareas(zona);
  };
  $('#filtro-tarea-materia').onchange=aplicar;
  $('#filtro-tarea-periodo').onchange=aplicar;
  aplicar();
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
window.addEventListener('hashchange',()=>{const hash=location.hash.slice(1);const valido=navItems().some(([k])=>k===hash);const destino=valido?hash:'resumen';if(SESION&&destino!==current){const origen=current;planDe=null;current=destino;animarSeccion(destino,origen);}});
current='resumen';

