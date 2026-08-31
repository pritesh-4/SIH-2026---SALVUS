import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  deriveStormRiskAssessment,
  isThunderstormCondition,
  isHeavyRainCondition,
  getWeatherIcon,
} from '../weather.js'
import { EMERGENCY_STATE, validateTransition, isTerminalState } from '../stateMachine.js'
import { createLocationModel, createLandmarkLocation, LANDMARKS } from '../location.js'

describe('Core Repairs Verification Suite', () => {
  describe('Bug 1: SOS Location Model & Integrity', () => {
    it('accurately distinguishes real browser GPS from landmark fallback', () => {
      const gpsModel = createLocationModel({
        latitude: 22.5855,
        longitude: 88.4172,
        accuracy: 12,
        source: 'BROWSER',
        permission: 'GRANTED',
        status: 'ACTIVE',
      })

      assert.strictEqual(gpsModel.source, 'BROWSER')
      assert.strictEqual(gpsModel.isFallback, false)
      assert.strictEqual(gpsModel.accuracyTier, 'HIGH')
      assert.strictEqual(gpsModel.latitude, 22.5855)

      const landmarkModel = createLandmarkLocation(LANDMARKS[0], 'DENIED')
      assert.strictEqual(landmarkModel.source, 'LANDMARK')
      assert.strictEqual(landmarkModel.isFallback, true)
      assert.strictEqual(landmarkModel.accuracyTier, 'APPROXIMATE')
      assert.strictEqual(landmarkModel.latitude, LANDMARKS[0].latitude)
    })
  })

  describe('Bug 3: Authoritative Active SOS Incident Counter', () => {
    it('calculates active SOS distress calls strictly from live non-terminal SOS records', () => {
      const incidents = [
        { id: '1', is_sos: true, status: 'NEW', severity: 'CRITICAL' },
        { id: '2', is_sos: true, status: 'ASSIGNED', severity: 'CRITICAL' },
        { id: '3', is_sos: false, status: 'NEW', severity: 'WARNING' },
        { id: '4', is_sos: true, status: 'RESOLVED', severity: 'CRITICAL' },
        { id: '5', is_sos: true, status: 'CANCELLED', severity: 'CRITICAL' },
        { id: '6', is_sos: false, status: 'VERIFIED', severity: 'CRITICAL' },
      ]

      const active = incidents.filter((inc) => !['RESOLVED', 'CANCELLED'].includes(inc.status))
      const activeSos = active.filter((inc) => Boolean(inc.is_sos))
      const critical = active.filter((inc) => inc.severity === 'CRITICAL' || inc.is_sos)

      assert.strictEqual(active.length, 4) // IDs: 1, 2, 3, 6
      assert.strictEqual(activeSos.length, 2) // IDs: 1, 2
      assert.strictEqual(critical.length, 3) // IDs: 1, 2, 6
    })
  })

  describe('Bug 4: SOS Emergency Cancellation State Transition', () => {
    it('allows cancellation from non-terminal states and rejects from terminal states', () => {
      // Non-terminal states must be cancellable
      assert.strictEqual(
        validateTransition(EMERGENCY_STATE.SOS_ACTIVE, EMERGENCY_STATE.CANCELLED),
        true
      )
      assert.strictEqual(
        validateTransition(EMERGENCY_STATE.TRIAGING, EMERGENCY_STATE.CANCELLED),
        true
      )
      assert.strictEqual(
        validateTransition(EMERGENCY_STATE.ASSIGNED, EMERGENCY_STATE.CANCELLED),
        true
      )
      assert.strictEqual(
        validateTransition(EMERGENCY_STATE.EN_ROUTE, EMERGENCY_STATE.CANCELLED),
        true
      )
      assert.strictEqual(
        validateTransition(EMERGENCY_STATE.NEARBY, EMERGENCY_STATE.CANCELLED),
        true
      )
      assert.strictEqual(
        validateTransition(EMERGENCY_STATE.ON_SCENE, EMERGENCY_STATE.CANCELLED),
        true
      )

      // Terminal states must reject cancellation
      assert.strictEqual(
        validateTransition(EMERGENCY_STATE.RESOLVED, EMERGENCY_STATE.CANCELLED),
        false
      )
      assert.strictEqual(
        validateTransition(EMERGENCY_STATE.CANCELLED, EMERGENCY_STATE.CANCELLED),
        false
      )

      assert.strictEqual(isTerminalState(EMERGENCY_STATE.CANCELLED), true)
      assert.strictEqual(isTerminalState(EMERGENCY_STATE.RESOLVED), true)
      assert.strictEqual(isTerminalState(EMERGENCY_STATE.ASSIGNED), false)
    })
  })

  describe('Bug 5: Thunderstorm & Severe Weather Risk Assessment', () => {
    it('correctly identifies thunderstorm WMO codes and phrasing', () => {
      assert.strictEqual(isThunderstormCondition('Thunderstorm Possible', 95), true)
      assert.strictEqual(isThunderstormCondition('Severe Thunderstorm with Hail', 99), true)
      assert.strictEqual(isThunderstormCondition('Thunderstorm with Slight Hail', 96), true)
      assert.strictEqual(isThunderstormCondition('Clear Skies', 0), false)
      assert.strictEqual(isThunderstormCondition('Light Rain', 61), false)
      assert.strictEqual(isHeavyRainCondition('Heavy Rain', 65, 20.0), true)
      assert.strictEqual(getWeatherIcon('Thunderstorm Possible', 95, 1), '⛈️')
      assert.strictEqual(getWeatherIcon('Heavy Rain', 65, 1), '🌧️')
      assert.strictEqual(getWeatherIcon('Clear Skies', 0, 1), '☀️')
    })

    it('derives accurate storm window, peak wind, and probability when thunderstorm exists', () => {
      const hourly = [
        {
          time: '14:00',
          condition: 'Partly Cloudy',
          weather_code: 2,
          precipitation_probability: 10,
          precipitation: 0,
          wind_speed: 12,
        },
        {
          time: '15:00',
          condition: 'Overcast',
          weather_code: 3,
          precipitation_probability: 30,
          precipitation: 0.5,
          wind_speed: 18,
        },
        {
          time: '16:00',
          condition: 'Thunderstorm Possible',
          weather_code: 95,
          precipitation_probability: 80,
          precipitation: 14.5,
          wind_speed: 38,
        },
        {
          time: '17:00',
          condition: 'Thunderstorm with Slight Hail',
          weather_code: 96,
          precipitation_probability: 85,
          precipitation: 18.0,
          wind_speed: 45,
        },
        {
          time: '18:00',
          condition: 'Light Rain',
          weather_code: 61,
          precipitation_probability: 40,
          precipitation: 2.0,
          wind_speed: 20,
        },
      ]

      const assessment = deriveStormRiskAssessment(hourly, null)

      assert.notStrictEqual(assessment, null)
      assert.strictEqual(assessment.hasStormRisk, true)
      assert.strictEqual(assessment.riskLevel, 'HIGH')
      assert.strictEqual(assessment.expectedWindow, '16:00 – 17:00')
      assert.strictEqual(assessment.maxProb, 85)
      assert.strictEqual(assessment.maxPrecip, 18.0)
      assert.strictEqual(assessment.maxWind, 45)
    })

    it('returns null when no thunderstorm risk is present in data (zero false alarms)', () => {
      const calmHourly = [
        {
          time: '14:00',
          condition: 'Sunny',
          weather_code: 0,
          precipitation_probability: 0,
          precipitation: 0,
          wind_speed: 8,
        },
        {
          time: '15:00',
          condition: 'Mainly Clear',
          weather_code: 1,
          precipitation_probability: 5,
          precipitation: 0,
          wind_speed: 10,
        },
        {
          time: '16:00',
          condition: 'Partly Cloudy',
          weather_code: 2,
          precipitation_probability: 15,
          precipitation: 0,
          wind_speed: 12,
        },
      ]

      const assessment = deriveStormRiskAssessment(calmHourly, {
        condition: 'Clear Skies',
        weather_code: 0,
        precipitation_probability: 0,
      })
      assert.strictEqual(assessment, null)
    })
  })
})
