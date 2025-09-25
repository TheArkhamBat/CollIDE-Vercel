// Load the secret API key from our .env file
require('dotenv').config();

const express = require('express');
const Ably = require('ably');
const app = express();

// This line is essential for Vercel to work with Express
const http = require('http').createServer(app);

// Serve all the files in the 'public' folder
app.use(express.static('public'));

// This is a new endpoint for clients to get the public part of the API key
// It's a safer way than putting the whole key in your frontend code
app.get('/api/get-key', (req, res) => {
    // We only send the non-secret part of the key to the client
    const publicKey = process.env.ABLY_API_KEY.split(':')[0];
    res.json({ key: publicKey });
});

// Export the server for Vercel
module.exports = http;

// run the server locally
if (require.main === module) {
  const PORT = 3000;
  http.listen(PORT, () => {
    console.log(`Server is running locally at http://localhost:${PORT}`);
  });
}