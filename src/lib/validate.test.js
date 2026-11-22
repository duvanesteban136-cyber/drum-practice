import { describe, it, expect } from 'vitest'
import { parseBpmInput, parseSecondsInput, clamp } from './validate.js'

describe('parseBpmInput', () => {
  it('handles empty', () => {
    expect(parseBpmInput('')).toEqual({ value: null, error: 'Escribe un BPM' })
  })
  it('range errors', () => {
    expect(parseBpmInput('15')).toEqual({ value: null, error: 'Entre 20 y 400' })
    expect(parseBpmInput('401')).toEqual({ value: null, error: 'Entre 20 y 400' })
  })
  it('accepts valid', () => {
    expect(parseBpmInput('150')).toEqual({ value: 150, error: null })
    expect(parseBpmInput(' 90 ')).toEqual({ value: 90, error: null })
  })
  it('non-integer', () => {
    expect(parseBpmInput('abc')).toEqual({ value: null, error: 'Solo números' })
    expect(parseBpmInput('90.5')).toEqual({ value: null, error: 'Solo números' })
  })
})

describe('parseSecondsInput', () => {
  it('range error', () => {
    expect(parseSecondsInput('5')).toEqual({ value: null, error: 'Entre 10 y 3600' })
  })
  it('empty, nan, valid, custom range', () => {
    expect(parseSecondsInput('')).toEqual({ value: null, error: 'Escribe los segundos' })
    expect(parseSecondsInput('x')).toEqual({ value: null, error: 'Solo números' })
    expect(parseSecondsInput('60')).toEqual({ value: 60, error: null })
    expect(parseSecondsInput('5', { min: 1, max: 9 })).toEqual({ value: 5, error: null })
  })
})

describe('clamp', () => {
  it('clamps', () => {
    expect(clamp(5, 1, 3)).toBe(3)
    expect(clamp(-1, 0, 3)).toBe(0)
    expect(clamp(2, 0, 3)).toBe(2)
  })
})
