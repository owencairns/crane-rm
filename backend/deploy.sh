#!/bin/bash
set -e

# Get project ID
PROJECT_ID=$(gcloud config get-value project)
if [ -z "$PROJECT_ID" ]; then
  echo "Error: No GCP project set. Run: gcloud config set project YOUR_PROJECT_ID"
  exit 1
fi

# Generate a tag from git commit or timestamp
if git rev-parse --short HEAD > /dev/null 2>&1; then
  TAG=$(git rev-parse --short HEAD)
else
  TAG=$(date +%Y%m%d%H%M%S)
fi

IMAGE="gcr.io/$PROJECT_ID/certmaster-crane-backend"

echo "=== Building backend ==="
npm run build

echo "=== Building Docker image ==="
docker build -t "$IMAGE:$TAG" -t "$IMAGE:latest" .

echo "=== Pushing to Container Registry ==="
docker push "$IMAGE:$TAG"
docker push "$IMAGE:latest"

echo "=== Deploying to Cloud Run ==="
gcloud run deploy certmaster-crane-backend \
  --image="$IMAGE:$TAG" \
  --platform=managed \
  --region=us-central1 \
  --allow-unauthenticated \
  --memory=2Gi \
  --cpu=2 \
  --timeout=900s \
  --max-instances=10 \
  --min-instances=0 \
  --concurrency=10 \
  --no-cpu-throttling \
  --set-env-vars=NODE_ENV=production \
  --set-secrets=OPENAI_API_KEY=openai-api-key:latest,FIREBASE_PRIVATE_KEY=firebase-private-key:latest

echo "=== Deployment complete ==="
gcloud run services describe certmaster-crane-backend --region=us-central1 --format='value(status.url)'
