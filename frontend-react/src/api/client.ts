// ====== Cliente de la API: tipado, manejo de errores y sesion en memoria ======

import type { Sesion } from './types';

const BASE_URL = 'http://localhost:8000';

let sesion: Sesion | null = null;

export function getSesion(): Sesion | null {
  return sesion;
}

export function setSesion(s: Sesion | null): void {
  sesion = s;
}

export function headersAuth(): Record<string, string> {
  if (!sesion) return {};
  // Guardamos la clave al momento del login para reenviarla en cada peticion.
  // La clave vive solo en este modulo, nunca en localStorage ni cookies.
  return { 'X-Usuario': sesion.usuario, 'X-Clave': _claveSesion };
}

let _claveSesion = '';

export function setClaveSesion(clave: string): void {
  _claveSesion = clave;
}

export function clearSesion(): void {
  sesion = null;
  _claveSesion = '';
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  auth: boolean = false,
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (auth && sesion) {
    headers['X-Usuario'] = sesion.usuario;
    headers['X-Clave'] = _claveSesion;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(BASE_URL + path, { ...options, headers, signal: controller.signal });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = (body as Record<string, unknown>)?.detail;
      let message = typeof detail === 'string' ? detail : `Error ${res.status}`;
      if (Array.isArray(detail)) {
        message = (detail as { loc: string[]; msg: string }[])
          .map((e) => `${e.loc?.slice(1).join('.')}: ${e.msg}`)
          .join(' · ');
      }
      throw new ApiError(res.status, message);
    }
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(0, 'La API tardó demasiado. Verifica si el backend está corriendo.');
    }
    throw new ApiError(0, 'No se pudo conectar con la API. Iníciala en localhost:8000.');
  } finally {
    clearTimeout(timer);
  }
}

// GET publico (sin sesion)
export async function get<T>(path: string): Promise<T> {
  return request<T>(path);
}

// GET autenticado
export async function getAuth<T>(path: string): Promise<T> {
  return request<T>(path, {}, true);
}

// POST con JSON
export async function post<T>(
  path: string,
  data: unknown,
  auth: boolean = false,
): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }, auth);
}

// POST con FormData (archivos)
export async function postForm<T>(path: string, formData: FormData, auth: boolean = false): Promise<T> {
  return request<T>(path, { method: 'POST', body: formData }, auth);
}

// PUT con JSON
export async function put<T>(path: string, data: unknown, auth: boolean = true): Promise<T> {
  return request<T>(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }, auth);
}

// DELETE
export async function del<T>(path: string, auth: boolean = true): Promise<T> {
  return request<T>(path, { method: 'DELETE' }, auth);
}
