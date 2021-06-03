import { __core_private_testing_placeholder__ } from '@angular/core/testing'
import { Point } from 'src/app/model/trajectory'
import { RunningInference } from '../definitions'
import {
  IInferenceScoring,
  InferenceScoringResult,
  InferenceScoringType,
} from './types'

export class SpeedScoring implements IInferenceScoring {
  public type: InferenceScoringType = InferenceScoringType.speed
  private maxSpeed = 9
  private minSpeed = 1.5

  score(cluster: Point[], allClusters: Point[][]): InferenceScoringResult {
    const RunningSpeedPoints = cluster.filter((p) => {
      return p.speed !== null ? this.isUsualRunningSpeed(p.speed) : false
    })
    const runningPointPercentage = RunningSpeedPoints.length / cluster.length
    return { type: this.type, value: runningPointPercentage }
  }

  private isUsualRunningSpeed(speed: number) {
    return this.isRunning(speed)
  }

  private isRunning(speed: number): boolean {
    return speed > this.minSpeed && speed < this.maxSpeed
  }
}
