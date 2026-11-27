import { useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';

interface LoginProps {
  onLogin: (usuario: string, clave: string) => Promise<void>;
  onRecover: () => void;
}

export default function Login({ onLogin, onRecover }: LoginProps) {
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!usuario.trim() || !clave) return;
    setCargando(true);
    try {
      await onLogin(usuario.trim(), clave);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Usuario o contraseña incorrectos.');
      } else {
        setError(err instanceof Error ? err.message : 'Error al iniciar sesión.');
      }
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo">U</div>
          <div>
            <div className="login-title">Campus UCC</div>
            <div className="login-sub">Gestión Académica</div>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="input-label" htmlFor="usuario">Usuario</label>
            <input
              id="usuario"
              className="input-field"
              type="text"
              placeholder="admin o cédula"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              autoComplete="off"
              required
            />
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="clave">Clave</label>
            <input
              id="clave"
              className="input-field"
              type="password"
              placeholder="••••••••"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              required
            />
          </div>

          {error && <p className="login-error">{error}</p>}

          <button type="submit" className="btn-primary" disabled={cargando}>
            {cargando ? 'Iniciando…' : 'Iniciar sesión'}
          </button>
        </form>

        <button className="btn-ghost" onClick={onRecover}>
          ¿Olvidaste tu clave?
        </button>

        <div className="login-credits">
          <span>Desarrollado por</span>
          <b>Santiago Patino Rios</b>
          <span>·</span>
          <b>Jairo Enrique Arboleda</b>
          <span className="login-credits-ucc">Ingenieria de Sistemas · UCC Sede Cali</span>
        </div>
      </div>
    </div>
  );
}
