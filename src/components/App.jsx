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
  setApiKey
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
  const apiKey = useStore.use.apiKey()

  const [videoActive, setVideoActive] = useState(false)
  const [focusedId, setFocusedId] = useState(null)
  const [didJustSnap, setDidJustSnap] = useState(false)
  const [hoveredMode, setHoveredMode] = useState(null)
  const [tooltipPosition, setTooltipPosition] = useState({top: 0, left: 0})
  const [showCustomPrompt, setShowCustomPrompt] = useState(false)
  const [panelVisible, setPanelVisible] = useState(true)
  const [countdown, setCountdown] = useState(null)
  const [showApiKeyInput, setShowApiKeyInput] = useState(false)
  const [localApiKey, setLocalApiKey] = useState('')
  const [autoCapture, setAutoCapture] = useState(false)

  const videoRef = useRef(null)
  const isGenerating = useRef(false)
  const isCountingDown = useRef(false)

  useEffect(() => {
    setLocalApiKey(apiKey)
    if (!apiKey) {
      setShowApiKeyInput(true)
    }
  }, [apiKey])

  const handleSaveKey = () => {
    const keyToSave = localApiKey.trim()
    if (keyToSave) {
      setApiKey(keyToSave)
      setShowApiKeyInput(false)
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
        setVideoActive(true)
        videoRef.current.srcObject = stream
      }
    } catch (err) {
      console.error('Error accessing webcam:', err)
    }
  }, [])

  useEffect(() => {
    startVideo()
  }, [startVideo])

  const takePhoto = useCallback(async () => {
    if (isGenerating.current) return
    isGenerating.current = true

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

      await snapPhoto(canvas.toDataURL('image/jpeg'))
      setDidJustSnap(true)
      setTimeout(() => setDidJustSnap(false), 1000)
    } catch (e) {
      console.error('Failed to take photo', e)
    } finally {
      isGenerating.current = false
    }
  }, [])

  useEffect(() => {
    let timeoutId
    let countdownInterval

    const loop = async () => {
      if (!autoCapture || document.hidden || isGenerating.current) {
        timeoutId = setTimeout(loop, 4000)
        return
      }

      isCountingDown.current = true
      let count = 5
      setCountdown(count)

      countdownInterval = setInterval(() => {
        count--
        if (count > 0) {
          setCountdown(count)
        } else {
          clearInterval(countdownInterval)
          setCountdown(null)
          isCountingDown.current = false
          takePhoto().finally(() => {
            timeoutId = setTimeout(loop, 4000)
          })
        }
      }, 1000)
    }

    if (autoCapture && apiKey && videoActive) {
      loop()
    }

    return () => {
      clearTimeout(timeoutId)
      clearInterval(countdownInterval)
      if (isCountingDown.current) {
        setCountdown(null)
        isCountingDown.current = false
      }
    }
  }, [autoCapture, apiKey, videoActive, takePhoto])

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
    <main className={c({panelHidden: !panelVisible})}>
      <div className="header">
        <h1>Fractal Self</h1>
        <button
          onClick={() => setShowApiKeyInput(!showApiKeyInput)}
          className="settingsBtn"
          aria-label="API Key Settings"
        >
          <span className="icon">key</span>
        </button>
      </div>
      {showApiKeyInput && (
        <div className="apiKeyBar">
          <input
            type="password"
            value={localApiKey}
            onChange={e => setLocalApiKey(e.target.value)}
            placeholder="Enter your Gemini API key"
          />
          <button onClick={handleSaveKey}>Save</button>
        </div>
      )}
      <div
        className="video"
        onClick={() => (gifUrl ? hideGif() : setFocusedId(null))}
      >
        {countdown && <div className="countdown">{countdown}</div>}
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
        <video
          ref={videoRef}
          muted
          autoPlay
          playsInline
          disablePictureInPicture="true"
        />
        {didJustSnap && <div className="flash" />}

        {videoActive && (
          <>
            <button
              className="panelToggle"
              onClick={() => setPanelVisible(!panelVisible)}
            >
              <span className="icon">
                {panelVisible ? 'visibility_off' : 'visibility'}
              </span>
            </button>
            <div className="videoControls">
              <div className="shutterControls">
                <button
                  onClick={() => setAutoCapture(!autoCapture)}
                  className={c('autoButton', {active: autoCapture})}
                  disabled={!apiKey}
                  aria-pressed={autoCapture}
                >
                  <span className="icon">
                    {autoCapture ? 'stop_circle' : 'play_circle'}
                  </span>
                  {autoCapture ? 'Stop' : 'Auto'}
                </button>
                <button
                  onClick={takePhoto}
                  className="shutter"
                  disabled={!apiKey}
                  aria-label="Take Photo"
                >
                  <span className="icon">camera</span>
                </button>
              </div>
            </div>
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
      </div>

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
                      {mode === 'custom' ? '✏️' : modes[mode].emoji}
                    </p>
                  </button>
                </li>
              ))
            : videoActive && (
                <li className="empty" key="empty">
                  <p>
                    <span className="icon">auto_awesome</span>
                  </p>
                  {apiKey
                    ? 'Take a photo or press Auto to begin'
                    : 'Please set your API key to start'}
                </li>
              )}
        </ul>
        {photos.filter(p => !p.isBusy).length > 1 && (
          <button
            className="button makeGif"
            onClick={makeGif}
            disabled={gifInProgress}
          >
            {gifInProgress ? 'One sec…' : 'Make GIF!'}
          </button>
        )}
      </div>

      {hoveredMode && panelVisible && (
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
    </main>
  )
}
