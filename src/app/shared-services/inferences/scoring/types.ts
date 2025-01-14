import { Point } from 'src/app/model/trajectory'

export interface IInferenceScoring {
  type: InferenceScoringType
  score(cluster: Point[], allClusters: Point[][]): InferenceScoringResult
}

export type InferenceScoringConfig = {
  type: InferenceScoringType
  weight: number
  confidence: (score: number) => number
}

export type InferenceScoringResult = {
  type: InferenceScoringType
  value: number
}

export enum InferenceScoringType {
  running = 'running',
  speed = 'speed',
  spatialVariance = 'spatialVariance',
  temporalContinuity = 'temporalContinuity',
  pointCount = 'pointCount',
  nightness = 'nightness',
  workHours9to5 = 'workHours9to5',
}
