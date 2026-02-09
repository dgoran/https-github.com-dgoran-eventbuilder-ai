<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/158vKNNAwi8B-w4sE96H_6co3V6JoQRW5

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Run With Docker

1. Copy the Docker env template and set required secrets:
   `cp .env.docker.example .env.docker`
2. Build and start:
   `docker compose --env-file .env.docker up --build -d`
3. Open:
   `http://localhost:8080`

Notes:
- SQLite data persists in Docker volume `eventbuilder_data`.
- Required envs in container are `ENCRYPTION_KEY` and one auth mode (`APP_API_TOKEN` or JWT/OIDC settings).
- User session auth is supported via magic-link and OAuth providers.
- For OAuth redirects in local/dev, set `APP_BASE_URL` (for example `http://localhost:8080`) and provider client credentials in `.env.docker`.
