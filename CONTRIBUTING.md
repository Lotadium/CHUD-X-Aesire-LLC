# Contributing

How Team CHUD works on this repository: branches, commits, pull requests, reviews and merging.
To set up the project, see the [README](README.md#getting-started).

## Branching strategy

- **`main`** is the only long-lived branch. It is protected, always builds and passes its tests, and only changes
  through an approved pull request.
- **One branch per Jira ticket**, created from the latest `main`:

  ```bash
  git checkout main
  git pull
  git checkout -b CHUD-<number>-<short-description>
  ```

- **Branch names:** `CHUD-<number>-<short-description>`, with the Jira ticket number and a few lowercase words joined
  by hyphens, for example `CHUD-36-previous-versions-last-updated-date`.
- **Pull requests always target `main`.**
- **Staying up to date:** when `main` changes, merge it into your branch (`git fetch` then `git merge origin/main`),
  fix any conflicts, run the checks again and push. Don't rebase or force-push a branch that is already in review.
- Delete the branch after it is merged.

## Commit messages

```
CHUD-<number>: <what changed, in a short sentence>

<optional body: why, and anything a reviewer should know>
```

- Start with the Jira ticket, e.g. `CHUD-36: only manual saves set last_verified_at`.
- Keep the first line under about 72 characters. Write what the commit does, not what you did that day.
- One logical change per commit, and no unrelated changes.
- If an AI tool helped write the change, end with a co-author line naming the tool and model, for example
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never commit secrets, `.env` files, connection strings or real client data.

## Pull requests

1. Push your branch and open a pull request into `main`. The [template](.github/pull_request_template.md) fills in
   automatically. Complete every section.
2. Title it like a commit message: `CHUD-<number>: <summary>`.
3. Keep it to one ticket. Smaller pull requests get faster, better reviews.
4. Before asking for review: the checks pass on your machine (`npm run typecheck`, `npm test`, and `npm run build`
   in `frontend/`), the README is updated if setup, features, endpoints or tables changed, and screen changes have
   screenshots using sample data.
5. Request a review from at least one teammate. Mention anything you could not test.

## Code review

**Required before merging**

- **1 approval** from a teammate other than the author.
- **New commits remove the approval.** Any push after approval needs a fresh approval.
- **All automated checks pass** (the `frontend` and `backend` CI jobs).
- **All review conversations are resolved.**

**Reviewers**

- Review within **2 days** of the request, or tell the author when you can.
- Check that the change does what the ticket asks, the tests cover it, nothing secret or personal is included,
  records are never deleted (they are flagged), and database changes are a new add-on `.sql` file.
- Choose **Approve**, **Comment** (questions or suggestions), or **Request changes** (must be fixed before merging).
  Say which comments are required and which are optional.

**Resolving feedback (author)**

1. Fix each requested change in a **new commit** on the same branch and push it. Don't force-push.
2. Reply to each comment with what you changed, or why you didn't.
3. Click **Re-request review** next to the reviewer's name.
4. The **reviewer** marks the conversation resolved once satisfied, then approves.

If the author and reviewer can't agree, bring it to the next team meeting.

## Merging

- The **author** merges once the pull request has an approval, passing checks and no open conversations.
- Use **Create a merge commit**. Don't squash or rebase, so each branch's `CHUD-<number>` commits stay in history.
- Delete the branch after merging, and move the Jira ticket to **Done**.
- Never push directly to `main`.

## Repository settings (admin)

These are set once by the repository owner in GitHub. They enforce the rules above.

**Branch protection for `main`:** Settings → Rules → Rulesets → New ruleset → New branch ruleset

1. Name: `Protect main`. Enforcement status: **Active**.
2. Target branches → Add target → **Include default branch** (`main`).
3. Turn on:
   - **Restrict deletions**
   - **Block force pushes**
   - **Require a pull request before merging**, with:
     - Required approvals: **1**
     - **Dismiss stale pull request approvals when new commits are pushed**
     - **Require conversation resolution before merging**
     - Allowed merge methods: **Merge** only
   - **Require status checks to pass**, with:
     - **Require branches to be up to date before merging**
     - Add checks: **`frontend`** and **`backend`**. They appear in the list after the CI workflow has run once,
       for example on the pull request that adds it.
4. Leave the bypass list empty and click **Create**.

The classic page (Settings → Branches → Add branch protection rule for `main`) has the same options if rulesets are
not available. On a private repository, branch protection needs a GitHub plan that supports it. Public repositories
can use it on the Free plan.

**Merge button:** Settings → General → Pull Requests → allow **merge commits** only, and turn on **Automatically
delete head branches**.
