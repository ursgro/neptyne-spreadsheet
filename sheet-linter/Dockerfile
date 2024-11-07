FROM node:20.11.1 as build

COPY . /app

WORKDIR /app

RUN yarn install && \
    yarn build

FROM nginx:alpine

COPY --from=build /app/build/ /usr/share/nginx/html
