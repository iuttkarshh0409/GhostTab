const https = require('https');
const fs = require('fs');

// SECURITY: TLS certificate verification is ALWAYS enforced. We never set
// rejectUnauthorized:false (no bypass). For an explicitly trusted private CA,
// point ANTIDEPLOY_CA_FILE at a PEM bundle to load and pin it; otherwise the
// system root CAs are used (the secure default).
const caFile = process.env.ANTIDEPLOY_CA_FILE;
const options = {
  hostname: 'antideploy.com',
  path: '/agent.md',
  rejectUnauthorized: true, // enforced default; never disable
};
if (caFile) {
  options.ca = [fs.readFileSync(caFile)];
}

https.get(options, (res) => {
  let data = '';
  res.on('data', (c) => (data += c));
  res.on('end', () => {
    console.log('STATUS', res.statusCode);
    console.log('CONTENT-TYPE', res.headers['content-type']);
    console.log('---');
    console.log(data);
  });
}).on('error', (e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
