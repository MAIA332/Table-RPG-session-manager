FROM node:22-alpine AS base

RUN apk add --no-cache libc6-compat
WORKDIR /app

# Etapa 1: Instalação de dependências
FROM base AS deps

COPY package.json package-lock.json ./
RUN npm ci

# Etapa 2: Build da aplicação
FROM base AS builder

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# Etapa 3: Produção
FROM base AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/next.config.mjs ./next.config.mjs
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next

# Necessário para o prestart inicializar/verificar o MongoDB.
# Copia também os módulos auxiliares importados pelo script.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

USER nextjs

EXPOSE 3000

CMD ["npm", "run", "start"]