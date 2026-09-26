import { readdirSync, readFileSync } from 'fs';
import { relative, resolve } from 'path';
import * as ts from 'typescript';

// Content-scoping guardrail: every findMany on a tiered content table (a model
// with a contentSource column) must carry a scoping filter. Homebrew rows live
// in the same tables as SRD rows, so a bare prisma.<model>.findMany() pool load
// returns other users' private homebrew. That exact bug shipped more than once
// (VEG-296, VEG-335, VEG-431, VEG-537), each time from a read path nobody
// thought to scope. This spec scans the backend source at test time and fails
// on any unscoped call, so the rule does not depend on anyone remembering it.
//
// It checks intent, not correctness. A call counts as scoped when its
// arguments, or the nearest enclosing function, mention one of the scoping
// markers below. Whether the filter is the right one stays a review question.

const SRC = resolve(__dirname, '..');
const SCHEMA = resolve(__dirname, '..', '..', 'prisma', 'schema.prisma');

const SCOPING_MARKER =
  /contentSource|\.visibleTo\(|\.globalWhere\(|\.visibleSubclassWhere\(|\bid:\s*\{\s*in\b/;

interface Offender {
  line: number;
  text: string;
}

// Every `model X { ... }` block with a contentSource field, as the lower-camel
// Prisma client accessor (SrdClass becomes srdClass).
function tieredAccessors(schema: string): string[] {
  const models = schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm);
  return [...models]
    .filter(([, , body]) => /^\s*contentSource\s+ContentSource\b/m.test(body))
    .map(([, name]) => name.charAt(0).toLowerCase() + name.slice(1));
}

// Finds `<anything>.<tieredModel>.findMany(...)` calls with no scoping marker in
// their arguments or in the nearest enclosing function. The function fallback
// covers the common `const where = { ...visible }; findMany({ where })` shape.
// It stops at the first function-like ancestor, so a marker in a sibling method
// or an outer scope never rescues a call.
function findUnscopedFindMany(
  sourceText: string,
  fileName: string,
  tiered: ReadonlySet<string>
): Offender[] {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const offenders: Offender[] = [];

  const isTieredFindMany = (node: ts.CallExpression): boolean => {
    const callee = node.expression;
    return (
      ts.isPropertyAccessExpression(callee) &&
      callee.name.text === 'findMany' &&
      ts.isPropertyAccessExpression(callee.expression) &&
      tiered.has(callee.expression.name.text)
    );
  };

  const isScoped = (node: ts.CallExpression): boolean => {
    if (node.arguments.some(arg => SCOPING_MARKER.test(arg.getText(sourceFile)))) return true;
    let scope: ts.Node | undefined = node.parent;
    while (scope && !ts.isFunctionLike(scope)) scope = scope.parent;
    return scope !== undefined && SCOPING_MARKER.test(scope.getText(sourceFile));
  };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isTieredFindMany(node) && !isScoped(node)) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      offenders.push({ line: line + 1, text: node.getText(sourceFile) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return offenders;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
      ? [full]
      : [];
  });
}

describe('content-scoping guardrail', () => {
  const tiered = new Set(tieredAccessors(readFileSync(SCHEMA, 'utf-8')));

  // Re-tiering a model (adding or dropping its contentSource column) means
  // editing this list on purpose. Pinning it also means a parser regression
  // cannot quietly shrink the set of tables the guard covers. Race is untiered
  // by design, see the comment above model Race in schema.prisma.
  it('derives the tiered model set from schema.prisma', () => {
    expect([...tiered].sort()).toEqual([
      'background',
      'feat',
      'item',
      'monster',
      'spell',
      'srdClass',
      'subclass',
    ]);
  });

  describe('findUnscopedFindMany', () => {
    const check = (source: string) => findUnscopedFindMany(source, 'fixture.ts', tiered);

    it('flags a bare findMany on a tiered model', () => {
      const offenders = check(
        [
          'class Svc {',
          '  async load() {',
          '    return this.prisma.monster.findMany({ select: { id: true } });',
          '  }',
          '}',
        ].join('\n')
      );

      expect(offenders).toEqual([
        { line: 3, text: 'this.prisma.monster.findMany({ select: { id: true } })' },
      ]);
    });

    it('accepts a where shorthand built from visibleTo earlier in the method', () => {
      const offenders = check(`
        class Svc {
          async search(userId: string) {
            const visible = this.contentAccess.visibleTo(userId);
            const where = { ...visible };
            return this.prisma.feat.findMany({ where });
          }
        }
      `);

      expect(offenders).toEqual([]);
    });

    it('accepts an id-scoped where', () => {
      const offenders = check(`
        class Svc {
          async byIds(ids: string[]) {
            return this.prisma.spell.findMany({ where: { id: { in: ids } } });
          }
        }
      `);

      expect(offenders).toEqual([]);
    });

    it('flags a where shorthand when the method has no marker anywhere', () => {
      const offenders = check(`
        class Svc {
          async search(name: string) {
            const where = { name };
            return this.prisma.item.findMany({ where });
          }
        }
      `);

      expect(offenders).toHaveLength(1);
      expect(offenders[0].line).toBe(5);
    });

    it('ignores models without a contentSource column', () => {
      expect(check('prisma.race.findMany({});')).toEqual([]);
    });

    it('resolves a plain function declaration as the enclosing scope', () => {
      const offenders = check(`
        export async function backfill(prisma) {
          await prisma.monster.findMany({
            where: { contentSource: { in: ['srd', 'shared'] } },
          });
        }
      `);

      expect(offenders).toEqual([]);
    });

    it('does not let a marker in a sibling method rescue an unscoped call', () => {
      const offenders = check(
        [
          'class Svc {',
          '  async scoped(userId: string) {',
          '    return this.prisma.item.findMany({ where: this.contentAccess.visibleTo(userId) });',
          '  }',
          '  async bare() {',
          '    return this.prisma.item.findMany({});',
          '  }',
          '}',
        ].join('\n')
      );

      expect(offenders).toEqual([{ line: 6, text: 'this.prisma.item.findMany({})' }]);
    });

    it('ignores findFirst and count on tiered models', () => {
      expect(check('prisma.item.findFirst({});\nprisma.item.count();')).toEqual([]);
    });

    it('flags a bare top-level call with a non-prisma receiver', () => {
      expect(check('tx.subclass.findMany();')).toEqual([
        { line: 1, text: 'tx.subclass.findMany()' },
      ]);
    });
  });

  it('every findMany on a tiered model in backend/src carries a scoping filter', () => {
    const backendRoot = resolve(SRC, '..');
    const offenders = sourceFiles(SRC).flatMap(file =>
      findUnscopedFindMany(readFileSync(file, 'utf-8'), file, tiered).map(
        o => `${relative(backendRoot, file)}:${o.line}  ${o.text.split('\n')[0]}`
      )
    );

    expect(offenders).toEqual([]);
  });
});
