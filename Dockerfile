FROM node:22-slim

ENV NODE_ENV=production

WORKDIR /app

COPY package.json ./

RUN npm install --omit=dev

COPY index.js ./

USER node

EXPOSE 8080

CMD ["npm", "start"]