import { Point, TrajectoryData } from 'src/app/model/trajectory'
import { Inference } from 'src/app/model/inference'
import {
  IInferenceEngine,
  InferenceDefinition,
  InferenceResult,
  InferenceResultStatus,
} from './types'
import { NightnessScoring } from './scoring/nightness-scoring'
import { IInferenceScoring, InferenceScoringResult } from './scoring/types'
import { WorkHoursScoring } from './scoring/work-hours-scoring'
import { PointCountScoring } from './scoring/pointcount-scoring'
import { RoadMapMatchScoring } from './scoring/road-mapmatch-scoring'
import { SpeedScoring } from './scoring/speed-scoring'

import clustering from 'density-clustering'
import haversine from 'haversine-distance'
import { point } from 'leaflet'

export class SimpleEngine implements IInferenceEngine {
  scorings: IInferenceScoring[] = [
    new NightnessScoring(),
    new WorkHoursScoring(),
    new PointCountScoring(),
  ]

  Runningscorings: IInferenceScoring[] = [
    new RoadMapMatchScoring(),
    new SpeedScoring(),
  ]

  private inputCoordinatesLimit = 100000

  infer(
    trajectory: TrajectoryData,
    inferences: InferenceDefinition[]
  ): InferenceResult {
    if (trajectory.coordinates.length > this.inputCoordinatesLimit) {
      return {
        status: InferenceResultStatus.tooManyCoordinates,
        inferences: [],
      }
    }

    // cluster data
    const result = this.cluster(trajectory)
    // convert cluster of indices to cluster of Point objects
    const pointClusters = this.indexClustersToPointClusters(
      result.clusters,
      trajectory
    )

    const inferenceResults: Inference[] = []
    // for each cluster...
    pointClusters.forEach((cluster) => {
      // check all inferences...
      inferences.forEach((inference) => {
        // by applying the scoring functions of the engine...
        const inferenceScores: InferenceScoringResult[] = []
        this.scorings.forEach((scoring) => {
          // and then apply scorings
          const score = scoring.score(cluster, pointClusters)
          inferenceScores.push(score)
        })
        // interpret scorings
        const inferenceResult = this.interpretInferenceScores(
          inference,
          inferenceScores,
          cluster
        )
        if (inferenceResult !== null) {
          inferenceResults.push(inferenceResult)
        }
      })
    })

    return {
      status: InferenceResultStatus.successful,
      inferences: inferenceResults,
    }
  }

  inferRunning(
    trajectory: TrajectoryData,
    inferences: InferenceDefinition[]
  ): InferenceResult {
    if (trajectory.coordinates.length > this.inputCoordinatesLimit) {
      return {
        status: InferenceResultStatus.tooManyCoordinates,
        inferences: [],
      }
    }
    
    this.SpeedFilter(trajectory)
    // trajectory coordinates data
    const result = this.cluster_speed(trajectory)
    console.log(result)
    const pointClusters = this.indexClustersToPointClusters(
      result.clusters,
      trajectory
    )
    const inferenceResults: Inference[] = []

    // for each cluster...
    pointClusters.forEach((cluster) => {
      // check all inferences...
      inferences.forEach((inference) => {
        // by applying the scoring functions of the engine...
        const inferenceScores: InferenceScoringResult[] = []
        this.Runningscorings.forEach((scoring) => {
          // and then apply scorings
          const score = scoring.score(cluster, pointClusters)
          inferenceScores.push(score)
        })
        // interpret scorings
        const inferenceResult = this.interpretInferenceScores(
          inference,
          inferenceScores,
          cluster
        )
        if (inferenceResult !== null) {
          inferenceResults.push(inferenceResult)
        }
      })
    })

    return {
      status: InferenceResultStatus.successful,
      inferences: inferenceResults,
    }
  }

