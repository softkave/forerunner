# softkave-forerunner's agent instructions

## Project Overview

Softkave's internal application runner & helpers - A CLI tool and SDK for managing certificates, MongoDB instances, system hosts file, process management, etc.

The project provides a CLI and JS SDK. The CLI is split into sub-programs using `commander`, and each sub-program exports commands for specific tasks. The JS SDK exports functions used by the CLI to avoid diverging implementations. There are other parts of the JS SDK not available through the CLI for consumption as code by other projects.

## Setup & Build Commands

- `npm compile` - To compile the project.

## Testing Instructions

- `npm test` - To test the project. It wraps `vitest run`, so it can be called with vitest arguments.

## Code Style & Conventions

### Code Style

- Code should be concise, reusable, maintainable, secure, and performant.
- Functions should strive to do one thing, and can be composed in composer/orchestrator functions to fulfill a specific task.
- When a function becomes too long, split it into smaller logical functions.
- When planning or implementing, if you encounter existing functions where some parts meet your needs, refactor them into reusable functions to use in the original and new code. This is to promote code reusability and prevent code duplication across the codebase. One-liners do not qualify for this rule. If the behaviour of the original function will be altered by refactoring it, do not refactor it.
- When planning or implementing, if there's a function that does something similar to what you need that can be updated to do what you want without altering existing behaviour, do that.
- Simplify complex code if it can be simplified without altering behaviour.
- Remove unnecessary comments that describe obvious code.
- If a file is dedicated to a task/goal, add top-level documentation providing an overview of what it does, a summary of how it accomplishes it, its assumptions, considerations, and gotchas.
- Add concise documentation to high-level code (like functions, classes, etc.) providing a summary of what it does, how it accomplishes it (if that knowledge is necessary for its callers), and its assumptions, considerations, and gotchas (with a focus on how well it'll help the caller better use the code).
- Update existing documentation where needed when you make code changes.
- Add documentation to complex code for human comprehension and maintenance.
- If an assumption is made, add a short documentation justifying why.
- Folder should generally have an `index.ts` file for files exported outside the folder. Files that export code for use within the folder do not need to be included in the index file.
- Most functions are provided a `logger`, use it generously.
- Use short comments to break functions into logical blocks as appropriate.

### Conventions

- Each sub-program/logical group is grouped in a folder.

## Architecture

(To be documented)

## Security & Guardrails

(To be documented)
