# Monitoring

Grafana, Prometheus and node_exporter for this application, in two forms: a docker compose stack
for local and single-host use, and Kubernetes manifests for a cluster. Both scrape the same
`/metrics` endpoint and render the same dashboard file.

## What is measured

The application exposes Prometheus metrics at `GET /metrics`, wired up by `createAuthApp()`, which mounts it for you.

| Metric                                                                      | What it answers                                                     |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `http_requests_total{method,route,status_code}`                             | Request rate, error rate, 401/403 rate — per route                  |
| `http_request_duration_seconds{method,route,status_code}`                   | p50/p95/p99 latency, per route                                      |
| `nodejs_eventloop_lag_*`, `nodejs_heap_size_*`, `process_cpu_seconds_total` | Runtime health — argon2 is CPU-bound, so lag moves first under load |
| `node_*` (node_exporter)                                                    | Host CPU, memory, disk, network                                     |

`route` is the **matched route pattern** (`/api/v1/admin/users/:id`), never the raw path. That is
a memory-safety property, not a formatting preference: one time series is created per distinct
label value, so labelling by path would let an unauthenticated caller mint unbounded series by
requesting random URLs. Requests that match no route collapse to a single `<unmatched>` label.

Requests rejected by the auth and ability guards are counted too — the collector is middleware,
mounted ahead of the guard chain, precisely so 401s and 403s are not invisible.

## Securing /metrics

`/metrics` exposes the route table, process memory and runtime versions. It is **not** one of the
three route tiers — it is operator plumbing, gated by an operator secret rather than a permission
slug.

Set `METRICS_TOKEN` in the app's environment and every scrape must present
`Authorization: Bearer <token>`. Leave it unset and the endpoint is served openly, with a warning
logged at boot. Unset is reasonable when the port is only reachable from a private network (a
compose network, a pod network); it is not reasonable once the port is public.

Prometheus does not expand environment variables in its config file, so the token has to reach it
another way — see the commented `authorization:` block in `prometheus/prometheus.yml` (compose)
and in the ConfigMap in `k8s/20-prometheus.yaml` (Kubernetes).

## Docker compose

```bash
cp monitoring/.env.example monitoring/.env     # set GRAFANA_ADMIN_PASSWORD
docker compose -f monitoring/docker-compose.yml up -d
```

|               |                                                                          |
| ------------- | ------------------------------------------------------------------------ |
| Grafana       | <http://localhost:3034> — dashboard provisioned, nothing to import       |
| Prometheus    | <http://localhost:9094> — _Status > Target health_ when a panel is empty |
| node_exporter | <http://localhost:9104/metrics>                                          |

Prometheus reaches the application at `host.docker.internal:3004`, because the app runs on
the host (`npm run start`) rather than in this compose project. Two things follow:

- **Change the port** in `prometheus/prometheus.yml` if your app listens elsewhere. If you run the
  app as a container instead, replace the target with its service name and put both projects on a
  shared docker network.
- On **Docker Desktop (macOS/Windows)** node_exporter measures the Linux VM that runs your
  containers, not the machine in front of you. The numbers are real; the host is not the one you
  are typing on. On Linux they are your actual host.

Both variants of this combo publish the same default ports. To run a second stack alongside this
one, set `MONITORING_PROJECT_NAME`, `GRAFANA_PORT`, `PROMETHEUS_PORT` and `NODE_EXPORTER_PORT` in
`monitoring/.env`.

## Kubernetes

```bash
kubectl create namespace monitoring
kubectl -n monitoring create secret generic grafana-admin \
  --from-literal=password="$(openssl rand -base64 24)"

kubectl apply -k monitoring/
```

`kubectl apply -k` (kustomize, built into kubectl) is what generates the dashboard ConfigMap from
`grafana/dashboards/simple-auth-kit.json`, so the cluster renders the same dashboard as compose
rather than a second copy. Without kustomize:

```bash
kubectl apply -f monitoring/k8s/
kubectl -n monitoring create configmap grafana-dashboards \
  --from-file=simple-auth-kit.json=monitoring/grafana/dashboards/simple-auth-kit.json
```

Reach the UIs:

```bash
kubectl -n monitoring port-forward svc/grafana 3000:3000
kubectl -n monitoring port-forward svc/prometheus 9090:9090
```

Neither Service is exposed beyond the cluster. Put them behind your own Ingress with your own
authentication if you need that — and if you do, set `METRICS_TOKEN` on the app first.

**Point Prometheus at your app** by annotating its pod template. There is no target list to edit;
discovery is annotation-driven:

```yaml
spec:
  template:
    metadata:
      annotations:
        prometheus.io/scrape: 'true'
        prometheus.io/port: '3004'
        prometheus.io/path: '/metrics'
```

### What these manifests are and are not

They are a working, self-contained stack: RBAC scoped to read-only access on pods and nothing
else, non-root containers, dropped capabilities, resource requests and limits, health probes.

They are **not** a production observability platform. Specifically:

- **Storage is `emptyDir`** — metrics are lost when a pod restarts. A PersistentVolumeClaim needs
  a default StorageClass, and on a cluster without one the pod would sit `Pending` with no obvious
  cause; failing visibly beats failing mysteriously. Swap in a PVC to keep history.
- **Single-replica Prometheus**, no alerting rules, no Alertmanager, no remote write.
- **node_exporter needs host access** (`hostNetwork`, `hostPID`, `/proc`, `/sys`, `/`) — that is
  inherent to measuring a node, and it is the one workload here with elevated access.

If you outgrow this, the usual next step is kube-prometheus-stack; the application side needs no
change, since a `ServiceMonitor` scrapes the same `/metrics`.

## Image versions

Pinned (`prom/prometheus:v3.1.0`, `grafana/grafana:11.5.0`, `prom/node-exporter:v1.8.2`) rather than
`:latest`, so a rebuild months from now brings up what you tested. Bump them deliberately.
