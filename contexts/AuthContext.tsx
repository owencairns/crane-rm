"use client"

import { createContext, useContext } from "react"
import { authClient } from "@/lib/auth-client"

interface AppUser {
  id: string
  email: string
  displayName: string
  photoURL: string | null
  metadata: {
    creationTime: string | null
    lastSignInTime: string | null
  }
  providerData: Array<{
    providerId: string
    email?: string
  }>
}

interface AuthContextType {
  user: AppUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => {},
  signUp: async () => {},
  signInWithGoogle: async () => {},
  signOut: async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

interface SessionSnapshot {
  user?: {
    id: string
    email: string
    name?: string | null
    image?: string | null
    createdAt?: string | Date | null
  }
  session?: {
    createdAt?: string | Date | null
  }
}

function mapSessionUser(session: SessionSnapshot | null | undefined): AppUser | null {
  if (!session?.user) {
    return null
  }

  const createdAt = session.user.createdAt ? new Date(session.user.createdAt).toISOString() : null
  const lastSignInTime = session.session?.createdAt
    ? new Date(session.session.createdAt).toISOString()
    : createdAt

  return {
    id: session.user.id,
    email: session.user.email,
    displayName: session.user.name || session.user.email.split("@")[0],
    photoURL: session.user.image || null,
    metadata: {
      creationTime: createdAt,
      lastSignInTime,
    },
    providerData: [
      {
        providerId: "credentials",
        email: session.user.email,
      },
    ],
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const session = authClient.useSession()
  const user = mapSessionUser(session.data as SessionSnapshot | null | undefined)

  const signIn = async (email: string, password: string) => {
    const result = await authClient.signIn.email({
      email,
      password,
    })

    if (result.error) {
      throw new Error(result.error.message || "Failed to sign in")
    }
  }

  const signUp = async (email: string, password: string) => {
    const result = await authClient.signUp.email({
      email,
      password,
      name: email.split("@")[0],
    })

    if (result.error) {
      throw new Error(result.error.message || "Failed to create account")
    }
  }

  const signInWithGoogle = async () => {
    throw new Error("Google sign-in is not configured in the Convex migration")
  }

  const signOut = async () => {
    const result = await authClient.signOut()
    if (result.error) {
      throw new Error(result.error.message || "Failed to sign out")
    }
  }

  const value = {
    user,
    loading: session.isPending,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
