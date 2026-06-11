FROM node:20-alpine

# Zona horaria
ENV TZ=America/Santiago
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/America/Santiago /etc/localtime && \
    echo "America/Santiago" > /etc/timezone

WORKDIR /app

# Instalar dependencias primero (aprovecha cache de Docker)
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Copiar código fuente
COPY src/ ./src/

EXPOSE 3000

# Usar node directamente (sin npm) para que las señales SIGTERM lleguen al proceso
CMD ["node", "src/index.js"]
