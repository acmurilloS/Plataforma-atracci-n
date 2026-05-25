# Deploy a producción — Plataforma de Atracción EQUITEL

> Guía paso a paso para llevar la plataforma de emulador local a un URL
> público con datos reales en Firebase + Firebase Hosting.

---

## Pre-requisitos

- Cuenta Google con permiso de crear proyectos Firebase
- Tarjeta de crédito (plan **Blaze pago por uso** — Cloud Functions exige facturación)
- `firebase-tools` instalado globalmente: `npm install -g firebase-tools`
- Node 20+ y npm

## Stack del deploy

| Componente | Servicio |
|---|---|
| Frontend SPA (React + Vite) | Firebase Hosting |
| Base de datos | Cloud Firestore |
| Autenticación | Firebase Auth (Email/Password + Google) |
| Archivos (PDFs de aval, CVs) | Firebase Storage |
| Functions (consecutivos, sourcing IA, tickets) | Cloud Functions Node 20 |

Un solo CLI (`firebase`), un solo proyecto, una sola región.

---

## Paso 1 · Crear el proyecto Firebase

1. Entrar a https://console.firebase.google.com
2. Click **"Agregar proyecto"**
3. Nombre sugerido: `equitel-atraccion` (el ID quedará algo como `equitel-atraccion-XXXX`)
4. Desactivar Google Analytics por ahora (se puede agregar después)
5. Esperar a que termine la creación (~30 segundos)

## Paso 2 · Habilitar billing (plan Blaze)

Cloud Functions **no funciona en plan Spark gratuito** (firebase-tools >= 14 requiere Blaze).

1. En el proyecto recién creado: menú izquierdo → **"Uso y facturación"**
2. Click **"Modificar plan"** → seleccionar **Blaze**
3. Asociar una tarjeta de crédito (Google ofrece $300 USD de crédito inicial)
4. Confirmar

> **Estimación de costo real para este proyecto:**
> - Spark gratis cubría todo el uso esperado (30-50 vacantes/año)
> - En Blaze, el tier gratuito (50K reads/día, 20K writes/día, 5GB storage) cubre el uso normal
> - Cloud Functions: ~2M invocations gratis/mes
> - Costo esperado real: $0 a $5 USD/mes mientras el uso esté en esos rangos

## Paso 3 · Habilitar los productos Firebase

Desde el menú izquierdo del proyecto, activar uno por uno:

### 3.1 Authentication
1. **Build → Authentication → Get started**
2. Pestaña "Sign-in method":
   - Habilitar **Email/Password** (sin "Email link")
   - Habilitar **Google** (configurar con el correo del proyecto)
3. Pestaña "Authorized domains" — verificar que aparezca el dominio que dará Firebase Hosting (ej. `equitel-atraccion.web.app`)

### 3.2 Firestore Database
1. **Build → Firestore Database → Create database**
2. Modo: **Production mode** (las reglas se sobreescriben con las del repo en el paso 6)
3. Región: **southamerica-east1** (São Paulo) — cercano a Colombia, baja latencia. NO se puede cambiar después.

### 3.3 Storage
1. **Build → Storage → Get started**
2. Modo: **Production mode**
3. Misma región que Firestore (heredada automáticamente)

### 3.4 Functions
1. **Build → Functions → Get started**
2. Solo confirmar — el deploy real se hace desde el CLI en el paso 6

## Paso 4 · Registrar la app web y obtener credenciales

1. ⚙ **Configuración del proyecto** (rueda al lado de "Resumen del proyecto")
2. Pestaña **"General"** → sección **"Tus apps"**
3. Click ícono **Web `</>`**
4. Nombre: `Plataforma EQUITEL Prod`
5. **NO** marcar "Configurar Firebase Hosting" todavía (lo hacemos desde el CLI)
6. Click **Registrar app**
7. Firebase mostrará un bloque con `firebaseConfig` — **copiar todos los valores**:
   ```js
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "equitel-atraccion-XXXX.firebaseapp.com",
     projectId: "equitel-atraccion-XXXX",
     storageBucket: "equitel-atraccion-XXXX.appspot.com",
     messagingSenderId: "123456789012",
     appId: "1:123...:web:abc..."
   };
   ```

## Paso 5 · Configurar el repo local con esas credenciales

1. En la raíz del proyecto local, copiar el template:
   ```powershell
   Copy-Item .env.production.example .env.production
   ```
2. Editar `.env.production` y llenar cada variable con los valores del paso 4
3. Confirmar que `VITE_USE_EMULATORS=false`

4. Actualizar `.firebaserc` para apuntar al proyecto real:
   ```json
   {
     "projects": {
       "default": "equitel-atraccion-XXXX"
     }
   }
   ```
   (reemplazar `equitel-atraccion-XXXX` con tu `projectId` real)

## Paso 6 · Login y primer deploy

