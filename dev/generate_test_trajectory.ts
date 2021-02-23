const USAGE = `ts-node --dir dev generate_test_trajectory.ts <gpx-file-home> <gpx-file-home-to-work> <gpx-file-work> <gpx-file-work-to-home>`

import * as fs from 'fs'
import * as GPX from 'gpx-parse'
import * as path from 'path'
import { Trajectory, TrajectoryType } from '../src/app/model/trajectory'

function argparse() {
  const args = process.argv.slice(2)
  if (args.length !== 4) {
    console.error(`usage: ${USAGE}`)
    process.exit(1)
  }
  const [
    filepath_home,
    filepath_home_to_work,
    filepath_work,
    filepath_work_to_home,
  ] = args
  return {
    filepath_home,
    filepath_home_to_work,
    filepath_work,
    filepath_work_to_home,
  }
}

type Parser = (
  id: string,
  placename: string,
  data: string
) => Promise<Trajectory>

function getParser(input: string): Parser {
  return (id, placename, input) => {
    return new Promise((resolve, reject) => {
      GPX.parseGpx(input, (err, parsed) => {
        if (err) return reject(err)
        const coordinates = []
        const timestamps = []
        for (const track of parsed.tracks) {
          for (const waypoints of track.segments) {
            for (const { lat, lon, time } of waypoints) {
              coordinates.push([lat, lon])
              timestamps.push(time)
            }
          }
        }
        const meta = { id, placename, type: TrajectoryType.EXAMPLE }
        const data = { coordinates, timestamps }
        resolve(new Trajectory(meta, data))
      })
    })
  }
}

function createCluster(
  trajectory: Trajectory,
  numberPoints: number = 30,
  radius: number = 15
): Trajectory {
  const seed = trajectory.coordinates[trajectory.coordinates.length - 1]
  for (var i: number = 0; i < numberPoints; i++) {
    const rand = randomGeo(seed[0], seed[1], radius)
    trajectory.coordinates.push([rand.latitude, rand.longitude])
    trajectory.timestamps.push(null)
  }
  return trajectory
}

function randomGeo(
  latitude: number,
  longitude: number,
  radiusInMeters: number
) {
  var y0 = latitude
  var x0 = longitude
  var rd = radiusInMeters / 111300

  var u = Math.random()
  var v = Math.random()

  var w = rd * Math.sqrt(u)
  var t = 2 * Math.PI * v
  var x = w * Math.cos(t)
  var y = w * Math.sin(t)

  return {
    latitude: y + y0,
    longitude: x + x0,
  }
}

function exportToCsv(trajectories: Trajectory[]) {
  let csvContent = 'latitude,longitude,timestamp\n'
  trajectories.forEach((trajectory) => {
    csvContent += trajectory.coordinates
      .map((c, i) => {
        return [c[0], c[1], trajectory.timestamps[i]].join(',')
      })
      .join('\n')
    csvContent += '\n'
  })
  fs.writeFile('trajectory.csv', csvContent, function (error) {
    if (error) return console.log(error)
  })
}

function loadTrajectoryFromGpxFile(filepath: string): Promise<Trajectory> {
  const ext = path.extname(filepath)
  if (ext != '.gpx') throw new Error('unsupported format: gpx expected')

  const id = path.basename(filepath, ext)
  const content = fs.readFileSync(filepath, { encoding: 'utf-8' })
  const parser = getParser(ext)
  return parser(id, id, content)
}

async function main() {
  const {
    filepath_home,
    filepath_home_to_work,
    filepath_work,
    filepath_work_to_home,
  } = argparse()
  let trajectory_home = await loadTrajectoryFromGpxFile(filepath_home)
  let trajectory_home_to_work = await loadTrajectoryFromGpxFile(
    filepath_home_to_work
  )
  let trajectory_work = await loadTrajectoryFromGpxFile(filepath_work)
  let trajectory_work_to_home = await loadTrajectoryFromGpxFile(
    filepath_work_to_home
  )
  trajectory_home = createCluster(trajectory_home)
  trajectory_work = createCluster(trajectory_work)
  exportToCsv([
    trajectory_home,
    trajectory_home_to_work,
    trajectory_work_to_home,
    trajectory_work,
  ])
}

main().catch((err) => console.error(err))