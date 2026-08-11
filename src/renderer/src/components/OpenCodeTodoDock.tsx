import { useMemo, useState, type ReactNode } from "react";
import type { TodoItem } from "@shared/types";

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
      {completed && <span className="codicon codicon-check" />}
      {active && <span data-slot="todo-active-dot" />}
    </span>
  );
}

export function OpenCodeTodoDock({ todos }: { todos: TodoItem[] }): ReactNode {
  const [collapsed, setCollapsed] = useState(false);
  const completed = useMemo(
    () => todos.filter((todo) => todo.status === "completed").length,
    [todos]
  );
  if (todos.length === 0 || completed === todos.length) return null;

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
        <span data-slot="session-todo-progress">{completed} of {todos.length} todos completed</span>
        <button
          data-action="session-todo-toggle-button"
          aria-label={collapsed ? "Expand todos" : "Collapse todos"}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            setCollapsed((value) => !value);
          }}
        >
          <span className="codicon codicon-chevron-down" />
        </button>
      </div>
      {!collapsed && (
        <div data-slot="session-todo-list">
          {todos.map((todo) => (
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