```powershell
# Autenticarse (abre navegador)
firebase login

# Confirmar que apunta al proyecto correcto
firebase projects:list
firebase use default

# Instalar dependencias del frontend y de functions
npm install
cd functions
npm install
cd ..

# Build del frontend
npm run build

# Deploy de TODO: reglas + índices + storage + functions + hosting
firebase deploy
```

El primer deploy demora **5 a 10 minutos** (las Cloud Functions tardan en aprovisionar).

Al terminar, Firebase imprime el URL del hosting. Algo como:
```
✔ Deploy complete!
Hosting URL: https://equitel-atraccion-XXXX.web.app
```

## Paso 7 · Crear el primer admin

Sin emulador no hay `seedInicial` automático. Hay que crear al menos un admin a mano:

1. En Firebase Console → **Authentication → Users → Add user**
2. Email: `admin@equitel.com.co` (o el correo real de Karen / quien sea)
3. Password: temporal seguro (ese usuario lo cambia al primer login)
4. Copiar el **UID** que asigna Firebase

5. Asignar el custom claim `rol=admin` desde el shell de funciones:
   ```powershell
   # En la raíz del proyecto
   firebase functions:shell
   ```
   En el REPL:
   ```js
   const admin = require('firebase-admin');
   admin.initializeApp({ projectId: 'equitel-atraccion-XXXX' });
   admin.auth().setCustomUserClaims('PEGAR_UID_AQUI', { rol: 'admin' }).then(() => console.log('OK'));
   ```

6. Crear su documento en `usuarios/{uid}` desde Firestore Console:
   ```
   {
     id: "PEGAR_UID_AQUI",
     email: "admin@equitel.com.co",
     nombre: "Admin",
     apellido: "Plataforma",
     rol: "admin",
     activo: true,
     creado_en: <serverTimestamp manual>,
     creado_por: "system",
     actualizado_en: <serverTimestamp manual>,
     actualizado_por: "system"
   }
   ```

7. **Cerrar sesión y volver a entrar** en la app — el token nuevo trae el claim `rol=admin`.

8. Desde `/admin/catalogos → Seed`, ejecutar el seed inicial. Eso crea empresas, sedes, cargos, festivos y los 5 usuarios de prueba.
   - **Importante:** en prod los usuarios de prueba `admin@equitel.test`, `lider@equitel.test`, etc. **no se deben mantener**. Eliminarlos desde Auth Console después del primer setup o ajustar `seedInicial.ts` para no crearlos en prod.

## Paso 8 · Configurar dominio custom (opcional)

Si quieres un dominio propio (ej. `atraccion.equitel.com.co`):

1. Firebase Console → **Hosting → Add custom domain**
2. Seguir el wizard (verificación de DNS con TXT, luego A/AAAA records)
3. Demora 24-48 hrs en propagar
4. Agregar el dominio a **Authentication → Settings → Authorized domains**

## Paso 9 · Verificación end-to-end en prod

Recorrer al menos:

- [ ] Login con admin funciona y trae el rol correcto
- [ ] Catálogos cargan (empresas, sedes, cargos)
- [ ] Crear vacante de prueba con aval PDF → consecutivo se asigna por Function
- [ ] El líder de prueba ve solo sus vacantes
- [ ] Landing pública `/carreras/:id` funciona en incógnito (auth anónimo)
- [ ] Subida de CV en PDF funciona
- [ ] Notificaciones (campana) cargan sin error
- [ ] El emulador ya no se está usando (validar que la Network del browser apunta a `*.googleapis.com`, NO a `localhost:8080`)

## Re-deploys futuros

Cada vez que haya cambios:

```powershell
npm run build
firebase deploy
```

O para partes específicas:

```powershell
firebase deploy --only hosting          # solo frontend
firebase deploy --only functions        # solo Cloud Functions
firebase deploy --only firestore:rules  # solo reglas Firestore
```

## Rollback de hosting

```powershell
firebase hosting:clone equitel-atraccion-XXXX:live equitel-atraccion-XXXX:live --version <version-id>
```

Las versiones anteriores se ven en Console → Hosting → Release history.

---

## Habeas Data y privacidad

**Antes de aceptar datos reales** en prod:

- [ ] El primer contacto a candidatos sourceados/postulados debe incluir el opt-in de Ley 1581/2012
- [ ] El bucket de Storage tiene reglas que solo permiten leer a usuarios autenticados
- [ ] Auditoría en `eventos/` queda activa (los hooks ya lo hacen)
- [ ] Decidir política de retención: ¿cuánto tiempo se guardan CVs descartados? Karen + legal
- [ ] Plantilla de autorización de datos (`AutorizacionPage`) está vigente y descargable

## Soporte y monitoreo

- Logs de Cloud Functions: Firebase Console → Functions → Logs
- Errores del frontend: considerar agregar Sentry o LogRocket (no incluido aún)
- Alertas de billing: Console → Billing → Budgets & alerts (crear alerta a $20/mes para detectar usos inesperados)
