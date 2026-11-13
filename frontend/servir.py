"""Servidor local del frontend. Ejecutar: python servir.py"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

if __name__ == '__main__':
    handler = partial(SimpleHTTPRequestHandler, directory=str(Path(__file__).resolve().parent))
    print('Frontend disponible en http://localhost:5173 — Ctrl+C para detener', flush=True)
    try:
        ThreadingHTTPServer(('127.0.0.1', 5173), handler).serve_forever()
    except KeyboardInterrupt:
        pass
    except OSError as error:
        raise SystemExit(f'No se pudo iniciar el puerto 5173: {error}')
