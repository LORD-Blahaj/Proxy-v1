const express = require('express');
const path = require('path');

// Helper: Provide a fetch function. Use Node.js global fetch (if available) 
// or import from "node-fetch" dynamically.
async function getFetch() {
  if (typeof fetch === 'function') {
    return fetch;
  } else {
    const module = await import('node-fetch');
    return module.default;
  }
}

const app = express();

// Fallback route for requests to "/url"
// If a request lands here, check for a query parameter named "q" or "url" that holds the destination.
// If valid, redirect to the proxy endpoint.
app.get('/url', (req, res) => {
  console.log('Fallback /url route received query:', req.query);
  const destination = req.query.q || req.query.url;
  if (destination && /^https?:\/\/.+$/.test(destination)) {
    return res.redirect('/proxy?url=' + encodeURIComponent(destination));
  } else {
    return res.status(400).send('Missing or invalid destination URL');
  }
});

// Serve static files (like index.html, manifest.json, service-worker.js) from the "public" directory.
app.use(express.static(path.join(__dirname, 'public')));

// Main route to serve your homepage.
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Proxy endpoint: fetch the external URL, rewrite relative links, and send the result.
app.get('/proxy', async (req, res) => {
  const url = req.query.url;
  
  // Validate that the url parameter exists and starts with http:// or https://.
  if (!url || !/^https?:\/\/.+/.test(url)) {
    return res.status(400).send('Invalid URL');
  }

  console.log('Proxying request to:', url);

  try {
    const fetchFunc = await getFetch();
    const response = await fetchFunc(url, {
      headers: {
        // Updated user-agent string from a recent browser version.
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
                      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
                      'Chrome/116.0.5845.96 Safari/537.36'
      }
    });

    if (!response.ok) {
      console.error(`Error fetching URL: ${response.status} ${response.statusText}`);
      return res.status(response.status).send(response.statusText);
    }

    let body = await response.text();

    // If the content is from Google, rewrite relative links so they route through the proxy.
    if (url.includes('www.google.com')) {
      const googleBase = 'https://www.google.com';

      // Rewrite links like href="/search?..." (double-quoted)
      body = body.replace(/href="\/(search\?[^"]*)"/g, (match, group1) => {
        return 'href="/proxy?url=' + encodeURIComponent(googleBase + '/' + group1) + '"';
      });
      // Rewrite links like href='/search?...' (single-quoted)
      body = body.replace(/href='\/(search\?[^']*)'/g, (match, group1) => {
        return "href='/proxy?url=" + encodeURIComponent(googleBase + '/' + group1) + "'";
      });

      // Rewrite links like href="/url?..." (double-quoted)
      body = body.replace(/href="\/url\?([^"]*)"/g, (match, group1) => {
        try {
          const params = new URLSearchParams(group1);
          const dest = params.get('q') || params.get('url');
          if (dest) {
            return 'href="/proxy?url=' + encodeURIComponent(dest) + '"';
          }
          return match;
        } catch (e) {
          return match;
        }
      });
      // Rewrite links like href='/url?...' (single-quoted)
      body = body.replace(/href='\/url\?([^']*)'/g, (match, group1) => {
        try {
          const params = new URLSearchParams(group1);
          const dest = params.get('q') || params.get('url');
          if (dest) {
            return "href='/proxy?url=" + encodeURIComponent(dest) + "'";
          }
          return match;
        } catch (e) {
          return match;
        }
      });

      // Optionally rewrite form actions if the search form action is relative.
      body = body.replace(/action="\/search"/g, 'action="/proxy?url=' + encodeURIComponent(googleBase + '/search') + '"');
      body = body.replace(/action='\/search'/g, "action='/proxy?url=" + encodeURIComponent(googleBase + '/search') + "'");
    }

    res.send(body);
  } catch (err) {
    console.error('Error during proxy request:', err);
    res.status(500).send('Error fetching the URL');
  }
});

// Export the app for Vercel deployment
module.exports = app;
