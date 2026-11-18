export const CERT_IN_FLIGHT = ["uploaded", "reading", "extracting", "generating"]

export function certStatusLabel(status: string): string {
  switch (status) {
    case "uploaded":
      return "Queued"
    case "reading":
      return "Reading contract…"
    case "extracting":
      return "Finding requirements…"
    case "generating":
      return "Filling ACORD 25…"
    case "complete":
      return "Ready"
    case "failed":
      return "Failed"
    default:
      return status
  }
}
