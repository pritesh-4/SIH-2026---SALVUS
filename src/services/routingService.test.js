import test from 'node:test'
import assert from 'node:assert/strict'
import {
  haversineDistanceKm,
  hasSignificantlyMoved,
  formatEta,
  generateFallbackCorridor,
  RouteManager,
} from './routingService.js'

test('Routing Service - haversineDistanceKm accuracy', () => {
  // Coordinates for Howrah Bridge (22.5851, 88.3468) to Victoria Memorial (22.5448, 88.3426)
  const dist = haversineDistanceKm(22.5851, 88.3468, 22.5448, 88.3426)
  assert.ok(dist >= 4.4 && dist <= 4.6, `Distance should be ~4.5km, got ${dist}`)

  // Zero distance for identical points
  assert.equal(haversineDistanceKm(22.5, 88.3, 22.5, 88.3), 0)
})

test('Routing Service - hasSignificantlyMoved threshold check', () => {
  // ~10m delta
  const isMoved10m = hasSignificantlyMoved(22.5, 88.3, 22.50009, 88.3, 30)
  assert.equal(isMoved10m, false)

  // ~100m delta
  const isMoved100m = hasSignificantlyMoved(22.5, 88.3, 22.5009, 88.3, 30)
  assert.equal(isMoved100m, true)
})

test('Routing Service - formatEta readable duration', () => {
  assert.equal(formatEta(20), '1 min')
  assert.equal(formatEta(180), '3 min')
  assert.equal(formatEta(3600), '1 hr')
  assert.equal(formatEta(4500), '1 hr 15 min')
})

test('Routing Service - generateFallbackCorridor structure', () => {
  const corridor = generateFallbackCorridor(22.5, 88.3, 22.55, 88.35, 'boat')
  assert.ok(corridor)
  assert.equal(corridor.status, 'FALLBACK_CORRIDOR')
  assert.equal(corridor.is_fallback, true)
  assert.ok(corridor.distance_km > 0)
  assert.ok(corridor.coordinates.length >= 10)
})

test('Routing Service - RouteManager sequence management & micro-movement caching', async () => {
  const rm = new RouteManager(30)
  assert.equal(rm.currentSeq, 0)

  // First calculation
  const res1 = await rm.calculateRoute(22.5, 88.3, 22.55, 88.35, 'driving')
  assert.ok(res1.success)
  assert.equal(rm.currentSeq, 1)

  // Micro-movement (< 30m) returns cached route without incrementing sequence
  const res2 = await rm.calculateRoute(22.50005, 88.30005, 22.55, 88.35, 'driving')
  assert.ok(res2.success)
  assert.equal(res2.isCached, true)
  assert.equal(rm.currentSeq, 1)

  // Significant movement (> 30m) computes new route and increments sequence
  const res3 = await rm.calculateRoute(22.51, 88.31, 22.55, 88.35, 'driving')
  assert.ok(res3.success)
  assert.equal(rm.currentSeq, 2)

  rm.clear()
  assert.equal(rm.currentSeq, 0)
})
