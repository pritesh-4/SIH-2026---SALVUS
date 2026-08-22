import { triageIncident } from './triage.js'

const testMessages = [
  'My house is flooded and water is entering quickly.',
  'My grandmother is trapped inside the flooded house.',
  'There is a fire in the building.',
  'A tree has fallen and blocked the road.',
  'I need some information about the shelter.',
]

for (const message of testMessages) {
  console.log('\nREPORT:', message)
  console.log('TRIAGE:', triageIncident(message))
}
