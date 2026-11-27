import { useState, useCallback } from 'react';
import type { Sesion, Rol } from './api/types';
import { post, setSesion, setClaveSesion, clearSesion } from './api/client';
import Login from './components/Login';
import RecoverPassword from './components/RecoverPassword';
import Resumen from './views/Resumen';

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
          <Resumen rol={sesion.rol} cedula={sesion.id_persona} />
        </main>
      </div>
    </div>
  );
}
