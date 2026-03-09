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

  const MESES = { enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,octubre:10,noviembre:11,diciembre:12 }

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i]
    const l = linea.toLowerCase()

    // Monto — $ 4.00 / $4.00 / USD 4.00
    if (!resultado.monto) {
      const monto = linea.match(/\$\s*[\d.,]+|\bUSD\s*[\d.,]+/i)
      if (monto) resultado.monto = monto[0].replace(/\s+/g, '').trim()
    }

    // Fecha — "El 06 de marzo de 2026" o DD/MM/YYYY o YYYY-MM-DD
    if (!resultado.fecha) {
      // Formato Pichincha: "El DD de mes de YYYY"
      const fechaLarga = l.match(/el\s+(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/)
      if (fechaLarga) {
        const dia = fechaLarga[1].padStart(2,'0')
        const mes = String(MESES[fechaLarga[2]] || '').padStart(2,'0')
        const anio = fechaLarga[3]
        if (mes) resultado.fecha = `${dia}/${mes}/${anio}`
      } else {
        // Formato numérico DD/MM/YYYY
        const fechaNum = linea.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/)
        if (fechaNum) resultado.fecha = fechaNum[0]
      }
    }

    // N° comprobante — línea siguiente a "N° de comprobante" o "comprobante"
    if (!resultado.nroComprobante) {
      if (l.includes('comprobante') || l.includes('referencia') || l.includes('n°') || l.includes('numero')) {
        // Buscar número en la misma línea
        const num = linea.match(/\d{6,}/)
        if (num) {
          resultado.nroComprobante = num[0]
        } else if (lineas[i+1]) {
          // Banco Pichincha pone el número en la línea siguiente
          const numSig = lineas[i+1].match(/^\d+$/)
          if (numSig) resultado.nroComprobante = numSig[0]
        }
      }
    }

    // Remitente — "De Nombre Apellido" (Pichincha) o "De:" o "Ordenante"
    if (!resultado.remitente) {
      // Formato Pichincha: línea que empieza con "De " seguida de nombre
      const dePichincha = linea.match(/^De\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)+)$/)
      if (dePichincha) {
        resultado.remitente = dePichincha[1]
      } else if (l.startsWith('de ') && linea.length > 5 && /[A-Z]/.test(linea[3])) {
        resultado.remitente = linea.slice(3).trim()
      } else if (l.includes('ordenante') || l.includes('remitente')) {
        const idx = linea.indexOf(':')
        if (idx !== -1) resultado.remitente = linea.slice(idx + 1).trim()
        else if (lineas[i+1]) resultado.remitente = lineas[i+1].trim()
      }
    }

    // Cuenta origen — "Cuenta origen  220 454 4679"
    if (!resultado.cuentaOrigen) {
      if (l.includes('cuenta origen') || l.includes('cuenta débito') || l.includes('cuenta debito')) {
        const num = linea.replace(/\s/g,'').match(/\d{8,}/)
        if (num) {
          resultado.cuentaOrigen = num[0]
        } else if (lineas[i+1]) {
          const numSig = lineas[i+1].replace(/\s/g,'').match(/\d{8,}/)
          if (numSig) resultado.cuentaOrigen = numSig[0]
        }
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