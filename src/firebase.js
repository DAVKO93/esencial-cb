import { initializeApp } from 'firebase/app'
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyD86yCDTkQnhl26o_sy3iERZE003keD3sA",
  authDomain: "esencial-cb.firebaseapp.com",
  projectId: "esencial-cb",
  storageBucket: "esencial-cb.firebasestorage.app",
  messagingSenderId: "756744308004",
  appId: "1:756744308004:web:4f295bfc2e78b69f059fb1"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)

// Activar persistencia offline (IndexedDB)
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('Offline: multiples pestanas abiertas')
  } else if (err.code === 'unimplemented') {
    console.warn('Offline: navegador no soportado')
  }
})