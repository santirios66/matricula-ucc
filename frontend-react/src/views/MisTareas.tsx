import { useEffect, useState, useCallback } from 'react';
import { getAuth } from '../api/client';
import type { Tarea } from '../api/types';

interface MisTareasProps {
  cedula: string;
}

const formatoFecha = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
};

export default function MisTareas(_props: MisTareasProps) {
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [filtroMateria, setFiltroMateria] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const t = await getAuth<Tarea[]>('/tareas/');
      setTareas(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las tareas.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const materiasUnicas = [...new Set(tareas.map((t) => t.id_materia))].sort();
  const filtradas = filtroMateria ? tareas.filter((t) => t.id_materia === filtroMateria) : tareas;

  const conteo = { entregadas: 0, pendientes: 0, noEntrego: 0 };
  filtradas.forEach((t) => {
    if (t.estado_entrega === 'Entregado') conteo.entregadas++;
    else if (t.estado_entrega === 'Pendiente') conteo.pendientes++;
    else conteo.noEntrego++;
  });

  // Agrupar por materia
  const grupos = new Map<string, Tarea[]>();
  filtradas.forEach((t) => {
    if (!grupos.has(t.id_materia)) grupos.set(t.id_materia, []);
    grupos.get(t.id_materia)!.push(t);
  });

  const claseEstado = (estado?: string) =>
    estado === 'Entregado' ? 'green' : estado === 'Pendiente' ? '' : 'red';

  if (cargando) {
    return (
      <div className="stat-grid">
        {[...Array(3)].map((_, i) => <div key={i} className="stat-card skeleton" style={{ minHeight: 120 }} />)}
      </div>
    );
  }

  return (
    <>
      {error && <p className="login-error">{error}</p>}

      {/* Cifras */}
      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">Tareas</span>
          <span className="stat-value">{filtradas.length}</span>
          <span className="section-sub">En tus materias activas</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Entregadas</span>
          <span className="stat-value" style={{ color: 'var(--success)' }}>{conteo.entregadas}</span>
          <span className="section-sub">A tiempo</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Pendientes</span>
          <span className="stat-value" style={{ color: 'var(--warning)' }}>{conteo.pendientes}</span>
          <span className="section-sub">Por entregar</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">No entregaste</span>
          <span className="stat-value" style={{ color: 'var(--danger)' }}>{conteo.noEntrego}</span>
          <span className="section-sub">Vencidas</span>
        </div>
      </div>

      {/* Filtro */}
      <div className="filtros-row">
        <label className="registro-select">
          <span>Materia</span>
          <select value={filtroMateria} onChange={(e) => setFiltroMateria(e.target.value)} className="input-field" style={{ width: 180 }}>
            <option value="">Todas</option>
            {materiasUnicas.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
      </div>

      {/* Lista agrupada por materia */}
      {[...grupos.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([materia, lista]) => (
        <div key={materia}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span className="chip teal">{materia}</span>
            <span className="section-sub">{lista.length} {lista.length === 1 ? 'tarea' : 'tareas'}</span>
          </div>
          <div className="tareas-lista">
            {lista.map((t) => (
              <div key={t.id_tarea} className="tarea-fila">
                <div className="tarea-fila-left">
                  <span className="tarea-titulo">{t.titulo}</span>
                  <div className="tarea-meta">
                    <span className={`chip ${t.tipo === 'taller' ? 'teal' : t.tipo === 'examen' ? 'red' : ''}`}>{t.tipo}</span>
                    {t.momento && <span className="chip">Momento {t.momento}</span>}
                    <span className="chip">Límite: {formatoFecha(t.fecha_limite)}</span>
                  </div>
                </div>
                <div className="tarea-fila-right">
                  {t.calificacion != null && (
                    <span className="tarea-nota">{Number(t.calificacion).toFixed(1)}</span>
                  )}
                  <span className={`chip ${claseEstado(t.estado_entrega)}`}>{t.estado_entrega}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {filtradas.length === 0 && (
        <div className="stat-card" style={{ textAlign: 'center', padding: 48 }}>
          <span className="section-sub">No hay tareas en tus materias activas.</span>
        </div>
      )}
    </>
  );
}
