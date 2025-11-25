# CertMaster Crane

AI-powered contract analysis for crane and rigging contracts. Upload PDF contracts and get instant risk analysis powered by OpenAI GPT-5-mini.

## Monorepo Structure

This is an npm workspaces monorepo containing:

```
certmaster-crane/
├── app/                    # Next.js frontend (App Router)
├── backend/                # Express.js API with AI agent
├── components/             # React UI components
├── lib/                    # Shared utilities
├── contexts/               # React contexts
└── package.json           # Workspace root
```

## Features

### Frontend
- Firebase Authentication (Email/Password and Google Sign-In)
- Contract upload with drag & drop
- Real-time analysis progress tracking
- Interactive analysis results viewer
- Protected routes with authentication checks
- Responsive navigation with mobile support
- Dark mode ready with shadcn/ui theming

### Backend AI Analysis
- **GPT-5-mini powered** contract analysis
- Automatic risk detection (high/medium/low severity)
- Specialized search tools for clause identification
- Async job processing with progress updates
- Firebase Storage integration
- Firestore for results persistence

## Tech Stack

### Frontend
- **Framework**: Next.js 16 (App Router)
- **Authentication**: Firebase Auth
- **UI Components**: shadcn/ui
- **Styling**: Tailwind CSS 4
- **Language**: TypeScript

### Backend
- **Framework**: Express.js
- **AI Model**: OpenAI GPT-5-mini (via Vercel AI SDK)
- **Storage**: Firebase Storage + Firestore
- **PDF Processing**: pdf-parse
- **Language**: TypeScript
- **Deployment**: Google Cloud Run

## Getting Started

### Quick Start

1. **Install dependencies**:
```bash
npm install
```

This installs both frontend and backend dependencies via npm workspaces.

2. **Configure backend** (edit `backend/.env`):
```bash
cd backend
# Add your OpenAI API key and Firebase credentials
```

3. **Start both servers**:

**Option A - Run together:**
```bash
npm run dev:all
```

**Option B - Run separately:**
```bash
# Terminal 1 - Frontend
npm run dev

# Terminal 2 - Backend
npm run dev:backend
```

