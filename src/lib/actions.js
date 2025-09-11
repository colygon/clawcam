/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import useStore from './store'
import imageData from './imageData'
import gen from './llm'
import modes from './modes'
import { db } from './db'

const get = useStore.getState
const set = useStore.setState
const gifSize = 512

// Load photos from localStorage (metadata) and IndexedDB (image data)
const loadPhotos = async () => {
  try {
    const savedPhotos = localStorage.getItem('fractal-photos')
    
    if (savedPhotos) {
      const photos = JSON.parse(savedPhotos)
      console.log(`LoadPhotos: Restoring ${photos.length} photo metadata`)
      set({photos})
      
      // Restore inputs and outputs from IndexedDB
      const inputs = await db.getAll(db.STORES.INPUTS)
      const outputs = await db.getAll(db.STORES.OUTPUTS)
      
      Object.assign(imageData.inputs, inputs)
      Object.assign(imageData.outputs, outputs)
      
      console.log(`LoadPhotos: Restored ${Object.keys(inputs).length} inputs and ${Object.keys(outputs).length} outputs from IndexedDB.`)
    } else {
      console.log('LoadPhotos: No saved photos found')
    }
  } catch (e) {
    console.error('Failed to load photos from storage', e)
    // Clear potentially corrupted metadata
    localStorage.removeItem('fractal-photos')
  }
}

// Save photo metadata to localStorage
export const savePhotos = () => {
  try {
    const {photos} = get()
    // Only save the metadata array to localStorage. Image data is saved to IndexedDB.
    localStorage.setItem('fractal-photos', JSON.stringify(photos))
  } catch (e) {
    console.error('Failed to save photo metadata to localStorage', e)
  }
}

export const init = async () => {
  if (get().didInit) {
    return
  }

  // Load saved photos
  await loadPhotos()

  // Clean up old ungenerated photos (photos without outputs that aren't busy)
  setTimeout(() => {
    const {photos} = get()
    const photosToKeep = photos.filter(photo => {
      if (photo.isBusy) return true
      
      const output = imageData.outputs[photo.id]
      if (!output || typeof output !== 'string' || !output.startsWith('data:image/')) {
        const photoAge = Date.now() - (parseInt(photo.id.split('-')[0], 10) || 0)
        if (photoAge > 30000) { // If older than 30s with no valid output
          console.log(`Removing stale/invalid photo ${photo.id}`)
          return false
        }
      }
      return true
    })
    
    if (photosToKeep.length !== photos.length) {
      console.log(`Cleaning up ${photos.length - photosToKeep.length} ungenerated/corrupt photos`)
      set({photos: photosToKeep})
      
      const validIds = new Set(photosToKeep.map(p => p.id))
      Object.keys(imageData.inputs).forEach(id => { if (!validIds.has(id)) { delete imageData.inputs[id]; db.del(db.STORES.INPUTS, id) }})
      Object.keys(imageData.outputs).forEach(id => { if (!validIds.has(id)) { delete imageData.outputs[id]; db.del(db.STORES.OUTPUTS, id) }})
      
      savePhotos()
    }
  }, 1000)

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

  set({didInit: true})
}

