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
      activeMode: 'auto',
      gifInProgress: false,
      gifUrl: null,
      customPrompt: '',
      model: 'gemini-2.5-flash-image-preview',
      randomStyleIndex: 0,
      recentlyUsedModes: [], // Track recently used modes for smart random distribution
      cameraMode: 'PHOTO', // 'PHOTO', 'STREAM', 'POSTCARD', 'TIMER'
      liveMode: false,
      replayMode: false,
      lastError: null
    }))
  )
)