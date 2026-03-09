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

  const MESES = {
    enero:'01', febrero:'02', marzo:'03', abril:'04', mayo:'05', junio:'06',
    julio:'07', agosto:'08', septiembre:'09', octubre:'10', noviembre:'11', diciembre:'12'
  }

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i]
    const l = linea.toLowerCase()
    const sig = lineas[i+1] || ''

    // MONTO — primera línea con $ seguido de número
    if (!resultado.monto && /\$\s*\d/.test(linea)) {
      const m = linea.match(/\$\s*[\d.,]+/)
      if (m) resultado.monto = m[0].replace(/\s/g, '')
    }

    // FECHA — "El 09 de marzo de 2026"
    if (!resultado.fecha) {
      const m = l.match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/)
      if (m && MESES[m[2]]) {
        resultado.fecha = `${m[1].padStart(2,'0')}/${MESES[m[2]]}/${m[3]}`
      }
      if (!resultado.fecha) {
        const mNum = linea.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/)
        if (mNum) resultado.fecha = mNum[0]
      }
    }

    // REMITENTE — línea que empieza con "De " seguida de nombre con mayúscula
    if (!resultado.remitente && /^De\s+[A-Z]/.test(linea)) {
      const nombre = linea.replace(/^De\s+/, '').trim()
      if (!nombre.toLowerCase().includes('banco')) {
        resultado.remitente = nombre
      }
    }

    // CUENTA ORIGEN — etiqueta + valor en misma línea o línea siguiente
    if (!resultado.cuentaOrigen && l.includes('cuenta origen')) {
      const parteValor = linea.replace(/cuenta origen/i, '').trim()
      const digitos = parteValor.replace(/[^0-9]/g, '')
      if (digitos.length >= 6) {
        resultado.cuentaOrigen = digitos
      } else if (sig) {
        resultado.cuentaOrigen = sig.replace(/[^0-9]/g, '')
      }
    }

    // N° COMPROBANTE — etiqueta + valor en misma línea o línea siguiente
    if (!resultado.nroComprobante && l.includes('comprobante') && !l.includes('transfer') && !l.includes('verific')) {
      const parteValor = linea
        .replace(/n\S?\s*\.?\s*de\s+comprobante/i, '')
        .replace(/comprobante/i, '').trim()
      const digitos = parteValor.replace(/[^0-9]/g, '')
      if (digitos.length >= 4) {
        resultado.nroComprobante = digitos
      } else if (sig) {
        resultado.nroComprobante = sig.replace(/[^0-9]/g, '')
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