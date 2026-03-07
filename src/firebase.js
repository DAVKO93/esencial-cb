import { initializeApp } from 'firebase/app'
import { getFirestore, initializeFirestore, persistentLocalCache } from 'firebase/firestore'
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyD86yCDTkQnhl26o_sy3iERZE003keD3sA",
  authDomain: "esencial-cb.firebaseapp.com",
  projectId: "esencial-cb",
  storageBucket: "esencial-cb.firebasestorage.app",
  messagingSenderId: "756744308004",
  appId: "1:756744308004:web:4f295bfc2e78b69f059fb1"
}

const app = initializeApp(firebaseConfig)

// Intentar con caché persistente — si IndexedDB fue borrado/bloqueado, caer a modo normal
let db
try {
  db = initializeFirestore(app, { localCache: persistentLocalCache() })
} catch {
  db = getFirestore(app)
}

export { db }
export const auth = getAuth(app)

// Sesión activa sin internet
setPersistence(auth, browserLocalPersistence).catch(() => {})