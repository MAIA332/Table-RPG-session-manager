FROM node:20-alpine AS base

# Etapa 1: Instalação de dependências
FROM base AS deps
# libc6-compat é necessário para algumas dependências nativas no Alpine (ex: SWC, Turbo)
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copia apenas os ficheiros de lock do npm
COPY package.json package-lock.json* ./
RUN npm ci

# Etapa 2: Build da aplicação
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Desativa a telemetria do Next.js durante o build
ENV NEXT_TELEMETRY_DISABLED=1

# Executa o build exclusivamente com npm
RUN npm run build

# Etapa 3: Runner de Produção
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Criação de um utilizador não-root por segurança
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Cópia das pastas e ficheiros necessários para o npm run start
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Executa o servidor de produção
CMD ["npm", "run", "start"]