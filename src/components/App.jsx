/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {useRef, useState, useCallback, useEffect} from 'react'
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
  setLiveMode,
  setReplayMode
} from '../lib/actions'
import useStore from '../lib/store'
import imageData from '../lib/imageData'
import modes from '../lib/modes'

const canvas = document.createElement('canvas')
const ctx = canvas.getContext('2d')
const modeKeys = Object.keys(modes)

export default function App() {
  const photos = useStore.use.photos()
  const customPrompt = useStore.use.customPrompt()
  const activeMode = useStore.use.activeMode()
  const gifInProgress = useStore.use.gifInProgress()
  const gifUrl = useStore.use.gifUrl()
  const apiKeys = useStore.use.apiKeys()
  const apiProvider = useStore.use.apiProvider()
  const apiUrl = useStore.use.apiUrl()
  const model = useStore.use.model()
  const autoCaptureInterval = useStore.use.autoCaptureInterval()
  const liveMode = useStore.use.liveMode()
  const replayMode = useStore.use.replayMode()

  const [videoActive, setVideoActive] = useState(false)
  const [focusedId, setFocusedId] = useState(null)
  const [hoveredMode, setHoveredMode] = useState(null)
  const [tooltipPosition, setTooltipPosition] = useState({top: 0, left: 0})
  const [showCustomPrompt, setShowCustomPrompt] = useState(false)
  const [stylesVisible, setStylesVisible] = useState(true)
  const [galleryVisible, setGalleryVisible] = useState(true)
  const [countdown, setCountdown] = useState(null)
  const [showApiKeyInput, setShowApiKeyInput] = useState(false)
  const [localApiKeys, setLocalApiKeys] = useState([''])
  const [localApiProvider, setLocalApiProvider] = useState('gemini')
  const [localApiUrl, setLocalApiUrl] = useState('')
  const [localModel, setLocalModel] = useState('gemini-2.5-flash-image-preview')
  const [autoCapture, setAutoCapture] = useState(false)
  const [liveImageIndex, setLiveImageIndex] = useState(0)
  const [replayImageIndex, setReplayImageIndex] = useState(0)

  const videoRef = useRef(null)
  const genControllersRef = useRef([])
  const autoCaptureTimerRef = useRef(null)
  const countdownTimerRef = useRef(null)
  const isCountingDownRef = useRef(false)

  const latestFinishedPhoto = photos.find(p => !p.isBusy)
  const hasApiKey = apiKeys.some(k => k && k.trim() !== '')
  const livePhotos = photos.filter(p => !p.isBusy).slice(0, 5).reverse()
  const replayPhotos = photos.filter(p => !p.isBusy).slice(0, 10).reverse()

  useEffect(() => {
    if (!liveMode || livePhotos.length === 0) {
      return
    }

    const intervalId = setInterval(() => {
      setLiveImageIndex(prevIndex => (prevIndex + 1) % livePhotos.length)
    }, 300)

    return () => clearInterval(intervalId)
  }, [liveMode, livePhotos.length])

  useEffect(() => {
    if (!replayMode || replayPhotos.length === 0) {
      return
    }
    const intervalId = setInterval(() => {
      setReplayImageIndex(prevIndex => (prevIndex + 1) % replayPhotos.length)
    }, 300)
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
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play()
          setVideoActive(true)
        }
      }
    } catch (err) {
      console.error('Error accessing webcam:', err)
    }
  }, [])

  useEffect(() => {
    startVideo()
  }, [startVideo])

  const takePhoto = useCallback(async signal => {
    try {
      const video = videoRef.current
      if (!video || video.readyState < 2) return

      const {videoWidth, videoHeight} = video
      canvas.width = videoWidth
      canvas.height = videoHeight

      ctx.clearRect(0, 0, videoWidth, videoHeight)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(video, 0, 0, videoWidth, videoHeight, -videoWidth, 0, videoWidth, videoHeight)

      await snapPhoto(canvas.toDataURL('image/jpeg'), signal)
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('Failed to take photo', e)
      }
    }
  }, [])

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

    const performCapture = () => {
      const controller = new AbortController()
      genControllersRef.current.push(controller)
      takePhoto(controller.signal).finally(() => {
        genControllersRef.current = genControllersRef.current.filter(
          c => c !== controller
        )
      })
    }

    const timerFn = () => {
      if (liveMode) {
        performCapture()
        autoCaptureTimerRef.current = setTimeout(timerFn, 500)
      } else {
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
            autoCaptureTimerRef.current = setTimeout(
              timerFn,
              autoCaptureInterval * 1000
            )
          }
        }
        tick()
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
    stopTimers
  ])

  const handleToggleLiveMode = () => {
    const isStarting = !liveMode
    setLiveMode(isStarting)
    setAutoCapture(isStarting)
  }

  const downloadGif = () => {
    const a = document.createElement('a')
    a.href = gifUrl
    a.download = 'gembooth.gif'
    a.click()
  }

  const handleModeHover = useCallback((modeInfo, event) => {
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
            <span className="icon">close</span>
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
          <button
            onClick={handleToggleLiveMode}
            className={c('liveButton', {active: liveMode})}
            disabled={!hasApiKey}
          >
            Live
          </button>

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
                <input
                  type="text"
                  value={localModel}
                  onChange={e => setLocalModel(e.target.value)}
                  placeholder="Model name"
                />
              </div>
              <button onClick={handleSaveKeys}>Save</button>
            </div>
          )}

          <div
            className={c('video', {split: autoCapture && !liveMode})}
            onClick={() => (gifUrl ? hideGif() : setFocusedId(null))}
          >
            <video
              ref={videoRef}
              muted
              autoPlay
              playsInline
              disablePictureInPicture="true"
            />
            {liveMode && livePhotos.length > 0 && (
              <div className="liveGifView">
                <img
                  src={imageData.outputs[livePhotos[liveImageIndex].id]}
                  alt="Live generated art"
                />
              </div>
            )}

            {autoCapture && !liveMode && (
              <div
                className={c('generatedPhotoView', {
                  isBusy: photos.length > 0 && photos[0].isBusy
                })}
              >
                {latestFinishedPhoto && (
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
                <button
                  className="circleBtn"
                  onClick={() => {
                    setShowCustomPrompt(false)

                    if (customPrompt.trim().length === 0) {
                      setMode(modeKeys[0])
                    }
                  }}
                >
                  <span className="icon">close</span>
                </button>
                <textarea
                  type="text"
                  placeholder="Enter a custom prompt"
                  value={customPrompt}
                  onChange={e => setCustomPrompt(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      setShowCustomPrompt(false)
                    }
                  }}
                />
              </div>
            )}

            {videoActive && (
              <>
                <button
                  className="galleryToggle"
                  onClick={() => setGalleryVisible(!galleryVisible)}
                >
                  <span className="icon">photo_library</span>
                </button>
                <button
                  className="panelToggle"
                  onClick={() => setStylesVisible(!stylesVisible)}
                >
                  <span className="icon">palette</span>
                </button>
                {!liveMode && (
                  <div className="videoControls">
                    <div className="shutterControls">
                      <button
                        onClick={() => setAutoCapture(!autoCapture)}
                        className={c('autoButton', {active: autoCapture})}
                        disabled={!hasApiKey}
                        aria-pressed={autoCapture}
                      >
                        <span className="icon">
                          {autoCapture ? 'stop_circle' : 'play_circle'}
                        </span>
                        {autoCapture ? 'Stop' : 'Auto'}
                      </button>
                      {autoCapture && (
                        <div className="intervalControl">
                          <input
                            type="number"
                            min="1"
                            max="100"
                            step="1"
                            value={autoCaptureInterval}
                            onChange={e =>
                              setAutoCaptureInterval(
                                parseInt(e.target.value, 10) || 1
                              )
                            }
                            aria-label="Auto-capture interval in seconds"
                          />
                          <span>s</span>
                        </div>
                      )}
                      {!autoCapture && (
                        <button
                          onClick={() => takePhoto()}
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
                <button
                  className="circleBtn"
                  onClick={() => (gifUrl ? hideGif() : setFocusedId(null))}
                >
                  <span className="icon">close</span>
                </button>
                <img
                  src={gifUrl || imageData.outputs[focusedId]}
                  alt="photo"
                  draggable={false}
                />
                {gifUrl && (
                  <button className="button downloadButton" onClick={downloadGif}>
                    Download
                  </button>
                )}
              </div>
            )}
            {videoActive && (
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
                    onMouseEnter={e => handleModeHover({key, prompt}, e)}
                    onMouseLeave={() => handleModeHover(null)}
                  >
                    <button
                      onClick={() => setMode(key)}
                      className={c({active: key === activeMode})}
                    >
                      <span>{emoji}</span> <p>{name}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="results">
            <ul>
              {photos.length
                ? photos.map(({id, mode, isBusy}) => (
                    <li className={c({isBusy})} key={id}>
                      <button
                        className="circleBtn deleteBtn"
                        onClick={() => {
                          deletePhoto(id)
                          if (focusedId === id) {
                            setFocusedId(null)
                          }
                        }}
                      >
                        <span className="icon">delete</span>
                      </button>
                      <button
                        className="photo"
                        onClick={() => {
                          if (!isBusy) {
                            setFocusedId(id)
                            hideGif()
                          }
                        }}
                      >
                        <img
                          src={
                            isBusy ? imageData.inputs[id] : imageData.outputs[id]
                          }
                          draggable={false}
                        />
                        <p className="emoji">
                          {mode === 'custom' ? '✏️' : modes[mode]?.emoji}
                        </p>
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
            {photos.filter(p => !p.isBusy).length > 1 && (
              <div className="resultsActions">
                <button
                  className="button replayButton"
                  onClick={() => setReplayMode(true)}
                >
                  Replay
                </button>
                <button
                  className="button makeGif"
                  onClick={makeGif}
                  disabled={gifInProgress}
                >
                  {gifInProgress ? 'One sec…' : 'Make GIF!'}
                </button>
              </div>
            )}
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
                <>
                  <p>"{hoveredMode.prompt}"</p>
                  <h4>Prompt</h4>
                </>
              )}
            </div>
          )}
        </>
      )}
    </main>
  )
}