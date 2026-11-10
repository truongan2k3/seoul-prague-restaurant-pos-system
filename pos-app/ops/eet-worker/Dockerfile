FROM node:22-alpine
WORKDIR /worker
COPY scripts/eet-worker.mjs ./eet-worker.mjs
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 CMD node -e "const f=require('fs');process.exit(Date.now()-f.statSync('/tmp/eet-worker-heartbeat').mtimeMs<120000?0:1)"
CMD ["node", "eet-worker.mjs"]
