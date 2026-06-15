const { Client } = require('pg');
const client = new Client({ user: 'postgres', password: 'postgres', host: 'localhost', port: 5432, database: 'university_governance' });
client.connect().then(() => {
  client.query("SELECT official_email FROM users LIMIT 10")
    .then(res => { console.log(res.rows); client.end(); })
    .catch(err => { console.error(err); client.end(); });
});
