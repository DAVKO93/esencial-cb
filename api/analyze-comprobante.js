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
    if (!annotation) {
      // No se pudo leer texto — devolver vacío sin error
      return res.status(200).json(null)
    }

    // Verificar si es un comprobante Banco Pichincha
    const textoCompleto = annotation.text || ''
    const esPichincha = /pichincha/i.test(textoCompleto)

    if (!esPichincha) {
      // No es Pichincha — devolver null para que la app suba la foto sin extraer datos
      return res.status(200).json(null)
    }

    const campos = extraerConCoordenadas(annotation)
    return res.status(200).json(campos)

  } catch (err) {
    // Cualquier error interno devuelve null — la app sigue sin romper
    return res.status(200).json(null)
  }
}

function extraerConCoordenadas(annotation) {
  const resultado = { monto:'', remitente:'', fecha:'', cuentaOrigen:'', nroComprobante:'' }

  const MESES = {
    enero:'01', febrero:'02', marzo:'03', abril:'04', mayo:'05', junio:'06',
    julio:'07', agosto:'08', septiembre:'09', octubre:'10', noviembre:'11', diciembre:'12'
  }

  // --- PASO 1: Extraer todas las palabras con coordenadas ---
  const palabras = []
  for (const page of annotation.pages || []) {
    for (const block of page.blocks || []) {
      for (const para of block.paragraphs || []) {
        for (const word of para.words || []) {
          const texto = word.symbols.map(s => s.text).join('')
          if (!texto.trim()) continue
          const verts = word.boundingBox?.vertices || []
          const ys = verts.map(v => v.y || 0)
          const xs = verts.map(v => v.x || 0)
          const yCentro = (Math.min(...ys) + Math.max(...ys)) / 2
          const xIzq = Math.min(...xs)
          const xDer = Math.max(...xs)
          palabras.push({ texto, y: yCentro, x: xIzq, xDer })
        }
      }
    }
  }

  if (palabras.length === 0) return resultado

  // --- PASO 2: Agrupar palabras en filas por proximidad vertical ---
  palabras.sort((a, b) => a.y - b.y)
  const TOLERANCIA_Y = 12
  const filas = []

  for (const palabra of palabras) {
    const filaExistente = filas.find(f => Math.abs(f.yRef - palabra.y) <= TOLERANCIA_Y)
    if (filaExistente) {
      filaExistente.palabras.push(palabra)
    } else {
      filas.push({ yRef: palabra.y, palabras: [palabra] })
    }
  }

  // Ordenar cada fila de izquierda a derecha
  for (const fila of filas) {
    fila.palabras.sort((a, b) => a.x - b.x)
    fila.texto = fila.palabras.map(p => p.texto).join(' ')
    fila.xMin = fila.palabras[0].x
    fila.xMax = fila.palabras[fila.palabras.length - 1].xDer
    fila.xMedio = (fila.xMin + fila.xMax) / 2
  }

  // --- PASO 3: Extraer cada campo usando filas ordenadas ---
  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i]
    const linea = fila.texto.trim()
    const l = linea.toLowerCase()
    const sigFila = filas[i + 1]

    // MONTO — primera fila que contiene $ seguido de número
    if (!resultado.monto && /\$\s*\d/.test(linea)) {
      const m = linea.match(/\$\s*[\d.,]+/)
      if (m) resultado.monto = m[0].replace(/\s/g, '')
    }

    // FECHA — "El 09 de marzo de 2026"
    if (!resultado.fecha) {
      const m = l.match(/(\d{1,2})\s+de\s+([a-z\u00e1\u00e9\u00ed\u00f3\u00fa]+)\s+de\s+(\d{4})/)
      if (m && MESES[m[2]]) {
        resultado.fecha = `${m[1].padStart(2,'0')}/${MESES[m[2]]}/${m[3]}`
      }
    }

    // REMITENTE — fila donde el PRIMER token es exactamente "De" y le siguen palabras con mayúscula
    if (!resultado.remitente) {
      const tokens = fila.palabras
      if (
        tokens.length >= 3 &&
        tokens[0].texto === 'De' &&
        /^[A-Z]/.test(tokens[1].texto)
      ) {
        const nombre = tokens.slice(1).map(p => p.texto).join(' ').trim()
        if (!nombre.toLowerCase().includes('banco')) {
          resultado.remitente = nombre
        }
      }
    }

    // CUENTA ORIGEN — fila con etiqueta a la izquierda y número a la derecha
    if (!resultado.cuentaOrigen && l.includes('cuenta') && l.includes('origen')) {
      // Separar palabras de la fila en: etiqueta (lado izq) y valor (lado der)
      // La etiqueta son las palabras "Cuenta" y "origen", el resto son el valor
      const palabrasValor = fila.palabras.filter(p =>
        !/(cuenta|origen)/i.test(p.texto)
      )
      const soloDigitos = palabrasValor.map(p => p.texto).join('').replace(/[^0-9]/g, '')
      if (soloDigitos.length >= 6) {
        resultado.cuentaOrigen = soloDigitos
      } else if (sigFila) {
        // Buscar en la fila siguiente palabras que sean puramente numéricas
        const numSig = sigFila.palabras
          .filter(p => /\d/.test(p.texto))
          .map(p => p.texto).join('').replace(/[^0-9]/g, '')
        if (numSig.length >= 6) resultado.cuentaOrigen = numSig
      }
    }

    // N° COMPROBANTE — fila con "comprobante", excluir "transferencia" y "verificar"
    if (!resultado.nroComprobante && l.includes('comprobante') && !l.includes('transfer') && !l.includes('verific')) {
      // Palabras de la fila que no sean la etiqueta
      const palabrasValor = fila.palabras.filter(p =>
        !/(n|n°|de|comprobante)/i.test(p.texto)
      )
      const soloDigitos = palabrasValor.map(p => p.texto).join('').replace(/[^0-9]/g, '')
      if (soloDigitos.length >= 4) {
        resultado.nroComprobante = soloDigitos
      } else if (sigFila) {
        const numSig = sigFila.palabras
          .filter(p => /\d/.test(p.texto))
          .map(p => p.texto).join('').replace(/[^0-9]/g, '')
        if (numSig.length >= 4) resultado.nroComprobante = numSig
      }
    }
  }

  return resultado
}

// Genera token JWT para Google APIs sin librerías externas
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

  const enc = s => btoa(JSON.stringify(s)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
  const unsigned = `${enc(header)}.${enc(payload)}`

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

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${unsigned}.${b64Sig}`
  })
  const tokenData = await tokenRes.json()
  return tokenData.access_token
}