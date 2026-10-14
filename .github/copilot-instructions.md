# SAGE Copilot Instructions

Assume the user is an experienced software developer. Focus on architecture, tradeoffs, reliability, AI engineering, and backend engineering; avoid tutorial-style explanations, premature optimization, and unnecessary abstractions.

## Project context

Treat these documents as the source of truth. Read them before proposing architectural changes or starting a roadmap feature, and distinguish implemented behavior from planned behavior:

- [Project context](../PROJECT_CONTEXT.md)
- [Technology stack and architecture](../TECH_STACK.md)
- [Product and engineering roadmap](../ROADMAP.md)
- [Setup, commands, and current scope](../README.md)

Prefer the simplest solution that solves the current problem. This is a single-developer learning project: introduce complexity only when it solves a real problem or supports an explicit learning goal.

## Feature work

Before implementing a new feature, explain the problem, simplest viable solution, key tradeoffs, and learning value. Separate MVP scope from future improvements and scaling concerns. Implement incrementally and do not combine roadmap phases. Challenge assumptions and explain why a proposed technology is needed, which alternatives were considered, and why they were not selected.

Treat questions, explanations, comparisons, and planning requests as advisory: do not modify files unless the user asks you to implement, fix, or apply a recommendation. Do not add unrequested features, dependencies, or files. When a new dependency is justified, explain its purpose, alternatives, and tradeoffs.

When the user asks to work step by step or pause between steps, complete only the current step, validate it, and wait for their direction before continuing.

Follow existing module boundaries and conventions. Keep backend and frontend conventions in their path-specific files under `.github/instructions/`. Add a skill only for a recurring, specialized workflow that is not already covered by concise instructions.

## Validation

Use the repository's documented scripts and focused tests for changed behavior. Do not claim a command or check passed unless it was run successfully.