/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {GIFEncoder, quantize, applyPalette} from 'gifenc'
import useStore from './store'
import imageData from './imageData'
import gen from './llm'
import modes from './modes'

const get = useStore.getState
const set = useStore.setState
const gifSize = 512

// Load photos from localStorage
const loadPhotos = () => {
  try {
    const savedPhotos = localStorage.getItem('fractal-photos')
    const savedInputs = localStorage.getItem('fractal-inputs')  
    const savedOutputs = localStorage.getItem('fractal-outputs')
    
    console.log('LoadPhotos: Attempting to restore from localStorage')
    console.log('Has savedPhotos:', !!savedPhotos)
    console.log('Has savedInputs:', !!savedInputs)
    console.log('Has savedOutputs:', !!savedOutputs)
    
    if (savedPhotos) {
      const photos = JSON.parse(savedPhotos)
      console.log(`LoadPhotos: Restoring ${photos.length} photos`)
      
      // Restore photos array
      set({photos})
      
      // Restore inputs if available
      if (savedInputs) {
        try {
          const inputs = JSON.parse(savedInputs)
          console.log(`LoadPhotos: Restoring ${Object.keys(inputs).length} inputs`)
          Object.assign(imageData.inputs, inputs)
        } catch (e) {
          console.error('Failed to parse saved inputs', e)
        }
      }
      
      // Restore outputs if available  
      if (savedOutputs) {
        try {
          const outputs = JSON.parse(savedOutputs)
          console.log(`LoadPhotos: Restoring ${Object.keys(outputs).length} outputs`)
          Object.assign(imageData.outputs, outputs)
        } catch (e) {
          console.error('Failed to parse saved outputs', e)
        }
      }
      
      console.log('LoadPhotos: Restoration complete')
      console.log('Final inputs count:', Object.keys(imageData.inputs).length)
      console.log('Final outputs count:', Object.keys(imageData.outputs).length)
    } else {
      console.log('LoadPhotos: No saved photos found')
    }
  } catch (e) {
    console.error('Failed to load photos from localStorage', e)
    // Clear corrupted data
    localStorage.removeItem('fractal-photos')
    localStorage.removeItem('fractal-inputs')
    localStorage.removeItem('fractal-outputs')
  }
}

// Save photos to localStorage
export const savePhotos = () => {
  try {
    const {photos} = get()
    
    // Check if we have valid data before saving
    const validPhotos = photos.filter(p => {
      if (p.isBusy) return true // Keep busy photos
      return imageData.outputs[p.id] && imageData.outputs[p.id].startsWith('data:image/')
    })
    
    // Only save if we have valid data
    if (validPhotos.length > 0 || photos.some(p => p.isBusy)) {
      localStorage.setItem('fractal-photos', JSON.stringify(photos))
      localStorage.setItem('fractal-inputs', JSON.stringify(imageData.inputs))
      localStorage.setItem('fractal-outputs', JSON.stringify(imageData.outputs))
    }
  } catch (e) {
    console.error('Failed to save photos to localStorage', e)
    if (e.name === 'QuotaExceededError') {
      console.warn('localStorage quota exceeded. Keeping images in memory only.')
      // Don't corrupt existing data if we can't save
      return
    }
  }
}

