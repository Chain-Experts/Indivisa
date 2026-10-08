# Canton with Indivisa's five-participant topology and our packages.
#
# The Canton image is Digital Asset's own public one (the same one Splice's
# LocalNet bundle uses, no credentials needed). We add the configuration,
# the bootstrap script and the DARs, so that starting the container gives a
# running network with every package vetted.
FROM ghcr.io/digital-asset/decentralized-canton-sync/docker/canton:0.6.12

USER root
WORKDIR /indivisa

# The Token Standard V2 packages, the reference cash, and our model. The
# build context is the repository root, so these are the same files the
# proofs run against.
COPY daml/dars/splice-api-token-metadata-v1-1.0.0.dar \
     daml/dars/splice-api-token-holding-v2-1.0.0.dar \
     daml/dars/splice-api-token-allocation-v2-1.0.0.dar \
     daml/dars/splice-api-token-allocation-instruction-v2-1.0.0.dar \
     daml/dars/splice-api-token-transfer-instruction-v2-1.0.0.dar \
     daml/dars/splice-api-token-transfer-events-v2-1.0.0.dar \
     daml/dars/splice-token-standard-utils-2.0.0.dar \
     daml/dars/splice-test-token-v2-1.0.1.dar \
     daml/dars/governance-action-v1-0.1.0.dar \
     daml/dars/governance-core-v1-0.1.0.dar \
     dars/
COPY daml/indivisa/indivisa-0.6.0.dar dars/
# Our governance layer and the generic module under it. Vetted here so the
# judge stack carries the whole product, not just the ungoverned path.
COPY daml/indivisa-governance/indivisa-governance-v0-0.1.0.dar dars/
COPY daml/governance-settlement/governance-settlement-v0-0.1.0.dar dars/

COPY quickstart/canton.conf quickstart/bootstrap.canton ./

# 5011..5051 ledger API, 5013..5053 JSON ledger API, 5001 sequencer.
EXPOSE 5011 5013 5021 5023 5031 5033 5041 5043 5051 5053

ENTRYPOINT ["/app/bin/canton"]
CMD ["daemon", "-c", "/indivisa/canton.conf", "--bootstrap", "/indivisa/bootstrap.canton"]