export const snapPhoto = async (b64, signal) => {
  const id = crypto.randomUUID()
  const {activeMode, customPrompt, photos, model, randomStyleIndex, cameraMode} = get()
  
  console.log('Starting photo generation', { 
    id, 
    activeMode, 
    model,
    inputSize: b64.length,
    isValidDataURL: b64.startsWith('data:image/')
  })
  
  imageData.inputs[id] = b64
  await db.set(db.STORES.INPUTS, id, b64).catch(e => console.error("Failed to save input to DB", e))

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
  savePhotos() // Save metadata to localStorage

  try {
    const style = modes[modeToUse];
    let finalPrompt = activeMode === 'custom' ? customPrompt : style?.prompt;

    if (cameraMode === 'POSTCARD') {
        const { postcardText, category } = style || {};

        if (postcardText) {
            if (category === 'location') {
                if (modeToUse === 'sf') { // Special case for Full House font style
                    finalPrompt += ` Turn this into a vintage postcard with the text "${postcardText}" written in a large, bold font reminiscent of the logo from the TV show 'Full House'.`;
                } else {
                    finalPrompt += ` Turn this into a vintage postcard with the text "${postcardText}" written elegantly on it in a large, bold font.`;
                }
            } else if (category === 'sports') {
                finalPrompt += ` Turn this into a collectible sports trading card, like a baseball card. The card should feature the text "${postcardText}" prominently in a large, bold font.`;
            } else {
                // For all other categories, make them a fun postcard too.
                finalPrompt += ` Turn this into a fun, thematic postcard with the text "${postcardText}" written creatively on it in a large, bold font.`;
            }
        }
    }


    console.log('Calling LLM generation', { id, modeToUse, model })
    const result = await gen({
      model,
      prompt: finalPrompt,
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
      await db.set(db.STORES.OUTPUTS, id, result).catch(e => console.error("Failed to save output to DB", e))
      
      set(state => {
        state.photos = state.photos.map(photo =>
          photo.id === id ? {...photo, isBusy: false} : photo
        )
      })
      savePhotos() // Save to localStorage when photo is completed
      console.log('Photo generation completed and saved successfully', { id })
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
      
      alert(result ? 'Generated content was not a valid image. This might be due to content restrictions or API issues.' : 'No image was generated. Please check your API configuration.')
      
      // If result is undefined or invalid, remove the photo
      await deletePhoto(id)
    }
  } catch (e) {
    let errorMessage = 'An unknown error occurred. See console for details.';
    if (e instanceof Error) {
        errorMessage = e.message;
    } else if (e && typeof e.message === 'string' && e.message) {
        errorMessage = e.message;
    } else if (typeof e === 'string' && e) {
        errorMessage = e;
    }
    
    console.error('Error generating photo', { id, error: e, stack: e?.stack });

    // Set error state for user feedback
    set(state => {
      state.lastError = {
        message: errorMessage,
        timestamp: Date.now(),
        type: 'generation_error'
      };
    });

    alert(
      `Error generating photo: ${errorMessage}`
    );

    // On error, remove the placeholder
    await deletePhoto(id);
  }
}

export const cancelPhotoGeneration = id => {
  set(state => {
    // Remove the photo from the photos array
    state.photos = state.photos.filter(photo => photo.id !== id)
  })
  
  // Clean up any image data
  delete imageData.inputs[id]
  delete imageData.outputs[id]
}

export const deletePhoto = async id => {
  set(state => {
    state.photos = state.photos.filter(photo => photo.id !== id)
  })

  delete imageData.inputs[id]
  delete imageData.outputs[id]
  
  await db.del(db.STORES.INPUTS, id).catch(e => console.error("Failed to delete input from DB", e));
  await db.del(db.STORES.OUTPUTS, id).catch(e => console.error("Failed to delete output from DB", e));

  savePhotos() // Save updated metadata
}

export const setMode = mode =>
  set(state => {
    state.activeMode = mode
  })

export const setCameraMode = mode => set({ cameraMode: mode });

const processImageToCanvas = async (base64Data, maxSize = 640) => {
  const img = new Image()
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = reject
    img.src = base64Data
  })

  // Calculate dimensions that preserve aspect ratio
  const imgAspect = img.width / img.height
  let canvasWidth, canvasHeight
  
  if (imgAspect > 1) {
    // Landscape
    canvasWidth = Math.min(maxSize, img.width)
    canvasHeight = canvasWidth / imgAspect
  } else {
    // Portrait or square
    canvasHeight = Math.min(maxSize, img.height)
    canvasWidth = canvasHeight * imgAspect
  }

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  canvas.width = canvasWidth
  canvas.height = canvasHeight

  ctx.clearRect(0, 0, canvasWidth, canvasHeight)
  ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight)

  return {
    imageData: ctx.getImageData(0, 0, canvasWidth, canvasHeight),
    width: canvasWidth,
    height: canvasHeight
  }
}

