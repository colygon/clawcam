/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
// import {GIFEncoder, quantize, applyPalette} from 'gifenc'
import {GIFEncoder, quantize, applyPalette} from 'https://unpkg.com/gifenc'
import useStore from './store'
import imageData from './imageData'
import gen from './llm'
import modes from './modes'

const get = useStore.getState
const set = useStore.setState
const gifSize = 512
const model = 'gemini-2.5-flash-image-preview'

export const init = () => {
  if (get().didInit) {
    return
  }

  const savedApiKeys = localStorage.getItem('gemini-api-keys')
  if (savedApiKeys) {
    try {
      const parsedKeys = JSON.parse(savedApiKeys)
      if (Array.isArray(parsedKeys)) {
        const fullKeys = Array(5).fill('')
        parsedKeys.slice(0, 5).forEach((key, i) => {
          fullKeys[i] = String(key || '')
        })
        set({apiKeys: fullKeys})
      }
    } catch (e) {
      console.error('Failed to parse API keys from localStorage', e)
    }
  }

  const savedInterval = localStorage.getItem('auto-capture-interval')
  if (savedInterval) {
    const parsedInterval = parseInt(savedInterval, 10)
    if (!isNaN(parsedInterval) && parsedInterval >= 1 && parsedInterval <= 100) {
      set({autoCaptureInterval: parsedInterval})
    }
  }

  set(state => {
    state.didInit = true
  })
}

export const snapPhoto = async (b64, signal) => {
  const id = crypto.randomUUID()
  const {activeMode, customPrompt, photos} = get()
  imageData.inputs[id] = b64

  const newPhotos = [{id, mode: activeMode, isBusy: true}, ...photos]
  if (newPhotos.length > 10) {
    const oldestPhoto = newPhotos.pop()
    delete imageData.inputs[oldestPhoto.id]
    delete imageData.outputs[oldestPhoto.id]
  }
  set(state => {
    state.photos = newPhotos
  })

  try {
    const result = await gen({
      model,
      prompt: activeMode === 'custom' ? customPrompt : modes[activeMode].prompt,
      inputFile: b64,
      signal
    })

    if (result) {
      imageData.outputs[id] = result
      set(state => {
        state.photos = state.photos.map(photo =>
          photo.id === id ? {...photo, isBusy: false} : photo
        )
      })
    } else {
      // If result is undefined (e.g. from an aborted request), remove the photo
      deletePhoto(id)
    }
  } catch (e) {
    console.error('Error generating photo', e)
    // On error, remove the placeholder
    deletePhoto(id)
  }
}

export const deletePhoto = id => {
  set(state => {
    state.photos = state.photos.filter(photo => photo.id !== id)
  })

  delete imageData.inputs[id]
  delete imageData.outputs[id]
}

export const setMode = mode =>
  set(state => {
    state.activeMode = mode
  })

export const setApiKeys = keys => {
  localStorage.setItem('gemini-api-keys', JSON.stringify(keys))
  set(state => {
    state.apiKeys = keys
  })
}

export const setAutoCaptureInterval = interval => {
  const parsed = parseInt(interval, 10)
  const newInterval = Math.max(1, Math.min(100, isNaN(parsed) ? 1 : parsed))
  localStorage.setItem('auto-capture-interval', String(newInterval))
  set({autoCaptureInterval: newInterval})
}

const processImageToCanvas = async (base64Data, size) => {
  const img = new Image()
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = reject
    img.src = base64Data
  })

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  canvas.width = size
  canvas.height = size

  const imgAspect = img.width / img.height
  const canvasAspect = 1

  let drawWidth
  let drawHeight
  let drawX
  let drawY

  if (imgAspect > canvasAspect) {
    drawHeight = size
    drawWidth = drawHeight * imgAspect
    drawX = (size - drawWidth) / 2
    drawY = 0
  } else {
    drawWidth = size
    drawHeight = drawWidth / imgAspect
    drawX = 0
    drawY = (size - drawHeight) / 2
  }

  ctx.clearRect(0, 0, size, size)
  ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight)

  return ctx.getImageData(0, 0, size, size)
}

const addFrameToGif = (gif, imageData, size, delay) => {
  const palette = quantize(imageData.data, 256)
  const indexed = applyPalette(imageData.data, palette)

  gif.writeFrame(indexed, size, size, {
    palette,
    delay
  })
}

export const makeGif = async () => {
  const {photos} = get()

  set(state => {
    state.gifInProgress = true
  })

  try {
    const gif = new GIFEncoder()
    const readyPhotos = photos
      .filter(photo => !photo.isBusy)
      .slice(0, 5) // Take 5 most recent
      .reverse() // Oldest to newest

    for (const photo of readyPhotos) {
      const outputImageData = await processImageToCanvas(
        imageData.outputs[photo.id],
        gifSize
      )
      addFrameToGif(gif, outputImageData, gifSize, 333)
    }

    gif.finish()

    const gifUrl = URL.createObjectURL(
      new Blob([gif.buffer], {type: 'image/gif'})
    )

    set(state => {
      state.gifUrl = gifUrl
    })
  } catch (error) {
    console.error('Error creating GIF:', error)
    return null
  } finally {
    set(state => {
      state.gifInProgress = false
    })
  }
}

export const hideGif = () =>
  set(state => {
    state.gifUrl = null
  })

export const setCustomPrompt = prompt =>
  set(state => {
    state.customPrompt = prompt
  })

export const setLiveMode = mode => {
  set(state => {
    state.liveMode = mode
  })
}

export const setReplayMode = mode => {
  set(state => {
    state.replayMode = mode
  })
}

init()
