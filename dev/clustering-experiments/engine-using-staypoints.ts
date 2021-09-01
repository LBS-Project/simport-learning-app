import { StayPoints } from 'src/app/model/staypoints'
import ownTrajectory from './input/own_trajectory.json'
import { StaypointDetector } from 'src/app/shared-services/staypoint/staypoint-detector'
import { Trajectory } from 'src/app/model/trajectory'
import { StaypointService } from 'src/app/shared-services/staypoint/staypoint.service'
import {
  inferHomeFromStayPoints,
  inferWorkFromStayPoints,
} from 'src/app/shared-services/staypoint/utils'

// run on unix
// cd ./dev/clustering-experiments
// ts-node -r tsconfig-paths/register ./engine-using-staypoints.ts

// run on non unix
// cd .\dev\clustering-experiments
// ts-node -r tsconfig-paths\register .\engine-using-staypoints.ts

async function main() {
  const detector = new StaypointDetector()

  const staypointdata = detector.detectStayPoints(
    Trajectory.fromJSON(ownTrajectory),
    StaypointService.DIST_THRESH_METERS,
    StaypointService.TIME_THRESH_MINUTES
  )
  const staypoints: StayPoints = {
    trajID: 'own_trajectory',
    coordinates: staypointdata.coordinates,
    starttimes: staypointdata.starttimes,
    endtimes: staypointdata.endtimes,
  }

  const homeInference = inferHomeFromStayPoints(staypoints)
  const workInference = inferWorkFromStayPoints(staypoints)
  console.log(homeInference)
  console.log(workInference)
}

main().catch((err) => console.error(err))
