# Claude Code Instructions

## Auto-deploy after every change

After making ANY code change to this project, always run:

```bash
cd ~/drum-practice && git add . && git commit -m "<short description of change>" && git push
```

This triggers GitHub Actions which auto-deploys to https://drum-practice-duvan.vercel.app

Do this automatically without asking the user — they should never have to run git commands manually.
