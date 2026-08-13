# easy-auth

## Secrets vs. config in docker-compose.yml / .env files

Never hardcode a secret (signing keys, passwords, API keys, tokens) into `docker-compose.yml` or
any other checked-in file. This repo commits `docker-compose.yml` to git, so a hardcoded secret
there is permanent in history and shared verbatim across every developer/environment.

- **Secrets** (`AUTH_SECRET`, `AUTH_JWT_SECRET_*`, anything sensitive) must be sourced from a
  gitignored `.env` file via `${VAR_NAME:?set VAR_NAME in .env}` — never a literal value.
- **Non-secret topology** (service DNS names, ports, URLs fully determined by other values
  already in the same compose file — e.g. `AUTH_API_INTERNAL_URL: http://nestjs-prisma-app:3001`
  derived from that service's own name + its `PORT:` a few lines above) is fine to hardcode
  directly in `docker-compose.yml`. Routing every such value through an env var nobody will ever
  actually override adds indirection without benefit.

Rule of thumb: if it's a credential or should differ per developer/environment, it comes from
`.env`. If it's fully determined by the compose file's own service definitions, hardcode it.
