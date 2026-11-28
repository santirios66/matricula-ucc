import { useEffect, useState, useCallback } from 'react';
import { getAuth } from '../api/client';
import type { HistorialPeriodo, Matricula } from '../api/types';

interface RegistroProps {
  cedula: string;
}

export default function Registro({ cedula }: RegistroProps) {
  const [periodos, setPeriodos] = useState<string[]>([]);
  const [seleccionado, setSeleccionado] = useState('');
  const [datos, setDatos] = useState<HistorialPeriodo | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const cargarPeriodos = useCallback(async () => {
    try {
      const mats = await getAuth<Matricula[]>(`/matriculas/`);
      const unicos = [...new Set(mats.map((m) => m.periodo).filter(Boolean))];
      unicos.sort((a, b) => String(b).localeCompare(String(a)));
      setPeriodos(unicos);
      if (unicos.length && !seleccionado) setSeleccionado(unicos[0]);
    } catch {
      setPeriodos([]);
    }
  }, [seleccionado]);

  const cargarHistorial = useCallback(async (periodo: string) => {
    if (!periodo) return;
    setCargando(true);
    setError('');
    try {
      const res = await getAuth<HistorialPeriodo>(
        `/estudiantes/${cedula}/matriculas?periodo=${encodeURIComponent(periodo)}`,
      );
      setDatos(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el registro.');
      setDatos(null);
    } finally {
      setCargando(false);
    }
  }, [cedula]);

  useEffect(() => { cargarPeriodos(); }, [cargarPeriodos]);
  useEffect(() => { if (seleccionado) cargarHistorial(seleccionado); }, [seleccionado, cargarHistorial]);

  const situacion = datos?.promedio_acumulado != null
    ? (datos.promedio_acumulado >= 3 ? { texto: 'Normal', color: 'var(--success)', bg: 'rgba(52,211,153,0.08)' }
      : { texto: 'En riesgo', color: 'var(--danger)', bg: 'rgba(248,113,113,0.08)' })
    : { texto: '—', color: 'var(--text-3)', bg: 'transparent' };

  return (
    <>
      {error && <p className="login-error">{error}</p>}

      {/* Encabezado con selector de periodo */}
      <div className="registro-header">
        <div>
          <h2 className="section-title">Registro académico</h2>
          <p className="section-sub">
            {datos?.periodo_abierto ? 'Periodo en curso: las materias figuran como Cursando.' : 'Periodo cerrado.'}
          </p>
        </div>
        <label className="registro-select">
          <span>Periodo</span>
          <select
            value={seleccionado}
            onChange={(e) => setSeleccionado(e.target.value)}
            className="input-field"
            style={{ width: 140 }}
          >
            {periodos.map((p) => <option key={p} value={p}>{p}</option>)}
            {periodos.length === 0 && <option value="">Sin periodos</option>}
          </select>
        </label>
      </div>

      {cargando && (
        <div className="stat-grid">
          {[...Array(3)].map((_, i) => <div key={i} className="stat-card skeleton" style={{ minHeight: 120 }} />)}
        </div>
      )}

      {!cargando && datos && (
        <>
          {/* Promedios */}
          <div className="stat-grid">
            <div className="stat-card">
              <span className="stat-label">Promedio del semestre</span>
              <span className="stat-value" style={{ color: 'var(--teal)' }}>
                {datos.promedio_semestre != null ? datos.promedio_semestre.toFixed(2) : '—'}
              </span>
              <span className="section-sub">Ponderado por créditos</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Promedio acumulado</span>
              <span className="stat-value" style={{ color: 'var(--text)' }}>
                {datos.promedio_acumulado != null ? datos.promedio_acumulado.toFixed(2) : '—'}
              </span>
              <span className="section-sub">Histórico completo</span>
            </div>
            <div className="stat-card" style={{ background: situacion.bg }}>
              <span className="stat-label">Situación académica</span>
              <span className="stat-value" style={{ color: situacion.color, fontSize: 22 }}>{situacion.texto}</span>
              <span className="section-sub">{datos.promedio_acumulado != null ? 'Umbral: 3.0' : 'Sin promedio'}</span>
            </div>
          </div>

          {/* Tabla de materias */}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID Curso</th>
                  <th>Descripción</th>
                  <th>Créditos</th>
                  <th>Calif</th>
                  <th>Notas</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {datos.materias.map((m) => (
                  <tr key={m.id_matricula}>
                    <td><span className="chip teal">{m.id_materia}</span></td>
                    <td style={{ fontWeight: 600 }}>{m.nombre_curso}</td>
                    <td>{m.creditos}</td>
                    <td>{m.calificacion != null ? m.calificacion.toFixed(1) : '—'}</td>
                    <td style={{ fontWeight: 700 }}>{m.nota_final != null ? m.nota_final.toFixed(3) : '—'}</td>
                    <td>
                      <span className={`chip ${m.estado === 'Aprobada' ? 'green' : m.estado === 'Reprobada' ? 'red' : ''}`}>
                        {m.estado}
                      </span>
                    </td>
                  </tr>
                ))}
                {datos.materias.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>
                      No tienes materias registradas en este periodo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
