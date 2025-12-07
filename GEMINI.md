# GEMINI.md

## Project Overview

This is a "Golf AI" project, a solo practice assistant for golfers. It is a web application built with React, TypeScript, and Vite. The application uses MediaPipe's pose detection technology to analyze a user's golf swing from a video recording. The analysis results are then stored locally in the browser using IndexedDB, allowing users to track their progress over time.

The application has the following features:

*   **Record Swing:** Record a new golf swing using the device's camera.
*   **Import Video:** Import an existing video of a golf swing.
*   **Swing Analysis:** Analyze the golf swing using MediaPipe's pose detection to calculate various metrics.
*   **Review Swing:** Review the analysis of a recorded swing.
*   **History:** View a history of all recorded swings.

## Key Technologies

*   **Frontend:** React, TypeScript, Vite
*   **Styling:** Tailwind CSS
*   **AI/ML:** MediaPipe Pose Detection
*   **Client-side Storage:** Dexie (IndexedDB wrapper)
*   **Routing:** React Router

## Building and Running

### Prerequisites

*   Node.js and yarn

### Installation

```bash
yarn install
```

### Development

To run the development server:

```bash
yarn dev
```

### Build

To build the project for production:

```bash
yarn build
```

### Lint

To lint the codebase:

```bash
yarn lint
```

### Preview

To preview the production build locally:

```bash
yarn preview
```

## Development Conventions

*   **Component-Based Architecture:** The project follows a component-based architecture with a clear separation of concerns.
*   **Styling:** Styling is done using Tailwind CSS.
*   **State Management:** Local component state is used for managing UI state. For more complex state, a custom hook or a state management library might be used.
*   **Data Storage:** Swing data is stored locally in the browser using Dexie.
*   **Linting:** The project uses ESLint for code quality and consistency.
*   **Type Checking:** TypeScript is used for static type checking.

## Language

*   Responses and comments should be in Japanese. (受け答えやコメントは日本語でするように)