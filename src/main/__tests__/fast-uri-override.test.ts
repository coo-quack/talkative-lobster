import { createRequire } from 'node:module'
import Ajv from 'ajv'
import { describe, expect, it } from 'vitest'

interface FastUri {
  parse(uri: string): unknown
  serialize(components: unknown): string
  resolve(base: string, id: string): string
}

const ajvRequire = createRequire(require.resolve('ajv'))
const fastUri = ajvRequire('fast-uri') as FastUri
const fastUriVersion = (ajvRequire('fast-uri/package.json') as { version: string }).version
const ajvPackage = ajvRequire('ajv/package.json') as { dependencies: Record<string, string> }

function serialize(uri: string): string {
  return fastUri.serialize(fastUri.parse(uri))
}

function parseVersion(version: string): number[] {
  return version
    .split('.')
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10))
}

describe('fast-uri override contract with ajv', () => {
  it('keeps ajv on a fast-uri version inside the range ajv declares', () => {
    const declared = ajvPackage.dependencies['fast-uri']
    const caret = /^\^(\d+)\.(\d+)\.(\d+)/.exec(declared)
    expect(caret, `unsupported ajv dependency spec: ${declared}`).not.toBeNull()

    const [floorMajor, floorMinor, floorPatch] = (caret as RegExpExecArray).slice(1).map(Number)
    const [major, minor, patch] = parseVersion(fastUriVersion)

    if (major !== floorMajor) {
      throw new Error(
        `ajv declares fast-uri "${declared}" but resolves ${fastUriVersion}. ` +
          'The pnpm-workspace.yaml override moved ajv onto a major the parent never asked for. ' +
          'If a major is required, upgrade ajv itself instead of widening the override.'
      )
    }

    const aboveFloor = minor > floorMinor || (minor === floorMinor && patch >= floorPatch)
    expect(
      aboveFloor,
      `fast-uri ${fastUriVersion} is below ajv's declared floor "${declared}"`
    ).toBe(true)
  })
})

describe('fast-uri URI semantics ajv relies on', () => {
  it('collapses dot segments in paths', () => {
    expect(serialize('https://x.test/a/b/../c.json')).toBe('https://x.test/a/c.json')
    expect(serialize('https://x.test/a/./b.json')).toBe('https://x.test/a/b.json')
  })

  it('preserves empty path segments produced by double slashes', () => {
    expect(serialize('https://x.test/a//b.json')).toBe('https://x.test/a//b.json')
  })

  it('percent-encodes spaces and keeps existing encodings stable', () => {
    expect(serialize('https://x.test/a b.json')).toBe('https://x.test/a%20b.json')
    expect(serialize('https://x.test/a%20b.json')).toBe('https://x.test/a%20b.json')
    expect(serialize('https://x.test/a%2Fb.json')).toBe('https://x.test/a%2Fb.json')
    expect(serialize('https://x.test/a*b.json')).toBe('https://x.test/a*b.json')
    expect(serialize('https://x.test/a+b.json')).toBe('https://x.test/a+b.json')
  })

  it('normalizes non-ASCII ids to pure ASCII and stays idempotent', () => {
    const once = serialize('https://x.test/日本/スキーマ.json')
    const twice = serialize(once)
    expect(twice).toBe(once)
    expect(once).toMatch(/^[\x20-\x7E]*$/)
  })

  it('agrees between serialize and resolve for relative schema ids', () => {
    expect(fastUri.resolve('https://x.test/root.json#', 'sub dir.json')).toBe(
      'https://x.test/sub%20dir.json'
    )
    expect(fastUri.resolve('https://x.test/a/b/root.json#', '../up.json')).toBe(
      'https://x.test/a/up.json'
    )
    expect(fastUri.resolve('https://x.test/a/b/root.json#', 'a*b.json')).toBe(
      'https://x.test/a/b/a*b.json'
    )
  })
})

describe('ajv $ref resolution through the overridden fast-uri', () => {
  it('resolves a subschema id containing a space', () => {
    const ajv = new Ajv({ strict: false })
    ajv.addSchema({
      $id: 'https://x.test/root.json',
      definitions: { s: { $id: 'sub dir.json', type: 'number' } }
    })
    const validate = ajv.compile({ $ref: 'https://x.test/sub%20dir.json' })
    expect(validate(123)).toBe(true)
    expect(validate('no')).toBe(false)
  })

  it('resolves a subschema id that climbs with dot segments', () => {
    const ajv = new Ajv({ strict: false })
    ajv.addSchema({
      $id: 'https://x.test/a/root.json',
      definitions: { s: { $id: '../up.json', type: 'number' } }
    })
    const validate = ajv.compile({ $ref: 'https://x.test/up.json' })
    expect(validate(123)).toBe(true)
    expect(validate('no')).toBe(false)
  })

  it('resolves a schema id containing an asterisk', () => {
    const ajv = new Ajv({ strict: false })
    ajv.addSchema({ $id: 'https://x.test/a*b.json', type: 'number' })
    const validate = ajv.compile({ $ref: 'https://x.test/a*b.json' })
    expect(validate(123)).toBe(true)
    expect(validate('no')).toBe(false)
  })
})
