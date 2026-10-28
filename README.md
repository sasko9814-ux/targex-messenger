# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## TargeX — testing & security checks

Run unit tests (validation rules, error translation, routing):

    bun run test

Manual security checks:
1. Sign up two accounts A and B. Signed in as A, in the browser console run
   `supabase.from('profiles').select('*')` — only A's row must come back.
2. As A, try `update({display_name:'x'}).eq('id', <B id>)` — 0 rows affected.
3. Try registering a username that exists with different casing — it must be rejected.
4. Open `/profile` signed out — you must be redirected to `/auth`.
5. Passwords are handled only by Lovable Cloud auth (hashed); the app never stores them.
