# CleanCircuit

Independent cleaning-business MVP owned by Raducon Holdings.

Run `npm ci`, copy `.env.example` to `.env`, set your own ADMIN_TOKEN, then `npm start` from this directory. Local default: http://localhost:3001. `/` is the pilot landing page; `/product` is the administrator-operated product prototype; `/privacy` is the privacy notice. Product APIs require this product's token. It has no agency research endpoints or Groq/Brave dependencies.

Use a separate PostgreSQL DATABASE_URL in hosting. JSON storage is for local development only. Set VALIDATION_ENABLED=true to open the pilot, along with PUBLIC_BUSINESS_NAME and PUBLIC_CONTACT_EMAIL. Agency approval data is not read by this service. Payments and email remain sandboxed unless explicitly configured otherwise.

In a Git-connected host, choose root directory `projects/cleancircuit`, build command `npm ci`, start command `npm start`, and health path `/health`. The Dockerfile also builds using this directory as its build context. Set PUBLIC_BASE_URL to the product domain. Copy only this product's environment variables, never agency credentials.

This remains a private MVP: customer accounts and tenant isolation are not implemented. Interview and signup administration remain available under the authenticated `/api/validation/` endpoints.
