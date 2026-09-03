import React, { useState, useEffect } from 'react';
import { chatApi } from '../utils/api';
import { useI18n, t } from '../utils/i18n';

function SearchHistory() {
  const { lang } = useI18n(); const tr = p => t(lang,p);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const response = await chatApi.getHistory();
      setHistory(response.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">{tr('history.title')}</h2>
        <button
          onClick={loadHistory}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-sm"
        >
          {tr('history.refresh')}
        </button>
      </div>

      {history.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <div className="text-6xl mb-4">💬</div>
          <p className="text-lg">{tr('history.empty')}</p>
          <p className="text-sm mt-2">{tr('history.emptyHint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {history.map((item, idx) => (
            <div key={idx} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-400">
                  👤
                </div>
                <div className="flex-1">
                  <p className="text-white text-sm">{item.user_message}</p>
                  <p className="text-gray-400 text-xs mt-1">{item.created_at}</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-800">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-purple-500/20 rounded-full flex items-center justify-center text-purple-400">
                    🤖
                  </div>
                  <div className="flex-1">
                    <p className="text-gray-300 text-sm">{item.assistant_message?.slice(0, 200)}...</p>
                    {item.model && (
                      <p className="text-gray-500 text-xs mt-2">Model: {item.model}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SearchHistory;