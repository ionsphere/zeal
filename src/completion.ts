import type { ModelMessage } from './models.js';

export type CompletionStatus = 'satisfied' | 'needs_work' | 'blocked';

export type CompletionVerdict = {
  status: CompletionStatus;
  summary: string;
  gaps: string[];
  evidence: Array<{ requirement: string; evidence: string }>;
};

export function completionValidationMessages(
  task: string,
  candidate: string,
  transcript: readonly ModelMessage[],
): ModelMessage[] {
  const evidence = JSON.stringify(transcript.slice(1));
  const boundedEvidence = evidence.length > 80_000
    ? `[earlier transcript omitted]\n${evidence.slice(-80_000)}`
    : evidence;
  return [
    {
      role: 'system',
      content: `You are Zeal's completion validator. Independently decide whether the candidate work satisfies the user's task.
Use only evidence present in the transcript. Do not trust TASK_DONE or the worker's claims without supporting evidence.
Return exactly one JSON object with this shape:
{"status":"satisfied|needs_work|blocked","summary":"...","gaps":["..."],"evidence":[{"requirement":"...","evidence":"..."}]}
Choose needs_work when the agent can correct a gap with its current tools. Choose blocked only when completion requires unavailable authority, information, or capability. A satisfied verdict requires no gaps.`,
    },
    {
      role: 'user',
      content: `USER TASK:\n${task}\n\nCANDIDATE RESULT:\n${candidate}\n\nWORK TRANSCRIPT:\n${boundedEvidence}`,
    },
  ];
}

export function parseCompletionVerdict(content: string): CompletionVerdict {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Completion validator did not return a JSON object');
  let value: unknown;
  try { value = JSON.parse(match[0]); }
  catch (error: any) { throw new Error(`Completion validator returned invalid JSON: ${error.message}`); }
  if (!value || typeof value !== 'object') throw new Error('Completion verdict must be an object');
  const verdict = value as Record<string, unknown>;
  if (!['satisfied', 'needs_work', 'blocked'].includes(String(verdict.status))) {
    throw new Error(`Completion verdict has invalid status: ${String(verdict.status)}`);
  }
  if (typeof verdict.summary !== 'string' || !Array.isArray(verdict.gaps) ||
      verdict.gaps.some((gap) => typeof gap !== 'string') || !Array.isArray(verdict.evidence)) {
    throw new Error('Completion verdict has invalid summary, gaps, or evidence');
  }
  const evidence = verdict.evidence.map((item) => {
    if (!item || typeof item !== 'object' || typeof item.requirement !== 'string' || typeof item.evidence !== 'string') {
      throw new Error('Completion verdict has invalid evidence entry');
    }
    return { requirement: item.requirement, evidence: item.evidence };
  });
  if (verdict.status === 'satisfied' && verdict.gaps.length) {
    throw new Error('A satisfied completion verdict cannot contain gaps');
  }
  return {
    status: verdict.status as CompletionStatus,
    summary: verdict.summary,
    gaps: verdict.gaps as string[],
    evidence,
  };
}

export function correctionPrompt(verdict: CompletionVerdict): string {
  const gaps = verdict.gaps.length ? verdict.gaps.map((gap) => `- ${gap}`).join('\n') : '- No actionable gap supplied';
  return `Completion validation found remaining work. Continue the task and address every gap before claiming TASK_DONE again.\n\n${gaps}\n\nValidator summary: ${verdict.summary}`;
}
