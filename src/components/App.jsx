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
  setLiveMode,
  setReplayMode,
  clearAllPhotos,
  toggleFavorite,
  togglePhotoSelection,
  selectAllPhotos,
  deselectAllPhotos,
  deleteSelectedPhotos,
  init,
  setCameraMode
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
  const liveMode = useStore.use.liveMode()
  const replayMode = useStore.use.replayMode()
  const cameraMode = useStore.use.cameraMode()
  const justSavedIds = useStore.use.justSavedIds()

  const [videoActive, setVideoActive] = useState(false)
  const [focusedId, setFocusedId] = useState(null)
  const [hoveredMode, setHoveredMode] = useState(null)
  const [tooltipPosition, setTooltipPosition] = useState({top: 0, left: 0})
  const [showCustomPrompt, setShowCustomPrompt] = useState(false)
  const [stylesVisible, setStylesVisible] = useState(true)
  const [galleryVisible, setGalleryVisible] = useState(false)
  const [countdown, setCountdown] = useState(null)
  const [autoCapture, setAutoCapture] = useState(false)
  const [isCountingDown, setIsCountingDown] = useState(false)
  const [replayImageIndex, setReplayImageIndex] = useState(0)
  const [showFlash, setShowFlash] = useState(false)

  const [isDesktop, setIsDesktop] = useState(window.innerWidth > 768)
  const [desktopMirror, setDesktopMirror] = useState(true)
  const [facingMode, setFacingMode] = useState('user')

  const videoRef = useRef(null)
  const pipVideoRef = useRef(null)

  useEffect(() => {
    const checkDesktop = () => setIsDesktop(window.innerWidth > 768)
    window.addEventListener('resize', checkDesktop)
    return () => window.removeEventListener('resize', checkDesktop)
  }, [])

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
  }, [focusedId, validPhotos])

  const goToNextPhoto = useCallback(() => {
    if (!focusedId || validPhotos.length === 0) return
    const currentIndex = validPhotos.findIndex(photo => photo.id === focusedId)
    const nextIndex = currentIndex < validPhotos.length - 1 ? currentIndex + 1 : 0
    setFocusedId(validPhotos[nextIndex].id)
  }, [focusedId, validPhotos])
  const streamRef = useRef(null)
  const genControllersRef = useRef([])
  const autoCaptureTimerRef = useRef(null)
  const countdownTimerRef = useRef(null)

  const latestFinishedPhoto = photos.find(p => !p.isBusy && imageData.outputs[p.id]?.startsWith('data:image/'))
  const replayPhotos = selectedPhotos.length > 0 
    ? photos.filter(p => {
        const output = imageData.outputs[p.id]
        return !p.isBusy && selectedPhotos.includes(p.id) && output && typeof output === 'string' && output.length > 100 && output.startsWith('data:image/')
      }).slice(0, 10)
    : photos.filter(p => {
        const output = imageData.outputs[p.id]
        return !p.isBusy && output && typeof output === 'string' && output.length > 100 && output.startsWith('data:image/')
      }).slice(0, 10).reverse()
  const busyPhotos = photos.filter(p => p.isBusy)


  useEffect(() => {
    if (!replayMode || replayPhotos.length === 0) {
      return
    }
    const intervalId = setInterval(() => {
      setReplayImageIndex(prevIndex => (prevIndex + 1) % replayPhotos.length)
    }, 1500)
    return () => clearInterval(intervalId)
  }, [replayMode, replayPhotos.length])

  const stopVideo = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    if (pipVideoRef.current) {
      pipVideoRef.current.srcObject = null
    }
    setVideoActive(false)
  }, [])

  const startVideo = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {width: {ideal: 1920}, height: {ideal: 1080}, facingMode: {ideal: facingMode}},
        audio: false
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play()
          setVideoActive(true)
        }
      }
      if (pipVideoRef.current) {
        pipVideoRef.current.srcObject = stream
        pipVideoRef.current.onloadedmetadata = () => {
          pipVideoRef.current.play()
        }
      }
    } catch (err) {
      console.error('Error accessing webcam:', err)
    }
  }, [facingMode])

  useEffect(() => {
    startVideo()
    return () => {
      stopVideo()
    }
  }, [startVideo, stopVideo, facingMode])

  const isMirrored = isDesktop ? desktopMirror : facingMode === 'user';
  const videoTransform = { transform: isMirrored ? 'rotateY(180deg)' : 'none' };

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
      // Do not flip the image being sent to the API if it's mirrored
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.drawImage(video, 0, 0, videoWidth, videoHeight)

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
    setIsCountingDown(false)
    genControllersRef.current.forEach(controller => controller.abort())
    genControllersRef.current = []
    setAutoCapture(false)
    setLiveMode(false)
  }, [])
  
  // Auto-capture logic
  useEffect(() => {
    if (!autoCapture || !videoActive) {
      stopTimers();
      return;
    }

    const performCapture = () => {
      const controller = new AbortController();
      genControllersRef.current.push(controller);
      takePhoto(controller.signal, !liveMode).finally(() => {
        genControllersRef.current = genControllersRef.current.filter(c => c !== controller);
      });
    };

    if (cameraMode === 'NONSTOP') {
      const continuousCapture = () => {
        performCapture();
        autoCaptureTimerRef.current = setTimeout(continuousCapture, 5000); // 5-second interval
      };
      continuousCapture();
    }
    
    return stopTimers;
  }, [autoCapture, videoActive, cameraMode, liveMode, takePhoto, stopTimers]);


  // Initialize the app and load saved photos
  useEffect(() => {
    init()
  }, [])

  // Add keyboard navigation for focused photo mode
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (focusedId && !gifUrl) {
        switch (event.key) {
          case 'ArrowLeft':
            event.preventDefault()
            goToPreviousPhoto()
            break
          case 'ArrowRight':
            event.preventDefault()
            goToNextPhoto()
            break
          case 'Escape':
            event.preventDefault()
            setFocusedId(null)
            break
        }
      }
    }

    if (focusedId && !gifUrl) {
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [focusedId, gifUrl, goToPreviousPhoto, goToNextPhoto])


  const handlePhotoButtonClick = () => {
    if (autoCapture || isCountingDown) {
      stopTimers()
      return
    }

    if (cameraMode === 'NONSTOP') {
        setLiveMode(true)
        setAutoCapture(true)
    } else if (cameraMode === 'TIMER') {
      setIsCountingDown(true)
      let count = 5
      const tick = () => {
        if (count > 0) {
          setCountdown(count)
          count--
          countdownTimerRef.current = setTimeout(tick, 1000)
        } else {
          setCountdown(null)
          takePhoto()
          setIsCountingDown(false)
        }
      }
      tick()
    } else { // PHOTO or POSTCARD mode
      takePhoto()
    }
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

    const photo = photos.find(p => p.id === photoId)
    if (!photo) return

    const style = modes[photo.mode] || {}
    const postcardText = style.postcardText || "Check out my AI-generated photo!"
    const shareText = `${postcardText}\npowered by Nano Banana.`

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
            text: shareText,
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
        }
      }, 'image/jpeg', 0.9)
    }
    
    img.src = imageUrl
  }

  const handleModeHover = useCallback(
    (modeInfo, event) => {
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
    },
    [customPrompt]
  )

  const handleCameraToggle = () => {
    if (isDesktop) {
      setDesktopMirror(m => !m)
    } else {
      setFacingMode(f => (f === 'user' ? 'environment' : 'user'))
    }
  }

  return (
    <main
      className={c({
        stylesHidden: !stylesVisible,
        galleryHidden: !galleryVisible
      })}
    >
      {/* Play/Stop Button - Top Left */}
      {photos.length > 0 && (
        <button
          className="topLeftPlayBtn"
          onClick={() => setReplayMode(!replayMode)}
          aria-label={replayMode ? "Stop slideshow" : "Play slideshow"}
        >
          <span className="icon">{replayMode ? 'stop' : 'play_arrow'}</span>
        </button>
      )}

      {replayMode ? (
        <div className="replayView">
          {replayPhotos.length > 0 && (
            <img
              src={imageData.outputs[replayPhotos[replayImageIndex].id]}
              alt="Replay of generated art"
            />
          )}
        </div>
      ) : (
        <>
          {liveMode && (
            <button
              onClick={stopTimers}
              className={c('liveButton active')}
            >
              Live
            </button>
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
                display: liveMode && latestFinishedPhoto ? 'none' : 'block',
                ...videoTransform
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
                    style={videoTransform}
                  />
                </div>
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
                      <button 
                        className="button shareButton" 
                        onClick={() => sharePhoto(focusedId, 'native')}
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
                      {justSavedIds.includes(id) && (
                        <div className="savedIndicator">
                          <span className="icon">check_circle</span>
                        </div>
                      )}
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
                      {'Take a photo or press Auto to begin'}
                    </li>
                  )}
            </ul>
            {photos.filter(p => !p.isBusy).length > 0 && (
              <div className="resultsActions horizontalActions">
                <button
                  className="button makeGif"
                  onClick={makeGif}
                  disabled={gifInProgress}
                  aria-label={gifInProgress ? 'Making GIF...' : 'Make GIF'}
                >
                  <span className="icon">gif</span>
                </button>
              </div>
            )}
          </div>

          {/* Desktop Styles Panel */}
          {isDesktop && (
            <div className="modeRows">
              <ul className="filterSelector">
                <li>
                  <button
                    className={c({active: activeMode === 'custom'})}
                    onClick={() => {
                      setMode('custom')
                      setShowCustomPrompt(true)
                    }}
                    onMouseEnter={e =>
                      handleModeHover(
                        {
                          key: 'custom',
                          name: 'Custom Prompt',
                          prompt: customPrompt
                        },
                        e
                      )
                    }
                    onMouseLeave={() => handleModeHover(null)}
                  >
                    ✏️ Custom
                  </button>
                </li>
                {Object.entries(modes).map(([key, mode]) => (
                  <li key={key}>
                    <button
                      className={c({active: key === activeMode})}
                      onClick={() => setMode(key)}
                      onMouseEnter={e => handleModeHover({key, ...mode}, e)}
                      onMouseLeave={() => handleModeHover(null)}
                    >
                      {mode.emoji} {mode.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* iPhone-style Camera Controls */}
          <div className="iphoneCameraControls">
            {/* Timer Display when active */}
            {cameraMode === 'TIMER' && (
              <div className="iphoneTimerActiveDisplay">
                <span className="icon">timer</span>
                <span>5s</span>
              </div>
            )}

            {/* Styles Grid (Mobile) */}
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

            {/* Wrapper for modes and shutter to have background */}
            <div className="iphoneCameraModesAndShutterWrapper">
              {/* Camera Modes Row */}
              <div className="iphoneCameraModes">
                <button
                  className={c("iphoneModeBtn", {active: cameraMode === 'NONSTOP'})}
                  onClick={() => setCameraMode('NONSTOP')}
                >
                  NONSTOP
                </button>
                <button
                  className={c("iphoneModeBtn", {active: cameraMode === 'PHOTO'})}
                  onClick={() => setCameraMode('PHOTO')}
                >
                  PHOTO
                </button>
                <button
                  className={c("iphoneModeBtn", {active: cameraMode === 'POSTCARD'})}
                  onClick={() => setCameraMode('POSTCARD')}
                >
                  POSTCARD
                </button>
                <button
                  className={c("iphoneModeBtn", {active: cameraMode === 'TIMER'})}
                  onClick={() => setCameraMode('TIMER')}
                >
                  TIMER
                </button>
              </div>

              {/* Bottom Camera Controls Bar */}
              <div className="iphoneCameraBottom">
                {/* Photo Preview (Left) */}
                <div className={photos.length > 0 ? "iphonePhotoPreview" : "iphonePhotoPreview-placeholder"}>
                  {busyPhotos.length > 0 && (
                    <div className="queue-counter">{busyPhotos.length}</div>
                  )}
                  {photos.length > 0 && (
                    latestFinishedPhoto && imageData.outputs[latestFinishedPhoto.id] ? (
                      <button
                        className="iphonePreviewBtn"
                        onClick={() => setGalleryVisible(!galleryVisible)}
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
                        onClick={() => setGalleryVisible(!galleryVisible)}
                        aria-label="Toggle gallery"
                      >
                        <span className="icon">photo</span>
                      </button>
                    )
                  )}
                </div>

                {/* Camera Shutter (Center) */}
                <div className="iphoneCameraShutter">
                  <button
                    onClick={handlePhotoButtonClick}
                    className={c("iphoneShutterBtn", {recording: autoCapture || isCountingDown})}
                    aria-label={autoCapture || isCountingDown ? "Stop capture" : "Take Photo"}
                  >
                    <div className={c("iphoneShutterInner", {recording: autoCapture || isCountingDown})}></div>
                  </button>
                </div>

                {/* Camera Flip Button (Right) */}
                {!isDesktop && (
                  <div className="iphoneCameraSwitch">
                    <button
                      className="iphoneSwitchBtn"
                      onClick={handleCameraToggle}
                      aria-label={'Switch camera'}
                    >
                      <span className="icon">cameraswitch</span>
                    </button>
                  </div>
                )}
              </div>
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