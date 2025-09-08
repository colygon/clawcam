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
      headers['X-Title'] = 'Fractal Self'
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
    const {apiKeys, currentApiKeyIndex, apiProvider, apiUrl} =
      useStore.getState()
    const validKeys = apiKeys.filter(k => k && k.trim() !== '')

    if (validKeys.length === 0) {
      console.error('API Key not set.')
      throw new Error('API Key is missing.')
    }

    const keyToUse = validKeys[currentApiKeyIndex % validKeys.length]
    useStore.setState(state => {
      state.currentApiKeyIndex = state.currentApiKeyIndex + 1
    })

    for (let attempt = 0; attempt < maxRetries; attempt++) {
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
        return result
      } catch (error) {
        if (signal?.aborted || error.name === 'AbortError') {
          return
        }

        if (attempt === maxRetries - 1) {
          throw error
        }

        const delay = baseDelay * 2 ** attempt
        await new Promise(res => setTimeout(res, delay))
        console.warn(
          `Attempt ${attempt + 1} failed, retrying after ${delay}ms...`
        )
      }
    }
  },
  {concurrency: 2}
)