export const makeGif = async () => {
  const {photos, selectedPhotos} = get()

  set(state => {
    state.gifInProgress = true
  })

  try {
    const gif = GIFEncoder()
    
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

    let gifWidth, gifHeight
    
    for (let i = 0; i < photosToUse.length; i++) {
      const photo = photosToUse[i]
      const processedImage = await processImageToCanvas(
        imageData.outputs[photo.id]
      )
      
      // Use dimensions from first image for all frames
      if (i === 0) {
        gifWidth = processedImage.width
        gifHeight = processedImage.height
      }
      
      const palette = quantize(processedImage.imageData.data, 256)
      const indexed = applyPalette(processedImage.imageData.data, palette)

      gif.writeFrame(indexed, gifWidth, gifHeight, {
        palette,
        delay: 333
      })
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
    alert(`Error creating GIF:\n${error.message}`);
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

export const clearAllPhotos = async () => {
  set(state => {
    state.photos = []
    state.selectedPhotos = []
    state.favorites = []
  })
  
  // Clear imageData
  Object.keys(imageData.inputs).forEach(key => delete imageData.inputs[key])
  Object.keys(imageData.outputs).forEach(key => delete imageData.outputs[key])
  
  // Clear IndexedDB
  await db.clear(db.STORES.INPUTS).catch(e => console.error("Failed to clear inputs DB", e));
  await db.clear(db.STORES.OUTPUTS).catch(e => console.error("Failed to clear outputs DB", e));
  
  // Clear localStorage
  localStorage.removeItem('fractal-photos')
  localStorage.removeItem('fractal-favorites')
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

export const downloadPhoto = id => {
  const dataUrl = imageData.outputs[id]
  if (!dataUrl) {
    console.error('No output data for photo', id)
    return
  }
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = `bananacam-${id}.png`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
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

export const deleteSelectedPhotos = async () => {
  const {selectedPhotos} = get()
  if (selectedPhotos.length === 0) return;
  
  for (const id of selectedPhotos) {
    delete imageData.inputs[id]
    delete imageData.outputs[id]
    await db.del(db.STORES.INPUTS, id).catch(e => console.error("Failed to delete input from DB", e));
    await db.del(db.STORES.OUTPUTS, id).catch(e => console.error("Failed to delete output from DB", e));
  }
  
  set(state => {
    const selectedSet = new Set(selectedPhotos)
    state.photos = state.photos.filter(photo => !selectedSet.has(photo.id))
    state.selectedPhotos = []
  })
  
  savePhotos()
}

// Debug function to check photo storage state
export const debugPhotoStorage = () => {
  const {photos} = get()
  console.log('=== Photo Storage Debug ===')
  console.log('Photos in store:', photos.length)
  console.log('Inputs in memory:', Object.keys(imageData.inputs).length)
  console.log('Outputs in memory:', Object.keys(imageData.outputs).length)
  
  const photosData = localStorage.getItem('fractal-photos')
  console.log('localStorage fractal-photos (metadata):', photosData ? `${Math.round(photosData.length / 1024)}KB` : 'missing')
  
  console.log('Check IndexedDB for actual image data.')
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
    const hasOutput = imageData.outputs[photo.id]
    if (photo.isBusy) return true
    if (hasOutput && hasOutput.length > 1000) return true
    console.log(`Removing corrupted photo: ${photo.id}`)
    delete imageData.inputs[photo.id]
    delete imageData.outputs[photo.id]
    db.del(db.STORES.INPUTS, photo.id);
    db.del(db.STORES.OUTPUTS, photo.id);
    return false
  })
  
  set({ photos: cleanPhotos })
  savePhotos()
  console.log(`Cleaned up ${photos.length - cleanPhotos.length} corrupted photos`)
}

init().catch(e => console.error("Initialization failed", e));

// Make debug functions available globally for troubleshooting
if (typeof window !== 'undefined') {
  window.debugPhotoStorage = debugPhotoStorage
  window.cleanupCorruptedPhotos = cleanupCorruptedPhotos
  window.clearAllPhotos = clearAllPhotos
  window.clearLastError = clearLastError
}