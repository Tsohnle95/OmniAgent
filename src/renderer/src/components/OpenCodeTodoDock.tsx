import { useMemo, useState, type ReactNode } from "react";
import type { TodoItem, TranscriptItem } from "@shared/types";
import { IconCheck, IconChevronDown } from "./icons";

function TodoControl({ status }: { status: TodoItem["status"] }): ReactNode {
  const completed = status === "completed";
  const active = status === "in_progress";
  return (
    <span
      data-slot="todo-checkbox-control"
      data-checked={completed ? "true" : undefined}
      data-in-progress={active ? "true" : undefined}
      aria-hidden="true"
    >
      {completed && <IconCheck />}
      {active && <span data-slot="todo-active-dot" />}
    </span>
  );
}

function toolSteps(transcript: TranscriptItem[]): TodoItem[] {
  let lastUser = -1;
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    if (transcript[index].kind === "user") {
      lastUser = index;
      break;
    }
  }
  const steps: TodoItem[] = [];
  for (const item of transcript.slice(lastUser + 1)) {
    if (item.kind !== "assistant") continue;
    for (const part of item.parts) {
      if (part.kind !== "tool" || part.tool.title.toLowerCase().replace(/[^a-z]/g, "") === "todowrite") continue;
      const detail = part.tool.detail.trim();
      steps.push({
        id: part.id,
        content: detail && detail.toLowerCase() !== part.tool.title.toLowerCase()
          ? `${part.tool.title} · ${detail}`
          : part.tool.title,
        status: part.tool.status === "running" ? "in_progress" : part.tool.status === "success" ? "completed" : "cancelled"
      });
    }
  }
  return steps.slice(-8);
}

export function OpenCodeTodoDock({ todos, transcript }: { todos: TodoItem[]; transcript: TranscriptItem[] }): ReactNode {
  const [collapsed, setCollapsed] = useState(false);
  const steps = useMemo(() => todos.length > 0 ? todos : toolSteps(transcript), [todos, transcript]);
  const completed = useMemo(
    () => steps.filter((todo) => todo.status === "completed").length,
    [steps]
  );
  if (steps.length === 0) return null;

  return (
    <div data-component="session-todo-dock" data-collapsed={collapsed ? "true" : undefined}>
      <div
        data-action="session-todo-toggle"
        role="button"
        tabIndex={0}
        onClick={() => setCollapsed((value) => !value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          setCollapsed((value) => !value);
        }}
      >
        <span data-slot="session-todo-progress">{completed} of {steps.length} steps completed</span>
        <button
          data-action="session-todo-toggle-button"
          aria-label={collapsed ? "Expand todos" : "Collapse todos"}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            setCollapsed((value) => !value);
          }}
        >
          <IconChevronDown />
        </button>
      </div>
      {!collapsed && (
        <div data-slot="session-todo-list">
          {steps.map((todo) => (
            <div data-component="todo-item" data-state={todo.status} key={todo.id}>
              <TodoControl status={todo.status} />
              <span data-slot="todo-content">{todo.content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
