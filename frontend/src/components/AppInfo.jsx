import React, { useState, useEffect } from 'react';
import { API_URL } from '../utils/api';

function AppInfo() {
  const [stats, setStats] = useState({
    backend: false,
    frontend: false,
    model: 'N/A',
    documents: 0,
  });

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const checkStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/health`);
      setStats(prev => ({ ...prev, backend: res.ok }));
    } catch {
      setStats(prev => ({ ...prev, backend: false }));
    }

    try {
      const res = await fetch('http://localhost:3456');
      setStats(prev => ({ ...prev, frontend: res.ok }));
    } catch {
      setStats(prev => ({ ...prev, frontend: false }));
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-40">
      <div className="bg-gray-900/90 backdrop-blur-sm rounded-2xl p-4 border border-gray-800 shadow-2xl min-w-[300px]">
        <h3 className="text-white font-bold mb-3 flex items-center gap-2">
          <span className="text-2xl">🧠</span>
          Stato Sistema
        </h3>
        
        <div className="space-y-2">
          <StatusRow label="Backend API" status={stats.backend} />
          <StatusRow label="Frontend" status={stats.frontend} />
          <StatusRow label="Modello AI" value="IONOS Llama3.3" />
        </div>
        
        <div className="mt-4 pt-3 border-t border-gray-800">
          <p className="text-xs text-gray-500 text-center">
            LLM Wiki v1.0.0
          </p>
        </div>
      </div>
    </div>
  );
}

function StatusRow({ label, status, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-400">{label}</span>
      {value ? (
        <span className="text-sm text-gray-300">{value}</span>
      ) : (
        <span className={`w-3 h-3 rounded-full ${status ? 'bg-green-400' : 'bg-red-400'} ${status ? 'animate-pulse' : ''}`}></span>
      )}
    </div>
  );
}

export default AppInfo;