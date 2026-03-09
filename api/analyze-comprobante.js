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
    enero:'01',febrero:'02',marzo:'03',abril:'04',mayo:'05',junio:'06',
    julio:'07',agosto:'08',septiembre:'09',octubre:'10',noviembre:'11',diciembre:'12'
  }

  // Buscar en texto completo primero (más confiable que línea por línea)
  const textoCompleto = texto.toLowerCase()

  // MONTO — $ 500.00 o $500.00
  const matchMonto = texto.match(/\$\s*[\d,]+\.?\d{0,2}/)
  if (matchMonto) resultado.monto = matchMonto[0].replace(/\s/g,'')

  // FECHA — "El 09 de marzo de 2026" buscando en cada línea también
  const matchFecha = textoCompleto.match(/el\s+(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/)
  if (matchFecha) {
    const dia = matchFecha[1].padStart(2,'0')
    const mes = MESES[matchFecha[2]] || ''
    const anio = matchFecha[3]
    if (mes) resultado.fecha = `${dia}/${mes}/${anio}`
  }
  // Fallback: buscar línea que tenga "de" + mes en texto
  if (!resultado.fecha) {
    for (const linea of lineas) {
      const l = linea.toLowerCase()
      const m = l.match(/(\d{1,2})\s+de\s+([a-z]+)\s+(?:de\s+)?(\d{4})/)
      if (m) {
        const dia = m[1].padStart(2,'0')
        const mes = MESES[m[2]] || ''
        if (mes) { resultado.fecha = `${dia}/${mes}/${m[3]}`; break }
      }
      // Formato numérico
      const mNum = linea.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/)
      if (mNum) { resultado.fecha = mNum[0]; break }
    }
  }

  // N° COMPROBANTE — buscar línea con "comprobante" y tomar número al final o línea siguiente
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i].toLowerCase()
    if (l.includes('comprobante') && !l.includes('verificar') && !l.includes('transferencia')) {
      // Número en la misma línea (al final)
      const numEnLinea = lineas[i].match(/\d{6,}/)
      if (numEnLinea) {
        resultado.nroComprobante = numEnLinea[0]
        break
      }
      // Número en la siguiente línea
      if (lineas[i+1]) {
        const numSig = lineas[i+1].match(/^\d+$/) || lineas[i+1].match(/\d{6,}/)
        if (numSig) { resultado.nroComprobante = numSig[0]; break }
      }
    }
  }

  // REMITENTE — "De Espinosa Sarango Karolin Gissel"
  // Buscar en todas las líneas sin exigir inicio exacto
  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i].trim()
    // Buscar patrón "De NombreApellido..." en cualquier parte de la línea
    const matchDe = linea.match(/(?:^|\s)De\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,4})/)
    if (matchDe) {
      const nombre = matchDe[1].trim()
      const nombreMin = nombre.toLowerCase()
      if (
        nombre.length > 5 &&
        !nombreMin.includes('banco') &&
        !nombreMin.includes('destino') &&
        !nombreMin.includes('origen') &&
        !nombreMin.includes('pichincha') &&
        !nombreMin.includes('quihivi') === false || true // aceptar cualquier nombre
      ) {
        resultado.remitente = nombre
        break
      }
    }
    // Fallback: "ordenante:" o "remitente:"
    const lmin = linea.toLowerCase()
    if ((lmin.includes('ordenante') || lmin.includes('remitente')) && linea.includes(':')) {
      const val = linea.split(':').slice(1).join(':').trim()
      if (val) { resultado.remitente = val; break }
    }
  }

  // CUENTA ORIGEN — "Cuenta origen   220 454 4679" (con espacios entre grupos)
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i].toLowerCase()
    if (l.includes('cuenta origen') || l.includes('cuenta debito') || l.includes('cuenta débito')) {
      // Buscar grupos de números separados por espacios en la misma línea
      const grupos = lineas[i].match(/\d[\d\s]+\d/)
      if (grupos) {
        resultado.cuentaOrigen = grupos[0].replace(/\s/g,'')
        break
      }
      // Número en línea siguiente
      if (lineas[i+1]) {
        const gruposSig = lineas[i+1].match(/\d[\d\s]+\d/)
        if (gruposSig) { resultado.cuentaOrigen = gruposSig[0].replace(/\s/g,''); break }
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