  private interpretInferenceScores(
    inferenceDef: InferenceDefinition,
    scoringResults: InferenceScoringResult[],
    cluster: Point[]
  ): Inference {
    const confidences: { confidence: number; weight: number }[] = []
    scoringResults.forEach((scoringResult) => {
      const config = inferenceDef.getScoringConfig(scoringResult.type)
      if (config !== null) {
        let confidence = config.confidence(scoringResult.value)
        if (isNaN(confidence) || confidence === undefined) {
          confidence = 0
        }
        const scoringConfidence = {
          confidence: confidence,
          weight: config.weight,
        }
        confidences.push(scoringConfidence)
      }
    })
    let confidence = 0
    const sumWeights = confidences.reduce((p, c) => p + c.weight, 0)
    if (confidences.length > 0 && sumWeights > 0) {
      confidence =
        confidences.reduce((p, c) => p + c.confidence * c.weight, 0) /
        sumWeights
    }

    const centroid = this.calculateCentroid(cluster)

    return {
      name: inferenceDef.type,
      type: inferenceDef.type,
      description: 'TODO',
      trajectoryId: 'TODO',
      lonLat: [centroid.centerPoint.latLng[1], centroid.centerPoint.latLng[0]],
      confidence,
      accuracy: centroid.maxDistance,
    }
  }

  private calculateCentroid(
    cluster: Point[]
  ): { centerPoint: Point; maxDistance: number } {
    // simple sample centroid calulation
    if (cluster.length === 0) {
      return null
    }
    const latLng = cluster.map((p) => p.latLng)
    const centerLat =
      latLng.map((p) => p[0]).reduce((a, b) => a + b) / latLng.length
    const centerLng =
      latLng.map((p) => p[1]).reduce((a, b) => a + b) / latLng.length
    const centerPoint: Point = { latLng: [centerLat, centerLng] }
    const maxDistance = Math.max.apply(
      Math,
      cluster.map((p) =>
        this.computeHaversineDistance(centerPoint.latLng, p.latLng)
      )
    )
    return { centerPoint, maxDistance }
  }

  private cluster(trajectory: TrajectoryData) {
    const dbscan = new clustering.DBSCAN()
    // parameters: neighborhood radius, number of points in neighborhood to form a cluster
    const clusters = dbscan.run(
      trajectory.coordinates,
      11,
      7,
      this.computeHaversineDistance
    )

    return { clusters, noise: dbscan.noise }
  }

  private cluster_speed(trajectory: TrajectoryData) {
    const dbscan = new clustering.DBSCAN()
    // parameters: neighborhood radius, number of points in neighborhood to form a cluster
    const clusters = dbscan.run(
      trajectory.coordinates,
      9,
      2,
      this.computeHaversineDistance
    )
    console.log(clusters)

    return { clusters, noise: dbscan.noise }
  }
  private computeHaversineDistance(firstCoordinate, secondCoordinate): number {
    const a = { latitude: firstCoordinate[0], longitude: firstCoordinate[1] }
    const b = { latitude: secondCoordinate[0], longitude: secondCoordinate[1] }
    return haversine(a, b)
  }

  private indexClustersToPointClusters(
    clusters: [[number]],
    trajectory: TrajectoryData
  ): Point[][] {
    return clusters.map((cluster) => {
      return cluster.map((coordinateIndex) => {
        return {
          latLng: [
            trajectory.coordinates[coordinateIndex][0],
            trajectory.coordinates[coordinateIndex][1],
          ],
          time: trajectory.timestamps[coordinateIndex],
          accuracy: trajectory.accuracy
            ? trajectory.accuracy[coordinateIndex]
            : null,
          speed: trajectory.speed ? trajectory.speed[coordinateIndex] : null,
        }
      })
    })
  }

  private SpeedFilter(trajectory: TrajectoryData) {
    //const filtered_trajectory: TrajectoryData
    let n = 0
    let x = 0
    let listTodelete = []
    
    for (var i of trajectory.speed) {
      if (i < 1.5 || i > 9) {
       listTodelete.push(x) ;x += 1}
      else{
        x += 1
      } 
      }
    
      for (var index of listTodelete){
        trajectory.speed.splice(index-n,1) ;
        trajectory.coordinates.splice(index-n,1); n+=1
      }; 
  }
}
