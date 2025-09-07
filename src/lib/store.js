/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import 'immer'
import {create} from 'zustand'
import {immer} from 'zustand/middleware/immer'
import {createSelectorFunctions} from 'auto-zustand-selectors-hook'

export default createSelectorFunctions(
  create(
    immer(() => ({
      didInit: false,
      photos: [],
      activeMode: 'random',
      gifInProgress: false,
      gifUrl: null,
      customPrompt: '',
      apiKeys: Array(5).fill(''),
      apiUrl: '',
      model: 'gemini-2.5-flash-image-preview',
      currentApiKeyIndex: 0,
      randomStyleIndex: 0,
      autoCaptureInterval: 5,
      liveMode: false,
      replayMode: false
    }))
  )
)
