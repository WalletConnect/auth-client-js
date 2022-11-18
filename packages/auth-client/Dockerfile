FROM node:16.16-alpine as base

WORKDIR /

RUN apk --update --no-cache 

FROM base as build

WORKDIR /

COPY ../ ./
RUN npm ci
RUN npm run build

WORKDIR /packages/auth-client/

CMD ["node", "-v"]