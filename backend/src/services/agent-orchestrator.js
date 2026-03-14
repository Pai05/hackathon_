/**
 * AgentOrchestrator — coordinates the research pipeline:
 *   QueryPlannerAgent → PaperSearchAgent → EvidenceAgent → SynthesisAgent
 *
 * Jobs are stored in memory with full status tracking so the client can poll.
 */
import crypto from "crypto";
import prisma from "../db.js";
import { QueryPlannerAgent } from "../agents/query-planner-agent.js";
import { PaperSearchAgent } from "../agents/paper-search-agent.js";
import { EvidenceAgent } from "../agents/evidence-agent.js";
import { SynthesisAgent } from "../agents/synthesis-agent.js";

/** In-memory job store: jobId → JobState */
const jobs = new Map();

const JOB_TTL_MS = 30 * 60 * 1000;

function cleanupOldJobs() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs.entries()) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}

/**
/**
 * Starts a new research job asynchronously.
 * @param {string} query
 * @param {string} userId  — DB user id from JWT; required to persist the job.
 * Returns the jobId immediately; caller should poll getJobStatus(jobId).
 */
export function startResearch(query, userId) {
  cleanupOldJobs();

  if (!query || typeof query !== "string" || query.trim().length === 0) {
    throw new Error("Query must be a non-empty string");
  }

  const jobId = crypto.randomUUID();
  const state = {
    jobId,
    query: query.trim(),
    userId,
    status: "running",       // 'running' | 'completed' | 'failed'
    stage: "query_planning", // current pipeline stage
    logs: [],
    result: null,
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  jobs.set(jobId, state);

  // Persist initial record to DB (fire & forget — in-memory is the live source)
  prisma.researchJob
    .create({ data: { id: jobId, userId, query: query.trim(), status: "running", stage: "query_planning" } })
    .catch((err) => console.error("[Orchestrator] DB create failed:", err));

  // Run pipeline asynchronously (do not await here)
  runPipeline(state).catch((err) => {
    state.status = "failed";
    state.error = err.message;
    state.updatedAt = Date.now();
    console.error(`[Orchestrator] Pipeline failed for job ${jobId}:`, err);
    prisma.researchJob
      .update({ where: { id: jobId }, data: { status: "failed", error: err.message, stage: state.stage } })
      .catch(() => {});
  });

  return jobId;
}

/** Returns current job state or null if not found. */
/**
 * Returns job state. Checks in-memory first (for active jobs), then falls back
 * to the DB (for completed/historical jobs after a server restart).
 */
export async function getJobStatus(jobId) {
  const inMemory = jobs.get(jobId);
  if (inMemory) return inMemory;

  // Attempt DB lookup for completed / historical jobs
  try {
    const record = await prisma.researchJob.findUnique({ where: { id: jobId } });
    if (!record) return null;
    return {
      jobId: record.id,
      query: record.query,
      userId: record.userId,
      status: record.status,
      stage: record.stage,
      logs: [],
      result: record.result ? JSON.parse(record.result) : null,
      error: record.error,
      createdAt: record.createdAt.getTime(),
      updatedAt: record.updatedAt.getTime(),
    };
  } catch {
    return null;
  }
}

async function runPipeline(state) {
  const updateStage = (stage) => {
    state.stage = stage;
    state.updatedAt = Date.now();
  };

  // ── Stage 1: Query Planning ─────────────────────────────────────────────
  updateStage("query_planning");
  const planner = new QueryPlannerAgent();
  const planResult = await planner.execute({ query: state.query }, state.logs);

  // ── Stage 2: Paper Search ───────────────────────────────────────────────
  updateStage("paper_search");
  const searcher = new PaperSearchAgent();
  const searchResult = await searcher.execute(planResult, state.logs);

  // ── Stage 3: Evidence Extraction ────────────────────────────────────────
  updateStage("evidence_extraction");
  const evidenceAgent = new EvidenceAgent();
  const evidenceResult = await evidenceAgent.execute(
    { papers: searchResult.papers, keyTerms: planResult.keyTerms },
    state.logs
  );

  // ── Stage 4: Synthesis ──────────────────────────────────────────────────
  updateStage("synthesis");
  const synthesiser = new SynthesisAgent();
  const synthesisResult = await synthesiser.execute(
    {
      originalQuery: state.query,
      keyTerms: planResult.keyTerms,
      papers: searchResult.papers,
      evidenceItems: evidenceResult.evidenceItems,
      evidenceSummary: evidenceResult.summary,
    },
    state.logs
  );

  // ── Done ────────────────────────────────────────────────────────────────
  state.result = {
    query: state.query,
    status: "completed",
    papers: searchResult.papers,
    keyTerms: planResult.keyTerms,
    subQueries: planResult.subQueries,
    evidenceItems: evidenceResult.evidenceItems,
    evidenceSummary: evidenceResult.summary,
    synthesis: synthesisResult,
  };
  state.status = "completed";
  state.stage = "done";
  state.updatedAt = Date.now();

  // Persist completed result to DB for cross-session history
  prisma.researchJob
    .update({
      where: { id: state.jobId },
      data: { status: "completed", stage: "done", result: JSON.stringify(state.result) },
    })
    .catch((err) => console.error("[Orchestrator] DB update failed:", err));
}
