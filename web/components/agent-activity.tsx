'use client';

import {
  getToolName,
  isToolUIPart,
  type UIMessage,
} from 'ai';
import { useMemo, useState } from 'react';
import {
  getToolActivityLabel,
  getToolStateLabel,
  summarizeToolOutput,
} from '@/lib/tool-labels';

export type AgentActivityItem = {
  id: string;
  step: number;
  toolName: string;
  label: string;
  state: string;
  stateLabel: string;
  outputSummary: string | null;
  errorText: string | null;
  input?: unknown;
  output?: unknown;
};

export type ProgressStep = {
  id: string;
  messageId: string;
  phase: string;
  label: string;
  detail?: string;
  formName?: string;
  fieldId?: string;
  file?: string;
};

/** Fine-grained sub-steps streamed by tools via `data-progress` parts. */
export function extractProgressSteps(messages: UIMessage[]): ProgressStep[] {
  const steps: ProgressStep[] = [];

  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    for (const part of message.parts) {
      if (part.type !== 'data-progress') continue;
      const data = (part as { data?: Record<string, unknown> }).data ?? {};
      steps.push({
        // Scope to the message so keys stay unique even if part ids repeat
        // across turns (e.g. history streamed by an older server version).
        id: `${message.id}:${(part as { id?: string }).id ?? steps.length}`,
        messageId: message.id,
        phase: String(data.phase ?? ''),
        label: String(data.label ?? ''),
        detail: typeof data.detail === 'string' ? data.detail : undefined,
        formName:
          typeof data.formName === 'string' ? data.formName : undefined,
        fieldId: typeof data.fieldId === 'string' ? data.fieldId : undefined,
        file: typeof data.file === 'string' ? data.file : undefined,
      });
    }
  }

  return steps;
}

const PHASE_ICON: Record<string, string> = {
  search: '🔎',
  resolve: '📄',
  read: '📖',
  extract: '🧩',
  map: '🔗',
  field: '✏️',
  skip: '⚠️',
  save: '💾',
  done: '✅',
};

export function extractAgentActivities(
  messages: UIMessage[],
): AgentActivityItem[] {
  const activities: AgentActivityItem[] = [];

  for (const message of messages) {
    if (message.role !== 'assistant') continue;

    let step = 0;

    for (const part of message.parts) {
      if (part.type === 'step-start') {
        step += 1;
      }

      if (!isToolUIPart(part)) continue;

      const toolName = getToolName(part);
      const input = 'input' in part ? part.input : undefined;
      const output =
        part.state === 'output-available' ? part.output : undefined;
      const errorText =
        part.state === 'output-error' ? part.errorText : undefined;

      activities.push({
        id: part.toolCallId,
        step: step || 1,
        toolName,
        label: getToolActivityLabel(toolName, input),
        state: part.state,
        stateLabel: getToolStateLabel(part.state),
        outputSummary: summarizeToolOutput(toolName, output),
        errorText: errorText ?? null,
        input,
        output,
      });
    }
  }

  return activities;
}

function StateIcon({ state }: { state: string }) {
  if (state === 'output-available') {
    return <span className="text-green-600 dark:text-green-400">✓</span>;
  }
  if (state === 'output-error') {
    return <span className="text-red-600 dark:text-red-400">✕</span>;
  }
  if (state === 'input-streaming' || state === 'input-available') {
    return (
      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
    );
  }
  return <span className="text-[var(--muted)]">○</span>;
}

type AgentActivityPanelProps = {
  messages: UIMessage[];
  status: string;
};

