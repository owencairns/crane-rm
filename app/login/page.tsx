"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { LogIn } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const { signIn, signUp } = useAuth()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (isSignUp) {
        await signUp(email, password)
        toast.success("Account created successfully!")
      } else {
        await signIn(email, password)
        toast.success("Signed in successfully!")
      }
      router.push("/dashboard")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md shadow-lg animate-slide-up">
        <CardHeader className="space-y-4">
          <Link href="/" className="flex flex-col items-center gap-3">
            <Image
              src="/red-cedar-logo.svg"
              alt="Red Cedar Agency"
              width={60}
              height={60}
              className="h-15 w-auto"
            />
            <div className="text-center">
              <h1 className="font-bold text-lg text-foreground">Crane Risk Management</h1>
              <p className="text-xs text-muted-foreground">by Red Cedar Insurance Agency</p>
            </div>
          </Link>
          <div className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">
              {isSignUp ? "Start your 60-day free trial" : "Welcome back"}
            </CardTitle>
            <CardDescription className="text-center">
              {isSignUp
                ? "No credit card required. Get instant access."
                : "Enter your credentials to access your account"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              <LogIn className="mr-2 h-4 w-4" />
              {loading ? "Loading..." : isSignUp ? "Sign Up" : "Sign In"}
            </Button>
          </form>
        </CardContent>
        <CardFooter>
          <Button
            variant="link"
            className="w-full"
            onClick={() => setIsSignUp(!isSignUp)}
            disabled={loading}
          >
            {isSignUp
              ? "Already have an account? Sign in"
              : "Don't have an account? Sign up"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
