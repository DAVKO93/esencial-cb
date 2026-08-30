// Genera los parámetros de autenticación que ImageKit exige para subir
// archivos desde el celular (navegador) sin exponer la clave privada.
// La clave privada vive SOLO aquí, en el servidor (variable de entorno de
// Vercel) — nunca llega al código que corre en el celular del empleado.
import crypto from 'crypto'

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY
  if (!privateKey) return res.status(500).json({ error: 'IMAGEKIT_PRIVATE_KEY no configurada en Vercel' })

  const token = crypto.randomUUID()
  const expire = Math.floor(Date.now() / 1000) + 1800 // válido por 30 minutos
  const signature = crypto.createHmac('sha1', privateKey).update(token + expire).digest('hex')

  return res.status(200).json({ token, expire, signature })
}
