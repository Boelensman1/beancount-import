# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js 16 (using app router) application built with React 19, TypeScript, and Tailwind CSS v4.

## Development Commands

### Essential Commands

- **Development server**: `command make dev` - Runs Next.js dev server with Turbopack on port 4101 (I always run this myself, should never be ran by claude)
- **Build**: `command make build` - Creates production build in `build/` directory (should not be ran to check if things compile, use linting and testing for this)
- **Production server**: `command make serve` - Starts production server after build
- **Install dependencies**: `command make install`
- **Clean**: `ommand make clean` - Removes node_modules

### Code Quality

- **Prettier fix**: `npx prettier --write .` - Apply prettier format
- **Lint**: `command make lint` - Runs Prettier formatting check and Next.js ESLint
- **Test**: `command make test` - Runs Vitest test runner

For all the make commands, it's extremely important to use the command binary before make! So e.g. run `command make lint` and not just `make lint`

Always run linting before testing.

When writing tests, use/update src/test/test-utils.ts when useful/needed

## Architecture

### Directory Structure

- `src/app/` - Next.js App Router pages and layouts
- `src/app/layout.tsx` - Root layout with Geist font configuration
- `src/app/page.tsx` - Homepage component
- `src/app/globals.css` - Global styles with Tailwind CSS

### Key Configuration

- **TypeScript**: Strict mode enabled with path aliases (`@/*` maps to `./src/*`)
- **Build output**: Custom build directory (`build/`) instead of default `.next/`
- **Font**: Uses Geist variable font loaded locally
- **Styling**: Tailwind CSS v4 with PostCSS configuration
- **Port**: Development server runs on port 4101 (not default 3000)
- **Bundler**: Uses Turbopack for fast development builds

### Build System

The project uses a Makefile for build orchestration with proper dependency tracking. All commands disable Next.js telemetry via `NEXT_TELEMETRY_DISABLED=1`.

**Important**: The build output directory is customized to `build/` (not `.next/`), configured in next.config.ts with `distDir: 'build'`. Production builds use standalone output mode.

### Code Standards

- ESLint configured with Next.js TypeScript presets
- Prettier for code formatting
- Strict TypeScript configuration with ES2017 target
