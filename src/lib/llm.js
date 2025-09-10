/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {GoogleGenAI, Modality} from '@google/genai'
import {limitFunction} from 'p-limit'
import useStore from './store'

const timeoutMs = 123_333
const maxRetries = 5
const baseDelay = 1_233
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions'

async function generateWithGeminiDirect({model, prompt, inputFile, signal}) {
  const {apiKeys, currentApiKeyIndex, apiUrl} = useStore.getState()
  const validKeys = apiKeys.filter(k => k && k.trim() !== '')

  if (validKeys.length === 0) {
    console.error('Gemini API Key not set.')
    throw new Error('API Key is missing.')
  }

  const keyToUse = validKeys[currentApiKeyIndex % validKeys.length]
  useStore.setState(state => {
    state.currentApiKeyIndex = state.currentApiKeyIndex + 1
  })

  const genAIParams = {apiKey: keyToUse}
  if (apiUrl && apiUrl.trim() !== '') {
    genAIParams.requestOptions = {apiEndpoint: apiUrl}
  }
  const ai = new GoogleGenAI(genAIParams)

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), timeoutMs)
  )

  const parts = [{text: prompt}]
  if (inputFile) {
    parts.push({
      inlineData: {
        data: inputFile.split(',')[1],
        mimeType: 'image/jpeg'
      }
    })
  }

  const modelPromise = ai.models.generateContent(
    {
      model,
      contents: {parts},
      config: {responseModalities: [Modality.TEXT, Modality.IMAGE]},
      safetySettings
    },
    {signal}
  )

  const response = await Promise.race([modelPromise, timeoutPromise])

  if (!response.candidates || response.candidates.length === 0) {
    throw new Error('No candidates in response')
  }

  const inlineDataPart = response.candidates[0].content.parts.find(
    p => p.inlineData
  )
  if (!inlineDataPart) {
    throw new Error('No inline data found in response')
  }

  return 'data:image/png;base64,' + inlineDataPart.inlineData.data
}

