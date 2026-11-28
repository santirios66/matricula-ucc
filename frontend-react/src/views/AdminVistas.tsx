import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { get, post, del } from '../api/client';
import type { Facultad, Programa, Profesor } from '../api/types';

export type ModuloKey = 'facultades' | 'programas' | 'materias' | 'profesores' | 'estudiantes' | 'periodos';

interface CampoDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'email' | 'select';
  catalogo?: 'facultades' | 'programas' | 'profesores';
  optional?: boolean;
}

const MODULOS: Record<ModuloKey, { title: string; singular: string; pk: string; fields: CampoDef[] }> = {
  facultades: {
    title: 'Facultades',
    singular: 'facultad',
    pk: 'id_facultad',
    fields: [
      { key: 'id_facultad', label: 'Código', type: 'text' },
      { key: 'nombre_facultad', label: 'Nombre', type: 'text' },
    ],
  },
  programas: {
    title: 'Programas',
    singular: 'programa',
    pk: 'id_programa',
    fields: [
      { key: 'id_programa', label: 'Código', type: 'text' },
      { key: 'nombre_programa', label: 'Programa', type: 'text' },
      { key: 'id_facultad', label: 'Facultad', type: 'select', catalogo: 'facultades' },
    ],
  },
  materias: {
    title: 'Materias',
    singular: 'materia',
    pk: 'id_materia',
    fields: [
      { key: 'id_materia', label: 'Código', type: 'text' },
      { key: 'nombre_curso', label: 'Curso', type: 'text' },
      { key: 'creditos', label: 'Créditos', type: 'number' },
      { key: 'cupos', label: 'Cupos', type: 'number' },
      { key: 'id_facultad', label: 'Facultad', type: 'select', catalogo: 'facultades' },
      { key: 'id_profesor', label: 'Profesor', type: 'select', catalogo: 'profesores' },
      { key: 'horario', label: 'Horario', type: 'text', optional: true },
    ],
  },
  profesores: {
    title: 'Profesores',
    singular: 'profesor',
    pk: 'id_profesor',
    fields: [
      { key: 'id_profesor', label: 'ID Profesor', type: 'text' },
      { key: 'nombre', label: 'Nombres', type: 'text' },
      { key: 'apellidos', label: 'Apellidos', type: 'text' },
    ],
  },
  estudiantes: {
    title: 'Estudiantes',
    singular: 'estudiante',
    pk: 'id_estudiante',
    fields: [
      { key: 'id_estudiante', label: 'Cédula', type: 'text' },
      { key: 'nombre', label: 'Nombres', type: 'text' },
      { key: 'apellidos', label: 'Apellidos', type: 'text' },
      { key: 'correo', label: 'Correo', type: 'email' },
      { key: 'telefono', label: 'Teléfono', type: 'text', optional: true },
      { key: 'semestre', label: 'Semestre', type: 'number' },
      { key: 'id_programa', label: 'Programa', type: 'select', catalogo: 'programas' },
    ],
  },
  periodos: {
    title: 'Periodos',
    singular: 'periodo',
    pk: 'periodo',
    fields: [
      { key: 'periodo', label: 'Periodo (ej. 2026-2)', type: 'text' },
      { key: 'fecha_inicio', label: 'Fecha inicio', type: 'date' },
      { key: 'fecha_fin', label: 'Fecha fin', type: 'date' },
    ],
  },
};

