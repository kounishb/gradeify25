# Gradeify

Gradeify is a full-stack AI learning platform that helps students turn their grades, classes, and weak areas into personalized study tools.

Instead of only showing students their grades, Gradeify helps them act on them. Students can manage classes, generate AI-powered practice questions, create flashcards, review missed concepts, share study materials with groups, and use interactive study games to make learning more engaging.

## Live Demo

https://gradeify.org

## Features

- Student dashboard for managing classes and academic progress
- Manual class and grade tracking
- AI-generated practice tests based on class context
- AI-generated flashcards for targeted review
- Review system for saved practice tests, missed questions, and study history
- Group study tools with chat and shared practice/flashcard materials
- StudentVUE import workflow for bringing gradebook data into the platform
- Chrome extension experimentation for automated StudentVUE grade capture
- Interactive study games, including tower defense, runner-style flashcard games, and a Rubik’s Cube feature
- Feedback/testimonial system for collecting and displaying user feedback
- Responsive frontend designed for desktop and mobile use
- Production deployment with separate frontend and backend infrastructure

## Tech Stack

### Frontend

- React
- React Router
- Vite
- JavaScript / JSX
- CSS
- KaTeX for math rendering

### Backend

- Node.js
- Express
- Session-based authentication
- REST API routes

### Database and Auth

- Supabase
- Cookie-based sessions
- User preferences and class data storage

### AI

- OpenAI API
- Structured JSON generation for practice questions and flashcards

### Browser Extension

- Chrome Manifest V3
- Chrome debugger API experimentation
- StudentVUE network capture and parsing workflows

### Deployment

- Vercel frontend
- Render backend
- GoDaddy custom domain
- Production CORS and session-cookie configuration

## Technical Highlights

- Built a full-stack React and Express application with separate frontend and backend deployments.
- Implemented session-based authentication using secure cookies across a production frontend/backend split.
- Configured production CORS, cookie, and environment settings for cross-origin login and authenticated API requests.
- Integrated the OpenAI API to generate structured practice tests and flashcards that can be rendered and saved in the app.
- Built a review flow so students can revisit previous generated materials and missed questions.
- Designed group study functionality with shared messages and study materials.
- Integrated Supabase as the database layer for users, classes, preferences, groups, messages, feedback, and generated study content.
- Developed StudentVUE import workflows to explore how gradebook data can be normalized into Gradeify classes.
- Built Chrome MV3 extension experiments for capturing StudentVUE gradebook network responses.
- Added interactive game-based learning tools to connect studying with more engaging practice formats.
- Deployed the app with a Vercel frontend, Render backend, and production domain configuration.

## Architecture

```txt
React + Vite Frontend
        ↓
Authenticated API requests
        ↓
Node / Express Backend
        ↓
Supabase Database

Additional services:
- OpenAI API for practice and flashcard generation
- Chrome MV3 extension for StudentVUE import experiments
- Vercel for frontend deployment
- Render for backend deployment
```

## Core Workflows

### AI Practice Generation

Students can generate practice questions from class context. The backend sends a structured prompt to the OpenAI API and returns JSON-formatted questions, answer choices, correct answers, and explanations.

```txt
Class context → Express API → OpenAI API → Structured JSON → Practice UI → Review history
```

### AI Flashcard Generation

Students can generate flashcards for a selected class or topic. Flashcards are returned as structured data and displayed in an interactive study interface.

```txt
Topic / class selection → AI generation → Flashcard set → Saved review flow
```

### StudentVUE Import

Gradeify includes work toward importing class and gradebook data from StudentVUE. The system is designed to normalize external gradebook data into Gradeify’s internal class structure.

```txt
StudentVUE data → parser / import workflow → normalized classes → Gradeify dashboard
```

### Group Study

Students can create groups, send messages, and share generated flashcards or practice tests with others.

```txt
Group creation → members → messages → shared study material → review / practice
```

## Repository Structure

```txt
gradeify25/
├── public/                        # Static assets
├── src/                           # Main frontend source files
│   ├── components/                # Reusable UI components
│   ├── pages/                     # App pages and routes
│   ├── styles/                    # CSS files
│   └── main.jsx                   # Frontend entry point
├── server/                        # Express backend API
├── package.json                   # Project dependencies and scripts
├── vite.config.js                 # Vite configuration
└── README.md                      # Project documentation
```

Note: this structure may need to be adjusted slightly depending on the exact current folder layout.

## Environment Variables

Gradeify uses environment variables for API keys, database credentials, session security, and deployment configuration.

Example frontend variables:

```env
VITE_API_URL=your_backend_url
```

Example backend variables:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
OPENAI_API_KEY=your_openai_api_key
SESSION_SECRET=your_session_secret
CLIENT_ORIGINS=https://gradeify.org,https://www.gradeify.org
NODE_ENV=production
```

Do not commit real environment variables.

## Local Development

Clone the repository:

```bash
git clone https://github.com/kounishb/gradeify25.git
cd gradeify25
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview or run the production build:

```bash
npm run preview
```

If the frontend and backend use separate folders, run the install/start commands inside each folder and update this section with the exact commands.

## Deployment Notes

Gradeify is deployed with a separate frontend and backend:

- Frontend: Vercel
- Backend: Render
- Domain: gradeify.org
- Database: Supabase

Production deployment requires correct CORS and cookie configuration so authenticated requests work across the frontend and backend domains.

Key production settings include:

```env
CLIENT_ORIGINS=https://gradeify.org,https://www.gradeify.org
NODE_ENV=production
SESSION_SECRET=your_session_secret
```

Frontend API requests must use the deployed backend URL and include credentials for authenticated routes.

## Security Notes

- Real `.env` files should never be committed.
- Session secrets and API keys should only be stored in deployment environment variables.
- StudentVUE-related workflows should avoid storing user credentials unnecessarily.
- Any sample gradebook data used for testing should be fake or anonymized.

## Status

Gradeify is in active development.

Current focus areas include:

- Improving StudentVUE import reliability
- Expanding AI-powered practice and flashcard generation
- Strengthening group study and shared learning workflows
- Improving review history for missed concepts
- Adding more interactive study games
- Refining production deployment and authentication behavior
- Building toward a more personalized AI tutor experience

## Roadmap

- More reliable StudentVUE assignment and category import
- Better support for weighted grading systems
- AI tutor that recommends practice based on weak areas
- More detailed analytics for student progress
- Improved group collaboration and shared study spaces
- Expanded game-based learning modes
- More polished mobile experience
- Demo mode with sample student data

## Why I Built This

Students often know their grades but do not always know what to do next. Gradeify was built to close that gap by connecting grade tracking, AI-generated study tools, review history, collaboration, and interactive practice in one platform.

The goal is to help students move from simply checking grades to actively improving them.

## Author

Created by Kounish Bhattacharjee, Lukas Chu, Natasha Parakh