# The paying agent's client: it seats the demo and prepares the run.
#
# This is the same Daml Script the proofs and the recording use
# (Indivisa.Test.Demo), run by the Daml Script runner. The runner is a
# 215 MB jar that we do not redistribute: by default it is fetched at build
# time from Digital Asset's own public registry, the one `dpm` itself pulls
# from, as a plain OCI blob over HTTPS. No credentials, no Docker Hub
# account.
#
#   --build-arg SCRIPT_SOURCE=local
#
# takes it from judge/.cache/daml-script.jar instead, for building on a
# machine whose network intercepts TLS (a container there cannot verify
# the registry's certificate; the host can).

ARG SCRIPT_SOURCE=download

FROM eclipse-temurin:21-jre AS script-download
ARG DAML_SCRIPT_VERSION=3.5.2
ARG REGISTRY=https://europe-docker.pkg.dev/v2/da-images/public/components/daml-script
RUN apt-get update && apt-get install -y --no-install-recommends curl jq ca-certificates  && rm -rf /var/lib/apt/lists/*
# The artefact is an OCI index; each file inside it is its own layer, named
# by an annotation, so we take just the runner and skip the rest.
RUN set -eu;     idx="$(curl -fsSL -H 'Accept: application/vnd.oci.image.index.v1+json' "$REGISTRY/manifests/$DAML_SCRIPT_VERSION")";     man_digest="$(printf '%s' "$idx" | jq -r '.manifests[0].digest')";     man="$(curl -fsSL -H 'Accept: application/vnd.oci.image.manifest.v1+json' "$REGISTRY/manifests/$man_digest")";     jar_digest="$(printf '%s' "$man" | jq -r '.layers[] | select(.annotations["org.opencontainers.image.title"] == "daml-script-binary_distribute.jar") | .digest')";     test -n "$jar_digest";     curl -fsSL -o /opt/daml-script.jar "$REGISTRY/blobs/$jar_digest";     test -s /opt/daml-script.jar

FROM eclipse-temurin:21-jre AS script-local
COPY judge/.cache/daml-script.jar /opt/daml-script.jar

FROM script-${SCRIPT_SOURCE} AS final
RUN apt-get update && apt-get install -y --no-install-recommends curl jq ca-certificates  && rm -rf /var/lib/apt/lists/*

WORKDIR /indivisa
COPY daml/indivisa-test/.daml/dist/indivisa-test-0.1.0.dar ./
COPY judge/participants.json judge/seed.sh ./
RUN chmod +x seed.sh

# A stack for the script runner's own recursion, a small heap: this is a
# client, and a judge's laptop has other things to do.
ENV JAVA_TOOL_OPTIONS="-Xss64m -Xmx1g"
ENTRYPOINT ["/indivisa/seed.sh"]
CMD ["seat"]
