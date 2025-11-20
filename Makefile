INSTALL_DEPS=node_modules
SRC_FILES=$(shell find src/)

node_modules: package.json
	npm ci
	@if [ -e node_modules ]; then touch node_modules; fi

clean:
	rm -rf node_modules

build: $(INSTALL_DEPS) $(SRC_FILES) tsconfig.json next.config.ts tailwind.config.ts postcss.config.mjs
	NEXT_TELEMETRY_DISABLED=1 npx next build
	cp -r public build/standalone/ && cp -r build/static  build/standalone/build/

serve: build
	npx next start

dev: $(INSTALL_DEPS)
	NEXT_TELEMETRY_DISABLED=1 PORT=4101 npx --no-install next dev --turbopack

install: $(INSTALL_DEPS)

test: $(INSTALL_DEPS)
	npx vitest

lint: $(INSTALL_DEPS)
	npx --no-install prettier --check .
	npx --no-install eslint
	npx --no-install tsc --noEmit

.PHONY: dev install clean lint test