export const init = () => {
  if (get().didInit) {
    return
  }

  const savedApiKeys = localStorage.getItem('gemini-api-keys')
  if (savedApiKeys) {
    try {
      const parsedKeys = JSON.parse(savedApiKeys)
      if (Array.isArray(parsedKeys) && parsedKeys.length > 0) {
        const fullKeys = parsedKeys
          .slice(0, 10)
          .map(key => String(key || ''))
        set({apiKeys: fullKeys})
      } else {
        set({apiKeys: ['']})
      }
    } catch (e) {
      console.error('Failed to parse API keys from localStorage', e)
      set({apiKeys: ['']})
    }
  } else {
    set({apiKeys: ['']})
  }

  // Load saved photos
  loadPhotos()

  // Clean up old ungenerated photos (photos without outputs that aren't busy) - but be more lenient
  setTimeout(() => {
    const {photos} = get()
    console.log(`Cleanup: Starting with ${photos.length} photos`)
    console.log('Available inputs:', Object.keys(imageData.inputs).length)
    console.log('Available outputs:', Object.keys(imageData.outputs).length)
    
    const photosToKeep = photos.filter(photo => {
      // Always keep if busy (still processing)
      if (photo.isBusy) {
        console.log(`Keeping photo ${photo.id}: still busy`)
        return true
      }
      
      // Check if output exists and is valid
      const output = imageData.outputs[photo.id]
      if (!output) {
        // No output at all - but only remove if it's been a while (more than 30 seconds old)
        const photoAge = Date.now() - (parseInt(photo.id.split('-')[0]) || 0)
        if (photoAge > 30000) {
          console.log(`Removing photo ${photo.id}: no output data and older than 30s`)
          return false
        } else {
          console.log(`Keeping photo ${photo.id}: no output but still recent (${photoAge}ms old)`)
          return true
        }
      }
      
      if (typeof output !== 'string') {
        // Output is not a string - corrupted
        console.log(`Removing photo ${photo.id}: output is not a string`)
        return false
      }
      
      if (output.length < 50) {
        // Output is too short to be a valid image - corrupted
        console.log(`Removing photo ${photo.id}: output too short (${output.length} chars)`)
        return false
      }
      
      if (!output.startsWith('data:image/')) {
        // Output doesn't look like an image - corrupted
        console.log(`Removing photo ${photo.id}: output doesn't start with data:image/`)
        return false
      }
      
      // Keep all other photos (they have valid image data)
      console.log(`Keeping photo ${photo.id}: valid image data`)
      return true
    })
    
    if (photosToKeep.length !== photos.length) {
      console.log(`Cleaning up ${photos.length - photosToKeep.length} ungenerated/corrupt photos`)
      set(state => {
        state.photos = photosToKeep
      })
      
      // Also clean up orphaned imageData
      const validIds = new Set(photosToKeep.map(p => p.id))
      Object.keys(imageData.inputs).forEach(id => {
        if (!validIds.has(id)) {
          delete imageData.inputs[id]
        }
      })
      Object.keys(imageData.outputs).forEach(id => {
        if (!validIds.has(id)) {
          delete imageData.outputs[id]
        }
      })
      
      savePhotos()
    }
  }, 1000) // Small delay to ensure everything is loaded

  const savedApiProvider = localStorage.getItem('gemini-api-provider')
  if (
    savedApiProvider &&
    ['gemini', 'openrouter', 'custom'].includes(savedApiProvider)
  ) {
    set({apiProvider: savedApiProvider})
  }

  const savedApiUrl = localStorage.getItem('gemini-api-url')
  if (savedApiUrl) {
    set({apiUrl: savedApiUrl})
  }

  const savedModel = localStorage.getItem('gemini-model')
  if (savedModel) {
    set({model: savedModel})
  }

  const savedInterval = localStorage.getItem('auto-capture-interval')
  if (savedInterval) {
    const parsedInterval = parseInt(savedInterval, 10)
    if (!isNaN(parsedInterval) && parsedInterval >= 1 && parsedInterval <= 100) {
      set({autoCaptureInterval: parsedInterval})
    }
  }

  const savedBurstCount = localStorage.getItem('burst-count')
  if (savedBurstCount) {
    const parsedCount = parseInt(savedBurstCount, 10)
    if (!isNaN(parsedCount) && parsedCount >= 1 && parsedCount <= 10) {
      set({burstCount: parsedCount})
    }
  }

  // Load OpenRouter settings
  const savedUseOpenRouter = localStorage.getItem('use-openrouter')
  if (savedUseOpenRouter === 'true') {
    set({useOpenRouter: true})
  }

  const savedOpenRouterApiKey = localStorage.getItem('openrouter-api-key')
  if (savedOpenRouterApiKey) {
    set({openRouterApiKey: savedOpenRouterApiKey})
  }

  const savedOpenRouterModel = localStorage.getItem('openrouter-model')
  if (savedOpenRouterModel) {
    set({openRouterModel: savedOpenRouterModel})
  }

  // Load favorites
  const savedFavorites = localStorage.getItem('fractal-favorites')
  if (savedFavorites) {
    try {
      const favorites = JSON.parse(savedFavorites)
      if (Array.isArray(favorites)) {
        set({favorites})
      }
    } catch (e) {
      console.error('Failed to parse favorites from localStorage', e)
    }
  }

  set(state => {
    state.didInit = true
  })
}

