# Deploy a Produccion (GitHub + Vercel + DigitalOcean)

Este documento deja un camino simple y repetible para publicar **Frio Gestion**.

## 1) Pre-flight local

Antes de subir:

```bash
npm run lint
npm run test
npm run build
```

Verifica tambien que `.env` local tenga al menos:

- `DATABASE_URL`
- `JWT_SECRET`
- `PUBLIC_ID_SECRET`
- `ARCA_SECRETS_KEY` o `AFIP_SECRET_KEY`

## 2) Subir el repo a GitHub (nuevo)

1. Crea un repo vacio en GitHub (sin README ni `.gitignore`).
2. Desde este proyecto:

```bash
git add .
git commit -m "chore: preparar deploy a produccion"
git branch -M main
git remote add origin git@github.com:<tu-usuario>/friogestion.git
git push -u origin main
```

Si prefieres HTTPS:

```bash
git remote add origin https://github.com/<tu-usuario>/friogestion.git
git push -u origin main
```

## 3) Crear PostgreSQL en DigitalOcean

1. Crea un cluster administrado de PostgreSQL.
2. Crea base de datos `friogestion`.
3. Crea un usuario de app dedicado (no uses `doadmin` en app productiva).
4. Copia el **connection string** desde Connection Details.
5. Deja `sslmode=require` (o `verify-full` con certificado CA si lo prefieres).

Notas:

- Para una primera salida a produccion, usa URL directa del cluster en `DATABASE_URL`.
- Si mas adelante usas pool de conexiones, manten una URL directa separada para tareas administrativas (migraciones, dumps, etc.).

## 4) Configurar variables en Vercel

En Vercel (`Project -> Settings -> Environment Variables`) carga, como minimo:

- `DATABASE_URL` (Postgres de DigitalOcean)
- `JWT_SECRET`
- `PUBLIC_ID_SECRET`
- `AFIP_ENV`
- `ARCA_SECRETS_KEY` o `AFIP_SECRET_KEY`
- Si aplica AFIP real: `AFIP_CUIT`, `AFIP_ACCESS_TOKEN`, `AFIP_SDK_ACCESS_TOKEN`, `AFIP_CERT_BASE64`, `AFIP_KEY_BASE64`

Para generar secretos fuertes:

```bash
openssl rand -base64 32
```

Recomendado:

- Definir variables para `Production`, `Preview` y `Development` por separado.
- Si usas previews, apuntarlas a una base distinta para evitar tocar esquema de produccion.

## 5) Crear el proyecto en Vercel

1. Importa el repo de GitHub.
2. Framework detectado: `Next.js`.
3. En `Build and Deployment Settings`, usa:

```bash
npm run vercel-build
```

4. Guarda y ejecuta el primer deploy.

El script `vercel-build` aplica migraciones pendientes y luego compila.

## 6) Conectar dominio `friogestion.com`

1. En Vercel: `Project -> Settings -> Domains`.
2. Agrega:
   - `friogestion.com`
   - `www.friogestion.com`
3. En tu proveedor DNS, configura exactamente los registros que Vercel indique en esa pantalla.

Valores tipicos de referencia (pueden variar):

- Apex (`@`): registro `A` hacia `76.76.21.21`
- `www`: registro `CNAME` hacia `cname.vercel-dns-0.com`

## 7) Primera validacion post deploy

Checklist rapido:

1. `GET /api/health` responde 200.
2. Login funciona.
3. Crear/editar datos basicos (cliente/producto) funciona.
4. No hay errores en Runtime Logs de Vercel.
5. SSL activo en `https://friogestion.com`.

## 8) Flujo de cambios en produccion

Para cambios de esquema:

1. Crear migracion en local con `npm run prisma:migrate`.
2. Commitear carpeta `prisma/migrations`.
3. Push a `main`.
4. Vercel ejecuta `npm run vercel-build` y aplica `prisma migrate deploy`.
