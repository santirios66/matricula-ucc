import { useEffect, useState, useCallback } from 'react';
import { getAuth, get } from '../api/client';
import type { Nota, Materia } from '../api/types';

interface MisNotasProps {
  cedula: string;
}

export default function MisNotas(_props: MisNotasProps) {
  const [notas, setNotas] = useState<Nota[]>([]);
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [filtroMateria, setFiltroMateria] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const [n, m] = await Promise.all([
        getAuth<Nota[]>('/notas/'),
        get<Materia[]>('/materias/'),
      ]);
      setNotas(n);
      setMaterias(m);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las notas.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const materiasUnicas = [...new Set(notas.map((n) => n.id_materia))].sort();
  const nombreMateria = (id: string) => materias.find((x) => x.id_materia === id)?.nombre_curso || id;

  const filtradas = notas.filter((n) => {
    if (filtroMateria && n.id_materia !== filtroMateria) return false;
    return true;
  });

  const conDef = filtradas.filter((n) => n.definitiva != null);
  const promedio = conDef.length
    ? (conDef.reduce((s, n) => s + Number(n.definitiva), 0) / conDef.length).toFixed(2)
    : '—';

  // Actividades agrupadas por materia
  const porMateria = new Map<string, NonNullable<Nota['actividades']>>();
  filtradas.forEach((n) => {
    if (Array.isArray(n.actividades) && n.actividades.length && !porMateria.has(n.id_materia)) {
      porMateria.set(n.id_materia, n.actividades);
    }
  });
  const totalActividades = [...porMateria.values()].reduce((s, l) => s + l.length, 0);

  if (cargando) {
    return (
      <>
        <div className="stat-grid">
          {[...Array(3)].map((_, i) => <div key={i} className="stat-card skeleton" style={{ minHeight: 120 }} />)}
        </div>
      </>
    );
  }

  return (
    <>
      {error && <p className="login-error">{error}</p>}

      {/* Cifras */}
      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">Materias con nota</span>
          <span className="stat-value">{filtradas.length}</span>
          <span className="section-sub">Registradas</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Actividades calificadas</span>
          <span className="stat-value">{totalActividades}</span>
          <span className="section-sub">Talleres, quizzes y exámenes</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Promedio de definitivas</span>
          <span className="stat-value" style={{ color: Number(promedio) >= 3 ? 'var(--success)' : 'var(--danger)' }}>
            {promedio}
          </span>
          <span className="section-sub">Aprobado desde 3.0</span>
        </div>
      </div>

      {/* Filtros */}
      <div className="filtros-row">
        <label className="registro-select">
          <span>Materia</span>
          <select value={filtroMateria} onChange={(e) => setFiltroMateria(e.target.value)} className="input-field" style={{ width: 180 }}>
            <option value="">Todas</option>
            {materiasUnicas.map((m) => <option key={m} value={m}>{m} · {nombreMateria(m)}</option>)}
          </select>
        </label>
      </div>

      {/* Tabla de notas */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Materia</th>
              <th>N1</th>
              <th>N2</th>
              <th>N3</th>
              <th>Definitiva</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((n, i) => (
              <tr key={n.id_nota || i}>
                <td>{n.id_nota ?? '—'}</td>
                <td>
                  <span className="chip teal">{n.id_materia}</span>
                  {n.calculada && <span className="chip" style={{ marginLeft: 6 }}>Calculada</span>}
                </td>
                <td>{n.nota1 ?? '—'}</td>
                <td>{n.nota2 ?? '—'}</td>
                <td>{n.nota3 ?? '—'}</td>
                <td style={{ fontWeight: 700, color: (n.definitiva ?? 0) >= 3 ? 'var(--success)' : 'var(--danger)' }}>
                  {n.definitiva ?? '—'}
                </td>
                <td><span className={`chip ${(n.estado || '').includes('Aprobado') ? 'green' : 'red'}`}>{n.estado || 'Sin notas'}</span></td>
              </tr>
            ))}
            {filtradas.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>Sin notas en esta selección.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Actividades por materia */}
      {totalActividades > 0 && (
        <div>
          <h3 className="section-title" style={{ fontSize: 16, marginBottom: 14 }}>Calificaciones por actividad</h3>
          <div className="actividades-grid">
            {[...porMateria.entries()].map(([materia, acts]) => (
              <div key={materia} className="stat-card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span className="chip teal">{materia}</span>
                  <span className="chip">{acts?.length || 0} actividades</span>
                </div>
                {acts?.map((a, i) => (
                  <div key={i} className="actividad-fila">
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{a.titulo}</span>
                      <span className="chip" style={{ marginLeft: 8 }}>{a.tipo}</span>
                    </div>
                    <span style={{ fontWeight: 700, color: 'var(--teal)' }}>{Number(a.calificacion).toFixed(1)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
