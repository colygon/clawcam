/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {GoogleGenAI, Modality} from '@google/genai'
import {limitFunction} from 'p-limit'

const timeoutMs = 123_333;

const safetySettings = [
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT',/**
  'HARM_CATEGORY_HARASSMENT'
*/
].map(category => ({category, threshold: 'BLOCK_NONE'}))

const fallbackApiKeys = [
  'REDACTED_GEMINI_API_KEY',
  'REDACTED_GEMINI_API_KEY',
  'REDACTED_GEMINI_API_KEY',
  'REDACTED_GEMINI_API_KEY'
];

const apiKeys = [process.env.API_KEY, ...fallbackApiKeys].filter(Boolean);

if (apiKeys.length === 0) {
    console.error("No API keys found. Please provide an API_KEY environment variable or add fallback keys.");
}


async function generate({model, prompt, inputFile, signal}) {
  let lastError = null;
  let attemptCount = 0;

  console.log(`Starting generation with ${apiKeys.length} available API keys`);

  for (const apiKey of apiKeys) {
    attemptCount++;
    const keyPrefix = apiKey.substring(0, 8) + '...';
    
    try {
      console.log(`Attempt ${attemptCount}/${apiKeys.length}: Using API key ${keyPrefix}`);
      const ai = new GoogleGenAI({apiKey});

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeoutMs)
      );

      const parts = [{text: prompt}];
      if (inputFile) {
        parts.push({
          inlineData: {
            data: inputFile.split(',')[1],
            mimeType: 'image/jpeg'
          }
        });
      }
    
      const modelPromise = ai.models.generateContent(
        {
          model,
          contents: {parts},
          config: {responseModalities: [Modality.TEXT, Modality.IMAGE]},
          safetySettings
        },
        {signal}
      );

      const response = await Promise.race([modelPromise, timeoutPromise]);

      if (signal?.aborted) {
        throw new Error('Aborted');
      }

      if (!response.candidates || response.candidates.length === 0) {
        if (response.promptFeedback?.blockReason) {
            const blockReason = response.promptFeedback.blockReason;
            const message = `Request blocked due to ${blockReason}.`;
            console.warn(message, response.promptFeedback);
            throw new Error(message);
        }
        throw new Error('No candidates in response');
      }

      const inlineDataPart = response.candidates[0].content.parts.find(
        p => p.inlineData
      );
      if (!inlineDataPart) {
        throw new Error('No inline data found in response');
      }
    
      // Success, return result
      console.log(`✅ Successfully generated content using API key ${keyPrefix} (attempt ${attemptCount}/${apiKeys.length})`);
      return 'data:image/png;base64,' + inlineDataPart.inlineData.data;

    } catch (error) {
      if (signal?.aborted) {
        console.log('Request aborted by user.');
        throw error;
      }
      
      const isRateLimit = error.message.includes('quota') || error.message.includes('rate limit') || error.status === 429;
      const errorType = isRateLimit ? 'RATE_LIMIT' : 'ERROR';
      
      console.warn(`❌ ${errorType}: API key ${keyPrefix} failed (attempt ${attemptCount}/${apiKeys.length}):`, error.message);
      lastError = error;
      
      if (attemptCount < apiKeys.length) {
        console.log(`🔄 Rotating to next API key...`);
      }
      // Continue to next key
    }
  }

  // If loop finishes without returning, all keys failed.
  console.error(`💥 All ${apiKeys.length} API keys exhausted. Last error:`, lastError?.message);
  throw lastError || new Error(`Failed to generate content after trying all ${apiKeys.length} available API keys.`);
}

export default limitFunction(generate, {concurrency: 2});