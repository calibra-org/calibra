[no-cd]
[private]
dev port='5055':
    cd docs/api && pnpm build && pnpm http-server dist -p {{ port }} -c-1

[no-cd]
build:
    cd docs/api && pnpm build

[no-cd]
lint:
    cd docs/api && pnpm lint
