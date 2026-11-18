# Zevrigo Wallet (MOD-15). Crate inti dari ../zevrigo (AGENDA P3).
.PHONY: fmt fmt-check lint check-forbidden test deps check-all wallet-check

fmt:
	cargo fmt --all

fmt-check:
	cargo fmt --all -- --check

lint:
	cargo clippy --workspace --all-targets -- -D warnings

check-forbidden:
	bash scripts/check-forbidden.sh

test:
	cargo test --workspace

deps:
	cargo tree --workspace --depth 1 -e normal

check-all: fmt-check lint check-forbidden test

# Antarmuka (DEC-31): paket dari package-lock.json tanpa skrip pasang, lalu typecheck, test, dan vite build (dist/).
wallet-check:
	npm ci --ignore-scripts --no-audit --no-fund && npm run check
