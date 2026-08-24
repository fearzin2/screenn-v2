FROM node:20-alpine

WORKDIR /app

# Copiar TUDO do repositório para o Docker (incluindo pastas escondidas como 'shared')
COPY . .

# Instalar pacotes do servidor
RUN cd server && npm install

# Instalar pacotes do cliente
RUN cd client && npm install

# Fazer o build do frontend
RUN cd client && npm run build

WORKDIR /app/server

CMD ["node", "index.js"]
