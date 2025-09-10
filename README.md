<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Fractal Self

**View yourself in alternate universes in real-time with your webcam.**

This AI-powered web application transforms webcam photos into artistic variations using Google's Gemini AI, featuring multiple art styles and real-time processing capabilities.

View your app in AI Studio: https://ai.studio/apps/drive/1Iu0sCyYPSYnrvde7Ygi5N3bTcl5tH0hv

## Features

- **Real-time webcam capture** with live preview
- **Multiple art styles**: Renaissance, Cartoon, Statue, 80s, 19th Century, Anime, Psychedelic, 8-bit, Comic Book, and more
- **Live mode** for continuous transformation cycling
- **Auto-capture** with configurable intervals
- **GIF creation** from multiple photos
- **Replay mode** for viewing generated images in sequence
- **Custom prompts** for personalized transformations
- **Multi-key API support** with automatic rotation

## Architecture

### Overview

Fractal Self is built as a modern single-page React application using a modular architecture with clear separation of concerns:

```
fractal-self/
├── src/
│   ├── components/
│   │   └── App.jsx          # Main React component
│   └── lib/
│       ├── actions.js       # State actions and business logic
│       ├── imageData.js     # In-memory image storage
│       ├── llm.js          # Google Gemini AI integration
│       ├── modes.js        # Art style definitions
│       └── store.js        # Global state management
├── index.tsx               # Application entry point
├── index.html             # HTML template with ES modules
├── index.css              # Application styles
├── package.json           # Dependencies and scripts
├── vite.config.ts         # Build configuration
└── tsconfig.json          # TypeScript configuration
```

### Core Components

#### 1. State Management (`store.js`)
- **Technology**: Zustand with Immer middleware
- **Purpose**: Centralized global state management
- **Key State**:
  - `photos`: Array of captured/generated images with metadata
  - `activeMode`: Current art style selection
  - `apiKeys`: Multiple Gemini API keys for rotation
  - `liveMode`/`replayMode`: UI state management
  - `customPrompt`: User-defined transformation prompt

#### 2. AI Integration (`llm.js`)
- **Technology**: Google Gemini AI (@google/genai)
- **Features**:
  - Multi-modal input (image + text)
  - Automatic API key rotation for rate limit management
  - Retry logic with exponential backoff
  - Concurrent request limiting (max 2 simultaneous)
  - Request timeout handling (123s)
  - AbortController support for cancellation

#### 3. Action Layer (`actions.js`)
- **Purpose**: Business logic and state mutations
- **Key Functions**:
  - `snapPhoto()`: Captures webcam image and triggers AI processing
  - `makeGif()`: Creates animated GIF from generated images
  - `setMode()`: Switches between art styles
  - `deletePhoto()`: Removes images from storage
  - Local storage persistence for user preferences

#### 4. Image Management (`imageData.js`)
- **Storage**: In-memory object storage
- **Structure**: Separate `inputs` and `outputs` objects indexed by UUID
- **Format**: Base64 encoded images (JPEG input, PNG output)

#### 5. Art Styles (`modes.js`)
- **Purpose**: Predefined transformation prompts
- **Styles**: 12+ different artistic interpretations
- **Structure**: Each mode contains name, emoji, and detailed prompt
- **Special Cases**: 
  - `random`: Cycles through all styles
  - `custom`: User-defined prompts

#### 6. Main Component (`App.jsx`)
- **Technology**: React with hooks
- **Responsibilities**:
  - Webcam integration via `getUserMedia()`
  - Canvas-based image processing
  - UI state management (modals, tooltips, focus states)
  - Timer management for auto-capture
  - Live/replay mode orchestration

### Data Flow

1. **Image Capture**: Webcam → Canvas → Base64 encoding → `snapPhoto()`
2. **AI Processing**: Base64 image + selected prompt → Gemini API → Generated image
3. **State Update**: New image stored in `imageData` + photo metadata in store
4. **UI Rendering**: React component re-renders with updated state

### Key Features Implementation

#### Live Mode
- Continuous auto-capture every 500ms
- Cycles through recent generated images for display
- Uses `setInterval` for image rotation

#### Auto-Capture
- Configurable interval (1-100 seconds)
- 5-second countdown for manual mode
- Timer management with cleanup on mode changes

#### GIF Generation
- Uses `gifenc` library for client-side GIF creation
- Processes up to 5 most recent images
- Canvas-based image resizing to 512x512
- Color quantization and palette generation

#### API Key Management
- Supports up to 5 API keys
- Round-robin rotation to distribute load
- Local storage persistence
- Validation and error handling

### Performance Optimizations

- **Concurrency Control**: Limited to 2 simultaneous AI requests
- **Image Cleanup**: Automatic removal of old images (>10)
- **Memory Management**: In-memory storage with garbage collection
- **Request Cancellation**: AbortController for cancelled operations
- **Retry Logic**: Exponential backoff for failed requests

### Build System

- **Bundler**: Vite for fast development and optimized builds
- **Dependencies**: ES modules via CDN (esm.sh) for production
- **TypeScript**: Type checking and compilation
- **Import Maps**: Browser-native module resolution

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key

3. Run the app:
   ```bash
   npm run dev
   ```

## Usage

1. **Setup**: Enter your Gemini API key(s) in the settings panel
2. **Select Style**: Choose from predefined styles or create a custom prompt
3. **Capture**: Take individual photos or enable auto-capture mode
4. **Live Mode**: Enable for continuous real-time transformations
5. **Create GIF**: Generate animated GIFs from your photo collection
6. **Replay**: View your generated images in slideshow mode
