const http = require('http');

http.get('http://localhost:4000/auth/dev-login/faculty1@mygyanvihar.com', (r) => {
  const loc = r.headers.location || '';
  const m = loc.match(/token=([^&]+)/);
  if (!m) return console.log('Login failed');
  const token = m[1];

  const req2 = http.request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/api/academics/faculty/workspaces/projects',
      headers: { Authorization: 'Bearer ' + token },
    },
    (r2) => {
      let body = '';
      r2.on('data', (c) => (body += c));
      r2.on('end', () => {
        console.log('Status:', r2.statusCode);
        try {
          const data = JSON.parse(body);
          console.log('Guides count:', data.length);
          if (data.length > 0) {
            console.log('First Guide:', JSON.stringify(data[0], null, 2));
          }
        } catch (e) {
          console.log('Raw body:', body.substring(0, 500));
        }
      });
    }
  );
  req2.end();
});
