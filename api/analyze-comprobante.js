export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}

export default async function handler(req, res) {
  // Permitir CORS por si acaso
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { imageBase64, mediaType } = req.body || {}

  if (!imageBase64) {
    return res.status(400).json({ error: 'imageBase64 requerido' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'API key no configurada en Vercel' })
  }

  let response
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: 'Eres un extractor de datos de comprobantes bancarios. Responde SOLO con JSON valido, sin texto adicional, sin markdown, sin backticks.',
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType || 'image/jpeg',
                data: imageBase64
              }
            },
            {
              type: 'text',
              text: 'Extrae exactamente estos 5 campos del comprobante de transferencia bancaria y responde SOLO con JSON: {"monto":"","remitente":"","fecha":"","cuentaOrigen":"","nroComprobante":""}. Si no encuentras un campo pon cadena vacia.'
            }
          ]
        }]
      })
    })
  } catch (fetchErr) {
    return res.status(502).json({ error: 'No se pudo conectar con Anthropic', detail: fetchErr.message })
  }

  let data
  try {
    data = await response.json()
  } catch {
    return res.status(502).json({ error: 'Respuesta invalida de Anthropic' })
  }

  if (!response.ok) {
    // Retornar el error real de Anthropic para poder diagnosticar
    return res.status(502).json({
      error: 'Error de Anthropic API',
      status: response.status,
      detail: data
    })
  }

  const txt = data.content?.[0]?.text || '{}'
  const clean = txt.replace(/```json|```/g, '').trim()

  let parsed = {}
  try {
    parsed = JSON.parse(clean)
  } catch {
    // Si no es JSON válido, intentar extraer manualmente
    parsed = {}
  }

  return res.status(200).json(parsed)
}