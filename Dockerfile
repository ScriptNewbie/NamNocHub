FROM node:22-alpine
RUN apk add --no-cache --upgrade openssl zlib
# node:22-alpine ships npm 10.9.9, the final npm 10 release. That copy still
# vendors vulnerable brace-expansion, ip-address, pacote, picomatch, sigstore,
# http-cache-semantics, and postcss-selector-parser. npm 11.21.1 vendors the
# patched releases. npm 12.2.0 reintroduces several of them, so stay on 11.21.1.
# serve 14.2.6 depends on compression 1.8.1 (CVE-2026-87776); the override
# installs 1.8.2 because no serve release depends on the patched compression yet.
RUN npm install -g npm@11.21.1 \
 && mkdir -p /opt/namnoc-tools \
 && printf '%s\n' '{"name":"namnoc-tools","private":true,"dependencies":{"serve":"14.2.6"},"overrides":{"compression":"1.8.2"}}' > /opt/namnoc-tools/package.json \
 && npm install --omit=dev --prefix /opt/namnoc-tools \
 && ln -sf /opt/namnoc-tools/node_modules/.bin/serve /usr/local/bin/serve \
 && chmod -R a+rX /opt/namnoc-tools \
 && rm -rf /root/.npm
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
