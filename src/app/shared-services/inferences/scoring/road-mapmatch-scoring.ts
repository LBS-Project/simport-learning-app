import { Point } from 'src/app/model/trajectory'
import {
  IInferenceScoring,
  InferenceScoringResult,
  InferenceScoringType,
} from './types'

export class RoadMapMatchScoring implements IInferenceScoring {
  public type: InferenceScoringType = InferenceScoringType.running
  private maxSpeed = 8
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
