import { useState, type FormEvent } from 'react';
import { post } from '../api/client';
import { ApiError } from '../api/client';
import type { RecuperacionRespuesta } from '../api/types';

interface RecoverPasswordProps {
  onBack: () => void;
}

type Paso = 'solicitar' | 'confirmar' | 'exito';

export default function RecoverPassword({ onBack }: RecoverPasswordProps) {
  const [paso, setPaso] = useState<Paso>('solicitar');
  const [identificador, setIdentificador] = useState('');
  const [token, setToken] = useState('');
  const [claveNueva, setClaveNueva] = useState('');
  const [error, setError] = useState('');
  const [tokenDev, setTokenDev] = useState('');
  const [cargando, setCargando] = useState(false);

  const handleSolicitar = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!identificador.trim()) return;
    setCargando(true);
    try {
      const res = await post<RecuperacionRespuesta>('/auth/recuperar-clave', {
        identificador: identificador.trim(),
      });
      if (res.token) {
        // Modo desarrollo: la API devuelve el token para probar el flujo.
        setTokenDev(res.token);
        setToken(res.token);
      }
      setPaso('confirmar');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el código.');
    } finally {
      setCargando(false);
    }
  };

  const handleConfirmar = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!token.trim() || !claveNueva) return;
    if (claveNueva.length < 8) {
      setError('La clave nueva debe tener al menos 8 caracteres.');
      return;
    }
    setCargando(true);
    try {
      await post('/auth/recuperar-clave/confirmar', {
        token: token.trim(),
        clave_nueva: claveNueva,
      });
      setPaso('exito');
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo cambiar la clave.');
      }
    } finally {
      setCargando(false);
    }
  };

  if (paso === 'exito') {
    return (
      <div className="login-screen">
        <div className="recover-card">
          <div className="recover-title">Clave restablecida</div>
          <p className="recover-success">
            Tu contraseña fue actualizada. Ya puedes iniciar sesión con tu nueva clave.
          </p>
          <button className="btn-primary" onClick={onBack}>
            Volver a iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  if (paso === 'solicitar') {
    return (
      <div className="login-screen">
        <div className="recover-card">
          <div className="recover-title">Recuperar tu clave</div>
          <p className="recover-sub">
            Escribe tu usuario o el correo registrado y te enviaremos un código
            de recuperación válido por 15 minutos.
          </p>

          <form className="login-form" onSubmit={handleSolicitar}>
            <div className="input-group">
              <label className="input-label" htmlFor="ident">Usuario o correo</label>
              <input
                id="ident"
                className="input-field"
                type="text"
                placeholder="1001 o santiago.patino@ucc.edu.co"
                value={identificador}
                onChange={(e) => setIdentificador(e.target.value)}
                required
              />
            </div>

            {error && <p className="login-error">{error}</p>}

            <button type="submit" className="btn-primary" disabled={cargando}>
              {cargando ? 'Enviando…' : 'Enviar código'}
            </button>
          </form>

          <button className="btn-ghost" onClick={onBack}>
            ← Volver a iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  // paso === 'confirmar'
  return (
    <div className="login-screen">
      <div className="recover-card">
        <div className="recover-title">Escribe el código y tu nueva clave</div>
        <p className="recover-sub">
          Revisa tu correo (o la consola de la API en desarrollo) y escribe el código.
        </p>

        {tokenDev && (
          <div className="recover-token-box">
            <strong>Código (modo desarrollo):</strong>
            <br />
            {tokenDev}
          </div>
        )}

        <form className="login-form" onSubmit={handleConfirmar}>
          <div className="input-group">
            <label className="input-label" htmlFor="token">Código de recuperación</label>
            <input
              id="token"
              className="input-field"
              type="text"
              placeholder="Pega el código aquí"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="nueva">Clave nueva (mínimo 8 caracteres)</label>
            <input
              id="nueva"
              className="input-field"
              type="password"
              placeholder="••••••••"
              value={claveNueva}
              onChange={(e) => setClaveNueva(e.target.value)}
              required
            />
          </div>

          {error && <p className="login-error">{error}</p>}

          <button type="submit" className="btn-primary" disabled={cargando}>
            {cargando ? 'Cambiando…' : 'Cambiar mi clave'}
          </button>
        </form>

        <button className="btn-ghost" onClick={() => setPaso('solicitar')}>
          ← Volver
        </button>
      </div>
    </div>
  );
}
