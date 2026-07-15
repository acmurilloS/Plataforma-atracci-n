import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type { RolUsuario, UsuarioDoc } from '../schemas';

interface AuthContextValue {
  user: User | null;
  perfil: UsuarioDoc | null;
  rol: RolUsuario | null;
  cargando: boolean;
  iniciarSesion: (email: string, pwd: string) => Promise<void>;
  iniciarSesionGoogle: () => Promise<void>;
  enviarResetPassword: (email: string) => Promise<void>;
  cerrarSesion: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Alinea el token con el doc de usuario.
 *
 * Hay DOS fuentes del rol: el doc `usuarios/{uid}` (lo lee la UI) y el custom
 * claim del token (lo leen las reglas de Firestore). Cuando un admin asigna o
 * cambia un rol, el doc se actualiza al instante pero el token de esa persona
 * sigue con el claim viejo hasta que Firebase lo rote (~1 h). En esa ventana la
 * UI la deja entrar y las reglas la rechazan: la app se ve rota sin error claro.
 *
 * Antes no se notaba porque las reglas solo pedían `signedIn()`. Desde que la
 * lectura exige `interno()` (rol en el claim), la ventana sí importa — así que
 * al detectar el desfase forzamos el refresco del token (auditoría PII 15-jul).
 */
async function sincronizarClaim(user: User, rolDoc: string | null | undefined) {
  if (!rolDoc) return;
  try {
    const { claims } = await user.getIdTokenResult();
    if (claims.rol !== rolDoc) await user.getIdToken(true);
  } catch {
    /* si falla, el token se renueva solo más tarde */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [perfil, setPerfil] = useState<UsuarioDoc | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        if (!u) {
          setPerfil(null);
          setCargando(false);
        }
      }),
    [],
  );

  useEffect(() => {
    if (!user) return;
    const ref = doc(db, 'usuarios', user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const p = { id: snap.id, ...(snap.data() as Omit<UsuarioDoc, 'id'>) };
          setPerfil(p);
          void sincronizarClaim(user, p.rol);
        } else {
          setPerfil(null);
        }
        setCargando(false);
      },
      () => setCargando(false),
    );
    return unsub;
  }, [user]);

  async function iniciarSesion(email: string, pwd: string) {
    await signInWithEmailAndPassword(auth, email, pwd);
  }

  async function iniciarSesionGoogle() {
    // El emulador soporta un popup simulado; en prod usa el OAuth real
    // configurado en Firebase Console.
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ hd: 'equitel.com.co' }); // sugiere dominio corporativo
    await signInWithPopup(auth, provider);
  }

  async function enviarResetPassword(email: string) {
    await sendPasswordResetEmail(auth, email);
  }

  async function cerrarSesion() {
    await signOut(auth);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        perfil,
        rol: perfil?.rol ?? null,
        cargando,
        iniciarSesion,
        iniciarSesionGoogle,
        enviarResetPassword,
        cerrarSesion,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fuera de AuthProvider');
  return ctx;
}
