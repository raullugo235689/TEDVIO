# TEDVIO 2.0 · Teacher Frontend

Reconstrucción paralela del espacio docente con **Vite + React + TypeScript**.

## Alcance de la fase 1

- autenticación con el proyecto Supabase existente;
- un solo cliente Supabase;
- shell persistente;
- router único;
- tema claro/oscuro;
- Inicio funcional con datos reales;
- Agenda de solo lectura;
- Grupos de solo lectura;
- puentes explícitos a TEDVIO actual para operaciones todavía no migradas.

## Principios

- no se modifica el backend ni se duplican datos;
- no se usa `innerHTML`, `MutationObserver` global ni handlers inline;
- no se introduce IA generativa;
- no se publican módulos incompletos como terminados;
- el build estático se genera en `/teacher-v2/`.

## Desarrollo

```bash
npm install
npm run quality
npm run dev
```

La aplicación lee `window.TEDVIO_CONFIG` desde `/config.js`, igual que la plataforma actual.
