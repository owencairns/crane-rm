import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Sparkles } from "lucide-react"

export function ComingSoon({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md shadow-lg animate-slide-up">
        <CardHeader className="space-y-4">
          <div className="flex justify-center">
            <Sparkles className="h-10 w-10 text-primary" />
          </div>
          <div className="space-y-1 text-center">
            <CardTitle className="text-xl font-bold">{title} is coming soon</CardTitle>
            <CardDescription>
              {description ??
                "This tool is still being built. It'll show up here the moment it's ready."}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  )
}
