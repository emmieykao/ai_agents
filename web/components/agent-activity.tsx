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
import { Glyph, Working, type GlyphName } from './icons';

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

const PHASE_GLYPH: Record<string, GlyphName> = {
  search: 'search',
  resolve: 'page',
  read: 'book',
  extract: 'funnel',
  map: 'link',
  field: 'pen',
  skip: 'alert',
  save: 'save',
  done: 'check',
};

const PHASE_COLOR: Record<string, string> = {
  field: 'text-pen',
  skip: 'text-amber',
  done: 'text-seal',
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
    return <Glyph name="check" className="h-3 w-3 text-pen" />;
  }
  if (state === 'output-error') {
    return <Glyph name="cross" className="h-3 w-3 text-seal" />;
  }
  if (state === 'input-streaming' || state === 'input-available') {
    return <Working className="h-3 w-3 text-pen" />;
  }
  return <Glyph name="dot" className="h-3 w-3 text-ink-faint" />;
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
      : 'Consulting the model…';

  return (
    <div className="rounded-lg border border-line bg-sheet-tint/70 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="eyebrow">Agent&apos;s desk</h3>
        {isActive ? (
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-pen">
            <span className="ink-pulse inline-block h-1.5 w-1.5 rounded-full bg-pen" />
            live
          </span>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">
            last run
          </span>
        )}
      </div>

      {reasoning && (
        <details className="mb-3 rounded-md border border-line bg-sheet p-2.5">
          <summary className="cursor-pointer font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-soft">
            reasoning
          </summary>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-[10.5px] leading-relaxed text-ink-soft">
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
              <li key={step.id} className="flex items-start gap-2.5 text-[12.5px]">
                <span className="mt-[3px] w-3.5 shrink-0">
                  {showSpinner ? (
                    <Working className="h-3 w-3 text-pen" />
                  ) : (
                    <Glyph
                      name={PHASE_GLYPH[step.phase] ?? 'dot'}
                      className={`h-3.5 w-3.5 ${PHASE_COLOR[step.phase] ?? 'text-ink-faint'}`}
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1 leading-snug">
                  <span>{step.label}</span>
                  {step.detail && (
                    <span className="font-mono text-[11px] text-ink-faint">
                      {' '}
                      — {step.detail}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {isActive && !runningTool && (
        <div className="mb-3 flex items-center gap-2 text-[12.5px] text-ink-soft">
          <span className="ink-pulse inline-block h-1.5 w-1.5 rounded-full bg-pen" />
          <span className="font-display italic">{liveLabel}</span>
        </div>
      )}

      {activities.length === 0 && progressSteps.length === 0 && isActive && (
        <p className="font-display text-[13px] italic text-ink-soft">
          Opening your documents…
        </p>
      )}

      {activities.length > 0 && (
        <ol>
          {activities.map((activity, index) => {
            const isExpanded = expandedId === activity.id;
            const hasDetails =
              activity.output !== undefined || activity.input !== undefined;

            return (
              <li
                key={activity.id}
                className={`py-2 ${index > 0 ? 'border-t border-line' : ''}`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="mt-[3px] shrink-0">
                    <StateIcon state={activity.state} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <p className="text-[12.5px] font-medium leading-snug">
                        {activity.label}
                      </p>
                      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-faint">
                        {activity.stateLabel}
                      </span>
                    </div>

                    {activity.outputSummary && (
                      <p className="mt-0.5 text-[11.5px] leading-snug text-ink-soft">
                        {activity.outputSummary}
                      </p>
                    )}

                    {activity.errorText && (
                      <p className="mt-0.5 text-[11.5px] text-seal">
                        {activity.errorText}
                      </p>
                    )}

                    {hasDetails && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(isExpanded ? null : activity.id)
                        }
                        className="btn-quiet mt-1"
                      >
                        {isExpanded ? 'hide details' : 'details'}
                      </button>
                    )}

                    {isExpanded && hasDetails && (
                      <div className="mt-2 space-y-2">
                        {activity.input !== undefined && (
                          <div>
                            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-faint">
                              Input
                            </p>
                            <pre className="mt-1 overflow-x-auto rounded-md border border-line bg-sheet p-2 font-mono text-[10.5px] leading-relaxed text-ink-soft">
                              {JSON.stringify(activity.input, null, 2)}
                            </pre>
                          </div>
                        )}
                        {activity.output !== undefined && (
                          <div>
                            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-faint">
                              Output
                            </p>
                            <pre className="mt-1 max-h-48 overflow-auto rounded-md border border-line bg-sheet p-2 font-mono text-[10.5px] leading-relaxed text-ink-soft">
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
      )}
    </div>
  );
}
