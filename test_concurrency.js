import http from 'http';

const BASE_URL = process.env.TEST_URL || 'http://localhost:5005/api/register';
const HEALTH_URL = process.env.HEALTH_URL || 'http://localhost:5005/api/health';

function makeRegistrationPayload(index, prefix = 'team') {
  const ts = Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
  return JSON.stringify({
    teamName: `Team_${prefix}_${index}_${ts}`,
    leaderName: `Leader ${index}`,
    leaderEmail: `leader_${prefix}_${index}_${ts}@example.com`,
    leaderPhone: `98765${String(index).padStart(5, '0')}`,
    driveLink: 'https://drive.google.com/test-pitch',
    members: [
      { id: 1, name: `Member A ${index}`, email: `m1_${prefix}_${index}_${ts}@example.com` },
      { id: 2, name: `Member B ${index}`, email: `m2_${prefix}_${index}_${ts}@example.com` },
    ],
  });
}

function sendRequest(payload) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const req = http.request(
      BASE_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          const latency = Date.now() - startTime;
          try {
            const parsed = JSON.parse(body);
            resolve({ statusCode: res.statusCode, success: parsed.success, latency, body: parsed });
          } catch (e) {
            resolve({ statusCode: res.statusCode, success: false, latency, rawBody: body });
          }
        });
      }
    );

    req.on('error', (err) => {
      resolve({ statusCode: 0, success: false, latency: Date.now() - startTime, error: err.message });
    });

    req.write(payload);
    req.end();
  });
}

async function runBatchTest(concurrencyCount, batchLabel) {
  console.log(`\n==================================================`);
  console.log(`🚀 Starting Concurrency Test: ${concurrencyCount} Users (${batchLabel})`);
  console.log(`==================================================`);

  const payloads = Array.from({ length: concurrencyCount }, (_, i) => makeRegistrationPayload(i + 1, batchLabel));

  const startTime = Date.now();
  const promises = payloads.map((payload) => sendRequest(payload));
  const results = await Promise.all(promises);
  const totalDurationMs = Date.now() - startTime;

  let success201 = 0;
  let clientErrors400_409 = 0;
  let serverErrors500 = 0;
  let networkErrors = 0;

  const latencies = [];

  for (const res of results) {
    latencies.push(res.latency);
    if (res.statusCode === 201) success201++;
    else if (res.statusCode >= 400 && res.statusCode < 500) clientErrors400_409++;
    else if (res.statusCode >= 500) serverErrors500++;
    else networkErrors++;
  }

  latencies.sort((a, b) => a - b);
  const minLatency = latencies[0];
  const maxLatency = latencies[latencies.length - 1];
  const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  const rps = ((concurrencyCount / totalDurationMs) * 1000).toFixed(2);

  console.log(`📊 Benchmark Summary for ${concurrencyCount} Concurrent Requests:`);
  console.log(`⏱️  Total Batch Duration: ${totalDurationMs} ms`);
  console.log(`⚡ Throughput (RPS): ${rps} req/sec`);
  console.log(`✅ 201 Created Success: ${success201} / ${concurrencyCount} (${((success201 / concurrencyCount) * 100).toFixed(1)}%)`);
  console.log(`⚠️  4xx Client Errors / Duplicate Rejections: ${clientErrors400_409}`);
  console.log(`❌ 500 Server Errors: ${serverErrors500}`);
  console.log(`🔌 Network Connection Failures: ${networkErrors}`);
  console.log(`📈 Latency Distribution:`);
  console.log(`   - Min: ${minLatency} ms | Avg: ${avgLatency} ms | Max: ${maxLatency} ms`);
  console.log(`   - p50: ${p50} ms | p95: ${p95} ms | p99: ${p99} ms`);

  return { concurrencyCount, totalDurationMs, rps, success201, serverErrors500, avgLatency, p95 };
}

async function runRaceConditionTest() {
  console.log(`\n==================================================`);
  console.log(`🏎️  Starting Race Condition Test (50 Duplicate Requests Simultaneously)`);
  console.log(`==================================================`);

  const duplicatePayload = JSON.stringify({
    teamName: 'RaceConditionTeam_Unique',
    leaderName: 'Race Leader',
    leaderEmail: 'raceleader_unique@example.com',
    leaderPhone: '9998887770',
    driveLink: 'https://drive.google.com/test',
    members: [{ id: 1, name: 'Race Member 1', email: 'racemember1@example.com' }],
  });

  const promises = Array.from({ length: 50 }, () => sendRequest(duplicatePayload));
  const results = await Promise.all(promises);

  const statusMap = {};
  for (const res of results) {
    statusMap[res.statusCode] = (statusMap[res.statusCode] || 0) + 1;
  }

  console.log(`🎯 Race Condition Results (50 identical requests sent concurrently):`);
  console.log(`   - HTTP 201 Created (First win): ${statusMap[201] || 0}`);
  console.log(`   - HTTP 409 Conflict (Duplicates rejected): ${statusMap[409] || 0}`);
  console.log(`   - HTTP 500 Server Errors: ${statusMap[500] || 0}`);

  if ((statusMap[201] || 0) === 1 && (statusMap[409] || 0) === 49) {
    console.log(`✅ PERFECT RACE CONDITION PROTECTION! Exactly 1 record saved, 49 duplicate requests cleanly rejected.`);
  } else {
    console.log(`⚠️  Race Condition Check result status distribution:`, statusMap);
  }
}

async function runMainSuite() {
  console.log(`🔍 Initializing IdeaJam 2026 Concurrency Load Test Suite...`);
  
  // Health check first
  const healthRes = await new Promise((resolve) => {
    http.get(HEALTH_URL, (res) => resolve(res.statusCode)).on('error', () => resolve(0));
  });

  if (healthRes !== 200) {
    console.error(`❌ Error: Backend server is not running on ${HEALTH_URL} (Status: ${healthRes}). Please start backend first!`);
    process.exit(1);
  }

  console.log(`✅ Backend Health Check OK (Status 200).`);

  await runRaceConditionTest();
  await runBatchTest(50, 'Batch_50');
  await runBatchTest(100, 'Batch_100');
  await runBatchTest(250, 'Batch_250');
  await runBatchTest(500, 'Batch_500');

  console.log(`\n🎉 ALL LOAD AND CONCURRENCY TESTS COMPLETED SUCCESSFULLY!`);
}

runMainSuite();
