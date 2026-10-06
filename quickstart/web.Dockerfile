# The console, served by nginx, which also proxies the five participants.
#
# By default the page is built here, from source, with Node. On a machine
# whose network intercepts TLS (npm inside a container cannot verify the
# registry's certificate, though the host can), build the page on the host
# with `npm run build` in ui/ and pass:
#
#   --build-arg UI_SOURCE=prebuilt
#
# Either way the page carries no network configuration: nginx decides
# which participant each /api/<name>/ path reaches, exactly as a real
# deployment would.
ARG UI_SOURCE=build

FROM node:22-alpine AS ui-build
WORKDIR /ui
COPY ui/package.json ui/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY ui/ ./
# No infra/<network>/ui.json here on purpose: a build carries no network.
RUN npm run build && cp -r dist /out

FROM alpine AS ui-prebuilt
COPY ui/dist /out

FROM ui-${UI_SOURCE} AS ui

FROM nginx:1.27-alpine
COPY --from=ui /out /usr/share/nginx/html
COPY quickstart/nginx.conf /etc/nginx/conf.d/default.conf
