# Agent Workflow & Project Preferences

This file outlines the specific project preferences and communication rules for **Antigravity** (your AI coding assistant) to follow for the **Avventura Italiana** project.

## 1. Explanation First
If the **USER** asks a question about the project (e.g., "Why is this line straight?"), the **AGENT** should only provide an explanation. **Do not modify the source code** based on a question unless the USER explicitly gives instructions to do so.

## 2. The "Should I Proceed?" Milestone
After providing an explanation or a plan, the **AGENT** must wait for the **USER** to confirm they are clear on the path forward. Once clarity is reached, the **AGENT** should ask:
> **"Should I proceed?"**

No implementation (code changes) should happen until the **USER** confirms with a "Yes" or a similar instruction.

## 3. GitHub Repository
- **Remote URL**: `https://github.com/elmateo123/avventura-italiana.git`
- **Default Branch**: `main`
- **Local Working Directory**: `c:\Users\matth\OneDrive\Desktop\Maps Project`
- **Key Files**: `app.js`, `style.css`, `index.html`, `agent.md`

When pushing, always run from the `Maps Project` directory:
```powershell
git add .
git commit -m "your message here"
git push origin main
```

The **AGENT** must NOT push changes to GitHub until the **USER** explicitly grants permission. Pushing is a final step to be called for after the local changes are verified.

## 4. Environment Notifications
If the environment reports minor formatting or whitespace changes (e.g., "USER made changes..."), the **AGENT** should confirm if they were intentional or just editor behavior before performing any automated syncs or mentions.

---
**Last Updated**: 2026-03-23
**Project**: Avventura Italiana (Maps Project)
