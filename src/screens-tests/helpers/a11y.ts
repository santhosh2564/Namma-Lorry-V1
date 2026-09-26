// Accessibility checks on a rendered screen (M12a, TRD §9): every touch target has a label
// (its own or its text) and, where its size is declared, is at least 48 × 48 dp including
// hitSlop. Targets sized only by their content can't be measured in Jest and are skipped.
import { StyleSheet } from 'react-native';

const MIN = 48;

type Slop = { top?: number; bottom?: number; left?: number; right?: number };
const slopOf = (s: unknown): Required<Slop> => {
  if (typeof s === 'number') return { top: s, bottom: s, left: s, right: s };
  const o = (s ?? {}) as Slop;
  return { top: o.top ?? 0, bottom: o.bottom ?? 0, left: o.left ?? 0, right: o.right ?? 0 };
};

interface Node {
  type: string;
  props: Record<string, any>;
  children: (Node | string)[];
  queryAll(predicate: (n: Node) => boolean): Node[];
}

function textOf(n: Node | string): string {
  if (typeof n === 'string') return n;
  return n.children.map(textOf).join('');
}

export function touchTargetIssues(root: Node | null): string[] {
  if (!root) throw new Error('nothing rendered');
  const issues: string[] = [];
  const targets = root.queryAll(
    (n) =>
      typeof n.type === 'string' && typeof n.props.onClick === 'function' && n.props.accessible !== false,
  );
  for (const n of targets) {
    const id =
      n.props.testID ?? n.props.accessibilityLabel ?? textOf(n).slice(0, 30) ?? n.props.accessibilityRole;
    const label = n.props.accessibilityLabel ?? n.props['aria-label'] ?? textOf(n).trim();
    if (!label) issues.push(`unlabelled touch target (${n.props.accessibilityRole ?? 'no role'})`);
    const s = (StyleSheet.flatten(n.props.style) ?? {}) as Record<string, unknown>;
    const slop = slopOf(n.props.hitSlop);
    const h = [s.height, s.minHeight].find((v) => typeof v === 'number') as number | undefined;
    const w = [s.width, s.minWidth].find((v) => typeof v === 'number') as number | undefined;
    if (h !== undefined && h + slop.top + slop.bottom < MIN) issues.push(`${id}: height ${h}+slop < ${MIN}`);
    if (w !== undefined && w + slop.left + slop.right < MIN) issues.push(`${id}: width ${w}+slop < ${MIN}`);
  }
  return issues;
}
