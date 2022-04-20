import { Injectable, OnDestroy } from '@angular/core'
import {
  BackgroundGeolocation,
  BackgroundGeolocationAuthorizationStatus,
  BackgroundGeolocationConfig,
  BackgroundGeolocationEvents,
} from '@ionic-native/background-geolocation/ngx'
import { AlertController, Platform } from '@ionic/angular'
import { BehaviorSubject, Subscription } from 'rxjs'
import { Trajectory, TrajectoryType, PointState } from '../../model/trajectory'
import { SqliteService } from './../db/sqlite.service'
import { InferenceService } from './../inferences/inference.service'
import { NotificationService } from './../notification/notification.service'
import { NotificationType } from './../notification/types'
import { Plugins } from '@capacitor/core'
import { TranslateService } from '@ngx-translate/core'
import { LocationTrackingStatus } from '../../model/location-tracking'

const { App } = Plugins
@Injectable()
export class LocationService implements OnDestroy {
  private config: BackgroundGeolocationConfig = {
    desiredAccuracy: 10,
    stationaryRadius: 20,
    distanceFilter: 30,
    interval: 20000,
    fastestInterval: 5000,
    debug: false, // NOTE: Disabled because of https://github.com/mauron85/cordova-plugin-background-geolocation/pull/633
    stopOnTerminate: false, // enable this to clear background location settings when the app terminates
    startForeground: true, // higher priority for location service, decreasing probability of OS killing it (Android)
    notificationTitle: this.translateService.instant(
      'notification.backgroundGeolocationTitle'
    ),
    notificationText: this.translateService.instant(
      'notification.backgroundGeolocationText'
    ),
  }
  private locationUpdateSubscription: Subscription
  private startEventSubscription: Subscription
  private stopEventSubscription: Subscription
  private nextLocationIsStart = false

  private trackingStatus: LocationTrackingStatus = 'isStopped'
  trackingStatusChange: BehaviorSubject<LocationTrackingStatus> =
    new BehaviorSubject<LocationTrackingStatus>('isStopped')
  notificationsEnabled: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(
    false
  )

  constructor(
    private platform: Platform,
    private backgroundGeolocation: BackgroundGeolocation,
    private dbService: SqliteService,
    private inferenceService: InferenceService,
    private notificationService: NotificationService,
    private translateService: TranslateService,
    private alertController: AlertController
  ) {
    if (!this.isSupportedPlatform) return

    this.backgroundGeolocation.configure(this.config).then(() => {
      this.backgroundGeolocation.checkStatus().then(({ isRunning }) => {
        if (isRunning) this.nextLocationIsStart = true
      })

      this.subscribeToLocationUpdates()
      this.subscribeToStartStopEvents()
      this.updateRunningState()
    })

    App.addListener('appStateChange', (state) => {
      if (state.isActive) {
        this.updateRunningState()
      }
    })
  }

  ngOnDestroy() {
    if (this.locationUpdateSubscription) {
      this.locationUpdateSubscription.unsubscribe()
    }
    if (this.startEventSubscription) {
      this.startEventSubscription.unsubscribe()
    }
    if (this.stopEventSubscription) {
      this.stopEventSubscription.unsubscribe()
    }
  }

  enableNotifications(enabled: boolean) {
    this.notificationsEnabled.next(enabled)
  }

  start() {
    if (!this.isSupportedPlatform) return
    this.backgroundGeolocation.checkStatus().then(async (status) => {
      if (status.isRunning) {
        this.stop()
        return false
      }
      if (!status.locationServicesEnabled) {
        await this.showEnableLocationsAlert()
        return false
      }

      if (
        status.authorization ===
          BackgroundGeolocationAuthorizationStatus.AUTHORIZED ||
        (status.authorization as number) === 99
      ) {
        this.backgroundGeolocation.start()
        this.nextLocationIsStart = true
        await this.notificationService.removeScheduledUnpauseNotifications()
      } else {
        await this.showGrantPermissionAlert()
      }
    })
  }

  stop() {
    if (!this.isSupportedPlatform) return

    this.backgroundGeolocation.checkStatus().then((status) => {
      if (status.isRunning) {
        this.backgroundGeolocation.stop()
        this.nextLocationIsStart = false
      }
    })
  }

  pause() {
    if (!this.isSupportedPlatform) return
    this.backgroundGeolocation.checkStatus().then((status) => {
      if (status.isRunning) {
        this.trackingStatus = 'isPaused'
        this.backgroundGeolocation.stop().then(() => {
          this.nextLocationIsStart = false
          this.updateRunningState()
        })
      }
      const turnBackOnAt = new Date()
      turnBackOnAt.setSeconds(turnBackOnAt.getSeconds() + 20)
      this.sendNotification(
        'Tracking paused',
        'Tracking will resume at' + turnBackOnAt.toLocaleDateString()
      )
      this.sendRestartNotificationAtTime(turnBackOnAt)
    })
  }

