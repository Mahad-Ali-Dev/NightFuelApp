import autocannon from 'autocannon';
import { createLogger } from '../packages/config/src/logger';

const logger = createLogger('load-test');

async function runLoadTest() {
    console.log("=== API LOAD TEST (AUTOCANNON) ===\n");

    const url = process.env.TEST_URL || 'http://localhost:3001/health';
    console.log(`Target: ${url}`);
    console.log("Duration: 10s, Connections: 100\n");

    const instance = autocannon({
        url,
        connections: 100,
        duration: 10
    }, (err, result) => {
        if (err) {
            console.error("Load test failed:", err);
            process.exit(1);
        }
        console.log("--- RESULTS ---");
        console.log(`Requests/sec: ${result.requests.average}`);
        console.log(`Latency (ms): ${result.latency.average}`);
        console.log(`Throughput (Mb/s): ${(result.throughput.average / 1024 / 1024).toFixed(2)}`);
        console.log(`Errors: ${result.errors}`);
        console.log("---------------\n");
    });

    autocannon.track(instance, { renderProgressBar: true });
}

runLoadTest().catch(console.error);