4. **Open the app**:
   - Frontend: [http://localhost:3000](http://localhost:3000)
   - Backend API: [http://localhost:8080](http://localhost:8080)

5. **Demo credentials**:
   - **Email**: `demo@certmaster.com`
   - **Password**: `demo123`

The app will automatically detect that Firebase is not configured and use local authentication instead.

### Prerequisites (For Firebase)

- Node.js 20+ installed
- A Firebase project set up at [Firebase Console](https://console.firebase.google.com/)

### Firebase Setup (Optional - Skip if using Demo Mode)

1. Create a new Firebase project at [Firebase Console](https://console.firebase.google.com/)
2. Enable Authentication:
   - Go to Authentication > Sign-in method
   - Enable "Email/Password" provider
   - Enable "Google" provider (optional)
3. Get your Firebase config:
   - Go to Project Settings > General
   - Scroll to "Your apps" section
   - Click the web app icon to create a web app (if you haven't)
   - Copy the Firebase configuration

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Create a `.env.local` file in the root directory:

```bash
cp .env.local.example .env.local
```

4. Add your Firebase configuration to `.env.local`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

5. Run the development server:

```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
certmaster-crane/
├── app/
│   ├── (authenticated)/      # Protected routes
│   │   ├── dashboard/        # Dashboard page
│   │   ├── profile/          # Profile page
│   │   └── layout.tsx        # Authenticated layout
│   ├── login/                # Login page
│   ├── layout.tsx            # Root layout
│   ├── globals.css           # Global styles
│   └── page.tsx              # Home page (redirects to dashboard)
├── components/
│   ├── ui/                   # shadcn/ui components
│   ├── layout/
│   │   └── AppNav.tsx        # Navigation component
│   └── ProtectedRoute.tsx    # Route protection wrapper
├── contexts/
│   └── AuthContext.tsx       # Authentication context
├── lib/
│   ├── firebase.ts           # Firebase configuration
│   ├── dummyAuth.ts          # Demo mode authentication
│   └── utils.ts              # Utility functions
├── STYLE_GUIDE.md            # Project style guide
└── components.json           # shadcn/ui configuration
```

## Authentication

The app supports two authentication modes:

### Demo Mode (Default without Firebase)
- **Local Authentication**: Works immediately without any setup
- **Demo Credentials**: `demo@certmaster.com` / `demo123`
- **Sign Up Support**: Create new demo accounts (stored in localStorage)
- **Auto-Detection**: Automatically activates when Firebase is not configured
- **Visual Indicator**: Shows a blue notification banner on login page

### Firebase Mode (When Configured)
- **Email/Password**: Users can sign up and sign in with email and password
- **Google Sign-In**: Users can authenticate using their Google account
- **Protected Routes**: Authenticated pages are wrapped with `ProtectedRoute` component
- **Auth Context**: Global authentication state management via React Context

The app automatically switches between Demo and Firebase mode based on environment configuration. No code changes needed!

### Using Authentication

```tsx
import { useAuth } from "@/contexts/AuthContext"

function MyComponent() {
  const { user, signIn, signOut } = useAuth()

  // user is null when not authenticated
  // user contains Firebase User object when authenticated
}
```

## Styling

This project uses shadcn/ui components with Tailwind CSS. Please refer to [STYLE_GUIDE.md](./STYLE_GUIDE.md) for detailed styling guidelines.

### Key Points:

- Always use shadcn/ui components when available
- Use the `cn()` utility from `@/lib/utils` for className merging
- Follow semantic color naming (e.g., `bg-primary`, `text-foreground`)
- Dark mode is automatically supported via CSS variables

### Adding New Components

Install shadcn/ui components as needed:

```bash
npx shadcn@latest add [component-name]
```

Example:
```bash
npx shadcn@latest add dialog
npx shadcn@latest add table
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js frontend |
| `npm run dev:backend` | Start Express backend |
| `npm run dev:all` | Start both (requires concurrently) |
| `npm run build` | Build frontend |
| `npm run build:backend` | Build backend |
| `npm run start` | Start frontend production |
| `npm run start:backend` | Start backend production |
| `npm run lint` | Run ESLint |

## Documentation

- **[Backend Quick Start](backend/QUICKSTART.md)** - Get backend running in 3 steps
- **[Integration Guide](INTEGRATION.md)** - Connect frontend to backend
- **[Backend API Docs](backend/README.md)** - API endpoints and usage
- **[Deployment Guide](backend/DEPLOYMENT.md)** - Deploy to Google Cloud Run
- **[Project Summary](backend/PROJECT_SUMMARY.md)** - Complete technical overview
- **[Style Guide](STYLE_GUIDE.md)** - Frontend styling guidelines

## Pages

### Login (`/login`)
- Email/password authentication form
- Google sign-in button
- Toggle between sign in and sign up modes
- Redirects to dashboard after successful authentication

### Dashboard (`/dashboard`)
- Protected route (requires authentication)
- Displays user welcome message
- Shows placeholder statistics cards
- Placeholder for recent activity

### Profile (`/profile`)
- Protected route (requires authentication)
- Displays user account information
- Shows authentication methods
- Account creation and last sign-in dates

## How Contract Analysis Works

1. User uploads PDF contract via frontend
2. Frontend saves to Firebase Storage
3. Frontend triggers backend analysis API
4. Backend downloads PDF and extracts text
5. AI agent (GPT-5-mini) analyzes with specialized tools:
   - `searchContract` - Find keywords/clauses
   - `readPages` - Read specific sections
   - `checkForClause` - Verify clause presence
   - `recordFinding` - Document issues with severity
6. Findings saved to Firestore in real-time
7. Frontend polls for status and displays results

### What the AI Detects

- **High Risk**: Indemnification issues, unlimited liability, inadequate insurance
- **Medium Risk**: Warranty problems, dispute resolution, IP concerns
- **Low Risk**: Standard boilerplate, routine requirements

Each finding includes severity, description, page reference, and recommendations.

## Architecture

```
Frontend (Next.js)          Backend (Express)
┌─────────────────┐        ┌──────────────────┐
│                 │        │                  │
│  User uploads   │        │  AI Analysis     │
│  PDF file       │─────┐  │  with GPT-5-mini │
│                 │     │  │                  │
└─────────────────┘     │  └──────────────────┘
                        │
                        ▼
                  ┌──────────────┐
                  │   Firebase   │
                  │   Storage    │
                  │  + Firestore │
                  └──────────────┘
```

## Next Steps

- [x] AI-powered contract analysis with GPT-5-mini
- [x] Backend API with Express.js
- [x] Firebase Storage & Firestore integration
- [x] Async job processing
- [ ] Connect upload component to backend API
- [ ] Add status polling UI
- [ ] Display real analysis results
- [ ] Deploy backend to Cloud Run
- [ ] Add role-based access control
- [ ] Implement email verification

## Contributing

Please read [STYLE_GUIDE.md](./STYLE_GUIDE.md) before contributing to ensure consistency in styling and component usage.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