  openLocationSettings() {
    this.backgroundGeolocation.showAppSettings()
  }

  get isSupportedPlatform(): boolean {
    return this.platform.is('ios') || this.platform.is('android')
  }

  private updateRunningState() {
    this.backgroundGeolocation.checkStatus().then(({ isRunning }) => {
      if (isRunning) {
        this.trackingStatus = 'isRunning'
        this.trackingStatusChange.next('isRunning')
      } else {
        if (this.trackingStatus === 'isPaused') {
          this.trackingStatusChange.next('isPaused')
        } else {
          this.trackingStatus = 'isStopped'
          this.trackingStatusChange.next('isStopped')
        }
      }
    })
  }

  private subscribeToLocationUpdates() {
    this.locationUpdateSubscription = this.backgroundGeolocation
      .on(BackgroundGeolocationEvents.location)
      .subscribe(async ({ latitude, longitude, accuracy, speed, time }) => {
        const state = this.nextLocationIsStart ? PointState.START : null
        await this.dbService.upsertPoint(Trajectory.trackingTrajectoryID, {
          latLng: [latitude, longitude],
          time: new Date(time),
          accuracy,
          speed,
          state,
        })
        this.nextLocationIsStart = false

        await this.inferenceService.triggerBackgroundFunctionIfViable()

        this.sendNotification(
          this.translateService.instant('notification.locationUpdateTitle'),
          this.translateService.instant('notification.locationUpdateText', {
            latitude: latitude.toFixed(4),
            longitude: longitude.toFixed(4),
            accuracy: accuracy.toFixed(1),
          })
        )

        this.backgroundGeolocation.finish()
      })
  }

  private subscribeToStartStopEvents() {
    this.startEventSubscription = this.backgroundGeolocation
      .on(BackgroundGeolocationEvents.start)
      .subscribe(async () => {
        try {
          await this.dbService.upsertTrajectory(
            new Trajectory({
              id: Trajectory.trackingTrajectoryID,
              type: TrajectoryType.USERTRACK,
              placename: 'Your Trajectory',
            })
          )
        } catch (err) {
          console.error(err)
        }
        this.trackingStatus = 'isRunning'
        this.trackingStatusChange.next('isRunning')
        this.nextLocationIsStart = true
        this.sendNotification(
          this.translateService.instant('notification.locationUpdateTitle'),
          this.translateService.instant('notification.trackingStarted')
        )
      })

    this.stopEventSubscription = this.backgroundGeolocation
      .on(BackgroundGeolocationEvents.stop)
      .subscribe(() => {
        if (this.trackingStatus === 'isPaused') {
          this.trackingStatusChange.next('isPaused')
          this.nextLocationIsStart = false
          // TODO add time of pausing to notification
          this.sendNotification(
            this.translateService.instant('notification.locationUpdateTitle'),
            this.translateService.instant('notification.trackingPaused')
          )
        } else {
          this.trackingStatus = 'isStopped'
          this.trackingStatusChange.next('isStopped')
          this.nextLocationIsStart = false
          this.sendNotification(
            this.translateService.instant('notification.locationUpdateTitle'),
            this.translateService.instant('notification.trackingStopped')
          )
        }
      })
  }

  private sendNotification(title: string, text: string) {
    if (this.notificationsEnabled.value === false) return
    this.notificationService.notify(
      NotificationType.locationUpdate,
      title,
      text
    )
  }

  private sendRestartNotificationAtTime(turnBackOnAt: Date) {
    this.notificationService.notifyAtTime(
      NotificationType.unpauseTrackingNotification,
      this.translateService.instant('notification.trackingUnpausedTitle'),
      this.translateService.instant('notification.trackingUnpausedText'),
      turnBackOnAt
    )
  }

  private async showGrantPermissionAlert() {
    await this.showAppSettingsAlert(
      this.translateService.instant('confirm.grantLocationPermissionSettings')
    )
  }

  private async showEnableLocationsAlert() {
    await this.showAppSettingsAlert(
      this.translateService.instant('confirm.showLocationServiceSettings')
    )
  }

  private async showAppSettingsAlert(message: string) {
    const alert = await this.alertController.create({
      message,
      buttons: [
        {
          text: this.translateService.instant('confirm.appSettingsButtonText'),
          cssClass: 'primary',
          handler: () => {
            this.backgroundGeolocation.showAppSettings()
          },
        },
        {
          text: this.translateService.instant('general.cancel'),
          role: 'cancel',
          cssClass: 'secondary',
          handler: () => {
            alert.dismiss()
          },
        },
      ],
    })

    await alert.present()
  }
}
