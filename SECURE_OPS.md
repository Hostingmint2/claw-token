Operational hardening (short checklist)

1) Ensure services are stateless where possible (move state to Postgres/pg-boss and KMS).
2) Run processes under a supervisor (systemd / Docker restart policies / Kubernetes deployments).
3) Configure TLS termination and enforce TLS in production (TLS_CERT_PATH/TLS_KEY_PATH).
4) Enable `PRIVACY_MODE=true` in production and route logs to a secure store (minimize PII).
5) Run watchdog and external uptime monitors (UptimeRobot / Pingdom / PagerDuty integration).
6) Schedule automated DB backups and KMS key rotation.
7) Set up Prometheus + Alertmanager for metrics + alerts on restarts, error rates, and job queue length.

Quick commands
- Start watchdog (host): `npm run start-watchdog` (or use systemd unit)
- Start services (docker): `docker compose -f docker-compose.prod.yml up -d`
- Install systemd unit (example): `sudo cp ops/systemd/openclaw-agent.service /etc/systemd/system/ && sudo systemctl enable --now openclaw-agent`
