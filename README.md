# vecherinkach-frontend

## Deployment

This project is configured for deployment on Vercel.

1. Connect your GitHub repository to Vercel.
2. Vercel will automatically detect Next.js and deploy using the configuration in `vercel.json`.
3. Set the following environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anonymous key
4. Deploy!

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