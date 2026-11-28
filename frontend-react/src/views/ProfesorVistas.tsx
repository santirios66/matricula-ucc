import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { get, getAuth, post, put, postForm, downloadArchivo } from '../api/client';
import type {
  Materia,
  Matricula,
  Nota,
  SugerenciaNota,
  Tarea,
  EntregasRespuesta,
  Estudiante,
} from '../api/types';

interface ProfesorProps {
  idProfesor: string;
}

const formatoFecha = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
};

// ====== 1. Ingresar y editar notas ======
export function IngresarNotas({ idProfesor }: ProfesorProps) {
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [matriculas, setMatriculas] = useState<Matricula[]>([]);
  const [notas, setNotas] = useState<Nota[]>([]);
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [sugerencias, setSugerencias] = useState<Record<string, SugerenciaNota>>({});
  const [idMateria, setIdMateria] = useState('');
  const [valores, setValores] = useState<Record<string, { n1: string; n2: string; n3: string }>>({});
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const [mats, matrics, ns, ests] = await Promise.all([
        get<Materia[]>('/materias/'),
        getAuth<Matricula[]>('/matriculas/'),
        getAuth<Nota[]>('/notas/'),
        get<Estudiante[]>('/estudiantes/'),
      ]);
      const mias = mats.filter((m) => m.id_profesor === idProfesor);
      setMaterias(mias);
      setMatriculas(matrics);
      setNotas(ns);
      setEstudiantes(ests);
      if (mias.length && !idMateria) setIdMateria(mias[0].id_materia);

      const mapa: Record<string, { n1: string; n2: string; n3: string }> = {};
      ns.forEach((n) => {
        if (!n.calculada) {
          mapa[n.id_matricula] = {
            n1: n.nota1 != null ? String(n.nota1) : '',
            n2: n.nota2 != null ? String(n.nota2) : '',
            n3: n.nota3 != null ? String(n.nota3) : '',
          };
        }
      });
      setValores(mapa);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las materias.');
    } finally {
      setCargando(false);
    }
  }, [idProfesor, idMateria]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (!idMateria) return;
    getAuth<SugerenciaNota[]>(`/notas/sugerencias/${encodeURIComponent(idMateria)}`)
      .then((lista) => {
        const mapa: Record<string, SugerenciaNota> = {};
        lista.forEach((s) => { mapa[s.cedula] = s; });
        setSugerencias(mapa);
      })
      .catch(() => setSugerencias({}));
  }, [idMateria]);

  const deLaMateria = matriculas.filter((m) => m.id_materia === idMateria);
  const nombreEstudiante = (ced: string) => {
    const e = estudiantes.find((x) => x.id_estudiante === ced);
    return e ? `${e.nombre} ${e.apellidos}` : ced;
  };

  const cambiarNota = (idMat: string, campo: 'n1' | 'n2' | 'n3', valor: string) => {
    setValores((prev) => ({
      ...prev,
      [idMat]: { ...(prev[idMat] || { n1: '', n2: '', n3: '' }), [campo]: valor },
    }));
  };

  const guardar = async (m: Matricula) => {
    setAviso('');
    setError('');
    const fila = valores[m.id_matricula] || { n1: '', n2: '', n3: '' };
    const n1 = parseFloat(fila.n1);
    const n2 = parseFloat(fila.n2);
    const n3 = parseFloat(fila.n3);
    if ([n1, n2, n3].some((n) => Number.isNaN(n) || n < 0 || n > 5)) {
      setError('Las tres notas deben estar entre 0.0 y 5.0.');
      return;
    }
    const existente = notas.find((n) => n.id_matricula === m.id_matricula && n.id_nota && !n.calculada);
    try {
      if (existente && existente.id_nota) {
        const res = await put<Nota>(`/notas/${encodeURIComponent(existente.id_nota)}`, {
          nota1: n1,
          nota2: n2,
          nota3: n3,
        });
        setAviso(`Nota actualizada (${m.cedula}): definitiva ${res.definitiva} · ${res.estado}`);
      } else {
        const res = await post<Nota>('/notas/', { id_matricula: m.id_matricula, nota1: n1, nota2: n2, nota3: n3 }, true);
        setAviso(`Nota guardada (${m.cedula}): definitiva ${res.definitiva} · ${res.estado}`);
      }
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la nota.');
    }
  };

  if (cargando) {
    return (
      <div className="stat-grid">
        {[...Array(2)].map((_, i) => <div key={i} className="stat-card skeleton" style={{ minHeight: 120 }} />)}
      </div>
    );
  }

  return (
    <>
      {error && <p className="login-error">{error}</p>}
      {aviso && (
        <p className="login-error" style={{ background: 'var(--teal-soft)', borderColor: 'var(--teal-border)', color: 'var(--teal)' }}>
          {aviso}
        </p>
      )}

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">Materias asignadas</span>
          <span className="stat-value">{materias.length}</span>
          <span className="section-sub">Cursos bajo tu cargo</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Estudiantes en la materia</span>
          <span className="stat-value">{deLaMateria.length}</span>
          <span className="section-sub">Con matrícula registrada</span>
        </div>
      </div>

      <div className="filtros-row">
        <label className="registro-select">
          <span>Materia</span>
          <select
            value={idMateria}
            onChange={(e) => setIdMateria(e.target.value)}
            className="input-field"
            style={{ width: 260 }}
          >
            {materias.map((m) => (
              <option key={m.id_materia} value={m.id_materia}>
                {m.id_materia} · {m.nombre_curso}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Estudiante</th>
              <th>Periodo</th>
              <th>Nota 1</th>
              <th>Nota 2</th>
              <th>Nota 3</th>
              <th>Definitiva</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {deLaMateria.map((m) => {
              const v = valores[m.id_matricula] || { n1: '', n2: '', n3: '' };
              const sug = sugerencias[m.cedula];
              const notaActual = notas.find((n) => n.id_matricula === m.id_matricula);
              return (
                <tr key={m.id_matricula}>
                  <td>
                    <span className="chip teal">{m.cedula}</span>
                    <span style={{ marginLeft: 8, fontWeight: 600 }}>{nombreEstudiante(m.cedula)}</span>
                  </td>
                  <td><span className="chip">{m.periodo}</span></td>
                  {(['n1', 'n2', 'n3'] as const).map((campo, idx) => {
                    const sugKey = (`nota${idx + 1}`) as 'nota1' | 'nota2' | 'nota3';
                    const sugVal = sug?.[sugKey];
                    return (
                      <td key={campo}>
                        <input
                          type="number"
                          min="0"
                          max="5"
                          step="0.1"
                          className="input-field"
                          style={{ width: 88, padding: '8px 10px' }}
                          value={v[campo]}
                          onChange={(e) => cambiarNota(m.id_matricula, campo, e.target.value)}
                          placeholder="0.0"
                        />
                        <div className="section-sub" style={{ fontSize: 11, marginTop: 4 }}>
                          Sug: {sugVal != null ? Number(sugVal).toFixed(2) : '—'}
                        </div>
                      </td>
                    );
                  })}
                  <td style={{ fontWeight: 700, color: (notaActual?.definitiva ?? 0) >= 3 ? 'var(--success)' : 'var(--text-2)' }}>
                    {notaActual?.definitiva != null ? Number(notaActual.definitiva).toFixed(2) : '—'}
                  </td>
                  <td>
                    <button className="btn-primary" style={{ padding: '8px 14px', fontSize: 12 }} onClick={() => guardar(m)}>
                      {notaActual && !notaActual.calculada ? 'Actualizar' : 'Guardar'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {deLaMateria.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>
                  No hay estudiantes matriculados en esta materia.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ====== 2. Tareas del profesor (crear + filtrar + entregas) ======
export function TareasProfesor({ idProfesor }: ProfesorProps) {
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [filtroMateria, setFiltroMateria] = useState('');
  const [abierta, setAbierta] = useState<string | null>(null);
  const [entregas, setEntregas] = useState<Record<string, EntregasRespuesta>>({});
  const [califInput, setCalifInput] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ id_materia: '', tipo: 'taller', momento: '1', fecha_limite: '', titulo: '', descripcion: '' });
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [mats, ts] = await Promise.all([
        get<Materia[]>('/materias/'),
        getAuth<Tarea[]>('/tareas/'),
      ]);
      const mias = mats.filter((m) => m.id_profesor === idProfesor);
      setMaterias(mias);
      setTareas(ts);
      setForm((prev) => ({ ...prev, id_materia: prev.id_materia || mias[0]?.id_materia || '' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las tareas.');
    } finally {
      setCargando(false);
    }
  }, [idProfesor]);

  useEffect(() => { cargar(); }, [cargar]);

  const crear = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setAviso('');
    const fd = new FormData();
    fd.append('id_materia', form.id_materia);
    fd.append('tipo', form.tipo);
    fd.append('momento', form.momento);
    fd.append('fecha_limite', form.fecha_limite);
    fd.append('titulo', form.titulo.trim());
    fd.append('descripcion', form.descripcion.trim());
    try {
      const creada = await postForm<Tarea>('/tareas/', fd, true);
      setAviso(`Tarea creada: ${creada.titulo} (${creada.id_tarea})`);
      setForm((prev) => ({ ...prev, titulo: '', descripcion: '' }));
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la tarea.');
    }
  };

  const toggleEntregas = async (idTarea: string) => {
    if (abierta === idTarea) { setAbierta(null); return; }
    setAbierta(idTarea);
    try {
      const res = await getAuth<EntregasRespuesta>(`/tareas/${encodeURIComponent(idTarea)}/entregas`);
      setEntregas((prev) => ({ ...prev, [idTarea]: res }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las entregas.');
    }
  };

  const calificar = async (idTarea: string, idEntrega: string, cedula: string) => {
    const val = parseFloat(califInput[idEntrega] ?? '');
    if (Number.isNaN(val) || val < 0 || val > 5) {
      setError('La calificación debe estar entre 0.0 y 5.0.');
      return;
    }
    try {
      await put(`/tareas/${encodeURIComponent(idTarea)}/entregas/${encodeURIComponent(idEntrega)}/calificacion`, { calificacion: val });
      setAviso(`Calificación ${val.toFixed(1)} guardada para ${cedula}.`);
      const res = await getAuth<EntregasRespuesta>(`/tareas/${encodeURIComponent(idTarea)}/entregas`);
      setEntregas((prev) => ({ ...prev, [idTarea]: res }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo calificar.');
    }
  };

  const filtradas = filtroMateria ? tareas.filter((t) => t.id_materia === filtroMateria) : tareas;

  if (cargando) {
    return <div className="stat-card skeleton" style={{ minHeight: 160 }} />;
  }

  return (
    <>
      {error && <p className="login-error">{error}</p>}
      {aviso && (
        <p className="login-error" style={{ background: 'var(--teal-soft)', borderColor: 'var(--teal-border)', color: 'var(--teal)' }}>
          {aviso}
        </p>
      )}

      {/* Formulario nueva tarea */}
      <form className="stat-card" onSubmit={crear} style={{ gap: 14 }}>
        <h3 className="section-title" style={{ fontSize: 16 }}>Nueva actividad</h3>
        <div className="form-grid">
          <div className="input-group">
            <label className="input-label">Materia</label>
            <select
              className="input-field"
              value={form.id_materia}
              onChange={(e) => setForm({ ...form, id_materia: e.target.value })}
              required
            >
              {materias.map((m) => <option key={m.id_materia} value={m.id_materia}>{m.id_materia} · {m.nombre_curso}</option>)}
            </select>
          </div>
          <div className="input-group">
            <label className="input-label">Tipo</label>
            <select className="input-field" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              <option value="taller">Taller</option>
              <option value="quiz">Quiz</option>
              <option value="examen">Examen</option>
              <option value="trabajo">Trabajo</option>
            </select>
          </div>
          <div className="input-group">
            <label className="input-label">Momento</label>
            <select className="input-field" value={form.momento} onChange={(e) => setForm({ ...form, momento: e.target.value })}>
              <option value="1">Momento 1</option>
              <option value="2">Momento 2</option>
              <option value="3">Momento 3</option>
            </select>
          </div>
          <div className="input-group">
            <label className="input-label">Fecha límite</label>
            <input
              type="datetime-local"
              className="input-field"
              value={form.fecha_limite}
              onChange={(e) => setForm({ ...form, fecha_limite: e.target.value })}
              required
            />
          </div>
          <div className="input-group" style={{ gridColumn: '1/-1' }}>
            <label className="input-label">Título</label>
            <input
              type="text"
              className="input-field"
              placeholder="Taller 1 - Programación"
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              required
            />
          </div>
          <div className="input-group" style={{ gridColumn: '1/-1' }}>
            <label className="input-label">Descripción</label>
            <input
              type="text"
              className="input-field"
              placeholder="Instrucciones y entregables"
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              required
            />
          </div>
        </div>
        <div>
          <button type="submit" className="btn-primary">Crear tarea</button>
        </div>
      </form>

      {/* Filtro por materia */}
      <div className="registro-header">
        <h3 className="section-title" style={{ fontSize: 16 }}>Tareas publicadas ({filtradas.length})</h3>
        <label className="registro-select">
          <span>Materia</span>
          <select value={filtroMateria} onChange={(e) => setFiltroMateria(e.target.value)} className="input-field" style={{ width: 220 }}>
            <option value="">Todas</option>
            {materias.map((m) => <option key={m.id_materia} value={m.id_materia}>{m.id_materia} · {m.nombre_curso}</option>)}
          </select>
        </label>
      </div>

      <div className="tareas-lista">
        {filtradas.map((t) => {
          const det = entregas[t.id_tarea];
          return (
            <div key={t.id_tarea} className="stat-card" style={{ padding: 16 }}>
              <div className="tarea-fila" style={{ padding: 0, border: 'none', background: 'transparent' }}>
                <div className="tarea-fila-left">
                  <span className="tarea-titulo">{t.titulo}</span>
                  <div className="tarea-meta">
                    <span className="chip teal">{t.id_materia}</span>
                    <span className="chip">{t.tipo}</span>
                    {t.momento && <span className="chip">Momento {t.momento}</span>}
                    <span className="chip">Límite: {formatoFecha(t.fecha_limite)}</span>
                  </div>
                </div>
                <div className="tarea-fila-right">
                  <span className="chip green">{t.entregas_recibidas ?? 0} / {t.matriculados ?? 0} entregaron</span>
                  <button className="btn-ghost" onClick={() => toggleEntregas(t.id_tarea)}>
                    {abierta === t.id_tarea ? 'Ocultar ▴' : 'Ver entregas ▾'}
                  </button>
                </div>
              </div>
              {abierta === t.id_tarea && det && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                  {det.entregas.length > 0 ? (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Estudiante</th>
                            <th>Subida</th>
                            <th>Comentario</th>
                            <th>Calificación</th>
                          </tr>
                        </thead>
                        <tbody>
                          {det.entregas.map((e) => (
                            <tr key={e.id_entrega}>
                              <td><span className="chip teal">{e.cedula}</span> {e.nombre}</td>
                              <td>{formatoFecha(e.subida_en)}</td>
                              <td>{e.comentario || '—'}</td>
                              <td style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <input
                                  type="number"
                                  min="0"
                                  max="5"
                                  step="0.1"
                                  className="input-field"
                                  style={{ width: 80, padding: '6px 8px' }}
                                  value={califInput[e.id_entrega] ?? (e.calificacion != null ? String(e.calificacion) : '')}
                                  onChange={(ev) => setCalifInput({ ...califInput, [e.id_entrega]: ev.target.value })}
                                />
                                <button
                                  className="btn-primary"
                                  style={{ padding: '6px 12px', fontSize: 12 }}
                                  onClick={() => calificar(t.id_tarea, e.id_entrega, e.cedula)}
                                >
                                  Guardar
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="section-sub">Sin entregas recibidas todavía.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filtradas.length === 0 && (
          <div className="stat-card" style={{ textAlign: 'center', padding: 36 }}>
            <span className="section-sub">No hay tareas en esta selección.</span>
          </div>
        )}
      </div>
    </>
  );
}

// ====== 3. Reportes PDF del profesor ======
export function ReportesProfesor({ idProfesor }: ProfesorProps) {
  const [matriculas, setMatriculas] = useState<Matricula[]>([]);
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [cedula, setCedula] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getAuth<Matricula[]>('/matriculas/'), get<Estudiante[]>('/estudiantes/')])
      .then(([mats, ests]) => {
        setMatriculas(mats);
        setEstudiantes(ests);
        const unicas = [...new Set(mats.map((m) => m.cedula))];
        if (unicas.length) setCedula(unicas[0]);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Error cargando estudiantes.'));
  }, [idProfesor]);

  const cedulasUnicas = [...new Set(matriculas.map((m) => m.cedula))];
  const nombreDe = (c: string) => {
    const e = estudiantes.find((x) => x.id_estudiante === c);
    return e ? `${e.nombre} ${e.apellidos}` : c;
  };

  const descargar = async (tipo: 'matricula' | 'notas') => {
    if (!cedula) return;
    setError('');
    try {
      const ruta = tipo === 'matricula' ? `/pdf/matricula/${cedula}` : `/pdf/notas/${cedula}`;
      const archivo = tipo === 'matricula' ? `Recibo_Matricula_${cedula}.pdf` : `Reporte_Notas_${cedula}.pdf`;
      await downloadArchivo(ruta, archivo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo descargar el PDF.');
    }
  };

  return (
    <>
      {error && <p className="login-error">{error}</p>}
      <div>
        <h2 className="section-title">Reportes de tus estudiantes</h2>
        <p className="section-sub">Descarga el boletín de notas o el recibo de matrícula de los estudiantes inscritos en tus materias.</p>
      </div>
      <div className="stat-card" style={{ gap: 16, maxWidth: 520 }}>
        <div className="input-group">
          <label className="input-label">Estudiante</label>
          <select className="input-field" value={cedula} onChange={(e) => setCedula(e.target.value)}>
            {cedulasUnicas.map((c) => <option key={c} value={c}>{c} · {nombreDe(c)}</option>)}
            {cedulasUnicas.length === 0 && <option value="">Sin estudiantes matriculados</option>}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn-primary" disabled={!cedula} onClick={() => descargar('notas')}>
            ⇩ Boletín de notas (PDF)
          </button>
          <button className="btn-ghost" disabled={!cedula} onClick={() => descargar('matricula')}>
            ⇩ Recibo de matrícula (PDF)
          </button>
        </div>
      </div>
    </>
  );
}
