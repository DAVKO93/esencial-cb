import { initializeApp } from 'firebase/app'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: "AIzaSyD86yCDTkQnhl26o_sy3iERZE003keD3sA",
  authDomain: "esencial-cb.firebaseapp.com",
  projectId: "esencial-cb",
  storageBucket: "esencial-cb.firebasestorage.app",
  messagingSenderId: "756744308004",
  appId: "1:756744308004:web:4f295bfc2e78b69f059fb1"
}

const app = initializeApp(firebaseConfig)

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
})

export const auth = getAuth(app)
export const storage = getStorage(app)

setPersistence(auth, browserLocalPersistence).catch(() => {})