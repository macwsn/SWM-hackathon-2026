/**
 * STUB: Real Smelter SDK integration.
 *
 * TODO — replace VideoStreamMock with this service when Smelter is available.
 *
 * SETUP:
 * 1. docker run -p 8090:8090 ghcr.io/software-mansion/smelter
 * 2. npm install @smelter-dev/browser @smelter-dev/react
 *
 * REAL DATA EXPECTED:
 * - Smelter server running at SMELTER_URL
 * - Input: RTMP stream from user's phone (URL configured on Smelter server)
 * - Output: Composed video stream accessible via Smelter React components
 *
 * See: https://smelter.dev/docs/typescript-sdk/
 */

const SMELTER_URL = 'http://localhost:8090'

export class SmelterService {
  private initialized = false

  async initialize(): Promise<void> {
    // TODO:
    // import Smelter from '@smelter-dev/browser'
    // const smelter = new Smelter({ serverUrl: SMELTER_URL })
    // await smelter.init()
    // this.initialized = true
    throw new Error('Real Smelter not implemented — using VideoStreamMock')
  }

  isReady(): boolean {
    return this.initialized
  }
}

export const smelterService = new SmelterService()
