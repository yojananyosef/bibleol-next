"use client";

// PassageTree.tsx — árbol de selección de pasajes (view_universe 1:1 con el
// árbol jstree de Universe_tree.php). Carga perezosa por niveles vía
// /quiz/universe-level; recoge los nodos marcados y arranca el quiz con la
// selección.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export interface PassageTreeProps {
  /** Solo se usan en modo ejecución (el editor no arranca quizzes). */
  quizPath?: string;
  count?: number;
  treeJson: string;
  markedList: string[];
  prop: string;
  /** Modo editor: sin barra de acciones y con callback de refs marcadas. */
  editorMode?: boolean;
  onRefsChange?: (refs: string[]) => void;
}

interface NodeItem {
  data: string;
  state?: string;
  attr: { "data-ref": string; "data-rangelow": number; "data-rangehigh": number; "data-lev": number };
  children?: NodeItem[];
}

export function PassageTree({ quizPath, count, treeJson, markedList, prop, editorMode, onRefsChange }: PassageTreeProps) {
  const tree = JSON.parse(treeJson) as NodeItem;
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const m of markedList) init[m] = true;
    return init;
  });
  const [expanded, setExpanded] = useState<Record<string, NodeItem[]>>({});
  const [loading, setLoading] = useState<string | null>(null);

  const expand = useCallback(
    async (node: NodeItem) => {
      if (expanded[node.attr["data-ref"]]) return;
      setLoading(node.attr["data-ref"]);
      try {
        const { attr } = node;
        const res = await fetch(
          `/quiz/universe-level?prop=${encodeURIComponent(prop)}&rangelow=${attr["data-rangelow"]}&rangehigh=${attr["data-rangehigh"]}&ref=${encodeURIComponent(attr["data-ref"])}&lev=${attr["data-lev"]}`,
        );
        const nodes = (await res.json()) as NodeItem[];
        setExpanded((prev) => ({ ...prev, [node.attr["data-ref"]]: nodes }));
      } finally {
        setLoading(null);
      }
    },
    [expanded, prop],
  );

  // Formato 1:1 con view_passage_select.php: "ref/rangelow/rangehigh" por nodo
  const selectedPaths = Object.entries(checked)
    .filter(([k, v]) => v && k.length > 0)
    .map(([k]) => {
      const node = findNode(tree, k);
      return node
        ? `${k}/${node.attr["data-rangelow"]}/${node.attr["data-rangehigh"]}`
        : k;
    })
    .sort();

  function findNode(n: NodeItem, ident: string): NodeItem | null {
    if (n.attr["data-ref"] === ident) return n;
    for (const c of n.children ?? []) {
      const r = findNode(c, ident);
      if (r) return r;
    }
    return null;
  }

  const renderNode = (node: NodeItem, depth: number): React.ReactNode => {
    const ident = node.attr["data-ref"];
    const hasChildren = node.state === "closed" || (node.children ?? []).length > 0;
    const isChecked = !!checked[ident];

    const children: NodeItem[] | undefined =
      node.children ?? (hasChildren && expanded[ident] !== undefined ? expanded[ident] : undefined);

    const checkDescendants = (list: NodeItem[], value: boolean): Record<string, boolean> => {
      const next: Record<string, boolean> = {};
      for (const n of list) {
        if (n.attr["data-ref"]) next[n.attr["data-ref"]] = value;
        if (n.children) Object.assign(next, checkDescendants(n.children, value));
      }
      return next;
    };

    return (
      <li key={ident}>
        <div className="flex items-center gap-1.5 py-0.5 text-sm">
          {hasChildren ? (
            <button
              type="button"
              className="w-5 text-muted-foreground"
              onClick={() => {
                if (expanded[ident]) {
                  setExpanded((prev) => {
                    const next = { ...prev };
                    delete next[ident];
                    return next;
                  });
                } else {
                  void expand(node);
                }
              }}
            >
              {loading === ident ? "…" : expanded[ident] ? "▾" : "▸"}
            </button>
          ) : (
            <span className="w-5" />
          )}
          <input
            type="checkbox"
            checked={isChecked}
            onChange={(e) => {
              const next = { ...checked, [ident]: e.target.checked };
              if (children) Object.assign(next, checkDescendants(children, e.target.checked));
              setChecked(next);
            }}
          />
          <button type="button" className="text-left" onClick={() => void expand(node)}>
            {node.data}
          </button>
        </div>
        {children && children.length > 0 ? (
          <ul className="ml-5">{children.map((c) => renderNode(c, depth + 1))}</ul>
        ) : null}
      </li>
    );
  };

  // En modo editor, el tree solo reporta las refs marcadas (data-ref): 1:1 con
  // el jstree get_checked del editor legacy.
  useEffect(() => {
    if (editorMode && onRefsChange) {
      onRefsChange(
        Object.entries(checked)
          .filter(([k, v]) => v && k.length > 0)
          .map(([k]) => k),
      );
    }
  }, [checked, editorMode, onRefsChange]);

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-4 max-h-[50vh] overflow-auto rounded border p-3">
          <ul>{renderNode(tree, 0)}</ul>
        </div>
        {editorMode ? null : (
          <div className="flex items-center justify-between gap-3">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const next: Record<string, boolean> = {};
                const collect = (n: NodeItem) => {
                  if (n.attr["data-ref"]) next[n.attr["data-ref"]] = true;
                  for (const c of n.children ?? []) collect(c);
                };
                collect(tree);
                setChecked(next);
              }}
            >
              Mark all
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setChecked({})}>
              Unmark all
            </Button>
          </div>
          <Link
            href={`/quiz/run?quiz=${encodeURIComponent(quizPath ?? "")}&count=${count ?? 0}&selection=${selectedPaths.join(",")}`}
          >
            <Button type="button" disabled={selectedPaths.length === 0}>
              Start quiz ({selectedPaths.length})
            </Button>
          </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
