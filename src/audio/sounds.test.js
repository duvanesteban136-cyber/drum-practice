import { describe, it, expect } from 'vitest'
import { SOUNDS, renderSample, createSoundBank } from './sounds.js'

const peak = (a) => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0)

describe('SOUNDS', () => {
  it('lists the eight sounds with Spanish labels', () => {
    expect(SOUNDS.map((s) => s.id)).toEqual(['click', 'wood', 'rim', 'hat', 'cowbell', 'kick', 'beep', 'countin'])
    expect(SOUNDS.find((s) => s.id === 'wood').label).toBe('Madera')
    expect(SOUNDS.find((s) => s.id === 'countin').label).toBe('Conteo')
  })
})

describe('renderSample', () => {
  for (const { id } of SOUNDS) {
    it(`${id}: short, loud enough, never clipping, sharp attack`, () => {
      const x = renderSample(id, 48000)
      expect(x).toBeInstanceOf(Float32Array)
      expect(x.length).toBeGreaterThan(0)
      expect(x.length).toBeLessThanOrEqual(12000)
      const p = peak(x)
      expect(p).toBeLessThanOrEqual(0.95)
      expect(p).toBeGreaterThan(0.2)
      expect(peak(x.subarray(0, 96))).toBeGreaterThanOrEqual(0.8 * p)
    })

    it(`${id}: stays within limits at accent and soft pitches`, () => {
      for (const pitch of [1.5, 0.8]) {
        const x = renderSample(id, 44100, pitch)
        expect(x.length).toBeLessThanOrEqual(11025)
        expect(peak(x)).toBeLessThanOrEqual(0.95)
        expect(peak(x)).toBeGreaterThan(0.2)
        expect(Array.from(x).every(Number.isFinite)).toBe(true)
      }
    })
  }

  it('is deterministic', () => {
    for (const { id } of SOUNDS) {
      expect(Array.from(renderSample(id, 48000, 1.5))).toEqual(Array.from(renderSample(id, 48000, 1.5)))
    }
  })

  it('pitch changes the output', () => {
    const a = renderSample('hat', 48000, 1)
    const b = renderSample('hat', 48000, 1.5)
    expect(Array.from(a)).not.toEqual(Array.from(b))
  })

  it('falls back to click for unknown ids', () => {
    expect(Array.from(renderSample('nope', 48000))).toEqual(Array.from(renderSample('click', 48000)))
  })

  it('sounds are distinct from each other', () => {
    const click = Array.from(renderSample('click', 48000))
    expect(Array.from(renderSample('wood', 48000))).not.toEqual(click)
    expect(Array.from(renderSample('countin', 48000))).not.toEqual(Array.from(renderSample('beep', 48000)))
  })
})

describe('createSoundBank', () => {
  const fakeAc = {
    sampleRate: 48000,
    createBuffer(channels, length, sampleRate) {
      const data = new Float32Array(length)
      return { numberOfChannels: channels, length, sampleRate, data, copyToChannel: (src) => data.set(src) }
    },
  }

  it('builds accent/normal/soft buffers for every sound', () => {
    const bank = createSoundBank(fakeAc)
    expect(bank).toBeInstanceOf(Map)
    expect([...bank.keys()]).toEqual(SOUNDS.map((s) => s.id))
    for (const id of bank.keys()) {
      const { accent, normal, soft } = bank.get(id)
      for (const buf of [accent, normal, soft]) {
        expect(buf.numberOfChannels).toBe(1)
        expect(buf.sampleRate).toBe(48000)
        expect(buf.length).toBeGreaterThan(0)
      }
      expect(Array.from(normal.data)).toEqual(Array.from(renderSample(id, 48000, 1)))
      expect(Array.from(accent.data)).toEqual(Array.from(renderSample(id, 48000, 1.5)))
      expect(Array.from(soft.data)).toEqual(Array.from(renderSample(id, 48000, 0.8)))
    }
  })
})
