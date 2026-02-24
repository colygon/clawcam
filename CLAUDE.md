# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
# Install dependencies
npm install

# Start development server (default port 5173)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### API Configuration
Before running the app, configure an OpenClaw endpoint that handles image transforms:
1. Deploy your OpenClaw endpoint so it accepts a JSON POST with `{ "image", "prompt" }`.
2. Set environment in `.env.local`:
   ```
   VITE_OPENCLAW_AGENT_ENDPOINT=http://localhost:8787/agent-run
   VITE_OPENCLAW_AGENT_TOKEN=<optional token>
   ```

### Authentication (Clerk)
The app uses Clerk for user authentication:
1. Set up a Clerk application at [clerk.com](https://clerk.com)
2. Add your publishable key to `.env.local`:
   ```
   VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key_here
   ```
3. The auth flow allows all users (signed-in and signed-out) to use the camera app
4. A "Sign In" button appears in the top-right for guest users
5. A user profile button appears for authenticated users

## Architecture

This is a React single-page application that transforms webcam photos through an OpenClaw agent. The codebase uses a modular architecture with Zustand for state management and Vite as the build tool.

### Core Modules

- **`src/lib/store.js`**: Global state management using Zustand with Immer middleware. Contains all application state including photos array, API keys, UI modes, and user preferences.

- **`src/lib/actions.js`**: Business logic layer that handles photo capture, AI processing, GIF creation, and localStorage persistence. Key functions:
  - `snapPhoto()`: Captures webcam and triggers AI transformation
  - `makeGif()`: Creates animated GIFs from photo collection
  - `savePhotos()`/`loadPhotos()`: Manages localStorage persistence

- **`src/lib/llm.js`**: OpenClaw agent integration with:
  - Sends captures + transformation instructions to the configured endpoint
  - Concurrent request limiting (max 2)
  - AbortController support for cancellation

- **`src/lib/imageData.js`**: In-memory storage for base64 encoded images, separated into `inputs` (webcam captures) and `outputs` (AI generated).

- **`src/lib/modes.js`**: Contains 12+ predefined art style transformation prompts plus support for custom user prompts.

- **`src/components/App.jsx`**: Main React component handling webcam integration, UI rendering, timer management, and user interactions.

### Key Implementation Details

- **Image Processing**: Webcam → Canvas (640x480) → Base64 JPEG → AI API → Base64 PNG response
- **Concurrency Control**: Uses `p-limit` to restrict simultaneous AI requests to 2
- **Memory Management**: Automatically removes old photos when count exceeds 10
- **Agent routing**: Request is sent to the configured OpenClaw endpoint via JSON POST with the frame and prompt
- **GIF Generation**: Client-side using `gifenc` library, processes up to 5 recent images at 512x512

### State Flow

1. User captures photo via webcam
2. Image stored in `imageData.inputs` and photo metadata added to store
3. AI request sent with selected mode's prompt
4. Generated image stored in `imageData.outputs`
5. UI re-renders with updated state
6. Optional: Save to localStorage for persistence

### UI Features

- **Live Mode**: Auto-cycles through generated images every 500ms
- **Auto-Capture**: Configurable interval (1-100 seconds) with countdown
- **Replay Mode**: Slideshow of generated images
- **Custom Prompts**: User-defined transformation prompts
- **Multi-Key Support**: Up to 5 API keys with automatic rotation