export function AgentActivityPanel({
  messages,
  status,
}: AgentActivityPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const activities = useMemo(
    () => extractAgentActivities(messages),
    [messages],
  );

  const progressSteps = useMemo(
    () => extractProgressSteps(messages),
    [messages],
  );

  const latestAssistant = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant');

  const reasoning = latestAssistant?.parts
    .filter((part) => part.type === 'reasoning')
    .map((part) => part.text)
    .join('\n')
    .trim();

  const isActive = status === 'streaming' || status === 'submitted';
  const showPanel =
    isActive ||
    activities.length > 0 ||
    progressSteps.length > 0 ||
    Boolean(reasoning);

  if (!showPanel) return null;

  // While streaming, describe what the agent is doing during the (often long)
  // model-generation gaps where no tool is running.
  const runningTool = activities.some(
    (a) => a.state === 'input-streaming' || a.state === 'input-available',
  );
  const assistantIsWriting = Boolean(
    latestAssistant?.parts.some((p) => p.type === 'text'),
  );
  const liveLabel = runningTool
    ? 'Running a tool…'
    : progressSteps.length > 0 && assistantIsWriting
      ? 'Composing the summary…'
      : activities.length > 0
        ? 'Consulting the AI model…'
        : 'Consulting the AI model…';

  const currentStep =
    activities.length > 0 ? activities[activities.length - 1].step : 0;

  return (
    <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Agent activity</h3>
          <p className="text-xs text-[var(--muted)]">
            {isActive
              ? currentStep > 0
                ? `Working — step ${currentStep}`
                : 'Thinking...'
              : 'Last run'}
          </p>
        </div>
        {isActive && (
          <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-200">
            Live
          </span>
        )}
      </div>

      {reasoning && (
        <details className="mb-3 rounded-md border border-[var(--border)] p-3">
          <summary className="cursor-pointer text-xs font-medium text-[var(--muted)]">
            Reasoning
          </summary>
          <pre className="mt-2 whitespace-pre-wrap text-xs text-[var(--muted)]">
            {reasoning}
          </pre>
        </details>
      )}

      {progressSteps.length > 0 && (
        <ol className="mb-3 space-y-1.5">
          {progressSteps.map((step, index) => {
            const isLast = index === progressSteps.length - 1;
            const showSpinner = isActive && isLast && step.phase !== 'done';
            return (
              <li key={step.id} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 w-4 text-center">
                  {showSpinner ? (
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent align-middle" />
                  ) : (
                    <span>{PHASE_ICON[step.phase] ?? '•'}</span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span>{step.label}</span>
                  {step.detail && (
                    <span className="text-[var(--muted)]"> — {step.detail}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {isActive && !runningTool && (
        <div className="mb-3 flex items-center gap-2 text-sm text-[var(--muted)]">
          <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-[var(--accent)]" />
          <span>{liveLabel}</span>
        </div>
      )}

      {activities.length === 0 && progressSteps.length === 0 && isActive && (
        <p className="text-sm text-[var(--muted)]">
          Preparing to read your documents...
        </p>
      )}

      <ol className="space-y-2">
        {activities.map((activity) => {
          const isExpanded = expandedId === activity.id;
          const hasDetails =
            activity.output !== undefined || activity.input !== undefined;

          return (
            <li
              key={activity.id}
              className="rounded-md border border-[var(--border)] p-3"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  <StateIcon state={activity.state} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{activity.label}</p>
                    <span className="rounded bg-[var(--background)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                      {activity.stateLabel}
                    </span>
                  </div>

                  {activity.outputSummary && (
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {activity.outputSummary}
                    </p>
                  )}

                  {activity.errorText && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      {activity.errorText}
                    </p>
                  )}

                  {hasDetails && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId(isExpanded ? null : activity.id)
                      }
                      className="mt-2 text-xs text-[var(--accent)] hover:underline"
                    >
                      {isExpanded ? 'Hide details' : 'Show details'}
                    </button>
                  )}

                  {isExpanded && hasDetails && (
                    <div className="mt-2 space-y-2">
                      {activity.input !== undefined && (
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
                            Input
                          </p>
                          <pre className="mt-1 overflow-x-auto rounded bg-[var(--background)] p-2 text-[11px] text-[var(--muted)]">
                            {JSON.stringify(activity.input, null, 2)}
                          </pre>
                        </div>
                      )}
                      {activity.output !== undefined && (
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
                            Output
                          </p>
                          <pre className="mt-1 max-h-48 overflow-auto rounded bg-[var(--background)] p-2 text-[11px] text-[var(--muted)]">
                            {JSON.stringify(activity.output, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
