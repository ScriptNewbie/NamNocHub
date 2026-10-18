FROM node:22-alpine
RUN apk add --no-cache --upgrade openssl zlib
RUN npm install -g serve
RUN addgroup namnoc && adduser -S -G namnoc namnoc
USER namnoc
WORKDIR /namnoc
COPY --chown=namnoc:namnoc . .
WORKDIR ./server
RUN npm install
EXPOSE 3000
EXPOSE 8080
WORKDIR /namnoc
CMD ["node", "start.js"]