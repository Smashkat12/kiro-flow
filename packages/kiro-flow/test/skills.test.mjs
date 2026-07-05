/**
 * kiro-flow skills — port ruflo skill playbooks onto Kiro's auto-loaded
 * .kiro/skills surface. Core logic on a synthetic fixture; one corpus-gated
 * guard that the curated SKILL_CORE names actually exist upstream.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  discoverSkills, installSkills, installedSkills, removeSkills,
  resolveSelection, SKILL_CORE, SKILL_SOURCE_REL, SKILL_DEST_REL,
} from '../src/convert/skills.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const CORPUS_SKILLS = join(here, '..', '..', '..', 'reference', 'ruflo', '.claude', 'skills');
const hasCorpus = existsSync(CORPUS_SKILLS);

/** A workspace with a .claude/skills source holding two fake skills. */
function seed() {
  const dir = mkdtempSync(join(tmpdir(), 'kf-skills-'));
  const src = join(dir, SKILL_SOURCE_REL);
  for (const [name, desc] of [['alpha-skill', 'does alpha'], ['beta-skill', 'does beta']]) {
    mkdirSync(join(src, name), { recursive: true });
    writeFileSync(join(src, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${desc}\n---\n\nbody for ${name}\n`);
  }
  // a stray dir without SKILL.md must be ignored
  mkdirSync(join(src, 'not-a-skill'), { recursive: true });
  writeFileSync(join(src, 'not-a-skill', 'README.md'), 'nope');
  return dir;
}

test('discoverSkills: only dirs with a SKILL.md, with description + token estimate', () => {
  const dir = seed();
  try {
    const found = discoverSkills(join(dir, SKILL_SOURCE_REL));
    assert.deepEqual(found.map((s) => s.name), ['alpha-skill', 'beta-skill']);
    assert.equal(found[0].description, 'does alpha');
    assert.ok(found[0].tokens > 0, 'token estimate computed');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('install → installedSkills → remove round-trips, copying the whole dir', () => {
  const dir = seed();
  try {
    const { installed, missing, tokens } = installSkills({ dir, names: ['alpha-skill', 'ghost'] });
    assert.deepEqual(installed, ['alpha-skill']);
    assert.deepEqual(missing, ['ghost']);
    assert.ok(tokens > 0);
    assert.ok(existsSync(join(dir, SKILL_DEST_REL, 'alpha-skill', 'SKILL.md')), 'SKILL.md copied');
    assert.deepEqual(installedSkills(dir), ['alpha-skill']);

    const removed = removeSkills({ dir, names: ['alpha-skill'] });
    assert.deepEqual(removed, ['alpha-skill']);
    assert.deepEqual(installedSkills(dir), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('resolveSelection: names, --all, and --core intersect with what is available', () => {
  const available = [{ name: 'alpha-skill' }, { name: 'beta-skill' }];
  assert.deepEqual(resolveSelection({ names: ['beta-skill'] }, available), ['beta-skill']);
  assert.deepEqual(resolveSelection({ all: true }, available).sort(), ['alpha-skill', 'beta-skill']);
  // core filters to present names only (none of SKILL_CORE are in this fake set)
  assert.deepEqual(resolveSelection({ core: true }, available), []);
});

test('SKILL_CORE names all exist in the upstream skill corpus', { skip: !hasCorpus }, () => {
  const names = new Set(discoverSkills(CORPUS_SKILLS).map((s) => s.name));
  for (const n of SKILL_CORE) assert.ok(names.has(n), `curated core skill ${n} missing from upstream corpus`);
});