async function generateWithOpenRouter({model, prompt, inputFile, signal}) {
  const {openRouterApiKey} = useStore.getState()

  if (!openRouterApiKey || openRouterApiKey.trim() === '') {
    throw new Error('OpenRouter API Key is missing.')
  }

  const headers = {
    'Authorization': `Bearer ${openRouterApiKey}`,
    'Content-Type': 'application/json'
  }

  const messages = []
  
  if (inputFile) {
    messages.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: prompt
        },
        {
          type: 'image_url',
          image_url: {
            url: inputFile
          }
        }
      ]
    })
  } else {
    messages.push({
      role: 'user',
      content: prompt
    })
  }

  const payload = {
    model: model,
    messages: messages,
    modalities: ['image', 'text']
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  if (signal) {
    signal.addEventListener('abort', () => controller.abort())
  }

  try {
    const response = await fetch(OPENROUTER_BASE_URL, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const result = await response.json()

    if (!result.choices || result.choices.length === 0) {
      throw new Error('No choices in OpenRouter response')
    }

    const message = result.choices[0].message
    if (!message.images || message.images.length === 0) {
      throw new Error('No images in OpenRouter response')
    }

    const imageData = message.images[0].image_url.url
    if (!imageData || !imageData.startsWith('data:image/')) {
      throw new Error('Invalid image data in OpenRouter response')
    }

    return imageData
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

const safetySettings = [
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT',
  'HARM_CATEGORY_HARASSMENT'
].map(category => ({category, threshold: 'BLOCK_NONE'}))

/**
 * Generates content using the Google GenAI SDK.
 */
async function generateWithSdk({key, model, prompt, inputFile, signal}) {
  const ai = new GoogleGenAI({apiKey: key})

  const parts = [{text: prompt}]
  if (inputFile) {
    parts.push({
      inlineData: {
        data: inputFile.split(',')[1],
        mimeType: 'image/jpeg'
      }
    })
  }

  const response = await ai.models.generateContent(
    {
      model,
      contents: {parts},
      config: {responseModalities: [Modality.TEXT, Modality.IMAGE]},
      safetySettings
    },
    {signal}
  )

  if (!response.candidates || response.candidates.length === 0) {
    throw new Error('No candidates in response')
  }

  const inlineDataPart = response.candidates[0].content.parts.find(
    p => p.inlineData
  )
  if (!inlineDataPart) {
    throw new Error('No inline data found in response')
  }

  return 'data:image/png;base64,' + inlineDataPart.inlineData.data
}

/**
 * Generates content using a direct fetch call for OpenRouter or custom endpoints.
 */
async function generateWithFetch({
  provider,
  apiUrl,
  key,
  model,
  prompt,
  inputFile,
  signal
}) {
  let endpoint
  const headers = {
    'Content-Type': 'application/json'
  }

  let effectiveApiUrl
  if (provider === 'openrouter') {
    // Per user request, use the OpenRouter URL. Note: OpenRouter's standard API
    // may not support image output, and this integration sends requests in
    // Google's API format.
    effectiveApiUrl = 'https://openrouter.ai/api/v1'
    endpoint = `${effectiveApiUrl}/models/${model}:generateContent`
  } else {
    // Custom provider
    if (!apiUrl || apiUrl.trim() === '') {
      throw new Error('Custom API URL is not set.')
    }
    effectiveApiUrl = apiUrl.replace(/\/$/, '')
    endpoint = `${effectiveApiUrl}/models/${model}:generateContent`
  }

  let finalUrl
  if (effectiveApiUrl.includes('googleapis.com')) {
    // Use API key for Google's REST API
    finalUrl = `${endpoint}?key=${key}`
  } else {
    // Use Bearer token for other services like OpenRouter
    finalUrl = endpoint
    headers['Authorization'] = `Bearer ${key}`
    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = location.origin
      headers['X-Title'] = 'Banana Cam'
    }
  }

  const body = JSON.stringify({
    contents: {
      parts: [
        {text: prompt},
        inputFile
          ? {
              inlineData: {
                data: inputFile.split(',')[1],
                mimeType: 'image/jpeg'
              }
            }
          : null
      ].filter(Boolean)
    },
    config: {
      responseModalities: ['IMAGE', 'TEXT']
    },
    safetySettings
  })

  const response = await fetch(finalUrl, {
    method: 'POST',
    headers,
    body,
    signal
  })

  if (!response.ok) {
    const errorBody = await response
      .json()
      .catch(() => ({message: response.statusText}))
    const errorMessage =
      errorBody.error?.message || errorBody.message || JSON.stringify(errorBody)
    throw new Error(
      `API request failed with status ${response.status}: ${errorMessage}`
    )
  }

  const responseData = await response.json()

  if (!responseData.candidates || responseData.candidates.length === 0) {
    throw new Error('No candidates in response')
  }

  const inlineDataPart = responseData.candidates[0].content.parts.find(
    p => p.inlineData
  )
  if (!inlineDataPart) {
    throw new Error('No inline data found in response')
  }

  return 'data:image/png;base64,' + inlineDataPart.inlineData.data
}

export default limitFunction(
  async ({model, prompt, inputFile, signal}) => {
    const {apiKeys, apiProvider, apiUrl} = useStore.getState()
    const validKeys = apiKeys.filter(k => k && k.trim() !== '')

    if (validKeys.length === 0) {
      console.error('API Key not set.')
      throw new Error('API Key is missing.')
    }

    // Try each API key once before giving up
    const maxAttemptsPerKey = Math.max(1, Math.floor(maxRetries / validKeys.length))
    
    // Reset to 0 to ensure we start from the first valid key
    useStore.setState(state => {
      state.currentApiKeyIndex = 0
    })
    let currentKeyIndex = 0
    
    for (let keyAttempt = 0; keyAttempt < validKeys.length; keyAttempt++) {
      const keyToUse = validKeys[currentKeyIndex]
      console.log(`Trying API key ${currentKeyIndex + 1}/${validKeys.length}`)

      for (let attempt = 0; attempt < maxAttemptsPerKey; attempt++) {
        try {
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), timeoutMs)
          )

          let modelPromise
          if (apiProvider === 'gemini') {
            modelPromise = generateWithSdk({
              key: keyToUse,
              model,
              prompt,
              inputFile,
              signal
            })
          } else {
            modelPromise = generateWithFetch({
              provider: apiProvider,
              apiUrl,
              key: keyToUse,
              model,
              prompt,
              inputFile,
              signal
            })
          }

          const result = await Promise.race([modelPromise, timeoutPromise])
          
          // Success! Update the current key index for next time
          useStore.setState(state => {
            state.currentApiKeyIndex = currentKeyIndex
          })
          
          return result
        } catch (error) {
          if (signal?.aborted || error.name === 'AbortError') {
            return
          }

          const errorMsg = error.message.toLowerCase()
          const isRateLimit = errorMsg.includes('quota') || 
                              errorMsg.includes('limit') || 
                              errorMsg.includes('rate') ||
                              errorMsg.includes('429')

          if (isRateLimit) {
            console.warn(`Rate limit hit on API key ${currentKeyIndex + 1}, trying next key...`)
            break // Try next key immediately
          }

          if (attempt === maxAttemptsPerKey - 1) {
            // Last attempt with this key failed
            break
          }

          const delay = baseDelay * 2 ** attempt
          await new Promise(res => setTimeout(res, delay))
          console.warn(
            `Attempt ${attempt + 1} with key ${currentKeyIndex + 1} failed, retrying after ${delay}ms...`,
            error.message
          )
        }
      }

      // Move to next key
      currentKeyIndex = (currentKeyIndex + 1) % validKeys.length
    }

    // All keys exhausted
    useStore.setState(state => {
      state.currentApiKeyIndex = currentKeyIndex
    })
    
    throw new Error(`All ${validKeys.length} API keys failed. Please check your keys or try again later.`)
  },
  {concurrency: 2}
)
