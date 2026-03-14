import { useState, useEffect, useCallback, useRef } from 'react';
import { researchApi, type ResearchResult } from '@/lib/api/research';
import { useState, useEffect, useCallback, useRef } from 'react';
import { researchApi, type ResearchResult } from '@/lib/api/research';
import { buildAnalysisFromPapers } from '@/lib/mock-data';
import { useAuth } from '@/lib/auth-context';

const HISTORY_KEY = 'research_recent_insights';
const HISTORY_LIMIT = 12;

export interface ResearchHistoryItem {
  id: string;
  query: string;
  viewedAt: string;
  result: ResearchResult;
}

/** Enrich a raw backend result (papers + synthesis) with full analysis fields. */
function enrichResult(raw: ResearchResult): ResearchResult {
  if (!raw?.papers?.length) return raw;
  const analysis = buildAnalysisFromPapers(raw.query, raw.papers);
  return { ...raw, ...analysis };
}

function readLocalHistory(): ResearchHistoryItem[] {
  const stored = localStorage.getItem(HISTORY_KEY);
  if (!stored) return [];
  try { return JSON.parse(stored) as ResearchHistoryItem[]; } catch { return []; }
}

export function useResearch() {
  const { isAuthenticated } = useAuth();
  const [query, setQuery] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ResearchHistoryItem[]>(readLocalHistory);
  const lastSavedSignature = useRef<string | null>(null);

  // Load history from server on mount (authenticated users)
  useEffect(() => {
    if (!isAuthenticated) return;
    researchApi.getHistory().then((items) => {
      const enriched = items
        .filter((i) => i.result)
        .map((i) => ({
          id: i.id,
          query: i.query,
          viewedAt: i.viewedAt,
          result: enrichResult(i.result as ResearchResult),
        }));
      if (enriched.length > 0) {
        setHistory(enriched);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(enriched));
      }
    }).catch(() => {
      // Server unavailable — local history remains
    });
  }, [isAuthenticated]);

  const startResearch = useCallback(async (q: string) => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    setQuery(q);
    try {
      const { job_id } = await researchApi.startResearch(q);
      setJobId(job_id);
      setIsPolling(true);
    } catch {
      setIsLoading(false);
      setIsPolling(false);
      setError('Backend is unreachable. Make sure the server is running.');
    }
  }, []);

  // Poll job status every 2 seconds while running
  useEffect(() => {
    if (!isPolling || !jobId) return;
    const interval = setInterval(async () => {
      try {
        const data = await researchApi.getStatus(jobId);
        if (data.status === 'completed' && data.papers?.length > 0) {
          setResult(enrichResult(data));
        } else {
          setResult(data);
        }
        if (data.status === 'completed' || data.status === 'failed') {
          setIsPolling(false);
          setIsLoading(false);
          if (data.status === 'failed') setError('Research pipeline failed');
        }
      } catch {
        // Keep polling on transient errors
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [isPolling, jobId]);

  const generateSynthesis = useCallback(async () => {
    if (!jobId) return;
    try {
      const { synthesis } = await researchApi.generateSynthesis(jobId);
      setResult(prev => prev ? { ...prev, synthesis } : prev);
    } catch {
      setError('Failed to generate synthesis');
    }
  }, [jobId]);

  const beginNewSearch = useCallback(() => {
    setResult(null);
    setQuery('');
    setError(null);
    setIsLoading(false);
    setIsPolling(false);
    setJobId(null);
  }, []);

  const openHistoryItem = useCallback((itemId: string) => {
    const item = history.find((entry) => entry.id === itemId);
    if (!item) return;
    setResult(item.result);
    setQuery(item.query);
    setError(null);
    setIsLoading(false);
    setIsPolling(false);
  }, [history]);

  // Save completed result to local history (server already saved it via orchestrator)
  useEffect(() => {
    if (!result || result.status !== 'completed' || !result.papers?.length) return;
    const signature = `${result.job_id}|${result.query}|${result.papers.length}`;
    if (signature === lastSavedSignature.current) return;
    lastSavedSignature.current = signature;

    const entry: ResearchHistoryItem = {
      id: result.job_id ?? `${Date.now()}`,
      query: result.query,
      viewedAt: new Date().toISOString(),
      result,
    };
    const updated = [entry, ...history]
      .filter((item, idx, arr) => arr.findIndex((x) => x.query === item.query) === idx)
      .slice(0, HISTORY_LIMIT);
    setHistory(updated);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  }, [result, history]);

  return { query, result, isLoading, error, history, startResearch, generateSynthesis, beginNewSearch, openHistoryItem };
}
