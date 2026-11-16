<!-- AI use: written with AI help from Claude Code (Sonnet 5.5), directed by Irene Riva. -->
# Project safety and team workflow

## Secrets and data
- Never write an API key, token, password or connection string into a file, a commit, a test or a chat. Secrets live in `.env` / `.env.local`, which are never committed. If you see a secret in the repo, stop and tell the developer.
- Never connect to Neon or any shared database. Use the fake API (frontend) or a local test database (backend).
- Never delete records or add a way to delete them. Use flagging (charter 2.3 f.iv).

## Commands
- Always ask before running a terminal command, and explain what it does. Never run destructive commands (`rm -rf`, `git reset --hard`, `git push --force`, dropping a database).
- Never commit or push. The developer reviews the changes first and does that.

## Git workflow
- Work on a branch named `CHUD-<ticket>-<short-description>`, never on `main`.
- Open a pull request into `main`, ask for one teammate's review, and run the tests before asking.
- Change only what the ticket needs. Do not reformat or "clean up" other people's files.
- A change to the database is a NEW add-on `.sql` file in `DataBase/` that is safe to run twice. Never edit `database_schema.sql` or an add-on that has already been run.
