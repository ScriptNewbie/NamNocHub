# Pin the October 2026 Node.js security release (CVE-2026-111497 and the
# other issues in that release). node:22-alpine currently resolves to this
# same digest, but a floating tag can reuse a cached 22.23.3 layer.
FROM node:22.23.4-alpine
RUN apk add --no-cache --upgrade openssl zlib
# node:22.23.4-alpine still ships npm 10.9.9, the final npm 10 release. That
# copy vendors vulnerable brace-expansion, ip-address, pacote, picomatch,
# sigstore, http-cache-semantics, and postcss-selector-parser. npm 11.21.1
# vendors the patched releases of those packages except:
#   ip-address 10.7.2 (CVE-2026-111997 / GHSA-rxp7-6hxx-x8q5, quadratic DoS
#     in Address6 zone parsing, fixed in 10.7.4)
#   undici 6.29.0 (GHSA-xjj6-f33q-929c / CVE-2026-109869 and
#     GHSA-4qv8-2p9j-2685 / CVE-2026-109924, DoS, fixed in 6.29.1)
# Rechecked 2026-10-24: npm 11.21.1 is still the latest npm 11, and npm 12.2.1
# is a major upgrade, so replace only those two packages. Both are npm CLI
# tooling, not on the request path. Node's own undici is already 6.29.1.
# serve 14.2.6 depends on compression 1.8.1 (CVE-2026-87776); the override
# installs 1.8.2 because no serve release depends on the patched compression yet.
RUN npm install -g npm@11.21.1 \
 && ipadir="$(npm root -g)/npm/node_modules" \
 && tmp="$(mktemp -d)" \
 && npm pack ip-address@10.7.4 --pack-destination "$tmp" \
 && npm pack undici@6.29.1 --pack-destination "$tmp" \
 && rm -rf "$ipadir/ip-address" \
 && tar -xzf "$tmp"/ip-address-10.7.4.tgz -C "$ipadir" \
 && mv "$ipadir/package" "$ipadir/ip-address" \
 && rm -rf "$ipadir/undici" \
 && tar -xzf "$tmp"/undici-6.29.1.tgz -C "$ipadir" \
 && mv "$ipadir/package" "$ipadir/undici" \
 && rm -rf "$tmp" \
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
