/**
 * Wraps a scheduled job so its reply says what the run cost: x-cpu-ms (CPU
 * time) and x-wall-ms (elapsed time).
 *
 * The hosting plan allows four hours of CPU a month across the whole site, and
 * the engine's jobs run every few minutes, so their cost is the number that
 * decides how often they can run. pg_net keeps every reply it receives in
 * net._http_response, headers included, so the cost of each run is in the
 * database with nothing else to collect it.
 *
 * Process-wide CPU time, so a request served at the same moment by the same
 * instance is counted in too; it is an upper bound, which is the safe side.
 */
export function metered(handler: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    const cpu = process.cpuUsage();
    const started = performance.now();

    const response = await handler(request);

    const used = process.cpuUsage(cpu);
    const headers = new Headers(response.headers);
    headers.set("x-cpu-ms", String(Math.round((used.user + used.system) / 1000)));
    headers.set("x-wall-ms", String(Math.round(performance.now() - started)));
    return new Response(response.body, { status: response.status, headers });
  };
}
