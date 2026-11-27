import { useEffect, useState, useCallback } from 'react';
import { get, post } from '../api/client';
import { ApiError } from '../api/client';
import type { MateriaDisponible, Periodo, MatriculaLoteRespuesta } from '../api/types';

interface MatricularProps {
  cedula: string;
}

const MIN_CREDITOS = 6;
const MAX_CREDITOS = 19;

function hayCruce(a: MateriaDisponible, b: MateriaDisponible): boolean {
  if (!a.dia || !b.dia || a.dia !== b.dia) return false;
  const hi = (m: MateriaDisponible) => String(m.hora_inicio || '').slice(0, 5);
  const hf = (m: MateriaDisponible) => String(m.hora_fin || '').slice(0, 5);
  return hi(a) < hf(b) && hi(b) < hf(a);
}

export default function Matricular({ cedula }: MatricularProps) {
  const [materias, setMaterias] = useState<MateriaDisponible[]>([]);
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [carrito, setCarrito] = useState<Set<string>>(new Set());
  const [arrastrando, setArrastrando] = useState(false);
  const [sobreCarrito, setSobreCarrito] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [cargando, setCargando] = useState(true);
  const [confirmando, setConfirmando] = useState(false);

  const hoy = new Date();
  const periodoAbierto = periodos.find((p) => {
    const ini = p.fecha_inicio ? new Date(p.fecha_inicio + 'T00:00:00') : null;
    const fin = p.fecha_fin ? new Date(p.fecha_fin + 'T23:59:59') : null;
    return ini && fin && hoy >= ini && hoy <= fin;
  });

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    setAviso('');
    try {
      const [mats, pers] = await Promise.all([
        get<MateriaDisponible[]>(`/estudiantes/${cedula}/materias-disponibles`),
        get<Periodo[]>('/periodos/'),
      ]);
      setMaterias(mats);
      setPeriodos(pers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las materias.');
    } finally {
      setCargando(false);
    }
  }, [cedula, periodoAbierto?.periodo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const porId = new Map(materias.map((m) => [m.id_materia, m]));
  const seleccionadas = [...carrito].map((id) => porId.get(id)).filter(Boolean) as MateriaDisponible[];
  const totalCreditos = seleccionadas.reduce((s, m) => s + m.creditos, 0);
  const enRango = totalCreditos >= MIN_CREDITOS && totalCreditos <= MAX_CREDITOS;

  const semestres = [...new Set(materias.map((m) => m.semestre))].sort((a, b) => a - b);

  const toggleMateria = (id: string) => {
    const m = porId.get(id);
    if (!m || m.bloqueada) return;
    const nuevas = new Set(carrito);
    if (nuevas.has(id)) {
      nuevas.delete(id);
    } else {
      // Verificar cruce con las ya seleccionadas
      const seleccion = [...nuevas].map((x) => porId.get(x)).filter(Boolean) as MateriaDisponible[];
      if (seleccion.some((s) => hayCruce(s, m))) {
        setAviso(`Cruce de horario: ${m.nombre_curso} choca con una materia del carrito.`);
        return;
      }
      nuevas.add(id);
    }
    setCarrito(nuevas);
    setAviso('');
  };

  // ====== Drag & Drop ======
  const handleDragStart = (e: React.DragEvent<HTMLButtonElement>, id: string) => {
    const m = porId.get(id);
    if (!m || m.bloqueada) { e.preventDefault(); return; }
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'copy';
    setArrastrando(true);
  };

  const handleDragEnd = () => { setArrastrando(false); setSobreCarrito(false); };

  const handleDropEnCarrito = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setSobreCarrito(false);
    setArrastrando(false);
    const id = e.dataTransfer.getData('text/plain');
    if (id) toggleMateria(id);
  };

  const handleDragOverCarrito = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setSobreCarrito(true);
  };

  const handleDragLeaveCarrito = () => setSobreCarrito(false);

  const confirmar = async () => {
    if (!periodoAbierto || !enRango || seleccionadas.length === 0) return;
    setConfirmando(true);
    setAviso('');
    try {
      const res = await post<MatriculaLoteRespuesta>('/matriculas/lote', {
        cedula,
        periodo: periodoAbierto.periodo,
        id_materias: seleccionadas.map((m) => m.id_materia),
      });
      setAviso(
        `Matrícula confirmada: ${res.matriculas.length} materias, ${res.total_creditos} créditos. Radicado: ${res.radicado}.`,
      );
      setCarrito(new Set());
      await cargar();
    } catch (err) {
      setAviso(err instanceof ApiError ? err.message : 'No se pudo confirmar la matrícula.');
    } finally {
      setConfirmando(false);
    }
  };

  if (cargando) {
    return (
      <>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="stat-card skeleton" style={{ minHeight: 200 }} />
        ))}
      </>
    );
  }

  return (
    <>
      {error && <p className="login-error">{error}</p>}
      {aviso && <p className="login-error" style={{ background: 'var(--teal-soft)', borderColor: 'var(--teal-border)', color: 'var(--teal)' }}>{aviso}</p>}

      <div className="matricular-layout">
        {/* Tablero de materias por semestre */}
        <div className="matricular-tablero">
          {semestres.map((sem) => {
            const lista = materias.filter((m) => m.semestre === sem);
            return (
              <div key={sem} className="semestre-columna">
                <div className="semestre-header">
                  <h3>Semestre {sem}</h3>
                  <span className="chip">{lista.length} {lista.length === 1 ? 'materia' : 'materias'}</span>
                </div>
                <div className="semestre-cards">
                  {lista.map((m) => {
                    const enCarrito = carrito.has(m.id_materia);
                    const cruza = seleccionadas.some((s) => s.id_materia !== m.id_materia && hayCruce(s, m));
                    return (
                      <button
                        key={`${m.id_materia}-${sem}`}
                        className={`materia-card ${enCarrito ? 'en-carrito' : ''} ${m.bloqueada ? 'bloqueada' : ''} ${cruza ? 'cruce' : ''} ${arrastrando && !enCarrito && !m.bloqueada ? 'arrastrable' : ''}`}
                        onClick={() => toggleMateria(m.id_materia)}
                        disabled={m.bloqueada}
                        draggable={!m.bloqueada}
                        onDragStart={(e) => handleDragStart(e, m.id_materia)}
                        onDragEnd={handleDragEnd}
                      >
                        <div className="materia-card-top">
                          <span className="chip teal">{m.id_materia}</span>
                          {m.bloqueada && <span className="chip red">Bloqueada</span>}
                          <span className="materia-creditos">{m.creditos} cr</span>
                        </div>
                        <span className="materia-nombre">{m.nombre_curso}</span>
                        {m.bloqueada && m.requisitos_faltantes.length > 0 && (
                          <span className="materia-requisito">
                            Falta: {m.requisitos_faltantes.map((r) => r.nombre_curso).join(', ')}
                          </span>
                        )}
                        <div className="materia-card-pie">
                          <span className="materia-horario">
                            {m.dia ? `${m.dia} ${String(m.hora_inicio || '').slice(0, 5)}–${String(m.hora_fin || '').slice(0, 5)}` : m.horario || 'Sin horario'}
                          </span>
                          {enCarrito && <span className="chip green">En carrito</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Carrito lateral */}
        <aside
          className={`carrito-panel ${sobreCarrito ? 'drop-activo' : ''}`}
          onDrop={handleDropEnCarrito}
          onDragOver={handleDragOverCarrito}
          onDragLeave={handleDragLeaveCarrito}
        >
          <div className="carrito-header">
            <h3>Tu carrito</h3>
            <span className={`carrito-total ${enRango ? 'ok' : 'fuera'}`}>
              {totalCreditos} / {MIN_CREDITOS}-{MAX_CREDITOS} cr
            </span>
          </div>
          <div className="carrito-barra">
            <div
              className="carrito-barra-fill"
              style={{
                width: `${Math.min(100, (totalCreditos / MAX_CREDITOS) * 100)}%`,
                background: enRango ? 'var(--success)' : totalCreditos > MAX_CREDITOS ? 'var(--danger)' : 'var(--warning)',
              }}
            />
          </div>
          <div className="carrito-lista">
            {sobreCarrito && (
              <div className="carrito-drop-mensaje">
                Suelta aqui para agregar
              </div>
            )}
            {seleccionadas.length === 0 && !sobreCarrito && (
              <p className="section-sub" style={{ textAlign: 'center', padding: '24px 0' }}>
                Haz clic en una materia para agregarla.
              </p>
            )}
            {seleccionadas.map((m) => (
              <div key={m.id_materia} className="carrito-item">
                <div>
                  <span className="chip teal">{m.id_materia}</span>
                  <span className="carrito-item-nombre">{m.nombre_curso}</span>
                </div>
                <div className="carrito-item-right">
                  <span className="materia-creditos">{m.creditos} cr</span>
                  <button className="btn-quitar" onClick={() => toggleMateria(m.id_materia)}>×</button>
                </div>
              </div>
            ))}
          </div>
          <button
            className="btn-primary"
            style={{ opacity: enRango && periodoAbierto && seleccionadas.length > 0 ? 1 : 0.5 }}
            disabled={!enRango || !periodoAbierto || seleccionadas.length === 0 || confirmando}
            onClick={confirmar}
          >
            {confirmando ? 'Confirmando…' : 'Confirmar matrícula'}
          </button>
          {!periodoAbierto && (
            <p className="section-sub" style={{ textAlign: 'center', marginTop: 8, color: 'var(--warning)' }}>
              No hay un periodo de matrícula abierto.
            </p>
          )}
        </aside>
      </div>
    </>
  );
}
