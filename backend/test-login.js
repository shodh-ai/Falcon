fetch('http://localhost:4000/api/auth/local-login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-tenant-subdomain': 'sgvu'
  },
  body: JSON.stringify({ email: 'student1@mygyanvihar.com', password: 'password123' })
})
.then(r => r.json())
.then(console.log)
.catch(console.error);
