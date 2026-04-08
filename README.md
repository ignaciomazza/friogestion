# Frio Gestion

Sistema de gestion para comercios tecnicos (ferreteria, refrigeracion, insumos).

## Requisitos
- Node.js 18+
- Postgres local (sin Docker)

## Base de datos (sin Docker)

Opcion A: Homebrew
```bash
brew install postgresql@16
brew services start postgresql@16
createdb friogestion
```

Opcion B: Postgres.app
- Instala Postgres.app, inicia el servicio y crea la base `friogestion`.

## Configuracion
1. Copia las variables de entorno:
   - `cp .env.example .env`
2. Ajusta `DATABASE_URL` y `JWT_SECRET` en `.env`.
3. (Opcional) Completa `AFIP_CUIT` y `AFIP_ACCESS_TOKEN` si vas a probar Afip SDK.

## Prisma + seed
```bash
npx prisma migrate dev -n init
npx prisma db seed
```

## Desarrollo
```bash
npm run dev
```

## Calidad
```bash
npm run lint
npm run test
npm run build
```

- CI automatizado en `.github/workflows/ci.yml`.
- Healthcheck: `GET /api/health`.

## Login demo
- Email: `admin@friogestion.local`
- Password: `admin1234`

## Notas
- Multi-empresa: usar el selector "Empresa" en la topbar para cambiar de organizacion.
- Cotizacion USD: cargar en `/app/config`.
- Admin basico: `/app/admin` (crear organizaciones, usuarios y roles).
- PDF demo: `/api/pdf/demo`.

## AFIP SDK (preparacion)
Instalado con `@afipsdk/afip.js`. Para habilitarlo:
- Obtener `access_token` en https://app.afipsdk.com
- Configurar `AFIP_CUIT` y `AFIP_ACCESS_TOKEN` en `.env`
- Opcional: `AFIP_CERT_BASE64` y `AFIP_KEY_BASE64` para fallback global

## Seguridad de acceso
- El endpoint `POST /api/auth/register` queda habilitado solo para bootstrap inicial (cuando no existe ningun usuario).
- El alta normal de usuarios se hace desde `/app/admin`.

## Arquitectura
- Lineamientos y convenciones: `docs/ARCHITECTURE.md`
- Flujo AFIP/ARCA: `docs/AFIP_ARCA.md`

## Deploy
- Guia de salida a produccion (GitHub + Vercel + DigitalOcean): `docs/DEPLOY_PRODUCCION.md`