export const snapPhoto = async (b64, signal) => {
  const id = crypto.randomUUID()
  const {activeMode, customPrompt, photos, model, randomStyleIndex} = get()
  
  console.log('Starting photo generation', { 
    id, 
    activeMode, 
    model,
    inputSize: b64.length,
    isValidDataURL: b64.startsWith('data:image/')
  })
  
  imageData.inputs[id] = b64

  let modeToUse = activeMode
  if (modeToUse === 'random') {
    const otherModes = Object.keys(modes).filter(k => k !== 'random')
    modeToUse = otherModes[randomStyleIndex % otherModes.length]
    set(state => {
      state.randomStyleIndex = state.randomStyleIndex + 1
    })
  }

  const newPhotos = [{id, mode: modeToUse, isBusy: true}, ...photos]
  set(state => {
    state.photos = newPhotos
  })
  savePhotos() // Save to localStorage

  try {
    console.log('Calling LLM generation', { id, modeToUse, model })
    const result = await gen({
      model,
      prompt: activeMode === 'custom' ? customPrompt : modes[modeToUse].prompt,
      inputFile: b64,
      signal
    })

    console.log('LLM generation result', { 
      id, 
      hasResult: !!result, 
      resultLength: result?.length,
      isValidResult: result?.startsWith('data:image/')
    })

    if (result && result.startsWith('data:image/')) {
      imageData.outputs[id] = result
      set(state => {
        state.photos = state.photos.map(photo =>
          photo.id === id ? {...photo, isBusy: false} : photo
        )
      })
      savePhotos() // Save to localStorage when photo is completed
      console.log('Photo generation completed successfully', { id })
    } else {
      console.warn('Invalid or missing result, removing photo', { id, result })
      
      // Set error state for invalid results
      set(state => {
        state.lastError = {
          message: result ? 'Generated content was not a valid image' : 'No image was generated',
          timestamp: Date.now(),
          type: 'invalid_result'
        }
      })
      
      // Alert user about invalid result
      alert(result ? 'Generated content was not a valid image. This might be due to content restrictions or API issues.' : 'No image was generated. Please check your API configuration.')
      
      // If result is undefined or invalid, remove the photo
      deletePhoto(id)
    }
  } catch (e) {
    console.error('Error generating photo', { id, error: e.message, stack: e.stack })
    
    // Set error state for user feedback
    set(state => {
      state.lastError = {
        message: e.message,
        timestamp: Date.now(),
        type: 'generation_error'
      }
    })
    
    // Only show alert if all API keys have been exhausted
    const errorMsg = e.message.toLowerCase()
    if (errorMsg.includes('all') && errorMsg.includes('api keys failed')) {
      // This is the final error after trying all keys
      console.error('All API keys failed:', e.message)
      alert('All API keys have been tried and failed. Please check your API keys or try again later.')
    } else if (errorMsg.includes('quota') || errorMsg.includes('limit') || errorMsg.includes('rate')) {
      console.error('API quota/rate limit reached:', e.message)
      // Don't alert immediately - let it try other keys first
    } else if (errorMsg.includes('api key') || errorMsg.includes('unauthorized')) {
      console.error('API key issue:', e.message)
      // Don't alert immediately - let it try other keys first
    } else {
      // For non-API errors, still show immediately
      console.error('Generation failed:', e.message)
      alert(`Photo generation failed: ${e.message}`)
    }
    
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
  savePhotos() // Save to localStorage after deletion
}

export const setMode = mode =>
  set(state => {
    state.activeMode = mode
  })

export const setApiKeys = keys => {
  localStorage.setItem('gemini-api-keys', JSON.stringify(keys))
  set(state => {
    state.apiKeys = keys
    // Reset the API key index when new keys are set
    state.currentApiKeyIndex = 0
  })
}

export const setApiProvider = provider => {
  localStorage.setItem('gemini-api-provider', provider)
  set({apiProvider: provider})
}

export const setApiUrl = url => {
  localStorage.setItem('gemini-api-url', url)
  set({apiUrl: url})
}

export const setModel = model => {
  localStorage.setItem('gemini-model', model)
  set({model})
}

export const setAutoCaptureInterval = interval => {
  const parsed = parseInt(interval, 10)
  const newInterval = Math.max(1, Math.min(100, isNaN(parsed) ? 1 : parsed))
  localStorage.setItem('auto-capture-interval', String(newInterval))
  set({autoCaptureInterval: newInterval})
}

export const setBurstCount = count => {
  const parsed = parseInt(count, 10)
  const newCount = Math.max(1, Math.min(10, isNaN(parsed) ? 1 : parsed))
  localStorage.setItem('burst-count', String(newCount))
  set({burstCount: newCount})
}

export const setUseOpenRouter = useOpenRouter => {
  localStorage.setItem('use-openrouter', String(useOpenRouter))
  set({useOpenRouter})
}

export const setOpenRouterApiKey = key => {
  localStorage.setItem('openrouter-api-key', key)
  set({openRouterApiKey: key})
}

export const setOpenRouterModel = model => {
  localStorage.setItem('openrouter-model', model)
  set({openRouterModel: model})
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
  const {photos, selectedPhotos} = get()

  set(state => {
    state.gifInProgress = true
  })

  try {
    const gif = new GIFEncoder()
    
    let photosToUse
    if (selectedPhotos.length > 0) {
      // Use selected photos in the order they appear in the photos array
      photosToUse = photos
        .filter(photo => !photo.isBusy && selectedPhotos.includes(photo.id))
        .slice(0, 10) // Allow up to 10 selected photos
    } else {
      // Fallback to most recent photos if none selected
      photosToUse = photos
        .filter(photo => !photo.isBusy)
        .slice(0, 5) // Take 5 most recent
        .reverse() // Oldest to newest
    }

    for (const photo of photosToUse) {
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

export const clearAllPhotos = () => {
  set(state => {
    state.photos = []
  })
  
  // Clear imageData
  Object.keys(imageData.inputs).forEach(key => delete imageData.inputs[key])
  Object.keys(imageData.outputs).forEach(key => delete imageData.outputs[key])
  
  // Clear localStorage
  localStorage.removeItem('fractal-photos')
  localStorage.removeItem('fractal-inputs')
  localStorage.removeItem('fractal-outputs')
}

export const toggleFavorite = id => {
  set(state => {
    const index = state.favorites.indexOf(id)
    if (index > -1) {
      state.favorites.splice(index, 1)
    } else {
      state.favorites.push(id)
    }
  })
  
  // Save to localStorage
  const {favorites} = get()
  localStorage.setItem('fractal-favorites', JSON.stringify(favorites))
}

export const togglePhotoSelection = id => {
  set(state => {
    const index = state.selectedPhotos.indexOf(id)
    if (index > -1) {
      state.selectedPhotos.splice(index, 1)
    } else {
      state.selectedPhotos.push(id)
    }
  })
}

export const selectAllPhotos = () => {
  const {photos} = get()
  const allPhotoIds = photos.filter(p => !p.isBusy).map(p => p.id)
  set(state => {
    state.selectedPhotos = allPhotoIds
  })
}

export const deselectAllPhotos = () => {
  set(state => {
    state.selectedPhotos = []
  })
}

export const deleteSelectedPhotos = () => {
  const {selectedPhotos} = get()
  
  selectedPhotos.forEach(id => {
    set(state => {
      state.photos = state.photos.filter(photo => photo.id !== id)
    })
    delete imageData.inputs[id]
    delete imageData.outputs[id]
  })
  
  // Clear selection
  set(state => {
    state.selectedPhotos = []
  })
  
  savePhotos()
}

// Debug function to check photo storage state
export const debugPhotoStorage = () => {
  const {photos} = get()
  console.log('=== Photo Storage Debug ===')
  console.log('Photos in store:', photos.length)
  console.log('Inputs in imageData:', Object.keys(imageData.inputs).length)
  console.log('Outputs in imageData:', Object.keys(imageData.outputs).length)
  
  // Check localStorage sizes
  const photosData = localStorage.getItem('fractal-photos')
  const inputsData = localStorage.getItem('fractal-inputs')
  const outputsData = localStorage.getItem('fractal-outputs')
  
  console.log('localStorage fractal-photos:', photosData ? `${Math.round(photosData.length / 1024)}KB` : 'missing')
  console.log('localStorage fractal-inputs:', inputsData ? `${Math.round(inputsData.length / 1024)}KB` : 'missing')
  console.log('localStorage fractal-outputs:', outputsData ? `${Math.round(outputsData.length / 1024)}KB` : 'missing')
  
  // Check for corrupted photo data
  photos.forEach((photo, index) => {
    const hasInput = imageData.inputs[photo.id]
    const hasOutput = imageData.outputs[photo.id]
    const inputSize = hasInput ? Math.round(hasInput.length / 1024) : 0
    const outputSize = hasOutput ? Math.round(hasOutput.length / 1024) : 0
    
    if (!hasInput && !hasOutput) {
      console.warn(`Photo ${index} (${photo.id}): Missing both input and output`)
    } else if (!hasInput) {
      console.warn(`Photo ${index} (${photo.id}): Missing input`)
    } else if (!hasOutput && !photo.isBusy) {
      console.warn(`Photo ${index} (${photo.id}): Missing output (not busy)`)
    } else if (hasInput && inputSize < 10) {
      console.warn(`Photo ${index} (${photo.id}): Input too small (${inputSize}KB)`)
    } else if (hasOutput && outputSize < 10) {
      console.warn(`Photo ${index} (${photo.id}): Output too small (${outputSize}KB)`)
    }
  })
  
  console.log('=== End Debug ===')
}

// Clean up corrupted photos
export const clearLastError = () => {
  set(state => {
    state.lastError = null
  })
}

export const cleanupCorruptedPhotos = () => {
  const {photos} = get()
  const cleanPhotos = photos.filter(photo => {
    const hasInput = imageData.inputs[photo.id]
    const hasOutput = imageData.outputs[photo.id]
    
    // Keep if busy (still processing) or has valid data
    if (photo.isBusy) return true
    if (hasOutput && hasOutput.length > 1000) return true
    
    // Remove corrupted photo
    console.log(`Removing corrupted photo: ${photo.id}`)
    delete imageData.inputs[photo.id]
    delete imageData.outputs[photo.id]
    return false
  })
  
  set(state => {
    state.photos = cleanPhotos
  })
  
  savePhotos()
  console.log(`Cleaned up ${photos.length - cleanPhotos.length} corrupted photos`)
}

init()

// Make debug functions available globally for troubleshooting
if (typeof window !== 'undefined') {
  window.debugPhotoStorage = debugPhotoStorage
  window.cleanupCorruptedPhotos = cleanupCorruptedPhotos
  window.clearAllPhotos = clearAllPhotos
  window.clearLastError = clearLastError
}