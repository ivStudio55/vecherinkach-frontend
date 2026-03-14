# vecherinkach-frontend

## Deployment

Automated Vercel builds have been disabled to keep this repo as a backup. Deploy manually when needed:

1. Build locally: `npm run build`
2. Start locally for smoke tests: `npm run start`
3. Deploy with your chosen target (e.g., `npx vercel --prod --yes` with the required env vars set, or your own host).

Environment variables required at deploy time:
- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anonymous key

## Local Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run start
```

## Testing

Visit `/test` in your browser to run Supabase diagnostics.