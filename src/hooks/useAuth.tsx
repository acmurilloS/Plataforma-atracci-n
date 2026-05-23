import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
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
  cerrarSesion: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

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
          setPerfil({ id: snap.id, ...(snap.data() as Omit<UsuarioDoc, 'id'>) });
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

  async function cerrarSesion() {
    await signOut(auth);
  }

  return (
    <AuthContext.Provider
      value={{ user, perfil, rol: perfil?.rol ?? null, cargando, iniciarSesion, cerrarSesion }}
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
