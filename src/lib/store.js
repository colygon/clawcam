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
      favorites: [],
      selectedPhotos: [],
      activeMode: 'random',
      gifInProgress: false,
      gifUrl: null,
      customPrompt: '',
      model: 'gemini-2.5-flash-image-preview',
      randomStyleIndex: 0,
      cameraMode: 'PHOTO', // 'PHOTO', 'NONSTOP', 'POSTCARD', 'TIMER'
      liveMode: false,
      replayMode: false,
      justSavedIds: [],
      lastError: null
    }))
  )
)