export function CatalogoAdmin({ modulo }: { modulo: ModuloKey }) {
  const cfg = MODULOS[modulo];
  const [filas, setFilas] = useState<Record<string, unknown>[]>([]);
  const [facultades, setFacultades] = useState<Facultad[]>([]);
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [profesores, setProfesores] = useState<Profesor[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroFac, setFiltroFac] = useState('');
  const [abiertoForm, setAbiertoForm] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const [rows, facs, progs, profs] = await Promise.all([
        get<Record<string, unknown>[]>(`/${modulo}/`),
        get<Facultad[]>('/facultades/'),
        get<Programa[]>('/programas/'),
        get<Profesor[]>('/profesores/'),
      ]);
      setFilas(rows);
      setFacultades(facs);
      setProgramas(progs);
      setProfesores(profs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los registros.');
    } finally {
      setCargando(false);
    }
  }, [modulo]);

  useEffect(() => {
    setBusqueda('');
    setFiltroFac('');
    setAbiertoForm(false);
    setForm({});
    setAviso('');
    cargar();
  }, [modulo, cargar]);

  const opcionesSelect = (cat?: 'facultades' | 'programas' | 'profesores') => {
    if (cat === 'facultades') return facultades.map((f) => ({ value: f.id_facultad, label: `${f.id_facultad} · ${f.nombre_facultad}` }));
    if (cat === 'programas') return programas.map((p) => ({ value: p.id_programa, label: `${p.id_programa} · ${p.nombre_programa}` }));
    if (cat === 'profesores') return profesores.map((p) => ({ value: p.id_profesor, label: `${p.id_profesor} · ${p.nombre} ${p.apellidos}` }));
    return [];
  };

  const abrirNuevo = () => {
    const inicial: Record<string, string> = {};
    cfg.fields.forEach((f) => {
      if (f.type === 'select' && f.catalogo) {
        inicial[f.key] = opcionesSelect(f.catalogo)[0]?.value || '';
      } else {
        inicial[f.key] = f.key === 'cupos' ? '20' : '';
      }
    });
    setForm(inicial);
    setAbiertoForm(true);
  };

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setAviso('');
    const body: Record<string, unknown> = {};
    cfg.fields.forEach((f) => {
      const raw = (form[f.key] ?? '').trim();
      if (f.type === 'number') body[f.key] = Number(raw);
      else if (f.optional && !raw) body[f.key] = null;
      else body[f.key] = raw;
    });
    try {
      await post(`/${modulo}/`, body, true);
      setAviso(`${cfg.singular} registrado correctamente.`);
      setAbiertoForm(false);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar.');
    }
  };

  const eliminarMateria = async (id: string) => {
    setError('');
    setAviso('');
    try {
      await del(`/materias/${encodeURIComponent(id)}`);
      setAviso(`Materia ${id} eliminada.`);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar.');
    }
  };

  const conFacultad = modulo === 'programas' || modulo === 'materias';
  const q = busqueda.toLocaleLowerCase('es');
  const filtradas = filas.filter((r) => {
    const coincide = cfg.fields.some((f) => String(r[f.key] ?? '').toLocaleLowerCase('es').includes(q));
    const facOk = !conFacultad || !filtroFac || String(r.id_facultad || '') === filtroFac;
    return coincide && facOk;
  });

  if (cargando) {
    return <div className="stat-card skeleton" style={{ minHeight: 180 }} />;
  }

  return (
    <>
      {error && <p className="login-error">{error}</p>}
      {aviso && (
        <p className="login-error" style={{ background: 'var(--teal-soft)', borderColor: 'var(--teal-border)', color: 'var(--teal)' }}>
          {aviso}
        </p>
      )}

      <div className="registro-header">
        <div>
          <h2 className="section-title">Directorio de {cfg.title.toLowerCase()}</h2>
          <p className="section-sub">{filtradas.length} de {filas.length} registros</p>
        </div>
        <button className="btn-primary" onClick={() => (abiertoForm ? setAbiertoForm(false) : abrirNuevo())}>
          {abiertoForm ? 'Cancelar' : `+ Registrar ${cfg.singular}`}
        </button>
      </div>

      {abiertoForm && (
        <form className="stat-card" onSubmit={guardar} style={{ gap: 14 }}>
          <h3 className="section-title" style={{ fontSize: 16 }}>Nuevo {cfg.singular}</h3>
          <div className="form-grid">
            {cfg.fields.map((f) => (
              <div key={f.key} className="input-group">
                <label className="input-label">{f.label}{f.optional ? '' : ' *'}</label>
                {f.type === 'select' ? (
                  <select
                    className="input-field"
                    value={form[f.key] ?? ''}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    required={!f.optional}
                  >
                    {opcionesSelect(f.catalogo).map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={f.type}
                    className="input-field"
                    value={form[f.key] ?? ''}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    required={!f.optional}
                  />
                )}
              </div>
            ))}
          </div>
          <div>
            <button type="submit" className="btn-primary">Guardar {cfg.singular}</button>
          </div>
        </form>
      )}

      <div className="filtros-row">
        <input
          type="search"
          className="input-field"
          style={{ maxWidth: 320 }}
          placeholder={`Buscar en ${cfg.title.toLowerCase()}…`}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        {conFacultad && (
          <label className="registro-select">
            <span>Facultad</span>
            <select value={filtroFac} onChange={(e) => setFiltroFac(e.target.value)} className="input-field" style={{ width: 220 }}>
              <option value="">Todas</option>
              {facultades.map((f) => <option key={f.id_facultad} value={f.id_facultad}>{f.id_facultad} · {f.nombre_facultad}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {cfg.fields.map((f) => <th key={f.key}>{f.label}</th>)}
              {modulo === 'materias' && <th>Acción</th>}
            </tr>
          </thead>
          <tbody>
            {filtradas.map((r) => {
              const id = String(r[cfg.pk] ?? '');
              return (
                <tr key={id}>
                  {cfg.fields.map((f, idx) => (
                    <td key={f.key}>
                      {idx === 0 ? <span className="chip teal">{String(r[f.key] ?? '')}</span> : String(r[f.key] ?? '—')}
                    </td>
                  ))}
                  {modulo === 'materias' && (
                    <td>
                      <button className="btn-quitar" title="Eliminar materia" onClick={() => eliminarMateria(id)}>×</button>
                    </td>
                  )}
                </tr>
              );
            })}
            {filtradas.length === 0 && (
              <tr>
                <td colSpan={cfg.fields.length + (modulo === 'materias' ? 1 : 0)} style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>
                  Sin registros en esta selección.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ====== Cuentas de usuario (solo admin) ======
export function CuentasAdmin({ usuarioAdmin, claveAdmin }: { usuarioAdmin: string; claveAdmin: string }) {
  const [cedula, setCedula] = useState('');
  const [idProf, setIdProf] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');

  const crearEstudiante = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setAviso('');
    try {
      const res = await post<{ usuario: string; clave_temporal: string }>(
        '/auth/crear-cuenta-estudiante',
        { id_estudiante: cedula.trim() },
        true,
      );
      setAviso(`Cuenta estudiante ${res.usuario} creada · clave temporal: ${res.clave_temporal}`);
      setCedula('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la cuenta.');
    }
  };

  const crearProfesor = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setAviso('');
    try {
      const res = await post<{ usuario: string; clave_temporal: string }>(
        '/auth/crear-cuenta-profesor',
        { id_profesor: idProf.trim() },
        true,
      );
      setAviso(`Cuenta profesor ${res.usuario} creada · clave temporal: ${res.clave_temporal}`);
      setIdProf('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la cuenta.');
    }
  };

  const restablecer = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setAviso('');
    try {
      const res = await post<{ usuario: string; clave_temporal: string }>('/auth/restablecer-clave', {
        usuario_admin: usuarioAdmin,
        clave_admin: claveAdmin,
        usuario_objetivo: objetivo.trim(),
      });
      setAviso(`Clave temporal de ${res.usuario}: ${res.clave_temporal}`);
      setObjetivo('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo restablecer la clave.');
    }
  };

  return (
    <>
      {error && <p className="login-error">{error}</p>}
      {aviso && (
        <p className="login-error" style={{ background: 'var(--teal-soft)', borderColor: 'var(--teal-border)', color: 'var(--teal)' }}>
          {aviso}
        </p>
      )}
      <div>
        <h2 className="section-title">Cuentas de usuario</h2>
        <p className="section-sub">Crea cuentas con clave temporal de un solo uso y restablece claves existentes.</p>
      </div>
      <div className="stat-grid">
        <form className="stat-card" onSubmit={crearEstudiante} style={{ gap: 12 }}>
          <span className="stat-label">Cuenta de estudiante</span>
          <input
            className="input-field"
            placeholder="Cédula registrada (ej. 1002)"
            value={cedula}
            onChange={(e) => setCedula(e.target.value)}
            required
          />
          <button type="submit" className="btn-primary">Crear cuenta estudiante</button>
        </form>
        <form className="stat-card" onSubmit={crearProfesor} style={{ gap: 12 }}>
          <span className="stat-label">Cuenta de profesor</span>
          <input
            className="input-field"
            placeholder="ID del profesor (ej. PR04)"
            value={idProf}
            onChange={(e) => setIdProf(e.target.value)}
            required
          />
          <button type="submit" className="btn-primary">Crear cuenta profesor</button>
        </form>
        <form className="stat-card" onSubmit={restablecer} style={{ gap: 12 }}>
          <span className="stat-label">Restablecer clave</span>
          <input
            className="input-field"
            placeholder="Usuario (ej. 1001 o PR01)"
            value={objetivo}
            onChange={(e) => setObjetivo(e.target.value)}
            required
          />
          <button type="submit" className="btn-ghost">Generar clave temporal</button>
        </form>
      </div>
    </>
  );
}
