FROM node:20.11.1

COPY ExceLint-core /ExceLint-core

WORKDIR /ExceLint-core

RUN npm install && \ 
    npm run build

CMD ["node", "build/src/cli/api_server.js"]
