# Austrian Support Desk Modmail Bot

This folder is ready to upload directly to a GitHub repo and deploy on Railway.

## Upload These Files

- `index.js`
- `package.json`
- `.gitignore`
- `.env.example`
- `ENVIRONMENT_VARIABLES.txt`
- `Dockerfile`
- `README.md`

## Railway

1. Create a new GitHub repo.
2. Upload every file from this folder to the repo root.
3. In Railway, deploy that GitHub repo.
4. Add the environment variables listed in `ENVIRONMENT_VARIABLES.txt`.
5. Start the deploy.

Railway should work from `package.json` automatically, and the `Dockerfile` is included as a fallback.

## Discord Setup

Turn on `MESSAGE CONTENT INTENT` in the Discord Developer Portal for your bot.

The bot also needs permission to:

- View Channels
- Send Messages
- Manage Channels
- Read Message History
- Embed Links
- Attach Files

## Required Variables

See `ENVIRONMENT_VARIABLES.txt`.
