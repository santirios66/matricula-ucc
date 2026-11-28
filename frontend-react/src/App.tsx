import { useState, useCallback } from 'react';
import type { Sesion, Rol } from './api/types';
import { post, setSesion, setClaveSesion, clearSesion, downloadArchivo } from './api/client';
import Login from './components/Login';
import RecoverPassword from './components/RecoverPassword';
import Resumen from './views/Resumen';
import Matricular from './views/Matricular';
import Registro from './views/Registro';
import MisNotas from './views/MisNotas';
import MisTareas from './views/MisTareas';
import { IngresarNotas, TareasProfesor, ReportesProfesor } from './views/ProfesorVistas';
import { CatalogoAdmin, CuentasAdmin, type ModuloKey } from './views/AdminVistas';

type Vista = 'login' | 'recuperar' | 'app';

const MENUS: Record<Rol, { key: string; label: string; icon: string }[]> = {
  Administrador: [
    { key: 'resumen', label: 'Resumen', icon: '◈' },
    { key: 'facultades', label: 'Facultades', icon: '▦' },
    { key: 'programas', label: 'Programas', icon: '▤' },
    { key: 'materias', label: 'Materias', icon: '▥' },
    { key: 'profesores', label: 'Profesores', icon: '♧' },
    { key: 'estudiantes', label: 'Estudiantes', icon: '♙' },
    { key: 'periodos', label: 'Periodos', icon: '⏱' },
    { key: 'cuentas', label: 'Cuentas', icon: '👤' },
  ],
  Estudiante: [
    { key: 'resumen', label: 'Resumen', icon: '◈' },
    { key: 'matricular', label: 'Matricular', icon: '✓' },
    { key: 'registro', label: 'Registro académico', icon: '◫' },
    { key: 'misnotas', label: 'Mis notas', icon: '✎' },
    { key: 'mistareas', label: 'Mis tareas', icon: '❑' },
    { key: 'docs', label: 'Mis documentos', icon: '⇩' },
  ],
  Profesor: [
    { key: 'resumen', label: 'Resumen', icon: '◈' },
    { key: 'ingresarnotas', label: 'Ingresar notas', icon: '✎' },
    { key: 'tareas', label: 'Tareas', icon: '❑' },
    { key: 'reportes', label: 'Reportes', icon: '⇩' },
  ],
};

