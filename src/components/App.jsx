/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, {useRef, useState, useCallback, useEffect} from 'react'
import c from 'clsx'
import {
  snapPhoto,
  setMode,
  deletePhoto,
  makeGif,
  hideGif,
  setCustomPrompt,
  setApiKeys,
  setApiUrl,
  setModel,
  setApiProvider,
  setAutoCaptureInterval,
  setBurstCount,
  setLiveMode,
  setReplayMode,
  clearAllPhotos,
  toggleFavorite,
  togglePhotoSelection,
  selectAllPhotos,
  deselectAllPhotos,
  deleteSelectedPhotos,
  init
} from '../lib/actions'
import useStore from '../lib/store'
import imageData from '../lib/imageData'
import modes from '../lib/modes'

const canvas = document.createElement('canvas')
const ctx = canvas.getContext('2d')
const modeKeys = Object.keys(modes)

export default function App() {
  const photos = useStore.use.photos()
  const favorites = useStore.use.favorites()
  const selectedPhotos = useStore.use.selectedPhotos()
  const customPrompt = useStore.use.customPrompt()
  const activeMode = useStore.use.activeMode()
  const gifInProgress = useStore.use.gifInProgress()
  const gifUrl = useStore.use.gifUrl()
  const apiKeys = useStore.use.apiKeys()
  const apiProvider = useStore.use.apiProvider()
  const apiUrl = useStore.use.apiUrl()
  const model = useStore.use.model()
  const autoCaptureInterval = useStore.use.autoCaptureInterval()
  const burstCount = useStore.use.burstCount()
  const liveMode = useStore.use.liveMode()
  const replayMode = useStore.use.replayMode()

  const [videoActive, setVideoActive] = useState(false)
  const [focusedId, setFocusedId] = useState(null)
  const [hoveredMode, setHoveredMode] = useState(null)
  const [tooltipPosition, setTooltipPosition] = useState({top: 0, left: 0})
  const [showCustomPrompt, setShowCustomPrompt] = useState(false)
  const [showShareMenu, setShowShareMenu] = useState(null)
  const [stylesVisible, setStylesVisible] = useState(true)
  const [galleryVisible, setGalleryVisible] = useState(false)
  const [countdown, setCountdown] = useState(null)
  const [showApiKeyInput, setShowApiKeyInput] = useState(false)
  const [localApiKeys, setLocalApiKeys] = useState([''])
  const [localApiProvider, setLocalApiProvider] = useState('gemini')
  const [localApiUrl, setLocalApiUrl] = useState('')
  const [localModel, setLocalModel] = useState('gemini-2.5-flash-image-preview')
  const [autoCapture, setAutoCapture] = useState(false)
  const [countdownTriggered, setCountdownTriggered] = useState(false)
  const [burstTriggered, setBurstTriggered] = useState(false)
  const [continuousTriggered, setContinuousTriggered] = useState(false)
  const [replayImageIndex, setReplayImageIndex] = useState(0)
  const [showFlash, setShowFlash] = useState(false)

  const videoRef = useRef(null)
  const pipVideoRef = useRef(null)

  // Get valid photos for navigation
  const validPhotos = photos.filter(({id, isBusy}) => {
    if (isBusy) return false
    const output = imageData.outputs[id]
    const hasValidOutput = output && typeof output === 'string' && output.length > 100 && output.startsWith('data:image/')
    return hasValidOutput
  })

  // Navigation functions for focused image
  const goToPreviousPhoto = useCallback(() => {
    if (!focusedId || validPhotos.length === 0) return
    const currentIndex = validPhotos.findIndex(photo => photo.id === focusedId)
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : validPhotos.length - 1
    setFocusedId(validPhotos[prevIndex].id)
    setShowShareMenu(null)
  }, [focusedId, validPhotos])

  const goToNextPhoto = useCallback(() => {
    if (!focusedId || validPhotos.length === 0) return
    const currentIndex = validPhotos.findIndex(photo => photo.id === focusedId)
    const nextIndex = currentIndex < validPhotos.length - 1 ? currentIndex + 1 : 0
    setFocusedId(validPhotos[nextIndex].id)
    setShowShareMenu(null)
  }, [focusedId, validPhotos])
  const streamRef = useRef(null)
  const genControllersRef = useRef([])
  const autoCaptureTimerRef = useRef(null)
  const countdownTimerRef = useRef(null)
  const isCountingDownRef = useRef(false)

  const latestFinishedPhoto = photos.find(p => !p.isBusy)
  const hasApiKey = apiKeys.some(k => k && k.trim() !== '')
  const replayPhotos = selectedPhotos.length > 0 
    ? photos.filter(p => {
        const output = imageData.outputs[p.id]
        return !p.isBusy && selectedPhotos.includes(p.id) && output && typeof output === 'string' && output.length > 100 && output.startsWith('data:image/')
      }).slice(0, 10)
    : photos.filter(p => {
        const output = imageData.outputs[p.id]
        return !p.isBusy && output && typeof output === 'string' && output.length > 100 && output.startsWith('data:image/')
      }).slice(0, 10).reverse()
  const finishedPhotos = photos.filter(p => !p.isBusy)
  const busyPhotos = photos.filter(p => p.isBusy)
  const mostRecentPhoto = photos[0] // First photo is most recent


  useEffect(() => {
    if (!replayMode || replayPhotos.length === 0) {
      return
    }
    const intervalId = setInterval(() => {
      setReplayImageIndex(prevIndex => (prevIndex + 1) % replayPhotos.length)
    }, 1500)
    return () => clearInterval(intervalId)
  }, [replayMode, replayPhotos.length])

  useEffect(() => {
    setLocalApiKeys(apiKeys.length > 0 ? apiKeys : [''])
    setLocalApiProvider(apiProvider)
    setLocalApiUrl(apiUrl || '')
    setLocalModel(model)
    if (!hasApiKey) {
      setShowApiKeyInput(true)
    }
  }, [apiKeys, hasApiKey, apiProvider, apiUrl, model])

  const handleSaveKeys = () => {
    setApiKeys(localApiKeys)
    setApiProvider(localApiProvider)
    if (localApiProvider === 'custom') {
      setApiUrl(localApiUrl)
    } else {
      setApiUrl('')
    }
    setModel(localModel)
    setShowApiKeyInput(false)
  }

  const handleAddApiKey = () => {
    if (localApiKeys.length < 10) {
      setLocalApiKeys(prevKeys => [...prevKeys, ''])
    }
  }

  const handleRemoveApiKey = indexToRemove => {
    if (localApiKeys.length > 1) {
      setLocalApiKeys(prevKeys =>
        prevKeys.filter((_, index) => index !== indexToRemove)
      )
    }
  }

  const startVideo = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {width: {ideal: 1920}, height: {ideal: 1080}},
        audio: false,
        facingMode: {ideal: 'user'}
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play()
          setVideoActive(true)
        }
      }
      // Also set PIP video source if it exists
      if (pipVideoRef.current) {
        pipVideoRef.current.srcObject = stream
        pipVideoRef.current.onloadedmetadata = () => {
          pipVideoRef.current.play()
        }
      }
    } catch (err) {
      console.error('Error accessing webcam:', err)
    }
  }, [])

  const stopVideo = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setVideoActive(false)
  }, [])

  useEffect(() => {
    startVideo()
    
    // Cleanup on unmount
    return () => {
      stopVideo()
    }
  }, [startVideo, stopVideo])

  const takePhoto = useCallback(async (signal, showFlashEffect = true) => {
    try {
      const video = videoRef.current
      if (!video || video.readyState < 2) {
        console.warn('Video not ready for capture', { 
          hasVideo: !!video, 
          readyState: video?.readyState,
          videoActive 
        })
        return
      }

      // Trigger flash effect only if requested
      if (showFlashEffect) {
        setShowFlash(true)
        setTimeout(() => setShowFlash(false), 300)
      }

      const {videoWidth, videoHeight} = video
      if (videoWidth === 0 || videoHeight === 0) {
        console.warn('Video has zero dimensions', { videoWidth, videoHeight })
        return
      }

      canvas.width = videoWidth
      canvas.height = videoHeight

      ctx.clearRect(0, 0, videoWidth, videoHeight)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(video, 0, 0, videoWidth, videoHeight, -videoWidth, 0, videoWidth, videoHeight)

      const dataURL = canvas.toDataURL('image/jpeg')
      if (dataURL.length < 1000) {
        console.error('Generated image data too small', { length: dataURL.length })
        return
      }

      console.log('Capturing photo', { videoWidth, videoHeight, dataLength: dataURL.length })
      await snapPhoto(dataURL, signal)
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('Failed to take photo', e)
      }
    }
  }, [videoActive])

  const stopTimers = useCallback(() => {
    clearTimeout(autoCaptureTimerRef.current)
    clearTimeout(countdownTimerRef.current)
    setCountdown(null)
    isCountingDownRef.current = false
    genControllersRef.current.forEach(controller => controller.abort())
    genControllersRef.current = []
  }, [])

  useEffect(() => {
    if (!autoCapture || !hasApiKey || !videoActive) {
      stopTimers()
      return
    }
    
    // The countdown logic is now handled by the button click, so this condition is no longer needed

    const performCapture = () => {
      // Determine how many photos to take based on mode combinations
      let photosToTake = 1
      
      if (burstTriggered && countdownTriggered) {
        // Burst + Countdown: 5 photos after countdown
        photosToTake = 5
      } else if (burstTriggered && !countdownTriggered) {
        // Pure burst: 5 photos
        photosToTake = 5
      } else if (countdownTriggered && !burstTriggered) {
        // Pure countdown: 1 photo
        photosToTake = 1
      } else if (continuousTriggered && !countdownTriggered && !burstTriggered) {
        // Pure continuous: 1 photo at a time
        photosToTake = 1
      }
      
      // Lock the style for the entire sequence by temporarily storing current randomStyleIndex
      let lockedStyleIndex = null
      if (activeMode === 'random' && photosToTake > 1) {
        const {randomStyleIndex} = useStore.getState()
        lockedStyleIndex = randomStyleIndex
      }
      
      for (let i = 0; i < photosToTake; i++) {
        setTimeout(() => {
          // For multi-photo sequences, ensure all photos use the same style
          if (activeMode === 'random' && lockedStyleIndex !== null && photosToTake > 1) {
            useStore.setState(state => {
              state.randomStyleIndex = lockedStyleIndex
            })
          }
          
          const controller = new AbortController()
          genControllersRef.current.push(controller)
          // Don't show flash in live mode
          takePhoto(controller.signal, !liveMode).finally(() => {
            genControllersRef.current = genControllersRef.current.filter(
              c => c !== controller
            )
            
            // Auto-stop burst mode after all photos are taken
            if (burstTriggered && i === photosToTake - 1) {
              // This is the last photo in the burst sequence
              setTimeout(() => {
                setBurstTriggered(false)
                setAutoCapture(false)
                setLiveMode(false)
              }, 100) // Small delay to ensure photo processing starts
            }
          })
        }, i * 500) // 0.5 seconds between photos
      }
    }

    const timerFn = () => {
      if (liveMode && !countdownTriggered) {
        // Pure continuous mode - take photos every 5 seconds
        performCapture()
        autoCaptureTimerRef.current = setTimeout(timerFn, 5000)
      } else if (countdownTriggered) {
        // Any mode with countdown - do countdown first
        isCountingDownRef.current = true
        let count = 5
        const tick = () => {
          if (count > 0) {
            setCountdown(count)
            count--
            countdownTimerRef.current = setTimeout(tick, 1000)
          } else {
            setCountdown(null)
            performCapture()
            isCountingDownRef.current = false
            
            // Determine what to do after capture based on combination
            if (continuousTriggered) {
              // Continuous + Countdown: repeat countdown cycle
              autoCaptureTimerRef.current = setTimeout(timerFn, 2000) // 2 second pause then countdown again
            } else {
              // Pure countdown or Burst + Countdown: stop after one cycle
              setAutoCapture(false)
              setLiveMode(false)
            }
          }
        }
        tick()
      } else {
        // Pure burst mode (shouldn't reach here normally)
        performCapture()
        setAutoCapture(false)
        setLiveMode(false)
      }
    }

    timerFn()

    return stopTimers
  }, [
    autoCapture,
    liveMode,
    hasApiKey,
    videoActive,
    takePhoto,
    autoCaptureInterval,
    stopTimers,
    countdownTriggered,
    burstTriggered,
    continuousTriggered
  ])

  // Initialize the app and load saved photos
  useEffect(() => {
    init()
  }, [])

  const handleToggleLiveMode = async () => {
    const isStarting = !liveMode
    setLiveMode(isStarting)
    setAutoCapture(isStarting)
    
    // If stopping live mode, restart the video stream to ensure it's working properly
    if (!isStarting) {
      stopVideo()
      // Small delay before restarting to ensure clean transition
      setTimeout(() => {
        startVideo()
      }, 100)
    }
  }

  const handlePhotoButtonClick = () => {
    // If any combination modes are active and we're not already capturing
    if ((countdownTriggered || burstTriggered || continuousTriggered) && !autoCapture && !liveMode) {
      // Determine the capture mode based on combinations
      if (continuousTriggered && !countdownTriggered && !burstTriggered) {
        // Pure continuous mode
        setLiveMode(true)
      } else if (countdownTriggered) {
        // Any combination with countdown - start countdown first
        setAutoCapture(true)
        if (continuousTriggered) {
          // Continuous + Countdown: countdown repeats
          setLiveMode(true)
        } else if (burstTriggered) {
          // Burst + Countdown: countdown then burst
          setLiveMode(true)
        } else {
          // Pure countdown: countdown then 1 photo
          setLiveMode(false)
        }
      } else if (burstTriggered && !countdownTriggered) {
        // Pure burst mode
        setAutoCapture(true)
        setLiveMode(true)
      }
    }
    // Regular photo mode - take photo immediately
    else if (!countdownTriggered && !burstTriggered && !continuousTriggered) {
      takePhoto()
    }
    // If we're already in auto capture mode, the button shouldn't be visible
  }

  const downloadGif = () => {
    const a = document.createElement('a')
    a.href = gifUrl
    a.download = 'gembooth.gif'
    a.click()
  }

  const sharePhoto = (photoId, platform) => {
    const imageUrl = imageData.outputs[photoId]
    if (!imageUrl) return

    // Convert base64 to blob for sharing
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()
    
    img.onload = () => {
      canvas.width = img.width
      canvas.height = img.height
      ctx.drawImage(img, 0, 0)
      
      canvas.toBlob(blob => {
        if (navigator.share && platform === 'native') {
          navigator.share({
            title: 'Check out my AI-generated photo!',
            text: 'Created with Banana Cam - AI photo transformations. Create your own at www.banana.cam',
            files: [new File([blob], 'banana-cam-photo.jpg', { type: 'image/jpeg' })]
          })
        } else {
          // Fallback: download image for manual sharing
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `banana-cam-${photoId}.jpg`
          a.click()
          URL.revokeObjectURL(url)
          
          // Open social media share URL
          let shareUrl = ''
          const text = encodeURIComponent('Check out my AI-generated photo from Banana Cam! Create your own at www.banana.cam')
          
          switch(platform) {
            case 'twitter':
              shareUrl = `https://twitter.com/intent/tweet?text=${text}`
              break
            case 'facebook':
              shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`
              break
            case 'farcaster':
              shareUrl = `https://warpcast.com/~/compose?text=${text}`
              break
            case 'instagram':
              // Instagram doesn't support direct web sharing, encourage app usage
              alert('Photo downloaded! Open Instagram app and share from your photos.')
              return
            case 'tiktok':
              alert('Photo downloaded! Open TikTok app and create a video with your photo.')
              return
          }
          
          if (shareUrl) {
            window.open(shareUrl, '_blank', 'width=600,height=400')
          }
        }
      }, 'image/jpeg', 0.9)
    }
    
    img.src = imageUrl
    setShowShareMenu(null)
  }

  const handleModeHover = useCallback((modeInfo, event) => {
    // Don't show hover tooltips on desktop (screen width > 768px)
    if (window.innerWidth > 768) {
      return
    }

    if (!modeInfo) {
      setHoveredMode(null)
      return
    }

    setHoveredMode(modeInfo)

    const rect = event.currentTarget.getBoundingClientRect()
    const tooltipTop = rect.top
    const tooltipLeft = rect.left + rect.width / 2

    setTooltipPosition({
      top: tooltipTop,
      left: tooltipLeft
    })
  }, [])

  return (
    <main
      className={c({
        stylesHidden: !stylesVisible,
        galleryHidden: !galleryVisible
      })}
    >
      {replayMode ? (
        <div className="replayView">
          <button className="closeReplayBtn" onClick={() => setReplayMode(false)}>
            <span className="icon">stop</span>
          </button>
          {replayPhotos.length > 0 && (
            <img
              src={imageData.outputs[replayPhotos[replayImageIndex].id]}
              alt="Replay of generated art"
            />
          )}
        </div>
      ) : (
        <>
          {((liveMode || autoCapture) && busyPhotos.length > 0 && (!countdownTriggered || continuousTriggered)) && (
            <button
              onClick={handleToggleLiveMode}
              className={c('liveButton', {active: liveMode})}
              disabled={!hasApiKey}
            >
              Live
            </button>
          )}

          {/* Play Button - Top Left */}
          {photos.length > 0 && (
            <button
              className="topLeftPlayBtn"
              onClick={() => setReplayMode(true)}
              aria-label="Play slideshow"
            >
              <span className="icon">play_arrow</span>
            </button>
          )}

          <button
            onClick={() => setShowApiKeyInput(!showApiKeyInput)}
            className="settingsBtn"
            aria-label="API Key Settings"
          >
            <span className="icon">key</span>
          </button>

          {showApiKeyInput && (
            <div className="apiKeyBar">
              <div className="apiKeyInputs">
                <div className="apiProviderSelector">
                  <label htmlFor="api-provider-select">Provider:</label>
                  <select
                    id="api-provider-select"
                    value={localApiProvider}
                    onChange={e => setLocalApiProvider(e.target.value)}
                  >
                    <option value="gemini">Gemini</option>
                    <option value="openrouter">OpenRouter</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                {localApiProvider === 'custom' && (
                  <input
                    type="text"
                    value={localApiUrl}
                    onChange={e => setLocalApiUrl(e.target.value)}
                    placeholder="Custom API URL"
                  />
                )}
                <div className="apiModelSelector">
                  <label htmlFor="api-model-input">Model:</label>
                  <input
                    id="api-model-input"
                    type="text"
                    value={localModel}
                    onChange={e => setLocalModel(e.target.value)}
                    placeholder="Model name"
                  />
                </div>
                {localApiKeys.map((key, index) => (
                  <div className="apiKeyInputWrapper" key={index}>
                    <input
                      type="password"
                      value={key}
                      onChange={e => {
                        const newKeys = [...localApiKeys]
                        newKeys[index] = e.target.value
                        setLocalApiKeys(newKeys)
                      }}
                      placeholder={`API Key ${index + 1}`}
                    />
                    {localApiKeys.length > 1 ? (
                      <button
                        className="removeApiKeyBtn"
                        onClick={() => handleRemoveApiKey(index)}
                        aria-label="Remove API Key"
                      >
                        <span className="icon">close</span>
                      </button>
                    ) : null}
                  </div>
                ))}
                {localApiKeys.length < 10 && (
                  <button className="addApiKeyBtn" onClick={handleAddApiKey}>
                    + Add API Key
                  </button>
                )}
                <p className="apiKeyHint">
                  Add additional API keys to resolve issues with API rate
                  limits.
                </p>
              </div>
              <button onClick={handleSaveKeys}>Save</button>
            </div>
          )}

          <div
            className={c('video')}
            onClick={() => (gifUrl ? hideGif() : setFocusedId(null))}
          >
            <video
              ref={videoRef}
              muted
              autoPlay
              playsInline
              disablePictureInPicture="true"
              style={{
                display: liveMode && latestFinishedPhoto ? 'none' : 'block'
              }}
            />
            {!liveMode && <div className={c('flash', {active: showFlash})} />}
            {liveMode && latestFinishedPhoto && (
              <div className="liveGifView">
                {imageData.outputs[latestFinishedPhoto.id] && (
                  <img
                    src={imageData.outputs[latestFinishedPhoto.id]}
                    alt="Live generated art"
                  />
                )}
                {/* Picture-in-picture webcam in live mode */}
                <div className="pipWebcam">
                  <video
                    ref={el => {
                      pipVideoRef.current = el
                      if (el && streamRef.current) {
                        el.srcObject = streamRef.current
                        el.onloadedmetadata = () => {
                          el.play()
                        }
                      }
                    }}
                    muted
                    autoPlay
                    playsInline
                    disablePictureInPicture="true"
                  />
                </div>
              </div>
            )}

            {autoCapture && !liveMode && (
              <div
                className={c('generatedPhotoView', {
                  isBusy: photos.length > 0 && photos[0].isBusy
                })}
              >
                {latestFinishedPhoto && imageData.outputs[latestFinishedPhoto.id] && (
                  <img
                    src={imageData.outputs[latestFinishedPhoto.id]}
                    alt="Last generated"
                  />
                )}
              </div>
            )}

            {countdown && <div className="countdown" key={countdown}>{countdown}</div>}
            {showCustomPrompt && (
              <div className="customPrompt">
                <div className="customPromptContent">
                  <h3>Custom Style Prompt</h3>
                  <textarea
                    type="text"
                    placeholder="Write your custom transformation prompt..."
                    value={customPrompt || "Transform the person into a mystical wizard with flowing robes and glowing magical aura, preserving their exact facial features and natural expression. Create realistic shadows cast by floating magical orbs of light surrounding them. Place them in an enchanted forest with ancient trees and sparkling fireflies, ensuring the magical lighting creates authentic ethereal shadows and highlights that capture the wonder of a spellbinding fantasy realm."}
                    onChange={e => setCustomPrompt(e.target.value)}
                    rows={6}
                  />
                  <button
                    className="saveButton"
                    onClick={() => {
                      setShowCustomPrompt(false)
                      if (customPrompt.trim().length === 0) {
                        setMode(modeKeys[0])
                      }
                    }}
                  >
                    <span className="icon">save</span>
                    Save
                  </button>
                </div>
              </div>
            )}

            {videoActive && (
              <>
                {!liveMode && (
                  <div className="videoControls">
                    <div className="shutterControls">
                      {autoCapture && (
                        <div className="intervalControl">
                          <button 
                            className="intervalBtn"
                            onClick={() => setAutoCaptureInterval(Math.max(1, autoCaptureInterval - 1))}
                            aria-label="Decrease interval"
                          >
                            <span className="icon">remove</span>
                          </button>
                          <span className="intervalDisplay">{autoCaptureInterval}s</span>
                          <button 
                            className="intervalBtn"
                            onClick={() => setAutoCaptureInterval(Math.min(100, autoCaptureInterval + 1))}
                            aria-label="Increase interval"
                          >
                            <span className="icon">add</span>
                          </button>
                        </div>
                      )}
                      {!autoCapture && (
                        <button
                          onClick={handlePhotoButtonClick}
                          className="shutter"
                          disabled={!hasApiKey}
                          aria-label="Take Photo"
                        >
                          <span className="icon">camera</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {(focusedId || gifUrl) && (
              <div className="focusedPhoto" onClick={e => e.stopPropagation()}>
                <div className="focusedImageWrapper">
                  <img
                    src={gifUrl || imageData.outputs[focusedId]}
                    alt="photo"
                    draggable={false}
                  />
                </div>
                {focusedId && !gifUrl && validPhotos.length > 1 && (
                  <>
                    <button 
                      className="button prevButton" 
                      onClick={goToPreviousPhoto}
                      aria-label="Previous photo"
                    >
                      <span className="icon">chevron_left</span>
                    </button>
                    <button 
                      className="button nextButton" 
                      onClick={goToNextPhoto}
                      aria-label="Next photo"
                    >
                      <span className="icon">chevron_right</span>
                    </button>
                  </>
                )}
                {gifUrl && (
                  <div className="focusedPhotoActions">
                    <button className="button downloadButton" onClick={downloadGif}>
                      <span className="icon">download</span>
                      Download
                    </button>
                    <button 
                      className="button closeButton" 
                      onClick={() => hideGif()}
                      aria-label="Close GIF"
                    >
                      <span className="icon">close</span>
                    </button>
                  </div>
                )}
                {focusedId && !gifUrl && (
                  <>

                    <div className="focusedPhotoActions">
                      <button 
                        className="button favoriteButton" 
                        onClick={() => toggleFavorite(focusedId)}
                        aria-label={favorites.includes(focusedId) ? "Remove from favorites" : "Add to favorites"}
                      >
                        <span className="icon">{favorites.includes(focusedId) ? 'favorite' : 'favorite_border'}</span>
                      </button>
                      {validPhotos.length > 1 && (
                        <button 
                          className="button playButton" 
                          onClick={() => {
                            setReplayMode(true)
                            setFocusedId(null)
                          }}
                          aria-label="Play slideshow"
                        >
                          <span className="icon">play_arrow</span>
                        </button>
                      )}
                      <button 
                        className="button shareButton" 
                        onClick={() => setShowShareMenu(showShareMenu === focusedId ? null : focusedId)}
                      >
                        <span className="icon">share</span>
                      </button>
                      <button 
                        className="button deleteButton" 
                        onClick={() => {
                          deletePhoto(focusedId)
                          setFocusedId(null)
                        }}
                        aria-label="Delete photo"
                      >
                        <span className="icon">delete</span>
                      </button>
                      <button 
                        className="button closeButton" 
                        onClick={() => setFocusedId(null)}
                        aria-label="Close photo"
                      >
                        <span className="icon">close</span>
                      </button>
                    </div>
                    {showShareMenu === focusedId && (
                      <div className="shareMenu">
                        <button onClick={() => sharePhoto(focusedId, 'native')}>
                          <span className="icon">mobile_screen_share</span>
                          Share
                        </button>
                        <button onClick={() => sharePhoto(focusedId, 'twitter')}>
                          𝕏 X
                        </button>
                        <button onClick={() => sharePhoto(focusedId, 'instagram')}>
                          📷 Instagram
                        </button>
                        <button onClick={() => sharePhoto(focusedId, 'facebook')}>
                          👥 Facebook
                        </button>
                        <button onClick={() => sharePhoto(focusedId, 'farcaster')}>
                          🟪 Farcaster
                        </button>
                        <button onClick={() => sharePhoto(focusedId, 'tiktok')}>
                          🎵 TikTok
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>


          <div className="results">
            <ul>
              {photos.length > 0
                ? photos
                    .filter(({id, isBusy}, index) => {
                      // Always show the most recent photo (index 0), even if busy
                      if (index === 0) return true
                      
                      // For older photos, only show if finished and have valid output
                      if (isBusy) return false
                      const output = imageData.outputs[id]
                      const hasValidOutput = output && typeof output === 'string' && output.length > 100 && output.startsWith('data:image/')
                      return hasValidOutput
                    })
                    .map(({id, mode, isBusy}) => (
                    <li key={id}>
                      <label className="photoSelector">
                        <input
                          type="checkbox"
                          checked={selectedPhotos.includes(id) && !isBusy}
                          onChange={() => !isBusy && togglePhotoSelection(id)}
                          disabled={isBusy}
                        />
                        <span className="checkmark">
                          <span className="selectionNumber">
                            {selectedPhotos.includes(id) && !isBusy ? selectedPhotos.indexOf(id) + 1 : ''}
                          </span>
                        </span>
                      </label>
                      <button
                        className={c("photo", {
                          generating: isBusy,
                          failed: !isBusy && (!imageData.outputs[id] || !imageData.outputs[id].startsWith('data:image/'))
                        })}
                        onClick={() => {
                          if (!isBusy) {
                            if (imageData.outputs[id] && imageData.outputs[id].startsWith('data:image/')) {
                              setFocusedId(id)
                              hideGif()
                              setShowShareMenu(null)
                            }
                            // For broken photos, clicking does nothing but they can still be selected via checkbox
                          }
                        }}
                      >
                        {!isBusy && imageData.outputs[id] && imageData.outputs[id].startsWith('data:image/') ? (
                          <img
                            src={imageData.outputs[id]}
                            draggable={false}
                          />
                        ) : isBusy && imageData.inputs[id] ? (
                          <div className="photo-generating">
                            <img
                              src={imageData.inputs[id]}
                              draggable={false}
                              className="generating-base-image"
                            />
                            <div className="shimmer-overlay">
                              <span className="icon">hourglass_top</span>
                            </div>
                          </div>
                        ) : (
                          <div className={c("photo-placeholder", {shimmer: isBusy})}>
                            <span className="icon">
                              {isBusy ? 'hourglass_top' : 
                               (!imageData.outputs[id] || !imageData.outputs[id].startsWith('data:image/')) ? 'error' : 
                               'hourglass_empty'}
                            </span>
                          </div>
                        )}
                        <p className="emoji">
                          {mode === 'custom' ? '✏️' : modes[mode]?.emoji}
                        </p>
                        {favorites.includes(id) && (
                          <button
                            className="favoriteIndicator"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleFavorite(id)
                            }}
                          >
                            <span className="icon">favorite</span>
                          </button>
                        )}
                        {!favorites.includes(id) && !isBusy && (
                          <button
                            className="favoriteIndicator unfavorited"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleFavorite(id)
                            }}
                          >
                            <span className="icon">favorite_border</span>
                          </button>
                        )}
                      </button>
                    </li>
                  ))
                : videoActive && (
                    <li className="empty" key="empty">
                      <p>
                        <span className="icon">auto_awesome</span>
                      </p>
                      {hasApiKey
                        ? 'Take a photo or press Auto to begin'
                        : 'Please set your API key to start'}
                    </li>
                  )}
            </ul>
          </div>

          {stylesVisible && (
            <div className="modeRows">
              <ul className="modeSelector">
                <li
                  key="custom"
                  onMouseEnter={e =>
                    handleModeHover({key: 'custom', prompt: customPrompt}, e)
                  }
  
                  onMouseLeave={() => handleModeHover(null)}
                >
                  <button
                    className={c({active: activeMode === 'custom'})}
                    onClick={() => {
                      setMode('custom')
                      setShowCustomPrompt(true)
                    }}
                  >
                    <span>✏️</span> <p>Custom</p>
                  </button>
                </li>
                {Object.entries(modes).map(([key, {name, emoji, prompt}]) => (
                  <li
                    key={key}
                    onMouseEnter={e => handleModeHover({key, name, prompt}, e)}
                    onMouseLeave={() => handleModeHover(null)}
                  >
                    <button
                      onClick={() => {
                        setMode(key)
                      }}
                      className={c({active: key === activeMode})}
                    >
                      <span>{emoji}</span> <p>{name}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* iPhone-style Mobile Camera Controls */}
          <div className="iphoneCameraControls">
            {/* Timer Display when active */}
            {autoCapture && (
              <div className="iphoneTimerActiveDisplay">
                <span className="icon">timer</span>
                <span>{autoCaptureInterval}s</span>
              </div>
            )}

            {/* Selected Style Name Display */}
            {stylesVisible && (
              <div className="iphoneSelectedStyleName">
                {activeMode === 'custom' ? 'Custom' : modes[activeMode]?.name || 'Random'}
              </div>
            )}

            {/* Styles Grid - Above Photo Button */}
            {stylesVisible && (
              <div className="iphoneStylesGrid">
                <button
                  className={c("iphoneStyleEmojiBtn", {active: activeMode === 'custom'})}
                  onClick={() => {
                    setMode('custom')
                    setShowCustomPrompt(true)
                  }}
                >
                  ✏️
                </button>
                {Object.entries(modes).map(([key, {name, emoji}]) => (
                  <button
                    key={key}
                    className={c("iphoneStyleEmojiBtn", {active: key === activeMode})}
                    onClick={() => setMode(key)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}


            {/* Camera Modes Row */}
            <div className="iphoneCameraModes">
              <button
                className={c("iphoneModeBtn", {active: continuousTriggered})}
                onClick={() => {
                  setContinuousTriggered(!continuousTriggered)
                  if (continuousTriggered) {
                    // If turning off continuous, also stop auto capture
                    setAutoCapture(false)
                    setLiveMode(false)
                  }
                }}
              >
                CONTINUOUS
              </button>
              <button
                className={c("iphoneModeBtn", {active: !countdownTriggered && !burstTriggered && !continuousTriggered})}
                onClick={() => {
                  setAutoCapture(false)
                  setLiveMode(false)
                  setCountdownTriggered(false)
                  setBurstTriggered(false)
                  setContinuousTriggered(false)
                }}
              >
                PHOTO
              </button>
              <button
                className={c("iphoneModeBtn", {active: burstTriggered})}
                onClick={() => {
                  setBurstTriggered(!burstTriggered)
                  if (burstTriggered) {
                    // If turning off burst, also stop auto capture
                    setAutoCapture(false)
                    setLiveMode(false)
                  }
                }}
              >
                BURST
              </button>
              <button
                className={c("iphoneModeBtn", {active: countdownTriggered})}
                onClick={() => {
                  setCountdownTriggered(!countdownTriggered)
                  if (countdownTriggered) {
                    // If turning off countdown, also stop auto capture
                    setAutoCapture(false)
                    setLiveMode(false)
                  }
                }}
              >
                COUNTDOWN
              </button>
            </div>

            {/* Bottom Camera Controls */}
            <div className="iphoneCameraBottom">
              {/* Camera Shutter - Center */}
              <div className="iphoneCameraShutter">
                {!autoCapture && !liveMode ? (
                  <button
                    onClick={handlePhotoButtonClick}
                    className="iphoneShutterBtn"
                    disabled={!hasApiKey}
                    aria-label="Take Photo"
                  >
                    <div className="iphoneShutterInner"></div>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setAutoCapture(false)
                      setLiveMode(false)
                      setContinuousTriggered(false)
                    }}
                    className="iphoneShutterBtn recording"
                    disabled={!hasApiKey}
                    aria-label="Stop recording"
                  >
                    <div className="iphoneShutterInner recording"></div>
                  </button>
                )}
              </div>
            </div>

            {/* Last Photo Preview - Toggles Gallery */}
            <div className="iphonePhotoPreview">
              {latestFinishedPhoto && imageData.outputs[latestFinishedPhoto.id] ? (
                <button
                  className="iphonePreviewBtn"
                  onClick={() => {
                    setGalleryVisible(!galleryVisible)
                  }}
                  aria-label="Toggle gallery"
                >
                  <img
                    src={imageData.outputs[latestFinishedPhoto.id]}
                    alt="Latest photo - tap to open gallery"
                    className="iphonePreviewImg"
                  />
                </button>
              ) : (
                <button
                  className="iphonePreviewEmpty"
                  onClick={() => {
                    setGalleryVisible(!galleryVisible)
                  }}
                  aria-label="Toggle gallery"
                >
                  <span className="icon">photo</span>
                </button>
              )}
            </div>

            {/* Styles Button - Right Side */}
            <div className="iphoneStylesButton">
              <button
                className="iphoneStyleToggle"
                onClick={() => {
                  setStylesVisible(!stylesVisible)
                }}
                aria-label="Toggle styles"
              >
                <span className="icon">palette</span>
              </button>
            </div>
          </div>

          {hoveredMode && stylesVisible && (
            <div
              className={c('tooltip', {isFirst: hoveredMode.key === 'custom'})}
              role="tooltip"
              style={{
                top: tooltipPosition.top,
                left: tooltipPosition.left,
                transform: 'translateX(-50%)'
              }}
            >
              {hoveredMode.key === 'custom' && !hoveredMode.prompt.length ? (
                <p>Click to set a custom prompt</p>
              ) : (
                <p>{hoveredMode.name}</p>
              )}
            </div>
          )}
          
        </>
      )}
    </main>
  )
}