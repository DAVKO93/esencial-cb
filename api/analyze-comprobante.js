export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { imageBase64 } = req.body || {}
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 requerido' })

  const keyRaw = process.env.GOOGLE_VISION_KEY
  if (!keyRaw) return res.status(500).json({ error: 'GOOGLE_VISION_KEY no configurada' })

  let credentials
  try {
    credentials = JSON.parse(keyRaw)
  } catch {
    return res.status(500).json({ error: 'GOOGLE_VISION_KEY formato invalido' })
  }

  try {
    // Obtener token de acceso con JWT
    const jwt = await getGoogleToken(credentials)

    // Llamar a Cloud Vision API
    const response = await fetch(
      'https://vision.googleapis.com/v1/images:annotate',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwt}`
        },
        body: JSON.stringify({
          requests: [{
            image: { content: imageBase64 },
            features: [{ type: 'TEXT_DETECTION', maxResults: 1 }]
          }]
        })
      }
    )

    const data = await response.json()
    if (!response.ok) return res.status(502).json({ error: 'Error Vision API', detail: data })

    const textoCompleto = data.responses?.[0]?.fullTextAnnotation?.text || ''
    
    // Extraer los 5 campos del texto usando patrones
    const campos = extraerCampos(textoCompleto)
    return res.status(200).json(campos)

  } catch (err) {
    return res.status(500).json({ error: 'Error interno', detail: err.message })
  }
}

function extraerCampos(texto) {
  const lineas = texto.split('\n').map(l => l.trim()).filter(Boolean)
  const resultado = { monto: '', remitente: '', fecha: '', cuentaOrigen: '', nroComprobante: '' }

  for (const linea of lineas) {
    const l = linea.toLowerCase()

    // Monto — buscar patrones como $9.00, USD 9.00, valor: 9.00
    if (!resultado.monto) {
      const monto = linea.match(/\$\s*[\d.,]+|\b(?:valor|monto|total|amount)[:\s]+\$?[\d.,]+/i)
      if (monto) resultado.monto = monto[0].trim()
    }

    // Fecha — DD/MM/YYYY o YYYY-MM-DD o variantes
    if (!resultado.fecha) {
      const fecha = linea.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{2}[\/\-]\d{2}/)
      if (fecha) resultado.fecha = fecha[0]
    }

    // N° comprobante — número largo o referencia
    if (!resultado.nroComprobante) {
      if (l.includes('comprobante') || l.includes('referencia') || l.includes('transacci') || l.includes('número')) {
        const num = linea.match(/\d{6,}/)
        if (num) resultado.nroComprobante = num[0]
      }
    }

    // Remitente — nombre después de "de:", "origen:", "ordenante:"
    if (!resultado.remitente) {
      if (l.includes('de:') || l.includes('origen:') || l.includes('ordenante') || l.includes('remitente')) {
        const idx = linea.indexOf(':')
        if (idx !== -1) resultado.remitente = linea.slice(idx + 1).trim()
      }
    }

    // Cuenta origen
    if (!resultado.cuentaOrigen) {
      if (l.includes('cuenta') && (l.includes('origen') || l.includes('débito') || l.includes('debito'))) {
        const num = linea.match(/\d{6,}/)
        if (num) resultado.cuentaOrigen = num[0]
      }
    }
  }

  return resultado
}

// Genera un token JWT para Google APIs sin librerías externas
async function getGoogleToken(credentials) {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-vision',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }

  const b64Header = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const b64Payload = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const unsigned = `${b64Header}.${b64Payload}`

  // Importar clave privada
  const pemKey = credentials.private_key
  const keyData = pemKey
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '')
  const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(unsigned)
  )

  const b64Sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const jwt = `${unsigned}.${b64Sig}`

  // Intercambiar JWT por access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  })
  const tokenData = await tokenRes.json()
  return tokenData.access_token
}