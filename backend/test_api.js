const http = require('http');

const payload = JSON.stringify({
  venue_id: '27706d63-dc5b-4136-ab54-1d1b9a3ee752', // Block B Seminar Hall
  start_time: '2026-06-23T11:00:00Z', // 4:30 PM IST
  end_time: '2026-06-23T12:00:00Z',   // 5:30 PM IST
  purpose: 'yooahhhh'
});

// Since we don't have the user token easily, we can write a script to generate a fake token or we can query the DB to get a token?
// Wait, generating a JWT token requires the JWT_SECRET.
// Instead of HTTP request, let's just use the NestJS app logic by querying DB or looking at the logs.
// Let's just grep the NestJS logs! Wait, the user ran npm run start. Where does the output go?
