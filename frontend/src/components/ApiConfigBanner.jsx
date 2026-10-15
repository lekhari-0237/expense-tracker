import React, { useEffect, useState } from 'react';
import { probeApiIdentity } from '../services/api';

// Surfaces a backend misconfiguration instead of letting it silently corrupt data:
// the legacy Spring Boot jar answers /api/auth/login on port 5000 exactly like the
// Node API does, but has none of the chatbot / group / export routes.
const ApiConfigBanner = () => {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    probeApiIdentity().then((res) => {
      if (!cancelled) setStatus(res);
    });
    return () => { cancelled = true; };
  }, []);

  if (!status || status.isNodeApi) return null;

  const title = status.reachable
    ? `The API at ${status.base} answered, but it is not the Node.js Expense Tracker API${status.service ? ` (it identifies as "${status.service}")` : ''}.`
    : `The Expense Tracker API is not reachable at ${status.base}.`;

  return (
    <>
      <style>{`
        .api-config-banner {
          display: flex;
          align-items: center;
          gap: 12px;
          background: #fff7e6;
          border: 1px solid #f0b429;
          border-left: 4px solid #f0b429;
          color: #7a5200;
          border-radius: 8px;
          padding: 10px 14px;
          margin-bottom: 16px;
          font-size: 13px;
          line-height: 1.5;
        }
        .api-config-text { flex: 1; }
        .api-config-banner code {
          background: rgba(240, 180, 41, 0.18);
          padding: 1px 5px;
          border-radius: 4px;
          font-size: 12px;
        }
        .api-config-dismiss {
          border: 1px solid #f0b429;
          background: #fff;
          color: #7a5200;
          border-radius: 6px;
          padding: 4px 10px;
          font-size: 12px;
          cursor: pointer;
        }
      `}</style>
      <div className="api-config-banner">
        <div className="api-config-text">
          <strong>Backend configuration problem.</strong> {title} Local development may be
          proxying to the legacy Spring Boot service. Start the Node backend
          (<code>cd backend &amp;&amp; npm run dev</code>) and point the frontend at it with
          <code> VITE_API_URL</code> (production) or <code>VITE_DEV_API_URL</code> (dev proxy).
        </div>
        <button type="button" className="api-config-dismiss" onClick={() => setStatus(null)}>
          Dismiss
        </button>
      </div>
    </>
  );
};

export default ApiConfigBanner;
