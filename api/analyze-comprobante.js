export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { imageBase64, mediaType } = req.body

  if (!imageBase64) {
    return res.status(400).json({ error: 'imageBase64 requerido' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'API key no configurada' })
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: 'Eres un extractor de datos de comprobantes bancarios. Responde SOLO con JSON válido, sin texto adicional, sin markdown, sin backticks.',
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
              text: 'Extrae exactamente estos 5 campos del comprobante de transferencia bancaria y responde SOLO con JSON: {"monto":"","remitente":"","fecha":"","cuentaOrigen":"","nroComprobante":""}. Si no encuentras un campo pon cadena vacía.'
            }
          ]
        }]
      })
    })

    const data = await response.json()

    if (!response.ok) {
      return res.status(502).json({ error: 'Error de API', detail: data })
    }

    const txt = data.content?.[0]?.text || '{}'
    const clean = txt.replace(/```json|```/g, '').trim()

    let parsed = {}
    try {
      parsed = JSON.parse(clean)
    } catch {
      parsed = {}
    }

    return res.status(200).json(parsed)
  } catch (err) {
    return res.status(500).json({ error: 'Error interno', detail: err.message })
  }
}