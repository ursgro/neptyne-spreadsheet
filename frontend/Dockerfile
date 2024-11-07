FROM node:16 AS build

COPY package.json yarn.lock ./

RUN yarn --network-timeout 500000

COPY public public
COPY src src
COPY tsconfig.json .
COPY craco.config.js .

RUN yarn build-high-mem

FROM nginx:1.21

COPY nginx-frontend.conf /etc/nginx/nginx.conf
COPY --from=build /build /usr/share/nginx/html
