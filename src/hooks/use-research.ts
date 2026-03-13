import { useState, useEffect, useCallback } from 'react';
import { researchApi, type ResearchResult } from '@/lib/api/research';
import { MOCK_RESULT } from '@/lib/mock-data';

const USE_DEMO = !import.meta.env.VITE_API_URL && true; // Auto-demo when no backend configured

export function useResearch() {
  const [query, setQuery] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);

  const startResearch = useCallback(async (q: string) => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    setQuery(q);

    // Try real backend first
    try {
      const { job_id } = await researchApi.startResearch(q);
      setJobId(job_id);
      setIsPolling(true);
      setDemoMode(false);
      return;
    } catch {
      // Backend unreachable — fall back to demo mode
    }

    // Demo mode: simulate pipeline stages
    setDemoMode(true);
    const stages: ResearchResult['status'][] = ['pending', 'running'];
    for (const status of stages) {
      setResult({ ...MOCK_RESULT, status, query: q, papers: [], key_findings: [], contradictions: [], research_gaps: [] });
      await new Promise(r => setTimeout(r, 1200));
    }
    // Complete with mock data
    setResult({ ...MOCK_RESULT, query: q });
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!isPolling || !jobId) return;

    const interval = setInterval(async () => {
      try {
        const data = await researchApi.getStatus(jobId);
        setResult(data);
        if (data.status === 'completed' || data.status === 'failed') {
          setIsPolling(false);
          setIsLoading(false);
          if (data.status === 'failed') {
            setError('Research pipeline failed');
          }
        }
      } catch {
        // Keep polling on transient errors
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isPolling, jobId]);

  const generateSynthesis = useCallback(async () => {
    if (demoMode) {
      setResult(prev => prev ? { ...prev, synthesis: MOCK_RESULT.synthesis } : prev);
      return;
    }
    if (!jobId) return;
    try {
      const { synthesis } = await researchApi.generateSynthesis(jobId);
      setResult(prev => prev ? { ...prev, synthesis } : prev);
    } catch {
      setError('Failed to generate synthesis');
    }
  }, [jobId, demoMode]);

  return {
    query,
    result,
    isLoading,
    error,
    startResearch,
    generateSynthesis,
  };
}
