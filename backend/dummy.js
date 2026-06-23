const http = require('http');

const options = {
  hostname: 'localhost',
  port: 4000,
  path: '/api/venue-bookings',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer test-token' // Wait, I don't have a valid JWT token. 
    // Is there a way to hit the API without Auth? No, it's protected by JwtAuthGuard.
  }
};
