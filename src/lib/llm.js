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
  'REDACTED_GEMINI_API_KEY'
];

const apiKeys = [process.env.API_KEY, ...fallbackApiKeys].filter(Boolean);

if (apiKeys.length === 0) {
    console.error("No API keys found. Please provide an API_KEY environment variable or add fallback keys.");
}


async function generate({model, prompt, inputFile, signal}) {
  let lastError = null;

  for (const apiKey of apiKeys) {
    try {
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
      console.log('Successfully generated content with one of the API keys.');
      return 'data:image/png;base64,' + inlineDataPart.inlineData.data;

    } catch (error) {
      if (signal?.aborted) {
        console.log('Request aborted by user.');
        throw error;
      }
      console.warn(`API call failed with one of the keys:`, error);
      lastError = error;
      // Continue to next key
    }
  }

  // If loop finishes without returning, all keys failed.
  console.error('All API keys failed.');
  throw lastError || new Error('All API keys failed to generate content.');
}

export default limitFunction(generate, {concurrency: 2});