export default function App() {
  const [vista, setVista] = useState<Vista>('login');
  const [sesion, setSesionLocal] = useState<Sesion | null>(null);
  const [claveActiva, setClaveActiva] = useState('');
  const [seccion, setSeccion] = useState('resumen');

  const iniciarSesion = useCallback(async (usuario: string, clave: string) => {
    const s = await post<Sesion>('/auth/login', { usuario, clave });
    setSesion(s);
    setClaveSesion(clave);
    setClaveActiva(clave);
    setSesionLocal(s);
    setVista('app');
    setSeccion('resumen');
  }, []);

  const cerrarSesion = useCallback(() => {
    clearSesion();
    setClaveActiva('');
    setSesionLocal(null);
    setVista('login');
  }, []);

  if (vista === 'login') {
    return (
      <Login
        onLogin={iniciarSesion}
        onRecover={() => setVista('recuperar')}
      />
    );
  }

  if (vista === 'recuperar') {
    return <RecoverPassword onBack={() => setVista('login')} />;
  }

  if (!sesion) return null;

  const menu = MENUS[sesion.rol] || [];
  const seccionActual = menu.find((m) => m.key === seccion) || menu[0];

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <div className="login-logo" style={{ width: 36, height: 36, fontSize: 16, borderRadius: 10 }}>
            U
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Campus UCC</div>
            <div style={{ fontSize: 9, letterSpacing: 1.5, color: 'var(--text-3)' }}>GESTIÓN ACADÉMICA</div>
          </div>
        </div>
        <p className="sidebar-label">Espacio académico</p>
        <nav className="sidebar-nav">
          {menu.map((item) => (
            <button
              key={item.key}
              className={`sidebar-item ${item.key === seccion ? 'active' : ''}`}
              onClick={() => setSeccion(item.key)}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="app-main">
        <header className="app-header">
          <div className="header-left">
            <span className="header-status" aria-hidden="true"></span>
            Portal académico <span style={{ color: 'var(--text-3)' }}>/</span>{' '}
            <b style={{ color: 'var(--text)' }}>{seccionActual?.label}</b>
          </div>
          <div className="header-right">
            <span className="header-chip">{sesion.rol}</span>
            <span>Hola, <b style={{ color: 'var(--text)' }}>{sesion.usuario}</b></span>
            <button className="btn-logout" onClick={cerrarSesion}>Cerrar sesión</button>
          </div>
        </header>

        <main className="app-content">
          {seccion === 'resumen' && <Resumen rol={sesion.rol} cedula={sesion.id_persona} onNavegar={setSeccion} />}
          {seccion === 'matricular' && sesion.rol === 'Estudiante' && <Matricular cedula={sesion.id_persona!} />}
          {seccion === 'registro' && sesion.rol === 'Estudiante' && <Registro cedula={sesion.id_persona!} />}
          {seccion === 'misnotas' && sesion.rol === 'Estudiante' && <MisNotas cedula={sesion.id_persona!} />}
          {seccion === 'mistareas' && sesion.rol === 'Estudiante' && <MisTareas cedula={sesion.id_persona!} />}
          {seccion === 'docs' && sesion.rol === 'Estudiante' && (
            <div>
              <h2 className="section-title">Mis documentos</h2>
              <p className="section-sub">Recibo de matrícula y boletín de notas en PDF.</p>
              <div className="acciones-grid" style={{ marginTop: 20 }}>
                <button
                  className="accion-card"
                  onClick={() => downloadArchivo(`/pdf/matricula/${sesion.id_persona}`, `Recibo_Matricula_${sesion.id_persona}.pdf`)}
                >
                  <span className="accion-icon">⇩</span>
                  <span className="accion-texto">Recibo de matrícula</span>
                  <span className="accion-sub">PDF con radicado</span>
                </button>
                <button
                  className="accion-card"
                  onClick={() => downloadArchivo(`/pdf/notas/${sesion.id_persona}`, `Reporte_Notas_${sesion.id_persona}.pdf`)}
                >
                  <span className="accion-icon">⇩</span>
                  <span className="accion-texto">Boletín de notas</span>
                  <span className="accion-sub">PDF completo</span>
                </button>
              </div>
            </div>
          )}
          {seccion === 'ingresarnotas' && sesion.rol === 'Profesor' && <IngresarNotas idProfesor={sesion.id_persona!} />}
          {seccion === 'tareas' && sesion.rol === 'Profesor' && <TareasProfesor idProfesor={sesion.id_persona!} />}
          {seccion === 'reportes' && sesion.rol === 'Profesor' && <ReportesProfesor idProfesor={sesion.id_persona!} />}
          {(['facultades', 'programas', 'materias', 'profesores', 'estudiantes', 'periodos'] as ModuloKey[]).includes(seccion as ModuloKey) &&
            sesion.rol === 'Administrador' && <CatalogoAdmin modulo={seccion as ModuloKey} />}
          {seccion === 'cuentas' && sesion.rol === 'Administrador' && (
            <CuentasAdmin usuarioAdmin={sesion.usuario} claveAdmin={claveActiva} />
          )}
        </main>

        <footer className="app-footer">
          <span>Matricula UCC v1.0</span>
          <span className="footer-team">
            Desarrollado por <b>Santiago Patino Rios</b> y <b>Jairo Enrique Arboleda Trujillo</b>
          </span>
          <span>Ingenieria de Sistemas · UCC Sede Cali</span>
        </footer>
      </div>
    </div>
  );
}
