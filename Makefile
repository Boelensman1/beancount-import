INSTALL_DEPS=node_modules
SRC_FILES=$(shell find src/)

node_modules: package.json pnpm-lock.yaml
	pnpm install --frozen-lockfile
	@if [ -e node_modules ]; then touch node_modules; fi

clean:
	rm -rf node_modules

build: $(INSTALL_DEPS) $(SRC_FILES) tsconfig.json next.config.ts tailwind.config.ts postcss.config.mjs
	NEXT_TELEMETRY_DISABLED=1 pnpm exec next build

serve: build
	PORT=5002 NEXT_TELEMETRY_DISABLED=1 pnpm exec next start

dev: $(INSTALL_DEPS)
	NEXT_TELEMETRY_DISABLED=1 PORT=5002 pnpm exec next dev --turbopack

install: $(INSTALL_DEPS)

test: $(INSTALL_DEPS)
	pnpm exec vitest run

test-watch: $(INSTALL_DEPS)
	pnpm exec vitest

lint: $(INSTALL_DEPS)
	pnpm exec prettier --check .
	pnpm exec eslint
	pnpm exec tsc --noEmit

.PHONY: dev install clean lint test
