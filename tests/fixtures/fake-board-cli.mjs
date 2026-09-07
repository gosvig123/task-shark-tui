// Empty Board fixture for live-interface smoke tests. No real shared storage is read or written.
const command = process.argv[2];
if (command === 'board-read') console.log(JSON.stringify({ schemaVersion: 1, entries: [], nextAfterSequence: 0, hasMore: false }));
else if (command === 'review-read') console.log(JSON.stringify({ schemaVersion: 1, lastReviewedSequence: 0 }));
else if (command === 'brief-read') console.log(JSON.stringify({ schemaVersion: 1, exists: false, format: 'markdown', content: '' }));
else { process.stderr.write('Unsupported fixture command'); process.exitCode = 1; }
