import { useState, useCallback } from 'react';
import type { Sesion, Rol } from './api/types';
import { post, setSesion, setClaveSesion, clearSesion } from './api/client';
import Login from './components/Login';
import RecoverPassword from './components/RecoverPassword';
import Resumen from './views/Resumen';
import Matricular from './views/Matricular';
import Registro from './views/Registro';
import MisNotas from './views/MisNotas';
import MisTareas from './views/MisTareas';

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
  const [seccion, setSeccion] = useState('resumen');

  const iniciarSesion = useCallback(async (usuario: string, clave: string) => {
    const s = await post<Sesion>('/auth/login', { usuario, clave });
    if (s.debe_cambiar_clave) {
      // TODO: dialogo de cambio de clave obligatorio
      console.warn('debe_cambiar_clave: true');
    }
    setSesion(s);
    setClaveSesion(clave);
    setSesionLocal(s);
    setVista('app');
    setSeccion('resumen');
  }, []);

  const cerrarSesion = useCallback(() => {
    clearSesion();
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
                <button className="accion-card" onClick={() => window.open('http://localhost:8000/pdf/matricula/' + sesion.id_persona, '_blank')}>
                  <span className="accion-icon">⇩</span>
                  <span className="accion-texto">Recibo de matrícula</span>
                  <span className="accion-sub">PDF con radicado</span>
                </button>
                <button className="accion-card" onClick={() => window.open('http://localhost:8000/pdf/notas/' + sesion.id_persona, '_blank')}>
                  <span className="accion-icon">⇩</span>
                  <span className="accion-texto">Boletín de notas</span>
                  <span className="accion-sub">PDF completo</span>
                </button>
              </div>
            </div>
          )}
          {['ingresarnotas', 'tareas', 'reportes', 'facultades', 'programas', 'materias', 'profesores', 'estudiantes', 'periodos', 'cuentas'].includes(seccion) && (
            <div className="stat-card" style={{ textAlign: 'center', padding: 48, gridColumn: '1/-1' }}>
              <span className="section-sub">Vista "{seccionActual?.label}" — en construcción.</span>
            </div>
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
