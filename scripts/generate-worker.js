const fs = require('fs');
const path = require('path');

// Generate _worker.js for Cloudflare
const workerContent = `
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // Serve static assets
    if (url.pathname.startsWith('/_next/')) {
      return env.ASSETS.fetch(request);
    }
    
    // API routes
    if (url.pathname.startsWith('/api/')) {
      // Import Next.js server
      const { default: handler } = await import('./server.js');
      return handler(request, env);
    }
    
    // Pages
    return env.ASSETS.fetch(request);
  }
};
`;

fs.writeFileSync('.vercel/output/static/_worker.js', workerContent);
console.log('✅ Worker generated');