// API client for the Research Literature Agent backend.
const BASE_URL = (import.meta.env.VITE_API_URL || '').trim();
const ALLOWED_SOURCES = new Set(['arXiv', 'PubMed', 'Semantic Scholar', 'Google Scholar']);

function apiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!BASE_URL) return normalizedPath;
  return `${BASE_URL.replace(/\/$/, '')}${normalizedPath}`;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('research_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function refreshSessionIfPossible(): Promise<boolean> {
  const refreshToken = localStorage.getItem('research_refresh_token');
  if (!refreshToken) return false;

  const res = await fetch(apiUrl('/api/auth/refresh'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) return false;
  const data = await res.json();
  localStorage.setItem('research_token', data.token);
  if (data.refreshToken) localStorage.setItem('research_refresh_token', data.refreshToken);
  if (data.user) localStorage.setItem('research_user', JSON.stringify(data.user));
  return true;
}

async function fetchWithAuthRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let res = await fetch(input, init);
  if (res.status !== 401) return res;

  const refreshed = await refreshSessionIfPossible();
  if (!refreshed) return res;

  const headers = {
    ...(init?.headers as Record<string, string> | undefined),
    ...authHeaders(),
  };
  res = await fetch(input, { ...init, headers });
  return res;
}

export interface ResearchPaper {
  title: string;
  authors: string;
  year: string | number;
  source: string;
  abstract: string;
  url?: string;
  key_findings?: string;
}

export interface Contradiction {
  description: string;
  papers: string[];
}

export interface ResearchGap {
  description: string;
}

export interface CrossPaperValidation {
  claim: string;
  support_level: 'strong' | 'moderate' | 'mixed';
  supporting_papers: string[];
  conflicting_papers: string[];
  confidence: number;
  notes: string;
}

export interface CitationTrail {
  paper_title: string;
  citation_count: number;
  cited_by_estimate: number;
  referenced_papers: string[];
  influence_note: string;
}

export interface ResearchPriority {
  rank: number;
  title: string;
  weightage: number;
  rationale: string;
  related_papers: string[];
}

export interface ResearchResult {
  job_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** Mapped backend pipeline stage key used to animate PipelineStatus steps */
  pipeline_stage?: string;
  query: string;
  papers: ResearchPaper[];
  key_findings: { paper_title: string; findings: string }[];
  contradictions: Contradiction[];
  research_gaps: ResearchGap[];
  cross_paper_validation?: CrossPaperValidation[];
  citation_trails?: CitationTrail[];
  research_priorities?: ResearchPriority[];
  synthesis?: string;
  overview?: string;
}

export const researchApi = {
  async startResearch(query: string): Promise<{ job_id: string }> {
    const res = await fetchWithAuthRetry(apiUrl('/api/research/start'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new Error('Failed to start research');
    const data = await res.json();
    return { job_id: data.job_id ?? data.jobId };
  },

  async getStatus(jobId: string): Promise<ResearchResult> {
    const res = await fetchWithAuthRetry(apiUrl(`/api/research/status/${jobId}`), {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error('Failed to get status');
    const data = await res.json();

    // Node backend returns { ok, job: { jobId, status, stage, result } }
    if (data.job) {
      const job = data.job;
      // Map backend pipeline stages → PipelineStatus step keys
      const stageMap: Record<string, string> = {
        query_planning: 'planning',
        paper_search: 'searching',
        evidence_extraction: 'reading',
        synthesis: 'citation',
        done: 'complete',
      };
      const pipeline_stage = stageMap[job.stage] ?? 'planning';

      // Still running or just failed — return skeleton so PipelineStatus animates
      if (!job.result || job.status !== 'completed') {
        return {
          job_id: job.jobId ?? jobId,
          status: job.status === 'failed' ? 'failed' : 'running',
          pipeline_stage,
          query: job.query ?? '',
          papers: [],
          key_findings: [],
          contradictions: [],
          research_gaps: [],
        };
      }

      // Completed — map papers array; analysis fields added by use-research hook
      const r = job.result;
      const papers: ResearchPaper[] = (r.papers ?? [])
        .map((p: Record<string, unknown>) => {
          const source = String(p.source ?? '');
          if (!ALLOWED_SOURCES.has(source)) return null;
          return {
            title: String(p.title ?? ''),
            // Backend has authors as string[]; frontend expects a single joined string
            authors: Array.isArray(p.authors)
              ? (p.authors as string[]).join(', ')
              : String(p.authors ?? ''),
            year: p.year ?? '',
            source,
            abstract: String(p.abstract ?? ''),
            url: p.url ? String(p.url) : undefined,
            key_findings: '',
          };
        })
        .filter((p): p is ResearchPaper => p !== null);

      const synthSummary =
        r.synthesis?.summary ??
        (typeof r.synthesis === 'string' ? r.synthesis : undefined);

      return {
        job_id: job.jobId ?? jobId,
        status: 'completed',
        pipeline_stage: 'complete',
        query: r.query ?? job.query ?? '',
        papers,
        // key_findings / contradictions / research_gaps populated by use-research hook
        key_findings: [],
        contradictions: [],
        research_gaps: [],
        synthesis: synthSummary,
        overview: synthSummary,
      };
    }

    // Flat-shape backend — return as-is
    return data as ResearchResult;
  },

  async generateSynthesis(jobId: string): Promise<{ synthesis: string }> {
    const res = await fetchWithAuthRetry(apiUrl(`/api/research/synthesize/${jobId}`), {
      method: 'POST',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error('Failed to generate synthesis');
    return res.json();
  },

  async getHistory(): Promise<Array<{ id: string; query: string; viewedAt: string; result: ResearchResult | null }>> {
    const res = await fetchWithAuthRetry(apiUrl('/api/research/history'), {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch history');
    const data = await res.json();
    return data.items ?? [];
  },
};
