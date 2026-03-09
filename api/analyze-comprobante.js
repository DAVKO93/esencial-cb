export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } }
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
  try { credentials = JSON.parse(keyRaw) }
  catch { return res.status(500).json({ error: 'GOOGLE_VISION_KEY formato invalido' }) }

  try {
    const jwt = await getGoogleToken(credentials)

    const response = await fetch('https://vision.googleapis.com/v1/images:annotate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`
      },
      body: JSON.stringify({
        requests: [{
          image: { content: imageBase64 },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
        }]
      })
    })

    const data = await response.json()
    if (!response.ok) return res.status(502).json({ error: 'Error Vision API', detail: data })

    const annotation = data.responses?.[0]?.fullTextAnnotation
    if (!annotation) return res.status(200).json({ monto:'', remitente:'', fecha:'', cuentaOrigen:'', nroComprobante:'' })

    const campos = extraerConCoordenadas(annotation)
    return res.status(200).json(campos)

  } catch (err) {
    return res.status(500).json({ error: 'Error interno', detail: err.message })
  }
}

// Extrae palabras con sus coordenadas Y (posición vertical) para agrupar por fila
function extraerConCoordenadas(annotation) {
  const resultado = { monto:'', remitente:'', fecha:'', cuentaOrigen:'', nroComprobante:'' }

  // Construir lista de palabras con su posición Y central
  const palabras = []
  for (const page of annotation.pages || []) {
    for (const block of page.blocks || []) {
      for (const para of block.paragraphs || []) {
        for (const word of para.words || []) {
          const texto = word.symbols.map(s => s.text).join('')
          const ys = word.boundingBox.vertices.map(v => v.y || 0)
          const yCentro = (Math.min(...ys) + Math.max(...ys)) / 2
          const xs = word.boundingBox.vertices.map(v => v.x || 0)
          const xIzq = Math.min(...xs)
          palabras.push({ texto, y: yCentro, x: xIzq })
        }
      }
    }
  }

  // Agrupar palabras por filas (palabras con Y similar están en la misma fila)
  // Tolerancia: 15 píxeles
  palabras.sort((a, b) => a.y - b.y)
  const filas = []
  const TOLERANCIA = 15

  for (const palabra of palabras) {
    let filaExistente = filas.find(f => Math.abs(f.yPromedio - palabra.y) <= TOLERANCIA)
    if (filaExistente) {
      filaExistente.palabras.push(palabra)
      filaExistente.yPromedio = filaExistente.palabras.reduce((s,p) => s + p.y, 0) / filaExistente.palabras.length
    } else {
      filas.push({ yPromedio: palabra.y, palabras: [palabra] })
    }
  }

  // Ordenar palabras de cada fila por X (izquierda a derecha)
  for (const fila of filas) {
    fila.palabras.sort((a, b) => a.x - b.x)
    fila.texto = fila.palabras.map(p => p.texto).join(' ')
  }

  const MESES = {
    enero:'01', febrero:'02', marzo:'03', abril:'04', mayo:'05', junio:'06',
    julio:'07', agosto:'08', septiembre:'09', octubre:'10', noviembre:'11', diciembre:'12'
  }

  for (let i = 0; i < filas.length; i++) {
    const linea = filas[i].texto.trim()
    const l = linea.toLowerCase()
    const sigLinea = filas[i+1]?.texto || ''

    // MONTO — primera fila con $
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
    }

    // REMITENTE — fila que empieza con "De " + mayúscula, no "Banco"
    if (!resultado.remitente) {
      const m = linea.match(/^De\s+([A-Z].+)/)
      if (m && !m[1].toLowerCase().includes('banco')) {
        resultado.remitente = m[1].trim()
      }
    }

    // CUENTA ORIGEN — buscar fila con esa etiqueta y tomar el valor numérico
    if (!resultado.cuentaOrigen && l.includes('cuenta') && l.includes('origen')) {
      // El valor puede estar en la misma fila (a la derecha) o en la siguiente
      const valorEnFila = linea.replace(/cuenta\s+origen/i, '').replace(/[^0-9]/g, '')
      if (valorEnFila.length >= 6) {
        resultado.cuentaOrigen = valorEnFila
      } else {
        // Buscar la palabra más a la derecha de esta fila que sea numérica
        const palabrasFila = filas[i].palabras
        const xMitad = (palabrasFila[0].x + palabrasFila[palabrasFila.length-1].x) / 2
        const palabrasDerecha = palabrasFila.filter(p => p.x > xMitad && /\d/.test(p.texto))
        if (palabrasDerecha.length > 0) {
          resultado.cuentaOrigen = palabrasDerecha.map(p => p.texto).join('').replace(/[^0-9]/g,'')
        } else {
          resultado.cuentaOrigen = sigLinea.replace(/[^0-9]/g, '')
        }
      }
    }

    // N° COMPROBANTE — etiqueta + valor numérico
    if (!resultado.nroComprobante && l.includes('comprobante') && !l.includes('transfer') && !l.includes('verific')) {
      const valorEnFila = linea
        .replace(/n\S?\s*de\s+comprobante/i, '')
        .replace(/comprobante/i, '')
        .replace(/[^0-9]/g, '')
      if (valorEnFila.length >= 4) {
        resultado.nroComprobante = valorEnFila
      } else {
        const palabrasFila = filas[i].palabras
        const xMitad = (palabrasFila[0].x + palabrasFila[palabrasFila.length-1].x) / 2
        const palabrasDerecha = palabrasFila.filter(p => p.x > xMitad && /\d/.test(p.texto))
        if (palabrasDerecha.length > 0) {
          resultado.nroComprobante = palabrasDerecha.map(p => p.texto).join('').replace(/[^0-9]/g,'')
        } else {
          resultado.nroComprobante = sigLinea.replace(/[^0-9]/g, '')
        }
      }
    }
  }

  return resultado
}

// Genera token JWT para Google APIs
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

  const b64Header = btoa(JSON.stringify(header)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
  const b64Payload = btoa(JSON.stringify(payload)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
  const unsigned = `${b64Header}.${b64Payload}`

  const pemKey = credentials.private_key
  const keyData = pemKey
    .replace('-----BEGIN PRIVATE KEY-----','')
    .replace('-----END PRIVATE KEY-----','')
    .replace(/\n/g,'')
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
    .replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')

  const jwt = `${unsigned}.${b64Sig}`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  })
  const tokenData = await tokenRes.json()
  return tokenData.access_token
}