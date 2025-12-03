'use client';

import { useEffect, useRef } from 'react';

export default function AdBanner({ type = 'banner' }) {
  const adRef = useRef(null);

  useEffect(() => {
    // Adsterra script injection
    if (adRef.current && !adRef.current.querySelector('script')) {
      const script = document.createElement('script');
      script.async = true;
      
      if (type === 'banner') {
        // 320x50 Banner
        script.src = '//www.highperformanceformat.com/6e5b026d2e2c94efa69ea086137efae4/invoke.js';
      } else if (type === 'medium') {
        // 300x250 Medium Rectangle
        script.src = '//www.highperformanceformat.com/3a0cdf9e77b8522feb634529e3d2d4f0/invoke.js';
      }
      
      adRef.current.appendChild(script);
    }
  }, [type]);

  const adConfig = {
    banner: {
      key: '6e5b026d2e2c94efa69ea086137efae4',
      format: 'iframe',
      height: 50,
      width: 320,
    },
    medium: {
      key: '3a0cdf9e77b8522feb634529e3d2d4f0',
      format: 'iframe',
      height: 250,
      width: 300,
    },
  };

  const config = adConfig[type] || adConfig.banner;

  return (
    <div className="ad-banner">
      <div ref={adRef}>
        {/* Adsterra configuration */}
        <script
          type="text/javascript"
          dangerouslySetInnerHTML={{
            __html: `
              atOptions = ${JSON.stringify({ ...config, params: {} })};
            `,
          }}
        />
      </div>
    </div>
  );
}